import Link from "next/link";
import { redirect } from "next/navigation";
import {
  applicationObjectiveKindDescription,
  applicationObjectiveKindLabel,
  applicationObjectiveKindList,
  applicationObjectiveLimits,
  isApplicationObjectiveKind,
  type ApplicationObjectiveKind,
} from "@/applications";
import { createApplicationAction } from "@/applications/actions";
import { authSessionConfiguration } from "@/auth/auth";
import { getSession } from "@/auth/session";
import { Container } from "@/ui";
import styles from "@/styles/pages/document-create.module.css";
import shell from "@/styles/pages/documents.module.css";
import settings from "@/styles/ui/document-settings.module.css";

type NewApplicationPageProps = {
  searchParams: Promise<{ kind?: string; error?: string }>;
};

const errorMessages: Record<string, string> = {
  "context-required": "Tell us enough to identify this application before continuing.",
  "create-failed": "We couldn't create the application just now. Your dossier hasn't been changed — please try again.",
  "application-required": "Create or resume an application before choosing a document.",
};

export default async function NewApplicationPage({ searchParams }: NewApplicationPageProps) {
  if (!authSessionConfiguration) {
    redirect("/auth/sign-in?callbackUrl=%2Fapplications%2Fnew&error=Configuration");
  }
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/sign-in?callbackUrl=%2Fapplications%2Fnew&error=SessionRequired");
  }

  const query = await searchParams;
  const kind = isApplicationObjectiveKind(query.kind) ? query.kind : null;
  const error = query.error ? errorMessages[query.error] : null;

  return (
    <div className={shell.page}>
      <Container>
        <header className={styles.header}>
          <p className={shell.eyebrow}>Create application</p>
          <h1>{kind ? "Tell us about this application" : "What are you applying for?"}</h1>
          <p className={shell.lead}>
            {kind
              ? "Add the application-specific context you know now. Your professional facts remain in your Dossier."
              : "Start with the opportunity, not a document. We will save the Application before recommending what to create."}
          </p>
        </header>

        <StepTrail kind={kind} />

        {error ? <p className={shell.errorStatus} role="alert">{error}</p> : null}

        {kind ? <ContextForm kind={kind} /> : <PurposeOptions />}
      </Container>
    </div>
  );
}

function StepTrail({ kind }: { kind: ApplicationObjectiveKind | null }) {
  return (
    <nav aria-label="Application creation steps" className={styles.trail}>
      <ol className={styles.trailList}>
        <li className={`${styles.trailStep} ${kind ? styles.trailStepDone : styles.trailStepCurrent}`} aria-current={kind ? undefined : "step"}>
          {kind ? (
            <Link className={styles.trailLink} href="/applications/new">
              <span className={styles.trailLabel}>Purpose</span>
              <span className={styles.trailValue}>{applicationObjectiveKindLabel(kind)}</span>
            </Link>
          ) : <span className={styles.trailStatic}><span className={styles.trailLabel}>Purpose</span></span>}
        </li>
        <li className={`${styles.trailStep} ${kind ? styles.trailStepCurrent : ""}`} aria-current={kind ? "step" : undefined}>
          <span className={styles.trailStatic}><span className={styles.trailLabel}>Context</span></span>
        </li>
        <li className={styles.trailStep}>
          <span className={styles.trailStatic}><span className={styles.trailLabel}>Instructions</span></span>
        </li>
        <li className={styles.trailStep}>
          <span className={styles.trailStatic}><span className={styles.trailLabel}>Documents</span></span>
        </li>
      </ol>
    </nav>
  );
}

function PurposeOptions() {
  return (
    <ul className={styles.optionGrid}>
      {applicationObjectiveKindList.map((objective) => (
        <li className={styles.option} key={objective.key}>
          <Link className={styles.optionLink} href={`/applications/new?kind=${objective.key}`}>
            {objective.label}
          </Link>
          <p className={styles.optionNote}>{applicationObjectiveKindDescription(objective.key)}</p>
        </li>
      ))}
    </ul>
  );
}

function ContextForm({ kind }: { kind: ApplicationObjectiveKind }) {
  const fields = fieldsFor(kind);
  return (
    <form action={createApplicationAction} className={styles.applicationForm}>
      <input name="kind" type="hidden" value={kind} />
      <div className={styles.applicationSummary}>
        <span>Application purpose</span>
        <strong>{applicationObjectiveKindLabel(kind)}</strong>
      </div>
      <div className={styles.contextFields}>
        {fields.map((field) => (
          <div className={settings.field} key={field.name}>
            <label className={settings.label} htmlFor={`application-${field.name}`}>{field.label}</label>
            <input
              className={settings.input}
              id={`application-${field.name}`}
              maxLength={field.maxLength}
              name={field.name}
              placeholder={field.placeholder}
              type={field.type ?? "text"}
            />
            {field.hint ? <p className={settings.hint}>{field.hint}</p> : null}
          </div>
        ))}
      </div>
      <button className={shell.primaryButton} type="submit">Save application and continue</button>
      <p className={styles.createNote}>This saves the Application and its Intent. Next, you can add the opportunity or application instructions before reviewing document recommendations.</p>
    </form>
  );
}

type ContextField = {
  name: "targetRole" | "organisation" | "institution" | "programme" | "field" | "deadline";
  label: string;
  placeholder: string;
  hint?: string;
  type?: "date";
  maxLength?: number;
};

function fieldsFor(kind: ApplicationObjectiveKind): readonly ContextField[] {
  const deadline: ContextField = { name: "deadline", label: "Deadline (optional)", placeholder: "", type: "date" };
  switch (kind) {
    case "employment":
    case "internship":
    case "professional_opportunity":
      return [
        { name: "targetRole", label: "Role or opportunity", placeholder: kind === "employment" ? "Software Engineer" : "Opportunity name", maxLength: applicationObjectiveLimits.targetRole },
        { name: "organisation", label: "Organisation", placeholder: "Company or organisation", maxLength: applicationObjectiveLimits.organisation },
        deadline,
      ];
    case "scholarship":
    case "fellowship":
    case "international_programme":
      return [
        { name: "programme", label: "Scholarship or programme", placeholder: "Programme name", maxLength: applicationObjectiveLimits.programme },
        { name: "institution", label: "Institution", placeholder: "University or institution", maxLength: applicationObjectiveLimits.institution },
        { name: "organisation", label: "Funder or organisation (optional)", placeholder: "Funding organisation", maxLength: applicationObjectiveLimits.organisation },
        deadline,
      ];
    case "university_admission":
      return [
        { name: "programme", label: "Programme", placeholder: "Master's programme", maxLength: applicationObjectiveLimits.programme },
        { name: "institution", label: "Institution", placeholder: "University or school", maxLength: applicationObjectiveLimits.institution },
        { name: "field", label: "Field (optional)", placeholder: "Computer Science", maxLength: applicationObjectiveLimits.field },
        deadline,
      ];
    case "research":
      return [
        { name: "targetRole", label: "Research position", placeholder: "Research Fellow", maxLength: applicationObjectiveLimits.targetRole },
        { name: "programme", label: "Programme or project (optional)", placeholder: "Programme name", maxLength: applicationObjectiveLimits.programme },
        { name: "institution", label: "Institution", placeholder: "University or research body", maxLength: applicationObjectiveLimits.institution },
        deadline,
      ];
    case "grant":
      return [
        { name: "programme", label: "Grant or project", placeholder: "Grant or project name", maxLength: applicationObjectiveLimits.programme },
        { name: "organisation", label: "Funder", placeholder: "Funding organisation", maxLength: applicationObjectiveLimits.organisation },
        { name: "field", label: "Field (optional)", placeholder: "Research or project field", maxLength: applicationObjectiveLimits.field },
        deadline,
      ];
    case "general_profile":
      return [
        { name: "field", label: "Professional field (optional)", placeholder: "Software engineering", maxLength: applicationObjectiveLimits.field, hint: "No specific opportunity is required for a current professional profile." },
      ];
  }
}
