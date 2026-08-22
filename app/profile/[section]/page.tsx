import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteProfileEntryAction } from "@/profile/actions";
import { requireProfileUser } from "@/profile/authorization";
import { DossierRail, SectionFlowFooter } from "@/profile/components/dossier-flow-nav";
import { buildDossierFlow, currentStep } from "@/profile/flow";
import {
  getEnabledSectionKeys,
  getOrCreateProfile,
  listSectionEntries,
} from "@/profile/repository";
import { isProfileSection, profileSectionMap } from "@/profile/sections";
import { Container } from "@/ui";
import styles from "@/styles/pages/profile.module.css";

type SectionPageProps = {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ status?: string }>;
};

type StatusTone = "success" | "notice" | "failure";

const statusMessages: Record<string, { message: string; tone: StatusTone }> = {
  created: { message: "Entry saved.", tone: "success" },
  updated: { message: "Entry updated.", tone: "success" },
  deleted: { message: "Entry deleted.", tone: "success" },
  "sections-saved": { message: "Sections updated. Continue from here.", tone: "success" },
  "basics-saved": { message: "Identity saved. Continue from here.", tone: "success" },
  "delete-failed": { message: "The entry could not be deleted.", tone: "failure" },
  /**
   * Reached when an edit link points at an entry that is no longer in the
   * dossier — most often because it was deleted in another tab, or the link was
   * followed from a stale page. Previously this rendered a bare 404, which reads
   * as "this part of DossierBox is broken" rather than "that one entry is gone".
   */
  "entry-missing": {
    message: "That entry is no longer in your dossier. It may have already been deleted.",
    tone: "notice",
  },
};

const toneClass: Record<StatusTone, string> = {
  success: styles.successStatus,
  notice: styles.noticeStatus,
  failure: styles.errorSummary,
};

export default async function ProfileSectionPage({ params, searchParams }: SectionPageProps) {
  const { section } = await params;
  if (!isProfileSection(section)) notFound();

  const user = await requireProfileUser();
  const profile = await getOrCreateProfile(user.id, user);
  const [entries, enabled, query] = await Promise.all([
    listSectionEntries(section, profile.id),
    getEnabledSectionKeys(profile.id),
    searchParams,
  ]);

  const definition = profileSectionMap[section];
  const flow = buildDossierFlow(enabled);
  const step = currentStep(flow, section);
  const status = query.status ? statusMessages[query.status] : undefined;

  return (
    <div className={styles.page}>
      <Container>
        <div className={styles.narrow}>
          <DossierRail currentKey={section} flow={flow} />

          <header className={styles.sectionPageHeader}>
            <div>
              <p className={styles.eyebrow}>
                {step ? `Step ${step.position} of ${flow.total}` : "Optional section"}
              </p>
              <h1>{definition.label}</h1>
              <p>{definition.description}</p>
            </div>
          </header>

          {status ? (
            <p
              className={toneClass[status.tone]}
              role={status.tone === "failure" ? "alert" : "status"}
            >
              {status.message}
            </p>
          ) : null}

          {entries.length ? (
            <div className={styles.entryList}>
              {entries.map((entry) => {
                const record = entry as unknown as Record<string, unknown>;
                const deleteAction = deleteProfileEntryAction.bind(null, section, String(record.id));
                return (
                  <article className={styles.entryCard} key={String(record.id)}>
                    <div>
                      <h2>{entryTitle(section, record)}</h2>
                      <p>{entryDetail(record)}</p>
                    </div>
                    <div className={styles.entryActions}>
                      <Link className={styles.secondaryButton} href={`/profile/${section}/${record.id}/edit`}>Edit</Link>
                      <form action={deleteAction}>
                        <button className={styles.dangerButton} type="submit">Delete</button>
                      </form>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <h2>Nothing here yet</h2>
              <p>Add only factual information you want available for future documents.</p>
              <Link className={styles.primaryButton} href={`/profile/${section}/new`}>
                Add {definition.singular}
              </Link>
            </div>
          )}

          <SectionFlowFooter
            flow={flow}
            hasEntries={entries.length > 0}
            section={section}
            singular={definition.singular}
          />
        </div>
      </Container>
    </div>
  );
}

function entryTitle(section: string, record: Record<string, unknown>) {
  const candidates = section === "experience"
    ? [record.role, record.organization]
    : [record.name, record.title, record.language, record.organization, record.institution, record.label];
  return candidates.find((value) => typeof value === "string" && value) as string || "Dossier entry";
}

function entryDetail(record: Record<string, unknown>) {
  const detail = [record.organization, record.institution, record.issuer, record.publisher, record.role, record.type]
    .find((value) => typeof value === "string" && value);
  const years = [record.startYear ?? record.issueYear ?? record.year, record.endYear ?? record.expiryYear]
    .filter((value) => typeof value === "number")
    .join(" - ");
  return [detail, years].filter(Boolean).join(" · ") || "Saved dossier information";
}
