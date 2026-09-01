import Link from "next/link";
import { notFound } from "next/navigation";
import {
  acceptRecommendationAction,
  adjustRecommendationAction,
} from "@/applications/recommendation-actions";
import {
  getOwnedAdjustedRecommendation,
  storedRecommendationIdentity,
} from "@/applications/recommendation-persistence";
import { getOwnedRecommendationContext } from "@/applications/recommendation";
import { documentTypeLabel } from "@/documents/catalogue";
import { freeEntitlement } from "@/entitlements/entitlements";
import { requireProfileUser } from "@/profile/authorization";
import { Button, Container } from "@/ui";
import styles from "@/styles/pages/recommendation.module.css";
import shell from "@/styles/pages/documents.module.css";

type Props = {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<{ error?: string; planId?: string; status?: string }>;
};

const errors: Record<string, string> = {
  stale: "The Application or reviewed opportunity changed. This proposal has been refreshed; review it again before accepting.",
  "invalid-adjustment": "That package could not be accepted. Keep every Application Intent baseline document and stay within the package limit.",
  "save-failed": "The recommendation could not be saved. No document or downstream work was created.",
};

export default async function RecommendationPage({ params, searchParams }: Props) {
  const [{ applicationId }, query, user] = await Promise.all([params, searchParams, requireProfileUser()]);
  // Subscription persistence is not part of Feature 4; absent durable subscription state fails closed to Free.
  const context = await getOwnedRecommendationContext(user.id, applicationId, freeEntitlement(new Date()).plan);
  if (!context) notFound();

  const adjusted = query.planId ? await getOwnedAdjustedRecommendation(user.id, query.planId) : null;
  const adjustedIsCurrent = adjusted
    ? storedRecommendationIdentity(adjusted.plan)?.fingerprint === context.identity.fingerprint
    : false;
  const selected = new Set(adjustedIsCurrent ? adjusted!.documentTypes : context.proposal.recommendedDocuments);
  const message = query.error ? errors[query.error] : query.status === "adjusted" ? "Your adjustment is saved as an unconfirmed proposal. Accept it to create confirmed planning history." : null;

  return (
    <div className={shell.page}>
      <Container>
        <header className={styles.header}>
          <p className={shell.eyebrow}>Create application</p>
          <h1>Review the recommended package</h1>
          <p className={shell.lead}>Application Intent sets the baseline. Only explicit, catalogue-backed requests from the reviewed opportunity can refine it. Nothing is confirmed until you accept.</p>
        </header>

        <StepTrail applicationId={applicationId} />
        {message ? <p className={query.error ? shell.errorStatus : styles.status} role={query.error ? "alert" : "status"}>{message}</p> : null}

        <section className={styles.summary} aria-labelledby="proposal-heading">
          <div>
            <p className={shell.eyebrow}>Unconfirmed proposal</p>
            <h2 id="proposal-heading">Recommended application package</h2>
          </div>
          <p>{context.proposal.packageMembers.length} of {context.maxPackageSize} package places used</p>
        </section>

        <form action={adjustRecommendationAction} className={styles.proposal}>
          <input name="applicationId" type="hidden" value={applicationId} />
          <input name="recommendationIdentity" type="hidden" value={context.identity.fingerprint} />
          <ul className={styles.members}>
            {context.proposal.packageMembers.map((member) => {
              const baseline = member.reason === "application";
              return (
                <li key={member.documentType}>
                  <div className={styles.memberChoice}>
                    {baseline ? <input name="documentType" type="hidden" value={member.documentType} /> : null}
                    <input
                      aria-describedby={`${member.documentType}-reason`}
                      defaultChecked={selected.has(member.documentType)}
                      disabled={baseline}
                      id={member.documentType}
                      name={baseline ? undefined : "documentType"}
                      type="checkbox"
                      value={member.documentType}
                    />
                    <label htmlFor={member.documentType}>{documentTypeLabel(member.documentType)}</label>
                  </div>
                  <p id={`${member.documentType}-reason`}>{member.rationale}</p>
                  <small>{baseline ? "Application Intent baseline — cannot be removed" : "Explicit opportunity request"} · {member.availability === "available" ? "Available now" : "Planned, not available yet"}</small>
                  {member.sourceReference ? <blockquote>“{member.sourceReference}”</blockquote> : null}
                </li>
              );
            })}
          </ul>
          <div className={styles.actions}>
            <Button type="submit" variant="secondary">Save adjustment</Button>
          </div>
        </form>

        <Advisories context={context} />

        <form action={acceptRecommendationAction} className={styles.accept}>
          <input name="applicationId" type="hidden" value={applicationId} />
          <input name="recommendationIdentity" type="hidden" value={context.identity.fingerprint} />
          {adjustedIsCurrent && adjusted ? <input name="planId" type="hidden" value={adjusted.plan.id} /> : null}
          <div>
            <h2>Confirm planning only</h2>
            <p>Accepting records a confirmed Application Plan and Package. It does not create a document, specification, evidence selection, generation, preparation, or export.</p>
          </div>
          <Button type="submit">Accept recommendation</Button>
        </form>
      </Container>
    </div>
  );
}

function Advisories({ context }: { context: NonNullable<Awaited<ReturnType<typeof getOwnedRecommendationContext>>> }) {
  const groups = [
    { title: "Inferred — advisory only", items: context.proposal.advisoryDocuments ?? [], note: "These were inferred and never enter the authoritative package automatically." },
    { title: "Unsupported explicit requests", items: context.proposal.unsupportedDocuments ?? [], note: "These do not map unambiguously to a shipping or planned catalogue type." },
    { title: "Supported but outside this package limit", items: context.proposal.constrainedDocuments ?? [], note: "These are catalogue-backed, but were not included because the server-authoritative package limit was reached." },
  ].filter((group) => group.items.length > 0);
  if (groups.length === 0 && !(context.proposal.warnings?.length)) return null;
  return (
    <aside className={styles.advisories} aria-labelledby="advisories-heading">
      <h2 id="advisories-heading">Review notes</h2>
      {context.proposal.warnings?.map((warning) => <p className={styles.warning} key={warning}>{warning}</p>)}
      <div className={styles.advisoryGrid}>{groups.map((group) => <section key={group.title}><h3>{group.title}</h3><p>{group.note}</p><ul>{group.items.map((item, index) => <li key={`${item.name}-${index}`}><strong>{item.name}</strong><small>“{item.sourceReference}”</small></li>)}</ul></section>)}</div>
    </aside>
  );
}

function StepTrail({ applicationId }: { applicationId: string }) {
  return <nav aria-label="Application creation steps" className={styles.trail}><ol><li><Link href="/applications/new">Purpose</Link></li><li><Link href={`/applications/${encodeURIComponent(applicationId)}/opportunity`}>Instructions</Link></li><li aria-current="step"><span>Recommendation</span></li><li><span>Evidence</span></li><li><span>Documents</span></li></ol></nav>;
}
