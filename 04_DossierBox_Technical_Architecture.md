# DossierBox — Technical Architecture

## 1. Purpose

DossierBox is a production SaaS application, not a prototype, local-only tool, or demo.

This document defines the technical architecture that supports the product specification, document engine, and AI writing system.

The architecture must remain simple enough for a solo developer to operate while providing a clean path to scale.

The application is being built as a completely new project.

There is no existing application or engine that must be preserved.

---

## 2. Architectural Principle

The application should be organized around clear domain boundaries.

Core domains:

1. Authentication
2. Users
3. Career Profiles
4. Document Composition
5. Templates
6. AI Writing
7. PDF Rendering
8. Document Versions
9. Live Sharing
10. Subscriptions
11. Payments
12. Analytics
13. File Uploads
14. Security/Audit

Do not create unnecessary microservices.

The MVP should be a well-structured full-stack application with modular server-side domains.

A modular monolith is preferred initially.

The architecture should allow individual components to be extracted later if scale requires it.

---

## 3. Recommended Stack

Use technologies that are stable, well-supported, inexpensive and appropriate for a modern TypeScript SaaS.

Preferred direction:

- Next.js
- TypeScript
- React
- PostgreSQL
- ORM such as Drizzle ORM or Prisma
- Tailwind CSS or a similarly maintainable styling system
- Server Components where appropriate
- Server Actions/API routes for mutations
- Zod or equivalent server-side validation
- Server-side PDF generation
- Object storage for private uploaded/generated files
- OAuth authentication with Google
- Stripe
- Paystack
- Privacy-conscious analytics

Do not introduce a dependency simply because it is fashionable.

Every dependency should have a clear purpose.

---

## 4. Application Structure

Organize the code by domain rather than allowing business logic to spread across pages.

A suitable conceptual structure:

app/
  marketing/
  auth/
  dashboard/
  profile/
  documents/
  templates/
  sharing/
  pricing/
  api/

src/
  auth/
  users/
  profile/
  documents/
  templates/
  composition/
  ai/
  pdf/
  sharing/
  billing/
  analytics/
  uploads/
  security/
  database/
  validation/
  configuration/

The exact directory structure may differ, but the domain separation must remain.

UI components should not contain privileged business logic.

---

## 5. Server vs Browser

Sensitive logic belongs on the server.

The browser may handle:

- interface rendering
- form interaction
- previews
- non-sensitive client state
- UX validation
- navigation

The server must handle:

- authentication
- authorization
- database access
- profile mutations
- document composition
- AI calls
- PDF generation
- subscription checks
- payment verification
- file access
- share-token validation
- analytics ingestion where appropriate
- rate limiting
- security logging

Never place secrets in client code.

Never send provider credentials to the browser.

Never trust browser-submitted entitlement information.

---

## 6. Database

Use PostgreSQL as the primary production database.

Use a managed free-tier PostgreSQL provider for the initial launch.

The schema should be relational.

Core entities should include at minimum:

### users

Identity and account information.

### auth_accounts

OAuth provider identities.

### sessions

Authenticated sessions where applicable.

### profiles

The user's reusable career profile.

### profile_items

Flexible career information where appropriate.

Or use dedicated relational tables for major domains.

### education

Education records.

### experience

Employment, freelance, internship and other experience.

### skills

Technical, professional and soft skills.

### certifications

Professional, trade, technical, academic and other credentials.

### projects

Projects and portfolio work.

### achievements

Awards and achievements.

### languages

Language information.

### publications

Publications where relevant.

### documents

Logical user-created documents.

### document_versions

Immutable/generated document versions.

### templates

Registered visual templates.

### document_profiles

Rules describing document structures.

### generation_jobs

Document generation operations.

### shared_documents

Live sharing records and tokens.

### subscriptions

Subscription state.

### entitlements

Current capabilities.

### payments

Payment/provider records.

### usage_records

Usage limits and metering.

### uploads

Uploaded source files.

### analytics_events

Product events.

### audit_events

Security and important account events.

Do not store the entire career profile as one opaque JSON object.

JSON/JSONB may be used for flexible configuration where appropriate.

---

## 7. Profile as Source of Truth

The career profile is the authoritative user data.

Generated documents are derived artifacts.

A document must never become the only copy of the user's career information.

When the user edits their profile:

- existing document versions remain intact
- new documents can be generated from the updated profile
- previous versions remain reproducible

Never silently overwrite historical documents.

---

## 8. Document Model

A document should conceptually contain:

- owner
- document type
- purpose
- destination/context
- selected profile information
- writing configuration
- template
- status
- versions
- sharing state
- timestamps

A document version should preserve enough information to reproduce its output.

The system must distinguish:

Profile data
→ document composition
→ document version
→ rendered PDF

Do not merge these concepts.

---

## 9. Template Registry

Templates must be configuration-driven.

A template should define things such as:

- page size
- margins
- fonts
- font sizes
- line heights
- spacing
- section styles
- heading styles
- bullet styles
- header/footer
- page numbering
- density
- column behavior
- page-break rules

A template must not contain a user's personal information.

Adding a new template should not require rewriting the document engine.

---

## 10. PDF Pipeline

PDF is the canonical document output.

Preferred pipeline:

profile
→ intent
→ document specification
→ selected profile data
→ writing layer
→ validated document model
→ template renderer
→ pagination
→ PDF
→ stored/private artifact

Do not rely on browser print as the canonical PDF.

The PDF renderer must operate server-side.

The same document model should drive:

- live preview
- final PDF

This prevents preview/PDF divergence.

---

## 11. Live Preview

The user should see the actual document composition while editing.

The preview should reflect:

- selected template
- page size
- typography
- section ordering
- pagination
- content density

Do not create a fake dashboard preview that differs significantly from the PDF.

The document itself is the hero.

---

## 12. Live Sharing

Each shareable document receives a cryptographically random token.

The token must not expose:

- user ID
- document ID
- database sequence
- account information

Public sharing should expose only the intentionally shared document.

The share page must be read-only.

The owner must be able to:

- enable sharing
- disable sharing
- regenerate the share token

Future support for expiration should be possible.

---

## 13. File Uploads

Users may upload existing career documents.

The upload system must:

- authenticate the user
- validate file type
- validate size
- reject suspicious files
- store files privately
- associate files with the correct user
- process them server-side
- avoid exposing storage credentials

Uploaded documents are initially used for information extraction.

They do not automatically become rewritten documents.

---

## 14. Authentication

Google OAuth is required.

Use a proper production authentication implementation.

Required properties:

- secure OAuth flow
- secure sessions
- HTTP-only cookies
- Secure cookies in production
- appropriate SameSite policy
- logout
- account deletion
- session expiry
- server-side authorization

Do not implement fake authentication.

Do not ship development authentication shortcuts.

---

## 15. Authorization

Every protected mutation must verify:

1. authentication
2. ownership
3. entitlement

Never trust:

- hidden UI
- disabled buttons
- URL IDs
- client-side plan checks

Examples:

A user requesting `/documents/123` must not receive another user's document merely because they know the ID.

Ownership checks must happen server-side.

---

## 16. Security

Security is a product requirement.

Never expose:

- database credentials
- API keys
- OAuth secrets
- payment secrets
- AI provider keys
- storage credentials
- webhook secrets
- environment variables
- internal prompts
- privileged decision rules

Use environment variables for secrets.

Provide `.env.example` with variable names only.

Never commit real credentials.

---

## 17. API Security

Every server endpoint must validate:

- authentication where required
- authorization
- input schema
- ownership
- entitlement
- request limits

Do not accept arbitrary database fields from clients.

Use explicit input schemas.

Return safe errors.

Never expose raw database errors.

---

## 18. Rate Limiting

Rate limiting must exist for abuse-sensitive operations.

Initial targets:

- authentication
- AI requests
- document generation
- file uploads
- share-link operations
- public share access
- payment endpoints

Limits must be configuration-driven.

The initial deployment may use free platform capabilities.

The architecture must allow migration to Redis/KV or equivalent distributed rate limiting later.

---

## 19. AI Isolation

AI calls occur server-side.

The browser never receives:

- provider credentials
- system prompts
- private AI configuration
- internal scoring logic

The AI layer should expose a small application-level interface such as:

generateWriting(context)

The rest of the application should not depend directly on a specific model SDK.

---

## 20. AI Failure

AI must never be a single point of failure.

If the AI provider fails:

1. retain the user's information
2. record the failure server-side
3. fall back to deterministic composition
4. allow the document to continue where possible

The user should not lose work.

The application should never require AI for basic document generation.

---

## 21. Payments

Payment providers are external integrations.

Initial providers:

- Stripe
- Paystack

Provider logic must be isolated.

The browser can start checkout.

The server determines the final amount and entitlement.

Payment activation happens only after verified server-side webhook confirmation.

Never activate subscriptions solely from frontend success callbacks.

---

## 22. Pricing

Pricing must be configuration-driven.

Do not write:

if plan === "pro" then price = 29.99

throughout the codebase.

Plans should have:

- identifier
- display name
- features
- limits
- pricing configuration
- supported currencies
- entitlement rules

Final prices will be configured before launch.

---

## 23. Currency

The UI may detect likely currency using:

- browser locale
- region
- supported market configuration

Examples:

US → USD
UK → GBP
EU → EUR
Canada → CAD
Australia → AUD
Nigeria → NGN

This is presentation logic.

The server remains authoritative for actual checkout currency and price.

Never trust a client-submitted currency or amount.

---

## 24. Subscription Expiration

When a subscription expires:

- account remains active
- profile remains available
- previous documents remain available
- previous versions remain available
- existing PDFs remain accessible
- share links remain subject to their configured state

Only restricted creation operations are blocked.

Do not delete user work because a subscription expired.

---

## 25. Analytics

Use privacy-conscious product analytics.

Useful events:

- landing_viewed
- template_viewed
- signup_started
- signup_completed
- onboarding_started
- profile_completed
- document_started
- document_generated
- document_generation_failed
- preview_viewed
- pdf_downloaded
- share_created
- share_viewed
- upgrade_viewed
- checkout_started
- payment_completed
- subscription_expired

Do not track private document contents as analytics.

Analytics should help answer product questions rather than create vanity dashboards.

---

## 26. Audit Logging

Security-sensitive events should be logged server-side.

Examples:

- login
- logout
- failed authentication
- account deletion
- document creation
- document deletion
- share enabled
- share disabled
- payment webhook
- subscription change

Never log:

- passwords
- OAuth tokens
- API keys
- full payment credentials
- complete document contents

---

## 27. Error Handling

User-facing errors must be simple.

Example:

"We couldn't generate your document right now. Your information is safe. Please try again."

Technical details belong in server logs.

Never expose:

- stack traces
- SQL errors
- filesystem paths
- provider credentials
- internal architecture
- database IDs where unnecessary

---

## 28. Deployment

The initial production deployment should use free-tier infrastructure.

Preferred direction:

Application:
Vercel or an equivalent free-tier Next.js platform.

Database:
Managed PostgreSQL free tier.

Storage:
Private free-tier object storage where practical.

Authentication:
Production OAuth-compatible provider.

Analytics:
Free-tier privacy-conscious analytics.

Payments:
Stripe and Paystack.

Do not require paid infrastructure to launch.

However, avoid architectural decisions that make migration difficult later.

---

## 29. Environment Separation

Maintain:

- development
- preview/staging
- production

Do not use development credentials in production.

Do not use test payment state in production.

Do not use mock users as production data.

---

## 30. Performance

Prefer:

- server rendering
- small client components
- efficient database queries
- lazy loading
- caching where appropriate
- optimized assets
- efficient PDF rendering

Avoid turning the entire application into a client-side SPA.

---

## 31. Testing

Important tests include:

Authentication:
- Google login
- logout
- protected routes

Authorization:
- cross-user access blocked
- cross-user modification blocked

Documents:
- profile → document
- document → preview
- document → PDF
- version preservation

Sharing:
- share creation
- share viewing
- share revocation

Subscriptions:
- free limits
- starter limits
- pro limits
- expiration

AI:
- success
- timeout
- provider failure
- malformed response
- unsupported output
- fabricated content detection

Uploads:
- valid file
- invalid type
- oversized file
- unauthorized file access

---

## 32. Production Standard

Do not call DossierBox production-ready merely because:

tsc passes

or:

eslint passes.

Production readiness requires the complete critical journey to work:

signup
→ profile
→ intent
→ document
→ AI assistance
→ preview
→ share
→ PDF
→ download
→ return
→ second document

The product must behave like a real SaaS from the first public release.