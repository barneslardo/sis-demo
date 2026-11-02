import { Router } from "express";
import { z } from "zod";
import type { Applicant } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import {
  decideApplicant,
  humanizeProgram,
  removeApplicant,
  syncDecisionToOkta,
} from "../lib/admissions.js";
import {
  authenticateRequest,
  requireAdminScope,
  requireAdmissionsDecision,
  requireStaffStudentRead,
  resolveCallerEmail,
} from "../middleware/auth.js";

export const applicantsRouter = Router();

applicantsRouter.use(authenticateRequest);

const ListQuerySchema = z.object({
  status: z.enum(["pending", "approved", "denied", "all"]).default("pending"),
});

const DecisionSchema = z.object({
  decision: z.enum(["approve", "deny"]),
});

function toApplicantResponse(a: Applicant) {
  return {
    id: a.id,
    firstName: a.firstName,
    lastName: a.lastName,
    personalEmail: a.personalEmail,
    userName: a.userName,
    phone: a.phone,
    intendedProgram: a.intendedProgram,
    intendedProgramLabel: a.intendedProgram ? humanizeProgram(a.intendedProgram) : "",
    entryTerm: a.entryTerm,
    highSchool: a.highSchool,
    active: a.active,
    status: a.status,
    decidedBy: a.decidedBy,
    decidedAt: a.decidedAt?.toISOString() ?? null,
    universityEmail: a.universityEmail,
    studentNumber: a.studentNumber,
    studentId: a.studentId,
    oktaLinked: Boolean(a.oktaId),
    oktaSync: a.oktaSync,
    appliedAt: a.createdAt.toISOString(),
  };
}

export type ApplicantResponse = ReturnType<typeof toApplicantResponse>;

applicantsRouter.get("/", requireStaffStudentRead, async (req, res, next) => {
  try {
    const { status } = ListQuerySchema.parse(req.query);
    const [applicants, counts] = await Promise.all([
      prisma.applicant.findMany({
        where: status === "all" ? {} : { status },
        orderBy: { createdAt: status === "pending" ? "asc" : "desc" },
        take: 200,
      }),
      prisma.applicant.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    const meta = { pending: 0, approved: 0, denied: 0 };
    for (const row of counts) meta[row.status] = row._count._all;
    res.json({ data: applicants.map(toApplicantResponse), meta });
  } catch (err) {
    next(err);
  }
});

applicantsRouter.post("/:id/decision", requireAdmissionsDecision, async (req, res, next) => {
  try {
    const { decision } = DecisionSchema.parse(req.body);
    const decidedBy = resolveCallerEmail(req) ?? "unknown";
    const { applicant, oktaSync } = await decideApplicant(req.params.id, decision, decidedBy);
    res.json({ data: toApplicantResponse(applicant), oktaSync });
  } catch (err) {
    next(err);
  }
});

/** Demo reset (sis.admin only): removes the applicant and any Student created on approval. */
applicantsRouter.delete("/:id", requireAdminScope, async (req, res, next) => {
  try {
    res.json({ data: await removeApplicant(req.params.id) });
  } catch (err) {
    next(err);
  }
});

/** Retry the Okta write-back after a failed sync (e.g. missing profile attribute in Okta). */
applicantsRouter.post("/:id/sync-okta", requireAdmissionsDecision, async (req, res, next) => {
  try {
    const applicant = await prisma.applicant.findUnique({ where: { id: req.params.id } });
    if (!applicant) throw new AppError(404, "NOT_FOUND", "Applicant not found");
    const oktaSync = await syncDecisionToOkta(applicant);
    const fresh = await prisma.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    res.json({ data: toApplicantResponse(fresh), oktaSync });
  } catch (err) {
    next(err);
  }
});
