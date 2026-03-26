import type { ChannelOutboundAdapter } from "openclaw/plugin-sdk/channel-runtime";
import { sendDaoyuOutbound } from "./monitor.js";

export const daoyuOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  textChunkLimit: 4000,
  sendText: async ({ to, text, accountId }) => {
    if (!to) {
      throw new Error("daoyu outbound requires 'to' (uid)");
    }
    sendDaoyuOutbound({
      type: "assistant_message",
      requestId: `outbound_${Date.now()}`,
      uid: String(to),
      text: text ?? "",
      done: true,
      timestamp: Date.now(),
    }, accountId);
    return { channel: "daoyu", messageId: `outbound_${Date.now()}` } as any;
  },
};
