export function vendorEditHref(vendorId: string): string {
  return `/app/vendors/${encodeURIComponent(vendorId)}/edit`;
}
