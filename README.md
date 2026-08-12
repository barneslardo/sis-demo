# SIS Demo — Student Information System

> 🤖 **Setting this up with an AI coding agent?** Point it at [README-AGENT.md](README-AGENT.md) — a phased, verification-driven runbook written for agents.

A demonstration Student Information System built with Node.js, React, and PostgreSQL. Uses **Okta OIDC** for sign-in (group-based admin vs student roles), OAuth 2.0 API access, and an MCP server for agentic AI integration.

## Architecture

- **apps/api** — Express REST API with SAML, OAuth, SCIM, and student CRUD
- **apps/web** — React SPA (admin dashboard + student read-only profile)
- **packages/shared** — Shared Zod schemas and OAuth scope constants
- **packages/mcp-server** — MCP tools wrapping the REST API

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 10+
- Docker (for PostgreSQL)

### Run in background (production — no open terminals)

```bash
pnpm install
cp .env.example .env   # edit with your values
pnpm start             # builds, starts Postgres + API + Web via PM2
```

| Command | Action |
|---------|--------|
| `pnpm start` | Build and run API + Web in background |
| `pnpm stop` | Stop API + Web |
| `pnpm restart` | Rebuild and restart |
| `pnpm status` | PM2 process status |
| `pnpm logs` | Tail combined logs |

Services listen on **3010** (API) and **5173** (Web). Point your reverse proxy (nginx/Caddy) at those ports.

### Production (PM2, resilient)

```bash
pnpm start              # full: docker + install + build + migrate + PM2
FAST_START=1 pnpm start   # recovery: build + PM2 (skip install/migrate)
pnpm ensure-up            # no-op if healthy; otherwise FAST_START recovery
pnpm status               # pm2 status
pnpm logs                 # tail PM2 logs
```

PM2 uses `ecosystem.config.cjs` with exponential backoff restarts, frees ports before start (avoids `EADDRINUSE` crash loops), and waits for local health checks before finishing.

Optional — survive server reboot:

```bash
pnpm exec pm2 startup   # run the sudo command it prints once
pnpm exec pm2 save
```

### Local development (hot reload)

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env

# Start PostgreSQL
docker compose up -d

# Push schema and seed demo data
pnpm db:push
pnpm db:seed

# Start API + web with hot reload (keeps terminals open)
pnpm dev
```

- **Web UI:** http://localhost:5173
- **API:** http://localhost:3010
- **OpenAPI:** http://localhost:3010/api/v1/openapi.json
- **Health:** http://localhost:3010/health

### Dev Login (no Okta required)

Use the dev login form at http://localhost:5173/login:

| Email | Role |
|-------|------|
| `admin@university.edu` | Administrator |
| `alice.johnson@university.edu` | Student |

## Student Attributes

All 22 attributes are supported:

`enrollmentDate`, `enrollmentStatus`, `enrolledClasses`, `financialAid`, `earnedDegrees`, `firstName`, `lastName`, `email`, `address`, `zipCode`, `state`, `phone`, `emergencyContact`, `emergencyContactPhone`, `authorizedPayer`, `authorizedPayerPhone`, `authorizedPayerAddress`, `authorizedPayerZip`, `authorizedPayerState`, `authorizedPayerEmail`, `ADA`

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/students` | Admin / `sis.students.read` | List students |
| GET | `/api/v1/students/:id` | Admin / `sis.students.read` | Get student |
| GET | `/api/v1/students/me` | Student / `sis.students.read.self` | Own profile |
| POST | `/api/v1/students` | Admin / `sis.students.write` | Create |
| PATCH | `/api/v1/students/:id` | Admin / `sis.students.write` | Update |
| DELETE | `/api/v1/students/:id` | Admin / `sis.students.write` | Delete |

Responses use `{ data, meta }` envelope with structured errors `{ error: { code, message } }`.

## Okta Configuration

### 1. SAML 2.0 Web App (Human Login)

Use these values in your Okta SAML app (General → SAML Settings):

| Okta field | Value |
|------------|-------|
| **Single sign-on URL** | `https://sis-api.skylarbarnes.com/auth/saml/callback` |
| **Audience URI (SP Entity ID)** | `https://sis-api.skylarbarnes.com/auth/saml/metadata` |
| **Default RelayState** | `https://sis.skylarbarnes.com/` |

1. In Okta Admin, create a **SAML 2.0** application
2. Configure the fields above (local dev uses `http://localhost:3010` for API URLs and `http://localhost:5173/` for RelayState)
3. Attribute statements:
   - `email` → `user.email`
   - `groups` → `user.groups` (or use group memberships)
4. Assign users to groups named `admin` or `student` (group name determines role)
5. Copy IdP metadata values to `.env`:
   ```
   SAML_ENTRY_POINT=https://your-org.okta.com/app/xxx/sso/saml
   SAML_CERT=<IdP signing certificate>
   ```

SP metadata is available at: `GET https://sis-api.skylarbarnes.com/auth/saml/metadata`

Set in `.env`:

```bash
APP_URL=https://sis.skylarbarnes.com
API_PUBLIC_URL=https://sis-api.skylarbarnes.com
CORS_ORIGIN=https://sis.skylarbarnes.com
SESSION_COOKIE_DOMAIN=.skylarbarnes.com
TRUST_PROXY=true
NODE_ENV=production
```

For the Vite dev server behind `sis.skylarbarnes.com`, restart after pulling (`pnpm dev:web`). `allowedHosts` includes that hostname.

If UI and API are on different subdomains, set `VITE_API_URL=https://sis-api.skylarbarnes.com` in `apps/web/.env` (or export before `pnpm dev:web`).

### 2. OAuth 2.0 Authorization Server (API / Agents / MCP / DCR)

**Canonical reference:** [`docs/okta-as-config.json`](docs/okta-as-config.json) — scopes, claims, persona matrix, and production URLs.

**Authorization server (sledai preview):**

| Setting | Value |
|---------|--------|
| AS ID | `wlpzfntwqat4SXBba1d7` |
| Issuer | `https://sledai.oktapreview.com/oauth2/wlpzfntwqat4SXBba1d7` |
| Audience | `https://sis-api.skylarbarnes.com/mcp` |
| MCP endpoint | `https://sis-api.skylarbarnes.com/mcp` |

Configure `.env`:

```bash
OKTA_ISSUER=https://sledai.oktapreview.com/oauth2/wlpzfntwqat4SXBba1d7
OKTA_AUDIENCE=https://sis-api.skylarbarnes.com/mcp
MCP_RESOURCE_URL=https://sis-api.skylarbarnes.com/mcp
OAUTH_TOKEN_URL=https://sledai.oktapreview.com/oauth2/wlpzfntwqat4SXBba1d7/v1/token
RESOURCE_AS_ISSUER=https://sledai.oktapreview.com/oauth2/wlpzfntwqat4SXBba1d7
```

**Scopes (11 total, dot-separated, consent Implicit, include in public metadata):**

| Scope | Personas |
|-------|----------|
| `sis.admin` | SIS Admin — bypasses all category checks |
| `sis.students.read` | Staff, Enrollment Counselor, Student Affairs |
| `sis.students.write` | SIS Admin, Registrar |
| `sis.students.read.self` | Student (`/me` only) |
| `sis.students.ferpa` | Enrollment Counselor |
| `sis.students.financial` | Enrollment Counselor |
| `sis.students.ada` | Student Affairs |
| `sis.students.disciplinary` | Student Affairs |
| `sis.students.counselor` | Student Affairs |
| `sis.students.risk` | Student Affairs |
| `sis.students.academic` | Student Affairs |

**Access token claims:** `iss`, `aud`, `sub`, `exp`, `iat`, `scp` (or `scope`), plus **`email`** via AS claim mapping (`user.email`) for `/me` and agent identity.

**Token request (client credentials):**
```bash
curl -X POST "$OAUTH_TOKEN_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "$OAUTH_CLIENT_ID:$OAUTH_CLIENT_SECRET" \
  -d "grant_type=client_credentials&scope=sis.admin"
```

**API call:**
```bash
curl https://sis-api.skylarbarnes.com/api/v1/students \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 3. SCIM 2.0 Provisioning (bidirectional)

| Population | Direction | Mechanism |
|------------|-----------|-----------|
| **Students** | SIS → Okta | Okta **imports** from `GET /scim/v2/Users` (students only, with student extension) |
| **Admins** | Okta → SIS | Okta **pushes** via `POST` / `PATCH` / `PUT` / `DELETE` on `/scim/v2/Users` (creates `role: admin` in SIS) |

Students remain the SIS source of truth. Okta cannot push student records to SIS (requests with the student extension are rejected). Admins are provisioned from Okta assignments into the SIS `users` table.

**SAML 2.0** (§1) is still used for admin **sign-in** to the UI; SCIM push creates the admin account before or without first login.

1. Create a **SCIM 2.0** app in Okta
2. Configure:
   - **SCIM connector base URL:** `https://sis-api.skylarbarnes.com/scim/v2`
   - **Unique identifier field:** `userName`
   - **Authentication:** HTTP Header — `Authorization: Bearer <SCIM_API_TOKEN>`
3. **Supported provisioning actions:**
   - **Import New Users and Profile Updates** — ON (students from SIS)
   - **Push New Users** — ON (admins to SIS)
   - **Push Profile Updates** — ON (admins to SIS)
   - **Push Groups** — OFF (unless you add group support later)
4. **Assignments:** assign **admin** users/groups to this app for push; student identities in Okta come from **Import**, not push
5. Map **import** attributes from extension `urn:ietf:params:scim:schemas:extension:sis:2.0:Student`
6. Run **Import** after students exist in SIS; assign admins and verify push (or use **Provision Now**)

**SCIM endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/Users` | List **students** for Okta import |
| GET | `/Users/:id` | Read student or admin |
| POST | `/Users` | Create **admin** in SIS (Okta push) |
| PUT/PATCH | `/Users/:id` | Update **admin** |
| DELETE | `/Users/:id` | Deactivate **admin** (`active: false`) |

**Troubleshooting**

| Symptom | Fix |
|---------|-----|
| Student missing in Okta | Create in SIS → run SCIM **Import** (or use real-time push in §4) |
| Admin "Matching user not found" then fails | Enable **Push**; assign user to app; API creates admin on `POST` |
| Admin cannot sign in | Assign SAML app too; group name contains `admin` or email in `HARDCODED_ADMIN_EMAILS` |
| Push rejected for student-shaped payload | Expected — create students in SIS only |

### 4. Real-time push to Okta (SIS API → Okta Users API)

When `OKTA_API_TOKEN` is set, **student CRUD** on `/api/v1/students` pushes changes to Okta via the [Okta Management API](https://developer.okta.com/docs/api/openapi/okta-management/management/tag/User/):

| SIS action | Okta action |
|------------|-------------|
| `POST` create student | Create user (`POST /api/v1/users?activate=true`), link `users.oktaId` |
| `PATCH` update student | Update profile (`PUT /api/v1/users/{id}`) |
| `DELETE` student | **Deactivate** user (`POST .../lifecycle/deactivate`) — never hard-delete in Okta |

1. **Security → API → Tokens** — create a token with `okta.users.manage` (SSWS).
2. Add to `.env`:
   ```bash
   OKTA_ORG_URL=https://your-org.oktapreview.com
   OKTA_API_TOKEN=your-ssws-token
   OKTA_PUSH_ENABLED=true
   ```
   `OKTA_ORG_URL` defaults from `SAML_ENTRY_POINT` origin if omitted.
3. Optional: `OKTA_STUDENT_GROUP_IDS=00gxxx,00gyyy` — assign new users to groups on create.
4. Optional: `OKTA_PUSH_EXTENDED_PROFILE=true` — send SIS extension fields as Okta custom profile attributes (create matching attributes in **Directory → Profile Editor** first).
5. `GET /health` → `oktaPush.enabled` confirms push is active.

API responses include `oktaSync` when push runs (`action`: `created` | `updated` | `deactivated` | `linked`). Push is best-effort by default (`OKTA_PUSH_REQUIRED=false`); SIS DB changes still succeed if Okta is unreachable.

SCIM import remains useful for bulk reconciliation; real-time push covers CRUD without waiting for an import job.

### 5. Admin chat assistant (in-app LLM)

Admins see an **Ask SIS** panel on every admin page. When agent token exchange is configured, each chat turn:

1. Exchanges the signed-in user's OIDC `id_token` for a **delegated access token** (ID-JAG → custom AS `wlpzfntwqat4SXBba1d7`).
2. Calls `/api/v1/students` with that Bearer token so **Okta group→scope policies** bound what the user can read/write.
3. Returns `delegatedScopes` in the chat response so you can see the effective grant.

Tools: `list_students`, `search_students`, `get_student`, `create_student`, `update_student`.

**Auth requirement:** use **OIDC** (not SAML) when agent exchange is enabled — SAML sessions have no `id_token`. SAML remains a legacy fallback only when agent exchange is off (direct DB tools).

1. Create an **OIDC Web Application** in Okta (Authorization Code + PKCE).
2. Redirect URI: `https://sis-api.skylarbarnes.com/auth/oidc/callback`
3. Add to `.env`:
   ```bash
   OKTA_OIDC_CLIENT_ID=...
   OKTA_OIDC_CLIENT_SECRET=...
   OKTA_OIDC_REDIRECT_URI=https://sis-api.skylarbarnes.com/auth/oidc/callback
   OIDC_SCOPES=openid profile email groups
   OPENAI_API_KEY=...   # and/or ANTHROPIC_API_KEY
   ```
4. **Optional agent governance** (mirror the [super-duper-admin-portal](https://github.com/barneslardo/super-duper-admin-portal) pattern):
   - Register an Okta UD **AI agent** + custom AS resource (`RESOURCE_AS_ISSUER` = your `sis.*` AS)
   - Place agent signing key at `secrets/agent-private-key.json`
   - Set `AGENT_CLIENT_ID`, `OKTA_AGENT_REGISTRATION_ID`, and `secrets/agent-private-key.json`
   - `RESOURCE_AS_ISSUER` must be `https://sledai.oktapreview.com/oauth2/wlpzfntwqat4SXBba1d7`
5. API routes: `POST /api/v1/chat`, `GET /api/v1/chat/models`, `GET /auth/oidc/login`

**Import vars from an existing admin-portal env file** (optional — if you already run the super-duper-admin-portal and want to reuse its Okta/LLM config):

```bash
bash scripts/import-admin-env.sh /path/to/admin-portal-env.txt
FAST_START=1 pnpm start
```

The script maps admin-app keys (`OKTA_OIDC_*`, `AGENT_*`, LLM keys) to SIS `.env` and rewrites the OIDC redirect URI for the SIS API host.

## MCP Server (SIS API + Okta AI Agents + DCR)

The SIS MCP server exposes student CRUD and **data-category (DCR)** read tools over **Streamable HTTP** at `/mcp`. Okta AI agents discover OAuth via [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728) protected-resource metadata.

**Full Okta setup:** [`docs/okta-as-config.json`](docs/okta-as-config.json)

| Endpoint | Purpose |
|----------|---------|
| `POST/GET/DELETE /mcp` | MCP Streamable HTTP (requires Bearer token) |
| `/.well-known/oauth-protected-resource` | Primary OAuth resource metadata |
| `/.well-known/oauth-protected-resource/mcp` | Alternate PRM path |
| `GET /api/v1/mcp/discovery` | Diagnostic: PRM scopes vs Okta AS metadata |
| `GET /health` | Includes `mcp.url`, issuer, audience, scopes |

**Register in Okta → Directory → MCP Servers:**

- **Base URL:** `https://sis-api.skylarbarnes.com/mcp`
- **Authorization server:** `wlpzfntwqat4SXBba1d7` (`https://sledai.oktapreview.com/oauth2/wlpzfntwqat4SXBba1d7`)
- **Audience:** `https://sis-api.skylarbarnes.com/mcp`

Set in `.env`:

```bash
OKTA_ISSUER=https://sledai.oktapreview.com/oauth2/wlpzfntwqat4SXBba1d7
OKTA_AUDIENCE=https://sis-api.skylarbarnes.com/mcp
MCP_RESOURCE_URL=https://sis-api.skylarbarnes.com/mcp
```

Restart the API after changing OAuth settings.

### OAuth app for the Okta AI Agent (preregistered client)

Okta AI agents require a **confidential** OAuth client (no Dynamic Client Registration). Create one of:

- **OIDC Web Application** — enable **Authorization Code**, **Client Credentials**, and **Refresh Token** if the agent uses user context; or
- **API Services** — **Client Credentials** only for a headless service account

Grant the app access to authorization server `wlpzfntwqat4SXBba1d7` and the scopes from [`docs/okta-as-config.json`](docs/okta-as-config.json). Note the **Client ID** and **Client secret** for MCP server registration.

### Register the MCP server in Okta (AI Agent)

1. **Directory → MCP Servers → Add**
2. **Base URL:** `https://sis-api.skylarbarnes.com/mcp` (cannot be changed later)
3. **Client credentials:** Client ID + Client secret from your OAuth app
4. **Scopes:** persona-appropriate set (e.g. `sis.admin` for full access, or `sis.students.read` + DCR scopes per [`dcr_access_control_matrix`](docs/okta-as-config.json))
5. **Test** connection, then **Activate** the server
6. **Connect AI agents to resources** — attach this MCP server to your Okta AI agent

Okta will call `GET https://sis-api.skylarbarnes.com/.well-known/oauth-protected-resource` to discover the authorization server and supported scopes.

### Local stdio mode (Cursor / Claude Desktop)

```bash
pnpm --filter @sis/mcp-server build
```

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "sis-demo": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "SIS_API_URL": "http://localhost:3010",
        "OAUTH_CLIENT_ID": "...",
        "OAUTH_CLIENT_SECRET": "...",
        "OAUTH_TOKEN_URL": "https://sledai.oktapreview.com/oauth2/wlpzfntwqat4SXBba1d7/v1/token"
      }
    }
  }
}
```

Or set `SIS_OAUTH_TOKEN` to a pre-issued access token.

### MCP Tools

| Tool | Required Scope |
|------|----------------|
| `list_students` | `sis.students.read` or `sis.admin` |
| `get_student` | `sis.students.read` or `sis.admin` |
| `get_my_profile` | `sis.students.read.self` |
| `create_student` | `sis.students.write` or `sis.admin` |
| `update_student` | `sis.students.write` or `sis.admin` |
| `delete_student` | `sis.students.write` or `sis.admin` |
| `get_student_ferpa` | `sis.students.ferpa` or `sis.admin` |
| `get_student_financial` | `sis.students.financial` or `sis.admin` |
| `get_student_ada` | `sis.students.ada` or `sis.admin` |
| `get_student_disciplinary` | `sis.students.disciplinary` or `sis.admin` |
| `get_student_counselor_notes` | `sis.students.counselor` or `sis.admin` |
| `get_student_risk` | `sis.students.risk` or `sis.admin` |
| `get_student_academic` | `sis.students.academic` or `sis.admin` |

HTTP MCP forwards the caller’s Bearer token to the REST API; tool access follows the token’s scopes and the DCR persona matrix in [`docs/okta-as-config.json`](docs/okta-as-config.json).

### Troubleshooting: “No authorization servers were found” (Okta MCP UI)

Okta reads `authorization_servers` from your MCP **Protected Resource Metadata** and matches each issuer against **Security → API → Authorization Servers** in your org.

**Server-side checks:**

```bash
curl -s https://sis-api.skylarbarnes.com/.well-known/oauth-protected-resource/mcp
# authorization_servers must be exactly your custom AS Issuer URI, e.g.:
# https://sledai.oktapreview.com/oauth2/wlpzfntwqat4SXBba1d7
```

**Common causes:**

1. **Scopes not in Okta public metadata (most common after audience fix)** — Okta only publishes custom scopes in `/.well-known/oauth-authorization-server` when each scope has **Include in public metadata** enabled. If PRM lists `sis.students.read` but Okta's AS metadata does not, the MCP registry cannot link the authorization server.

   **Fix:** Security → API → your authorization server → **Scopes** → edit each `sis.*` scope → enable **Include in public metadata** → Save. Verify:

   ```bash
   curl -s https://sledai.oktapreview.com/oauth2/wlpzfntwqat4SXBba1d7/.well-known/oauth-authorization-server | grep sis
   ```

   Diagnostic: `curl -s https://sis-api.skylarbarnes.com/api/v1/mcp/discovery`

2. **Audience mismatch** — AS Audience must equal `https://sis-api.skylarbarnes.com/mcp` (same as PRM `resource`).
3. **Wrong MCP base URL** — use exactly `https://sis-api.skylarbarnes.com/mcp`; delete and recreate if wrong.
4. **Access policy missing** — create an Access Policy on the custom AS with a rule allowing **Client Credentials** and **Authorization Code**, and the `sis.*` scopes.
5. **App type** — Okta MCP registry expects a **OIDC Web Application** (Authorization Code + Refresh Token), not only an API Services app. Create a Web app assigned to the same custom AS if credentials stay disabled.

## Environment Variables

See [`.env.example`](.env.example) for all configuration options.

## Security Notes

This is a **demonstration app**, not production-ready:

- Dev login bypass is available when `NODE_ENV !== production`
- Session store is in-memory (use Redis for production)
- No PII encryption at rest
- Use HTTPS in deployed environments

## License

MIT — demo use only.
