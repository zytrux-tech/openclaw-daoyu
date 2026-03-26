import type { ClawdbotConfig } from "openclaw/plugin-sdk/core";
import { DEFAULT_ACCOUNT_ID, normalizeDaoyuAccountId } from "./account-id.js";
import { DEFAULT_DAOYU_SERVER_URL, type DaoyuConfig } from "./config-schema.js";

export type ResolvedDaoyuAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  appId?: string;
  serverUrl?: string;
  config: DaoyuConfig;
};

function listConfiguredAccountIds(cfg: ClawdbotConfig): string[] {
  const accounts = (cfg.channels?.daoyu as DaoyuConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") return [];
  return Object.keys(accounts).filter(Boolean);
}

export function listDaoyuAccountIds(cfg: ClawdbotConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  const daoyuCfg = (cfg.channels?.daoyu as DaoyuConfig | undefined) ?? undefined;
  const hasBaseAccountFields = Boolean(daoyuCfg?.serverUrl || daoyuCfg?.auth?.appId || daoyuCfg?.auth?.appSecret);
  if (ids.length === 0 || hasBaseAccountFields) {
    ids.push(DEFAULT_ACCOUNT_ID);
  }
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

export function resolveDefaultDaoyuAccountId(cfg: ClawdbotConfig): string {
  const daoyuCfg = (cfg.channels?.daoyu as DaoyuConfig | undefined) ?? undefined;
  const configuredDefault = daoyuCfg?.defaultAccount?.trim();
  if (configuredDefault) {
    const ids = listDaoyuAccountIds(cfg);
    if (ids.includes(configuredDefault)) return configuredDefault;
  }
  const ids = listDaoyuAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) return DEFAULT_ACCOUNT_ID;
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(cfg: ClawdbotConfig, accountId: string): Partial<DaoyuConfig> | undefined {
  const accounts = (cfg.channels?.daoyu as DaoyuConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") return undefined;
  return (accounts as Record<string, Partial<DaoyuConfig>>)[accountId];
}

function mergeDaoyuAccountConfig(cfg: ClawdbotConfig, accountId: string): DaoyuConfig {
  const daoyuCfg = (cfg.channels?.daoyu as DaoyuConfig | undefined) ?? ({} as DaoyuConfig);
  const { accounts: _ignored, ...base } = daoyuCfg;
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  const merged: DaoyuConfig = {
    ...base,
    ...account,
    oauth: {
      ...(base.oauth ?? {}),
      ...(account.oauth ?? {}),
    },
    ws: {
      ...(base.ws ?? {}),
      ...(account.ws ?? {}),
    },
    auth: {
      ...(base.auth ?? {}),
      ...(account.auth ?? {}),
    },
  };
  return merged;
}

export function resolveDaoyuAccount(params: {
  cfg: ClawdbotConfig;
  accountId?: string | null;
}): ResolvedDaoyuAccount {
  const accountId = normalizeDaoyuAccountId(params.accountId);
  const daoyuCfg = params.cfg.channels?.daoyu as DaoyuConfig | undefined;
  const baseEnabled = daoyuCfg?.enabled !== false;
  const merged = mergeDaoyuAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  const appId = merged.auth?.appId?.trim();
  const appSecret = merged.auth?.appSecret?.trim();
  const serverUrl = merged.serverUrl ?? DEFAULT_DAOYU_SERVER_URL;
  const configured = Boolean(serverUrl && appId && appSecret);

  return {
    accountId,
    enabled,
    configured,
    appId,
    serverUrl,
    config: {
      ...merged,
      serverUrl,
    },
  };
}
