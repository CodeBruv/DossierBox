import Link from "next/link";
import { saveProfileBasicsAction } from "@/profile/actions";
import { requireProfileUser } from "@/profile/authorization";
import { ProfileBasicsForm } from "@/profile/components/profile-basics-form";
import { getOrCreateProfile } from "@/profile/repository";
import { Container } from "@/ui";
import styles from "@/styles/pages/profile.module.css";

export default async function ProfileBasicsPage() {
  const user = await requireProfileUser();
  const profile = await getOrCreateProfile(user.id, user);

  return (
    <div className={styles.page}>
      <Container>
        <div className={styles.narrow}>
          <Link className={styles.backLink} href="/profile">Back to Dossier</Link>
          <header className={styles.editorHeader}>
            <p className={styles.eyebrow}>Dossier identity</p>
            <h1>Personal information and direction</h1>
            <p>Store contact details and factual career direction. All fields are optional.</p>
          </header>
          <ProfileBasicsForm action={saveProfileBasicsAction} profile={profile} />
        </div>
      </Container>
    </div>
  );
}
