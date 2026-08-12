import { Router } from "express";
import {
  CreateStudentSchema,
  PaginationQuerySchema,
  UpdateStudentSchema,
} from "@sis/shared";
import { prisma } from "../lib/prisma.js";
import { toStudentResponse, toStudentResponseForRequest } from "../lib/serializers.js";
import { AppError } from "../lib/errors.js";
import {
  authenticateRequest,
  requireAdminScope,
  requireProfileRead,
  requireRiskAccess,
  requireStaffStudentRead,
  requireWriteAccess,
  resolveCallerEmail,
  resolveRequestScopes,
} from "../middleware/auth.js";
import { stripSensitiveStudentFields, type UpdateStudentInput } from "@sis/shared";
import {
  deactivateStudentInOkta,
  ensureStudentUserRecord,
  pushStudentToOkta,
  type OktaSyncResult,
} from "../lib/student-okta-sync.js";
import { CreateStudentWithRecordsSchema, createStudentWithRecords } from "../lib/student-dcr-seed.js";
import { listAtRiskStudents } from "../lib/student-at-risk.js";
import { studentDcrRouter } from "./student-dcr.js";

export const studentsRouter = Router();

studentsRouter.use(authenticateRequest);

function attachOktaSync<T>(payload: T, oktaSync: OktaSyncResult): T & { oktaSync: OktaSyncResult } {
  return { ...payload, oktaSync };
}

function stripCategoryFieldsFromUpdate(
  input: UpdateStudentInput,
  scopes: string[]
): UpdateStudentInput {
  return stripSensitiveStudentFields(input, scopes) as UpdateStudentInput;
}

studentsRouter.get("/", requireStaffStudentRead, async (req, res, next) => {
  try {
    const query = PaginationQuerySchema.parse(req.query);
    const where = query.search
      ? {
          OR: [
            { firstName: { contains: query.search, mode: "insensitive" as const } },
            { lastName: { contains: query.search, mode: "insensitive" as const } },
            { email: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [total, students] = await Promise.all([
      prisma.student.count({ where }),
      prisma.student.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { lastName: "asc" },
      }),
    ]);

    res.json({
      data: students.map((s) =>
        toStudentResponseForRequest(s, resolveRequestScopes(req), resolveCallerEmail(req))
      ),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
});

studentsRouter.get("/me", requireProfileRead, async (req, res, next) => {
  try {
    const email = req.user?.email ?? req.oauth?.email;
    if (!email) throw new AppError(400, "MISSING_EMAIL", "Cannot resolve caller email");

    const student = await prisma.student.findUnique({ where: { email } });
    if (!student) throw new AppError(404, "NOT_FOUND", "Student profile not found");

    res.json({
      data: toStudentResponseForRequest(student, resolveRequestScopes(req), email),
    });
  } catch (err) {
    next(err);
  }
});

studentsRouter.post("/with-records", requireAdminScope, async (req, res, next) => {
  try {
    const input = CreateStudentWithRecordsSchema.parse(req.body);
    const result = await createStudentWithRecords(input);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/** At-risk roster — before /:id and DCR sub-routes */
studentsRouter.get("/at-risk", requireRiskAccess, async (req, res, next) => {
  try {
    const levels =
      typeof req.query.levels === "string"
        ? req.query.levels.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;
    const maxGpa = req.query.maxGpa !== undefined ? Number(req.query.maxGpa) : undefined;
    const maxAttendance =
      req.query.maxAttendance !== undefined ? Number(req.query.maxAttendance) : undefined;
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    const includeProbation = req.query.includeProbation !== "false";

    const result = await listAtRiskStudents(
      {
        levels,
        maxGpa: Number.isFinite(maxGpa) ? maxGpa : undefined,
        maxAttendance: Number.isFinite(maxAttendance) ? maxAttendance : undefined,
        limit: Number.isFinite(limit) ? limit : undefined,
        includeProbation,
      },
      resolveRequestScopes(req),
      resolveCallerEmail(req)
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** DCR category routes — after /me and /at-risk, before /:id */
studentsRouter.use(studentDcrRouter);

studentsRouter.get("/:id", requireStaffStudentRead, async (req, res, next) => {
  try {
    const student = await prisma.student.findUnique({ where: { id: req.params.id } });
    if (!student) throw new AppError(404, "NOT_FOUND", "Student not found");
    res.json({
      data: toStudentResponseForRequest(
        student,
        resolveRequestScopes(req),
        resolveCallerEmail(req)
      ),
    });
  } catch (err) {
    next(err);
  }
});

studentsRouter.post("/", requireWriteAccess, async (req, res, next) => {
  try {
    const scopes = resolveRequestScopes(req);
    const input = stripSensitiveStudentFields(
      CreateStudentSchema.parse(req.body) as Record<string, unknown>,
      scopes
    ) as ReturnType<typeof CreateStudentSchema.parse>;
    const user = await ensureStudentUserRecord(input.email);

    let student = await prisma.student.create({
      data: {
        ...input,
        userId: input.userId ?? user.id,
        enrolledClasses: input.enrolledClasses,
        earnedDegrees: input.earnedDegrees,
      },
    });

    if (!student.userId) {
      student = await prisma.student.update({
        where: { id: student.id },
        data: { userId: user.id },
      });
    }

    const linkedUser = await prisma.user.findUnique({ where: { id: user.id } });
    const oktaSync = await pushStudentToOkta(student, linkedUser, "create");

    res.status(201).json(
      attachOktaSync(
        {
          data: toStudentResponseForRequest(
            student,
            scopes,
            resolveCallerEmail(req)
          ),
        },
        oktaSync
      )
    );
  } catch (err) {
    next(err);
  }
});

studentsRouter.patch("/:id", requireWriteAccess, async (req, res, next) => {
  try {
    const scopes = resolveRequestScopes(req);
    const input = stripCategoryFieldsFromUpdate(UpdateStudentSchema.parse(req.body), scopes);
    const existing = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (!existing) throw new AppError(404, "NOT_FOUND", "Student not found");

    const user =
      existing.user ?? (await ensureStudentUserRecord(existing.email));

    let student = await prisma.student.update({
      where: { id: req.params.id },
      data: {
        ...input,
        userId: existing.userId ?? user.id,
        enrolledClasses: input.enrolledClasses,
        earnedDegrees: input.earnedDegrees,
      },
    });

    const linkedUser = await prisma.user.findUnique({ where: { id: user.id } });
    const oktaSync = await pushStudentToOkta(student, linkedUser, "update");

    res.json(
      attachOktaSync(
        {
          data: toStudentResponseForRequest(
            student,
            scopes,
            resolveCallerEmail(req)
          ),
        },
        oktaSync
      )
    );
  } catch (err) {
    next(err);
  }
});

studentsRouter.delete("/:id", requireWriteAccess, async (req, res, next) => {
  try {
    const existing = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (!existing) throw new AppError(404, "NOT_FOUND", "Student not found");

    const oktaSync = await deactivateStudentInOkta(existing, existing.user);

    await prisma.student.delete({ where: { id: req.params.id } });

    res.status(200).json(attachOktaSync({ deleted: true, id: req.params.id }, oktaSync));
  } catch (err) {
    next(err);
  }
});
