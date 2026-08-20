import { z } from "zod";

/** Okta custom authorization server scopes (dot-separated). */
export const OAuthScopes = {
  STUDENTS_READ: "sis.students.read",
  STUDENTS_WRITE: "sis.students.write",
  STUDENTS_READ_SELF: "sis.students.read.self",
  STUDENTS_FERPA: "sis.students.ferpa",
  STUDENTS_FINANCIAL: "sis.students.financial",
  STUDENTS_ADA: "sis.students.ada",
  STUDENTS_DISCIPLINARY: "sis.students.disciplinary",
  STUDENTS_COUNSELOR: "sis.students.counselor",
  STUDENTS_RISK: "sis.students.risk",
  STUDENTS_ACADEMIC: "sis.students.academic",
  ADMIN: "sis.admin",
} as const;

export type OAuthScope = (typeof OAuthScopes)[keyof typeof OAuthScopes];

export const UserRole = z.enum(["admin", "student"]);
export type UserRole = z.infer<typeof UserRole>;

export const StudentAttributesSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  enrollmentDate: z.string().default(""),
  enrollmentStatus: z.boolean().default(false),
  enrolledClasses: z.array(z.string()).default([]),
  financialAid: z.boolean().default(false),
  earnedDegrees: z.array(z.string()).default([]),
  address: z.string().default(""),
  zipCode: z.string().default(""),
  state: z.string().default(""),
  phone: z.string().default(""),
  emergencyContact: z.string().default(""),
  emergencyContactPhone: z.string().default(""),
  authorizedPayer: z.string().default(""),
  authorizedPayerPhone: z.string().default(""),
  authorizedPayerAddress: z.string().default(""),
  authorizedPayerZip: z.string().default(""),
  authorizedPayerState: z.string().default(""),
  authorizedPayerEmail: z.string().default(""),
  ada: z.boolean().default(false),
});

export type StudentAttributes = z.infer<typeof StudentAttributesSchema>;

export const CreateStudentSchema = StudentAttributesSchema.extend({
  userId: z.string().uuid().optional(),
});

export type CreateStudentInput = z.infer<typeof CreateStudentSchema>;

export const UpdateStudentSchema = StudentAttributesSchema.partial();

export type UpdateStudentInput = z.infer<typeof UpdateStudentSchema>;

export const StudentResponseSchema = StudentAttributesSchema.omit({
  ada: true,
  financialAid: true,
  enrolledClasses: true,
  earnedDegrees: true,
}).extend({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  /** Omitted when caller lacks sis.students.ada (unless viewing own profile). */
  ada: z.boolean().optional(),
  /** Omitted when caller lacks sis.students.financial (unless viewing own profile). */
  financialAid: z.boolean().optional(),
  /** Omitted when caller lacks sis.students.academic (unless viewing own profile). */
  enrolledClasses: z.array(z.string()).optional(),
  /** Omitted when caller lacks sis.students.academic (unless viewing own profile). */
  earnedDegrees: z.array(z.string()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type StudentResponse = z.infer<typeof StudentResponseSchema>;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    meta: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
  });

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: UserRole,
  oktaId: z.string().nullable(),
  displayName: z.string().min(1),
  /** Okta group names/IDs from the last sign-in (staff personas). */
  groups: z.array(z.string()).optional(),
  /** Effective OAuth scopes derived from groups (UI + session DCR authorization). */
  scopes: z.array(z.string()).optional(),
  /** Human-readable staff persona label, e.g. "Enrollment Counselor". */
  persona: z.string().optional(),
});

export function formatDisplayName(opts: {
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
}): string {
  const fromName = opts.name?.trim();
  if (fromName) return fromName;
  const fromParts = [opts.firstName, opts.lastName].filter(Boolean).join(" ").trim();
  if (fromParts) return fromParts;
  return opts.email.split("@")[0] ?? opts.email;
}

export type AuthUser = z.infer<typeof AuthUserSchema>;

/**
 * Demo admins — always granted the admin role regardless of Okta groups.
 *
 * This is an authorization bypass that runs BEFORE the Okta group checks, so
 * the list is deliberately not baked into source: supply it per deployment via
 * the DEMO_ADMIN_EMAILS env var (comma-separated). It defaults to empty, which
 * makes Okta group membership the only path to admin.
 *
 * The browser bundle imports this module, so the env read is lazy and reached
 * through globalThis rather than evaluated at module load.
 */
export function demoAdminEmails(): readonly string[] {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  const raw = env?.DEMO_ADMIN_EMAILS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isDemoAdmin(email: string): boolean {
  return demoAdminEmails().includes(email.trim().toLowerCase());
}

/** Okta group IDs (sledai.oktapreview.com) — must match Security → Groups */
export const OKTA_GROUP_ENROLLMENT_ADMINS_ID = "00gzbjxxucc86t8Ez1d7";
export const OKTA_GROUP_ENROLLMENT_COUNSELOR_ID = "00gzfprnldnGROrfL1d7";
export const OKTA_GROUP_STUDENT_AFFAIRS_ID = "00gzfpsgwnbXS1wdJ1d7";
export const OKTA_GROUP_REGISTRAR_ID = "00gzfpoil5974pZsf1d7";
export const OKTA_GROUP_STUDENTS_ID = "00gzd1cnuwCW6LvaV1d7";

const ENROLLMENT_ADMIN_NAMES = ["enrollment admins", "enrollment admin"];
const ENROLLMENT_COUNSELOR_NAMES = ["enrollment counselor", "enrollment counselors"];
const STUDENT_AFFAIRS_NAMES = ["student affairs"];
const REGISTRAR_NAMES = ["registrar"];
const STUDENT_GROUP_NAMES = ["students"];

function matchesOktaGroup(token: string, groupId: string, names: readonly string[]): boolean {
  const t = token.trim().toLowerCase();
  if (!t) return false;
  if (t === groupId.toLowerCase()) return true;
  return names.some((n) => t === n || t.includes(n));
}

export function isEnrollmentAdminGroup(groups: string[]): boolean {
  return groups.some((g) =>
    matchesOktaGroup(g, OKTA_GROUP_ENROLLMENT_ADMINS_ID, ENROLLMENT_ADMIN_NAMES)
  );
}

export function isEnrollmentCounselorGroup(groups: string[]): boolean {
  return groups.some((g) =>
    matchesOktaGroup(g, OKTA_GROUP_ENROLLMENT_COUNSELOR_ID, ENROLLMENT_COUNSELOR_NAMES)
  );
}

export function isStudentAffairsGroup(groups: string[]): boolean {
  return groups.some((g) =>
    matchesOktaGroup(g, OKTA_GROUP_STUDENT_AFFAIRS_ID, STUDENT_AFFAIRS_NAMES)
  );
}

export function isRegistrarGroup(groups: string[]): boolean {
  return groups.some((g) => matchesOktaGroup(g, OKTA_GROUP_REGISTRAR_ID, REGISTRAR_NAMES));
}

/** Okta staff groups → OAuth scopes (mirrors custom AS access policies). */
export function resolveScopesFromGroups(email: string, groups: string[] = []): OAuthScope[] {
  if (isDemoAdmin(email)) return [OAuthScopes.ADMIN];
  if (isEnrollmentAdminGroup(groups)) return [OAuthScopes.ADMIN];

  const scopes = new Set<OAuthScope>();
  if (isEnrollmentCounselorGroup(groups)) {
    scopes.add(OAuthScopes.STUDENTS_READ);
    scopes.add(OAuthScopes.STUDENTS_FERPA);
    scopes.add(OAuthScopes.STUDENTS_FINANCIAL);
  }
  if (isStudentAffairsGroup(groups)) {
    scopes.add(OAuthScopes.STUDENTS_READ);
    scopes.add(OAuthScopes.STUDENTS_ADA);
    scopes.add(OAuthScopes.STUDENTS_DISCIPLINARY);
    scopes.add(OAuthScopes.STUDENTS_COUNSELOR);
    scopes.add(OAuthScopes.STUDENTS_RISK);
    scopes.add(OAuthScopes.STUDENTS_ACADEMIC);
  }
  if (isRegistrarGroup(groups)) {
    scopes.add(OAuthScopes.STUDENTS_READ);
    scopes.add(OAuthScopes.STUDENTS_WRITE);
  }
  if (isStudentsGroup(groups)) {
    scopes.add(OAuthScopes.STUDENTS_READ_SELF);
  }
  return [...scopes];
}

export function resolvePersonaLabel(email: string, groups: string[] = []): string | undefined {
  if (isDemoAdmin(email)) return "Platform Admin";
  if (isEnrollmentAdminGroup(groups)) return "Enrollment Admin";
  if (isEnrollmentCounselorGroup(groups)) return "Enrollment Counselor";
  if (isStudentAffairsGroup(groups)) return "Student Affairs";
  if (isRegistrarGroup(groups)) return "Registrar";
  if (isStudentsGroup(groups)) return "Student";
  return undefined;
}

export type DcrCategoryId =
  | "ferpa"
  | "financial"
  | "ada"
  | "disciplinary"
  | "counselor"
  | "risk"
  | "academic";

export type DcrCategoryMeta = {
  id: DcrCategoryId;
  label: string;
  scope: OAuthScope;
  /** Okta group that grants this dataset in the demo. */
  staffGroup: string;
  description: string;
};

/** Data-category records (DCR) exposed per OAuth scope / Okta staff group. */
export const DCR_CATEGORIES: DcrCategoryMeta[] = [
  {
    id: "ferpa",
    label: "FERPA",
    scope: OAuthScopes.STUDENTS_FERPA,
    staffGroup: "Enrollment Counselor",
    description: "Waivers, directory opt-out, holds, release parties",
  },
  {
    id: "financial",
    label: "Financial Aid",
    scope: OAuthScopes.STUDENTS_FINANCIAL,
    staffGroup: "Enrollment Counselor",
    description: "Aid status, package, balance, scholarships",
  },
  {
    id: "ada",
    label: "ADA Accommodations",
    scope: OAuthScopes.STUDENTS_ADA,
    staffGroup: "Student Affairs",
    description: "Accommodations, documentation, coordinator",
  },
  {
    id: "disciplinary",
    label: "Disciplinary",
    scope: OAuthScopes.STUDENTS_DISCIPLINARY,
    staffGroup: "Student Affairs",
    description: "Incident history, outcomes, sanctions",
  },
  {
    id: "counselor",
    label: "Counselor Notes",
    scope: OAuthScopes.STUDENTS_COUNSELOR,
    staffGroup: "Student Affairs",
    description: "Academic and guidance counselor notes",
  },
  {
    id: "risk",
    label: "Risk Indicators",
    scope: OAuthScopes.STUDENTS_RISK,
    staffGroup: "Student Affairs",
    description: "GPA trend, attendance, intervention flags",
  },
  {
    id: "academic",
    label: "Academic Record",
    scope: OAuthScopes.STUDENTS_ACADEMIC,
    staffGroup: "Student Affairs",
    description: "Major, standing, transcript, advisor",
  },
];

export function canAccessScope(userScopes: string[], required: OAuthScope): boolean {
  return hasScope(userScopes, required);
}

/** Staff who use the admin UI + Ask SIS; OAuth scopes come from the custom AS (human ∩ agent). */
export function isSisStaffGroup(groups: string[]): boolean {
  return groups.some(
    (g) =>
      isEnrollmentAdminGroup([g]) ||
      matchesOktaGroup(g, OKTA_GROUP_ENROLLMENT_COUNSELOR_ID, ENROLLMENT_COUNSELOR_NAMES) ||
      matchesOktaGroup(g, OKTA_GROUP_STUDENT_AFFAIRS_ID, STUDENT_AFFAIRS_NAMES) ||
      matchesOktaGroup(g, OKTA_GROUP_REGISTRAR_ID, REGISTRAR_NAMES)
  );
}

export function isStudentsGroup(groups: string[]): boolean {
  return groups.some((g) => matchesOktaGroup(g, OKTA_GROUP_STUDENTS_ID, STUDENT_GROUP_NAMES));
}

/**
 * OIDC role: staff groups → admin UI; Students → student profile;
 * Enrollment Admins + any other staff group → admin; neither → not authorized.
 */
export function resolveOidcUserRole(email: string, groups: string[] = []): UserRole | null {
  if (isDemoAdmin(email)) return "admin";
  if (isSisStaffGroup(groups)) return "admin";
  if (isStudentsGroup(groups)) return "student";
  return null;
}

/** Dev login / legacy helper when groups are not available */
export function mapGroupToRole(groups: string[]): UserRole {
  if (isSisStaffGroup(groups)) return "admin";
  if (isStudentsGroup(groups)) return "student";
  return "student";
}

export function resolveUserRole(email: string, groups: string[] = []): UserRole {
  if (isDemoAdmin(email)) return "admin";
  return resolveOidcUserRole(email, groups) ?? "student";
}

export function hasScope(scopes: string[], required: OAuthScope | OAuthScope[]): boolean {
  const requiredList = Array.isArray(required) ? required : [required];
  if (scopes.includes(OAuthScopes.ADMIN)) return true;
  return requiredList.every(
    (scope) =>
      scopes.includes(scope) ||
      (scope === OAuthScopes.STUDENTS_READ && scopes.includes(OAuthScopes.STUDENTS_WRITE)) ||
      (scope === OAuthScopes.STUDENTS_WRITE && scopes.includes(OAuthScopes.ADMIN))
  );
}

export function hasAnyScope(scopes: string[], required: OAuthScope[]): boolean {
  if (scopes.includes(OAuthScopes.ADMIN)) return true;
  return required.some((scope) => scopes.includes(scope));
}

export function capDelegatedScopes(delegated: string[], entitled: string[]): string[] {
  if (entitled.includes(OAuthScopes.ADMIN)) return [...entitled];
  const entitledSet = new Set(entitled);
  const capped = delegated.filter((scope) => entitledSet.has(scope));
  return capped.length > 0 ? capped : [...entitled];
}

export function resolveSessionEntitledScopes(
  email: string,
  groups: string[] = [],
  scopes?: string[]
): string[] {
  if (scopes?.length) return scopes;
  return resolveScopesFromGroups(email, groups);
}

/** Hide category-sensitive fields on core student reads when the caller lacks matching scopes. */
export function redactStudentResponseForScopes(
  student: StudentResponse,
  scopes: string[],
  opts?: { callerEmail?: string }
): StudentResponse {
  if (scopes.includes(OAuthScopes.ADMIN)) return student;

  const isSelf =
    Boolean(opts?.callerEmail) &&
    student.email.toLowerCase() === opts!.callerEmail!.trim().toLowerCase();

  const out = { ...student };
  if (!isSelf && !hasScope(scopes, OAuthScopes.STUDENTS_ADA)) {
    delete out.ada;
  }
  if (!isSelf && !hasScope(scopes, OAuthScopes.STUDENTS_FINANCIAL)) {
    delete out.financialAid;
  }
  if (!isSelf && !hasScope(scopes, OAuthScopes.STUDENTS_ACADEMIC)) {
    delete out.enrolledClasses;
    delete out.earnedDegrees;
  }
  return out;
}

/** Strip category fields from create/update payloads when the caller lacks matching scopes. */
export function stripSensitiveStudentFields<T extends Record<string, unknown>>(
  input: T,
  scopes: string[]
): T {
  if (scopes.includes(OAuthScopes.ADMIN)) return input;
  const out = { ...input };
  if (!hasScope(scopes, OAuthScopes.STUDENTS_ADA)) delete out.ada;
  if (!hasScope(scopes, OAuthScopes.STUDENTS_FINANCIAL)) delete out.financialAid;
  if (!hasScope(scopes, OAuthScopes.STUDENTS_ACADEMIC)) {
    delete out.enrolledClasses;
    delete out.earnedDegrees;
  }
  return out;
}
