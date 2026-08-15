const defaultRedirect = "/account";

export function getSafeRedirect(
  value: string | null | undefined,
  fallback = defaultRedirect,
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}

export function buildSignInUrl(callbackUrl: string): string {
  return `/auth/sign-in?callbackUrl=${encodeURIComponent(
    getSafeRedirect(callbackUrl),
  )}`;
}
