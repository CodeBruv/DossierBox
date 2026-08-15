/**
 * DossierBox UI barrel.
 *
 * Re-exports presentational, framework-agnostic primitives used by the
 * application shell. Business logic is deliberately kept out of these
 * components — they receive data via props and emit events via callbacks.
 */

export { SiteHeader } from "./site-header";
export { SiteFooter } from "./site-footer";
export { Container } from "./container";
export { Button } from "./button";
export { NavMenu } from "./nav-menu";
export { AuthEntry } from "./auth-entry";
export { SkipLink } from "./skip-link";
export type { ButtonProps, ButtonVariant } from "./button";
