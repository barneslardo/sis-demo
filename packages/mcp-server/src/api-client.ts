import { OAuthScopes } from "@sis/shared";

const API_URL = process.env.SIS_API_URL ?? "http://localhost:3010";

export async function getServiceAccessToken(): Promise<string> {
  if (process.env.SIS_OAUTH_TOKEN) {
    return process.env.SIS_OAUTH_TOKEN;
  }

  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;
  const tokenUrl = process.env.OAUTH_TOKEN_URL;

  if (!clientId || !clientSecret || !tokenUrl) {
    throw new Error("Set SIS_OAUTH_TOKEN or OAUTH_CLIENT_ID/OAUTH_CLIENT_SECRET/OAUTH_TOKEN_URL");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: `${OAuthScopes.ADMIN} ${OAuthScopes.STUDENTS_READ} ${OAuthScopes.STUDENTS_WRITE}`,
  });

  const audience = process.env.OKTA_AUDIENCE || process.env.MCP_RESOURCE_URL;
  if (audience) {
    body.set("audience", audience.replace(/\/$/, ""));
  }

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit & { accessToken?: string }
): Promise<T> {
  const token = init?.accessToken ?? (await getServiceAccessToken());
  const { accessToken: _drop, ...fetchInit } = init ?? {};

  const res = await fetch(`${API_URL}${path}`, {
    ...fetchInit,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...fetchInit.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} failed: ${res.status} ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
