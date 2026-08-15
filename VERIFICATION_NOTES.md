# Verification Notes — Block 1

## Environment Constraint

The development sandbox **cannot reach the npm registry**. All package
installations (`npm install`, `pnpm add`) and build-tool execution
(`tsc`, `eslint`, `next build`, `next lint`) return **E403 403 Forbidden**
through the egress proxy.

This means: TypeScript compilation, ESLint, and `next build` **cannot
be executed inside this environment**. They must be run on the host
machine.

## What Was Verified By Inspection

- All `.tsx` files use proper type annotations (no implicit `any`)
- Path aliases in `tsconfig.json` map to real directories:
  - `@/*` → `./*`
  - `@/ui` → `./src/ui/index.ts`
  - `@/config/*` → `./src/config/*`
  - `@/lib/*` → `./src/lib/*`
- CSS Module class names in `.module.css` files match what `styles.xxx`
  references in components
- No `clsx` dependency — replaced with local `src/lib/cx.ts` (140 bytes)
- No React namespace issues — all `ReactNode` types imported explicitly
- No secrets, mock credentials, or fake integrations committed
- All routes that the navigation references have corresponding `page.tsx` files
- Auth entry points route to placeholder pages only (no functional auth)

## What Could NOT Be Verified Here

- `npm install` — requires registry access
- `tsc --no-emit` — requires installed dependencies
- `next lint` — requires installed dependencies
- `next build` / `next dev` — requires installed dependencies
- Runtime rendering / browser behavior — no browser available

## Required Actions On Your Machine

```bash
cd /path/to/DossierBox

# 1. Install dependencies (requires npm registry access)
npm install

# 2. Type check
npm run typecheck        # tsc --no-emit

# 3. Lint
npm run lint             # next lint

# 4. Build
npm run build            # next build

# 5. Run dev server
npm run dev              # http://localhost:3000

# 6. Verify all nav links work:
#    /, /templates, /how-it-works, /pricing, /auth/sign-in, /auth/sign-up
#    /terms, /privacy, /contact
```

## Files Created (Block 1)

```
package.json
tsconfig.json
next.config.js
.eslintrc.json
.env.example
.gitignore
.next-env.d.ts
styles/
  tokens.css        — design tokens (colors, typography, spacing, breakpoints)
  base.css          — reset + base element styles
  typography.css    — font-face + document-font scoping + document helpers
  utilities.css     — utility classes (token-referenced)
  print.css         — print preview baseline
  ui/
    button.module.css
    container.module.css
    nav-menu.module.css
    site-header.module.css
    site-footer.module.css
    auth-entry.module.css
    skip-link.module.css
src/
  config/
    paths.ts         — nav links + route config (source of truth)
  lib/
    cx.ts            — tiny className utility (replaces clsx)
    index.ts
  ui/
    index.ts         — UI barrel
    button.tsx       — Button (primary/secondary/tertiary + asChild)
    container.tsx    — Container (centered wrapper)
    nav-menu.tsx     — NavMenu (reused desktop + mobile)
    skip-link.tsx    — SkipLink (keyboard accessibility)
    auth-entry.tsx   — AuthEntry (visible placeholder links)
    site-header.tsx  — SiteHeader (desktop nav + mobile drawer)
    site-footer.tsx  — SiteFooter (sitemap + auth + copyright)
app/
  globals.css        — global CSS imports
  layout.tsx         — root layout (SiteHeader, main, SiteFooter)
  page.tsx           — landing placeholder
  templates/page.tsx — placeholder
  how-it-works/page.tsx — placeholder
  pricing/page.tsx   — placeholder
  auth/sign-in/page.tsx  — placeholder (not functional)
  auth/sign-up/page.tsx  — placeholder (not functional)
  terms/page.tsx
  privacy/page.tsx
  contact/page.tsx
public/
  favicon.ico
```
