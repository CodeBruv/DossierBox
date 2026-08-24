import { redirect } from "next/navigation";
import { authSessionConfiguration } from "@/auth/auth";
import { getSession } from "@/auth/session";
import { createDocumentAction } from "@/documents/actions";
import { availableDocumentTypeList } from "@/documents/catalogue";
import { Container } from "@/ui";
import styles from "@/styles/pages/documents.module.css";

type NewDocumentPageProps = {
  searchParams: Promise<{ error?: string }>;
};

/**
 * The choices come from the catalogue, so this screen cannot drift from what the engine
 * can actually produce, and cannot offer a document type that does not exist yet.
 */
const choices = availableDocumentTypeList;

export default async function NewDocumentPage({ searchParams }: NewDocumentPageProps) {
  if (!authSessionConfiguration) redirect("/auth/sign-in?callbackUrl=%2Fdocuments%2Fnew&error=Configuration");
  const session = await getSession();
  if (!session?.user) redirect("/auth/sign-in?callbackUrl=%2Fdocuments%2Fnew&error=SessionRequired");
  const query = await searchParams;

  return (
    <div className={styles.page}>
      <Container>
        <p className={styles.eyebrow}>Create from your dossier</p>
        <h1>What are you creating?</h1>
        {/*
          * Says "document", not "purpose". The two are different things — purpose is the
          * opportunity being pursued, and it decides which documents are appropriate —
          * and this screen only asks for the document. Calling a type list a purpose list
          * is what made different choices feel like the same document with a new heading.
          */}
        <p className={styles.lead}>Choose the document you need. It is created as a draft connected to your dossier.</p>
        {query.error === "unsupported-type" ? <p className={styles.errorStatus} role="alert">That document type is not supported.</p> : null}
        {query.error === "create-failed" ? <p className={styles.errorStatus} role="alert">We could not create the draft right now. Your dossier has not been changed. Please try again.</p> : null}
        <div className={styles.choiceList}>
          {choices.map((choice) => (
            <form action={createDocumentAction} key={choice.key}>
              <input name="type" type="hidden" value={choice.key} />
              <button className={styles.choice} type="submit">
                <strong>{choice.label}</strong>
                <span>{choice.description}</span>
              </button>
            </form>
          ))}
        </div>
        <a className={styles.backLink} href="/documents">Back to documents</a>
      </Container>
    </div>
  );
}
