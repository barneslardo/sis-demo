#!/usr/bin/env python3
"""Merge admin env file (KEY=value or KEY: value) into repo .env."""
import json
import re
import sys
from pathlib import Path

PASSTHROUGH = {
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GROK_API_KEY",
    "OKTA_ORG_URL",
    "OKTA_API_TOKEN",
    "SESSION_SECRET",
    "OKTA_OIDC_CLIENT_ID",
    "OKTA_OIDC_CLIENT_SECRET",
    "OIDC_SCOPES",
    "AGENT_PRIVATE_KEY_PATH",
    "RESOURCE_AS_ISSUER",
    "AGENT_TOKEN_SCOPE",
}

ALIASES = {
    "AGENT_ID": "AGENT_CLIENT_ID",
    "AGENT_CLIENT_ID": "AGENT_CLIENT_ID",
    "CLIENT_ID": "OKTA_OIDC_CLIENT_ID",
    "CLIENT_SECRET": "OKTA_OIDC_CLIENT_SECRET",
    "GROK_4.3_API_KEY": "GROK_API_KEY",
    "COOKIE_DOMAIN": "SESSION_COOKIE_DOMAIN",
    "WEB_ORIGIN": "APP_URL",
    "OKTA_ISSUER": "RESOURCE_AS_ISSUER",
}

SIS_DEFAULTS = {
    "OKTA_OIDC_REDIRECT_URI": "https://sis.skylarbarnes.com/auth/oidc/callback",
    "API_PUBLIC_URL": "https://sis-api.skylarbarnes.com",
    "APP_URL": "https://sis.skylarbarnes.com",
    "CORS_ORIGIN": "https://sis.skylarbarnes.com",
    "SIS_API_URL": "https://sis-api.skylarbarnes.com",
    "OKTA_PUSH_ENABLED": "true",
}

SCOPE_MAP = {
    "sdap.logs.read": "sis.students.read",
    "sdap.users.read": "sis.students.read",
    "sdap.users.manage": "sis.students.write",
    "sdap.act": "sis.admin",
}


def extract_json_block(text: str, marker: str) -> dict | None:
    idx = text.find(marker)
    if idx == -1:
        return None
    brace = text.find("{", idx)
    if brace == -1:
        return None
    depth = 0
    for i in range(brace, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[brace : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def normalize_jwk(jwk: dict | None) -> dict | None:
    if not jwk:
        return None
    if "alg" not in jwk:
        jwk["alg"] = "RS256"
    return jwk


def write_key(repo_root: Path, filename: str, jwk: dict) -> Path:
    secrets_dir = repo_root / "secrets"
    secrets_dir.mkdir(mode=0o700, exist_ok=True)
    key_path = secrets_dir / filename
    key_path.write_text(json.dumps(jwk, indent=2) + "\n")
    key_path.chmod(0o600)
    return key_path


def parse_env(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, _, v = line.partition("=")
        elif ":" in line:
            k, _, v = line.partition(":")
        else:
            continue
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k and re.match(r"^[A-Za-z0-9_.]+$", k):
            out[k] = v
    return out


def normalize_token(v: str) -> str:
    return re.sub(r"^SSWS\s+", "", v.strip(), flags=re.I)


def normalize_scopes(v: str) -> str:
    skip = {"openid", "profile", "email", "groups", "offline_access"}
    parts = [SCOPE_MAP.get(p, p) for p in v.split() if p not in skip]
    for required in ("sis.students.read", "sis.students.write", "sis.admin"):
        if required not in parts:
            parts.append(required)
    return " ".join(dict.fromkeys(parts))


def main() -> None:
    source_path = Path(sys.argv[1])
    target_path = Path(sys.argv[2])
    source_text = source_path.read_text()
    src = parse_env(source_text)
    repo_root = target_path.parent
    existing = parse_env(target_path.read_text()) if target_path.exists() else {}
    updates: dict[str, str] = {}

    for k in PASSTHROUGH:
        if k in src and src[k]:
            updates[k] = normalize_token(src[k]) if k == "OKTA_API_TOKEN" else src[k]

    for sk, dk in ALIASES.items():
        if sk in src and src[sk]:
            updates[dk] = src[sk]

    if "AGENT_TOKEN_SCOPE" in updates:
        updates["AGENT_TOKEN_SCOPE"] = normalize_scopes(updates["AGENT_TOKEN_SCOPE"])
    elif src.get("AGENT_TOKEN_SCOPE"):
        updates["AGENT_TOKEN_SCOPE"] = normalize_scopes(src["AGENT_TOKEN_SCOPE"])

    for k, v in SIS_DEFAULTS.items():
        updates[k] = v

    if updates.get("OKTA_OIDC_REDIRECT_URI", "").endswith("/api/oidc/callback"):
        updates["OKTA_OIDC_REDIRECT_URI"] = SIS_DEFAULTS["OKTA_OIDC_REDIRECT_URI"]

    # Ensure org URL present for OIDC discovery
    if "OKTA_ORG_URL" not in updates and not existing.get("OKTA_ORG_URL"):
        updates["OKTA_ORG_URL"] = "https://sledai.oktapreview.com"

    issuer = existing.get("OKTA_ISSUER") or updates.get("OKTA_ISSUER")
    if issuer and issuer.endswith("/oauth2/auszblykhlQkrnOmA1d7"):
        updates["RESOURCE_AS_ISSUER"] = issuer

    agent_jwk = normalize_jwk(extract_json_block(source_text, "AGENT_PRIVATE_KEY"))
    sign_jwk = normalize_jwk(extract_json_block(source_text, "APP_SIGN_ON_KEY"))
    if agent_jwk:
        updates["AGENT_PRIVATE_KEY_PATH"] = str(
            write_key(repo_root, "agent-private-key.json", agent_jwk).relative_to(repo_root)
        )
    if sign_jwk:
        updates["OKTA_OIDC_PRIVATE_KEY_PATH"] = str(
            write_key(repo_root, "app-sign-on-key.json", sign_jwk).relative_to(repo_root)
        )

    if src.get("AGENT_ID") or src.get("AGENT_CLIENT_ID"):
        updates["AGENT_CLIENT_ID"] = src.get("AGENT_ID") or src.get("AGENT_CLIENT_ID", "")
    elif src.get("OKTA_AGENT_REGISTRATION_ID"):
        updates["AGENT_CLIENT_ID"] = src["OKTA_AGENT_REGISTRATION_ID"]

    if "AGENT_TOKEN_SCOPE" not in updates and not existing.get("AGENT_TOKEN_SCOPE"):
        updates["AGENT_TOKEN_SCOPE"] = "sis.admin"

    lines: list[str] = []
    if target_path.exists():
        for line in target_path.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                key = line.split("=", 1)[0].strip()
                if key in updates:
                    continue
            lines.append(line)

    block = ["", "# --- imported from SISadminsApp (admin chat / OIDC / agent) ---"]
    updated = sorted(k for k in updates if existing.get(k) != updates[k])
    for k in sorted(updates.keys()):
        v = updates[k]
        if " " in v and not (v.startswith('"') and v.endswith('"')):
            v = f'"{v}"'
        block.append(f"{k}={v}")

    target_path.write_text("\n".join(lines + block) + "\n")
    print("Updated keys:", ", ".join(updated) if updated else "(merged defaults only)")
    if agent_jwk:
        print(f"Wrote agent key secrets/agent-private-key.json (kid={agent_jwk.get('kid', '?')})")
    if sign_jwk:
        print(f"Wrote OIDC key secrets/app-sign-on-key.json (kid={sign_jwk.get('kid', '?')})")


if __name__ == "__main__":
    main()
