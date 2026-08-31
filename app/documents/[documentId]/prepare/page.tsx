import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { authSessionConfiguration } from "@/auth/auth";
import { getSession } from "@/auth/session";
import { acceptGeneratedContentAction } from "@/documents/actions";
import {
  addDocumentEvidenceAction,
  approveDocumentSpecificationAction,
  createDocumentSpecificationAction,
  generatePreparedDocumentAction,
  initializeDocumentPreparationAction,
} from "@/documents/preparation-actions";
import { getDocumentPreparation } from "@/documents/preparation";
import { composeStructuredDocument } from "@/documents/composition";
import { compileStructuredDocumentContent } from "@/documents/content-compiler";
import { documentTypeLabel } from "@/documents/repository";
import { resolvePresentationStyle } from "@/documents/presentation";
import { DocumentPreview } from "@/documents/components/document-preview";
import { Container } from "@/ui";
import styles from "@/styles/pages/documents.module.css";

type Props = {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
};

const errors: Record<string, string> = {
  "setup-failed": "Preparation could not be started. Your draft was not changed.",
  "setup-required": "Start the preparation plan before creating a specification.",
  "evidence-invalid": "Choose an available fact from your Dossier.",
  "evidence-failed": "That Dossier fact could not be selected. Nothing else was changed.",
  "specification-incomplete": "Describe the document's purpose and select at least one Evidence item.",
  "specification-invalid": "The specification could not be linked safely to this Application.",
  "specification-failed": "The specification could not be saved. Your Evidence remains selected.",
  "approval-failed": "The specification could not be approved.",
  "units-unavailable": "Generation is ready, but this account has no available generation units.",
  "provider-unavailable": "Generation reached the writing step, but no writing provider is configured. The failed attempt was recorded and no draft was presented as generated.",
  "generation-failed": "Generation could not complete. The draft remains mutable and cannot be exported.",
};

export default async function PrepareDocumentPage({ params, searchParams }: Props) {
  const { documentId } = await params;
  if (!authSessionConfiguration) redirect(`/auth/sign-in?callbackUrl=%2Fdocuments%2F${documentId}%2Fprepare&error=Configuration`);
  const session = await getSession();
  if (!session?.user?.id) redirect(`/auth/sign-in?callbackUrl=%2Fdocuments%2F${documentId}%2Fprepare&error=SessionRequired`);
  const preparation = await getDocumentPreparation(session.user.id, documentId);
  if (!preparation) notFound();
  const { status, error } = await searchParams;
  const selectedSourceIds = new Set(preparation.evidence.map((item) => `${item.sourceType}:${item.sourceRecordId}`));
  const availableSources = preparation.sources.filter((source) => !selectedSourceIds.has(`${source.sourceType}:${source.sourceRecordId}`));
  const specification = preparation.specification;
  const generation = preparation.generation;
  const artifact = generation?.artifact ?? null;
  const generatedCompilation = artifact && specification ? compileStructuredDocumentContent({
    documentType: preparation.document.type,
    specification: {
      documentType: preparation.document.type,
      purpose: specification.purpose,
      constraints: specification.constraints,
      instructions: specification.instructions,
      context: specification.context,
      sectionExpectations: specification.sectionExpectations,
      outputCharacteristics: specification.outputCharacteristics,
    },
    selectedEvidence: preparation.evidence.map((item) => ({
      evidenceId: item.id,
      sourceType: item.sourceType,
      sourceRecordId: item.sourceRecordId,
    })),
    content: artifact.content,
    provenance: artifact.provenance as Record<string, { evidenceIds?: readonly string[]; requirementIds?: readonly string[] }>,
  }) : null;
  const generatedReview = generatedCompilation?.ok && specification ? composeStructuredDocument({
    documentType: preparation.document.type,
    specification: { documentType: preparation.document.type, purpose: specification.purpose },
    selectedEvidence: preparation.evidence.map((item) => ({ evidenceId: item.id, sourceType: item.sourceType, sourceRecordId: item.sourceRecordId })),
    content: generatedCompilation.content,
    configuration: { hiddenSections: preparation.document.hiddenSections, sectionOrder: preparation.document.sectionOrder },
  }) : null;
  const generatedPresentation = generatedReview ? resolvePresentationStyle(preparation.document.template, preparation.document.type) : null;
  const purpose = preparation.document.objective && typeof preparation.document.objective === "object"
    ? "Create a tailored document for this Application using only the selected Evidence."
    : "Create a focused professional document using only the selected Evidence.";

  return (
    <div className={styles.page}>
      <Container>
        <div className={styles.narrow}>
          <Link className={styles.backLink} href={`/documents/${documentId}`}>Back to live draft</Link>
          <header className={styles.editorHeader}>
            <p className={styles.eyebrow}>{documentTypeLabel(preparation.document.type)} · Preparation</p>
            <h1>Prepare, generate, and accept</h1>
            <p>The live draft still follows your Dossier. This guided path pins Application context and Evidence into a reviewed specification before generation.</p>
          </header>
          {error ? <p className={styles.errorStatus} role="alert">{errors[error] ?? errors["generation-failed"]}</p> : null}
          {status === "accepted" ? <p className={styles.successStatus} role="status">Accepted. Your immutable document version is ready to export.</p> : null}
          {status && status !== "accepted" ? <p className={styles.successStatus} role="status">Progress saved. Continue with the next available step.</p> : null}
        </div>

        <ol className={styles.preparationSteps}>
          <li className={styles.preparationCard}>
            <p className={styles.eyebrow}>1 · Application plan</p>
            <h2>{preparation.member ? "Document package ready" : "Create the preparation plan"}</h2>
            <p>This connects the existing Application, a confirmed plan and package, and this draft as the primary document. It does not create a duplicate Application.</p>
            {!preparation.member ? <form action={initializeDocumentPreparationAction}><input name="documentId" type="hidden" value={documentId} /><button className={styles.primaryButton} type="submit">Start preparation</button></form> : <p className={styles.completionText}>Complete · this draft is attached to its Application package.</p>}
          </li>

          <li className={styles.preparationCard}>
            <p className={styles.eyebrow}>2 · Evidence</p>
            <h2>Select facts from your Dossier</h2>
            <p>Evidence keeps a reference to the original Dossier fact; it does not copy or rewrite it.</p>
            {preparation.evidence.length ? <ul className={styles.evidenceList}>{preparation.evidence.map((item) => <li key={item.id}>{item.sourceType} · {item.lifecycle === "active" ? "available" : "unavailable"}</li>)}</ul> : <p className={styles.lifecycleNote}>No Evidence selected yet.</p>}
            {preparation.member && availableSources.length ? <form action={addDocumentEvidenceAction} className={styles.preparationForm}>
              <input name="documentId" type="hidden" value={documentId} />
              <label htmlFor="source">Dossier fact</label>
              <select id="source" name="source" required defaultValue=""><option disabled value="">Choose a fact</option>{availableSources.map((source) => <option key={`${source.sourceType}:${source.sourceRecordId}`} value={`${source.sourceType}:${source.sourceRecordId}`}>{source.sourceType} · {source.label}</option>)}</select>
              <button className={styles.secondaryButton} type="submit">Add Evidence</button>
            </form> : null}
            {!preparation.sources.length ? <p className={styles.lifecycleNote}>Add a named profile or a section entry to your Dossier before selecting Evidence.</p> : null}
          </li>

          <li className={styles.preparationCard}>
            <p className={styles.eyebrow}>3 · Document specification</p>
            <h2>{specification ? `Revision ${specification.revision} · ${specification.status.replaceAll("_", " ")}` : "State the generation purpose"}</h2>
            {specification ? <><p>{specification.purpose}</p><p className={styles.lifecycleNote}>{specification.evidenceIds.length} Evidence item{specification.evidenceIds.length === 1 ? "" : "s"} pinned to this revision.</p></> : preparation.member && preparation.evidence.length ? <form action={createDocumentSpecificationAction} className={styles.preparationForm}>
              <input name="documentId" type="hidden" value={documentId} />
              <label htmlFor="purpose">Purpose</label><textarea id="purpose" name="purpose" required rows={3} defaultValue={purpose} />
              <label htmlFor="instructions">Instructions <span>(optional)</span></label><textarea id="instructions" name="instructions" rows={3} placeholder="For example: concise, evidence-led, and suitable for a hiring panel." />
              <fieldset><legend>Evidence to pin</legend>{preparation.evidence.filter((item) => item.lifecycle === "active").map((item) => <label className={styles.checkRow} key={item.id}><input defaultChecked name="evidenceId" type="checkbox" value={item.id} />{item.sourceType}</label>)}</fieldset>
              <button className={styles.primaryButton} type="submit">Create specification</button>
            </form> : <p className={styles.lifecycleNote}>Complete the plan and select Evidence first.</p>}
            {specification && ["draft", "ready_for_review"].includes(specification.status) ? <form action={approveDocumentSpecificationAction}><input name="documentId" type="hidden" value={documentId} /><input name="specificationId" type="hidden" value={specification.id} /><button className={styles.primaryButton} type="submit">Review and approve</button></form> : null}
          </li>

          <li className={styles.preparationCard}>
            <p className={styles.eyebrow}>4 · Generation and review</p>
            <h2>{artifact ? "Generated result ready for review" : generation?.attempt.status === "failed" ? "Generation attempt stopped" : "Generate from the approved revision"}</h2>
            {artifact && generatedReview && generatedPresentation ? <>
              <p>The generated artifact passed structured compilation. Review the actual generated result below. Acceptance is still required before it becomes immutable or exportable.</p>
              <dl className={styles.generatedMeta}>
                <div><dt>Document</dt><dd>{documentTypeLabel(preparation.document.type)}</dd></div>
                <div><dt>Application purpose</dt><dd>{specification?.purpose}</dd></div>
                <div><dt>Presentation</dt><dd>{generatedPresentation.label}</dd></div>
              </dl>
              <div className={styles.generatedPreview}><DocumentPreview document={generatedReview} presentationStyle={generatedPresentation} /></div>
              <p className={styles.lifecycleNote}>This is the generated result that will become the accepted document. It is not exportable until you accept it.</p>
              <form action={acceptGeneratedContentAction}><input name="generatedContentVersionId" type="hidden" value={artifact.id} /><button className={styles.primaryButton} type="submit">Accept and create immutable version</button></form>
            </> : artifact ? <p className={styles.lifecycleNote}>The generated artifact could not be rendered safely for review. It has not been accepted or made exportable.</p> : specification?.status === "approved" ? <form action={generatePreparedDocumentAction}><input name="documentId" type="hidden" value={documentId} /><input name="specificationId" type="hidden" value={specification.id} /><input name="revision" type="hidden" value={specification.revision} /><button className={styles.primaryButton} type="submit">Generate document</button></form> : <p className={styles.lifecycleNote}>Approve the specification before generation. Export remains unavailable until acceptance creates an immutable version.</p>}
            {generation?.attempt.status === "failed" ? <p className={styles.lifecycleNote}>Generation stopped at {generation.attempt.failureKind ?? "a recorded failure"}. The draft remains mutable and cannot be exported.</p> : null}
          </li>
        </ol>
      </Container>
    </div>
  );
}
