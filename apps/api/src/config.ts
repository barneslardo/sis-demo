import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OAuthScopes } from "@sis/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: envPath, override: true });

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function resolveOktaOrgUrl(): string {
  const explicit = optional("OKTA_ORG_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  if (optional("OKTA_ISSUER")) {
    try {
      const issuer = new URL(optional("OKTA_ISSUER"));
      return issuer.origin;
    } catch {
      /* fall through */
    }
  }
  return "";
}

const oktaOrgUrl = resolveOktaOrgUrl();

function normalizeOktaApiToken(raw: string): string {
  return raw.trim().replace(/^SSWS\s+/i, "");
}

const oktaApiToken = normalizeOktaApiToken(optional("OKTA_API_TOKEN"));
const oktaPushExplicit = process.env.OKTA_PUSH_ENABLED;
const oktaPushEnabled =
  oktaPushExplicit === "true" || (oktaPushExplicit !== "false" && Boolean(oktaApiToken));

const oidcClientId = optional("OKTA_OIDC_CLIENT_ID");
const oidcRedirectUri =
  optional("OKTA_OIDC_REDIRECT_URI") ||
  `${optional("APP_URL", optional("API_PUBLIC_URL", "http://localhost:5173")).replace(/\/$/, "")}/auth/oidc/callback`;

const agentRegistrationId = optional("OKTA_AGENT_REGISTRATION_ID");
/** UD AI agent registration id — signs ID-JAG hops; must NOT be the OIDC web app client id. */
const agentClientId = optional("AGENT_CLIENT_ID") || agentRegistrationId;
/** Hop 1 scope request — sis.* only (openid is invalid on org AS token-exchange). */
const defaultAgentScopes = Object.values(OAuthScopes).join(" ");

function resolveKeyPath(raw: string, fallback: string): string {
  const value = raw || fallback;
  return path.isAbsolute(value) ? value : path.resolve(path.dirname(envPath), value);
}

const agentKeyPath = resolveKeyPath(
  optional("AGENT_PRIVATE_KEY_PATH"),
  "secrets/agent-private-key.json"
);
const oidcKeyPath = resolveKeyPath(
  optional("OKTA_OIDC_PRIVATE_KEY_PATH"),
  "secrets/app-sign-on-key.json"
);
const agentKeyOnDisk = fs.existsSync(agentKeyPath);
const oidcKeyOnDisk = fs.existsSync(oidcKeyPath);
const resourceAsIssuer = optional("RESOURCE_AS_ISSUER") || optional("OKTA_ISSUER");

/** Okta app auth for authorization_code exchange (must match Admin Console). */
function resolveOidcTokenAuthMethod(): "private_key_jwt" | "client_secret" {
  const explicit = optional("OKTA_OIDC_AUTH_METHOD").toLowerCase();
  if (explicit === "private_key_jwt" || explicit === "client_secret") {
    return explicit;
  }
  if (oidcKeyOnDisk && oidcClientId) {
    return "private_key_jwt";
  }
  return "client_secret";
}

const oidcTokenAuthMethod = resolveOidcTokenAuthMethod();

export const config = {
  port: parseInt(process.env.API_PORT ?? "3010", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  appUrl: optional("APP_URL", "http://localhost:5173"),
  apiPublicUrl: optional("API_PUBLIC_URL", "http://localhost:3010"),
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  sessionSecret: optional("SESSION_SECRET", "dev-session-secret-change-me"),
  sessionCookieDomain: optional("SESSION_COOKIE_DOMAIN"),
  databaseUrl: optional("DATABASE_URL", "postgresql://sis:sis@localhost:5437/sis_demo"),
  trustProxy: process.env.TRUST_PROXY !== "false",

  oauth: {
    issuer: optional("OKTA_ISSUER"),
    /** Must match Okta custom AS Audience AND PRM `resource` (typically https://host/mcp). */
    audience: optional("OKTA_AUDIENCE"),
    enabled: Boolean(process.env.OKTA_ISSUER),
  },

  /** SIS → Okta: push student CRUD via Okta Management API (Users API). */
  oktaPush: {
    orgUrl: oktaOrgUrl,
    apiToken: oktaApiToken,
    enabled: oktaPushEnabled && Boolean(oktaApiToken && oktaOrgUrl),
    required: process.env.OKTA_PUSH_REQUIRED === "true",
    includeExtendedProfile: process.env.OKTA_PUSH_EXTENDED_PROFILE !== "false",
    studentGroupIds: optional("OKTA_STUDENT_GROUP_IDS")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  },

  /** Human admin login (PKCE authorization code). Preferred over SAML for agent id_token. */
  oidc: {
    orgUrl: oktaOrgUrl,
    clientId: oidcClientId,
    clientSecret: optional("OKTA_OIDC_CLIENT_SECRET"),
    redirectUri: oidcRedirectUri,
    scopes: optional("OIDC_SCOPES", "openid profile email groups offline_access"),
    tokenAuthMethod: oidcTokenAuthMethod,
    privateKeyPath: oidcKeyOnDisk ? oidcKeyPath : "",
    enabled: Boolean(oidcClientId && oidcRedirectUri && oktaOrgUrl),
  },

  /** Okta UD AI agent — ID-JAG token exchange for delegated sis.* scopes. */
  agent: {
    orgUrl: oktaOrgUrl,
    clientId: agentClientId,
    registrationId: agentRegistrationId,
    privateKeyPath: agentKeyPath,
    resourceAsIssuer,
    tokenScope: optional("AGENT_TOKEN_SCOPE", defaultAgentScopes),
    enabled: Boolean(
      agentClientId &&
        agentClientId !== oidcClientId &&
        resourceAsIssuer.includes("/oauth2/aus") &&
        oktaOrgUrl &&
        agentKeyOnDisk
    ),
  },
};

/** MCP protected resource identifier (RFC 9728 + MCP auth). */
export function getMcpResourceUrl(): string {
  const explicit = process.env.MCP_RESOURCE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return `${config.apiPublicUrl.replace(/\/$/, "")}/mcp`;
}

/** Token `aud` claim — defaults to MCP resource URL. */
export function getOAuthAudience(): string {
  return (config.oauth.audience || getMcpResourceUrl()).replace(/\/$/, "");
}

/** Accept legacy api:// audience during migration. */
export function getAcceptedOAuthAudiences(): string[] {
  const primary = getOAuthAudience();
  const legacy = "api://sis-demo";
  return primary === legacy ? [primary] : [primary, legacy];
}

export const isProduction =
  config.nodeEnv === "production" || config.apiPublicUrl.startsWith("https://");

export function assertDatabaseUrl() {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
}
