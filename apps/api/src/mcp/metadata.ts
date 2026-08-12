import type { Express, Request, Response } from "express";
import { OAuthScopes } from "@sis/shared";
import { config, getMcpResourceUrl } from "../config.js";

const MCP_SCOPES = Object.values(OAuthScopes);

function issuer(): string {
  return config.oauth.issuer.replace(/\/$/, "");
}

export function buildProtectedResourceMetadata() {
  const resourceUrl = getMcpResourceUrl();
  return {
    resource: resourceUrl,
    authorization_servers: [issuer()],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "SIS Student Information System",
    resource_documentation: config.appUrl,
    mcp_protocol_version: "2025-03-26",
  };
}

function sendMetadata(res: Response, body: Record<string, unknown>) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json(body);
}

function metadataHandler() {
  const body = buildProtectedResourceMetadata();
  return (req: Request, res: Response) => {
    if (req.method === "HEAD") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.status(200).end();
      return;
    }
    sendMetadata(res, body);
  };
}

/**
 * RFC 9728 Protected Resource Metadata for MCP (Okta AI agent discovery).
 * Mounted at every path clients commonly probe.
 */
export function mountProtectedResourceMetadata(app: Express) {
  const handler = metadataHandler();
  const paths = [
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
    "/mcp/.well-known/oauth-protected-resource",
  ];

  for (const path of paths) {
    app.options(path, (_req, res) => {
      res.setHeader("Allow", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.status(204).end();
    });
    app.get(path, handler);
    app.head(path, handler);
  }
}

/** Primary PRM URL referenced in WWW-Authenticate (Okta probes this path first). */
export function getProtectedResourceMetadataUrl(): string {
  const apiBase = config.apiPublicUrl.replace(/\/$/, "");
  return `${apiBase}/.well-known/oauth-protected-resource`;
}

export { MCP_SCOPES };
