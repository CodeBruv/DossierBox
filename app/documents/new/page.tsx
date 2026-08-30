import Link from "next/link";
import { redirect } from "next/navigation";
import {
  applicationObjectiveKindLabel,
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
import { DocumentComposer } from "@/documents/components/document-composer";
import { getDossierSnapshot } from "@/profile/repository";
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
  const type = isAvailableDocumentType(query.type) ? query.type : null;

  const step = type !== null ? 2 : 1;
  const error = query.error ? errorMessages[query.error] : null;
  const snapshot = step === 2 && type ? await getDossierSnapshot(session.user.id) : null;

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

        {step === 1 ? <DocumentStep objective={objective} /> : null}
        {step === 2 && type ? (
          snapshot ? (
            <DocumentComposer
              createAction={createDocumentAction}
              objective={objective}
              snapshot={snapshot}
              type={type}
            />
          ) : (
            <p className={shell.errorStatus} role="alert">
              We couldn't load your dossier to compose this document. Your dossier hasn't been
              changed — please try again.
            </p>
          )
        ) : null}
      </Container>
    </div>
  );
}

const headings: Record<number, string> = {
  1: "Which document do you need?",
  2: "Compose your document",
};

const leads: Record<number, string> = {
  1: "Choose a document type, then shape it around the live preview. Purpose is optional and can be added while composing.",
  2: "Start with the document itself. Choose a style, arrange its sections, and create only when the preview looks right.",
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
      label: "Document",
      value: type ? documentTypeLabel(type) : null,
      href: "/documents/new",
    },
    { label: "Compose", value: objective ? applicationObjectiveKindLabel(objective) : "Optional purpose", href: null },
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
   Step 1 — document type
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
function DocumentStep({ objective }: { objective: ApplicationObjectiveKind | null }) {
  const graded = objective ? gradeDocumentTypes(objective) : [];
  const available: readonly DocumentOption[] = objective
    ? graded.filter((entry) => entry.available)
    : [
        "professional_cv",
        "professional_resume",
        "academic_cv",
      ].map((type) => ({
        type: type as ShippingDocumentTypeKey,
        level: "permitted" as const,
        available: true,
      }));

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

type DocumentOption = Pick<DocumentCompatibility, "type" | "level" | "available">;

function DocumentOptions({
  entries,
  objective,
  recommended = false,
}: {
  entries: readonly DocumentOption[];
  objective: ApplicationObjectiveKind | null;
  recommended?: boolean;
}) {
  return (
    <ul className={styles.optionGrid}>
      {entries.map((entry) => (
        <li className={styles.option} key={entry.type}>
          <Link
            className={styles.optionLink}
            href={`/documents/new?${objective ? `objective=${objective}&` : ""}type=${entry.type}`}
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

