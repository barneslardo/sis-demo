import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { toStudentResponseForRequest } from "./serializers.js";

export type AtRiskQuery = {
  /** Match overallRiskLevel (case-insensitive), default high + critical */
  levels?: string[];
  includeProbation?: boolean;
  maxGpa?: number;
  maxAttendance?: number;
  limit?: number;
};

const DEFAULT_LEVELS = ["high", "critical"];

export function buildAtRiskWhere(query: AtRiskQuery): Prisma.StudentRiskWhereInput {
  const levels = (query.levels?.length ? query.levels : DEFAULT_LEVELS).map((l) => l.toLowerCase());
  const or: Prisma.StudentRiskWhereInput[] = [{ overallRiskLevel: { in: levels } }];
  if (query.includeProbation !== false) {
    or.push({ academicProbation: true });
  }
  if (query.maxGpa !== undefined) {
    or.push({ gpa: { lte: query.maxGpa } });
  } else {
    or.push({ gpa: { lt: 2.0 } });
  }
  if (query.maxAttendance !== undefined) {
    or.push({ attendanceRate: { lt: query.maxAttendance } });
  }
  return { OR: or };
}

export async function listAtRiskStudents(
  query: AtRiskQuery = {},
  scopes?: string[],
  callerEmail?: string
) {
  const limit = Math.min(100, Math.max(1, query.limit ?? 50));
  const rows = await prisma.studentRisk.findMany({
    where: buildAtRiskWhere(query),
    include: {
      student: true,
    },
    orderBy: [{ overallRiskLevel: "desc" }, { gpa: "asc" }],
    take: limit,
  });

  return {
    data: rows.map((row) => ({
      student:
        scopes !== undefined
          ? toStudentResponseForRequest(row.student, scopes, callerEmail)
          : row.student,
      risk: {
        overallRiskLevel: row.overallRiskLevel,
        gpa: row.gpa,
        gpaTrend: row.gpaTrend,
        attendanceRate: row.attendanceRate,
        missedAssignments: row.missedAssignments,
        academicProbation: row.academicProbation,
        failingCourses: row.failingCourses,
        interventionFlags: row.interventionFlags,
        lastAssessmentDate: row.lastAssessmentDate,
      },
    })),
    meta: { count: rows.length, limit },
  };
}
