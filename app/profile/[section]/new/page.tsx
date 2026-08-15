import Link from "next/link";
import { notFound } from "next/navigation";
import { createProfileEntryAction } from "@/profile/actions";
import { requireProfileUser } from "@/profile/authorization";
import { ProfileEntryForm } from "@/profile/components/profile-entry-form";
import { isProfileSection, profileSectionMap } from "@/profile/sections";
import { Container } from "@/ui";
import styles from "@/styles/pages/profile.module.css";

type NewEntryPageProps = { params: Promise<{ section: string }> };

export default async function NewProfileEntryPage({ params }: NewEntryPageProps) {
  const { section } = await params;
  if (!isProfileSection(section)) notFound();
  await requireProfileUser();

  const definition = profileSectionMap[section];
  const action = createProfileEntryAction.bind(null, section);

  return (
    <div className={styles.page}>
      <Container>
        <div className={styles.narrow}>
          <Link className={styles.backLink} href={`/profile/${section}`}>Back to {definition.label.toLowerCase()}</Link>
          <header className={styles.editorHeader}>
            <p className={styles.eyebrow}>{definition.label}</p>
            <h1>Add {definition.singular}</h1>
            <p>Enter the facts you know. Optional details can be added later.</p>
          </header>
          <ProfileEntryForm
            action={action}
            cancelHref={`/profile/${section}`}
            definition={definition}
            submitLabel="Save entry"
          />
        </div>
      </Container>
    </div>
  );
}
