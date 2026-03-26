import { createReplyPrefixContext } from "openclaw/plugin-sdk/channel-runtime";
import type { ClawdbotConfig } from "openclaw/plugin-sdk/core";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime";
import type { ReplyPayload } from "openclaw/plugin-sdk/reply-payload";
import { getDaoyuRuntime } from "./runtime.js";
import type { DaoyuOutboundMessage } from "./types.js";

export type CreateDaoyuReplyDispatcherParams = {
  cfg: ClawdbotConfig;
  agentId: string;
  runtime: RuntimeEnv;
  requestId: string;
  uid: string | number;
  tenantId?: string | number;
  send: (msg: DaoyuOutboundMessage) => void;
};

export function createDaoyuReplyDispatcher(params: CreateDaoyuReplyDispatcherParams) {
  const core = getDaoyuRuntime();
  const { cfg, agentId, requestId, uid, tenantId, send } = params;

  const prefixContext = createReplyPrefixContext({
    cfg,
    agentId,
  });

  const textChunkLimit = core.channel.text.resolveTextChunkLimit({
    cfg,
    channel: "daoyu",
    defaultLimit: 4000,
  });

  const { dispatcher, replyOptions, markDispatchIdle } =
    core.channel.reply.createReplyDispatcherWithTyping({
      responsePrefix: prefixContext.responsePrefix,
      responsePrefixContextProvider: prefixContext.responsePrefixContextProvider,
      humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, agentId),
      onReplyStart: () => undefined,
      deliver: async (payload: ReplyPayload) => {
        const text = payload.text ?? "";
        if (!text.trim()) return;

        const chunks = core.channel.text.chunkMarkdownText(text, textChunkLimit);
        const payloadAny = payload as any;
        const isFinal = Boolean(payloadAny?.final ?? payloadAny?.isFinal ?? true);
        for (let i = 0; i < chunks.length; i += 1) {
          const chunk = chunks[i];
          const done = isFinal && i === chunks.length - 1;
          send({
            type: "assistant_message",
            requestId,
            uid,
            tenantId,
            text: chunk,
            done,
            timestamp: Date.now(),
          });
        }
      },
      onError: (err) => {
        params.runtime.error?.(`daoyu reply failed: ${String(err)}`);
      },
      onIdle: () => undefined,
    });

  return {
    dispatcher,
    replyOptions: {
      ...replyOptions,
      onModelSelected: prefixContext.onModelSelected,
    },
    markDispatchIdle,
  };
}
