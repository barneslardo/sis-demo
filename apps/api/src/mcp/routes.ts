import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { createSisMcpServer } from "@sis/mcp-server/core";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { config, getMcpResourceUrl, getOAuthAudience } from "../config.js";
import { verifyOAuthAccessToken } from "../lib/verify-oauth-token.js";
import { getProtectedResourceMetadataUrl, mountProtectedResourceMetadata, MCP_SCOPES } from "./metadata.js";
import { fetchAndMergeOktaAsMetadata, mountMcpDiscoveryRoutes } from "./discovery.js";

export function mountMcpRoutes(app: Express) {
  mountMcpDiscoveryRoutes(app);

  if (!config.oauth.enabled) {
    app.get("/mcp", (_req, res) => {
      res.status(503).json({
        error: "MCP requires OAuth — configure OKTA_ISSUER and OKTA_AUDIENCE in .env",
      });
    });
    return;
  }

  mountProtectedResourceMetadata(app);

  // Some MCP registries (including Okta) probe AS metadata on the resource host.
  app.get("/.well-known/oauth-authorization-server", async (_req, res) => {
    try {
      const metadata = await fetchAndMergeOktaAsMetadata();
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(metadata);
    } catch (err) {
      res.status(502).json({
        error: "Failed to load authorization server metadata",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  const resourceMetadataUrl = getProtectedResourceMetadataUrl();

  const authMiddleware = requireBearerAuth({
    verifier: {
      verifyAccessToken: verifyOAuthAccessToken,
    },
    requiredScopes: [],
    resourceMetadataUrl,
  });

  const transports: Record<string, StreamableHTTPServerTransport> = {};

  const mcpPostHandler = async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            transports[id] = transport;
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) delete transports[sid];
        };

        const server = createSisMcpServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: No valid session ID provided" },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("MCP request error:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  };

  const mcpGetHandler = async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  };

  const mcpDeleteHandler = async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    try {
      await transports[sessionId].handleRequest(req, res);
    } catch {
      if (!res.headersSent) res.status(500).send("Error processing session termination");
    }
  };

  app.post("/mcp", authMiddleware, mcpPostHandler);
  app.get("/mcp", authMiddleware, mcpGetHandler);
  app.delete("/mcp", authMiddleware, mcpDeleteHandler);
}

export function getMcpPublicInfo() {
  const url = getMcpResourceUrl();
  return {
    enabled: config.oauth.enabled,
    url,
    resource: url,
    issuer: config.oauth.issuer,
    audience: getOAuthAudience(),
    protectedResourceMetadata: config.oauth.enabled ? getProtectedResourceMetadataUrl() : null,
    scopes: MCP_SCOPES,
  };
}
