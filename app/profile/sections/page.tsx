import Link from "next/link";
import { saveProfileSectionsAction } from "@/profile/actions";
import { requireProfileUser } from "@/profile/authorization";
import { ProfileSectionsForm } from "@/profile/components/profile-sections-form";
import { getCanonicalDossierState, getOrCreateProfile } from "@/profile/repository";
import { Container } from "@/ui";
import styles from "@/styles/pages/profile.module.css";

export default async function ProfileSectionsPage() {
  const user = await requireProfileUser();
  const profile = await getOrCreateProfile(user.id, user);
  /*
   * The canonical state keeps selection and population separate: the registry decides
   * the tick, while persisted entry counts decide whether a section contains data.
   */
  const state = await getCanonicalDossierState(profile.id, {
    displayName: profile.displayName,
    headline: profile.headline,
    careerDirection: profile.careerDirection,
  });
  const { selected, counts } = state;

  return (
    <div className={styles.page}>
      <Container>
        <div className={styles.narrow}>
          <Link className={styles.backLink} href="/profile">Back to Dossier</Link>
          <header className={styles.editorHeader}>
            <p className={styles.eyebrow}>Dossier structure</p>
            <h1>Choose your sections</h1>
            <p>Build a dossier around your actual background, not a fixed CV format.</p>
          </header>
          <ProfileSectionsForm
            action={saveProfileSectionsAction}
            counts={counts}
            selected={selected}
          />
        </div>
      </Container>
    </div>
  );
}
