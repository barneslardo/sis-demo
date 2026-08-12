import type { Prisma, Student, User } from "@prisma/client";
import { prisma } from "./prisma.js";
import { config } from "../config.js";
import {
  activateOktaUser,
  createOktaUser,
  deactivateOktaUser,
  findOktaUserByLogin,
  isOktaPushConfigured,
  updateOktaUser,
} from "./okta-client.js";

function jsonArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

/** Map SIS student → Okta user profile (standard + optional custom attrs). */
export function buildOktaProfileFromStudent(
  student: Student,
  opts?: { extended?: boolean }
): Record<string, unknown> {
  const profile: Record<string, unknown> = {
    login: student.email,
    email: student.email,
    firstName: student.firstName,
    lastName: student.lastName,
  };

  if (student.phone) profile.mobilePhone = student.phone;
  if (student.address) profile.streetAddress = student.address;
  if (student.state) profile.state = student.state;
  if (student.zipCode) profile.zipCode = student.zipCode;

  const useExtended = opts?.extended ?? config.oktaPush.includeExtendedProfile;
  if (useExtended) {
    Object.assign(profile, {
      enrollmentDate: student.enrollmentDate,
      enrollmentStatus: student.enrollmentStatus,
      enrolledClasses: jsonArray(student.enrolledClasses).join(", "),
      financialAid: student.financialAid,
      earnedDegrees: jsonArray(student.earnedDegrees).join(", "),
      emergencyContact: student.emergencyContact,
      emergencyContactPhone: student.emergencyContactPhone,
      authorizedPayer: student.authorizedPayer,
      authorizedPayerPhone: student.authorizedPayerPhone,
      authorizedPayerAddress: student.authorizedPayerAddress,
      authorizedPayerZip: student.authorizedPayerZip,
      authorizedPayerState: student.authorizedPayerState,
      authorizedPayerEmail: student.authorizedPayerEmail,
      ada: student.ada,
    });
  }

  return profile;
}

function isOktaProfileValidationError(message: string): boolean {
  return /validation|Api validation failed|does not match required schema/i.test(message);
}

async function pushProfile(
  student: Student,
  user: User | null,
  operation: "create" | "update",
  extended: boolean
): Promise<OktaSyncResult> {
  const profile = buildOktaProfileFromStudent(student, { extended });
  const groupIds = config.oktaPush.studentGroupIds;
  let oktaId = user?.oktaId ?? null;

  if (!oktaId) {
    const existing = await findOktaUserByLogin(student.email);
    if (existing) {
      oktaId = existing.id;
      await updateOktaUser(oktaId, profile);
      if (operation === "create") {
        await activateOktaUser(oktaId).catch(() => undefined);
      }
      if (user) await linkOktaId(user.id, oktaId);
      return { ok: true, action: "linked", oktaId };
    }
  }

  if (operation === "create" && !oktaId) {
    const created = await createOktaUser(profile, { activate: true, groupIds });
    if (user) await linkOktaId(user.id, created.id);
    return { ok: true, action: "created", oktaId: created.id };
  }

  if (!oktaId) {
    const created = await createOktaUser(profile, { activate: true, groupIds });
    if (user) await linkOktaId(user.id, created.id);
    return { ok: true, action: "created", oktaId: created.id };
  }

  await updateOktaUser(oktaId, profile);
  return { ok: true, action: "updated", oktaId };
}

export async function ensureStudentUserRecord(email: string): Promise<User> {
  return prisma.user.upsert({
    where: { email },
    create: { email, role: "student", active: true },
    update: { active: true, role: "student" },
  });
}

async function linkOktaId(userId: string, oktaId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { oktaId, active: true },
  });
}

export type OktaSyncResult =
  | { ok: true; action: "created" | "updated" | "deactivated" | "linked"; oktaId: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; error: string };

/**
 * Push student create/update to Okta Users API.
 * Best-effort: logs errors; does not throw to callers unless OKTA_PUSH_REQUIRED=true.
 */
export async function pushStudentToOkta(
  student: Student,
  user: User | null,
  operation: "create" | "update"
): Promise<OktaSyncResult> {
  if (!isOktaPushConfigured()) {
    return { ok: false, skipped: true, reason: "Okta push disabled (set OKTA_API_TOKEN)" };
  }

  try {
    const extended = config.oktaPush.includeExtendedProfile;
    try {
      return await pushProfile(student, user, operation, extended);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (extended && isOktaProfileValidationError(message)) {
        console.warn(
          `[okta-push] extended profile rejected for ${student.email}, retrying with standard fields only`
        );
        return await pushProfile(student, user, operation, false);
      }
      throw err;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[okta-push] ${operation} failed for ${student.email}:`, message);
    if (config.oktaPush.required) throw err;
    return { ok: false, error: message };
  }
}

/** Deactivate Okta user when student is removed from SIS (never hard-delete in Okta). */
export async function deactivateStudentInOkta(
  student: Student,
  user: User | null
): Promise<OktaSyncResult> {
  if (!isOktaPushConfigured()) {
    return { ok: false, skipped: true, reason: "Okta push disabled" };
  }

  try {
    let oktaId = user?.oktaId ?? null;
    if (!oktaId) {
      const existing = await findOktaUserByLogin(student.email);
      oktaId = existing?.id ?? null;
    }

    if (!oktaId) {
      return { ok: false, skipped: true, reason: "No Okta user found for this student" };
    }

    await deactivateOktaUser(oktaId);

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { active: false },
      });
    }

    return { ok: true, action: "deactivated", oktaId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[okta-push] deactivate failed for ${student.email}:`, message);
    if (config.oktaPush.required) throw err;
    return { ok: false, error: message };
  }
}
