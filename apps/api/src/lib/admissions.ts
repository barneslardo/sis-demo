import crypto from "node:crypto";
import type { Applicant, Prisma } from "@prisma/client";
import { config } from "../config.js";
import { AppError } from "./errors.js";
import { prisma } from "./prisma.js";
import {
  findOktaUserByLogin,
  isOktaPushConfigured,
  updateOktaUser,
} from "./okta-client.js";

/**
 * Admission decisions. The SIS records the decision and creates the Student; Okta owns the
 * identity change: a Workflow on `admissionStatus` moves the user into Students and swaps
 * email/login to `universityEmail` (Google email → secondEmail).
 */

export type AdmissionDecision = "approve" | "deny";

export type DecisionOktaSync =
  | { ok: true; oktaId: string; profile: Record<string, string>; at: string }
  | { ok: false; skipped: true; reason: string; at: string }
  | { ok: false; error: string; at: string };

function slugPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** computerScience / computer_science → "Computer Science" */
export function humanizeProgram(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function universityEmailTaken(email: string): Promise<boolean> {
  const [student, user, applicant] = await Promise.all([
    prisma.student.findFirst({ where: { email: { equals: email, mode: "insensitive" } } }),
    prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } }),
    prisma.applicant.findFirst({ where: { universityEmail: { equals: email, mode: "insensitive" } } }),
  ]);
  if (student || user || applicant) return true;
  // Okta logins must be unique too (e.g. demo personas already use @university.edu).
  if (isOktaPushConfigured()) {
    return Boolean(await findOktaUserByLogin(email));
  }
  return false;
}

/** first.last@domain, then first.last2@domain, … */
export async function allocateUniversityEmail(firstName: string, lastName: string): Promise<string> {
  const base = [slugPart(firstName), slugPart(lastName)].filter(Boolean).join(".") || "student";
  const domain = config.admissions.universityEmailDomain;
  for (let n = 1; n < 100; n++) {
    const candidate = `${base}${n === 1 ? "" : n}@${domain}`;
    if (!(await universityEmailTaken(candidate))) return candidate;
  }
  throw new AppError(409, "EMAIL_EXHAUSTED", `No free university email for ${base}@${domain}`);
}

async function allocateStudentNumber(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const candidate = `S${crypto.randomInt(10_000_000, 99_999_999)}`;
    const taken = await prisma.applicant.findUnique({ where: { studentNumber: candidate } });
    if (!taken) return candidate;
  }
  throw new AppError(500, "STUDENT_NUMBER_EXHAUSTED", "Could not allocate a student number");
}

async function resolveApplicantOktaId(applicant: Applicant): Promise<string | null> {
  if (applicant.oktaId) return applicant.oktaId;
  const user = await findOktaUserByLogin(applicant.userName);
  if (!user) return null;
  await prisma.applicant.update({ where: { id: applicant.id }, data: { oktaId: user.id } });
  return user.id;
}

/** Write admissionStatus (+ universityEmail/studentId on approval) to the applicant's Okta user. */
export async function syncDecisionToOkta(applicant: Applicant): Promise<DecisionOktaSync> {
  const at = new Date().toISOString();
  let result: DecisionOktaSync;

  if (applicant.status === "pending") {
    result = { ok: false, skipped: true, reason: "No decision recorded yet", at };
  } else if (!isOktaPushConfigured()) {
    result = { ok: false, skipped: true, reason: "Okta push disabled (set OKTA_API_TOKEN)", at };
  } else {
    try {
      const oktaId = await resolveApplicantOktaId(applicant);
      if (!oktaId) {
        result = { ok: false, error: `No Okta user with login ${applicant.userName}`, at };
      } else {
        const profile: Record<string, string> =
          applicant.status === "approved"
            ? {
                admissionStatus: "admitted",
                universityEmail: applicant.universityEmail ?? "",
                studentId: applicant.studentNumber ?? "",
              }
            : { admissionStatus: "denied" };
        await updateOktaUser(oktaId, profile);
        result = { ok: true, oktaId, profile, at };
      }
    } catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : String(err), at };
    }
  }

  if (!result.ok && "error" in result) {
    console.error(`[admissions] Okta write-back failed for ${applicant.userName}:`, result.error);
  }
  await prisma.applicant.update({
    where: { id: applicant.id },
    data: { oktaSync: result as unknown as Prisma.InputJsonValue },
  });
  return result;
}

/**
 * Demo reset: delete an applicant and, if approved, the Student (+ its SIS user) created on
 * approval. SIS-only — the Okta user is left alone (delete it in Okta separately).
 */
export async function removeApplicant(
  applicantId: string
): Promise<{ removedApplicant: string; removedStudentId: string | null }> {
  const applicant = await prisma.applicant.findUnique({ where: { id: applicantId } });
  if (!applicant) throw new AppError(404, "NOT_FOUND", "Applicant not found");

  const removedStudentId = await prisma.$transaction(async (tx) => {
    await tx.applicant.delete({ where: { id: applicant.id } });
    if (!applicant.studentId) return null;

    const student = await tx.student.findUnique({ where: { id: applicant.studentId } });
    if (!student) return null;
    await tx.student.delete({ where: { id: student.id } });
    // Only the SIS user created for this admission (matched by university email).
    if (student.userId && applicant.universityEmail) {
      await tx.user.deleteMany({
        where: { id: student.userId, email: applicant.universityEmail },
      });
    }
    return student.id;
  });

  console.log(
    `[admissions] removed applicant ${applicant.userName}${removedStudentId ? ` + student ${applicant.universityEmail}` : ""}`
  );
  return { removedApplicant: applicant.userName, removedStudentId };
}

export async function decideApplicant(
  applicantId: string,
  decision: AdmissionDecision,
  decidedBy: string
): Promise<{ applicant: Applicant; oktaSync: DecisionOktaSync }> {
  const applicant = await prisma.applicant.findUnique({ where: { id: applicantId } });
  if (!applicant) throw new AppError(404, "NOT_FOUND", "Applicant not found");
  if (applicant.status !== "pending") {
    throw new AppError(409, "ALREADY_DECIDED", `Applicant was already ${applicant.status}`);
  }
  if (!applicant.active) {
    throw new AppError(409, "INACTIVE", "Applicant was deprovisioned in Okta");
  }

  let decided: Applicant;
  if (decision === "deny") {
    decided = await prisma.applicant.update({
      where: { id: applicant.id },
      data: { status: "denied", decidedBy, decidedAt: new Date() },
    });
  } else {
    const universityEmail = await allocateUniversityEmail(applicant.firstName, applicant.lastName);
    const studentNumber = await allocateStudentNumber();
    const today = new Date().toISOString().slice(0, 10);

    decided = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: universityEmail, role: "student", active: true },
      });
      const student = await tx.student.create({
        data: {
          userId: user.id,
          firstName: applicant.firstName,
          lastName: applicant.lastName,
          email: universityEmail,
          phone: applicant.phone,
          enrollmentDate: today,
          enrollmentStatus: true,
          academic: {
            create: {
              major: applicant.intendedProgram ? humanizeProgram(applicant.intendedProgram) : "",
              academicStanding: "good",
            },
          },
        },
      });
      return tx.applicant.update({
        where: { id: applicant.id },
        data: {
          status: "approved",
          decidedBy,
          decidedAt: new Date(),
          universityEmail,
          studentNumber,
          studentId: student.id,
        },
      });
    });
  }

  console.log(`[admissions] ${decided.userName} ${decided.status} by ${decidedBy}`);
  const oktaSync = await syncDecisionToOkta(decided);

  if (oktaSync.ok && decided.studentId) {
    // Link the new SIS user to the existing Okta identity (no second Okta user is created).
    const student = await prisma.student.findUnique({ where: { id: decided.studentId } });
    if (student?.userId) {
      await prisma.user
        .update({ where: { id: student.userId }, data: { oktaId: oktaSync.oktaId } })
        .catch((err) => console.warn("[admissions] could not link SIS user to Okta id:", err));
    }
  }

  const fresh = await prisma.applicant.findUniqueOrThrow({ where: { id: decided.id } });
  return { applicant: fresh, oktaSync };
}
