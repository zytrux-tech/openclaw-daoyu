import WebSocket from "ws";
import {
  createNonce,
  createNonceStore,
  createRequestSignature,
  isSignedEnvelope,
  signEnvelopeWithMaterial,
  verifyEnvelope,
  type NonceStore,
  type SigningConfig,
} from "./auth.js";
import { createHash } from "node:crypto";
import type {
  DaoyuInboundFrame,
  DaoyuInboundMessage,
  DaoyuOutboundFrame,
  DaoyuOutboundMessage,
} from "./types.js";

export type DaoyuWsClientOptions = {
  url: string;
  wsPath: string;
  accessToken?: string;
  accessTokenProvider?: () => Promise<string>;
  log?: (msg: string) => void;
  onMessage: (msg: DaoyuInboundMessage) => void;
  onError?: (err: unknown) => void;
  onClose?: () => void;
  onOpen?: () => void;
  signing: SigningConfig;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  reconnectInitialMs: number;
  reconnectMaxMs: number;
  reconnectJitterMs: number;
};

export class DaoyuWsClient {
  private ws: WebSocket | null = null;
  private opts: DaoyuWsClientOptions;
  private shouldReconnect = true;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatTimeoutTimer: NodeJS.Timeout | null = null;
  private nonceStore: NonceStore;
  private signingKeyHash12: string | null;

  constructor(opts: DaoyuWsClientOptions) {
    this.opts = opts;
    this.nonceStore = createNonceStore(opts.signing.nonceTtlMs);
    this.signingKeyHash12 = opts.signing.signingKey
      ? createHash("sha256").update(opts.signing.signingKey).digest("hex").slice(0, 12)
      : null;
  }

  connect() {
    this.shouldReconnect = true;
    void this.connectNow();
  }

  private async connectNow() {
    const { url, log, signing, wsPath } = this.opts;
    const accessToken = this.opts.accessTokenProvider
      ? await this.opts.accessTokenProvider()
      : this.opts.accessToken;

    if (!accessToken) {
      throw new Error("daoyu: missing access token for websocket connection");
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
    };

    if (signing.signingKey) {
      const ts = Date.now();
      const nonce = createNonce();
      const sig = createRequestSignature({
        method: "GET",
        pathWithQuery: wsPath,
        timestamp: ts,
        nonce,
        signingKey: signing.signingKey,
      });
      headers["X-Daoyu-Timestamp"] = String(ts);
      headers["X-Daoyu-Nonce"] = nonce;
      headers["X-Daoyu-Signature"] = sig;
    }

    try {
      this.ws = new WebSocket(url, { headers });
    } catch (err) {
      this.opts.onError?.(err);
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      log?.(`daoyu: ws connected ${url}`);
      this.opts.onOpen?.();
    });

    this.ws.on("pong", () => {
      this.clearHeartbeatTimeout();
    });

    this.ws.on("message", (data) => {
      try {
        const raw = typeof data === "string" ? data : data.toString("utf-8");
        const parsed = JSON.parse(raw) as unknown;

        const frame = this.resolveInboundFrame(parsed);
        if (!frame) return;

        if (frame.type === "pong") {
          this.clearHeartbeatTimeout();
          return;
        }

        if (frame.type === "user_message") {
          this.opts.onMessage(frame);
          return;
        }

        log?.(`daoyu: ignored inbound frame type=${(frame as any)?.type}`);
      } catch (err) {
        this.opts.onError?.(err);
      }
    });

    this.ws.on("error", (err) => {
      this.opts.onError?.(err);
    });

    this.ws.on("close", () => {
      this.stopHeartbeat();
      this.opts.onClose?.();
      this.scheduleReconnect();
    });
  }

  private resolveInboundFrame(value: unknown): DaoyuInboundFrame | null {
    const { signing, log } = this.opts;

    if (isSignedEnvelope<DaoyuInboundFrame>(value)) {
      const verified = verifyEnvelope({
        envelope: value,
        config: signing,
        nonceStore: this.nonceStore,
      });
      if (!verified.ok) {
        if (signing.signatureDebug && verified.debug) {
          this.opts.log?.(
            [
              "daoyu: signature debug (inbound verify failed)",
              `keyHash12=${this.signingKeyHash12 ?? "none"}`,
              `ts=${verified.debug.ts}`,
              `nonce=${verified.debug.nonce}`,
              `providedSig=${verified.debug.providedSig}`,
              `expectedSig=${verified.debug.expectedSig}`,
              `payloadStable=${verified.debug.payloadStable}`,
              `canonical=${verified.debug.canonical}`,
            ].join(" | "),
          );
        }
        this.opts.onError?.(new Error(`daoyu: inbound signature check failed: ${verified.error}`));
        return null;
      }
      return verified.payload;
    }

    if (signing.required) {
      this.opts.onError?.(
        new Error("daoyu: signature required but unsigned inbound frame received"),
      );
      return null;
    }

    log?.("daoyu: inbound frame unsigned (allowed)");
    return value as DaoyuInboundFrame;
  }

  private startHeartbeat() {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      try {
        ws.ping();
        // Also send application ping for server implementations that do not expose pong frames.
        this.sendFrame({ type: "ping", timestamp: Date.now() });
        this.resetHeartbeatTimeout();
      } catch (err) {
        this.opts.onError?.(err);
      }
    }, this.opts.heartbeatIntervalMs);
  }

  private resetHeartbeatTimeout() {
    this.clearHeartbeatTimeout();
    this.heartbeatTimeoutTimer = setTimeout(() => {
      this.opts.log?.("daoyu: heartbeat timeout, closing socket");
      this.ws?.close();
    }, this.opts.heartbeatTimeoutMs);
  }

  private clearHeartbeatTimeout() {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clearHeartbeatTimeout();
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer) return;

    const { reconnectInitialMs, reconnectMaxMs, reconnectJitterMs } = this.opts;
    const baseDelay = Math.min(reconnectMaxMs, reconnectInitialMs * 2 ** this.reconnectAttempts);
    const jitter = Math.floor(Math.random() * reconnectJitterMs);
    const delay = baseDelay + jitter;

    this.reconnectAttempts += 1;
    this.opts.log?.(`daoyu: scheduling ws reconnect in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectNow();
    }, delay);
  }

  private sendFrame(frame: DaoyuOutboundFrame) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    if (this.opts.signing.signingKey) {
      const signed = signEnvelopeWithMaterial(frame, this.opts.signing.signingKey);
      if (this.opts.signing.signatureDebug) {
        const frameAny = frame as any;
        this.opts.log?.(
          [
            "daoyu: signature debug (outbound)",
            `keyHash12=${this.signingKeyHash12 ?? "none"}`,
            `type=${String(frameAny?.type ?? "unknown")}`,
            `requestId=${String(frameAny?.requestId ?? "none")}`,
            `ts=${signed.envelope.meta.ts}`,
            `nonce=${signed.envelope.meta.nonce}`,
            `sig=${signed.envelope.meta.sig}`,
            `payloadStable=${signed.payloadStable}`,
            `canonical=${signed.canonical}`,
          ].join(" | "),
        );
      }
      ws.send(JSON.stringify(signed.envelope));
      return;
    }

    ws.send(JSON.stringify(frame));
  }

  send(msg: DaoyuOutboundMessage) {
    this.sendFrame(msg);
  }

  close() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }
}
