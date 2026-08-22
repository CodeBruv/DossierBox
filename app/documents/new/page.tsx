import { redirect } from "next/navigation";
import { authSessionConfiguration } from "@/auth/auth";
import { getSession } from "@/auth/session";
import { createDocumentAction } from "@/documents/actions";
import { Container } from "@/ui";
import styles from "@/styles/pages/documents.module.css";

type NewDocumentPageProps = {
  searchParams: Promise<{ error?: string }>;
};

const choices = [
  {
    type: "professional_cv",
    title: "Professional CV",
    description: "A clear, general-purpose record of your experience.",
  },
  {
    type: "professional_resume",
    title: "Professional résumé",
    description: "A focused, achievement-oriented document for an application.",
  },
  {
    type: "academic_cv",
    title: "Academic or international CV",
    description: "A fuller document for academic, research, or cross-border contexts.",
  },
] as const;

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
        <p className={styles.lead}>Choose a purpose first. A draft will be created and connected to your dossier.</p>
        {query.error === "unsupported-type" ? <p className={styles.errorStatus} role="alert">That document type is not supported.</p> : null}
        {query.error === "create-failed" ? <p className={styles.errorStatus} role="alert">We could not create the draft right now. Your dossier has not been changed. Please try again.</p> : null}
        <div className={styles.choiceList}>
          {choices.map((choice) => (
            <form action={createDocumentAction} key={choice.type}>
              <input name="type" type="hidden" value={choice.type} />
              <button className={styles.choice} type="submit">
                <strong>{choice.title}</strong>
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
