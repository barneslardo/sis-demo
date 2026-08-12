import type { Prisma } from "@prisma/client";
import { CreateStudentSchema } from "@sis/shared";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { toStudentResponse } from "./serializers.js";
import {
  ensureStudentUserRecord,
  pushStudentToOkta,
  type OktaSyncResult,
} from "./student-okta-sync.js";

const FerpaInputSchema = z
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

const FinancialInputSchema = z
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

const AdaInputSchema = z
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

const DisciplinaryInputSchema = z
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

const CounselorNoteInputSchema = z
  .object({
    counselorName: z.string().min(1),
    counselorType: z.string().min(1),
    noteDate: z.string().min(1),
    note: z.string().min(1),
    followUpDate: z.string().optional(),
    followUpStatus: z.string().optional(),
  })
  .strict();

const RiskInputSchema = z
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

const AcademicInputSchema = z
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

export const CreateStudentWithRecordsSchema = z
  .object({
    student: CreateStudentSchema,
    ferpa: FerpaInputSchema.optional(),
    financial: FinancialInputSchema.optional(),
    ada: AdaInputSchema.optional(),
    disciplinary: z.array(DisciplinaryInputSchema).optional(),
    counselorNotes: z.array(CounselorNoteInputSchema).optional(),
    risk: RiskInputSchema.optional(),
    academic: AcademicInputSchema.optional(),
  })
  .strict();

export type CreateStudentWithRecordsInput = z.infer<typeof CreateStudentWithRecordsSchema>;

export async function createStudentWithRecords(input: CreateStudentWithRecordsInput) {
  const parsed = CreateStudentWithRecordsSchema.parse(input);
  const user = await ensureStudentUserRecord(parsed.student.email);

  const result = await prisma.$transaction(async (tx) => {
    let student = await tx.student.create({
      data: {
        ...parsed.student,
        userId: parsed.student.userId ?? user.id,
        enrolledClasses: parsed.student.enrolledClasses,
        earnedDegrees: parsed.student.earnedDegrees,
      },
    });

    if (!student.userId) {
      student = await tx.student.update({
        where: { id: student.id },
        data: { userId: user.id },
      });
    }

    if (parsed.ferpa) {
      await tx.studentFerpa.create({
        data: { studentId: student.id, ...parsed.ferpa } as Prisma.StudentFerpaUncheckedCreateInput,
      });
    }
    if (parsed.financial) {
      await tx.studentFinancial.create({
        data: {
          studentId: student.id,
          ...parsed.financial,
        } as Prisma.StudentFinancialUncheckedCreateInput,
      });
    }
    if (parsed.ada) {
      await tx.studentAda.create({
        data: { studentId: student.id, ...parsed.ada } as Prisma.StudentAdaUncheckedCreateInput,
      });
    }
    if (parsed.risk) {
      await tx.studentRisk.create({
        data: { studentId: student.id, ...parsed.risk } as Prisma.StudentRiskUncheckedCreateInput,
      });
    }
    if (parsed.academic) {
      await tx.studentAcademic.create({
        data: {
          studentId: student.id,
          ...parsed.academic,
        } as Prisma.StudentAcademicUncheckedCreateInput,
      });
    }
    if (parsed.disciplinary?.length) {
      await tx.studentDisciplinary.createMany({
        data: parsed.disciplinary.map((d) => ({
          studentId: student.id,
          incidentDate: d.incidentDate,
          incidentType: d.incidentType,
          description: d.description,
          outcome: d.outcome,
          sanctionEndDate: d.sanctionEndDate ?? "",
          hearingOfficer: d.hearingOfficer ?? "",
          appealed: d.appealed ?? false,
          appealOutcome: d.appealOutcome ?? "",
        })),
      });
    }
    if (parsed.counselorNotes?.length) {
      await tx.studentCounselorNote.createMany({
        data: parsed.counselorNotes.map((n) => ({
          studentId: student.id,
          followUpDate: n.followUpDate ?? "",
          followUpStatus: n.followUpStatus ?? "",
          ...n,
        })),
      });
    }

    return student;
  });

  const linkedUser = await prisma.user.findUnique({ where: { id: user.id } });
  const oktaSync: OktaSyncResult = await pushStudentToOkta(result, linkedUser, "create");

  return {
    data: toStudentResponse(result),
    records: {
      ferpa: Boolean(parsed.ferpa),
      financial: Boolean(parsed.financial),
      ada: Boolean(parsed.ada),
      disciplinary: parsed.disciplinary?.length ?? 0,
      counselorNotes: parsed.counselorNotes?.length ?? 0,
      risk: Boolean(parsed.risk),
      academic: Boolean(parsed.academic),
    },
    oktaSync,
  };
}
