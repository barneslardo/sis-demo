import type { NextFunction, Request, Response } from "express";
import {
  OAuthScopes,
  type AuthUser,
  type OAuthScope,
  capDelegatedScopes,
  hasAnyScope,
  resolveScopesFromGroups,
  resolveSessionEntitledScopes,
} from "@sis/shared";
import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import { verifyOAuthAccessToken } from "../lib/verify-oauth-token.js";

declare global {
  namespace Express {
    interface User extends AuthUser {}
    interface Request {
      oauth?: {
        sub: string;
        email?: string;
        scopes: string[];
        sisRole?: string;
      };
    }
  }
}

function sessionScopes(req: Request): string[] {
  if (!req.user) return [];
  if (req.user.scopes?.length) return req.user.scopes;
  return resolveScopesFromGroups(req.user.email, req.user.groups ?? []);
}

export function resolveRequestScopes(req: Request): string[] {
  const session = sessionScopes(req);
  if (req.oauth?.scopes?.length) {
    const email = req.oauth.email ?? req.user?.email;
    if (email && session.length) {
      return capDelegatedScopes(req.oauth.scopes, session);
    }
    if (email) {
      return capDelegatedScopes(
        req.oauth.scopes,
        resolveSessionEntitledScopes(email, req.user?.groups ?? [], req.user?.scopes)
      );
    }
    return req.oauth.scopes;
  }
  return session;
}

export function resolveCallerEmail(req: Request): string | undefined {
  return req.user?.email ?? req.oauth?.email;
}

function sessionHasScope(req: Request, scopes: OAuthScope[]): boolean {
  const granted = sessionScopes(req);
  return hasAnyScope(granted, scopes);
}

export async function authenticateRequest(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ") && config.oauth.enabled) {
    try {
      const token = authHeader.slice(7);
      const verified = await verifyOAuthAccessToken(token);
      req.oauth = {
        sub: verified.sub,
        email: verified.email,
        scopes: verified.scopes,
        sisRole: undefined,
      };
      return next();
    } catch {
      return next(new AppError(401, "INVALID_TOKEN", "Invalid or expired access token"));
    }
  }

  if (req.user) {
    return next();
  }

  return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role === "admin") return next();
  if (req.oauth && hasAnyScope(req.oauth.scopes, [OAuthScopes.ADMIN, OAuthScopes.STUDENTS_READ, OAuthScopes.STUDENTS_WRITE])) {
    return next();
  }
  return next(new AppError(403, "FORBIDDEN", "Admin access required"));
}

export function requireStaffStudentRead(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role === "admin") return next();
  if (req.oauth && hasAnyScope(req.oauth.scopes, [OAuthScopes.ADMIN, OAuthScopes.STUDENTS_READ])) {
    return next();
  }
  if (sessionHasScope(req, [OAuthScopes.ADMIN, OAuthScopes.STUDENTS_READ])) {
    return next();
  }
  return next(new AppError(403, "FORBIDDEN", "Staff read access required"));
}

/** Own profile (/me) or staff roster access. */
export function requireProfileRead(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role === "student") return next();
  if (req.user?.role === "admin") return next();
  if (
    req.oauth &&
    hasAnyScope(req.oauth.scopes, [
      OAuthScopes.ADMIN,
      OAuthScopes.STUDENTS_READ,
      OAuthScopes.STUDENTS_READ_SELF,
    ])
  ) {
    return next();
  }
  if (
    sessionHasScope(req, [
      OAuthScopes.ADMIN,
      OAuthScopes.STUDENTS_READ,
      OAuthScopes.STUDENTS_READ_SELF,
    ])
  ) {
    return next();
  }
  return next(new AppError(403, "FORBIDDEN", "Insufficient permissions"));
}

/** @deprecated Prefer requireStaffStudentRead or requireProfileRead */
export function requireStudentRead(req: Request, _res: Response, next: NextFunction) {
  return requireStaffStudentRead(req, _res, next);
}

export function requireWriteAccess(req: Request, _res: Response, next: NextFunction) {
  if (req.oauth && hasAnyScope(req.oauth.scopes, [OAuthScopes.ADMIN, OAuthScopes.STUDENTS_WRITE])) {
    return next();
  }
  if (sessionHasScope(req, [OAuthScopes.ADMIN, OAuthScopes.STUDENTS_WRITE])) {
    return next();
  }
  return next(new AppError(403, "FORBIDDEN", "Write access required"));
}

export function requireScopes(...scopes: OAuthScope[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.oauth && hasAnyScope(req.oauth.scopes, scopes)) return next();
    if (sessionHasScope(req, scopes)) return next();
    return next(
      new AppError(403, "FORBIDDEN", `Required scope: ${scopes.join(" or ")}`)
    );
  };
}

export function requireSelfOrAdmin(getEmail: (req: Request) => string | undefined) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.oauth?.scopes.includes(OAuthScopes.ADMIN)) return next();
    if (req.oauth && hasAnyScope(req.oauth.scopes, [OAuthScopes.STUDENTS_READ])) return next();
    if (sessionHasScope(req, [OAuthScopes.ADMIN, OAuthScopes.STUDENTS_READ])) return next();

    const targetEmail = getEmail(req);
    const callerEmail = req.user?.email ?? req.oauth?.email;
    if (callerEmail && targetEmail && callerEmail.toLowerCase() === targetEmail.toLowerCase()) {
      return next();
    }
    if (req.oauth?.scopes.includes(OAuthScopes.STUDENTS_READ_SELF) && callerEmail) {
      return next();
    }
    if (
      req.user?.role === "student" &&
      callerEmail &&
      targetEmail &&
      callerEmail.toLowerCase() === targetEmail.toLowerCase()
    ) {
      return next();
    }
    return next(new AppError(403, "FORBIDDEN", "Can only access own profile"));
  };
}

// Data-category scope guards — used for DCR-scoped agent access

export const requireFerpaAccess = requireScopes(OAuthScopes.STUDENTS_FERPA);
export const requireFinancialAccess = requireScopes(OAuthScopes.STUDENTS_FINANCIAL);
export const requireAdaAccess = requireScopes(OAuthScopes.STUDENTS_ADA);
export const requireDisciplinaryAccess = requireScopes(OAuthScopes.STUDENTS_DISCIPLINARY);
export const requireCounselorAccess = requireScopes(OAuthScopes.STUDENTS_COUNSELOR);
export const requireRiskAccess = requireScopes(OAuthScopes.STUDENTS_RISK);
export const requireAcademicAccess = requireScopes(OAuthScopes.STUDENTS_ACADEMIC);
export const requireAdminScope = requireScopes(OAuthScopes.ADMIN);
