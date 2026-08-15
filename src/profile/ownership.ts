export function isOwnedByUser(
  authenticatedUserId: string,
  recordOwnerUserId: string,
): boolean {
  return authenticatedUserId === recordOwnerUserId;
}
