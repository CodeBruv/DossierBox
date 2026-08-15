# DossierBox — Document Engine Specification

Version: MVP Foundation
Status: Source of Truth

---

## 1. Purpose

The document engine converts a user's structured career profile into a professional document appropriate for a selected purpose and context.

The engine is authoritative.

AI is subordinate to the engine.

The engine decides what a document is.

---

## 2. Core Pipeline

The conceptual pipeline is:

Profile
↓
Purpose
↓
Document Family
↓
Destination / Context
↓
Document Profile
↓
Relevant Profile Data
↓
Controlled Writing Assistance
↓
Validation
↓
Template
↓
Pagination / Layout
↓
PDF

AI does not replace any of these stages.

---

## 3. Source of Truth

The career profile is the factual source of truth.

Generated documents are derived artifacts.

A document must never become the canonical storage location for the user's career history.

The system must preserve the distinction between:

- user facts
- generated wording
- document-specific selection
- visual presentation

---

## 4. Profile Data

The engine may receive structured profile data such as:

- identity
- contact
- education
- work
- freelance work
- internships
- volunteering
- projects
- skills
- certifications
- licenses
- training
- courses
- awards
- achievements
- publications
- memberships
- languages
- links
- career objective
- other experience

The engine must tolerate missing sections.

A user without a university degree must still be able to generate an appropriate document.

---

## 5. Purpose

Purpose determines what information should matter.

Examples:

Job application:
- relevant experience
- achievements
- skills
- role alignment

Scholarship:
- education
- achievements
- leadership
- relevant experience
- academic/professional direction

Academic opportunity:
- education
- research
- publications
- teaching
- academic achievements

International opportunity:
- relevant professional history
- globally understandable structure
- appropriate destination conventions

The system should not blindly print every profile field into every document.

---

## 6. Document Family

Document families define structural expectations.

A Standard CV may include:

- contact information
- professional identity
- career objective/summary
- experience
- education
- skills
- certifications
- projects
- additional sections where useful

A Professional Résumé should generally emphasize:

- professional identity
- concise summary
- relevant skills
- experience
- measurable achievements when supplied
- selected projects
- education where relevant

An International CV may allow:

- fuller experience
- broader education
- certifications
- languages
- international context
- additional relevant sections

A Career/Academic CV may prioritize:

- academic background
- research
- publications
- teaching
- awards
- academic achievements
- professional development

Exact structure must remain configurable.

---

## 7. Destination / Context

Destination can include:

- country
- region
- industry
- role
- opportunity type
- institution type
- company
- academic context

Destination adaptation must never invent information.

It may change:

- terminology
- section emphasis
- ordering
- formatting conventions
- document expectations

The destination layer must remain separate from the visual template.

---

## 8. Document Profile

A Document Profile defines:

- allowed sections
- required sections
- optional sections
- section ordering
- field priority
- content density
- target page range
- relevant profile sources
- writing rules
- destination compatibility
- template compatibility

This is distinct from a visual template.

---

## 9. Selection

The engine should select relevant profile information.

Selection may consider:

- purpose
- document family
- destination
- role
- recency
- relevance
- completeness
- user preferences

Selection should be deterministic wherever practical.

AI may assist with relevance interpretation but must not become the sole decision-maker.

---

## 10. Writing Layer

The writing layer converts supplied facts into professional language.

Input:

Structured facts.

Output:

Controlled document-ready language.

The writing layer may:

- improve grammar
- professionalize wording
- condense
- expand supported detail
- create summaries
- create objectives
- produce professional bullets
- adapt tone

The writing layer cannot introduce facts.

---

## 11. Evidence Preservation

Every generated statement should be traceable to supplied information.

Conceptually:

Generated statement
→ source profile fields

The implementation does not necessarily need to expose this mapping to the user in the final document.

However, the system should retain enough internal structure to validate generated content.

---

## 12. Conservative Generation

If information is insufficient:

Option A:
Ask a useful follow-up question.

Option B:
Use conservative wording.

Never fill the gap with fabricated information.

Examples of forbidden assumptions:

- invented years of experience
- invented percentages
- invented responsibilities
- invented employers
- invented qualifications
- invented achievements
- invented technologies
- invented certifications

---

## 13. Document Composition

Composition combines:

- selected content
- document structure
- writing output
- template rules
- pagination rules

The engine should not simply concatenate strings.

Each section should have semantic meaning.

---

## 14. Section Model

Sections should be represented structurally.

Conceptually:

Section
- id
- type
- title
- priority
- visibility
- content
- ordering
- layout rules
- page-break rules

This allows document families to rearrange sections without rewriting the renderer.

---

## 15. Template Separation

A template controls visual presentation.

It should not contain business logic.

The same document family should be capable of using multiple templates.

The same template should ideally be capable of supporting multiple compatible document profiles.

---

## 16. Typography

Typography must be explicitly configured.

At minimum:

- font family
- body size
- heading sizes
- line height
- letter spacing where appropriate
- weight
- section spacing
- paragraph spacing
- bullet spacing

Typography should be part of the template system.

---

## 17. Page Dimensions

Templates define page dimensions.

Potential formats include:

- A4
- US Letter

Do not assume one page size globally.

Destination and document family may influence page size.

---

## 18. Pagination

Pagination is an intentional composition stage.

The renderer must consider:

- section boundaries
- heading placement
- entry continuity
- orphan headings
- widow lines
- excessive whitespace
- long entries
- page density
- target page range

Do not simply shrink everything to fit.

Do not force every document into one page.

---

## 19. Page Break Rules

A section heading should not be stranded at the bottom of a page when its content could reasonably move to the next page.

Large sections may legitimately span pages.

Page breaks should occur at sensible semantic boundaries.

The renderer should prioritize readability over arbitrary page count.

---

## 20. Long Content

The engine must handle:

- long names
- long job titles
- long company names
- long education entries
- long URLs
- long skill lists
- international characters
- multiple-page experience
- multiple certifications
- multiple projects

No field should cause uncontrolled overflow.

---

## 21. PDF

The PDF renderer is server-side.

The same semantic document should produce consistent output regardless of where generation was initiated.

PDF generation should not depend on a user's browser print settings.

---

## 22. Preview

Live preview should use the same document composition model as PDF generation.

The preview must represent the actual document rather than a simplified mockup whenever technically practical.

Avoid maintaining two independent document-generation systems.

---

## 23. Versioning

Generated documents are versioned.

A profile update must not silently overwrite historical versions.

Each version should retain enough information to reproduce the document.

Conceptually:

Profile state
+
Document configuration
+
Generated content
+
Template version
=
Reproducible document version

---

## 24. Regeneration

Regeneration should create a new document version rather than destroying the previous version.

Changes may include:

- profile updates
- purpose changes
- destination changes
- document family changes
- template changes
- writing improvements

---

## 25. Validation

Before PDF generation:

Validate:

- required sections
- field types
- content lengths
- AI output structure
- factual constraints
- template compatibility
- pagination inputs
- user ownership
- entitlement

Validation must occur server-side.

---

## 26. Failure Handling

If AI fails:

Generate from supplied information using deterministic fallback wording.

If PDF generation fails:

Preserve the user's profile and document state.

If a generation request fails:

Do not lose existing versions.

Errors should be logged server-side.

Users should receive useful messages without technical internals.

---

## 27. Extensibility

Adding a new document family should ideally involve:

1. defining its document profile
2. defining relevant sections
3. defining selection rules
4. defining destination compatibility
5. assigning compatible templates
6. adding tests

It should not require rebuilding the application.

---

## 28. Engine Boundary

The engine decides:

- document family
- structure
- sections
- allowed fields
- selection
- destination rules
- entitlement
- rendering constraints

AI assists inside those boundaries.

The renderer decides visual composition.

The profile remains factual authority.

---

## 29. Non-Goals

The engine is not:

- a chatbot
- a general writing assistant
- a blank-page CV editor
- an unrestricted AI generator
- a collection of static HTML templates

It is a structured career-document composition system.