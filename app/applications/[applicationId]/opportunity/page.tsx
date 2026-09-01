import Link from "next/link";
import { notFound } from "next/navigation";
import {
  applicationObjectiveKindLabel,
  isApplicationObjectiveKind,
} from "@/applications";
import {
  interpretOpportunityAction,
  saveOpportunityCaptureAction,
} from "@/applications/actions";
import {
  getApplicationOpportunityCapture,
  opportunityCaptureLimits,
} from "@/applications/opportunity-repository";
import { getOwnedApplicationWithIntent } from "@/applications/repository";
import { requireProfileUser } from "@/profile/authorization";
import { Container } from "@/ui";
import styles from "@/styles/pages/document-create.module.css";
import shell from "@/styles/pages/documents.module.css";
import settings from "@/styles/ui/document-settings.module.css";

type OpportunityCapturePageProps = {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<{ error?: string; review?: string }>;
};

const errorMessages: Record<string, string> = {
  "source-invalid": `Add instructions or opportunity text using ${opportunityCaptureLimits.pastedText.toLocaleString()} characters or fewer.`,
  "save-failed": "We couldn't save these instructions just now. Your Dossier hasn't been changed — please try again.",
};

const reviewMessages: Record<string, string> = {
  paid_plan_required: "Opportunity review is available on Starter and Pro plans.",
  quota_exhausted: "Your opportunity reviews for this month have been used.",
  insufficient_iu: "There are not enough Intelligence Units available for this review.",
  provider_unavailable: "Opportunity review is temporarily unavailable. Your saved source has not changed.",
  provider_failed: "The review could not be completed. No review was charged.",
  malformed_output: "The review response could not be safely read. No review was charged.",
  validation_failed: "The review could not be traced safely to your source. No review was charged.",
  source_not_found: "The saved source could not be found.",
  source_empty: "Add source text before requesting a review.",
  source_unavailable: "This source is not ready to review.",
  stale_source: "The source changed during review. Start a new review from the saved text.",
  in_progress: "This opportunity review is already in progress.",
  retry_available: "The review stopped before completion. You can retry without a completed-review charge.",
  interpreted: "Opportunity review completed. Check the advisory details below.",
  already_interpreted: "This saved source has already been reviewed.",
};

export default async function OpportunityCapturePage({
  params,
  searchParams,
}: OpportunityCapturePageProps) {
  const { applicationId } = await params;
  const user = await requireProfileUser();
  const [application, capture, query] = await Promise.all([
    getOwnedApplicationWithIntent(user.id, applicationId),
    getApplicationOpportunityCapture(user.id, applicationId),
    searchParams,
  ]);

  if (!application?.intent) notFound();

  const kind = isApplicationObjectiveKind(application.intent.kind)
    ? application.intent.kind
    : null;
  const context = describeApplicationContext(application.intent);
  const error = query.error ? errorMessages[query.error] : null;
  const reviewMessage = query.review ? reviewMessages[query.review] : null;
  const interpretation = interpretationView(capture?.opportunity.interpretation);

  return (
    <div className={shell.page}>
      <Container>
        <header className={styles.header}>
          <p className={shell.eyebrow}>Create application</p>
          <h1>Add opportunity or application instructions</h1>
          <p className={shell.lead}>
            Paste the source text you have. DossierBox saves it with this Application as supplied; it is not interpreted or added to your Dossier.
          </p>
        </header>

        <StepTrail applicationId={applicationId} />

        <section className={styles.applicationContext} aria-labelledby="saved-application-heading">
          <div>
            <p className={shell.eyebrow}>Saved Application</p>
            <h2 id="saved-application-heading">
              {kind ? applicationObjectiveKindLabel(kind) : "Application"}
            </h2>
            <p>{context}</p>
          </div>
          <Link className={styles.explicitPathLink} href={`/applications/${encodeURIComponent(applicationId)}/recommendation`}>
            Continue to recommendation
          </Link>
        </section>

        {error ? <p className={shell.errorStatus} role="alert">{error}</p> : null}
        {reviewMessage ? <p className={styles.reviewStatus} role="status">{reviewMessage}</p> : null}

        <form action={saveOpportunityCaptureAction} className={styles.opportunityForm}>
          <input name="applicationId" type="hidden" value={applicationId} />
          <div className={settings.field}>
            <label className={settings.label} htmlFor="opportunity-text">
              Opportunity or instruction text
            </label>
            <textarea
              className={`${settings.input} ${styles.opportunityTextarea}`}
              defaultValue={capture?.opportunity.extractedText ?? ""}
              id="opportunity-text"
              maxLength={opportunityCaptureLimits.pastedText}
              name="opportunityText"
              placeholder="Paste the job description, programme guidance, grant brief, selection criteria, or application instructions."
              required
              rows={14}
            />
            <p className={settings.hint}>
              Saved as pasted text with source provenance. No interpretation, requirement extraction, generation, or Intelligence Unit use occurs here. Maximum {opportunityCaptureLimits.pastedText.toLocaleString()} characters.
            </p>
          </div>
          <button className={shell.primaryButton} type="submit">
            {capture ? "Save correction and continue" : "Save source and continue"}
          </button>
          <p className={styles.createNote}>
            You can return to this address to review or correct the saved source. Continuing opens the existing document recommendation step.
          </p>
        </form>

        {capture?.source ? (
          <section className={styles.interpretationSection} aria-labelledby="opportunity-review-heading">
            <div className={styles.interpretationHeading}>
              <div>
                <p className={shell.eyebrow}>Advisory review</p>
                <h2 id="opportunity-review-heading">What this opportunity appears to ask for</h2>
                <p>Review these source-derived details before continuing. They do not change your Dossier or Application Intent.</p>
              </div>
              {interpretation ? (
                <Link className={shell.primaryButton} href={`/applications/${encodeURIComponent(applicationId)}/recommendation`}>
                  Review complete — see recommendation
                </Link>
              ) : (
                <p className={styles.paidLock}>Starter or Pro plan required</p>
              )}
            </div>

            {interpretation ? (
              <div className={styles.interpretationGroups}>
                <InterpretationGroup title="Requirements" items={interpretation.requirements} />
                <InterpretationGroup title="Requested documents" items={interpretation.requestedDocuments} />
                <InterpretationGroup title="Constraints" items={interpretation.constraints} />
              </div>
            ) : (
              <div className={styles.reviewLocked}>
                <p>Paid plans include monthly opportunity reviews that turn saved source text into advisory, reviewable details.</p>
                <form action={interpretOpportunityAction}>
                  <input name="applicationId" type="hidden" value={applicationId} />
                  <input name="opportunityId" type="hidden" value={capture.opportunity.id} />
                  <input name="opportunitySourceId" type="hidden" value={capture.source.id} />
                  <button className={shell.primaryButton} disabled type="submit">Review opportunity</button>
                </form>
              </div>
            )}
          </section>
        ) : null}
      </Container>
    </div>
  );
}

function StepTrail({ applicationId }: { applicationId: string }) {
  return (
    <nav aria-label="Application creation steps" className={styles.trail}>
      <ol className={styles.trailList}>
        <li className={`${styles.trailStep} ${styles.trailStepDone}`}>
          <Link className={styles.trailLink} href="/applications/new">
            <span className={styles.trailLabel}>Purpose</span>
          </Link>
        </li>
        <li className={`${styles.trailStep} ${styles.trailStepDone}`}>
          <span className={styles.trailStatic}><span className={styles.trailLabel}>Context</span></span>
        </li>
        <li className={`${styles.trailStep} ${styles.trailStepCurrent}`} aria-current="step">
          <span className={styles.trailStatic}><span className={styles.trailLabel}>Instructions</span></span>
        </li>
        <li className={styles.trailStep}>
          <Link className={styles.trailLink} href={`/applications/${encodeURIComponent(applicationId)}/recommendation`}>
            <span className={styles.trailLabel}>Recommendation</span>
          </Link>
        </li>
      </ol>
    </nav>
  );
}

type InterpretationItem = {
  readonly label: string;
  readonly detail: string | null;
  readonly sourceReference: string;
  readonly inferred: boolean;
};

type InterpretationView = {
  readonly requirements: readonly InterpretationItem[];
  readonly requestedDocuments: readonly InterpretationItem[];
  readonly constraints: readonly InterpretationItem[];
};

function InterpretationGroup({ title, items }: { title: string; items: readonly InterpretationItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className={styles.interpretationGroup}>
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            <strong>{item.label}</strong>
            {item.detail ? <span>{item.detail}</span> : null}
            <small>{item.inferred ? "Inferred from" : "Stated in"}: “{item.sourceReference}”</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

function interpretationView(value: Record<string, unknown> | null | undefined): InterpretationView | null {
  if (!value) return null;
  const items = (candidate: unknown, kind: "requirement" | "document" | "constraint"): InterpretationItem[] => {
    if (!Array.isArray(candidate)) return [];
    return candidate.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const item = entry as Record<string, unknown>;
      const label = kind === "document" ? item.name : item.text;
      const detail = kind === "requirement" ? item.normalized : kind === "document" ? item.details : null;
      if (typeof label !== "string" || typeof item.sourceReference !== "string") return [];
      return [{
        label,
        detail: typeof detail === "string" && detail !== label ? detail : null,
        sourceReference: item.sourceReference,
        inferred: item.support === "inferred",
      }];
    });
  };
  return {
    requirements: items(value.requirements, "requirement"),
    requestedDocuments: items(value.requestedDocuments, "document"),
    constraints: items(value.constraints, "constraint"),
  };
}

function describeApplicationContext(intent: NonNullable<Awaited<ReturnType<typeof getOwnedApplicationWithIntent>>>["intent"]): string {
  const parts = [
    intent.targetRole,
    intent.programme,
    intent.field,
    intent.organisation,
    intent.institution,
    intent.country,
    intent.deadline ? `Deadline ${intent.deadline}` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" · ") : "General professional profile";
}
