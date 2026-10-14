// Application safety budget, not OCI/Cloudflare official quota.
export const OCI_REFERENCE_BYTES = 10_000_000_000_000; // Oracle Always Free docs: 10 TB/month outbound
export function transferBudget(env) {
  const configured = Number(env?.MEDIA_TRANSFER_MONTHLY_LIMIT_GIB ?? 100);
  const gib = Number.isSafeInteger(configured) && configured >= 5 && configured <= 1000 ? configured : 100;
  return gib * 1024 ** 3;
}
