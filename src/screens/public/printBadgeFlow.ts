export async function printBadgeBeforeCompletion(
  printBadge: () => void,
  complete: () => Promise<unknown>,
): Promise<void> {
  printBadge();
  await complete();
}
