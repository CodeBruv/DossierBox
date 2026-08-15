# DossierBox — Claude Context

## Project Identity

DossierBox is a **global career-document platform** — not a generic CV builder, chatbot, or AI generator. The core value proposition is that the product understands what the user has done, what they are trying to accomplish, and what document is appropriate for that purpose.

**Core product loop:** Profile → Purpose → Document → Preview → Share → PDF → Reuse

The user's career profile is the **factual source of truth**; documents are derived artifacts.

## Architecture

- **Framework:** Next.js 15 (App Router) + TypeScript + React 19
- **Styling:** CSS Modules + CSS custom-property design tokens (no Tailwind, no runtime CSS-in-JS)
- **Structure:** Modular monolith — `app/` for routes, `src/` for domain modules (`config`, `ui`, `lib`)
- **Server-first:** Sensitive logic stays server-side; browser handles presentation only

## Block 1 — Foundation + Visual Product Shell

### Status: Complete
- `package.json` — Next.js 15, React 19, TypeScript 5
- `tsconfig.json` — strict mode, path aliases (`@/*`, `@/ui/*`, `@/config/*`, `@/lib/*`)
- `next.config.js` — standalone output, strict mode
- `styles/tokens.css` — design token system (colors, typography scales, spacing, breakpoints, document metrics, shadows)
- `styles/base.css` — box model reset, base typography, accessible element styles
- `styles/typography.css` — font-face declarations, document-font scoping, document-ready typography helpers
- `styles/utilities.css` — token-referenced utility classes (containers, layout, text, visibility)
- `styles/print.css` — print preview baseline
- `app/globals.css` — global imports
- `app/layout.tsx` — root layout with SiteHeader, main, SiteFooter, metadata, viewport
- **Reusable UI components:** SkipLink, Button (primary/secondary/tertiary + asChild), Container, NavMenu, AuthEntry, SiteHeader, SiteFooter
- **Routes:** `/` (landing placeholder), `/templates`, `/how-it-works`, `/pricing`, `/auth/sign-in`, `/auth/sign-up`, `/terms`, `/privacy`, `/contact` (all placeholders)

### Key design decisions
- **Palette:** Near-black ink (#0f172a) on white paper, single blue accent (#2563eb). No gradients.
- **Fonts:** Instrument Sans (UI) + Charter/Sitka Text (documents, scoped to `.document-font` class)
- **Typography:** `clamp()`-based fluid responsive scale
- **Breakpoints:** 30rem / 48rem / 64rem / 80rem (mobile-first)
- **Document metrics** defined as real print units (mm, pt, in) in tokens for future PDF alignment

### Environment constraint
The sandbox cannot reach the npm registry (403 Forbidden). All verification requiring `npm install`, `tsc`, `next build`, or linting must be run on the host machine. See VERIFICATION_NOTES.md.

## Locked Product Principles (do not violate)

- Product name: DossierBox
- Global audience, Tier-1 market focus
- Reusable career profile is source of truth
- User-selected purpose → adaptive document selection
- PDF is canonical output; live preview and sharing
- Google authentication (real OAuth — Block 2, not here)
- Free / Starter / Pro plans, configuration-driven pricing
- Browser/locale-aware currency presentation
- Hidden AI writing assistant (AI cannot invent facts)
- Professional, restrained, trustworthy, premium, document-focused UI
- Secure server-side operations; never expose secrets to client

## What NOT to do in this block
- No Google OAuth implementation
- No database/auth persistence
- No career profile domain
- No document composition engine
- No AI integration
- No PDF generation
- No document versions, live sharing, payments, analytics, uploads
- Authentication entry points = visible links only, not functional auth
- No fake product data or unsupported claims
