import { config } from "../config.js";

export type OktaApiError = {
  errorCode?: string;
  errorSummary?: string;
  errorCauses?: { errorSummary: string }[];
};

export type OktaUser = {
  id: string;
  status: string;
  profile: {
    login?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    mobilePhone?: string;
    streetAddress?: string;
    state?: string;
    zipCode?: string;
    [key: string]: unknown;
  };
};

function orgBaseUrl(): string {
  const base = config.oktaPush.orgUrl.replace(/\/$/, "");
  return `${base}/api/v1`;
}

export function isOktaPushConfigured(): boolean {
  return config.oktaPush.enabled;
}

export async function oktaRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>
): Promise<T> {
  if (!config.oktaPush.apiToken) {
    throw new Error("OKTA_API_TOKEN is not configured");
  }

  const url = new URL(`${orgBaseUrl()}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `SSWS ${config.oktaPush.apiToken}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }

  if (!res.ok) {
    const err = json as OktaApiError;
    const summary =
      err?.errorSummary ??
      err?.errorCauses?.map((c) => c.errorSummary).join("; ") ??
      text.slice(0, 200);
    throw new Error(`Okta ${method} ${path} failed (${res.status}): ${summary}`);
  }

  return json as T;
}

/** Okta Users API search: https://developer.okta.com/docs/api/openapi/okta-management/management/tag/User/#tag/User/operation/listUsers */
export async function findOktaUserByLogin(login: string): Promise<OktaUser | null> {
  const search = `profile.login eq "${login.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const users = await oktaRequest<OktaUser[]>("GET", "/users", undefined, { search });
  return users[0] ?? null;
}

export async function createOktaUser(
  profile: Record<string, unknown>,
  options?: { activate?: boolean; groupIds?: string[] }
): Promise<OktaUser> {
  const activate = options?.activate !== false;
  const user = await oktaRequest<OktaUser>("POST", "/users", { profile }, { activate: String(activate) });

  if (options?.groupIds?.length) {
    for (const groupId of options.groupIds) {
      await oktaRequest("PUT", `/groups/${groupId}/users/${user.id}`);
    }
  }

  return user;
}

export async function updateOktaUser(
  oktaUserId: string,
  profile: Record<string, unknown>
): Promise<OktaUser> {
  return oktaRequest<OktaUser>("PUT", `/users/${oktaUserId}`, { profile });
}

export async function deactivateOktaUser(oktaUserId: string): Promise<void> {
  const user = await oktaRequest<OktaUser>("GET", `/users/${oktaUserId}`);
  if (user.status === "DEPROVISIONED" || user.status === "SUSPENDED") {
    return;
  }
  await oktaRequest("POST", `/users/${oktaUserId}/lifecycle/deactivate`, undefined, {
    sendEmail: "false",
  });
}

export async function activateOktaUser(oktaUserId: string): Promise<void> {
  const user = await oktaRequest<OktaUser>("GET", `/users/${oktaUserId}`);
  if (user.status === "ACTIVE") return;
  if (user.status === "DEPROVISIONED") {
    await oktaRequest("POST", `/users/${oktaUserId}/lifecycle/reactivate`, undefined, {
      sendEmail: "false",
    });
    return;
  }
  if (user.status === "PROVISIONED" || user.status === "STAGED") {
    await oktaRequest("POST", `/users/${oktaUserId}/lifecycle/activate`, undefined, { sendEmail: "false" });
  }
}

export type OktaGroup = {
  id: string;
  profile: { name: string };
};

/** Group names and IDs for OIDC role resolution when the id_token has no groups claim. */
export async function listOktaUserGroupTokens(oktaUserId: string): Promise<string[]> {
  const groups = await oktaRequest<OktaGroup[]>("GET", `/users/${oktaUserId}/groups`);
  const tokens = new Set<string>();
  for (const g of groups) {
    if (g.id) tokens.add(g.id);
    const name = g.profile?.name?.trim();
    if (name) tokens.add(name);
  }
  return [...tokens];
}
