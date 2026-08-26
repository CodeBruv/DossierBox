# DossierBox — Final System Architecture Specification

**Status:** Architecture baseline / implementation contract
**Scope:** Product, intelligence, data, document generation, UI/UX, security, billing, administration, infrastructure, and operational systems
**Principle:** DossierBox is a **professional application-document system**, not an AI writer and not a conventional CV builder.

---

## A. PRODUCT DEFINITION

### A1. Core problem

People are frequently asked to submit professional documents without knowing:

* which document they actually need;
* what structure is appropriate;
* which information from their history belongs in it;
* how different application documents relate to one another;
* how to adapt an existing successful document to a new opportunity;
* how to maintain many application variants without repeatedly rebuilding them.

DossierBox solves this by maintaining a **structured professional source of truth** and using an intelligence layer to turn that source into appropriate application documents.

### A2. Product promise

> **Keep your professional information once. DossierBox helps turn it into the documents you actually need.**

DossierBox does **not** promise employment, admission, scholarships, funding, or professional success.

It promises controlled, evidence-based document preparation.

### A3. Fundamental separation

```text
USER
 │
 ▼
DOSSIER
 │
 │  source of truth
 ▼
APPLICATION INTENT
 │
 │  what is the user trying to accomplish?
 ▼
OPPORTUNITY / CONTEXT
 │
 │  job description, scholarship, university,
 │  programme, client request, etc.
 ▼
INTELLIGENCE LAYER
 │
 │  understands + plans
 ▼
EVIDENCE SELECTION
 │
 │  what can truthfully be used?
 ▼
DOCUMENT SPECIFICATION
 │
 │  what should this document contain?
 ▼
CONTENT GENERATION / COMPILATION
 │
 ▼
VALIDATION
 │
 ▼
DOCUMENT COMPOSITION
 │
 ▼
PRESENTATION STYLE
 │
 ▼
LIVE PREVIEW
 │
 ▼
FINAL DOCUMENT
 │
 ├── PDF
 ├── DOCX
 └── other supported formats
```

The user never needs to understand this pipeline.

---

# B. THE DOSSIER

The Dossier is the permanent professional source of truth.

It is **not a CV**.

It is not limited to whatever sections happen to appear in one document.

### B1. Dossier domains

The canonical model supports extensible professional information including:

* Personal identity
* Contact information
* Professional headline
* Professional summary
* Experience
* Education
* Projects
* Skills
* Certifications
* Languages
* Awards
* Achievements
* Publications
* Research
* Conferences
* Teaching
* Memberships
* Volunteering
* Leadership
* Community involvement
* Interests
* References
* Portfolio items
* Professional affiliations
* Other evidence

The system may add domains without redesigning the document engine.

### B2. Dossier entry principle

Every entry has structured information where appropriate:

```text
Entry
 ├── identity
 ├── title
 ├── organisation
 ├── dates
 ├── location
 ├── description
 ├── achievements
 ├── skills/evidence
 ├── source
 └── metadata
```

### B3. Imported information

Users can provide:

* existing CVs;
* resumes;
* academic CVs;
* certificates;
* professional documents;
* application materials;
* other supported files;
* manually entered information.

Imported information is normalized into the Dossier.

The original document remains an input/source artifact where required.

### B4. Critical persistence rule

The Dossier must have **one canonical persistence path**.

Import, manual editing, review, document generation and future intelligence services must resolve the same authenticated owner → profile → canonical Dossier data.

There must never be:

```text
Import → temporary document data
Review → different data
Editor → another data
```

The architecture must prevent the class of failure currently observed where information exists and survives re-login but the review/dashboard surface incorrectly reports it as empty.

---

# C. APPLICATION INTENT

The user should not have to be a document expert.

The system must help determine what they need.

### C1. Intent is not simply `documentType`

Intent describes the user's objective.

Examples:

> "I found a software engineering job on Upwork."

> "I want to apply for this scholarship."

> "I'm applying for a master's programme."

> "I need something for a government job."

> "I already have a CV that worked for me and want to adapt it."

The system converts this into structured application context.

### C2. Intent model

```text
ApplicationIntent
 ├── objective
 ├── opportunityType
 ├── documentRequirements
 ├── targetRole
 ├── targetOrganisation
 ├── industry
 ├── country/region
 ├── academicLevel
 ├── programme
 ├── requestedLength
 ├── tone
 ├── deadline
 ├── suppliedOpportunity
 ├── suppliedInstructions
 └── confidence
```

Most fields are optional.

The intelligence layer asks for missing information only when it matters.

---

# D. OPPORTUNITY INTERPRETER

A user may paste or upload:

* job descriptions;
* Upwork postings;
* scholarship announcements;
* fellowship calls;
* university programme requirements;
* NGO vacancies;
* internship descriptions;
* application instructions;
* employer requests;
* admissions requirements.

The system interprets these materials.

### D1. It extracts

```text
Opportunity
 ├── organisation
 ├── role/programme
 ├── requirements
 ├── preferred qualifications
 ├── required documents
 ├── submission instructions
 ├── length restrictions
 ├── location
 ├── deadline
 ├── keywords
 ├── evaluation signals
 └── document expectations
```

### D2. It does not blindly obey the supplied text.

An uploaded job description is **application context**, not an instruction to fabricate evidence.

---

# E. INTELLIGENCE LAYER

This is the central intelligence system.

It is intentionally positioned **before expensive generation**, not after it.

```text
             INTELLIGENCE LAYER
 ┌────────────────────────────────────────────┐
 │                                            │
 │ Intent Interpreter                         │
 │ Opportunity Interpreter                   │
 │ Document Need Resolver                    │
 │ Application Planner                       │
 │ Requirement Extractor                     │
 │ Dossier Matcher                           │
 │ Evidence Selector                         │
 │ Gap Detector                              │
 │ Package Planner                           │
 │ Document Specification Builder            │
 │ Cost / Usage Planner                      │
 │                                            │
 └────────────────────────────────────────────┘
```

### E1. Why this layer exists

The intelligence layer answers:

> **"What does this person actually need?"**

before asking:

> **"What should the model write?"**

This protects both product quality and LLM economics.

---

# F. DOCUMENT NEED RESOLVER

This is a critical product capability.

The user does **not** need to know whether something should be called a CV, resume, motivation letter, personal statement, etc.

The system determines or recommends it.

Example:

```text
User:
"I want to apply for this software engineering position."

Opportunity Interpreter:
Job application
Role: Software Engineer

Document Need Resolver:
Recommended package:
1. Resume
2. Cover Letter

User:
"Okay."
```

Another:

```text
User:
"I want this master's programme."

Resolver:
Recommended:
1. Academic CV
2. Statement of Purpose
```

Another:

```text
User:
"I don't know what they want. Here are the instructions."

Resolver:
Analyses instructions
→ identifies required documents
→ explains recommendation
→ lets user override it
```

The system **recommends**, rather than pretending its recommendation is infallible.

---

# G. DOCUMENT TYPES

Document type and presentation style are separate concepts.

### G1. Initial document-type family

The architecture supports:

* Resume
* CV
* Academic CV
* Cover Letter
* Motivation Letter
* Personal Statement
* Statement of Purpose
* Research Statement
* Scholarship Letter
* Fellowship Application Letter
* Internship Application
* Professional Profile
* Portfolio
* Application-specific documents
* Additional future document types

The exact catalogue is configuration-driven.

### G2. Document type determines structure.

### G3. Presentation style determines appearance.

Therefore:

```text
Resume
   +
ATS Professional style

Resume
   +
Executive style

Resume
   +
Modern Minimal style
```

are three presentations of the same document category.

---

# H. PRESENTATION STYLE SYSTEM

DossierBox must **not** be restricted to three templates.

The three existing `.docx` files remain reference material only.

### H1. Style architecture

```text
PresentationStyle
 ├── id
 ├── category
 ├── name
 ├── description
 ├── typography
 ├── spacing
 ├── hierarchy
 ├── header treatment
 ├── section treatment
 ├── colour system
 ├── density
 ├── page behaviour
 ├── supported document types
 └── rendering configuration
```

### H2. Initial style library

A sensible initial library should contain approximately **10–12 styles**, rather than artificially stopping at three.

For example:

1. ATS Professional
2. Classic Professional
3. Modern Professional
4. Executive
5. Minimal
6. Compact
7. International
8. Academic
9. Research
10. Government / NGO
11. Technical
12. Creative Professional

Not every style is appropriate for every document type.

Compatibility is configuration-driven.

### H3. Letters have their own style family

For example:

* Traditional Business
* Modern Professional
* Minimal
* Academic
* Scholarship / Motivation
* Executive

A Resume style does not automatically become a letter style.

---

# I. DOCUMENT COMPOSITION ENGINE

The composition engine receives a **Document Specification**.

It does not decide what the user's entire life should look like.

```text
DocumentSpecification
 ├── documentType
 ├── purpose
 ├── selectedEvidence
 ├── sections
 ├── sectionOrder
 ├── visibility
 ├── length
 ├── tone
 ├── style
 ├── requiredElements
 └── constraints
```

### I1. Dynamic document sections

The engine must never assume:

```text
Profile
Experience
Education
Skills
Languages
```

are mandatory.

A research CV may require:

```text
Research
Publications
Teaching
Conferences
```

while a technical resume may require:

```text
Technical Skills
Experience
Projects
Certifications
```

The Dossier remains unchanged.

Only the document representation changes.

---

# J. EVIDENCE SYSTEM

Truthfulness is a first-class architecture concern.

```text
Dossier Evidence
       ↓
Evidence Eligibility
       ↓
Relevant Evidence
       ↓
Generated Claim
       ↓
Validation
```

The system must distinguish:

### Confirmed evidence

Directly supplied by the user.

### Derived evidence

Reasonably derived without changing factual meaning.

### Unsupported claims

Information not present in the source material.

Unsupported claims must not be invented.

The system must never manufacture:

* employers;
* positions;
* degrees;
* dates;
* publications;
* certifications;
* achievements;
* metrics;
* skills;
* responsibilities;
* awards.

---

# K. LLM COMPILER / INTERPRETER

The LLM is an **intelligence and language compiler**, not the document renderer.

### K1. LLM receives controlled context

```text
User request
     ↓
Intent
     ↓
Opportunity
     ↓
Relevant dossier evidence
     ↓
Document specification
     ↓
Controlled prompt
     ↓
LLM
```

### K2. LLM returns structured content

Not arbitrary HTML.

Not arbitrary CSS.

Not arbitrary document layouts.

Example:

```text
{
  summary,
  sections,
  entries,
  claims,
  evidenceReferences,
  warnings
}
```

### K3. Deterministic renderer

```text
LLM content
     ↓
Validation
     ↓
Composition Engine
     ↓
Style Engine
     ↓
Rendered Document
```

This separation is non-negotiable.

---

# L. COST-EFFICIENT INTELLIGENCE PIPELINE

The LLM should not receive the entire Dossier and entire opportunity every time.

### L1. Processing stages

```text
Stage 0 — deterministic parsing
Stage 1 — cheap extraction/classification
Stage 2 — structured context creation
Stage 3 — dossier filtering
Stage 4 — evidence matching
Stage 5 — document planning
Stage 6 — LLM generation
Stage 7 — validation
```

Only the stages requiring language reasoning consume significant LLM resources.

### L2. Reusable intelligence

Cache normalized:

* opportunity requirements;
* extracted job requirements;
* dossier embeddings/indexes where appropriate;
* document specifications;
* validated intermediate representations.

A user changing template colour should **never trigger another LLM call**.

Changing presentation style is deterministic.

Changing section order is deterministic.

Previewing is deterministic.

The LLM is called only when content intelligence is actually required.

---

# M. APPLICATION MATCHING ENGINE

The matching engine compares:

```text
Opportunity requirements
          +
User evidence
          ↓
Requirement ↔ Evidence mapping
```

It identifies:

* strong matches;
* weak matches;
* missing evidence;
* relevant experience;
* relevant skills;
* relevant projects;
* relevant education;
* relevant achievements.

The output guides document composition.

It does not fabricate missing qualifications.

---

# N. APPLICATION PACKAGES

Applications frequently require multiple documents.

A package is a first-class object.

Examples:

### Job Package

```text
Resume
+
Cover Letter
```

### Scholarship Package

```text
CV
+
Motivation Letter
```

### Master's Package

```text
Academic CV
+
Statement of Purpose
```

### Fellowship Package

```text
CV
+
Personal Statement
+
Motivation Letter
```

Documents in a package share the same application context and evidence model.

They must complement one another rather than repeat identical content.

---

# O. DOCUMENT WORKSPACE

After planning, the user enters the document workspace.

### Desktop

```text
┌─────────────────────────────────────────────────────────┐
│ DossierBox        Application        Save      Export   │
├───────────────────────┬─────────────────────────────────┤
│ Configuration         │                                 │
│                       │          LIVE DOCUMENT          │
│ Purpose               │                                 │
│ Document              │                                 │
│ Template              │                                 │
│ Sections              │                                 │
│ Visibility            │                                 │
│ Order                 │                                 │
│                       │                                 │
│                       │                                 │
└───────────────────────┴─────────────────────────────────┘
```

The preview is a primary workspace element, not an afterthought.

---

# P. MOBILE UI/UX

Mobile is **not a collapsed desktop interface**.

It receives its own information architecture.

### P1. Mobile creation flow

```text
1. What are you applying for?
        ↓
2. What did they ask you to submit?
        ↓
3. Confirm recommendation
        ↓
4. Review your information
        ↓
5. Choose document/style
        ↓
6. Live preview
        ↓
7. Adjust
        ↓
8. Create
```

### P2. Mobile principles

* one primary decision per screen;
* thumb-friendly controls;
* bottom action bar;
* large touch targets;
* minimal simultaneous controls;
* horizontal template gallery;
* full-screen preview mode;
* collapsible configuration groups;
* persistent save/create action;
* no desktop sidebars squeezed into a narrow screen.

### P3. Mobile preview

The preview is a deliberate mobile experience:

```text
[ Preview ]

       ↓

[ Full-screen preview ]

       ↓

[ Back to editing ]
```

The document must remain legible at actual mobile dimensions.

### P4. Mobile template selection

Templates are visual cards.

The user sees the actual design language rather than cryptic names.

```text
← ATS → Classic → Modern → Executive → Academic →
```

Swipeable, touch-friendly, with immediate preview.

---

# Q. DESKTOP UI/UX

Desktop supports simultaneous configuration and preview.

### Q1. Desktop architecture

```text
Header
Application context
─────────────────────────────────────
Configuration     │     Live Preview
                  │
                  │
                  │
─────────────────────────────────────
Document actions
```

The preview remains visible while configuration changes.

### Q2. Desktop information density

Desktop may expose:

* application context;
* document type;
* recommended package;
* template gallery;
* section controls;
* visibility;
* ordering;
* content warnings;
* evidence gaps;
* export options.

This information should not all be dumped onto mobile.

---

# R. DOSSIER REVIEW UI

The Dossier dashboard must show the actual persisted source of truth.

### Summary

```text
My Dossier
────────────────────
Profile completeness
8 of 8 sections complete
```

But that number must come from canonical persisted data.

No fake counters.

### Section cards

Each section displays:

* real entry count;
* representative entries;
* edit action;
* empty state only when actually empty.

If an entry exists in the database, Review must be able to resolve it.

This is one of the highest-priority correctness requirements in the current application.

---

# S. SECTION EDITOR

Each section supports:

* viewing;
* editing;
* adding;
* deleting;
* ordering where relevant;
* saving;
* validation.

The editor reads/writes the same canonical Dossier.

No duplicate storage.

---

# T. DOCUMENT PREVIEW

The preview is deterministic.

Inputs:

```text
Document type
Purpose
Selected evidence
Sections
Order
Visibility
Presentation style
Content
```

The preview changes immediately.

Changing style must not regenerate content.

Changing section order must not consume LLM credits.

Changing visibility must not consume LLM credits.

---

# U. EXPORT SYSTEM

```text
Document Specification
       ↓
Final Composition
       ↓
Export Renderer
       ├── PDF
       ├── DOCX
       └── supported future formats
```

Browser print is not the authoritative export mechanism.

Exported documents must reproduce the deterministic composition.

---

# V. VERSIONING & HISTORY

Documents and application configurations require version history.

```text
Application
 ├── Version 1
 ├── Version 2
 ├── Version 3
 └── Current
```

The original Dossier remains intact.

A document variation is not a mutation of the source Dossier.

Users can:

* duplicate;
* revise;
* rename;
* archive;
* restore;
* compare versions where supported.

---

# W. DATA ARCHITECTURE

Core entities:

```text
User
 └── Dossier
      ├── DossierEntry
      └── SourceArtifact

Application
 ├── ApplicationIntent
 ├── Opportunity
 ├── ApplicationPackage
 │    └── Document
 │         ├── DocumentSpecification
 │         ├── DocumentVersion
 │         └── Export
 │
 ├── MatchingResult
 ├── EvidenceSelection
 └── Generation

PresentationStyle
DocumentType
Prompt
PromptVersion

Subscription
Plan
Entitlement
UsageLedger
Payment
WebhookEvent

AuditEvent
AdminUser
AdminAction
```

---

# X. SUBSCRIPTION MODEL

The commercial architecture is fixed from the beginning.

Pricing is global, while payment presentation may adapt to currency, taxes and payment method.

### Free — $0

**Purpose:** discovery and Dossier utility.

* 1 Dossier
* basic Dossier management
* basic document creation
* limited templates/styles
* no LLM generation quota
* basic exports
* limited storage
* Dossier sharing with branding
* application history limited

The free tier demonstrates the product without creating uncontrolled LLM expense.

### Plus — $9/month

**Purpose:** active applicants.

* up to 5 Dossiers
* full document-type catalogue
* full initial style library
* 10 intelligence/generation units per month
* application matching
* application packages
* tailored documents
* standard export
* expanded storage
* document history
* private sharing
* saved applications

### Professional — $19/month

**Purpose:** high-volume applicants, freelancers, consultants and professionals.

* unlimited Dossiers within reasonable abuse/storage policy
* full document catalogue
* full style library
* 30 intelligence/generation units/month
* application matching
* larger application packages
* advanced tailoring
* priority processing
* expanded storage
* advanced history/versioning
* private sharing
* analytics where applicable
* priority support

**No unlimited LLM usage is promised.**

That protects the business from an unexpectedly expensive user.

---

# Y. INTELLIGENCE USAGE MODEL

Do not expose raw tokens to users.

Use **Intelligence Units**.

A unit represents a controlled amount of expensive processing.

Internally:

```text
Intelligence Unit
      ↓
provider/model cost
      ↓
usage ledger
```

Different operations can have different internal costs.

For example:

```text
Simple classification       low cost
Opportunity parsing         low cost
Document tailoring          medium
Full application package    higher
Large document compilation  higher
```

The user sees:

> **8 intelligence uses remaining**

not:

> 74,821 tokens remaining.

This allows DossierBox to change providers and models without changing its product pricing.

---

# Z. LLM PROVIDER GATEWAY

Provider abstraction:

```text
LLM Gateway
 ├── Provider A
 ├── Provider B
 ├── Provider C
 └── Local/self-hosted provider
```

The application generation system does not depend on one provider.

The gateway handles:

* provider selection;
* model selection;
* timeout;
* retry;
* fallback;
* token accounting;
* cost accounting;
* structured output;
* safety limits;
* failure logging.

---

# AA. PROMPT LIBRARY

Prompts are versioned application assets.

Categories include:

* intent interpretation;
* opportunity interpretation;
* requirement extraction;
* matching;
* resume tailoring;
* CV composition;
* cover letters;
* motivation letters;
* personal statements;
* research statements;
* academic documents;
* professional summaries;
* achievement extraction;
* experience rewriting;
* consistency validation;
* factuality validation;
* tone;
* length;
* package coordination.

Prompts must be versioned and auditable.

---

# AB. SECURITY — INFORMATION BUNKER

DossierBox handles sensitive professional information.

### Authentication

* secure sessions;
* OAuth;
* password security if passwords exist;
* session expiry;
* account recovery;
* MFA roadmap;
* device/session management.

### Authorization

Every protected operation verifies:

```text
authenticated user
      +
resource ownership
      +
server-side authorization
```

No client-side ownership assumptions.

### Database

* least privilege;
* RLS where appropriate;
* separate privileged operations;
* encrypted connections;
* secure migrations;
* backups;
* recovery procedures.

### Application

Protect against:

* XSS;
* CSRF;
* injection;
* SSRF;
* unsafe uploads;
* malicious documents;
* oversized files;
* malicious filenames;
* unauthorized export;
* enumeration;
* abuse.

---

# AC. LLM SECURITY

User content is untrusted input.

A job description saying:

> "Ignore previous instructions..."

must remain job-description content.

It must never become system instruction.

Context boundaries:

```text
System instructions
      ↓
Dossier evidence
      ↓
Application context
      ↓
Opportunity content
      ↓
LLM
```

Cross-user context contamination must be impossible through application architecture.

The LLM must never receive another user's dossier.

---

# AD. FILE SECURITY

Uploaded documents are treated as hostile input.

Pipeline:

```text
Upload
 ↓
Validation
 ↓
File-type verification
 ↓
Size limits
 ↓
Malware/security scanning where supported
 ↓
Sandboxed parsing
 ↓
Content extraction
 ↓
Normalized evidence
```

Original files are not trusted as executable content.

---

# AE. BILLING & ENTITLEMENTS

The server owns entitlement truth.

```text
Payment
   ↓
Subscription
   ↓
Entitlement
   ↓
Usage authorization
```

Frontend displays entitlement.

It does not determine entitlement.

### Lifecycle

Supports:

* activation;
* renewal;
* cancellation;
* expiry;
* failed payment;
* grace period;
* upgrade;
* downgrade;
* refund;
* webhook replay;
* duplicate webhook events;
* provider outage.

Expired Plus/Professional users immediately fall back to Free entitlements according to the defined grace policy.

---

# AF. PAYMENT ARCHITECTURE

Payment provider abstraction:

```text
Payment Gateway
 ├── Provider A
 ├── Provider B
 └── future provider
```

The core subscription system stores DossierBox's own:

* customer;
* subscription;
* plan;
* entitlement;
* transaction;
* invoice;
* payment state.

Provider IDs are external references, not the business model itself.

This keeps DossierBox capable of serving international users.

---

# AG. USAGE LEDGER

Every billable intelligence operation creates an immutable usage record.

```text
Usage
 ├── user
 ├── subscription
 ├── operation
 ├── units
 ├── provider
 ├── model
 ├── cost estimate
 ├── timestamp
 └── generation reference
```

This provides the basis for:

* quota enforcement;
* cost monitoring;
* billing;
* abuse detection;
* profitability analysis.

---

# AH. ADMIN SYSTEM

Administration is a separate protected system.

```text
Admin
 ├── Users
 ├── Dossiers
 ├── Applications
 ├── Documents
 ├── Templates
 ├── Document Types
 ├── Prompts
 ├── Prompt Versions
 ├── Providers
 ├── Models
 ├── Subscriptions
 ├── Plans
 ├── Entitlements
 ├── Usage
 ├── Payments
 ├── Webhooks
 ├── Generation failures
 ├── Abuse
 ├── Security events
 ├── Audit logs
 └── System health
```

Administrative privileges are server-side.

Admin actions are audited.

---

# AI. ADMIN TEMPLATE MANAGEMENT

Administrators can manage presentation styles without changing the document engine.

```text
Style
 ├── metadata
 ├── compatibility
 ├── typography
 ├── spacing
 ├── layout
 ├── colour
 ├── preview
 ├── status
 └── version
```

New styles can therefore be introduced independently.

---

# AJ. ADMIN PROMPT MANAGEMENT

Administrators can:

* create prompt versions;
* activate/deactivate versions;
* compare versions;
* assign prompts to document types;
* roll back;
* inspect generation failures;
* monitor cost.

Prompt changes must be versioned.

---

# AK. ADMIN OBSERVABILITY

Operational dashboard:

```text
Users
Active subscriptions
LLM usage
LLM cost
Generation success rate
Generation latency
Export failures
Payment failures
Webhook failures
Authentication failures
Security events
Storage
Database health
Queue health
```

No sensitive document content should be exposed unnecessarily to administrators.

---

# AL. AUDIT SYSTEM

Audit events cover:

* authentication;
* authorization failures;
* Dossier changes;
* document creation;
* document deletion;
* export;
* subscription changes;
* payment events;
* entitlement changes;
* admin actions;
* security events;
* LLM generation events.

Audit records should be append-oriented and tamper-resistant.

---

# AM. INFRASTRUCTURE

Logical architecture:

```text
                    ┌──────────────┐
                    │    Client    │
                    │ Mobile/Web   │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ Application  │
                    │ API / Server │
                    └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
   Dossier Service   Intelligence       Document Engine
                         Layer
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                    ┌──────▼───────┐
                    │ Data Layer   │
                    └──────────────┘

External:
 ├── LLM Gateway
 ├── Payment Gateway
 ├── Object Storage
 ├── Email
 └── Security/Scanning
```

---

# AN. CACHING & PERFORMANCE

Cache deterministic and reusable work.

Never regenerate because:

* the user reopened the preview;
* the user changed colour;
* the user changed template;
* the user reordered sections;
* the user toggled visibility.

Expensive intelligence is cached against stable inputs where safe.

---

# AO. BACKGROUND PROCESSING

Long-running work may use asynchronous jobs:

```text
Request
 ↓
Job
 ↓
Queue
 ↓
Worker
 ↓
LLM / Parser / Export
 ↓
Result
```

This is especially important for:

* large imports;
* large opportunity analysis;
* application packages;
* complex exports;
* large document processing.

---

# AP. ERROR HANDLING

The system must distinguish:

```text
User error
Authentication error
Authorization error
Validation error
Import error
LLM failure
Provider failure
Payment failure
Export failure
Infrastructure failure
```

Users receive useful explanations.

Internal diagnostic information remains internal.

---

# AQ. DESIGN SYSTEM

The product maintains one design language but not one layout.

Shared:

* typography;
* colour tokens;
* spacing;
* iconography;
* controls;
* accessibility;
* component behaviour.

Different information architecture for:

* mobile;
* desktop;
* Dossier;
* application planning;
* document editing;
* administration.

---

# AR. ACCESSIBILITY

Target:

* keyboard navigation;
* screen-reader semantics;
* focus management;
* sufficient contrast;
* touch target sizing;
* reduced-motion support;
* error announcements;
* accessible document controls.

Accessibility is tested independently on mobile and desktop.

---

# AS. INTERNATIONALIZATION

Architecture supports:

* multiple currencies;
* locale-specific dates;
* country-specific document conventions;
* international document styles;
* future multilingual UI;
* region-specific application requirements.

Country is an application context, not a pricing discrimination mechanism.

---

# AT. DOCUMENT CONVENTIONS

The engine understands that document conventions vary by:

* country;
* industry;
* profession;
* academic context;
* organisation;
* document type.

The style system therefore describes **presentation**, while the document-type system describes **structure**, and the intelligence layer determines **appropriateness**.

---

# AU. APPLICATION FLOW

The canonical user journey is:

```text
Sign in
  ↓
Dossier
  ↓
Create application
  ↓
"Tell us what you're applying for"
  ↓
Paste/upload opportunity OR describe it
  ↓
Intelligence interprets
  ↓
Recommended application package
  ↓
User confirms/adjusts
  ↓
Evidence matching
  ↓
Document specification
  ↓
Choose presentation styles
  ↓
Generate/compile content
  ↓
Validation
  ↓
Live preview
  ↓
Customize
  ↓
Save
  ↓
Export
```

The system does **not** begin with:

> "Choose Academic CV / Resume / Cover Letter."

unless the user already knows what they want.

---

# AV. DIRECT CREATION MODE

Expert users can bypass recommendations.

Example:

> "Create a two-page technical resume using my existing successful resume as the basis."

DossierBox accepts this intent.

The intelligent system still validates the request against the Dossier and document rules.

---

# AW. SUCCESSFUL EXISTING DOCUMENT MODE

This is particularly important to the product vision.

A user can upload a document that previously helped them obtain:

* a job;
* scholarship;
* admission;
* fellowship;
* contract;
* promotion.

DossierBox can extract its structure and evidence into the Dossier/context.

It can then create variants without treating the old document as the permanent source of truth.

```text
Successful Existing Document
          ↓
Evidence Extraction
          ↓
Dossier
          ↓
New Application
          ↓
New Document Variant
```

---

# AX. APPLICATION PIPELINE AT SCALE

For a user applying to 30 opportunities:

```text
Master Dossier
      ↓
Opportunity 1 → Application 1 → Resume + Letter
Opportunity 2 → Application 2 → Resume + Letter
Opportunity 3 → Application 3 → Resume + Letter
...
Opportunity 30
```

The Dossier does not get rewritten 30 times.

Only application context and document representations change.

This is a central product advantage.

---

# AY. SOURCE-OF-TRUTH RULES

These are architectural laws.

### Rule 1

Dossier is the source of truth for professional facts.

### Rule 2

Application is the source of truth for application context.

### Rule 3

Document is a representation of an application.

### Rule 4

Presentation style controls appearance.

### Rule 5

LLM generates language, not layout.

### Rule 6

Renderer generates layout, not facts.

### Rule 7

Server controls entitlements.

### Rule 8

Usage ledger controls intelligence consumption.

### Rule 9

Admin cannot silently mutate user-owned content.

### Rule 10

Mobile is its own product experience, not a shrunken desktop.

---

# AZ. FINAL SYSTEM MAP

```text
                              DOSSIERBOX
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                USER EXPERIENCE             ADMIN
                    │                           │
          ┌─────────┴─────────┐        ┌───────┴────────┐
          │                   │        │                │
       MOBILE              DESKTOP   Operations      Security
          │                   │        Billing        Prompts
          └─────────┬─────────┘        Styles         Models
                    │                  Usage          Users
                    ▼
                 DOSSIER
                    │
                    ▼
           APPLICATION INTENT
                    │
                    ▼
        OPPORTUNITY INTERPRETER
                    │
                    ▼
          INTELLIGENCE LAYER
          ┌─────────┼─────────┐
          │         │         │
       Intent    Matching   Planning
       Parser     Engine    Engine
          │         │         │
          └─────────┼─────────┘
                    ▼
          APPLICATION CONTEXT
                    │
                    ▼
           EVIDENCE ENGINE
                    │
                    ▼
        DOCUMENT SPECIFICATION
                    │
                    ▼
             LLM GATEWAY
          ┌─────────┼─────────┐
          │         │         │
       Provider   Prompt    Usage
       Abstraction Library   Meter
          │         │         │
          └─────────┼─────────┘
                    ▼
           GENERATED CONTENT
                    │
                    ▼
              VALIDATION
                    │
                    ▼
        DOCUMENT COMPOSITION
                    │
                    ▼
        PRESENTATION ENGINE
          ┌─────────┼─────────┐
          │         │         │
       10+ Styles  Layout   Typography
          │         │         │
          └─────────┼─────────┘
                    ▼
              LIVE PREVIEW
                    │
                    ▼
             DOCUMENT WORKSPACE
                    │
              ┌─────┴─────┐
              │           │
             SAVE       EXPORT
              │       ┌───┼────┐
              │       │   │    │
              │      PDF DOCX Other
              │
              ▼
           HISTORY
              │
              ▼
         APPLICATION VAULT


        CROSS-CUTTING SYSTEMS
        ──────────────────────
        Authentication
        Authorization
        Security
        Audit
        Billing
        Entitlements
        Usage
        Storage
        Observability
        Notifications
        Internationalization
        Accessibility
```

## Final architectural position

**DossierBox is not fundamentally a resume generator.**

It is a **source-of-truth professional information system + application intelligence layer + deterministic document compiler**.

The intelligence layer determines **what the user is trying to accomplish and what evidence is relevant**.

The LLM turns approved evidence and specifications into language.

The document engine determines **what the document is**.

The presentation engine determines **how it looks**.

The Dossier remains untouched as the user's professional record.

The application remains the context.

The document remains the output.

And the user does not need to know any of that to use DossierBox.
