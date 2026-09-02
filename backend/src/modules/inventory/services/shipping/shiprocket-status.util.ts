// Couriers append their own suffix to Shiprocket's status (e.g. "IN TRANSIT-EN-ROUTE"),
// so a known status must match as a *prefix* of the raw string, not just appear anywhere
// inside it. A plain "includes" check is unsafe: "UNDELIVERED", "RTO DELIVERED", and
// "PARTIAL_DELIVERED" all contain "DELIVERED" as a substring but must NOT match it.
const isStatusPrefixMatch = (normalized: string, key: string): boolean =>
  normalized === key ||
  normalized.startsWith(`${key}-`) ||
  normalized.startsWith(`${key} `) ||
  normalized.startsWith(`${key}_`);

export function matchShiprocketStatus<T>(
  rawStatus: string,
  statusMap: Record<string, T>,
): T | undefined {
  const normalized = rawStatus.toUpperCase().trim();
  const match = Object.keys(statusMap)
    .filter((key) => isStatusPrefixMatch(normalized, key))
    .sort((a, b) => b.length - a.length)[0];
  return match ? statusMap[match] : undefined;
}
