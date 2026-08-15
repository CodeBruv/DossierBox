# DossierBox — Hidden AI Writing System

Version: MVP Foundation
Status: Source of Truth

---

## 1. Role of AI

AI is an internal writing assistant.

AI is not the product.

The user should not feel like they are chatting with an AI.

The interface should simply present useful results.

Do not expose:

- model names
- prompts
- tokens
- AI scores
- chatbot interfaces
- "Ask AI"
- "AI generated"
- AI branding

---

## 2. Architecture

Correct:

Engine
→ Context
→ AI Writing Assistance
→ Validation
→ Document Renderer

Incorrect:

User
→ AI
→ Entire Document

The application engine remains authoritative.

---

## 3. Source of Truth

AI may only work from supplied user information and controlled system context.

The user's career profile is factual authority.

AI cannot establish new facts.

---

## 4. Allowed Operations

AI may:

- improve grammar
- improve clarity
- professionalize rough wording
- expand sufficiently detailed descriptions
- condense verbose descriptions
- turn plain descriptions into professional bullets
- create career objectives from supplied information
- create professional summaries
- reorganize supplied information
- adapt tone to document purpose
- adapt wording to professional context
- identify incomplete information
- suggest useful follow-up questions

---

## 5. Forbidden Operations

AI must never fabricate:

- employers
- job titles
- dates
- qualifications
- degrees
- certifications
- licenses
- skills
- projects
- achievements
- awards
- statistics
- percentages
- responsibilities
- publications
- locations
- years of experience
- technologies
- clients
- companies

Never infer a specific fact merely because it is common for a profession.

---

## 6. Conservative Writing

If the user says:

> "I helped customers use the company's software."

The AI may produce a more professional expression of that fact.

It must not produce:

> "Managed a portfolio of 200 enterprise customers."

unless that number and responsibility were supplied.

Professional writing must not become factual invention.

---

## 7. Career Objectives

Career objectives may be generated from:

- supplied career direction
- supplied skills
- supplied experience
- supplied education
- supplied target purpose

If insufficient information exists, the system should either ask for more information or use conservative wording.

Never invent a target career.

---

## 8. Professional Summaries

A professional summary may be composed from supplied:

- experience
- skills
- projects
- education
- career direction
- achievements

It must remain grounded in the profile.

---

## 9. Achievement Writing

AI can improve achievement descriptions when evidence exists.

It may make existing results clearer.

It must not invent metrics.

Example:

User:
> "I reduced the time we spent checking orders."

AI may improve wording.

AI may NOT decide that this means:

> "Reduced processing time by 35%."

unless 35% was provided.

---

## 10. Missing Information

When important information is missing, the AI should not guess.

Possible response paths:

1. Ask a targeted follow-up question.
2. Produce conservative wording.
3. Omit the claim.

The document engine decides whether missing information blocks generation.

---

## 11. Structured Input

Do not send arbitrary application state to the model.

Create structured context.

Conceptually:

```text
Document purpose
Document family
Destination/context
Relevant profile facts
Section requirements
Writing constraints
Output schema