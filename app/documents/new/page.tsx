import Link from "next/link";
import { redirect } from "next/navigation";
import {
  applicationObjectiveKindLabel,
  documentSetFor,
  gradeDocumentTypes,
  type ApplicationObjectiveKind,
  type DocumentCompatibility,
} from "@/applications";
import { packageHasConfirmedEvidenceBoundary } from "@/applications/evidence-selection-repository";
import { getOwnedApplicationWithDocuments } from "@/applications/repository";
import { getOwnedApplicationPlan } from "@/applications/plans-repository";
import { getOwnedApplicationPackage } from "@/applications/packages-repository";
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

type NewDocumentPageProps = {
  searchParams: Promise<{ applicationId?: string; type?: string; error?: string; planId?: string; packageId?: string; status?: string }>;
};

const errorMessages: Record<string, string> = {
  "unsupported-type": "That document isn't one we can produce yet. Please choose another.",
  "create-failed": "We couldn't create the document just now. Your saved Application and dossier haven't been changed — please try again.",
};

export default async function NewDocumentPage({ searchParams }: NewDocumentPageProps) {
  if (!authSessionConfiguration) redirect("/auth/sign-in?callbackUrl=%2Fapplications%2Fnew&error=Configuration");
  const session = await getSession();
  if (!session?.user?.id) redirect("/auth/sign-in?callbackUrl=%2Fapplications%2Fnew&error=SessionRequired");

  const query = await searchParams;
  if (!query.applicationId) redirect("/applications/new");
  if (query.planId && query.packageId) redirect(`/applications/${encodeURIComponent(query.applicationId)}/specification?planId=${encodeURIComponent(query.planId)}&packageId=${encodeURIComponent(query.packageId)}`);
  const application = await getOwnedApplicationWithDocuments(session.user.id, query.applicationId);
  if (!application?.intent) redirect("/applications/new?error=application-required");
  if (query.planId || query.packageId) {
    if (!query.planId || !query.packageId) redirect(`/applications/${encodeURIComponent(application.id)}/recommendation?error=stale`);
    const [plan, applicationPackage] = await Promise.all([
      getOwnedApplicationPlan(session.user.id, query.planId),
      getOwnedApplicationPackage(session.user.id, query.packageId),
    ]);
    if (
      !plan
      || !applicationPackage
      || plan.applicationId !== application.id
      || applicationPackage.planId !== plan.id
      || plan.status !== "confirmed"
      || plan.confirmation !== "confirmed"
      || applicationPackage.status !== "confirmed"
      || applicationPackage.confirmation !== "confirmed"
    ) redirect(`/applications/${encodeURIComponent(application.id)}/recommendation?error=stale`);
    if (!(await packageHasConfirmedEvidenceBoundary(session.user.id, application.id, applicationPackage.id))) {
      redirect(`/applications/${encodeURIComponent(application.id)}/evidence?planId=${encodeURIComponent(plan.id)}&packageId=${encodeURIComponent(applicationPackage.id)}&error=confirmation-required`);
    }
  }

  const kind = application.intent.kind as ApplicationObjectiveKind;
  const type = isAvailableDocumentType(query.type) ? query.type : null;
  const step = type ? 2 : 1;
  const error = query.error ? errorMessages[query.error] : null;
  const snapshot = type ? await getDossierSnapshot(session.user.id) : null;

  return (
    <div className={shell.page}>
      <Container>
        <header className={styles.header}>
          <p className={shell.eyebrow}>Saved application</p>
          <h1>{type ? "Compose your document" : "Choose your document"}</h1>
          <p className={shell.lead}>
            {type
              ? "Choose a style, arrange the sections, and create only when the preview looks right."
              : "Review the purpose-informed recommendation for this saved Application, or choose another valid document type."}
          </p>
        </header>

        <ApplicationContextSummary application={application} kind={kind} />
        <StepTrail applicationId={application.id} step={step} type={type} />
        {error ? <p className={shell.errorStatus} role="alert">{error}</p> : null}
        {query.status === "evidence-confirmed" ? <p className={styles.reviewStatus} role="status">Evidence selection confirmed. Continue to the Document Specification review before any document is created.</p> : null}

        {step === 1 ? <DocumentStep applicationId={application.id} objective={kind} /> : null}
        {type ? (
          snapshot ? (
            <DocumentComposer applicationId={application.id} createAction={createDocumentAction} snapshot={snapshot} type={type} />
          ) : <p className={shell.errorStatus} role="alert">We couldn't load your dossier to compose this document. Your saved Application and dossier haven't been changed.</p>
        ) : null}
      </Container>
    </div>
  );
}

function ApplicationContextSummary({ application, kind }: { application: NonNullable<Awaited<ReturnType<typeof getOwnedApplicationWithDocuments>>>; kind: ApplicationObjectiveKind }) {
  const intent = application.intent!;
  const details = [intent.targetRole, intent.programme, intent.organisation, intent.institution, intent.field].filter(Boolean);
  return (
    <section className={styles.applicationContext} aria-labelledby="saved-application-heading">
      <div>
        <p className={styles.groupHeading}>Application context</p>
        <h2 id="saved-application-heading">{applicationObjectiveKindLabel(kind)}</h2>
        {details.length ? <p>{details.join(" · ")}</p> : null}
      </div>
      <Link className={styles.explicitPathLink} href="/applications/new">Create another application</Link>
    </section>
  );
}

function StepTrail({ applicationId, step, type }: { applicationId: string; step: number; type: ShippingDocumentTypeKey | null }) {
  return (
    <nav aria-label="Document steps" className={styles.trail}>
      <ol className={styles.trailList}>
        <li className={`${styles.trailStep} ${styles.trailStepDone}`}><Link className={styles.trailLink} href={`/applications/${encodeURIComponent(applicationId)}/recommendation`}><span className={styles.trailLabel}>Recommendation</span><span className={styles.trailValue}>Review</span></Link></li>
        <li className={`${styles.trailStep} ${step === 1 ? styles.trailStepCurrent : styles.trailStepDone}`} aria-current={step === 1 ? "step" : undefined}>
          {step > 1 ? <Link className={styles.trailLink} href={`/documents/new?applicationId=${applicationId}`}><span className={styles.trailLabel}>Document</span><span className={styles.trailValue}>{type ? documentTypeLabel(type) : null}</span></Link> : <span className={styles.trailStatic}><span className={styles.trailLabel}>Document</span></span>}
        </li>
        <li className={`${styles.trailStep} ${step === 2 ? styles.trailStepCurrent : ""}`} aria-current={step === 2 ? "step" : undefined}><span className={styles.trailStatic}><span className={styles.trailLabel}>Compose</span></span></li>
      </ol>
    </nav>
  );
}

function DocumentStep({ applicationId, objective }: { applicationId: string; objective: ApplicationObjectiveKind }) {
  const graded = gradeDocumentTypes(objective);
  const recommendedPackage = documentSetFor(objective);
  const available = graded.filter((entry) => entry.available) as readonly DocumentOption[];
  const recommended = available.filter((entry) => entry.level === "recommended");
  const alsoSuitable = available.filter((entry) => entry.level === "permitted");
  const unusual = available.filter((entry) => entry.level === "unconventional");
  const notYet = graded.filter((entry) => !entry.available && entry.level === "recommended");

  return (
    <>
      <section aria-labelledby="recommended-package-heading" className={styles.packageSummary}>
        <p className={styles.groupHeading}>Based on this purpose</p>
        <h2 id="recommended-package-heading">Recommended application package</h2>
        <ol className={styles.packageMembers}>{recommendedPackage.members.map((member) => <li key={member.type}><span>{member.label}</span><small>{member.role === "primary" ? "Primary document" : "Supporting document"} · {member.available ? "Available now" : "Not available yet"}</small></li>)}</ol>
        <p className={styles.packageNote}>This is the existing deterministic recommendation, not a package created or confirmed on your behalf.</p>
      </section>
      {recommended.length ? <section className={styles.group}><h2 className={styles.groupHeading}>Recommended for this</h2><DocumentOptions applicationId={applicationId} entries={recommended} recommended /></section> : null}
      {alsoSuitable.length ? <section className={styles.group}><h2 className={styles.groupHeading}>Also suitable</h2><DocumentOptions applicationId={applicationId} entries={alsoSuitable} /></section> : null}
      {notYet.length ? <p className={styles.note}>This application often includes {listOf(notYet.map((entry) => documentTypeLabel(entry.type).toLowerCase()))}. We don't produce {notYet.length > 1 ? "those" : "that"} yet.</p> : null}
      {unusual.length ? <details className={styles.more}><summary className={styles.moreSummary}>Other documents</summary><p className={styles.moreNote}>Not what this purpose usually calls for. If you've been asked for one, it is yours to choose.</p><DocumentOptions applicationId={applicationId} entries={unusual} /></details> : null}
    </>
  );
}

type DocumentOption = Pick<DocumentCompatibility, "type" | "level" | "available">;
function DocumentOptions({ applicationId, entries, recommended = false }: { applicationId: string; entries: readonly DocumentOption[]; recommended?: boolean }) {
  return <ul className={styles.optionGrid}>{entries.map((entry) => <li className={styles.option} key={entry.type}><Link className={styles.optionLink} href={`/documents/new?applicationId=${applicationId}&type=${entry.type}`}>{documentTypeLabel(entry.type)}</Link>{recommended ? <span className={styles.badge}>Usual choice</span> : null}<p className={styles.optionNote}>{documentTypeDescription(entry.type)}</p><p className={styles.optionMeta}>{describeLength(documentTypePageBudget(entry.type))}</p></li>)}</ul>;
}

function describeLength(budget: DocumentPageBudget): string {
  if (budget === null) return "Length follows your history";
  return budget.target === budget.max ? `Typically ${budget.target} page${budget.target === 1 ? "" : "s"}` : `Typically ${budget.target}–${budget.max} pages`;
}
function listOf(items: readonly string[]): string { return items.length <= 1 ? items[0] ?? "" : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`; }
