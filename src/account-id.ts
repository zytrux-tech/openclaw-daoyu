export const DEFAULT_ACCOUNT_ID = "default";

export function normalizeDaoyuAccountId(value?: string | null): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || DEFAULT_ACCOUNT_ID;
}
