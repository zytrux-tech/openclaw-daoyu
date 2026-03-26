import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type SigningConfig = {
  signingKey?: string;
  required: boolean;
  signatureDebug?: boolean;
  clockSkewMs: number;
  nonceTtlMs: number;
};

export type SignedMeta = {
  ts: number;
  nonce: string;
  sig: string;
};

export type SignedEnvelope<T> = {
  payload: T;
  meta: SignedMeta;
};

export type VerifyDebugMaterial = {
  providedSig: string;
  expectedSig: string;
  ts: number;
  nonce: string;
  payloadStable: string;
  canonical: string;
};

export type FrameSignatureMaterial<T> = {
  envelope: SignedEnvelope<T>;
  payloadStable: string;
  canonical: string;
};

export function isSignedEnvelope<T>(value: unknown): value is SignedEnvelope<T> {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  if (!("payload" in obj) || !("meta" in obj)) return false;
  const meta = obj.meta as Record<string, unknown>;
  return (
    typeof meta?.ts === "number" &&
    typeof meta?.nonce === "string" &&
    typeof meta?.sig === "string"
  );
}

export class NonceStore {
  private readonly nonceTtlMs: number;
  private readonly maxSize: number;
  private readonly store = new Map<string, number>();

  constructor(nonceTtlMs: number, maxSize = 5000) {
    this.nonceTtlMs = nonceTtlMs;
    this.maxSize = maxSize;
  }

  checkAndRecord(nonce: string, now: number): boolean {
    this.cleanup(now);
    const existing = this.store.get(nonce);
    if (existing && existing > now) {
      return false;
    }
    if (this.store.size >= this.maxSize) {
      const first = this.store.keys().next().value;
      if (first) this.store.delete(first);
    }
    this.store.set(nonce, now + this.nonceTtlMs);
    return true;
  }

  private cleanup(now: number) {
    for (const [key, expireAt] of this.store.entries()) {
      if (expireAt <= now) this.store.delete(key);
    }
  }
}

export function createNonce(size = 16): string {
  return randomBytes(size).toString("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const body = entries
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    .join(",");
  return `{${body}}`;
}

// Normalize payload for signature generation/verification:
// remove null/undefined object fields recursively, keep array order.
function pruneNullFields(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => pruneNullFields(item));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    out[k] = pruneNullFields(v);
  }
  return out;
}

function createSignature(input: string, signingKey: string): string {
  return createHmac("sha256", signingKey).update(input).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function signEnvelope<T>(payload: T, signingKey: string, ts = Date.now()): SignedEnvelope<T> {
  return signEnvelopeWithMaterial(payload, signingKey, ts).envelope;
}

export function signEnvelopeWithMaterial<T>(
  payload: T,
  signingKey: string,
  ts = Date.now(),
): FrameSignatureMaterial<T> {
  const nonce = createNonce();
  const payloadJson = stableStringify(pruneNullFields(payload));
  const canonical = `${ts}.${nonce}.${payloadJson}`;
  const sig = createSignature(canonical, signingKey);
  return {
    envelope: {
      payload,
      meta: { ts, nonce, sig },
    },
    payloadStable: payloadJson,
    canonical,
  };
}

export function createRequestSignature(params: {
  method: string;
  pathWithQuery: string;
  timestamp: number;
  nonce: string;
  body?: unknown;
  signingKey: string;
}): string {
  const payload =
    params.body === undefined ? "" : stableStringify(pruneNullFields(params.body));
  const raw = `${params.method.toUpperCase()}\n${params.pathWithQuery}\n${params.timestamp}\n${params.nonce}\n${payload}`;
  return createSignature(raw, params.signingKey);
}

export function verifyEnvelope<T>(params: {
  envelope: SignedEnvelope<T>;
  config: SigningConfig;
  nonceStore: NonceStore;
  now?: number;
}):
  | { ok: true; payload: T }
  | { ok: false; error: string; debug?: VerifyDebugMaterial } {
  const { envelope, config, nonceStore } = params;
  const now = params.now ?? Date.now();

  if (!config.signingKey) {
    return { ok: false, error: "missing signingKey" };
  }

  const drift = Math.abs(now - envelope.meta.ts);
  if (drift > config.clockSkewMs) {
    return { ok: false, error: `timestamp drift too large (${drift}ms)` };
  }

  const fresh = nonceStore.checkAndRecord(envelope.meta.nonce, now);
  if (!fresh) {
    return { ok: false, error: "replay detected (duplicate nonce)" };
  }

  const payloadJson = stableStringify(pruneNullFields(envelope.payload));
  const canonical = `${envelope.meta.ts}.${envelope.meta.nonce}.${payloadJson}`;
  const expected = createSignature(canonical, config.signingKey);

  if (!safeEqualHex(expected, envelope.meta.sig)) {
    return {
      ok: false,
      error: "invalid signature",
      debug: {
        providedSig: envelope.meta.sig,
        expectedSig: expected,
        ts: envelope.meta.ts,
        nonce: envelope.meta.nonce,
        payloadStable: payloadJson,
        canonical,
      },
    };
  }

  return { ok: true, payload: envelope.payload };
}

export function createNonceStore(nonceTtlMs: number): NonceStore {
  return new NonceStore(nonceTtlMs);
}
