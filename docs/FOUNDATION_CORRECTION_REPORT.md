# Foundation Correction — Report

Covers the block that addressed **§2, the data disconnect**. The brief's other numbered
sections (§3–§9 structured input, document types, styles, sets) are **not started**; this
report says so item by item rather than describing the architecture that already exists as
though it were new work.

Answers follow the twenty required items in order.

---

## 1. Root cause of the empty-Dossier problem

There were two answers in the system to the question *"what is in this dossier?"*, and the
Dossier-facing screens consulted the wrong one.

`profileSections` is a table of sections the user explicitly ticked on `/profile/sections`.
It was written by that one screen, destructively — `replaceEnabledSections` deletes every
row and re-inserts the submitted selection. Nothing that writes an *entry* ever registered
its section. So the entry rows and the registry could disagree, and when they disagreed the
entry rows were the ones ignored:

```
DB rows → listSectionEntries  → /profile/[section]         VISIBLE (even labelled "Optional section")
DB rows → getSectionCounts    → /profile, /profile/review  gated by profileSections → INVISIBLE
DB rows → getDossierSnapshot  → document composition       VISIBLE (registry ignored)
```

That is the reported symptom exactly. The section screen listed the information, adding it
again was refused as a duplicate, and the Dossier hub said "Not started" — because the hub,
the review page, and the rail and footer that drive "what comes next" all derived the flow
from `buildDossierFlow(getEnabledSectionKeys(profileId))`, the registry alone.

Two ways in reproduce it without any corruption. Save entries, then save a narrower
selection on the structure screen: the registry no longer mentions the section, the entries
remain. Or reach a section by direct URL, save an entry, and never visit the structure
screen at all: nothing registers it.

A second, independent defect produced the same *appearance* on the document side. A
document is composed live from the dossier and holds no copy of it, but the profile save
actions revalidated only `/profile*` and `/home`. A cached `/documents/[documentId]` payload
could therefore predate a profile write, so a document could render without information the
user had already saved.

It was not a rendering issue, and it was not in the database layer — the rows were correct
throughout.

## 2. Exact files changed

Twelve files, all read paths and copy; no schema change.

| File | Change |
| --- | --- |
| `src/profile/flow.ts` | `buildDossierFlow(registered, counts)` — presence derived from data; `DossierStep.chosen`; `Object.hasOwn` guard |
| `src/profile/flow.test.ts` | 17 → 29 tests, including the regression suite for this defect |
| `src/profile/sections.ts` | `isProfileSection` uses `Object.hasOwn`, not `in` |
| `src/profile/repository.ts` | `getDossierSectionState` added; `getEnabledSections`, `getEnabledSectionKeys`, `getSectionCounts` deleted |
| `src/profile/actions.ts` | `dossierFlowFor` helper; `revalidateProfilePaths` now covers `/documents` and `/documents/[documentId]` |
| `src/profile/components/profile-sections-form.tsx` | populated sections render checked and locked, paired with a hidden input; hint copy corrected |
| `app/profile/page.tsx` | one read instead of two; flow built from registry + counts |
| `app/profile/review/page.tsx` | same |
| `app/profile/[section]/page.tsx` | same |
| `app/profile/sections/page.tsx` | passes counts to the form |
| `app/home/page.tsx` | section count taken from the dossier, not the registry |
| `app/documents/new/page.tsx` | copy only: stops calling a document-type list a "purpose" (see item 11) |

The three deleted readers were removed rather than left callable. They are the mechanism of
the bug, and leaving a cheaper way to be half-informed invites the same defect back.

## 3. How profile data now travels

```
DATABASE            profiles + ten section tables, ownership-scoped by profileId
   ↓
REPOSITORY          getDossierSectionState  → registry rows + entry counts, ONE round trip
                    getDossierSnapshot      → every user-content column, ONE round trip
                    listSectionEntries      → select() (all columns) for the section screen
   ↓
READ MODEL          buildDossierFlow(registered, counts)
                      · chosen sections, in the user's order
                      · then ANY section with counts > 0, in canonical order
                      · Object.hasOwn guard on every key
   ↓
DOSSIER             DossierSnapshot — identity + ten typed collections
   ↓
COMPOSITION         buildSections() — eleven builders; a section with no usable
                    entries is omitted, never stubbed
   ↓
RENDERER            presentation template resolves --doc-* custom properties
   ↓
UI                  hub, review, section pages, rail and footer read the same flow
```

The single change that fixes the hub, the review page, the section page, the rail and the
footer is that presence is now **derived from the information**, not from a parallel list
that can disagree with it. Intent still counts for ordering and for a chosen-but-empty
section (dropping those would remove the step the user is standing on), but it can no
longer *hide* anything.

Reads did not get more expensive. The hub and review screens each made two round trips
before and now make one, because the registry and the counts arrive in the same correlated
subquery. Saves are unchanged — registering a section inside `createSectionEntry` was
considered and rejected, because it adds a round trip to a path already measured at 1–7s
(open item, task #38) to fix something that no longer needs fixing.

`revalidateProfilePaths` now also revalidates `/documents` and `/documents/[documentId]`,
which closes the caching half of the problem.

**Field-level trace, verified mechanically this block.** Every user-content column in all
ten section tables reaches the snapshot; the only unread columns are
`achievements.experienceId` and `achievements.projectId`, which are foreign keys rather
than content. All nine identity columns are read. Writes spread validated values, so no
insert or update can drop a field, and every section has a validation schema —
`profileEntrySchemas` is declared `satisfies Record<ProfileSectionKey, z.ZodType>`, so a new
section cannot compile without one. Edit prefill uses `select()` / `findFirst`, i.e. all
columns, so no update can blank a column the form never read. `skills` and `languages` omit
`updatedAt` on update because those two tables genuinely have no such column.

## 4. Current profile data categories

Eleven: **basics** (identity, contact, location, headline, career direction) plus
**experience, education, projects, skills, credentials, achievements, languages,
publications, memberships, links**.

`credentials` deliberately covers certification, licence, training and course completion
rather than assuming academic qualifications, and `experience` carries a type qualifier so
employment, freelance, internship and volunteering are one category rather than four.

§4's wider list (research, teaching, conferences, patents, grants, references, portfolios,
interests) is **not implemented**. Adding one is a section definition, a table, a validation
schema and a composition builder — the registry is exhaustive by type, so the compiler names
every place that needs updating. No speculative tables were created.

## 5. Fields that are structured controls today

Enumerated selects for `experience.type`, `skills.type`, `credentials.type`,
`achievements.type` and `links.type`; a checkbox for "this is current" on the four dated
sections; numeric month and year fields on every dated section; and the section picker
itself, which now locks anything holding information.

## 6. Fields that remain free-form, and why

Organisation, role, institution, qualification, field of study, location, skill name,
language, proficiency, issuer, credential name, publication venue and all descriptions.

Some of that is correct — a global product cannot enumerate employers, job titles or
qualifications, and §3 says so explicitly. Some of it is **not** correct and is outstanding
work, not a decision:

- `languages.proficiency` is a free-text box. §3 names this specifically: it should be a
  language selector plus a proficiency scale, not a field where the user types
  "English — Fluent".
- Country is free text; month is a number rather than a named month; there is no
  education-level or grading-system control, and no skill picker with a custom fallback.

`ProfileField.type` is currently limited to `text | email | url | tel | number | textarea |
select | checkbox`, so **§3 and §18 require extending that union before the controls they
describe can exist.** This block did not start that work.

## 7. Document families

Four, in `src/documents/catalogue/taxonomy.ts`: **career** (work and career), **academic**
(study and scholarship), **international** (fellowships and international programmes),
**supporting** (shorter accompanying pieces).

Family is kept separate from two other axes on purpose. **Structure** — `sectioned`,
`letter`, `statement` — decides which composition and renderer path applies; a letter is a
different shape, not a sectioned document with different words. **Style category** —
`resume`, `cv`, `letter`, `statement` — constrains which visual systems may present a type,
so a résumé style on a motivation letter is unrepresentable rather than merely unlikely.
Collapsing any two of these is what would force a rewrite later.

## 8. Document types

Six declared, split by availability so the catalogue can express "planned" without the
database being able to hold it:

**Shipping** — `professional_cv`, `professional_resume`, `academic_cv`.
**Planned** — `cover_letter` (letter), `motivation_letter` (letter), `research_statement`
(statement).

Only shipping types are offered to a user. `shippingDocumentTypeKeys` matches the
`documentType` pgEnum in both directions, asserted by `catalogue.test.ts`, so the day a
planned type ships the test fails until the migration exists. That is the constraint on
§6's larger catalogue: **the three planned types cannot be offered without a migration**
(item 18).

## 9. Document styles

Three concrete templates — `classic`, `international`, `compact` — expressed as `--doc-*`
custom properties rather than components, with `templateSuitsType` / `compatibleTemplates`
deciding which may present a given type and `defaultTemplateIdFor` choosing sensibly.

**This is a genuine gap against §8**, which says the product is not limited to three visual
styles. The abstraction takes more (a template is data, and the style-category axis already
exists to constrain them), but only three exist, and the ATS-friendly, academic, executive
and formal styles §8 lists are absent. Not started.

## 10. Section rules per type

Each type declares its sections in order with a status of `required`, `recommended` or
`optional`; `letter` and `statement` types declare their own apparatus (`letter_date`,
`recipient`, `salutation`, `body`, `closing`, `signature`) with word ceilings — 400 for a
cover letter, 700 for a motivation letter, 1200 for a research statement.

The ordering is where types genuinely differ rather than nominally. `professional_cv` leads
with experience then education and treats achievements as optional. `professional_resume`
makes skills and achievements prominent and caps length. `academic_cv` puts education and
publications ahead of experience, and makes publications recommended rather than optional.

Selection is `section-selection.ts`: a required section appears if the dossier supports it,
a recommended one appears when populated, an optional one only when populated. **An empty
section is omitted, never stubbed, and nothing is invented to fill it** (§7). Composition
enforces this a second time — an entry whose identifying field is blank is skipped rather
than printed as an untitled stub.

## 11. How objectives affect document selection

`src/applications` models ten objective kinds — employment, internship, scholarship,
university admission, fellowship, research, grant, international programme, professional
opportunity, general profile — with `compatibility.ts` scoring objective against type and
section.

**It is not wired into the user's path.** `/documents/new` lists the three shipping types
directly and, until the copy fix in this block, called that list a "purpose". The screen now
says "document" instead, which stops it mislabelling what it asks — but the objective step
§5 and §11 describe **does not exist in the UI yet**. The module it needs is built and
tested; connecting it is the next block, not this one.

## 12. How document sets work

`documentSetFor(objectiveKind)` returns members with a `primary` role (the document
carrying the user's history) and `supporting` roles, derived from the objective and the
catalogue rather than hard-coded bundles (§9). `producibleMembers` and
`unproducibleMembers` split what can be generated today from what is merely declared;
`leadDocument` falls back to the first producible supporting document when the primary is
planned; `highestPlanRequiredBy` reports the plan a whole set would need.

Also unreachable from the UI, for the same reason as item 11.

## 13. How the architecture accommodates future types and styles

A new type is a catalogue entry: family, structure, style category, ordered sections with
statuses, availability. If it reuses existing section keys and an existing structure, no
renderer work is required, and while it is `planned` the database cannot hold it. A new
style is a template record of custom properties plus a compatibility rule. A new profile
category is a section definition, a table, a validation schema and a composition builder.

Exhaustive `Record<Key, …>` types over `as const` key lists are what make this safe: adding
a key produces compile errors at exactly the places that must be updated, which is why the
field-level audit in item 3 found no gaps.

## 14. What the writing layer currently does

`src/writing` is complete as a layer and deliberately has **no live model behind it**.
`unavailableProvider` is the *default* and fails every request, so the deterministic
fallback is the path that runs by default rather than an untested branch. Around it:
`context.ts` assembles the engine-supplied context, `prompts.ts` holds the internal prompt
library (server-side, never exposed), `response.ts` parses and bounds output, `integrity.ts`
validates it against the dossier, and `provider.ts` handles limits, timeouts, bounded
retries, fingerprinting for duplicate suppression and usage recording.

The integrity layer keeps four things apart and will keep them apart when a model is
attached: **user facts**, **application requirements**, **user-provided context** and
**model-generated language**. A job advert demanding AWS certification does not become a
certification the user holds (§11). Notes are never treated as evidence.

## 15. What remains deliberately unimplemented

No live LLM provider (§10). No payment gateway, no charging, no final price (§13). No admin
dashboard (§15). No public share mechanism, pending an explicit security design. No
speculative tables (§16). §3/§18 structured controls, §4's wider categories, §5–§8's
objective-driven selection and larger style set, and §9's document sets in the UI are all
outstanding — built where noted above, not yet reachable by a user.

## 16. Tests

- Offline harness over every `src/**/*.test.ts` — **491 pass, 0 fail across 24 files**.
  `src/profile/flow.test.ts` 29/29, including the regression suite for this defect.
- `node node_modules/typescript/bin/tsc --noEmit` — **exit 0, no output.**
- `src/auth/database.test.ts` yields 0 tests and `src/auth/session.test.ts` errors under the
  harness, both from `next/server` resolution. Pre-existing, unrelated, untouched.

The harness is `node_modules/.probe/run-tests.cjs`: it transpiles with the installed
TypeScript and runs under `node:test` with an `expect` shim. **It is not Vitest**, so
`npm test` remains unverified.

## 17. Actual browser and route verification

**Not performed. §17's route-by-route exercise did not happen, and nothing in this report
should be read as claiming it did.**

No browser tool exists in this environment; `node_modules` is win32-only, so `next build`
fails on the linux SWC binary and `npm test` cannot run; and no Postgres is reachable over
TCP, so there was no database verification either. Every claim above rests on reading the
code, on the mechanical column-by-column audit in item 3, on 491 harness tests and on a
clean typecheck.

Still to be exercised on the host, with the existing test account: `/profile`,
`/profile/basics`, and each of `/profile/{experience,education,projects,skills,credentials,
languages,memberships,links}`, plus `/profile/review`, `/documents`, `/documents/new` and a
newly created document. The specific sequence that reproduced the bug is worth running
first — save entries in a section, then save a narrower selection on `/profile/sections`,
and confirm the section still appears in the dossier and in a generated document. Also worth
confirming directly: that User A cannot reach User B's data.

## 18. Database migrations

**This block requires none.** The fix is entirely in read paths.

Two items remain outstanding from earlier work and both need the host:

- `0004_document_configuration` has not been applied — `npm run db:migrate`.
- Shipping any of the three planned document types needs a `documentType` enum migration,
  handled per §16's existing migration strategy. `catalogue.test.ts` will fail until it
  exists, which is the intended behaviour.

Existing migrations: `0000_volatile_spitfire`, `0001_elite_liz_osborn`,
`0002_bumpy_puppet_master`, `0003_bent_daredevil`, `0004_document_configuration`.

## 19. Security issues discovered

**A prototype-chain hazard, found and fixed.** `isProfileSection` and `buildDossierFlow`
both tested section keys with `in`, which answers true for `constructor`, `toString` and
`__proto__`. `isProfileSection` guards a route parameter and `buildDossierFlow` reads stored
database values, so this was reachable from a hand-written request and from a corrupt row.
The result was not a data leak — `profileSectionMap["constructor"].label` is `undefined`, so
it produced an unlabelled step pointing at a 404 — but the guard was wrong. Both now use
`Object.hasOwn`, with a regression test.

**Ownership scoping re-confirmed while tracing.** Every section read, update and delete is
scoped `and(eq(table.id, itemId), eq(table.profileId, profileId))`, and
`withoutProtectedFields` strips `id` and `profileId` from submitted values, so a request
cannot reassign a row to another profile. Nothing was weakened; no security script was
touched.

**Outstanding P0, unchanged and still live:** the Supabase `public` schema lockdown has not
been applied. It needs `npm run db:secure` with a reachable `DATABASE_DIRECT_URL` — the
direct host resolves only over IPv6 from here. The direct-connection guard must not be
weakened to work around this.

## 20. Architectural decisions that need your approval

1. **Presence is derived from data; the registry now only orders and expresses intent.** A
   section holding information is in the dossier whatever the registry says. The consequence
   is that `/profile/sections` can no longer hide saved information: a populated section is
   shown checked and locked, and removing it means deleting its entries on the section's own
   screen. The alternative — letting the picker hide populated sections — is the behaviour
   that produced this bug, so I did not preserve it. If you want a real hide-without-delete
   capability, that is a separate feature with its own visible state, not a side effect of a
   structure picker.

2. **`ProfileField.type` must be extended before §3 can be implemented.** Month, country,
   language, proficiency, education level and skill controls have no representation in the
   current union. This is the first change of the next block and worth confirming before I
   make it.

3. **The three planned document types need an enum migration to ship.** They are complete in
   the catalogue and unreachable by design. Say when you want them live and I will write the
   migration per §16 rather than bundling it with unrelated work.

---

### Against the twelve-step success criterion

Steps 1–5 (create a dossier, enter information, save, reload, **see it correctly**) are what
this block was about, and the last of those is the one that was broken. It is fixed in code
and covered by tests, but **step 5 is not yet demonstrated in a browser against a real
database**, and per item 17 that has to happen on your machine before this is called done.

Steps 6–9 (choose an objective, choose an appropriate type, choose a style, get genuinely
appropriate structure) are partly built and **not yet connected**: the objective is not asked
for, and three styles are not the range §8 asks for. Step 10 (real information used) works
through composition. Step 11 (nothing invented for an empty section) holds at two independent
layers. Step 12 (a coherent document set) is modelled and unreachable.
