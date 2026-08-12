# README-AGENT.md — SIS Demo setup guide for AI agents

You are an AI coding agent helping an engineer spin up this repo. This file is your operational runbook; [README.md](README.md) has full feature docs and [docs/okta-as-config.json](docs/okta-as-config.json) is the canonical Okta authorization-server reference. Follow the phases in order — each ends with a verification step. Do not skip verifications.

## What this is

A demo **Student Information System** (SIS): pnpm monorepo with an Express API (`apps/api`, port **3010**), React/Vite web UI (`apps/web`, port **5173**), Postgres in Docker (host port **5437**), shared Zod schemas (`packages/shared`), and an MCP server (`packages/mcp-server`). It demonstrates Okta OIDC/SAML login, an OAuth 2.0-protected API with 11 `sis.*` scopes, SCIM provisioning, Okta real-time push, an admin LLM chatbot with delegated (ID-JAG) tokens, and an OAuth-protected MCP endpoint.

**Companion repos** (optional, set this repo up FIRST):
- [super-lms](https://github.com/barneslardo/super-lms) — LMS that calls this SIS via Okta Cross App Access
- [super-duper-admin-portal](https://github.com/barneslardo/super-duper-admin-portal) — Okta admin chat portal (same patterns, different app)

## Ground rules for agents

1. **Never commit** `.env`, anything in `secrets/` or `certs/`, or tokens. `.gitignore` already covers these — do not weaken it.
2. **All `skylarbarnes.com` hostnames and `sledai.oktapreview.com` values in docs/examples are the original author's deployment.** They are placeholders for you. Substitute your engineer's values everywhere (see table below).
3. **Ask your engineer for** (do not guess or fabricate): their Okta org URL and admin access, an Okta API token (SSWS), LLM API keys (OpenAI/Anthropic) if the chatbot is wanted, and public DNS names if deploying.
4. Steps marked **[HUMAN]** happen in the Okta Admin Console or AWS console — give your engineer exact values to enter, then verify the result yourself via API/curl where possible.
5. `scripts/free-ports.sh` (run by `pnpm start`) kills whatever listens on the SIS ports. On a shared host, confirm ports 3010/5173 are yours before running production start.

### Value substitution table

| Placeholder in docs/examples | Replace with |
|---|---|
| `https://sis.skylarbarnes.com` | Your web UI public URL (`APP_URL`) — local: `http://localhost:5173` |
| `https://sis-api.skylarbarnes.com` | Your API public URL (`API_PUBLIC_URL`) — local: `http://localhost:3010` |
| `https://sledai.oktapreview.com` | Your Okta org URL |
| `wlpzfntwqat4SXBba1d7`, `auszblykhlQkrnOmA1d7`, `exk…`, `00g…` IDs | IDs from **your** Okta org (AS ID, app IDs, group IDs) |

## Phase 0 — Prerequisites

```bash
node --version   # need 20+
pnpm --version   # need 10+  (npm i -g pnpm  if missing)
docker ps        # daemon must be running; also verify: docker compose version
```

Port conflicts to check first: `3010` (API), `5173` (web), `5437` (Postgres). `ss -tlnp | grep -E '3010|5173|5437'` (Linux) or `lsof -i :3010` (macOS).

## Phase 1 — Run locally, no Okta required

The app has a **dev login** (enabled whenever `NODE_ENV` is not `production`) so you can verify the whole stack before touching Okta.

```bash
cp .env.example .env
```

Edit `.env` to this minimal local set (comment out or delete the rest — in particular do NOT set `SESSION_COOKIE_DOMAIN` for localhost):

```env
DATABASE_URL=postgresql://sis:sis@localhost:5437/sis_demo
APP_URL=http://localhost:5173
API_PUBLIC_URL=http://localhost:3010
CORS_ORIGIN=http://localhost:5173
SESSION_SECRET=<generate: openssl rand -hex 32>
API_PORT=3010
NODE_ENV=development
```

Then:

```bash
docker compose up -d          # Postgres on host port 5437
pnpm install
pnpm db:push                  # Prisma schema → DB
pnpm db:seed                  # demo students + users
pnpm dev                      # API :3010 + web :5173, hot reload
```

**Verify:**
1. `curl -s http://localhost:3010/health` → JSON with status ok.
2. Open `http://localhost:5173/login`, use the dev login form: `admin@university.edu` (admin) or `alice.johnson@university.edu` (student). Dev login posts to `/auth/dev/login`.
3. As admin, the student list should show seeded students.

If all three pass, the stack works. Everything after this is Okta integration — ask your engineer which of the layers below they actually need.

## Phase 2 — Okta wiring (layered; do only what's needed)

Recommended order. Restart the API after each `.env` change.

### 2a. OIDC admin sign-in + chat (recommended first)

- **[HUMAN]** Okta Admin Console → Applications → Create App Integration → **OIDC Web Application** (Authorization Code). Sign-in redirect URI: `<API_PUBLIC_URL>/auth/oidc/callback`. Assign test users/groups. Enable a **groups** claim on the ID token.
- Agent: set in `.env`: `OKTA_OIDC_CLIENT_ID`, `OKTA_OIDC_CLIENT_SECRET`, `OKTA_OIDC_REDIRECT_URI=<API_PUBLIC_URL>/auth/oidc/callback`, `OIDC_SCOPES=openid profile email groups`.
- For the admin chatbot also set `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` (from the engineer).
- **Verify:** `GET /auth/oidc/login` redirects to Okta; after login you land back authenticated.

### 2b. Custom authorization server (needed for OAuth API access, MCP, ID-JAG)

- **[HUMAN]** Security → API → Authorization Servers → Add. **Audience must exactly equal** `<API_PUBLIC_URL>/mcp`. Create all **11 scopes** listed in `docs/okta-as-config.json` (`sis.admin`, `sis.students.read`, `sis.students.write`, `sis.students.read.self`, `sis.students.ferpa`, `sis.students.financial`, `sis.students.ada`, `sis.students.disciplinary`, `sis.students.counselor`, `sis.students.risk`, `sis.students.academic`) — on each scope enable **"Include in public metadata"**. Add an **`email` claim** to access tokens (value `user.email`). Add an Access Policy allowing Client Credentials + Authorization Code for your clients.
- Agent: set `OKTA_ISSUER`, `RESOURCE_AS_ISSUER`, `OAUTH_TOKEN_URL` (all based on `https://<org>/oauth2/<yourAsId>`), `OKTA_AUDIENCE=<API_PUBLIC_URL>/mcp`, `MCP_RESOURCE_URL=<API_PUBLIC_URL>/mcp`.
- **Verify:** client-credentials token from a test client, then `curl <API_PUBLIC_URL>/api/v1/students -H "Authorization: Bearer $TOKEN"` returns data (scope `sis.admin` or `sis.students.read`).
- ⚠️ `scripts/setup_okta_id_jag.py` automates AS claims/rules but **hardcodes the author's AS ID and group names in constants at the top of the file** — update `SIS_AS_ID` and `SIS_ENTITLEMENT_GROUP_REGEX` before running it, or treat it as reference.

### 2c. Signing keys for `private_key_jwt` / agent flows (needed for 2e and for super-lms)

The repo ships **no private keys**. Generate RS256 private JWKs into `secrets/` (mode 600):

```bash
cd apps/api   # jose is installed here
node --input-type=module -e "
import { generateKeyPair, exportJWK } from 'jose';
import { randomUUID } from 'node:crypto';
const { privateKey } = await generateKeyPair('RS256', { extractable: true });
const jwk = await exportJWK(privateKey);
jwk.kid = randomUUID(); jwk.use = 'sig'; jwk.alg = 'RS256';
console.log(JSON.stringify(jwk, null, 2));
" > ../../secrets/agent-private-key.json
# repeat for ../../secrets/app-sign-on-key.json if using private_key_jwt OIDC
chmod 600 ../../secrets/*.json
```

`python3 scripts/register_okta_app_jwk.py` derives the public half and uploads it to the Okta app (needs `OKTA_API_TOKEN` in `.env`).

### 2d. SAML, SCIM, real-time Okta push (optional legacy/provisioning demos)

Follow README.md §1, §3, §4 with your substituted hostnames. Real-time push needs an **[HUMAN]**-created SSWS token with `okta.users.manage` → `OKTA_API_TOKEN`, `OKTA_ORG_URL`, `OKTA_PUSH_ENABLED=true`. Verify via `GET /health` → `oktaPush.enabled: true`.

### 2e. MCP server + Okta AI agent + ID-JAG delegation (the headline demo)

Requires 2a + 2b + 2c. Follow README.md "MCP Server" section: register the MCP server (**[HUMAN]**: Directory → MCP Servers, Base URL `<API_PUBLIC_URL>/mcp` — must be public HTTPS, so this is a deployed-environment step), set `AGENT_CLIENT_ID` / `OKTA_AGENT_REGISTRATION_ID` from the **[HUMAN]**-created Okta AI agent registration. **Verify:** `curl <API_PUBLIC_URL>/.well-known/oauth-protected-resource/mcp` lists your AS issuer, and `GET /api/v1/mcp/discovery` shows PRM and AS scopes matching. The README's troubleshooting table for "No authorization servers were found" is accurate — most common cause is scopes missing "Include in public metadata".

## Phase 3 — Deploying (EC2 or similar)

- Instance: Ubuntu 22.04+ / Amazon Linux 2023, t3.medium+ (build needs ~2 GB RAM), Node 20, pnpm, Docker + compose plugin.
- **Security group: expose only 80/443** behind a reverse proxy (nginx/Caddy/ALB). Never expose 5437 (Postgres) or the raw app ports.
- Two public hostnames (UI + API) with the reverse proxy: UI host → `127.0.0.1:5173`, API host → `127.0.0.1:3010`. If UI and API share a parent domain, set `SESSION_COOKIE_DOMAIN=.your-domain.com`; the OIDC callback lands on the API host and the session must be readable from the UI host.
- Production `.env` changes: real `https://` URLs for `APP_URL` / `API_PUBLIC_URL` / `CORS_ORIGIN` / redirect URIs, `NODE_ENV=production` (disables dev login), `TRUST_PROXY=true`, strong `SESSION_SECRET`.
- Run with PM2: `pnpm start` (builds, starts Postgres + API + web, waits for health). `pnpm status` / `pnpm logs` / `pnpm ensure-up`.
- Survive reboots: `sudo bash scripts/install-boot-service.sh` — the systemd unit is templated and rendered for the invoking user and checkout path, so it works as-is on EC2.
- Update every Okta redirect URI / audience / SAML URL to the public hostnames (the AS **audience** and `MCP_RESOURCE_URL` must stay byte-identical to each other).

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `EADDRINUSE` on 3010/5173 | Another service owns the port — change `API_PORT` / Vite port or stop the other service. `pnpm start` frees ports automatically (see ground rule 5). |
| Dev login form missing | `NODE_ENV=production` — use a non-production value locally. |
| OIDC callback loops / session lost | `SESSION_COOKIE_DOMAIN` set while on localhost, or UI/API on unrelated domains. Unset it locally; use a shared parent domain in prod. |
| 401 on API with a valid-looking token | Token audience ≠ `OKTA_AUDIENCE`, or scope not granted. Decode the JWT and compare `aud`/`scp`. |
| Okta MCP registry: "No authorization servers were found" | See README troubleshooting — usually scopes not in public metadata, or audience mismatch. |
| Prisma cannot reach DB | Postgres container not up (`docker compose up -d`) or port 5437 taken. |

## File map (orientation)

```
apps/api/src/routes/      auth, oidc, students, chat, student-dcr
apps/api/src/lib/         okta-client, agent-token-exchange (ID-JAG), verify-oauth-token, chat tools
apps/api/src/mcp/         MCP HTTP transport + RFC 9728 metadata
packages/mcp-server/      stdio/HTTP MCP client package
docs/okta-as-config.json  canonical AS scopes/claims/persona matrix
scripts/                  start/stop (PM2), okta JWK + ID-JAG helpers, env import
deploy/sis-demo.service   systemd template (rendered by install-boot-service.sh)
```
