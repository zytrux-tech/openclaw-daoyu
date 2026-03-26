import type { SignedEnvelope } from "./auth.js";

export type DaoyuInboundMessage = {
  type: "user_message";
  requestId: string;
  uid: string | number;
  tenantId?: string | number;
  text: string;
  timestamp: number;
};

export type DaoyuOutboundMessage =
  | {
      type: "assistant_message";
      requestId: string;
      uid: string | number;
      tenantId?: string | number;
      text: string;
      done: boolean;
      timestamp: number;
    }
  | {
      type: "system_notice";
      text: string;
      timestamp: number;
    };

export type DaoyuPingMessage = {
  type: "ping";
  timestamp: number;
};

export type DaoyuPongMessage = {
  type: "pong";
  timestamp: number;
};

export type DaoyuInboundFrame = DaoyuInboundMessage | DaoyuPongMessage;
export type DaoyuOutboundFrame = DaoyuOutboundMessage | DaoyuPingMessage;
export type DaoyuSignedInboundFrame = SignedEnvelope<DaoyuInboundFrame>;
export type DaoyuSignedOutboundFrame = SignedEnvelope<DaoyuOutboundFrame>;

export type OAuthTokenResponse = {
  accessToken: string;
  expiresIn?: number;
  expiresAt?: number;
  tokenType?: string;
};
