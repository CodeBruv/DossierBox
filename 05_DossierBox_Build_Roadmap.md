# DossierBox — Build Roadmap

## 1. Purpose

This roadmap controls implementation of DossierBox.

The product is being built as a completely fresh application.

There is no legacy engine.

There is no Career Ledger migration.

There is no existing codebase that must be preserved.

The objective is to build the real MVP efficiently without allowing implementation sessions to drift into unrelated architecture or giant speculative rewrites.

---

# 2. Implementation Rule

Build in small sequential blocks.

Never attempt the entire product in one prompt.

Each Claude implementation prompt should have:

1. one clear objective
2. a defined scope
3. explicit files/domains to inspect
4. acceptance criteria
5. a verification step

Claude should inspect the current project before modifying it.

Claude should not assume that a feature exists simply because it is described in the roadmap.

Claude must verify the actual codebase.

---

# 3. Block Sequence

The implementation should progress approximately as follows.

## Block 1 — Foundation + Visual Product Shell

Objective:

Create the real DossierBox application foundation and professional visual identity.

Build:

- application shell
- global styling
- typography
- responsive layout
- navigation
- landing page
- templates section
- how-it-works page
- pricing page
- authentication entry points
- document-oriented visual language

The UI must already feel like a real career-document SaaS.

Do not create a generic admin dashboard.

The document should be visually prominent.

Acceptance:

A visitor can browse DossierBox and understand what the product does without signing in.

---

## Block 2 — Authentication + Account Foundation

Build:

- Google OAuth
- secure sessions
- logout
- protected routes
- account page
- user database record

Do not fake authentication.

Acceptance:

A real user can sign in with Google and access protected application areas.

---

## Block 3 — Career Profile

Build the reusable career profile.

Include:

- personal/contact information
- education
- work experience
- freelance work
- internships
- projects
- skills
- certifications
- licenses
- training
- awards
- achievements
- languages
- publications
- memberships
- portfolio links
- career objectives
- other relevant experience

Users must not be forced to have a university degree.

Certifications may be academic, professional, technical, trade, vocational or industry-based.

Acceptance:

A user can create and edit a reusable career profile.

---

## Block 4 — Document Intent

Build the purpose/intention system.

Users should explain what they need the document for.

Examples:

- job
- internship
- graduate role
- scholarship
- fellowship
- academic opportunity
- research
- international opportunity
- government/public sector
- professional role
- remote work
- specific company
- networking
- general professional profile

The system should use intent to influence document composition.

Acceptance:

A profile can be associated with a specific document purpose.

---

## Block 5 — Document Selection

Build document-family selection.

Initial families:

- Standard CV
- Professional Résumé
- International CV
- Career/Academic CV

Do not create dozens of templates.

The system must allow future document families to be added without redesigning the entire application.

Acceptance:

A user can select a document appropriate to their purpose.

---

## Block 6 — Template System

Implement the real template architecture.

Separate:

Template
from
Document Profile
from
Purpose/Destination
from
Writing Layer.

Implement the initial reference-based templates using the supplied reference documents.

Control:

- typography
- spacing
- page size
- margins
- section hierarchy
- density
- page breaks
- headers/footers
- visual hierarchy

Acceptance:

The templates look like professionally prepared career documents rather than web forms printed to PDF.

---

## Block 7 — Document Composition Engine

Connect:

profile
→ intent
→ document type
→ selected profile information
→ document structure
→ template

The engine must decide which profile information belongs in the selected document.

It must not blindly dump the entire profile into every document.

Acceptance:

The same profile can produce meaningfully different documents.

---

## Block 8 — Hidden Writing Layer

Integrate the AI writing system.

The AI must remain invisible to the user.

The user should experience:

better wording

not:

"AI generated this."

AI can:

- improve wording
- correct grammar
- create summaries/objectives from supplied facts
- expand supported descriptions
- condense verbose information
- create professional bullets
- adapt wording to purpose

AI cannot invent facts.

Acceptance:

AI-assisted writing is professional, conservative and traceable to user information.

---

## Block 9 — Free AI Provider + Fallback

Connect the selected free/no-cost AI provider through the provider abstraction.

Implement:

- request limits
- output limits
- timeout
- retries
- failure handling
- usage tracking
- deterministic fallback

If the AI fails, the user must still be able to produce a document.

Acceptance:

AI outage does not break document generation.

---

## Block 10 — Live Preview

Build the actual document preview.

The preview must reflect the document renderer rather than being a separate fake representation.

Support:

- page view
- pagination
- typography
- section hierarchy
- responsive editing experience

Acceptance:

The user can see the document before downloading it.

---

## Block 11 — PDF Generation

Implement server-side PDF rendering.

Support:

- A4
- US Letter
- deliberate page breaks
- multi-page documents
- long sections
- long names
- long URLs
- international characters
- correct margins
- consistent typography

Acceptance:

Generated PDF matches the preview and looks professionally typeset.

---

## Block 12 — Document Versions

Implement:

- document records
- versions
- regeneration
- previous versions
- document naming
- deletion

Updating the profile must not silently destroy existing document versions.

Acceptance:

A user can create multiple versions of a document from changing profile information.

---

## Block 13 — Live Sharing

Implement:

- share link creation
- public read-only preview
- share revocation
- token regeneration

Public visitors must not gain access to the user's account or profile.

Acceptance:

A user can share a document preview safely.

---

## Block 14 — Plans + Entitlements

Implement:

Free
Starter
Pro

Use configuration-driven plans.

Do not scatter plan names throughout the application.

Free must be genuinely useful.

Starter should support multiple related documents.

Pro should unlock advanced tailoring and document capabilities.

Acceptance:

Entitlements are enforced server-side.

---

## Block 15 — Payments

Integrate:

- Stripe
- Paystack

Payment logic must be provider-independent.

Implement:

- checkout
- verified webhooks
- subscription creation
- renewal
- expiration
- entitlement updates

Acceptance:

A real successful payment changes entitlement only after verified server confirmation.

---

## Block 16 — Currency

Implement browser/locale-aware pricing presentation.

The UI should be capable of showing appropriate local currency.

The server remains authoritative for actual payment currency and price.

Pricing values must come from configuration.

Acceptance:

The UI does not assume every visitor uses USD.

---

## Block 17 — Existing Document Upload

Implement private uploads for existing CVs/resumes/career documents.

Initial purpose:

information extraction.

Extract useful career information into the profile.

Do not automatically rewrite the uploaded document.

Acceptance:

A user can upload an existing career document and review extracted information before adding it to their profile.

---

## Block 18 — Analytics

Implement privacy-conscious product analytics.

Track:

- acquisition entry
- signup
- onboarding
- profile completion
- document creation
- generation success/failure
- preview
- download
- sharing
- pricing interaction
- checkout
- payment
- subscription expiration

Do not track private document content.

Acceptance:

The founder can understand where users enter, abandon and convert.

---

## Block 19 — Security Hardening

Review:

- authentication
- authorization
- file access
- share tokens
- API endpoints
- rate limits
- environment variables
- server/client boundaries
- error messages
- logging

Perform cross-user access testing.

Acceptance:

User A cannot access User B's private information.

---

## Block 20 — Production Deployment

Deploy the MVP using free-tier production infrastructure.

Expected architecture:

Next.js application
+
managed PostgreSQL
+
private object storage
+
Google OAuth
+
analytics
+
Stripe/Paystack

Configure:

- production environment variables
- database migrations
- domain
- HTTPS
- OAuth callback
- payment webhooks
- storage
- analytics

Acceptance:

A new user can complete the entire journey in production.

---

# 4. Claude Prompting Discipline

Claude should receive implementation work sequentially.

Do not send the entire roadmap as an implementation request.

The roadmap is context.

Each prompt should activate only the next relevant block.

Example:

"Implement Block 3: Career Profile.

First inspect the current project structure and existing database/auth implementation.

Build only the reusable career profile domain described in the project specification.

Do not implement payments, AI, PDF rendering or sharing in this block.

Verify the implementation before reporting."

This style prevents scope explosion.

---

# 5. What Claude Must Do Before Coding

For each block:

1. inspect relevant files
2. understand current implementation
3. identify dependencies
4. state the intended small change
5. implement
6. test
7. report changed files
8. report verification results
9. stop

Claude should not continue automatically into unrelated blocks.

---

# 6. What Claude Must Not Do

Do not:

- rewrite the entire application
- create speculative microservices
- introduce unnecessary dependencies
- replace working systems without reason
- build future features early
- invent document types
- invent pricing
- invent payment behavior
- create fake integrations
- create placeholder AI behavior and call it complete
- silently change product requirements
- rename DossierBox
- change the target market
- turn the product into a generic CV builder
- make AI the visible product
- build a chatbot
- use Nigerian conventions as the global default
- hard-code pricing
- hard-code currency
- remove PDF output
- replace the reusable profile with one-off forms

---

# 7. Verification Standard

A block is not complete because files were created.

At minimum, Claude should run appropriate:

- type checking
- linting
- unit tests where applicable
- integration tests where applicable
- build verification where possible

For UI work, the founder must visually inspect the result.

For production integrations, the actual integration must be tested.

Never claim production readiness based only on TypeScript compilation.

---

# 8. MVP Completion Test

The MVP is complete only when this journey works:

Visitor
→ landing page
→ browse
→ Google signup
→ profile
→ choose purpose
→ choose document
→ compose
→ writing assistance
→ live preview
→ share
→ PDF
→ download
→ return later
→ reuse profile
→ create another document

The final product must feel like a complete SaaS rather than a collection of technical demonstrations.

---

# 9. Product Priority

When deciding what to build first, prioritize:

1. User value
2. Document quality
3. Profile reuse
4. Professional UI
5. Reliable generation
6. Security
7. Retention
8. Monetization
9. Analytics
10. Future extensibility

Do not sacrifice the core document experience merely to add more features.

---

# 10. Definition of Done

A feature is done when:

- it satisfies the product specification
- it works end-to-end
- it is integrated into the actual user journey
- it has appropriate validation
- it does not weaken security
- it does not break existing functionality
- it has been tested
- the UI is consistent with DossierBox
- it does not introduce unnecessary technical debt

DossierBox should be built as a serious global SaaS from the beginning, even though the initial release deliberately limits the number of document families and paid features.