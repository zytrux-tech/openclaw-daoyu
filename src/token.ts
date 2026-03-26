import type { OAuthTokenResponse } from "./types.js";
import { createNonce, createRequestSignature } from "./auth.js";

function buildSignedHeaders(params: {
  method: "POST";
  pathWithQuery: string;
  body?: unknown;
  signingKey?: string;
}): Record<string, string> {
  const { signingKey } = params;
  if (!signingKey) return {};
  const ts = Date.now();
  const nonce = createNonce();
  const sig = createRequestSignature({
    method: params.method,
    pathWithQuery: params.pathWithQuery,
    timestamp: ts,
    nonce,
    body: params.body,
    signingKey,
  });
  return {
    "X-Daoyu-Timestamp": String(ts),
    "X-Daoyu-Nonce": nonce,
    "X-Daoyu-Signature": sig,
  };
}

export async function requestAccessToken(params: {
  serverUrl: string;
  tokenPath: string;
  appId: string;
  appSecret: string;
  deviceId?: string;
  signingSecret?: string;
}): Promise<OAuthTokenResponse> {
  const { serverUrl, tokenPath, appId, appSecret, deviceId, signingSecret } = params;
  const body = {
    grantType: "client_credentials",
    appId,
    appSecret,
    deviceId,
  };

  const res = await fetch(`${serverUrl}${tokenPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildSignedHeaders({
        method: "POST",
        pathWithQuery: tokenPath,
        body,
        signingKey: signingSecret,
      }),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`oauth token failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as OAuthTokenResponse;
}
