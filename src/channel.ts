import type { ChannelPlugin, ClawdbotConfig } from "openclaw/plugin-sdk/core";
import { DEFAULT_ACCOUNT_ID, normalizeDaoyuAccountId } from "./account-id.js";
import { resolveDaoyuAccount, listDaoyuAccountIds, resolveDefaultDaoyuAccountId } from "./accounts.js";
import { monitorDaoyuProvider } from "./monitor.js";
import { daoyuOutbound } from "./outbound.js";

const meta = {
  id: "daoyu",
  label: "Daoyu",
  selectionLabel: "Daoyu (自研聊天)",
  docsPath: "/channels/daoyu",
  docsLabel: "daoyu",
  blurb: "Daoyu self-hosted chat channel.",
  aliases: [],
  order: 80,
} as const;

function unwrapCfg(input: any): any {
  if (input && typeof input === "object" && "cfg" in input) {
    return input.cfg ?? {};
  }
  return input ?? {};
}

export const daoyuPlugin: ChannelPlugin = {
  id: "daoyu",
  meta: { ...meta },
  capabilities: {
    chatTypes: ["direct"],
    polls: false,
    threads: false,
    media: false,
    reactions: false,
    edit: false,
    reply: true,
  },
  reload: { configPrefixes: ["channels.daoyu"] },
  config: {
    listAccountIds: (cfgOrCtx: any) => {
      const cfg = unwrapCfg(cfgOrCtx) as ClawdbotConfig;
      return listDaoyuAccountIds(cfg);
    },
    resolveAccount: (cfgOrCtx: any, accountIdArg?: string) => {
      const cfg = unwrapCfg(cfgOrCtx) as ClawdbotConfig;
      const accountId = normalizeDaoyuAccountId(accountIdArg ?? (cfgOrCtx as any)?.accountId);
      return resolveDaoyuAccount({ cfg, accountId });
    },
    defaultAccountId: (cfgOrCtx: any) => {
      const cfg = unwrapCfg(cfgOrCtx) as ClawdbotConfig;
      return resolveDefaultDaoyuAccountId(cfg);
    },
    setAccountEnabled: ({ cfg, accountId, enabled }: any) => {
      const safeCfg = unwrapCfg(cfg) as Record<string, any>;
      const normalizedId = normalizeDaoyuAccountId(accountId);
      const channels = { ...(safeCfg.channels ?? {}) };
      const daoyu = { ...(channels.daoyu ?? {}) };
      if (normalizedId === DEFAULT_ACCOUNT_ID) {
        channels.daoyu = { ...daoyu, enabled };
      } else {
        const accounts = { ...((daoyu.accounts as Record<string, any> | undefined) ?? {}) };
        const account = { ...(accounts[normalizedId] ?? {}) };
        accounts[normalizedId] = { ...account, enabled };
        channels.daoyu = { ...daoyu, accounts };
      }
      return { ...safeCfg, channels };
    },
    deleteAccount: ({ cfg, accountId }: any) => {
      const safeCfg = unwrapCfg(cfg);
      const next = { ...safeCfg } as Record<string, any>;
      const channels = { ...(safeCfg.channels as Record<string, any> | undefined) };
      const normalizedId = normalizeDaoyuAccountId(accountId);
      if (normalizedId === DEFAULT_ACCOUNT_ID) {
        delete channels.daoyu;
      } else {
        const daoyu = { ...(channels.daoyu as Record<string, any> | undefined) };
        const accounts = { ...((daoyu.accounts as Record<string, any> | undefined) ?? {}) };
        delete accounts[normalizedId];
        if (Object.keys(accounts).length > 0) {
          daoyu.accounts = accounts;
          channels.daoyu = daoyu;
        } else {
          delete daoyu.accounts;
          channels.daoyu = daoyu;
        }
      }
      if (Object.keys(channels).length > 0) {
        next.channels = channels;
      } else {
        delete next.channels;
      }
      return next as any;
    },
    isConfigured: (account: any) => Boolean(account?.configured),
    describeAccount: (account: any) => ({
      accountId: (account as any)?.accountId ?? "default",
      enabled: Boolean((account as any)?.enabled),
      configured: Boolean((account as any)?.configured),
      appId: (account as any)?.appId,
      serverUrl: (account as any)?.serverUrl,
    }),
    resolveAllowFrom: () => [],
    formatAllowFrom: ({ allowFrom }: any) =>
      (allowFrom ?? []).map((entry) => String(entry).trim()).filter(Boolean),
  },
  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        defaultAccount: { type: "string", minLength: 1 },
        serverUrl: {
          type: "string",
          format: "uri",
          pattern: "^https://",
        },
        wsPath: { type: "string" },
        apiBase: { type: "string" },
        oauth: {
          type: "object",
          additionalProperties: false,
          properties: {
            tokenPath: { type: "string" },
            refreshSkewMs: { type: "integer", minimum: 1000 },
          },
        },
        ws: {
          type: "object",
          additionalProperties: false,
          properties: {
            heartbeatIntervalMs: { type: "integer", minimum: 1000 },
            heartbeatTimeoutMs: { type: "integer", minimum: 1000 },
            reconnectInitialMs: { type: "integer", minimum: 100 },
            reconnectMaxMs: { type: "integer", minimum: 1000 },
            reconnectJitterMs: { type: "integer", minimum: 0 },
          },
        },
        auth: {
          type: "object",
          additionalProperties: false,
          properties: {
            appId: { type: "string" },
            appSecret: { type: "string" },
            accessToken: { type: "string" },
            accessTokenExpiresAt: { type: "integer", minimum: 1 },
            deviceId: { type: "string" },
            requiredSignatures: { type: "boolean" },
            signatureDebug: { type: "boolean" },
            clockSkewMs: { type: "integer", minimum: 1000 },
            nonceTtlMs: { type: "integer", minimum: 1000 },
          },
        },
        accounts: {
          type: "object",
          additionalProperties: {
            type: "object",
            additionalProperties: false,
            properties: {
              enabled: { type: "boolean" },
              serverUrl: {
                type: "string",
                format: "uri",
                pattern: "^https://",
              },
              wsPath: { type: "string" },
              apiBase: { type: "string" },
              oauth: {
                type: "object",
                additionalProperties: false,
                properties: {
                  tokenPath: { type: "string" },
                  refreshSkewMs: { type: "integer", minimum: 1000 },
                },
              },
              ws: {
                type: "object",
                additionalProperties: false,
                properties: {
                  heartbeatIntervalMs: { type: "integer", minimum: 1000 },
                  heartbeatTimeoutMs: { type: "integer", minimum: 1000 },
                  reconnectInitialMs: { type: "integer", minimum: 100 },
                  reconnectMaxMs: { type: "integer", minimum: 1000 },
                  reconnectJitterMs: { type: "integer", minimum: 0 },
                },
              },
              auth: {
                type: "object",
                additionalProperties: false,
                properties: {
                  appId: { type: "string" },
                  appSecret: { type: "string" },
                  accessToken: { type: "string" },
                  accessTokenExpiresAt: { type: "integer", minimum: 1 },
                  deviceId: { type: "string" },
                  requiredSignatures: { type: "boolean" },
                  signatureDebug: { type: "boolean" },
                  clockSkewMs: { type: "integer", minimum: 1000 },
                  nonceTtlMs: { type: "integer", minimum: 1000 },
                },
              },
            },
          },
        },
      },
    },
  },
  outbound: daoyuOutbound,
  gateway: {
    startAccount: async (ctx) => {
      ctx.log?.info?.("starting daoyu channel");
      return monitorDaoyuProvider({
        config: ctx.cfg,
        accountId: ctx.accountId,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
      });
    },
  },
};
