import { z } from "zod";
export { z };

export const DEFAULT_DAOYU_SERVER_URL = "https://api.aidaoyu.cn";

const OAuthSchema = z
  .object({
    tokenPath: z.string().optional().default("/openclaw/oauth/token"),
    refreshSkewMs: z.number().int().positive().optional().default(60_000),
  })
  .strict()
  .optional();

const AuthSchema = z
  .object({
    appId: z.string().optional(),
    appSecret: z.string().optional(),
    accessToken: z.string().optional(),
    accessTokenExpiresAt: z.number().int().positive().optional(),
    deviceId: z.string().optional(),
    requiredSignatures: z.boolean().optional().default(true),
    signatureDebug: z.boolean().optional().default(false),
    clockSkewMs: z.number().int().positive().optional().default(5 * 60 * 1000),
    nonceTtlMs: z.number().int().positive().optional().default(10 * 60 * 1000),
  })
  .strict()
  .optional();

const WsSchema = z
  .object({
    heartbeatIntervalMs: z.number().int().positive().optional().default(25_000),
    heartbeatTimeoutMs: z.number().int().positive().optional().default(60_000),
    reconnectInitialMs: z.number().int().positive().optional().default(1_000),
    reconnectMaxMs: z.number().int().positive().optional().default(30_000),
    reconnectJitterMs: z.number().int().min(0).optional().default(500),
  })
  .strict()
  .optional();

export const DaoyuAccountConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    serverUrl: z.string().url().startsWith("https://").optional(),
    wsPath: z.string().optional(),
    apiBase: z.string().optional(),
    ws: WsSchema,
    oauth: OAuthSchema,
    auth: AuthSchema,
  })
  .strict();

export const DaoyuConfigSchema = z
  .object({
    enabled: z.boolean().optional().default(true),
    defaultAccount: z.string().min(1).optional(),
    // Public releases only support HTTPS/WSS deployments.
    serverUrl: z.string().url().startsWith("https://").optional().default(DEFAULT_DAOYU_SERVER_URL),
    wsPath: z.string().optional().default("/openclaw/ws"),
    apiBase: z.string().optional().default("/openclaw"),
    ws: WsSchema,
    oauth: OAuthSchema,
    auth: AuthSchema,
    accounts: z.record(z.string().min(1), DaoyuAccountConfigSchema).optional(),
  })
  .strict();

export type DaoyuConfig = z.input<typeof DaoyuConfigSchema>;
export type DaoyuAccountConfig = z.input<typeof DaoyuAccountConfigSchema>;
