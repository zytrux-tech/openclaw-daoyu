import type { ClawdbotConfig } from "openclaw/plugin-sdk/core";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime";
import { DaoyuConfigSchema, type DaoyuConfig } from "./config-schema.js";
import { requestAccessToken } from "./token.js";
import { DaoyuWsClient } from "./client.js";
import { handleDaoyuMessage } from "./bot.js";
import type { DaoyuOutboundMessage } from "./types.js";
import { getDaoyuRuntime } from "./runtime.js";
import { resolveDaoyuAccount } from "./accounts.js";

const outboundSenders = new Map<string, (msg: DaoyuOutboundMessage) => void>();
const accessTokenCache = new Map<string, { accessToken: string; expiresAt?: number }>();

export function getDaoyuOutboundSender(accountId?: string) {
  if (accountId) return outboundSenders.get(accountId) ?? null;
  return outboundSenders.values().next().value ?? null;
}

function resolveDaoyuConfig(cfg: ClawdbotConfig, accountId?: string): DaoyuConfig {
  const resolved = resolveDaoyuAccount({ cfg, accountId });
  return DaoyuConfigSchema.parse(resolved.config);
}

async function ensureDeviceId(
  cfg: ClawdbotConfig,
  runtime: RuntimeEnv,
  accountId: string | undefined,
  deviceId?: string,
): Promise<string> {
  if (deviceId) return deviceId;
  const generated = `device_${Math.random().toString(36).slice(2, 10)}`;
  const next = updateDaoyuConfig(cfg, { auth: { deviceId: generated } }, accountId);
  await getDaoyuRuntime().config.writeConfigFile(next);
  return generated;
}

function updateDaoyuConfig(
  cfg: ClawdbotConfig,
  patch: Partial<DaoyuConfig>,
  accountId?: string,
): ClawdbotConfig {
  const channels = { ...(cfg.channels ?? {}) } as Record<string, any>;
  const current = (channels.daoyu ?? {}) as DaoyuConfig;
  if (!accountId || accountId === "default") {
    channels.daoyu = {
      ...current,
      ...patch,
      oauth: {
        ...(current.oauth ?? {}),
        ...(patch.oauth ?? {}),
      },
      auth: {
        ...(current.auth ?? {}),
        ...(patch.auth ?? {}),
      },
      ws: {
        ...(current.ws ?? {}),
        ...(patch.ws ?? {}),
      },
    };
  } else {
    const accounts = { ...(current.accounts ?? {}) } as Record<string, any>;
    const currentAccount = (accounts[accountId] ?? {}) as Partial<DaoyuConfig>;
    accounts[accountId] = {
      ...currentAccount,
      ...patch,
      oauth: {
        ...(currentAccount.oauth ?? {}),
        ...(patch.oauth ?? {}),
      },
      auth: {
        ...(currentAccount.auth ?? {}),
        ...(patch.auth ?? {}),
      },
      ws: {
        ...(currentAccount.ws ?? {}),
        ...(patch.ws ?? {}),
      },
    };
    channels.daoyu = { ...current, accounts };
  }
  return { ...cfg, channels } as ClawdbotConfig;
}

function resolveSigningSecret(daoyuCfg: DaoyuConfig): string | undefined {
  return daoyuCfg.auth?.appSecret;
}

function isAccessTokenValid(params: {
  token?: string;
  expiresAt?: number;
  refreshSkewMs?: number;
  now: number;
}): boolean {
  const { token, expiresAt, refreshSkewMs, now } = params;
  if (!token) return false;
  if (!expiresAt) return true;
  const skew = refreshSkewMs ?? 60_000;
  return now + skew < expiresAt;
}

async function ensureAccessToken(params: {
  cfg: ClawdbotConfig;
  accountId?: string;
  runtime: RuntimeEnv;
  log: (msg: string) => void;
}): Promise<{ accessToken: string }> {
  const { cfg, accountId, runtime, log } = params;
  const daoyuCfg = resolveDaoyuConfig(cfg, accountId);
  const now = Date.now();
  const cacheKey = accountId ?? "default";
  const refreshSkewMs = daoyuCfg.oauth?.refreshSkewMs ?? 60_000;
  const cached = accessTokenCache.get(cacheKey);

  if (cached && isAccessTokenValid({
    token: cached.accessToken,
    expiresAt: cached.expiresAt,
    refreshSkewMs,
    now,
  })) {
    return { accessToken: cached.accessToken };
  }

  if (isAccessTokenValid({
    token: daoyuCfg.auth?.accessToken,
    expiresAt: daoyuCfg.auth?.accessTokenExpiresAt,
    refreshSkewMs,
    now,
  })) {
    accessTokenCache.set(cacheKey, {
      accessToken: daoyuCfg.auth!.accessToken!,
      expiresAt: daoyuCfg.auth?.accessTokenExpiresAt,
    });
    return { accessToken: daoyuCfg.auth!.accessToken! };
  }

  const appId = daoyuCfg.auth?.appId;
  const appSecret = daoyuCfg.auth?.appSecret;
  if (!appId || !appSecret) {
    throw new Error("daoyu: auth.appId and auth.appSecret are required");
  }

  const deviceId = await ensureDeviceId(cfg, runtime, accountId, daoyuCfg.auth?.deviceId);
  const tokenPath = daoyuCfg.oauth?.tokenPath ?? "/openclaw/oauth/token";
  const signingSecret = resolveSigningSecret(daoyuCfg);

  const token = await requestAccessToken({
    serverUrl: daoyuCfg.serverUrl,
    tokenPath,
    appId,
    appSecret,
    deviceId,
    signingSecret,
  });

  if (!token.accessToken) {
    throw new Error("daoyu: oauth token response missing accessToken");
  }

  const expiresAt = token.expiresAt ??
    (token.expiresIn ? Date.now() + token.expiresIn * 1000 : undefined);
  accessTokenCache.set(cacheKey, {
    accessToken: token.accessToken,
    expiresAt,
  });

  log(
    `daoyu: oauth token acquired${expiresAt ? `, expiresAt=${new Date(expiresAt).toISOString()}` : ""}`,
  );

  return { accessToken: token.accessToken };
}

export async function monitorDaoyuProvider(params: {
  config: ClawdbotConfig;
  accountId?: string;
  runtime: RuntimeEnv;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const { config, accountId, runtime, abortSignal } = params;
  const log = runtime.log ?? console.log;
  const error = runtime.error ?? console.error;

  const daoyuCfg = resolveDaoyuConfig(config, accountId);
  if (!daoyuCfg.enabled) {
    throw new Error("daoyu: channel disabled");
  }

  const requiredSignatures = daoyuCfg.auth?.requiredSignatures ?? true;
  const signingSecret = resolveSigningSecret(daoyuCfg);
  if (requiredSignatures && !signingSecret) {
    throw new Error("daoyu: signing secret required (set auth.appSecret)");
  }

  const { accessToken } = await ensureAccessToken({ cfg: config, accountId, runtime, log });

  const wsUrl = `${daoyuCfg.serverUrl}${daoyuCfg.wsPath}`;

  const client = new DaoyuWsClient({
    url: wsUrl,
    wsPath: daoyuCfg.wsPath,
    accessToken,
    accessTokenProvider: async () => {
      const token = await ensureAccessToken({ cfg: config, accountId, runtime, log });
      return token.accessToken;
    },
    log,
    onMessage: async (msg) => {
      try {
        await handleDaoyuMessage({
          cfg: config,
          accountId,
          message: msg,
          runtime,
          send: (out) => client.send(out),
        });
      } catch (err) {
        error(`daoyu: handle message failed: ${String(err)}`);
      }
    },
    onError: (err) => {
      error(`daoyu: ws error ${String(err)}`);
    },
    onClose: () => {
      log("daoyu: ws closed");
    },
    signing: {
      signingKey: signingSecret,
      required: requiredSignatures,
      signatureDebug: daoyuCfg.auth?.signatureDebug ?? false,
      clockSkewMs: daoyuCfg.auth?.clockSkewMs ?? 5 * 60 * 1000,
      nonceTtlMs: daoyuCfg.auth?.nonceTtlMs ?? 10 * 60 * 1000,
    },
    heartbeatIntervalMs: daoyuCfg.ws?.heartbeatIntervalMs ?? 25_000,
    heartbeatTimeoutMs: daoyuCfg.ws?.heartbeatTimeoutMs ?? 60_000,
    reconnectInitialMs: daoyuCfg.ws?.reconnectInitialMs ?? 1_000,
    reconnectMaxMs: daoyuCfg.ws?.reconnectMaxMs ?? 30_000,
    reconnectJitterMs: daoyuCfg.ws?.reconnectJitterMs ?? 500,
  });

  outboundSenders.set(accountId ?? "default", (msg) => client.send(msg));

  return new Promise((resolve) => {
    const cleanup = () => {
      outboundSenders.delete(accountId ?? "default");
      client.close();
      resolve();
    };

    if (abortSignal?.aborted) {
      cleanup();
      return;
    }

    const handleAbort = () => {
      log("daoyu: abort signal received, stopping");
      cleanup();
    };

    abortSignal?.addEventListener("abort", handleAbort, { once: true });
    client.connect();
  });
}

export function sendDaoyuOutbound(msg: DaoyuOutboundMessage, accountId?: string) {
  if (accountId) {
    outboundSenders.get(accountId)?.(msg);
    return;
  }
  const first = outboundSenders.values().next().value;
  first?.(msg);
}
