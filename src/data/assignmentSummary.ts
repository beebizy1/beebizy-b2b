/** Normalizes the address used to group one person's event responsibilities. */
export function assignmentDeliveryEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function assignmentSummaryCounts(records: Array<{ email: string | null | undefined }>) {
  const emails = records.map((record) => assignmentDeliveryEmail(record.email));
  return {
    recipients: new Set(emails.filter((email): email is string => email !== null)).size,
    assignments: emails.filter((email) => email !== null).length,
    missingEmail: emails.filter((email) => email === null).length,
  };
}
