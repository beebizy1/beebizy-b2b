export async function printBadgeBeforeCompletion(
  printBadge: () => boolean,
  complete: () => Promise<unknown>,
): Promise<boolean> {
  if (!printBadge()) return false;
  await complete();
  return true;
}
