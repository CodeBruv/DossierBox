import Link from "next/link";
import { Button, Container } from "@/ui";
import { routes } from "@/config/paths";
import styles from "@/styles/pages/landing.module.css";

const processSteps = [
  {
    title: "Start with your profile",
    text: "Keep your experience, education, skills, and goals in one reusable career profile.",
  },
  {
    title: "Choose the purpose",
    text: "Select the destination and document family so the right information leads the story.",
  },
  {
    title: "Create the document",
    text: "Review a structured document, then move toward a canonical PDF you can share and reuse.",
  },
];

const documentFamilies = [
  {
    name: "Standard CV",
    text: "A broad professional record for keeping your full experience in view.",
  },
  {
    name: "Professional Résumé",
    text: "A focused version shaped around a role, opportunity, or professional destination.",
  },
  {
    name: "International CV",
    text: "A globally legible document for applications that cross countries and conventions.",
  },
  {
    name: "Career / Academic CV",
    text: "A detailed record for academic, research, and long-form career contexts.",
  },
];

const principles = [
  {
    title: "Your facts stay central",
    text: "Documents are derived from the information you provide. The system is designed to improve structure and clarity without inventing your career history.",
  },
  {
    title: "Purpose shapes the result",
    text: "The same profile can support different documents because the destination determines what should be emphasized.",
  },
  {
    title: "Presentation serves the content",
    text: "Templates provide a credible visual system, while document intelligence remains separate from visual styling.",
  },
];

function DocumentPreview() {
  return (
    <div className={styles.documentStage} aria-hidden="true">
      <div className={styles.document}>
        <div className={styles.documentHeader}>
          <span className={styles.documentName}>Career Profile</span>
          <span className={styles.documentRole}>Purpose-led document</span>
        </div>
        <div className={styles.documentSection}>
          <span className={styles.documentLabel}>Profile</span>
          <span className={styles.documentLine} />
          <span className={styles.documentLine} />
          <span className={styles.documentLineShort} />
        </div>
        <div className={styles.documentSection}>
          <span className={styles.documentLabel}>Experience</span>
          <div className={styles.documentEntry}>
            <span className={styles.documentEntryTitle} />
            <span className={styles.documentEntryDate} />
          </div>
          <span className={styles.documentLine} />
          <span className={styles.documentLineShort} />
          <div className={styles.documentEntry}>
            <span className={styles.documentEntryTitle} />
            <span className={styles.documentEntryDate} />
          </div>
          <span className={styles.documentLine} />
          <span className={styles.documentLineAccent} />
        </div>
        <div className={styles.documentSection}>
          <span className={styles.documentLabel}>Education & Skills</span>
          <span className={styles.documentLine} />
          <span className={styles.documentLineShort} />
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="landing-title">
        <Container>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>Career documents, with purpose</p>
              <h1 id="landing-title" className={styles.heroTitle}>
                Your career, clearly documented.
              </h1>
              <p className={styles.heroLead}>
                DossierBox turns your real career information into professional
                documents shaped for where you are going next.
              </p>
              <div className={styles.heroActions}>
                <Button variant="primary" size="lg" asChild>
                  <Link href={routes.signUp} aria-disabled="true">
                    Build your career profile
                  </Link>
                </Button>
                <Button variant="secondary" size="lg" asChild>
                  <Link href={routes.templates}>Explore document templates</Link>
                </Button>
              </div>
              <p className={styles.heroNote}>
                Account creation is coming soon. Explore the product direction
                while the foundation is being built.
              </p>
            </div>
            <DocumentPreview />
          </div>
        </Container>
      </section>

      <section className={styles.section} aria-labelledby="process-title">
        <Container>
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>One source, many documents</p>
            <h2 id="process-title" className={styles.sectionTitle}>
              Keep your profile reusable. Let the purpose do the shaping.
            </h2>
            <p className={styles.sectionLead}>
              DossierBox is built around a simple career-document loop: Profile,
              Purpose, Document, Preview, Share, PDF, Reuse.
            </p>
          </div>
          <ol className={styles.processList}>
            {processSteps.map((step) => (
              <li key={step.title} className={styles.processItem}>
                <h3 className={styles.cardTitle}>{step.title}</h3>
                <p className={styles.cardText}>{step.text}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section className={`${styles.section} ${styles.sectionMuted}`} aria-labelledby="families-title">
        <Container>
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>Document intelligence</p>
            <h2 id="families-title" className={styles.sectionTitle}>
              Choose the document that fits the destination.
            </h2>
            <p className={styles.sectionLead}>
              A CV and a résumé are not just different skins. Each document
              family follows a different structure, emphasis, and convention.
            </p>
          </div>
          <div className={styles.familyGrid}>
            {documentFamilies.map((family) => (
              <article key={family.name} className={styles.familyCard}>
                <h3 className={styles.familyName}>{family.name}</h3>
                <p className={styles.familyDescription}>{family.text}</p>
              </article>
            ))}
          </div>
          <div className={styles.distinction}>
            <div className={styles.distinctionItem}>
              <span className={styles.distinctionLabel}>Document family</span>
              <p className={styles.distinctionText}>
                Determines the document's structure and content conventions.
              </p>
            </div>
            <div className={styles.distinctionItem}>
              <span className={styles.distinctionLabel}>Template</span>
              <p className={styles.distinctionText}>
                Determines how that structured document is presented on the page.
              </p>
            </div>
          </div>
        </Container>
      </section>

      <section className={styles.section} aria-labelledby="principles-title">
        <Container>
          <div className={styles.principlesGrid}>
            <div className={styles.sectionHeader}>
              <p className={styles.eyebrow}>Built for trust</p>
              <h2 id="principles-title" className={styles.sectionTitle}>
                A document platform that respects the record behind the page.
              </h2>
              <p className={styles.sectionLead}>
                The best career document is credible before it is impressive.
                DossierBox keeps the source of truth close to the work.
              </p>
            </div>
            <div className={styles.principlesList}>
              {principles.map((principle) => (
                <article key={principle.title} className={styles.principle}>
                  <h3 className={styles.principleTitle}>{principle.title}</h3>
                  <p className={styles.principleText}>{principle.text}</p>
                </article>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className={styles.finalCta} aria-labelledby="final-cta-title">
        <Container>
          <div className={styles.finalCtaInner}>
            <div>
              <h2 id="final-cta-title" className={styles.finalTitle}>
                Make the next version of your career easier to carry.
              </h2>
              <p className={styles.finalText}>
                Start with a reusable record. Create the right document when the
                opportunity calls for it.
              </p>
            </div>
            <div className={styles.finalActions}>
              <Button variant="secondary" size="lg" className={styles.lightLink} asChild>
                <Link href={routes.howItWorks}>See how it works</Link>
              </Button>
              <Button variant="primary" size="lg" asChild>
                <Link href={routes.signUp} aria-disabled="true">
                  Get started
                </Link>
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
