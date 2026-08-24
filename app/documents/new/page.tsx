import Link from "next/link";
import { redirect } from "next/navigation";
import {
  applicationObjectiveKindLabel,
  applicationObjectiveKindList,
  gradeDocumentTypes,
  isApplicationObjectiveKind,
  type ApplicationObjectiveKind,
  type DocumentCompatibility,
} from "@/applications";
import { authSessionConfiguration } from "@/auth/auth";
import { getSession } from "@/auth/session";
import { createDocumentAction } from "@/documents/actions";
import {
  documentTypeDescription,
  documentTypeLabel,
  documentTypePageBudget,
  isAvailableDocumentType,
  type DocumentPageBudget,
  type ShippingDocumentTypeKey,
} from "@/documents/catalogue";
import { composeDocument, isComposedDocumentEmpty } from "@/documents/composition";
import { DocumentMiniature } from "@/documents/components/document-miniature";
import { DocumentPreview } from "@/documents/components/document-preview";
import {
  compatibleTemplates,
  defaultTemplateFor,
  isDocumentTemplateId,
  resolveTemplate,
  type DocumentTemplateId,
} from "@/documents/presentation";
import { getDossierSnapshot } from "@/profile/repository";
import type { DossierSnapshot } from "@/profile/dossier";
import { Container } from "@/ui";
import styles from "@/styles/pages/document-create.module.css";
import shell from "@/styles/pages/documents.module.css";

/**
 * Creating a document, in the order the decisions actually happen.
 *
 * ## Why three steps rather than one list
 *
 * The screen this replaced asked one question — "which document?" — which is the question
 * the user came here unable to answer. Someone applying for a scholarship does not want to
 * choose between a CV and a résumé; they want to apply for a scholarship, and which
 * documents that calls for is a convention the product is supposed to know.
 *
 * So the flow asks what they are doing, answers with the documents that pursuit
 * conventionally calls for, and only then asks how it should look:
 *
 *   purpose → document → presentation
 *
 * Each answer narrows the next question, which is the difference between a flow and a form.
 *
 * ## The three layers stay separate
 *
 * The objective (why), the document type (what) and the template (how it looks) are three
 * different decisions owned by three different modules — `@/applications`,
 * `@/documents/catalogue` and `@/documents/presentation` — and this page composes them
 * rather than restating any of them. It contains no list of documents, no table of which
 * document suits which pursuit and no template metrics; every one of those comes from the
 * module that owns it, so this screen cannot drift from what the engine will produce.
 *
 * Nothing about *how* a template achieves its look is surfaced. The user chooses between
 * "Classic" and "Compact" by looking at their own document in each; margins, point sizes,
 * line heights and custom properties are the renderer's business and stay there.
 *
 * ## Why the step lives in the URL
 *
 * Each step is a link, so the whole flow works with no client JavaScript, the browser's
 * back button does what it looks like it does, and a half-finished choice can be reloaded
 * or shared as a link rather than lost. It also means the template step can show the
 * user's document *in* the chosen template — a server render of the real preview — instead
 * of a picture of a document that will go stale.
 *
 * Only closed vocabularies travel in the query string: an objective kind, a document type,
 * a template id, each validated here against the module that defines it. The particulars of
 * an application (the role, the organisation) are deliberately *not* collected yet — they
 * would put a user's job search in their browser history and in server logs to serve a
 * writing layer that does not read them yet. `createDocumentAction` already accepts them
 * for the block that will.
 */

type NewDocumentPageProps = {
  searchParams: Promise<{
    objective?: string;
    type?: string;
    template?: string;
    error?: string;
  }>;
};

/**
 * Mapped from a fixed set rather than echoed from the query string, which is
 * attacker-controlled — rendering it would make this page a way to put arbitrary text on a
 * signed-in user's screen. Each message also says what happened to their work.
 */
const errorMessages: Record<string, string> = {
  "unsupported-type": "That document isn't one we can produce yet. Please choose another.",
  "create-failed":
    "We couldn't create the document just now. Your dossier hasn't been changed — please try again.",
};

export default async function NewDocumentPage({ searchParams }: NewDocumentPageProps) {
  if (!authSessionConfiguration) {
    redirect("/auth/sign-in?callbackUrl=%2Fdocuments%2Fnew&error=Configuration");
  }
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/sign-in?callbackUrl=%2Fdocuments%2Fnew&error=SessionRequired");
  }

  const query = await searchParams;

  /*
   * Everything in the query string is validated against the module that owns the
   * vocabulary, and an unrecognised value is treated as *unanswered* rather than as an
   * error. A stale or hand-edited link then drops the user back to the step that question
   * belongs to, which is recoverable, instead of showing them a failure for a question
   * they have not been asked yet.
   */
  const objective = isApplicationObjectiveKind(query.objective) ? query.objective : null;
  const type =
    objective !== null && isAvailableDocumentType(query.type) ? query.type : null;

  const step = type !== null ? 3 : objective !== null ? 2 : 1;
  const error = query.error ? errorMessages[query.error] : null;

  return (
    <div className={shell.page}>
      <Container>
        <header className={styles.header}>
          <p className={shell.eyebrow}>Create from your dossier</p>
          <h1>{headings[step]}</h1>
          <p className={shell.lead}>{leads[step]}</p>
        </header>

        <StepTrail objective={objective} step={step} type={type} />

        {error ? (
          <p className={shell.errorStatus} role="alert">
            {error}
          </p>
        ) : null}

        {step === 1 ? <PurposeStep /> : null}
        {step === 2 && objective ? <DocumentStep objective={objective} /> : null}
        {step === 3 && objective && type ? (
          <PresentationStep
            objective={objective}
            requestedTemplate={query.template}
            type={type}
            userId={session.user.id}
          />
        ) : null}
      </Container>
    </div>
  );
}

const headings: Record<number, string> = {
  1: "What are you trying to achieve?",
  2: "Which document do you need?",
  3: "Choose how it should look.",
};

const leads: Record<number, string> = {
  1: "The purpose decides which documents make sense — and how they should read. Pick the one closest to what you are doing.",
  2: "These are the documents that purpose usually calls for. Every fact in them comes from your dossier.",
  3: "The same information, presented three ways. This is your document, not a sample. You can change the look at any time afterwards.",
};

/* ---------------------------------------------------------------------------
   The trail
--------------------------------------------------------------------------- */

/**
 * Where the user is, and the way back.
 *
 * A completed step is a link — going back to change an earlier answer is a normal thing to
 * want and must not require the browser's back button. The current step is marked with
 * `aria-current`, and the numbers are drawn by CSS counters rather than written into the
 * markup, so a screen reader hears the step names rather than "1 2 3".
 */
function StepTrail({
  step,
  objective,
  type,
}: {
  step: number;
  objective: ApplicationObjectiveKind | null;
  type: ShippingDocumentTypeKey | null;
}) {
  const trail = [
    {
      label: "Purpose",
      value: objective ? applicationObjectiveKindLabel(objective) : null,
      href: "/documents/new",
    },
    {
      label: "Document",
      value: type ? documentTypeLabel(type) : null,
      href: objective ? `/documents/new?objective=${objective}` : null,
    },
    { label: "Presentation", value: null, href: null },
  ];

  return (
    <nav aria-label="Steps" className={styles.trail}>
      <ol className={styles.trailList}>
        {trail.map((item, index) => {
          const position = index + 1;
          const isCurrent = position === step;
          const returnHref = position < step ? item.href : null;

          return (
            <li
              aria-current={isCurrent ? "step" : undefined}
              className={[
                styles.trailStep,
                isCurrent ? styles.trailStepCurrent : "",
                position < step ? styles.trailStepDone : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={item.label}
            >
              {returnHref ? (
                <Link className={styles.trailLink} href={returnHref}>
                  <span className={styles.trailLabel}>{item.label}</span>
                  <span className={styles.trailValue}>{item.value}</span>
                </Link>
              ) : (
                <span className={styles.trailStatic}>
                  <span className={styles.trailLabel}>{item.label}</span>
                  {item.value ? <span className={styles.trailValue}>{item.value}</span> : null}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ---------------------------------------------------------------------------
   Step 1 — purpose
--------------------------------------------------------------------------- */

/**
 * The objective kinds, straight from `@/applications`.
 *
 * Read from the registry rather than listed here, so the day an objective is added it
 * appears without this screen being touched — and so the words the user reads are the same
 * words the matching engine reasons about.
 */
function PurposeStep() {
  return (
    <>
      <ul className={styles.optionGrid}>
        {applicationObjectiveKindList.map((kind) => (
          <li className={styles.option} key={kind.key}>
            <Link className={styles.optionLink} href={`/documents/new?objective=${kind.key}`}>
              {kind.label}
            </Link>
            <p className={styles.optionNote}>{kind.description}</p>
          </li>
        ))}
      </ul>

      <div className={styles.stepFooter}>
        <Link className={shell.backLink} href="/documents">
          Back to documents
        </Link>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------
   Step 2 — document
--------------------------------------------------------------------------- */

/**
 * What this pursuit calls for, graded rather than filtered.
 *
 * `gradeDocumentTypes` returns every document in the catalogue against this objective, so
 * this screen can do three honest things at once: lead with what the application
 * conventionally wants, offer the other documents that suit it without comment, and say
 * plainly which of the conventional documents the engine cannot produce yet.
 *
 * Nothing is refused. A résumé for a research post is unusual, not wrong, and the user may
 * know something we do not — so unconventional choices are kept, one disclosure away, with
 * a note instead of a block.
 */
function DocumentStep({ objective }: { objective: ApplicationObjectiveKind }) {
  const graded = gradeDocumentTypes(objective);
  const available = graded.filter((entry) => entry.available);

  const recommended = available.filter((entry) => entry.level === "recommended");
  const alsoSuitable = available.filter((entry) => entry.level === "permitted");
  const unusual = available.filter((entry) => entry.level === "unconventional");
  /* Conventional for this pursuit, and not yet producible. Said out loud, not hidden. */
  const notYet = graded.filter((entry) => !entry.available && entry.level === "recommended");

  return (
    <>
      {recommended.length > 0 ? (
        <section className={styles.group}>
          <h2 className={styles.groupHeading}>Recommended for this</h2>
          <DocumentOptions entries={recommended} objective={objective} recommended />
        </section>
      ) : null}

      {alsoSuitable.length > 0 ? (
        <section className={styles.group}>
          <h2 className={styles.groupHeading}>
            {recommended.length > 0 ? "Also suitable" : "Suitable for this"}
          </h2>
          <DocumentOptions entries={alsoSuitable} objective={objective} />
        </section>
      ) : null}

      {notYet.length > 0 ? (
        <p className={styles.note}>
          An application like this often includes {listOf(notYet.map((e) => documentTypeLabel(e.type).toLowerCase()))} as
          well. We don't produce {notYet.length > 1 ? "those" : "that"} yet — when we do, you'll
          be able to add {notYet.length > 1 ? "them" : "it"} from here, built from the same
          dossier.
        </p>
      ) : null}

      {unusual.length > 0 ? (
        <details className={styles.more}>
          <summary className={styles.moreSummary}>Other documents</summary>
          <p className={styles.moreNote}>
            Not what this purpose usually calls for. If you've been asked for one, it is yours
            to choose.
          </p>
          <DocumentOptions entries={unusual} objective={objective} />
        </details>
      ) : null}

      <div className={styles.stepFooter}>
        <Link className={shell.backLink} href="/documents/new">
          Choose a different purpose
        </Link>
      </div>
    </>
  );
}

function DocumentOptions({
  entries,
  objective,
  recommended = false,
}: {
  entries: readonly DocumentCompatibility[];
  objective: ApplicationObjectiveKind;
  recommended?: boolean;
}) {
  return (
    <ul className={styles.optionGrid}>
      {entries.map((entry) => (
        <li className={styles.option} key={entry.type}>
          <Link
            className={styles.optionLink}
            href={`/documents/new?objective=${objective}&type=${entry.type}`}
          >
            {documentTypeLabel(entry.type)}
          </Link>
          {recommended ? <span className={styles.badge}>Usual choice</span> : null}
          <p className={styles.optionNote}>{documentTypeDescription(entry.type)}</p>
          <p className={styles.optionMeta}>{describeLength(documentTypePageBudget(entry.type))}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * How long this kind of document usually runs.
 *
 * A property of the document type, in the reader's terms — "typically 1–2 pages" is a real
 * editorial convention a person choosing a document wants to know. It is not a setting, and
 * there is nothing here about how the renderer achieves it.
 */
function describeLength(budget: DocumentPageBudget): string {
  if (budget === null) return "Length follows your history";
  if (budget.target === budget.max) {
    return `Typically ${budget.target} page${budget.target === 1 ? "" : "s"}`;
  }

  return `Typically ${budget.target}–${budget.max} pages`;
}

function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/* ---------------------------------------------------------------------------
   Step 3 — presentation
--------------------------------------------------------------------------- */

/**
 * The template choice, made against the user's own document.
 *
 * Every template compatible with this document type is rendered as a real page of the
 * user's real content, from the same composition and the same preview component the
 * workspace and the PDF will use. Choosing one is a link, so the full-size preview below
 * changes to the chosen template — comparison by miniature, confirmation at full size.
 *
 * The dossier is read once and composed once: composition depends on the document type and
 * the dossier, never on the template, which is exactly why one composed document can be
 * shown in three presentations. If that read fails the step still works — the user can
 * choose and create — because a preview is a help, not a precondition.
 */
async function PresentationStep({
  objective,
  requestedTemplate,
  type,
  userId,
}: {
  objective: ApplicationObjectiveKind;
  requestedTemplate: string | undefined;
  type: ShippingDocumentTypeKey;
  userId: string;
}) {
  const templates = compatibleTemplates(type);
  const selectedId: DocumentTemplateId =
    isDocumentTemplateId(requestedTemplate) &&
    templates.some((template) => template.id === requestedTemplate)
      ? requestedTemplate
      : defaultTemplateFor(type);
  const selected = resolveTemplate(selectedId, type);

  let snapshot: DossierSnapshot | null = null;
  let readFailed = false;
  try {
    snapshot = await getDossierSnapshot(userId);
  } catch (error) {
    console.error("[documents] Failed to load dossier for the create preview", error);
    readFailed = true;
  }

  const composed = snapshot ? composeDocument(type, snapshot) : null;
  const hasContent = composed !== null && !isComposedDocumentEmpty(composed);

  return (
    <>
      <ul className={styles.templateGrid}>
        {templates.map((template) => {
          const isSelected = template.id === selectedId;

          return (
            <li
              className={[styles.template, isSelected ? styles.templateSelected : ""]
                .filter(Boolean)
                .join(" ")}
              key={template.id}
            >
              {composed && hasContent ? (
                <DocumentMiniature document={composed} template={template} />
              ) : (
                <div aria-hidden="true" className={styles.templatePlaceholder} inert />
              )}

              <div className={styles.templateBody}>
                <Link
                  aria-current={isSelected ? "true" : undefined}
                  className={styles.templateLink}
                  href={`/documents/new?objective=${objective}&type=${type}&template=${template.id}`}
                >
                  {template.label}
                </Link>
                {isSelected ? <span className={styles.badge}>Chosen</span> : null}
                <p className={styles.optionNote}>{template.description}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {readFailed ? (
        <p className={shell.errorStatus} role="alert">
          We couldn't load your dossier to show a preview just now. You can still create the
          document — nothing has been changed.
        </p>
      ) : null}

      {!readFailed && !hasContent ? (
        <div className={styles.emptyNotice}>
          <h2>There is nothing in your dossier to show yet.</h2>
          <p>
            A document is composed entirely from what you have recorded. Add your name,
            contact details and one section, and it will appear here. You can create this
            document now and fill it in afterwards.
          </p>
          <Link className={shell.backLink} href="/profile">
            Go to your dossier
          </Link>
        </div>
      ) : null}

      <form action={createDocumentAction} className={styles.createForm}>
        <input name="objective" type="hidden" value={objective} />
        <input name="type" type="hidden" value={type} />
        <input name="template" type="hidden" value={selectedId} />

        <button className={shell.primaryButton} type="submit">
          Create this document
        </button>
        <p className={styles.createNote}>
          Saved as a draft you can rename, rearrange and export. Your dossier stays as it is.
        </p>
      </form>

      {composed && hasContent ? (
        <section className={styles.fullPreview}>
          <h2 className={styles.fullPreviewHeading}>
            {documentTypeLabel(type)} · {selected.label}
          </h2>
          <DocumentPreview document={composed} template={selected} />
        </section>
      ) : null}

      <div className={styles.stepFooter}>
        <Link className={shell.backLink} href={`/documents/new?objective=${objective}`}>
          Choose a different document
        </Link>
      </div>
    </>
  );
}
