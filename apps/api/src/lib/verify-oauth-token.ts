import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { config, getAcceptedOAuthAudiences } from "../config.js";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks && config.oauth.issuer) {
    jwks = createRemoteJWKSet(new URL(`${config.oauth.issuer}/v1/keys`));
  }
  return jwks;
}

export function extractScopes(payload: JWTPayload): string[] {
  if (Array.isArray(payload.scp)) return payload.scp.map(String);
  if (typeof payload.scope === "string") return payload.scope.split(" ");
  if (typeof payload.scp === "string") return payload.scp.split(" ");
  return [];
}

export type VerifiedOAuthToken = {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt: number;
  sub: string;
  email?: string;
};

/** Verify an Okta access token for MCP and REST OAuth auth. */
export async function verifyOAuthAccessToken(token: string): Promise<VerifiedOAuthToken> {
  if (!config.oauth.enabled) {
    throw new Error("OAuth is not configured (set OKTA_ISSUER)");
  }

  const jwksSet = getJwks();
  if (!jwksSet) throw new Error("OAuth JWKS unavailable");

  const { payload } = await jwtVerify(token, jwksSet, {
    issuer: config.oauth.issuer,
    audience: getAcceptedOAuthAudiences(),
  });

  if (typeof payload.exp !== "number") {
    throw new Error("Token missing exp claim");
  }

  const clientId =
    (typeof payload.cid === "string" && payload.cid) ||
    (typeof payload.client_id === "string" && payload.client_id) ||
    String(payload.sub);

  return {
    token,
    clientId,
    scopes: extractScopes(payload),
    expiresAt: payload.exp,
    sub: String(payload.sub),
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
}
