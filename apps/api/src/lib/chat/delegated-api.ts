import { OAuthScopes, hasAnyScope, type OAuthScope } from "@sis/shared";
import { config } from "../../config.js";

export type DelegatedAccess = {
  accessToken: string;
  grantedScopes: string[];
  /** When set, internal API calls use the browser session (capped scopes) instead of the bearer token. */
  sessionCookie?: string;
};

export function parseGrantedScopes(scope?: string): string[] {
  return (scope ?? "").split(/\s+/).filter(Boolean);
}

/** True if delegated token includes admin or any of the required scopes. */
export function canAccess(granted: string[], required: OAuthScope[]): boolean {
  if (granted.includes(OAuthScopes.ADMIN)) return true;
  return hasAnyScope(granted, required);
}

function sisApiBaseUrl(): string {
  const internal = process.env.SIS_API_INTERNAL_URL?.trim();
  if (internal) return internal.replace(/\/$/, "");
  if (config.nodeEnv === "production") {
    return `http://127.0.0.1:${config.port}`;
  }
  return config.apiPublicUrl.replace(/\/$/, "");
}

export async function sisApiFetch(
  path: string,
  accessToken: string,
  init?: RequestInit,
  sessionCookie?: string
): Promise<unknown> {
  const base = sisApiBaseUrl();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (sessionCookie) {
    headers.Cookie = sessionCookie;
  } else {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
  });

  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* plain text error */
  }

  if (!res.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error?: { message?: string } }).error?.message === "string"
        ? (body as { error: { message: string } }).error.message
        : text || res.statusText;
    return { error: `API ${res.status}: ${message}`, status: res.status, body };
  }

  return body;
}
