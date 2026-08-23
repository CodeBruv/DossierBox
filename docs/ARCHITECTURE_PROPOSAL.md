# DossierBox — Architecture Review and Pre-Implementation Proposal

**Status:** design checkpoint. No application code was modified to produce this document.
**Date:** 2026-08-22
**Scope:** answers sections A–K of the Product Architecture Reset specification.

---

## 0. Before anything else — three disclosures

### 0.1 The freeze arrived mid-edit; the tree has been restored

When the instruction to stop implementation arrived, I was partway through the previous task (making the three document styles materially distinct). Two files were left in a non-compiling state: `src/documents/presentation.ts` had been rewritten with new template ids and a typed variable union, and `src/documents/composition.ts` had `ComposedEntry.meta` split into `period` + `qualifiers` in the type but updated in only one of eight entry builders.

Both files are **untracked**, so `git checkout` could not restore them. I recovered byte-exact pre-edit copies from Turbopack's own source maps under `.next/**` (which embed `sourcesContent`), diffed the recovered `composition.ts` against the working copy to confirm the only differences were my two edits, and copied both back. `md5sum` matches the recovered originals: `aa7a66039bea508ef7e0c1ea3c1af949` for `presentation.ts`, `868730838c72edcad80497066eb0ca79` for `composition.ts`. `src/documents/components/document-preview.tsx` was verified identical and was never edited.

`npx tsc --noEmit` now emits no diagnostics. Nothing is committed. The tree is in the state it was in before that task began.

One caveat on that verification, stated plainly because it matters: the command I ran piped through `tail`, so the exit code printed was `tail`'s, not `tsc`'s. The evidence is the empty diagnostic output, not the `0`.

### 0.2 Two claims are already on the public site that the product cannot honour

`app/layout.tsx` (metadata and Open Graph description) and `app/page.tsx` both tell visitors they can "preview, share, and download a polished PDF." Neither sharing nor PDF download exists — there is no PDF dependency, no export route, no share token, no `window.print` call. `app/how-it-works/page.tsx` is a placeholder stub that says the same thing.

This is not a code defect, but it is a product-integrity defect and it is the kind of thing the roadmap below has to close early rather than late. Phase 3 exists partly for this reason.

### 0.3 What the reset changes about previously locked decisions

`CLAUDE.md` and the project instructions contain a list headed "locked requirements." The reset does not contradict most of it — PDF-canonical output, hidden AI, evidence-bound generation, configuration-driven pricing, locale-aware currency, server-enforced entitlements, and the reusable-dossier model all survive intact. Two things genuinely move:

| Previously locked | Reset direction | How this proposal reconciles them |
| --- | --- | --- |
| "Do not create dozens of templates during the MVP… a small number of strong document families" | "Support an extensible collection of industry-accepted document styles" | Extensible *architecture*, deliberately small *seeded library*. Section E proposes seven styles across three categories — enough to prove the abstraction across categories, small enough that each is real work done properly. |
| Four document families (Standard CV, Professional Résumé, International CV, Career/Academic CV); cover letters and statements listed as *future extensions* | Letters, motivation letters, statements of purpose, personal statements, research statements, packages | Document *kind* becomes catalogue data rather than a Postgres enum, and a second structural kind (prose/letter) is introduced. Section D and Phase 2. |

I am treating the reset as the current direction and flagging these two so the change is a decision rather than a drift.

---

## A. Current architecture, as built

### A.1 Stack

Next.js 16.3.1 (App Router, Turbopack) on React 19.1.0, TypeScript 5.9 in strict mode, deployed to Vercel as serverless functions. Nine runtime dependencies: `next`, `react`, `react-dom`, `next-auth` v5 beta, `@auth/drizzle-adapter`, `drizzle-orm`, `postgres`, `argon2`, `zod`. Six dev dependencies. No CSS framework — CSS Modules over CSS custom-property design tokens. No UI library, no state library, no form library.

That dependency list is an asset and should be defended. Most of what follows can be built without adding to it, and the exceptions are named explicitly in Section K.

### A.2 Layering, as it actually is

```
app/                      routes; every page does its own auth guard (no middleware)
├─ (marketing)            /, /templates*, /how-it-works*, /pricing*, /contact, /terms, /privacy
├─ auth/                  /auth/sign-in, /auth/sign-up (funnels to sign-in)
├─ api/auth/[...nextauth] the only route handler in the app
├─ profile/               dossier CRUD: hub, basics, sections, review, [section]/{new,[itemId]/edit}
├─ documents/             list, new (type picker), [documentId] (workspace)
└─ account/               session length, provider, password state
                                   * = placeholder stub

src/
├─ auth/        auth.ts · session.ts · database.ts (the Drizzle client) · schema.ts
│               password.ts · tokens.ts · rate-limit.ts · validation.ts (unreachable — see A.6)
├─ profile/     dossier.ts (snapshot contract) · sections.ts (field definitions)
│               types.ts · repository.ts · actions.ts · authorization.ts · ownership.ts
├─ documents/   schema.ts · repository.ts · actions.ts
│               composition.ts (pure) · presentation.ts (pure) · components/
├─ config/      paths.ts (nav, routes, footer groups)
└─ ui/          Button, Container, NavMenu, SiteHeader, SiteFooter, SkipLink, AuthEntry, ThemeProvider

styles/         tokens.css · base.css · typography.css · utilities.css · print.css
                pages/*.module.css · ui/*.module.css
scripts/        db-security.mjs · contrast-audit.mjs · measure-routes.mjs
db/security/    harden-public-schema.sql
drizzle/        0000 auth · 0001 profile · 0002 credentials · 0003 documents · 0004 document config
```

### A.3 The document chain — the part worth keeping

Three layers, cleanly separated, and this separation is the most valuable thing in the repository:

```
dossier snapshot          src/profile/dossier.ts + repository.ts
      ↓                   pure data; no document concepts leak in
composition               src/documents/composition.ts
      ↓                   composeDocument(type, snapshot, { hiddenSections }) → ComposedDocument
presentation              src/documents/presentation.ts + components/document-preview.tsx
                          resolveTemplate(value, type) → DocumentTemplate → CSS custom properties
```

`composition.ts` is pure, takes no database, and is unit-testable in isolation. `presentation.ts` holds no career information and cannot add, remove, or reorder a section. `document-preview.tsx` renders `ComposedDocument` + `DocumentTemplate` and nothing else. That is the right shape and Section C keeps it.

The template mechanism deserves a specific note because it is unusually economical: global rules in `styles/typography.css` read `var(--doc-*, <fallback>)`, and a template sets `--doc-*` inline on the sheet element. Custom properties inherit, including into print, so a new template requires no new CSS rule, no CSS-Module specificity fight, and no per-template rule duplication. Section numbering is a CSS `counter`, so hiding a section renumbers the rest automatically.

### A.4 Data model, as built

Five migrations, 20 tables:

- **Auth.js core** (0000): `users`, `accounts`, `sessions`, `verificationTokens`.
- **Dossier** (0001): `profiles` (unique on `userId`), `profileSections`, and ten content tables — `profileExperiences`, `profileEducation`, `profileSkills`, `profileLanguages`, `profileCredentials`, `profileAchievements`, `profileProjects`, `profilePublications`, `profileMemberships`, `profileLinks`. All cascade from `profiles`; achievements can reference an experience or project with `ON DELETE set null`.
- **Credentials** (0002): `auth_credentials`, `auth_tokens`, `auth_rate_limits`.
- **Documents** (0003, 0004): `documents` — `id`, `userId`, `type` (pg enum, three values), `title`, `status` (pg enum, one value: `draft`), `template` (text, default `classic`), `hiddenSections` (jsonb, stores *exclusions*), timestamps, index on `(userId, updatedAt)`.

`documents` stores what the user *decided* and none of what the document *says*. Every fact is read from the dossier at render time. That is correct for a live preview and Section D preserves it while adding what versioning needs.

### A.5 Security posture, as built

Working today: Google-only OAuth with the Drizzle adapter; ownership enforced inside the `WHERE` clause of every read and write (`updateDocumentConfiguration` and `getOwnedDocument` both take `userId` and `id` together, so a foreign id and a nonexistent id are indistinguishable and no mutation window exists); mass-assignment defence by construction (`DocumentConfigurationPatch` omits `type`, `userId`, and timestamps, so no extra form key can reach them); `server-only` on the database module and repositories; secrets read server-side with missing-variable diagnostics that name variables and never values; opaque tokens stored only as SHA-256 digests; Argon2id at OWASP's minimum profile; a DB-backed fixed-window rate limiter whose identifiers are HMAC'd rather than stored raw; open-redirect protection on `callbackUrl`; error messages mapped from a fixed allow-list rather than echoed from the query string.

Not working today, and this is the single most important operational fact in this document: **Row Level Security has not been applied to the Supabase `public` schema.** `db/security/harden-public-schema.sql` is written, idempotent, transaction-wrapped, and correct — it enables RLS with zero policies (deny by default), then revokes all privileges from `anon` and `authenticated` including default privileges. It has not been run, because `scripts/db-security.mjs` correctly refuses the pooled connection and the direct host is unreachable from the host machine. Until it runs, `sessions.sessionToken`, `accounts.refresh_token` / `access_token` / `id_token`, `users.email`, `auth_credentials.passwordHash`, `auth_tokens.tokenHash`, and every `documents` and `profile*` row are reachable through Supabase's anonymous REST surface. Section K Phase 0 and Section H.9 address this; the recommended remedy is in **Section L**.

Also absent: `middleware.ts` (deliberately — the Drizzle adapter pulls `postgres`, which needs TCP sockets the Edge runtime does not have; documented at `src/auth/auth.ts:64-75`), any cookie configuration (framework defaults only), MFA, account deletion, and audit logging.

### A.6 Things that exist but are not wired up

Worth stating explicitly so the roadmap does not double-build them or assume them:

- **The credentials stack is unreachable dead code.** `password.ts`, `tokens.ts`, `rate-limit.ts`, and `src/auth/validation.ts` have no production importers — their only consumers are tests. The three tables from migration 0002 are never read or written. `app/account/page.tsx` says so honestly ("None stored by DossierBox"). This is well-built code with no caller; Section H.3 proposes where it earns its place.
- **`src/auth/rate-limit.ts` reads `NEXTAUTH_SECRET` only**, while `auth.ts` accepts either `AUTH_SECRET` or `NEXTAUTH_SECRET`. A deployment configured purely on the v5 name would throw `"Authentication secret is not configured."` the first time the limiter is used. It happens to work locally because `.env.local` uses the v4 names. This is a latent production fault, currently masked by the fact that nothing calls the limiter.
- **`.env.example` already reserves 24 names**, including `AI_PROVIDER_KEY`, `STRIPE_SECRET_KEY`, `PAYSTACK_SECRET_KEY`, both webhook secrets, three storage variables, and `ANALYTICS_WRITE_KEY`. No code reads any of them. The naming in Section F/J deliberately stays compatible where sensible.
- **Migration `0004_document_configuration.sql` has not been applied** to the live database. It is additive and safe (two `ADD COLUMN` statements, both with defaults) and its snapshot and journal entry are consistent, so `npm run db:migrate` will apply it cleanly — but the running application currently has `template` and `hiddenSections` in code and not in the database.
- **`status` is a one-value enum** (`draft`). There is no lifecycle.
- **`/templates`, `/how-it-works`, and `/pricing` are placeholder stubs.** `/pricing` contains one sentence: "Free / Starter / Pro — configurable, not yet finalized." No plan objects, no prices, no currency logic anywhere in the codebase.

### A.7 Verification and tooling

`vitest` with unit coverage on the pure layers (composition, presentation, redirects, session, auth primitives, database configuration). Two custom scripts that are genuinely useful and should be kept: `scripts/contrast-audit.mjs` computes WCAG 2.1 ratios for the token pairs actually rendered in both themes; `scripts/measure-routes.mjs` separates cold (compile + render + data) from warm-median (render + data) latency and splits TTFB from body transfer.

The sandbox in which this review was produced cannot reach the npm registry (403), so `vitest`, `next build`, and `drizzle-kit` cannot run here, and raw Postgres TCP cannot traverse its HTTP proxy. `tsc --noEmit`, `node scripts/contrast-audit.mjs`, git inspection, and an offline harness under `node_modules/.probe/` do work. Anything requiring the registry, a browser, or the database has to run on the host machine, and this document never describes such a check as done.

---

## B. Problems — what will prevent this from scaling to the new direction

Ordered by how expensive they become if deferred.

### B.1 `document_type` is a Postgres enum, so the catalogue cannot grow

```ts
export const documentType = pgEnum("document_type", [
  "professional_cv", "professional_resume", "academic_cv",
]);
```

Every new document kind — cover letter, motivation letter, statement of purpose, personal statement, research statement, fellowship application — is a migration plus an enum alteration. Worse, `DocumentType` is derived from the enum and used as a `Record` key in at least three places (`sectionOrder`, `headings`, `defaultTemplates`), so adding one value is a compile error across the composition and presentation layers, each of which must be filled in before the build passes. The reset asks for "potentially additional document types later." An enum makes "later" a migration and a fan-out of exhaustive-switch edits.

The template column got this right and documents why (`src/documents/schema.ts:42-50`): plain `text`, no enum, resolved against a code-owned vocabulary with a graceful fallback. The type column should follow the same pattern.

### B.2 Document structure is welded to the dossier's section vocabulary

This is the most serious structural problem, and it is precisely what §4 of the reset forbids.

```ts
export type ComposedSectionKey = ProfileSectionKey | "summary";
```

A composed document can only contain sections that are dossier sections. `sectionOrder` is `Record<DocumentType, readonly ComposedSectionKey[]>` and each family enumerates all eleven keys. Three consequences:

1. **Prose documents are unrepresentable.** A cover letter has a date line, a recipient block, a salutation, body paragraphs, a closing, and a signature block. None of those is a dossier section. There is a `prose` layout in the `ComposedSection` union, but no slot for an addressee, and no notion of a document whose primary content is authored text rather than selected records.
2. **Section order cannot vary by anything except family.** The reset asks for selection driven by purpose, target role, target organisation, region, academic level, available information, and length. Today the only inputs are family and the user's hide list.
3. **The dossier's shape and the document's shape are the same shape**, so a change to one perturbs the other. Adding a dossier section changes every document; adding a document kind pressures the dossier vocabulary.

### B.3 No evidence identity, so traceability cannot be retrofitted cheaply

Composition maps a dossier row to strings and drops the row's identity on the floor:

```ts
export type ComposedEntry = {
  title: string; subtitle: string | null; meta: string | null;
  detail: ComposedDetail | null; url: string | null;
};
```

§12 of the reset requires that "generated claims should be traceable back to user-provided information where practical." That is only possible if a stable identifier travels with the text from the dossier row, through composition, into the generated slot, and into storage. If the LLM ships before evidence identity exists, every generated document is unverifiable and the fact-checking gate in Section F.6 cannot be built — it would have nothing to check against. Adding an `evidenceRef` to `ComposedEntry` before generation exists is a small change; adding it after is a data backfill against documents whose provenance was never recorded.

### B.4 Metadata is pre-joined, so the renderer cannot give dates their own treatment

`meta` arrives as one string: `"Jan 2023 – Present · Lagos, Nigeria"`, joined with `META_SEPARATOR`. A style that wants dates flush right and location on a second line in grey — which is exactly what the measured US Letter résumé reference does — must split a display string back apart. Two of the three reference documents treat dates and place differently from each other. `period` and `qualifiers` need to be separate fields on the composed entry. (This is the change I had started; it is small and belongs in Phase 1.)

### B.5 Presentation differences are scalar-only, and below the perceptual threshold

This is the answer to the complaint that switching style "doesn't feel like anything," and it is evidence for Section E.

| axis | Classic | International | Compact |
| --- | --- | --- | --- |
| body size | 11pt | 10.5pt | 10.5pt |
| name size | 17pt | 17pt | 18pt |
| line height | 1.34 | 1.40 | 1.32 |
| margin | 20mm | 17mm | 15mm |
| section gap | 1.35em | 1.60em | 1.15em |
| entry gap | 0.80em | 1.00em | 0.70em |

Every difference is a scalar an eye cannot reliably detect side by side. Two of three share a typeface. **The masthead markup is byte-identical across all three templates.** Only two behavioural flags exist (`entryLayout`, `numberedSections`) and `classic` + `international` share the same `entryLayout`, so only one of three differs structurally at all. The section-heading architecture is a single shape — uppercase over a full-width bottom rule — with only rule colour and weight varying.

Nothing varies for: content measure, contact-line treatment, summary treatment, accent strategy beyond name and rule, role/organisation emphasis, page-break behaviour, first-page hierarchy, or list spacing.

And `variables: Readonly<Record<string, string>>` is untyped, so nothing guarantees a template sets the properties any given dimension needs, and nothing tells you which properties exist.

The fix is not more custom properties. It is **new design dimensions** — header composition, section-heading architecture, entry architecture, geometry and measure, accent strategy — expressed as typed fields, with template-aware components for the axes that are structural rather than scalar.

### B.6 No document snapshot, so versioning and sharing are impossible as built

`documents` stores configuration and recomposes from the live dossier on every render. Correct for the live preview; wrong for three things the product has already promised:

- **Versioning.** "The résumé I sent to Google in March" must render as it did in March. That requires the dossier as it read then.
- **Sharing.** A share link must show a fixed document. Today it would show whatever the owner's dossier says at the moment the recipient opens it — including edits made after sending.
- **Generated content.** LLM output is not derivable from the dossier. It has to live somewhere, and "somewhere" is a version.

### B.7 Signed-in requests pay a database round trip for the session, on a pool of three

Session strategy is `database`. `getSession()` is well built — `React.cache` collapses the layout and page calls into one query per request, and a cookie pre-check means anonymous visitors cost zero round trips — but every signed-in request still hits eu-central-1 at least once before any of its own data. The document save path pays: session in the action, then session in the redirected render, then the document read, then the dossier read. That is the 1–7s POST latency, and no amount of query tuning removes the fixed cost.

Note also that `app/documents/[documentId]/page.tsx:55-56` contains a comment asserting "the connection ceiling is one," used to justify sequential reads. `DATABASE_POOL_MAX` now defaults to 3. The comment is stale and the justification no longer holds, though the sequencing is still correct for a different reason (the dossier should not be read until the document is known to belong to the session).

This becomes a bigger problem, not a smaller one, once generation exists: LLM calls are long, serverless functions hold their connection while waiting, and a pool of three across concurrent instances will queue.

### B.8 No usage accounting, no entitlement boundary, no cost ceiling

There is no `subscription`, `entitlement`, `plan`, `price`, `usage`, or `payment` code anywhere — verified by grep, zero hits on all of those terms. That is fine as a current state, but it means the LLM cannot ship first. An uncapped generation endpoint behind Google sign-in is an unbounded cost liability on any provider, free tier included (free tiers have rate limits whose exhaustion is a total outage, which is arguably worse than a bill).

The entitlement *service* must exist before the first generation call, even if every answer it returns is "free tier."

### B.9 Print CSS has a latent defect and no `@page` rule

`styles/print.css` sets `page-break-after: always` on `.document-frame`, which risks a trailing blank page on every print. There is no `@page` rule at all, so paper size and print margins are the browser's defaults regardless of the template's declared `paper` value. Per-template paper needs named CSS pages (`@page <name>` + `page: <name>`), because custom properties cannot be used inside `@page`.

This matters less than it would have, because §20 of the reset correctly rules out browser print as the canonical export. Print CSS remains worth fixing as a convenience path, but the real answer is a server renderer.

### B.10 The `status` enum has one value, and there is no lifecycle

A document is always `draft`. There is no `generated`, no `final`, no `exported`, no `archived`. Packages, versions, and sharing all need a lifecycle, and a one-value enum will need a migration either way — better to change it once, deliberately, in Phase 1.

### B.11 Summary: retain / refactor / build

| | |
| --- | --- |
| **Retain unchanged** | The three-layer chain and its purity boundary · the CSS-custom-property template mechanism · CSS Modules + tokens · ownership-in-`WHERE` · `server-only` boundaries · the Drizzle client's pooler configuration and its documented reasoning · `db/security/harden-public-schema.sql` and the `db:secure` guard · `contrast-audit.mjs` and `measure-routes.mjs` · the exclusions-not-inclusions `hiddenSections` choice · `unstable_rethrow` in every action · error-message allow-lists |
| **Refactor** | `document_type` enum → catalogue (B.1) · `ComposedSectionKey` → document-owned slot vocabulary (B.2) · `ComposedEntry.meta` → `period` + `qualifiers` (B.4) · `DocumentTemplate.variables` → typed presentation spec with structural axes (B.5) · `documents` → `documents` + `document_versions` (B.6) · session strategy (B.7) · `status` enum (B.10) · `print.css` `page-break-after` + `@page` (B.9) · `rate-limit.ts` secret resolution (A.6) · the stale pool comment (B.7) |
| **Build new** | Application intent · source-material ingestion and requirement extraction · evidence model · LLM gateway, prompt library, validation · matching · packages · entitlement service and usage accounting · server-side PDF renderer and private export storage · share links · payments · admin · audit log · analytics |
| **Delete or justify** | The unreachable credentials stack (A.6) — either wire it up as an account-recovery path or remove it and its three tables. Dead security code is a liability: it looks like a control that exists. |

---

## C. Proposed architecture

### C.1 The one idea the whole design rests on

Between the intelligent part of the system and the deterministic part there is a single artifact: the **Document Specification**. It is a plain data structure that says which slots this document has, in what order, with what content, under which presentation style, within what page budget.

Everything upstream of it may be uncertain, probabilistic, and model-assisted. Everything downstream of it is deterministic and reproducible. The LLM's job is to fill named text slots inside a specification it did not author. It never emits HTML, never emits CSS, never chooses a section order, never picks a style, never decides a page count.

That boundary is what makes the rest tractable: it is the thing you test, the thing you version, the thing you store to reproduce a document, and the thing you validate before anything reaches a user's page.

### C.2 Component diagram

```
                                  ┌─────────────────────────────────────────┐
  USER                            │  ENTITLEMENT SERVICE                    │
   │                              │  "what can this user do right now?"     │
   │  "I'm applying for this      │  authoritative subscription state       │
   │   software engineering job"  │  + usage counters + overrides           │
   │  (+ optional job posting)    └───────────────┬─────────────────────────┘
   ▼                                              │ consulted BEFORE every
┌──────────────────────────┐                      │ expensive or gated step
│  INTENT RESOLVER         │                      │ (reserve → commit/release)
│  progressive, determin-  │◄─────────────────────┤
│  istic; asks only what   │                      │
│  it still needs          │                      │
└────────────┬─────────────┘                      │
             │ ApplicationIntent                  │
             ▼                                    │
┌──────────────────────────┐   ┌──────────────────┴───────────┐
│  SOURCE MATERIAL         │   │  APPLICATION ORCHESTRATOR    │
│  ingestion (JD, program  │──►│  owns the whole run; the     │
│  page, call for papers)  │   │  only component that knows   │
│  sanitise → text →       │   │  the sequence. Emits one     │
│  REQUIREMENT EXTRACTION  │   │  Generation Run per attempt. │
└──────────────────────────┘   └──────┬───────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
┌────────────────────┐   ┌────────────────────────┐   ┌────────────────────────┐
│  DOSSIER SERVICE   │   │  DOCUMENT CATALOGUE    │   │  PROMPT LIBRARY        │
│  owner-scoped read │   │  kinds · slot schemas  │   │  versioned, code-owned │
│  → EVIDENCE SET    │   │  · default slot order  │   │  · output schema per   │
│  every item has a  │   │  · style compatibility │   │    prompt · model      │
│  stable evidence   │   │  · tier requirements   │   │    hints · no user     │
│  reference         │   └────────────────────────┘   │    text in the template│
└─────────┬──────────┘                                └───────────┬────────────┘
          │                                                       │
          ▼                                                       │
┌──────────────────────────────────┐                              │
│  EVIDENCE SELECTOR / MATCHER     │                              │
│  requirements × evidence →       │                              │
│  ranked, deduplicated selection  │                              │
│  with per-item justification.    │                              │
│  Deterministic scoring first;    │                              │
│  model assist only for semantic  │                              │
│  equivalence.                    │                              │
└─────────┬────────────────────────┘                              │
          │                                                       │
          ▼                                                       ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  CONTEXT ASSEMBLER                                                            │
│  builds exactly one request's context from evidence + requirements.           │
│  Single-tenant by construction. User text enters as DATA in a delimited,      │
│  explicitly-untrusted region — never as instructions. No cross-user state.    │
└───────────────────────────────┬───────────────────────────────────────────────┘
                                ▼
                    ┌───────────────────────────┐        ┌──────────────────────┐
                    │  LLM GATEWAY              │───────►│  GENERATION LEDGER   │
                    │  provider-agnostic ·      │        │  who · op · provider │
                    │  budget/timeout/retry ·   │        │  model · prompt ver  │
                    │  dedupe + cache by        │        │  sizes · latency ·   │
                    │  content hash             │        │  outcome · cost.     │
                    └───────────┬───────────────┘        │  No prompt bodies,   │
                                │ structured slots       │  no career text.     │
                                ▼                        └──────────────────────┘
                    ┌───────────────────────────────────────────┐
                    │  VALIDATION — two independent gates       │
                    │  1. SHAPE:   schema · slot names · length │
                    │  2. FACT:    every claim cites ≥1 evidence│
                    │              ref; no employer, title,     │
                    │              date, number, credential or  │
                    │              award absent from the        │
                    │              evidence set survives        │
                    │  Failure → deterministic fallback, never  │
                    │  a failed document                        │
                    └───────────┬───────────────────────────────┘
                                ▼
                    ┌───────────────────────────────────────────┐
                    │  DOCUMENT SPECIFICATION  ◄── the boundary │
                    │  slots · order · content · style ref ·    │
                    │  page budget · evidence links             │
                    └───────────┬───────────────────────────────┘
                                ▼
                    ┌───────────────────────────┐
                    │  COMPOSER (pure)          │  ← today's composition.ts, widened
                    │  spec → ComposedDocument  │
                    └───────────┬───────────────┘
                                ▼
                    ┌───────────────────────────┐        ┌──────────────────────┐
                    │  PRESENTATION ENGINE      │◄───────│  STYLE REGISTRY      │
                    │  resolves a style spec to │        │  categorised ·       │
                    │  typed properties +       │        │  versioned · declares│
                    │  structural axes          │        │  slot capability +   │
                    └───────────┬───────────────┘        │  ATS constraints     │
                                │                        └──────────────────────┘
                    ┌───────────┴───────────────┐
                    ▼                           ▼
        ┌────────────────────┐      ┌──────────────────────────┐
        │  LIVE PREVIEW      │      │  DOCUMENT VERSION STORE  │
        │  server-rendered   │      │  frozen: dossier snapshot│
        │  HTML, owner-only  │      │  + spec + resolved style │
        └────────────────────┘      │  + checksum. Immutable.  │
                                    └──────────┬───────────────┘
                                               ▼
                                    ┌──────────────────────────┐
                                    │  EXPORT PIPELINE         │
                                    │  server renderer → PDF   │
                                    │  → private object store  │
                                    │  (non-enumerable keys)   │
                                    └──────────┬───────────────┘
                                               ▼
                                    ┌──────────────────────────┐
                                    │  DELIVERY                │
                                    │  authz check → short-    │
                                    │  lived signed URL, or    │
                                    │  share token (read-only, │
                                    │  revocable, expiring)    │
                                    └──────────────────────────┘

  CROSS-CUTTING (every box above writes to these, none reads user content from them)
  ├─ AUDIT LOG        security-relevant actions, actor, subject, outcome
  ├─ ANALYTICS        product events; never document contents
  └─ RATE LIMITER     per-user and per-IP, per-operation, configurable
```

### C.3 What changed from the diagram in the brief, and why

| Change | Reason |
| --- | --- |
| Entitlement Service moved to the **top**, gating the orchestrator | In the original it sat outside the flow. It must be consulted *before* an expensive step, not after, or the cost is already incurred. A `reserve → commit/release` protocol means a crashed run does not silently consume a user's quota. |
| "Matching Engine" split into **Requirement Extraction** and **Evidence Selection** | These have different inputs, different failure modes, and different trust levels. Requirement extraction reads *untrusted third-party text* (a pasted job posting is the single most likely prompt-injection vector in this product). Evidence selection reads *the user's own data*. Fusing them puts attacker-controlled text and private career data in one component with one trust level. |
| **Evidence Set** made a first-class artifact with stable references | Section B.3. Without it, §12 truthfulness is unenforceable. |
| **Document Specification** named as the explicit boundary artifact | C.1. It is also exactly what a version stores. |
| Validation split into **shape** and **fact** gates | They fail differently and recover differently. A shape failure is a retry; a fact failure must never be retried into acceptance — it falls back to deterministic composition. |
| **Generation Ledger** separated from the audit log | Different retention, different access, different content rules. The ledger is metrics; the audit log is security. Neither stores career text. |
| **Version Store** placed between presentation and export | Export must render a frozen thing. Rendering a live composition to PDF means the file and the preview can disagree. |
| **Style Registry** declares capability and constraints, not just values | Section E. A style that cannot render a `publications` slot must be rejected at selection time, not silently drop content at render time. |
| Live preview and export both hang off the **same** composer + presentation output | §33 of the project instructions: the document must look identical regardless of entry point. One code path is the only way to guarantee that. |

### C.4 Request shapes

Three distinct paths, deliberately different in cost:

```
LIVE PREVIEW (cheap, every page view, no LLM, no entitlement check)
  authz → document + current version OR live composition → composer → presentation → HTML

GENERATION (expensive, explicit user action, gated)
  authz → entitlement.reserve → orchestrator → … → validation → spec
        → version.create → entitlement.commit → redirect to preview

EXPORT (moderate, gated on plan for some formats)
  authz → version (immutable) → renderer → private store → signed URL
```

Generation is never implicit. A user editing their dossier does not trigger an LLM call. This keeps cost proportional to intent and makes the free tier viable.

---

## D. Data model

Existing tables are marked ✅ (keep as-is), ⚠️ (change), or ➕ (new). Column lists are indicative, not final DDL.

### D.1 Identity and account

| Table | State | Notes |
| --- | --- | --- |
| `users` | ✅ | Add `role` (`user` \| `support` \| `admin`, default `user`), `deletedAt`, `locale`, `countryCode` (last resolved, for currency presentment only — never for feature gating). |
| `accounts`, `sessions`, `verificationTokens` | ✅ | Auth.js-owned. See B.7 / H.2 on session strategy. |
| `auth_credentials`, `auth_tokens`, `auth_rate_limits` | ⚠️ | Currently unreachable (A.6). Decide in Phase 0: wire `auth_tokens` up for account recovery and re-purpose `auth_rate_limits` as the general limiter store (it is a good fit — atomic upsert, fixed windows, HMAC'd keys), or drop all three. |

### D.2 Dossier — the source of truth

The twelve existing tables stay exactly as they are. They are correctly relational, correctly cascaded, and correctly the source of truth. Two additions:

| Table | State | Notes |
| --- | --- | --- |
| `profiles`, `profileSections`, and the ten content tables | ✅ | No structural change. Section D.3's evidence reference is `(section_key, row_id)` — derived, not duplicated. |
| `dossier_revision` | ➕ | A single monotonic counter per profile, bumped on any dossier write. Lets a document say "your dossier has changed since this version was generated" without diffing, and lets the cache key for generation include it. One column on `profiles` would do; a column is cheaper than a table. |

**Deliberately not built:** a separate evidence table. An evidence reference is `{ section: ProfileSectionKey, rowId: string }` — a pointer into tables that already exist. Copying dossier content into an evidence store would create a second place for a career fact to live, which is the exact failure the current model was designed to avoid.

### D.3 Document catalogue — replaces the enum

| Table / module | State | Shape |
| --- | --- | --- |
| **`document_kinds`** — code-owned registry, *not* a table | ➕ | `key` · `label` · `category` (`resume` \| `cv` \| `letter` \| `statement` \| `profile`) · `structure` (`sectioned` \| `prose` \| `hybrid`) · `slots` (the slot schema — see D.4) · `defaultSlotOrder` · `styleCategories` (which style categories may present it) · `minTier` · `pageBudget` · `status` (`active` \| `deprecated`). Lives in `src/documents/catalogue/`, one file per kind, aggregated into a registry with an `isDocumentKind()` guard — exactly the pattern `presentation.ts` already uses well. |
| `documents.type` | ⚠️ | `pgEnum` → `text`, resolved against the registry with a graceful fallback, mirroring the reasoning already written into `schema.ts` for `template`. Migration is a type change on an existing column with the three current values preserved as registry keys. |

Why a code registry rather than a table: slot schemas are typed structures that composition code must pattern-match exhaustively. Putting them in the database means either duplicating the types or losing type safety. Admin-editable *styles* are a different matter (D.6) because a style is data all the way down.

### D.4 Slots — how structure stops being welded to the dossier

A slot is a named, typed position in a document. Three flavours cover everything the reset asks for:

```ts
type SlotKind =
  | { kind: "records";  source: ProfileSectionKey; }   // selected dossier rows
  | { kind: "prose";    maxWords: number; }            // authored/assisted paragraphs
  | { kind: "field";    field: LetterField; };         // date, recipient, salutation, signature
```

A résumé's slots are mostly `records` plus one `prose` summary. A cover letter's are mostly `field` and `prose` with zero `records`. A statement of purpose is entirely `prose`. A hybrid academic CV has both. `ComposedSectionKey = ProfileSectionKey | "summary"` is replaced by a slot id owned by the document kind, which is what dissolves B.2.

### D.5 Documents and versions

| Table | State | Columns |
| --- | --- | --- |
| `documents` | ⚠️ | `id` · `userId` · `kindKey` (text) · `title` · `status` (`draft` \| `generated` \| `final` \| `archived`) · `styleKey` · `intentId?` · `packageId?` · `currentVersionId?` · `hiddenSlots` (jsonb, exclusions — same reasoning as today) · `createdAt` · `updatedAt` · `deletedAt`. Index `(userId, updatedAt)` kept. |
| **`document_versions`** | ➕ | `id` · `documentId` · `versionNo` (unique per document) · `spec` (jsonb — the Document Specification) · `dossierSnapshot` (jsonb — only the rows the spec referenced, not the whole dossier) · `styleKey` + `styleSpec` (jsonb, frozen) · `composerVersion` · `generationId?` · `checksum` · `createdAt`. **Immutable.** |
| **`document_slot_evidence`** | ➕ | `id` · `documentVersionId` · `slotId` · `dossierSection` · `dossierRowId` · `origin` (`verbatim` \| `assisted` \| `composed`) · `confidence?`. The traceability spine of §12. |
| **`share_links`** | ➕ | `id` · `documentVersionId` · `tokenHash` (SHA-256; the token itself is never stored) · `createdBy` · `expiresAt?` · `revokedAt?` · `viewCount` · `lastViewedAt`. Random 256-bit tokens, non-sequential. Pinned to a *version*, not a document, so revising a document does not silently change what a recipient already has. |
| **`document_exports`** | ➕ | `id` · `documentVersionId` · `format` (`pdf` \| later `docx` \| `txt`) · `storageKey` (non-enumerable) · `bytes` · `pageCount` · `rendererVersion` · `createdAt` · `expiresAt?`. |

On `dossierSnapshot` scope: storing only the referenced rows rather than the whole dossier respects §5 ("do not duplicate the user's entire dossier into every document unnecessarily") while still making the version reproducible. A version of a two-page résumé stores a handful of rows, not a career.

### D.6 Presentation styles

| Table | State | Columns |
| --- | --- | --- |
| **`presentation_styles`** | ➕ | `key` · `name` · `description` · `category` (`resume` \| `cv` \| `letter`) · `appliesToCategories` (text[]) · `specVersion` (int) · `spec` (jsonb — the typed presentation spec, Section E) · `paper` · `constraints` (jsonb — e.g. ATS-safety flags) · `minTier` · `status` (`active` \| `deprecated`) · `sortOrder`. |

Seeded from code, editable by admin later. Documents reference `styleKey` for the live view and freeze `styleSpec` into each version, so improving a style never retroactively alters a document a user already sent.

### D.7 Intent, source material, packages

| Table | State | Columns |
| --- | --- | --- |
| **`application_intents`** | ➕ | `id` · `userId` · `purpose` · `targetRole?` · `targetOrganisation?` · `industry?` · `countryCode?` · `academicLevel?` · `applicationType?` · `requestedLength?` · `tone?` · `sourceMaterialId?` · `resolvedFields` (jsonb) · `status` (`gathering` \| `ready` \| `used`) · `createdAt`. Every field except `purpose` nullable — §6 says not everything is mandatory, and the resolver asks only for what it still needs. |
| **`source_materials`** | ➕ | `id` · `userId` · `kind` (`job_posting` \| `programme` \| `call` \| `existing_document`) · `origin` (`paste` \| `upload` \| `url`) · `storageKey?` · `extractedText` · `sha256` · `bytes` · `mimeSniffed` · `expiresAt` · `createdAt`. Retention-limited by default; `expiresAt` is not optional in practice. |
| **`requirements`** | ➕ | `id` · `sourceMaterialId` · `text` · `kind` (`skill` \| `qualification` \| `experience` \| `competency` \| `logistic`) · `weight` · `extractedBy` (`rules` \| `model`) . |
| **`application_packages`** | ➕ | `id` · `userId` · `intentId` · `templateKey` (which package shape) · `status` · `createdAt`. |
| **`package_documents`** | ➕ | `packageId` · `documentId` · `roleInPackage` (`primary` \| `letter` \| `statement` \| `supporting`) · `sortOrder`. Composite PK. |

### D.8 Generation and prompts

| Table | State | Columns |
| --- | --- | --- |
| **`generation_runs`** | ➕ | `id` · `userId` · `documentId?` · `packageId?` · `intentId?` · `trigger` · `status` (`reserved` \| `running` \| `succeeded` \| `failed` \| `fell_back`) · `startedAt` · `finishedAt` · `errorCode?`. One row per user-visible generation attempt. |
| **`generation_calls`** | ➕ | `id` · `runId` · `userId` · `operation` · `promptKey` · `promptVersion` · `provider` · `model` · `inputTokens` · `outputTokens` · `latencyMs` · `status` · `errorCode?` · `costMicros?` · `cacheHit` · `createdAt`. **No prompt bodies. No career text. No generated content.** §37. |
| **`prompts`** | ➕ | `key` · `version` · `role` (`system` \| `task` \| `guard`) · `body` · `outputSchema` (jsonb) · `modelHints` (jsonb) · `maxInputTokens` · `maxOutputTokens` · `status` · `createdAt` · `createdBy`. Composite PK `(key, version)`; bodies are never returned to any client. |
| **`prompt_activations`** | ➕ | `key` · `environment` (`development` \| `preview` \| `production`) · `activeVersion` · `activatedAt` · `activatedBy`. Rollback is one row update, which is the whole point. |

### D.9 Plans, subscriptions, entitlements, usage

| Table | State | Columns |
| --- | --- | --- |
| **`plans`** | ➕ | `key` (`free` \| `starter` \| `professional`) · `name` · `status` · `sortOrder` · `limits` (jsonb — the access matrix in Section G) · `features` (text[]). |
| **`plan_prices`** | ➕ | `id` · `planKey` · `interval` (`month` \| `year`) · `currency` · `amountMinor` · `regionBand?` · `provider` · `providerPriceId` · `active`. Pricing is data, never a component constant. |
| **`subscriptions`** | ➕ | `id` · `userId` · `planKey` · `status` (`trialing` \| `active` \| `past_due` \| `grace` \| `canceled` \| `expired`) · `provider` · `providerCustomerId` · `providerSubscriptionId` · `currentPeriodStart` · `currentPeriodEnd` · `cancelAtPeriodEnd` · `graceUntil?` · `updatedAt`. Unique partial index on `(userId)` where status is live. |
| **`entitlement_overrides`** | ➕ | `id` · `userId` · `limits` (jsonb, partial) · `reason` · `grantedBy` · `expiresAt?`. Support grants and comped accounts, fully audited. |
| **`usage_counters`** | ➕ | `userId` · `periodStart` · `metric` (`documents_generated` \| `packages_generated` \| `llm_calls` \| `exports` \| `source_materials`) · `count` · `reserved`. PK `(userId, periodStart, metric)`. Atomic increments; `reserved` supports the reserve/commit/release protocol. |

### D.10 Payments

| Table | State | Columns |
| --- | --- | --- |
| **`payments`** | ➕ | `id` · `userId` · `provider` · `providerPaymentId` · `amountMinor` · `currency` · `status` · `planKey?` · `createdAt`. |
| **`payment_events`** | ➕ | `id` · `provider` · `providerEventId` **UNIQUE** · `type` · `signatureVerified` · `payloadHash` · `receivedAt` · `processedAt?` · `processingError?`. The unique constraint is the idempotency mechanism for webhook replay (§15). Raw payloads are not retained beyond a short window. |

### D.11 Observability

| Table | State | Columns |
| --- | --- | --- |
| **`audit_events`** | ➕ | `id` · `actorUserId?` · `actorKind` (`user` \| `admin` \| `system` \| `provider`) · `action` · `subjectType` · `subjectId?` · `outcome` · `ipHash?` · `userAgentHash?` · `metadata` (jsonb, no content) · `createdAt`. Append-only; no application role has `DELETE`. |
| **`analytics_events`** | ➕ | `id` · `userId?` (or a rotating anonymous id) · `name` · `properties` (jsonb — enumerated keys only, no free text, never document content) · `sessionId?` · `createdAt`. |
| **`admin_actions`** | ➕ | `id` · `adminUserId` · `action` · `subjectType` · `subjectId` · `reason` (required) · `before?` · `after?` · `createdAt`. |

### D.12 Model-level invariants worth writing tests for

1. A `document_versions` row is never updated after insert.
2. Every `records` slot in a version has ≥1 `document_slot_evidence` row.
3. Every `assisted`-origin slot has ≥1 evidence row (this is §12, expressed as a constraint).
4. `share_links.tokenHash` is unique and the plaintext token appears in no table and no log.
5. `usage_counters.count + reserved` never exceeds the plan limit for a live subscription.
6. `payment_events.providerEventId` is unique per provider.
7. No table outside `analytics_events` and `audit_events` is written by a code path that lacks a `userId` scope.
