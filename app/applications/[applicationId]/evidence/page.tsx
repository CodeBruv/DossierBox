import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  confirmEvidenceSelectionAction,
  rejectEvidenceCandidateAction,
} from "@/applications/evidence-actions";
import { materializeDeterministicEvidenceReview } from "@/applications/evidence-selection-repository";
import { requireProfileUser } from "@/profile/authorization";
import { Button, Container } from "@/ui";
import styles from "@/styles/pages/evidence.module.css";
import shell from "@/styles/pages/documents.module.css";

type Props = {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<{ planId?: string; packageId?: string; error?: string; status?: string; unresolved?: string }>;
};

const errors: Record<string, string> = {
  "invalid-selection": "That Evidence selection is no longer valid. Review the current Requirements and Dossier sources.",
  "save-failed": "The Evidence selection could not be saved. No downstream work was changed.",
};

export default async function EvidencePage({ params, searchParams }: Props) {
  const [{ applicationId }, query, user] = await Promise.all([params, searchParams, requireProfileUser()]);
  if (!query.planId || !query.packageId) redirect(`/applications/${encodeURIComponent(applicationId)}/recommendation?error=stale`);
  const review = await materializeDeterministicEvidenceReview(user.id, applicationId, query.packageId);
  if (!review || review.plan.id !== query.planId) notFound();
  const message = query.error
    ? errors[query.error]
    : query.status === "confirmed"
      ? Number(query.unresolved) > 0
        ? "Your Evidence decisions are confirmed. Unresolved Requirements remain visible as gaps."
        : "Your Evidence selection is confirmed for this package."
      : query.status === "rejected"
        ? "The candidate was rejected for this package."
        : null;
  const confirmedEvidenceIds = new Set(review.requirements.flatMap((requirement) => requirement.selections.filter((selection) => selection.status === "confirmed").map((selection) => `${requirement.id}:${selection.evidenceId}`)));

  return (
    <div className={shell.page}>
      <Container>
        <header className={styles.header}>
          <p className={shell.eyebrow}>Create application</p>
          <h1>Review Evidence</h1>
          <p className={shell.lead}>Matching is a suggestion. Confirmation is your decision. Dossier facts remain unchanged and authoritative.</p>
        </header>
        <StepTrail applicationId={applicationId} />
        <section className={styles.package} aria-labelledby="package-heading">
          <div><p className={shell.eyebrow}>Confirmed package</p><h2 id="package-heading">Plan version {review.plan.version}</h2></div>
          <p>{review.requirements.length} Requirement{review.requirements.length === 1 ? "" : "s"} to review</p>
        </section>
        {message ? <p className={query.error ? shell.errorStatus : styles.status} role={query.error ? "alert" : "status"}>{message}</p> : null}

        <form action={confirmEvidenceSelectionAction}>
          <input name="applicationId" type="hidden" value={applicationId} />
          <input name="planId" type="hidden" value={review.plan.id} />
          <input name="packageId" type="hidden" value={review.package.id} />
          <div className={styles.requirements}>
            {review.requirements.length === 0 ? <section className={styles.empty}><h2>No extracted Requirements</h2><p>This package has no reviewed opportunity Requirements to match. You may continue without selecting Evidence.</p></section> : null}
            {review.requirements.map((requirement, index) => (
              <section className={styles.requirement} key={requirement.id}>
                <header className={styles.requirementHeader}>
                  <div><p className={styles.kicker}>Requirement {index + 1}</p><h2>{requirement.text}</h2></div>
                  <span className={styles.coverage}>{requirement.interpretationStatus === "matched" ? "Evidence confirmed" : requirement.interpretationStatus === "gap" ? "Gap recorded" : "Review needed"}</span>
                </header>
                {requirement.sourceReference ? <blockquote>“{requirement.sourceReference}”</blockquote> : null}
                {requirement.matches.length === 0 ? <p className={styles.warning}>No deterministic candidate was found. Leaving this unresolved records a visible gap.</p> : (
                  <div className={styles.candidates}>
                    {requirement.matches.map((match) => {
                      const selected = confirmedEvidenceIds.has(`${requirement.id}:${match.evidence.id}`);
                      const unavailable = !match.source || match.evidence.lifecycle !== "active";
                      const rejected = match.selection?.status === "rejected";
                      const stale = match.selection?.status === "stale" || match.selection?.status === "invalidated";
                      return (
                        <article className={styles.card} key={match.id}>
                          <div className={styles.cardHeading}><div><span className={styles.sourceType}>{match.evidence.sourceType}</span><h3>{match.source?.label ?? "Dossier source unavailable"}</h3></div><span className={styles.matchStatus}>{match.status === "suggested" ? "Suggested match" : "Possible match"}</span></div>
                          <p>{match.source?.searchableText || match.evidence.excerpt || "This source can no longer be read from the Dossier."}</p>
                          <small>{match.explanation} Advisory strength: {Math.round((match.strength ?? 0) * 100)}%.</small>
                          {unavailable || stale ? <p className={styles.warning} role="status">This Evidence is {unavailable ? "unavailable" : "stale"} and cannot be confirmed.</p> : null}
                          {rejected ? <p className={styles.rejected}>Rejected for this package</p> : null}
                          <div className={styles.cardActions}>
                            <label className={styles.choice}><input defaultChecked={selected} disabled={unavailable || stale || rejected} name="selection" type="checkbox" value={`${requirement.id}:${match.evidence.id}:${match.id}`} /><span>{selected ? "Keep selected" : "Select this Evidence"}</span></label>
                            {!unavailable && !stale ? <button className={styles.reject} formAction={rejectEvidenceCandidateAction} name="rejection" type="submit" value={`${requirement.id}:${match.evidence.id}:${match.id}`}>{selected ? "Remove selection" : "Reject"}<span className={styles.srOnly}> {match.source?.label ?? "candidate"}</span></button> : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
                <div className={styles.manualEvidence}>
                  <div>
                    <h3>Choose other Dossier Evidence</h3>
                    <p>These sources were not proposed by deterministic matching. You can still select them manually.</p>
                  </div>
                  <div className={styles.manualChoices}>
                    {review.availableEvidence
                      .filter(({ evidence }) => !requirement.matches.some((match) => match.evidence.id === evidence.id))
                      .map(({ evidence, source }) => {
                        const selection = requirement.selections.find((item) => item.evidenceId === evidence.id);
                        const selected = selection?.status === "confirmed";
                        const unavailable = !source || evidence.lifecycle !== "active";
                        const stale = selection?.status === "stale" || selection?.status === "invalidated";
                        return (
                          <div className={styles.manualChoice} key={evidence.id}>
                            <label>
                              <input
                                defaultChecked={selected}
                                disabled={unavailable || stale}
                                name="selection"
                                type="checkbox"
                                value={`${requirement.id}:${evidence.id}:`}
                              />
                              <span>
                                <strong>{source?.label ?? "Dossier source unavailable"}</strong>
                                <small>{evidence.sourceType}{unavailable ? " · unavailable" : stale ? " · stale" : " · manual selection"}</small>
                              </span>
                            </label>
                            {selected && !unavailable && !stale ? (
                              <button
                                className={styles.reject}
                                formAction={rejectEvidenceCandidateAction}
                                name="rejection"
                                type="submit"
                                value={`${requirement.id}:${evidence.id}:`}
                              >
                                Remove selection
                                <span className={styles.srOnly}> {source?.label ?? "Evidence"}</span>
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    {review.availableEvidence.every(({ evidence }) => requirement.matches.some((match) => match.evidence.id === evidence.id)) ? (
                      <p className={styles.manualEmpty}>All available Dossier Evidence is already shown as a candidate.</p>
                    ) : null}
                  </div>
                </div>
              </section>
            ))}
          </div>
          <div className={styles.confirmBar}><div><strong>Confirm Evidence Selection</strong><p>New checked Evidence is added to this package. Existing choices remain unless you explicitly remove them.</p></div><Button type="submit">Confirm Evidence Selection</Button></div>
        </form>
        {query.status === "confirmed" ? <div className={styles.continue}><Link href={`/documents/new?applicationId=${encodeURIComponent(applicationId)}&planId=${encodeURIComponent(review.plan.id)}&packageId=${encodeURIComponent(review.package.id)}&status=evidence-confirmed`}>Continue to documents</Link></div> : null}
      </Container>
    </div>
  );
}

function StepTrail({ applicationId }: { applicationId: string }) {
  return (
    <nav aria-label="Application creation steps" className={styles.trail}>
      <ol>
        <li><Link href="/applications/new">Purpose</Link></li>
        <li><Link href={`/applications/${encodeURIComponent(applicationId)}/opportunity`}>Instructions</Link></li>
        <li><Link href={`/applications/${encodeURIComponent(applicationId)}/recommendation`}>Recommendation</Link></li>
        <li aria-current="step"><span>Evidence</span></li>
        <li><span>Documents</span></li>
      </ol>
    </nav>
  );
}
