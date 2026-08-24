import Link from "next/link";
import { saveProfileSectionsAction } from "@/profile/actions";
import { requireProfileUser } from "@/profile/authorization";
import { ProfileSectionsForm } from "@/profile/components/profile-sections-form";
import { getDossierSectionState, getOrCreateProfile } from "@/profile/repository";
import { isProfileSection } from "@/profile/sections";
import { Container } from "@/ui";
import styles from "@/styles/pages/profile.module.css";

export default async function ProfileSectionsPage() {
  const user = await requireProfileUser();
  const profile = await getOrCreateProfile(user.id, user);
  /*
   * The counts are what stop this screen offering to hide information the user has
   * already saved. It used to read the chosen-section registry alone, so a section
   * holding entries could be presented unchecked — an invitation to remove
   * something this form has no power to remove.
   */
  const { registered, counts } = await getDossierSectionState(profile.id);
  const selected = registered.filter(isProfileSection);

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
