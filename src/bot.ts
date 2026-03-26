import type { ClawdbotConfig } from "openclaw/plugin-sdk/core";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime";
import { getDaoyuRuntime } from "./runtime.js";
import type { DaoyuInboundMessage, DaoyuOutboundMessage } from "./types.js";
import { createDaoyuReplyDispatcher } from "./reply-dispatcher.js";

export async function handleDaoyuMessage(params: {
  cfg: ClawdbotConfig;
  accountId?: string;
  runtime: RuntimeEnv;
  message: DaoyuInboundMessage;
  send: (msg: DaoyuOutboundMessage) => void;
}): Promise<void> {
  const { cfg, accountId = "default", runtime, message, send } = params;
  const core = getDaoyuRuntime();

  const uid = message.uid;
  const tenantId = message.tenantId;
  const fallbackSessionKey = tenantId
    ? `daoyu:acct:${accountId}:tenant:${tenantId}:user:${uid}`
    : `daoyu:acct:${accountId}:user:${uid}`;

  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "Daoyu",
    from: String(uid),
    timestamp: new Date(message.timestamp),
    envelope: envelopeOptions,
    body: message.text,
  });

  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: "daoyu",
    accountId,
    peer: { kind: "dm", id: String(uid) },
  });

  const routeSessionKey = route.sessionKey ?? fallbackSessionKey;

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: message.text,
    CommandBody: message.text,
    From: `daoyu:${uid}`,
    To: "daoyu",
    SessionKey: routeSessionKey,
    AccountId: accountId,
    ChatType: "direct",
    SenderName: String(uid),
    SenderId: String(uid),
    Provider: "daoyu" as const,
    Surface: "daoyu" as const,
    MessageSid: message.requestId,
    Timestamp: message.timestamp,
    WasMentioned: true,
    CommandAuthorized: true,
    OriginatingChannel: "daoyu" as const,
    OriginatingTo: "daoyu",
  });

  const { dispatcher, replyOptions, markDispatchIdle } = createDaoyuReplyDispatcher({
    cfg,
    agentId: route.agentId,
    runtime,
    requestId: message.requestId,
    uid,
    tenantId,
    send,
  });

  runtime.log?.(`daoyu: dispatching message session=${route.sessionKey}`);

  await core.channel.reply.dispatchReplyFromConfig({
    ctx: ctxPayload,
    cfg,
    dispatcher,
    replyOptions,
  });

  markDispatchIdle();
}
