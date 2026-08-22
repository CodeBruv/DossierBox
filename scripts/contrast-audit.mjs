#!/usr/bin/env node
/**
 * Token contrast audit.
 *
 * Computes WCAG 2.1 contrast ratios for the foreground/background pairs the
 * application actually renders, in both themes, so readability problems are
 * found by measurement rather than by eye.
 *
 * Usage: node scripts/contrast-audit.mjs
 */

import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");

/** Extracts one `--token: value;` declaration set from a block of CSS. */
function readBlock(startPattern) {
  const start = css.indexOf(startPattern);
  if (start === -1) throw new Error(`Block not found: ${startPattern}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = css.slice(open + 1, end);
  const tokens = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

const light = readBlock(":root {");
const darkExplicit = readBlock(':root[data-theme="dark"]');
const darkSystem = readBlock(':root[data-theme="system"]');
const dark = { ...light, ...darkExplicit };

/*
 * The dark palette is declared twice — once for the explicit `data-theme="dark"`
 * choice and once inside `@media (prefers-color-scheme: dark)` for users on
 * "system". Plain CSS has no way to share one declaration block across a
 * media-conditional and an unconditional selector, so the duplication is
 * structural. What is avoidable is silent drift between the two copies, which is
 * exactly how a token gets fixed in one theme path and stays broken in the other.
 */
const driftedTokens = [];
for (const name of new Set([...Object.keys(darkExplicit), ...Object.keys(darkSystem)])) {
  if (name === "--ds-focus-ring") continue; // resolved from --ds-color-focus, never restated
  if (darkExplicit[name] !== darkSystem[name]) {
    driftedTokens.push(
      `${name}: data-theme="dark" has ${darkExplicit[name] ?? "(missing)"}, ` +
        `prefers-color-scheme has ${darkSystem[name] ?? "(missing)"}`,
    );
  }
}

function resolve(tokens, value, seen = 0) {
  if (seen > 10) throw new Error(`Cyclic token: ${value}`);
  const match = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!match) return value.trim();
  const next = tokens[match[1]];
  if (!next) throw new Error(`Unresolved token: ${match[1]}`);
  return resolve(tokens, next, seen + 1);
}

function toRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/**
 * [foreground token, background token, label, minimum].
 * 4.5 = normal body text, 3.0 = large text / UI component boundaries
 * (WCAG 1.4.3 and 1.4.11).
 */
const pairs = [
  ["--ds-color-text-primary", "--ds-color-background", "body text on page", 4.5],
  ["--ds-color-text-primary", "--ds-color-surface", "body text on card", 4.5],
  ["--ds-color-text-primary", "--ds-color-surface-subtle", "body text on subtle panel", 4.5],
  ["--ds-color-text-secondary", "--ds-color-background", "secondary text on page", 4.5],
  ["--ds-color-text-secondary", "--ds-color-surface", "secondary text on card", 4.5],
  ["--ds-color-text-secondary", "--ds-color-surface-subtle", "secondary on subtle panel", 4.5],
  ["--ds-color-text-muted", "--ds-color-background", "muted text on page", 4.5],
  ["--ds-color-text-muted", "--ds-color-surface", "muted text on card", 4.5],
  ["--ds-color-text-muted", "--ds-color-surface-subtle", "muted on subtle panel", 4.5],
  ["--ds-color-text-inverse", "--ds-color-surface-inverse", "inverse text on slab", 4.5],
  ["--ds-color-text-inverse-secondary", "--ds-color-surface-inverse", "inverse secondary on slab", 4.5],
  ["--ds-color-brand-on-inverse", "--ds-color-surface-inverse", "brand link on slab", 4.5],
  ["--ds-color-brand-primary", "--ds-color-background", "accent link on page", 4.5],
  ["--ds-color-brand-primary", "--ds-color-surface", "accent link on card", 4.5],
  ["--ds-color-brand-primary", "--ds-color-surface-subtle", "accent link on subtle panel", 4.5],
  ["--ds-color-brand-foreground", "--ds-color-brand-primary", "primary button label", 4.5],
  ["--ds-color-brand-foreground", "--ds-color-brand-hover", "primary button label, hover", 4.5],
  ["--ds-color-brand-foreground", "--ds-color-brand-active", "primary button label, active", 4.5],
  ["--ds-color-text-primary", "--ds-color-interaction-hover", "text on hover surface", 4.5],
  ["--ds-color-text-primary", "--ds-color-interaction-selected", "text on selected surface", 4.5],
  ["--ds-color-text-primary", "--ds-color-brand-surface", "text on brand surface", 4.5],
  ["--ds-color-brand-primary", "--ds-color-brand-surface", "accent on brand surface", 4.5],
  ["--ds-color-success", "--ds-color-success-surface", "success message", 4.5],
  ["--ds-color-warning", "--ds-color-warning-surface", "warning message", 4.5],
  ["--ds-color-destructive", "--ds-color-destructive-surface", "error message", 4.5],
  ["--ds-color-info", "--ds-color-info-surface", "info message", 4.5],
  ["--ds-color-destructive", "--ds-color-surface", "field error text on card", 4.5],
  ["--ds-color-destructive", "--ds-color-background", "field error text on page", 4.5],
  ["--ds-color-interaction-disabled", "--ds-color-surface", "disabled control label", 3],
  /*
   * border-default is a divider/rule colour and is intentionally quiet, so it is
   * measured for information only (min 1). Anything that outlines an interactive
   * control uses border-control, which must clear 3:1 per WCAG 1.4.11.
   */
  ["--ds-color-border-default", "--ds-color-surface", "divider on card (decorative)", 1],
  ["--ds-color-border-default", "--ds-color-background", "divider on page (decorative)", 1],
  ["--ds-color-border-control", "--ds-color-surface", "control border on card", 3],
  ["--ds-color-border-control", "--ds-color-background", "control border on page", 3],
  ["--ds-color-border-control", "--ds-color-surface-subtle", "control border on subtle panel", 3],
  ["--ds-color-border-control-hover", "--ds-color-surface", "control border, hover, on card", 3],
  ["--ds-color-border-control-hover", "--ds-color-background", "control border, hover, on page", 3],
  ["--ds-color-border-strong", "--ds-color-surface", "decorative rule (informational)", 1],
  ["--ds-color-focus", "--ds-color-background", "focus ring on page", 3],
  ["--ds-color-focus", "--ds-color-surface", "focus ring on card", 3],
  ["--ds-color-focus", "--ds-color-surface-inverse", "focus ring on slab", 3],
  ["--ds-color-border-inverse", "--ds-color-surface-inverse", "control border on slab", 3],
  /*
   * The document sheet is theme-independent by design (see tokens.css), so these
   * report the same ratio in both themes. They are measured anyway because the
   * document preview is the part of the product a person reads most closely, and
   * because a future template change to ink or paper must not quietly fall below
   * target.
   */
  ["--ds-document-ink", "--ds-document-paper", "document body text", 4.5],
  ["--ds-document-ink-weak", "--ds-document-paper", "document meta text", 4.5],
  ["--ds-document-rule", "--ds-document-paper", "document rule (decorative)", 1],
];

let failures = 0;
for (const [themeName, tokens] of [["light", light], ["dark", dark]]) {
  console.log(`\n${themeName.toUpperCase()}`);
  for (const [fg, bg, label, min] of pairs) {
    const fgValue = resolve(tokens, tokens[fg] ?? "");
    const bgValue = resolve(tokens, tokens[bg] ?? "");
    const value = ratio(fgValue, bgValue);
    const pass = value >= min;
    if (!pass) failures += 1;
    console.log(
      `${pass ? "  ok  " : "  FAIL"} ${value.toFixed(2).padStart(5)} (min ${min})  ${label}  [${fgValue} on ${bgValue}]`,
    );
  }

  /*
   * A ratio check alone cannot catch a hover state that is technically above 3:1
   * yet weaker than the resting state — which is what happened when hover reused
   * border-strong. Hovering has to make the control's edge firmer, not fainter.
   */
  const resting = ratio(
    resolve(tokens, tokens["--ds-color-border-control"] ?? ""),
    resolve(tokens, tokens["--ds-color-surface"] ?? ""),
  );
  const hovered = ratio(
    resolve(tokens, tokens["--ds-color-border-control-hover"] ?? ""),
    resolve(tokens, tokens["--ds-color-surface"] ?? ""),
  );
  if (hovered <= resting) {
    failures += 1;
    console.log(
      `  FAIL  hover border (${hovered.toFixed(2)}) is not firmer than resting (${resting.toFixed(2)})`,
    );
  } else {
    console.log(`  ok    hover border ${hovered.toFixed(2)} is firmer than resting ${resting.toFixed(2)}`);
  }
}

console.log(`\n${failures ? `${failures} pair(s) below target` : "All measured pairs meet target"}`);

if (driftedTokens.length) {
  console.log("\nDARK THEME DRIFT");
  for (const line of driftedTokens) console.log(`  FAIL  ${line}`);
} else {
  console.log("Dark palette identical in both theme paths");
}

process.exit(failures || driftedTokens.length ? 1 : 0);
