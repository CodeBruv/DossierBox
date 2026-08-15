# DossierBox — Product Specification

Version: MVP Foundation
Status: Source of Truth

---

## 1. Product Identity

Product name: DossierBox

DossierBox is a global career-document platform.

It helps people turn their real career information into professional documents suited to a specific purpose.

DossierBox is NOT:

- a generic CV builder
- an "AI CV generator"
- a chatbot
- a Nigerian-only career tool
- a collection of disconnected document templates

The core product value is:

> DossierBox understands what the user has done, what they are trying to accomplish, and what document is appropriate for that purpose.

The user's career profile is the source of truth.

Documents are derived from the profile.

---

## 2. Target Market

DossierBox is global from day one.

Primary early commercial focus:

- United States
- United Kingdom
- Canada
- Australia
- Western Europe
- other high-value English-speaking and international markets

The product must not be designed around Nigerian conventions.

Nigeria and Africa should be supported where appropriate, but they are not the default product assumption.

Do not assume that the user:

- has a university degree
- is a software developer
- is applying for a job
- lives in a particular country
- follows one country's CV conventions

---

## 3. Core Product Loop

The central product loop is:

Profile
→ Purpose
→ Document
→ Preview
→ Share
→ PDF
→ Reuse

The long-term retention mechanism is the reusable career profile.

A user should become increasingly valuable to DossierBox because their profile becomes richer and future documents require less repeated work.

---

## 4. Primary User Journey

A new user should be able to:

1. Visit DossierBox without authentication.
2. Understand the product.
3. Browse document types and examples.
4. View pricing.
5. Create an account when ready to create/save meaningful career information.
6. Authenticate with Google.
7. Create a reusable career profile.
8. Add career information.
9. Choose why they need a document.
10. Choose an appropriate document family.
11. Provide destination/context when relevant.
12. Have the system select relevant profile information.
13. Receive controlled writing assistance.
14. Review a professional live document.
15. Share the live preview.
16. Download the final PDF.
17. Return later.
18. Reuse the same profile to create another document.

The product must not reduce this to:

> Fill form → Generate CV.

---

## 5. Career Profile

The profile is the user's reusable source of truth.

It should support:

- personal information
- contact information
- education
- employment
- freelance work
- internships
- volunteering
- projects
- technical skills
- professional skills
- soft skills
- certifications
- licenses
- training
- courses
- awards
- achievements
- publications
- memberships
- languages
- portfolio links
- professional links
- career objectives
- additional experience
- other relevant career information

The model must be extensible.

Do not force users into fields that do not apply to them.

---

## 6. Certifications

"Certification" must not mean academic certificate only.

Users may have:

- professional certifications
- trade certifications
- technical certifications
- vocational qualifications
- software certifications
- industry credentials
- training certificates
- workshop certificates
- licenses
- course completion certificates

The system must not assume a university degree.

---

## 7. User Intent

The system must understand why the user needs a document.

Possible purposes include:

- job application
- internship
- graduate opportunity
- scholarship
- fellowship
- academic opportunity
- research opportunity
- international opportunity
- government/public-sector opportunity
- professional application
- remote work
- application to a specific company
- networking
- professional introduction
- general career profile

Purpose influences document structure and content selection.

---

## 8. Document Families

The MVP should contain a small number of strong document families.

Initial families:

### Standard CV

General-purpose professional CV.

### Professional Résumé

Compact, achievement-oriented résumé primarily for competitive professional applications.

### International CV

A globally oriented CV structure suitable for cross-border applications where a fuller professional history is useful.

### Career / Academic CV

Suitable for academic, scholarship, fellowship, research, education and similar contexts.

These are document families, not merely visual skins.

---

## 9. Future Document Families

The architecture must support future additions without rebuilding the application.

Potential future families:

- executive résumé
- public-sector résumé
- research CV
- fellowship application document
- scholarship document
- internship résumé
- graduate résumé
- industry-specific résumé
- portfolio résumé
- professional profile
- cover letter
- motivational letter
- recommendation-related documents
- other purpose-specific career documents

These are future extensions.

Do not bloat the MVP merely to increase the number of templates.

---

## 10. Document Intelligence

The system should determine:

- what the user needs
- what information is relevant
- which document family is appropriate
- which sections are required
- what information should be emphasized
- how the document should be structured
- what destination conventions matter

The user remains in control.

The system should adapt around user choice rather than force users into a generic structure.

---

## 11. Templates

Templates control visual presentation.

They include:

- typography
- font family
- font sizes
- margins
- spacing
- section hierarchy
- page dimensions
- headers
- footers
- rules
- alignment
- page numbering
- density
- visual hierarchy
- page-break behavior

Templates must remain separate from document intelligence.

---

## 12. PDF

PDF is the official document output.

Users can:

- generate
- preview
- share
- download

The canonical PDF must be generated server-side.

Do not rely on the browser print dialog as the official generation mechanism.

---

## 13. Live Preview

Users should see a professional live representation of the actual document.

The preview should reflect the final document as closely as possible.

The document itself should remain the visual hero.

---

## 14. Live Sharing

Generated documents must support shareable live previews.

The owner can:

- enable sharing
- disable sharing
- revoke/regenerate sharing
- continue downloading the PDF

Recipients must only see the document intentionally shared.

Recipients must not gain access to:

- the owner's dashboard
- profile database
- private documents
- editing controls
- internal identifiers
- unrelated metadata

---

## 15. Existing Document Upload

Users may upload existing career documents.

The initial purpose is information extraction.

Potential extracted information:

- contact details
- education
- employment
- skills
- certifications
- projects
- dates
- achievements
- professional history

Extracted information becomes editable profile information.

Uploading a document does NOT automatically mean rewriting that document.

Document rewriting can be a future or premium capability.

---

## 16. Plans

The product supports:

### Free

One useful basic document.

The free tier must provide real value.

It must not be intentionally crippled into a useless demonstration.

### Starter

More than one document and intelligently paired documents from the same profile.

Examples may include:

- CV + cover letter
- résumé + cover letter

The exact pairing model remains configurable.

### Pro

Advanced document generation and tailoring.

Examples:

- job-specific documents
- destination-specific documents
- specialized document types
- advanced adaptation
- advanced writing assistance
- additional document combinations

Plans and entitlements must be configurable.

---

## 17. Subscription Expiration

When a paid subscription expires:

- account remains accessible
- profile remains accessible
- existing documents remain accessible
- previous versions remain accessible
- existing PDFs remain accessible
- existing previews remain accessible where appropriate

Expiration should primarily restrict creation of new premium features/documents.

Never delete user work because a subscription expired.

---

## 18. Pricing

Pricing must be configuration-driven.

Do not hard-code prices into UI components.

Pricing will be finalized separately before launch.

The application must support different plans without requiring UI rewrites.

---

## 19. Currency

Pricing should support browser/locale-aware presentation.

Potential currencies include:

- USD
- GBP
- EUR
- CAD
- AUD
- NGN
- other supported currencies

Do not permanently hard-code a single currency.

The server remains authoritative for actual prices and payment currency.

---

## 20. Payments

Primary providers:

- Stripe for international markets
- Paystack for African markets

Payment architecture must be provider-agnostic.

Additional providers may be added when market coverage requires them.

Never trust payment status supplied by the browser.

Paid entitlements must be activated from verified server-side payment events.

---

## 21. Authentication

Google authentication is required.

Users can browse without an account.

Account creation is required when users begin creating/saving meaningful career information.

Use real production OAuth.

Do not fake Google authentication.

---

## 22. Global Positioning

The product language should be internationally understandable.

Do not use Nigerian-specific terminology as default product vocabulary.

Do not market the product as a Nigerian CV solution.

Do not create country-specific functionality solely because the founder has personal experience with it.

---

## 23. UX Philosophy

DossierBox should feel:

- professional
- restrained
- trustworthy
- premium
- document-focused
- clear
- fast

Avoid:

- chatbot aesthetics
- excessive gradients
- childish illustrations
- fake metrics
- unnecessary animation
- AI clichés
- generic dashboard noise

The user should feel they are creating an important professional document.

---

## 24. Retention

The primary retention mechanism is the reusable profile.

The user should not have to repeatedly rebuild their career history.

A richer profile should make subsequent documents easier to create.

The product should encourage:

Profile
→ multiple purposes
→ multiple documents
→ document versions
→ ongoing updates

without forcing unnecessary repetition.

---

## 25. Product Quality

MVP means limited scope, not low quality.

The MVP must be:

- functional
- professional
- secure
- visually credible
- globally usable
- architecturally extensible
- commercially usable

Do not ship a fake demo disguised as an MVP.

---

## 26. Locked Principles

The following are locked:

- DossierBox name
- clean-slate project
- global audience
- Tier-1 commercial focus
- reusable profile
- user purpose
- adaptive document selection
- professional document families
- hidden AI
- factual AI boundaries
- PDF output
- live preview
- live sharing
- Google authentication
- Free / Starter / Pro
- configuration-driven pricing
- browser/locale currency presentation
- subscription preservation
- professional typography
- intentional pagination
- scalable architecture
- secure server-side operations
- extensible templates

Do not change these silently.