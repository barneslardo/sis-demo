#!/usr/bin/env python3
"""Fix SIS AS for ID-JAG hop 2: sis_entitlement claim + EVERYONE jwt-bearer rule (SDAP pattern)."""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

SIS_AS_ID = "auszblykhlQkrnOmA1d7"
SIS_AGENT_JWT_RULE = "sis-agent (ID-JAG hop 2)"
GROUP_JWT_RULE_PREFIX = "Agent JWT —"
CLAIM_NAME = "sis_entitlement"
# Staff/student groups on the SIS sign-on app (must match Okta group profile names).
SIS_ENTITLEMENT_GROUP_REGEX = (
    r"^(Enrollment Admins|Enrollment Counselor|Student Affairs|Registrar|Students)$"
)

SIS_SCOPES = [
    "sis.admin",
    "sis.students.read",
    "sis.students.write",
    "sis.students.read.self",
    "sis.students.ferpa",
    "sis.students.financial",
    "sis.students.ada",
    "sis.students.disciplinary",
    "sis.students.counselor",
    "sis.students.risk",
    "sis.students.academic",
]


def load_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def api(method: str, url: str, token: str, body: dict | None = None) -> tuple[int, dict | list]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"SSWS {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"raw": raw}
        return e.code, payload


def entitlement_claim_body() -> dict:
    return {
        "name": CLAIM_NAME,
        "status": "ACTIVE",
        "claimType": "RESOURCE",
        "valueType": "GROUPS",
        "value": SIS_ENTITLEMENT_GROUP_REGEX,
        "group_filter_type": "REGEX",
        "conditions": {"scopes": []},
        "alwaysIncludeInToken": True,
    }


def ensure_entitlement_claim(org: str, token: str) -> None:
    st, claims = api("GET", f"{org}/api/v1/authorizationServers/{SIS_AS_ID}/claims", token)
    if st != 200:
        print("List claims failed:", claims)
        sys.exit(1)
    existing = next((c for c in claims if c.get("name") == CLAIM_NAME), None)
    body = entitlement_claim_body()
    if existing:
        st, updated = api(
            "PUT",
            f"{org}/api/v1/authorizationServers/{SIS_AS_ID}/claims/{existing['id']}",
            token,
            body,
        )
        if st != 200:
            print(f"Update claim failed ({st}):", json.dumps(updated, indent=2))
            sys.exit(1)
        print(f"Updated claim: {CLAIM_NAME} (REGEX)")
        return

    st, created = api(
        "POST", f"{org}/api/v1/authorizationServers/{SIS_AS_ID}/claims", token, body
    )
    if st not in (200, 201):
        print(f"Create claim failed ({st}):", json.dumps(created, indent=2))
        sys.exit(1)
    print(f"Created claim: {CLAIM_NAME}")


def ensure_policy_includes_agent(org: str, token: str, agent_client_id: str, oidc_client_id: str) -> None:
    st, policies = api("GET", f"{org}/api/v1/authorizationServers/{SIS_AS_ID}/policies", token)
    if st != 200 or not policies:
        print("List policies failed:", policies)
        sys.exit(1)
    policy = policies[0]
    clients = policy.get("conditions", {}).get("clients", {}).get("include", [])
    needed = [c for c in (oidc_client_id, agent_client_id) if c]
    updated = list(dict.fromkeys(clients + [c for c in needed if c not in clients]))
    if updated == clients:
        print("Policy clients already include sign-on app + agent")
        return
    body = {
        "type": "OAUTH_AUTHORIZATION_POLICY",
        "status": policy.get("status", "ACTIVE"),
        "name": policy["name"],
        "description": policy.get("description") or policy["name"],
        "priority": policy.get("priority", 1),
        "conditions": {"clients": {"include": updated, "exclude": []}},
    }
    st, out = api(
        "PUT",
        f"{org}/api/v1/authorizationServers/{SIS_AS_ID}/policies/{policy['id']}",
        token,
        body,
    )
    if st != 200:
        print(f"Update policy clients failed ({st}):", json.dumps(out, indent=2))
        sys.exit(1)
    print("Policy clients:", out.get("conditions", {}).get("clients", {}).get("include"))


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    env = load_env(repo / ".env")
    org = env.get("OKTA_ORG_URL", "").rstrip("/")
    okta_token = env.get("OKTA_API_TOKEN", "").strip()
    if not org or not okta_token:
        sys.exit("Missing OKTA_ORG_URL or OKTA_API_TOKEN")

    agent_client_id = env.get("AGENT_CLIENT_ID", "").strip()
    oidc_client_id = env.get("OKTA_OIDC_CLIENT_ID", "").strip()
    ensure_entitlement_claim(org, okta_token)
    if agent_client_id:
        ensure_policy_includes_agent(org, okta_token, agent_client_id, oidc_client_id)

    st, policies = api("GET", f"{org}/api/v1/authorizationServers/{SIS_AS_ID}/policies", okta_token)
    policy_id = policies[0]["id"]

    st, rules = api(
        "GET",
        f"{org}/api/v1/authorizationServers/{SIS_AS_ID}/policies/{policy_id}/rules",
        okta_token,
    )

    # Deactivate group-scoped jwt rules — ID-JAG hop 2 authenticates as the agent, not the user group
    for rule in rules:
        name = rule.get("name", "")
        grants = rule.get("conditions", {}).get("grantTypes", {}).get("include", [])
        if "jwt-bearer" not in str(grants):
            continue
        if name.startswith(GROUP_JWT_RULE_PREFIX) and rule.get("status") == "ACTIVE":
            st, _ = api(
                "POST",
                f"{org}/api/v1/authorizationServers/{SIS_AS_ID}/policies/{policy_id}/rules/{rule['id']}/lifecycle/deactivate",
                okta_token,
            )
            if st in (200, 204):
                print(f"Deactivated: {name}")

    st, rules = api(
        "GET",
        f"{org}/api/v1/authorizationServers/{SIS_AS_ID}/policies/{policy_id}/rules",
        okta_token,
    )
    existing = {r.get("name"): r for r in rules}

    agent_rule_body = {
        "type": "RESOURCE_ACCESS",
        "name": SIS_AGENT_JWT_RULE,
        "priority": 1,
        "conditions": {
            "people": {
                "users": {"exclude": [], "include": []},
                "groups": {"exclude": [], "include": ["EVERYONE"]},
            },
            "grantTypes": {
                "include": ["urn:ietf:params:oauth:grant-type:jwt-bearer"],
            },
            "scopes": {"include": SIS_SCOPES},
        },
        "actions": {
            "token": {
                "accessTokenLifetimeMinutes": 60,
                "refreshTokenLifetimeMinutes": 0,
                "refreshTokenWindowMinutes": 10080,
            }
        },
    }

    agent_rule = existing.get(SIS_AGENT_JWT_RULE)
    if agent_rule and agent_rule.get("status") == "ACTIVE":
        print(f"Already active: {SIS_AGENT_JWT_RULE}")
    elif agent_rule and agent_rule.get("status") == "INACTIVE":
        st, _ = api(
            "POST",
            f"{org}/api/v1/authorizationServers/{SIS_AS_ID}/policies/{policy_id}/rules/{agent_rule['id']}/lifecycle/activate",
            okta_token,
        )
        print(f"Activated: {SIS_AGENT_JWT_RULE} ({st})")
    else:
        st, created = api(
            "POST",
            f"{org}/api/v1/authorizationServers/{SIS_AS_ID}/policies/{policy_id}/rules",
            okta_token,
            agent_rule_body,
        )
        if st not in (200, 201):
            print(f"Create rule failed ({st}):", json.dumps(created, indent=2))
            sys.exit(1)
        print(f"Created: {SIS_AGENT_JWT_RULE} ({created.get('id')})")

    print("Done. ID-JAG hop 2 uses EVERYONE jwt-bearer rule + sis_entitlement claim (SDAP pattern).")


if __name__ == "__main__":
    main()
