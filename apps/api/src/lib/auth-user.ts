import {
  formatDisplayName,
  resolvePersonaLabel,
  resolveScopesFromGroups,
  type AuthUser,
} from "@sis/shared";
import { prisma } from "./prisma.js";

export type SessionUser = Omit<AuthUser, "displayName" | "scopes" | "persona"> & {
  displayName?: string;
  scopes?: string[];
  persona?: string;
};

export async function enrichAuthUser(user: SessionUser): Promise<AuthUser> {
  const groups = user.groups ?? [];
  const scopes = user.scopes ?? resolveScopesFromGroups(user.email, groups);
  const persona = user.persona ?? resolvePersonaLabel(user.email, groups);

  let displayName = user.displayName;
  if (!displayName) {
    const student = await prisma.student.findFirst({
      where: { OR: [{ userId: user.id }, { email: user.email }] },
      select: { firstName: true, lastName: true },
    });
    displayName = formatDisplayName({
      email: user.email,
      firstName: student?.firstName,
      lastName: student?.lastName,
    });
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    oktaId: user.oktaId,
    displayName,
    groups,
    scopes,
    persona,
  };
}

export function sessionUserFromIdentity(opts: {
  id: string;
  email: string;
  role: AuthUser["role"];
  oktaId: string | null;
  name?: string;
  firstName?: string;
  lastName?: string;
  groups?: string[];
}): AuthUser {
  const groups = opts.groups ?? [];
  return {
    id: opts.id,
    email: opts.email,
    role: opts.role,
    oktaId: opts.oktaId,
    displayName: formatDisplayName({
      email: opts.email,
      name: opts.name,
      firstName: opts.firstName,
      lastName: opts.lastName,
    }),
    groups,
    scopes: resolveScopesFromGroups(opts.email, groups),
    persona: resolvePersonaLabel(opts.email, groups),
  };
}
