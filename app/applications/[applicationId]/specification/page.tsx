import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOwnedApplicationWithIntent } from "@/applications/repository";
import { getOwnedApplicationPlan } from "@/applications/plans-repository";
import { getOwnedApplicationPackage, listPackageMembers } from "@/applications/packages-repository";
import { getEvidenceReview } from "@/applications/evidence-selection-repository";
import { requireProfileUser } from "@/profile/authorization";
import { Container } from "@/ui";
import { documentSectionHeading, documentSectionSlots, documentTypeLabel } from "@/documents/catalogue";
import { createApplicationDocumentSpecificationAction, approveApplicationDocumentSpecificationAction } from "@/documents/preparation-actions";
import { listDocumentSpecifications } from "@/documents/specification-repository";
import styles from "@/styles/pages/specification.module.css";
import shell from "@/styles/pages/documents.module.css";

type Props = {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<{ planId?: string; packageId?: string; status?: string; error?: string }>;
};

const errors: Record<string, string> = {
  "invalid-specification": "This specification could not be linked to the confirmed application package.",
  "specification-incomplete": "Add a purpose before confirming this document specification.",
  "specification-failed": "The specification could not be saved. Your confirmed Evidence remains unchanged.",
  "approval-failed": "This specification needs review before it can continue.",
};

export default async function SpecificationPage({ params, searchParams }: Props) {
  const [{ applicationId }, query, user] = await Promise.all([params, searchParams, requireProfileUser()]);
  if (!query.planId || !query.packageId) redirect(`/applications/${encodeURIComponent(applicationId)}/recommendation?error=stale`);
  const [application, plan, applicationPackage, members, review] = await Promise.all([
    getOwnedApplicationWithIntent(user.id, applicationId),
    getOwnedApplicationPlan(user.id, query.planId),
    getOwnedApplicationPackage(user.id, query.packageId),
    listPackageMembers(user.id, query.packageId),
    getEvidenceReview(user.id, applicationId, query.packageId),
  ]);
  if (!application || !plan || !applicationPackage || !review || plan.applicationId !== applicationId || applicationPackage.planId !== plan.id || plan.status !== "confirmed" || plan.confirmation !== "confirmed" || applicationPackage.status !== "confirmed" || applicationPackage.confirmation !== "confirmed") notFound();

  const specifications = await Promise.all(members.map((member) => listDocumentSpecifications(user.id, member.id)));
  const currentEvidence = new Map(review.requirements.flatMap((requirement) => requirement.selections.filter((selection) => selection.status === "confirmed").map((selection) => [selection.evidenceId, review.availableEvidence.find(({ evidence }) => evidence.id === selection.evidenceId)] as const)).filter((entry) => entry[1]));
  const requirements = review.requirements;
  const gaps = requirements.filter((requirement) => !requirement.selections.some((selection) => selection.status === "confirmed"));
  const message = query.error ? errors[query.error] : query.status === "created" ? "Your Document Specification is saved for review." : query.status === "approved" ? "Specification confirmed. The later Workspace can use this reviewed contract." : null;

  return <div className={shell.page}><Container>
    <header className={styles.header}>
      <p className={shell.eyebrow}>Application</p>
      <h1>Define the document you are preparing</h1>
      <p className={shell.lead}>DossierBox has reviewed this application and the Evidence you confirmed. Now define the document contract that a later Workspace will use.</p>
    </header>
    <nav className={styles.trail} aria-label="Application creation steps"><ol><li><Link href={`/applications/${applicationId}/recommendation`}>Recommendation</Link></li><li><Link href={`/applications/${applicationId}/evidence?planId=${plan.id}&packageId=${applicationPackage.id}`}>Evidence</Link></li><li aria-current="step"><span>Document Specification</span></li><li><span>Later: Workspace</span></li></ol></nav>
    <section className={styles.identity} aria-labelledby="application-heading"><div><p className={styles.kicker}>For this application</p><h2 id="application-heading">{application.intent?.targetRole || application.intent?.programme || "Saved application"}</h2><p>{[application.intent?.organisation, application.intent?.institution, application.intent?.country].filter(Boolean).join(" · ") || "Application context saved"}</p></div><p className={styles.packageLabel}>Confirmed package · {members.length} document{members.length === 1 ? "" : "s"}</p></section>
    {message ? <p className={query.error ? shell.errorStatus : styles.status} role={query.error ? "alert" : "status"}>{message}</p> : null}
    <section className={styles.context} aria-labelledby="context-heading"><h2 id="context-heading">What this application needs</h2><p>Requirements come from the reviewed opportunity. They are not claims about your professional history.</p><div className={styles.requirements}>{requirements.length ? requirements.map((requirement) => <article key={requirement.id} className={styles.requirement}><div><h3>{requirement.text}</h3>{requirement.sourceReference ? <p className={styles.source}>From the supplied opportunity: “{requirement.sourceReference}”</p> : null}</div><span className={requirement.selections.some((selection) => selection.status === "confirmed") ? styles.good : styles.gap}>{requirement.selections.some((selection) => selection.status === "confirmed") ? "Supported by confirmed Evidence" : "Gap remains visible"}</span></article>) : <p>No specific Requirements were extracted. The document will still preserve the application purpose.</p>}</div></section>
    <section className={styles.context} aria-labelledby="evidence-heading"><h2 id="evidence-heading">Confirmed Evidence available to this package</h2><p>Only Evidence confirmed for this Application Package is available here. Dossier facts remain in the Dossier.</p>{currentEvidence.size ? <ul className={styles.evidence}>{[...currentEvidence.values()].map((item) => item ? <li key={item.evidence.id}><strong>{item.source?.label ?? "Dossier source"}</strong><span>{item.evidence.sourceType} · current and confirmed</span><p>{item.source?.searchableText || item.evidence.excerpt || "Confirmed Dossier source"}</p></li> : null)}</ul> : <p className={styles.warning}>No current Evidence is confirmed. Unresolved Requirements will remain gaps; nothing will be invented.</p>}</section>
    {members.map((member, index) => { const specification = specifications[index]?.[0] ?? null; const type = member.documentType as Parameters<typeof documentSectionSlots>[0]; return <section className={styles.document} key={member.id} aria-labelledby={`${member.id}-heading`}><div className={styles.documentHeader}><div><p className={styles.kicker}>{member.role === "primary" ? "Primary document" : "Supporting document"}</p><h2 id={`${member.id}-heading`}>{documentTypeLabel(type)}</h2></div><span className={styles.packageLabel}>{specification ? `Revision ${specification.revision} · ${specification.status.replaceAll("_", " ")}` : "Not yet specified"}</span></div>{specification ? <><p className={styles.purpose}>{specification.purpose}</p><p className={styles.meta}>{specification.evidenceIds.length} confirmed Evidence reference{specification.evidenceIds.length === 1 ? "" : "s"} · {specification.requirementIds.length} Requirement reference{specification.requirementIds.length === 1 ? "" : "s"}</p>{specification.status === "draft" || specification.status === "ready_for_review" ? <form action={approveApplicationDocumentSpecificationAction}><input type="hidden" name="applicationId" value={applicationId}/><input type="hidden" name="planId" value={plan.id}/><input type="hidden" name="packageId" value={applicationPackage.id}/><input type="hidden" name="specificationId" value={specification.id}/><button className={styles.primaryButton} type="submit">Review and confirm specification</button></form> : null}</> : <form action={createApplicationDocumentSpecificationAction} className={styles.form}><input type="hidden" name="applicationId" value={applicationId}/><input type="hidden" name="planId" value={plan.id}/><input type="hidden" name="packageId" value={applicationPackage.id}/><input type="hidden" name="memberId" value={member.id}/><label htmlFor={`${member.id}-purpose`}>Purpose for this document</label><textarea id={`${member.id}-purpose`} name="purpose" required rows={3} defaultValue={`Prepare a focused ${documentTypeLabel(type).toLowerCase()} for this application using only confirmed Evidence.`}/><label htmlFor={`${member.id}-instructions`}>Important constraints or notes <span>(optional)</span></label><textarea id={`${member.id}-instructions`} name="instructions" rows={3} placeholder="For example: keep the document concise and foreground relevant experience."/><div className={styles.structure}><h3>Document structure</h3><p>This deterministic structure follows the supported document type.</p><ol>{documentSectionSlots(type).map((slot) => <li key={slot.key}><span>{documentSectionHeading(type, slot.key)}</span><small>{slot.status}</small></li>)}</ol></div><p className={styles.warning}>{gaps.length ? `${gaps.length} Requirement${gaps.length === 1 ? "" : "s"} remain${gaps.length === 1 ? "s" : ""} without confirmed support. They will stay visible as gaps.` : "All reviewed Requirements have confirmed support."}</p><button className={styles.primaryButton} type="submit">Save Document Specification</button></form>}</section>})}
    <p className={styles.footerNote}>This specification defines document purpose, structure, Requirements, and confirmed Evidence references. It is not generated content and does not change your Dossier.</p>
  </Container></div>;
}
