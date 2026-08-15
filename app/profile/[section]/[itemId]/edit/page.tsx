import Link from "next/link";
import { notFound } from "next/navigation";
import { updateProfileEntryAction } from "@/profile/actions";
import { requireProfileUser } from "@/profile/authorization";
import { ProfileEntryForm } from "@/profile/components/profile-entry-form";
import { getOrCreateProfile, getOwnedSectionEntry } from "@/profile/repository";
import { isProfileSection, profileSectionMap } from "@/profile/sections";
import { Container } from "@/ui";
import styles from "@/styles/pages/profile.module.css";

type EditEntryPageProps = {
  params: Promise<{ section: string; itemId: string }>;
};

export default async function EditProfileEntryPage({ params }: EditEntryPageProps) {
  const { section, itemId } = await params;
  if (!isProfileSection(section)) notFound();

  const user = await requireProfileUser();
  const profile = await getOrCreateProfile(user.id, user);
  const entry = await getOwnedSectionEntry(section, profile.id, itemId);
  if (!entry) notFound();

  const definition = profileSectionMap[section];
  const action = updateProfileEntryAction.bind(null, section, itemId);

  return (
    <div className={styles.page}>
      <Container>
        <div className={styles.narrow}>
          <Link className={styles.backLink} href={`/profile/${section}`}>Back to {definition.label.toLowerCase()}</Link>
          <header className={styles.editorHeader}>
            <p className={styles.eyebrow}>{definition.label}</p>
            <h1>Edit {definition.singular}</h1>
            <p>Update the factual record. Changes save only to this entry.</p>
          </header>
          <ProfileEntryForm
            action={action}
            cancelHref={`/profile/${section}`}
            definition={definition}
            initialValues={entry as unknown as Record<string, unknown>}
            submitLabel="Save changes"
          />
        </div>
      </Container>
    </div>
  );
}
