import type { Express } from "express";
import { config, getMcpResourceUrl } from "../config.js";
import { buildProtectedResourceMetadata, MCP_SCOPES } from "./metadata.js";

type OktaAsMetadata = {
  issuer?: string;
  scopes_supported?: string[];
  [key: string]: unknown;
};

async function fetchOktaAuthorizationServerMetadata(): Promise<OktaAsMetadata | null> {
  if (!config.oauth.enabled) return null;
  const issuer = config.oauth.issuer.replace(/\/$/, "");
  const url = `${issuer}/.well-known/oauth-authorization-server`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return { error: `HTTP ${res.status}`, url };
    return (await res.json()) as OktaAsMetadata;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), url };
  }
}

/** Compare PRM scopes with what Okta publishes on the authorization server. */
export async function getMcpDiscoveryReport() {
  const prm = buildProtectedResourceMetadata();
  const oktaAs = await fetchOktaAuthorizationServerMetadata();
  const oktaScopes = new Set(
    Array.isArray(oktaAs?.scopes_supported) ? oktaAs.scopes_supported.map(String) : []
  );
  const prmScopes = MCP_SCOPES;
  const missingOnOkta = prmScopes.filter((s) => !oktaScopes.has(s));

  return {
    mcpResourceUrl: getMcpResourceUrl(),
    oktaIssuer: config.oauth.issuer,
    oktaAudience: config.oauth.audience || getMcpResourceUrl(),
    protectedResourceMetadata: prm,
    oktaAuthorizationServerMetadata: oktaAs,
    scopesInPrmNotPublishedByOkta: missingOnOkta,
    ok: missingOnOkta.length === 0 && Boolean(oktaAs?.issuer),
    fix:
      missingOnOkta.length > 0
        ? 'In Okta: Security → API → your authorization server → Scopes → edit each scope → enable "Include in public metadata" (metadataPublish). Then refresh the MCP server entry.'
        : null,
  };
}

export function mountMcpDiscoveryRoutes(app: Express) {
  app.get("/api/v1/mcp/discovery", async (_req, res) => {
    if (!config.oauth.enabled) {
      return res.status(503).json({ error: "OAuth not configured" });
    }
    res.json(await getMcpDiscoveryReport());
  });
}

export async function fetchAndMergeOktaAsMetadata(): Promise<OktaAsMetadata> {
  const base = (await fetchOktaAuthorizationServerMetadata()) ?? {};
  const issuer = config.oauth.issuer.replace(/\/$/, "");
  const mergedScopes = Array.from(
    new Set([...(Array.isArray(base.scopes_supported) ? base.scopes_supported : []), ...MCP_SCOPES])
  );
  return {
    ...base,
    issuer: base.issuer ?? issuer,
    scopes_supported: mergedScopes,
  };
}
