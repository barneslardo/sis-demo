#!/usr/bin/env node
/**
 * Quick hop-1 probe (needs a real id_token in ID_TOKEN env from an OIDC session).
 * Usage: ID_TOKEN='eyJ...' node scripts/test-id-jag-hop1.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT, importJWK } from "jose";
import { randomUUID } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const out = {};
  for (const line of readFileSync(resolve(root, ".env"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [k, ...rest] = t.split("=");
    out[k.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnv();
const idToken = process.env.ID_TOKEN;
if (!idToken) {
  console.error("Set ID_TOKEN to a fresh id_token from an Okta OIDC session.");
  process.exit(1);
}

const jwk = JSON.parse(
  readFileSync(resolve(root, env.AGENT_PRIVATE_KEY_PATH || "secrets/agent-private-key.json"), "utf8")
);
const org = env.OKTA_ORG_URL.replace(/\/$/, "");
const audience = env.RESOURCE_AS_ISSUER;
const clientId = env.AGENT_CLIENT_ID;
const scope = (env.AGENT_TOKEN_SCOPE || "")
  .split(/\s+/)
  .filter((s) => s && s !== "openid" && !s.startsWith("profile") && !s.startsWith("email"))
  .join(" ");

const key = await importJWK(jwk, "RS256");
const tokenEndpoint = `${org}/oauth2/v1/token`;
const clientAssertion = await new SignJWT({})
  .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
  .setIssuer(clientId)
  .setSubject(clientId)
  .setAudience(tokenEndpoint)
  .setIssuedAt()
  .setExpirationTime("5m")
  .setJti(randomUUID())
  .sign(key);

const body = new URLSearchParams({
  grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
  subject_token: idToken,
  subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
  requested_token_type: "urn:ietf:params:oauth:token-type:id-jag",
  audience,
  scope,
  client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
  client_assertion: clientAssertion,
});

const res = await fetch(tokenEndpoint, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
  body,
});
const data = await res.json().catch(() => ({}));
console.log("hop1", res.status, data.error_description || data.issued_token_type || "ok");
if (data.access_token) {
  console.log("ID-JAG length", data.access_token.length);
}
