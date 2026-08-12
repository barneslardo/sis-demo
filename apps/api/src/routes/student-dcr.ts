import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import {
  requireAcademicAccess,
  requireAdaAccess,
  requireCounselorAccess,
  requireDisciplinaryAccess,
  requireFerpaAccess,
  requireFinancialAccess,
  requireRiskAccess,
  requireStaffStudentRead,
  resolveRequestScopes,
} from "../middleware/auth.js";
import { hasScope, OAuthScopes } from "@sis/shared";

export const studentDcrRouter = Router({ mergeParams: true });

async function assertStudent(id: string) {
  const student = await prisma.student.findUnique({ where: { id }, select: { id: true } });
  if (!student) throw new AppError(404, "NOT_FOUND", "Student not found");
}

// ── FERPA (Enrollment Counselor) ─────────────────────────────────────────────

studentDcrRouter.get("/:id/ferpa", requireFerpaAccess, async (req, res, next) => {
  try {
    await assertStudent(req.params.id);
    const data = await prisma.studentFerpa.findUnique({ where: { studentId: req.params.id } });
    res.json({ data: data ?? null });
  } catch (err) {
    next(err);
  }
});

const FerpaPatchSchema = z
  .object({
    ferpaWaiverOnFile: z.boolean().optional(),
    ferpaWaiverDate: z.string().optional(),
    ferpaWaiverScope: z.string().optional(),
    educationRecordsReleasedTo: z.array(z.unknown()).optional(),
    directoryInfoOptOut: z.boolean().optional(),
    holds: z.array(z.unknown()).optional(),
    notes: z.string().optional(),
  })
  .strict();

studentDcrRouter.patch("/:id/ferpa", requireFerpaAccess, async (req, res, next) => {
  try {
    await assertStudent(req.params.id);
    const body = FerpaPatchSchema.parse(req.body);
    const data = await prisma.studentFerpa.upsert({
      where: { studentId: req.params.id },
      create: { studentId: req.params.id, ...body } as Prisma.StudentFerpaUncheckedCreateInput,
      update: body as Prisma.StudentFerpaUpdateInput,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// ── Financial (Enrollment Counselor) ─────────────────────────────────────────

studentDcrRouter.get("/:id/financial", requireFinancialAccess, async (req, res, next) => {
  try {
    await assertStudent(req.params.id);
    const data = await prisma.studentFinancial.findUnique({ where: { studentId: req.params.id } });
    res.json({ data: data ?? null });
  } catch (err) {
    next(err);
  }
});

const FinancialPatchSchema = z
  .object({
    financialAidStatus: z.string().optional(),
    aidPackage: z.record(z.unknown()).optional(),
    expectedFamilyContribution: z.number().int().optional(),
    outstandingBalance: z.number().optional(),
    paymentPlan: z.boolean().optional(),
    scholarships: z.array(z.unknown()).optional(),
    holds: z.array(z.unknown()).optional(),
    fafsaYear: z.string().optional(),
    lastDisbursementDate: z.string().optional(),
  })
  .strict();

studentDcrRouter.patch("/:id/financial", requireFinancialAccess, async (req, res, next) => {
  try {
    await assertStudent(req.params.id);
    const body = FinancialPatchSchema.parse(req.body);
    const data = await prisma.studentFinancial.upsert({
      where: { studentId: req.params.id },
      create: { studentId: req.params.id, ...body } as Prisma.StudentFinancialUncheckedCreateInput,
      update: body as Prisma.StudentFinancialUpdateInput,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// ── ADA (Student Affairs) ───────────────────────────────────────────────────

studentDcrRouter.get("/:id/ada", requireAdaAccess, async (req, res, next) => {
  try {
    await assertStudent(req.params.id);
    const data = await prisma.studentAda.findUnique({ where: { studentId: req.params.id } });
    res.json({ data: data ?? null });
  } catch (err) {
    next(err);
  }
});

const AdaPatchSchema = z
  .object({
    hasAccommodations: z.boolean().optional(),
    accommodationTypes: z.array(z.unknown()).optional(),
    diagnosisCategory: z.string().optional(),
    documentationOnFile: z.boolean().optional(),
    documentationDate: z.string().optional(),
    assignedCoordinator: z.string().optional(),
    activeAccommodations: z.boolean().optional(),
    semesterNotes: z.string().optional(),
  })
  .strict();

studentDcrRouter.patch("/:id/ada", requireAdaAccess, async (req, res, next) => {
  try {
    await assertStudent(req.params.id);
    const body = AdaPatchSchema.parse(req.body);
    const data = await prisma.studentAda.upsert({
      where: { studentId: req.params.id },
      create: { studentId: req.params.id, ...body } as Prisma.StudentAdaUncheckedCreateInput,
      update: body as Prisma.StudentAdaUpdateInput,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// ── Disciplinary (Student Affairs) ──────────────────────────────────────────

studentDcrRouter.get("/:id/disciplinary", requireDisciplinaryAccess, async (req, res, next) => {
  try {
    await assertStudent(req.params.id);
    const data = await prisma.studentDisciplinary.findMany({
      where: { studentId: req.params.id },
      orderBy: { incidentDate: "desc" },
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

const DisciplinaryPostSchema = z
  .object({
    incidentDate: z.string().min(1),
    incidentType: z.string().min(1),
    description: z.string().min(1),
    outcome: z.string().min(1),
    sanctionEndDate: z.string().optional(),
    hearingOfficer: z.string().optional(),
    appealed: z.boolean().optional(),
    appealOutcome: z.string().optional(),
  })
  .strict();

studentDcrRouter.post("/:id/disciplinary", requireDisciplinaryAccess, async (req, res, next) => {
  try {
    await assertStudent(req.params.id);
    const body = DisciplinaryPostSchema.parse(req.body);
    const data = await prisma.studentDisciplinary.create({
      data: {
        studentId: req.params.id,
        sanctionEndDate: body.sanctionEndDate ?? "",
        hearingOfficer: body.hearingOfficer ?? "",
        appealed: body.appealed ?? false,
        appealOutcome: body.appealOutcome ?? "",
        ...body,
      },
    });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// ── Counselor notes (Student Affairs) ───────────────────────────────────────

studentDcrRouter.get("/:id/counselor-notes", requireCounselorAccess, async (req, res, next) => {
  try {
    await assertStudent(req.params.id);
    const data = await prisma.studentCounselorNote.findMany({
      where: { studentId: req.params.id },
      orderBy: { noteDate: "desc" },
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

const CounselorNotePostSchema = z.object({
  counselorName: z.string().min(1),
  counselorType: z.string().min(1),
  noteDate: z.string().min(1),
  note: z.string().min(1),
  followUpDate: z.string().optional(),
  followUpStatus: z.string().optional(),
});

studentDcrRouter.post("/:id/counselor-notes", requireCounselorAccess, async (req, res, next) => {
  try {
    await assertStudent(req.params.id);
    const body = CounselorNotePostSchema.parse(req.body);
    const data = await prisma.studentCounselorNote.create({
      data: { studentId: req.params.id, ...body, followUpDate: body.followUpDate ?? "", followUpStatus: body.followUpStatus ?? "" },
    });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// ── Risk (Student Affairs) ──────────────────────────────────────────────────

studentDcrRouter.get("/:id/risk", requireRiskAccess, async (req, res, next) => {
  try {
    await assertStudent(req.params.id);
    const data = await prisma.studentRisk.findUnique({ where: { studentId: req.params.id } });
    res.json({ data: data ?? null });
  } catch (err) {
    next(err);
  }
});

const RiskPatchSchema = z
  .object({
    overallRiskLevel: z.string().optional(),
    gpa: z.number().optional(),
    gpaTrend: z.string().optional(),
    attendanceRate: z.number().optional(),
    missedAssignments: z.number().int().optional(),
    failingCourses: z.array(z.unknown()).optional(),
    academicProbation: z.boolean().optional(),
    interventionFlags: z.array(z.unknown()).optional(),
    lastAssessmentDate: z.string().optional(),
  })
  .strict();

studentDcrRouter.patch("/:id/risk", requireRiskAccess, async (req, res, next) => {
  try {
    await assertStudent(req.params.id);
    const body = RiskPatchSchema.parse(req.body);
    const data = await prisma.studentRisk.upsert({
      where: { studentId: req.params.id },
      create: { studentId: req.params.id, ...body } as Prisma.StudentRiskUncheckedCreateInput,
      update: body as Prisma.StudentRiskUpdateInput,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// ── Academic (Student Affairs) ──────────────────────────────────────────────

studentDcrRouter.get("/:id/academic", requireAcademicAccess, async (req, res, next) => {
  try {
    await assertStudent(req.params.id);
    const data = await prisma.studentAcademic.findUnique({ where: { studentId: req.params.id } });
    res.json({ data: data ?? null });
  } catch (err) {
    next(err);
  }
});

const AcademicPatchSchema = z
  .object({
    major: z.string().optional(),
    minor: z.string().optional(),
    concentration: z.string().optional(),
    academicStanding: z.string().optional(),
    gpa: z.number().optional(),
    creditHoursEarned: z.number().int().optional(),
    creditHoursRequired: z.number().int().optional(),
    expectedGraduation: z.string().optional(),
    advisor: z.string().optional(),
    transcript: z.array(z.unknown()).optional(),
    currentCourses: z.array(z.unknown()).optional(),
  })
  .strict();

studentDcrRouter.patch("/:id/academic", requireAcademicAccess, async (req, res, next) => {
  try {
    await assertStudent(req.params.id);
    const body = AcademicPatchSchema.parse(req.body);
    const data = await prisma.studentAcademic.upsert({
      where: { studentId: req.params.id },
      create: { studentId: req.params.id, ...body } as Prisma.StudentAcademicUncheckedCreateInput,
      update: body as Prisma.StudentAcademicUpdateInput,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/** Read-only summary for users with core read but checking category availability */
studentDcrRouter.get("/:id/dcr-summary", requireStaffStudentRead, async (req, res, next) => {
  try {
    await assertStudent(req.params.id);
    const id = req.params.id;
    const scopes = resolveRequestScopes(req);
    const [ferpa, financial, ada, disciplinary, counselorNotes, risk, academic] = await Promise.all([
      prisma.studentFerpa.findUnique({ where: { studentId: id } }),
      prisma.studentFinancial.findUnique({ where: { studentId: id } }),
      prisma.studentAda.findUnique({ where: { studentId: id } }),
      prisma.studentDisciplinary.count({ where: { studentId: id } }),
      prisma.studentCounselorNote.count({ where: { studentId: id } }),
      prisma.studentRisk.findUnique({ where: { studentId: id } }),
      prisma.studentAcademic.findUnique({ where: { studentId: id } }),
    ]);
    res.json({
      data: {
        ...(hasScope(scopes, OAuthScopes.STUDENTS_FERPA) && { hasFerpa: Boolean(ferpa) }),
        ...(hasScope(scopes, OAuthScopes.STUDENTS_FINANCIAL) && {
          hasFinancial: Boolean(financial),
        }),
        ...(hasScope(scopes, OAuthScopes.STUDENTS_ADA) && { hasAda: Boolean(ada) }),
        ...(hasScope(scopes, OAuthScopes.STUDENTS_DISCIPLINARY) && {
          disciplinaryIncidentCount: disciplinary,
        }),
        ...(hasScope(scopes, OAuthScopes.STUDENTS_COUNSELOR) && {
          counselorNoteCount: counselorNotes,
        }),
        ...(hasScope(scopes, OAuthScopes.STUDENTS_RISK) && { hasRisk: Boolean(risk) }),
        ...(hasScope(scopes, OAuthScopes.STUDENTS_ACADEMIC) && { hasAcademic: Boolean(academic) }),
      },
    });
  } catch (err) {
    next(err);
  }
});
