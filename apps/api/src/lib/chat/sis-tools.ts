import { CreateStudentSchema, UpdateStudentSchema } from "@sis/shared";
import { CreateStudentWithRecordsSchema } from "../student-dcr-seed.js";
import { canAccess, sisApiFetch, type DelegatedAccess } from "./delegated-api.js";
import { formatToolScopeDenied } from "./scope-guidance.js";
import { TOOL_REQUIRED_SCOPES } from "./tool-scopes.js";

export function chatToolsForScopes(grantedScopes: string[]) {
  return SIS_CHAT_TOOLS.filter((tool) =>
    canAccess(grantedScopes, TOOL_REQUIRED_SCOPES[tool.name as SisToolName])
  );
}

export type SisToolName =
  | "list_students"
  | "get_student"
  | "search_students"
  | "create_student"
  | "create_student_with_records"
  | "update_student"
  | "get_student_ferpa"
  | "upsert_student_ferpa"
  | "get_student_financial"
  | "upsert_student_financial"
  | "get_student_ada"
  | "upsert_student_ada"
  | "get_student_disciplinary"
  | "add_student_disciplinary_incident"
  | "get_student_counselor_notes"
  | "add_student_counselor_note"
  | "get_student_risk"
  | "upsert_student_risk"
  | "get_student_academic"
  | "upsert_student_academic"
  | "list_high_risk_students";

const STUDENT_ID = { type: "string", description: "Student UUID" };

const STUDENT_PROFILE_PROPERTIES = {
  firstName: { type: "string" },
  lastName: { type: "string" },
  email: { type: "string" },
  enrollmentDate: { type: "string" },
  enrollmentStatus: { type: "boolean" },
  enrolledClasses: { type: "array", items: { type: "string" } },
  financialAid: { type: "boolean" },
  earnedDegrees: { type: "array", items: { type: "string" } },
  address: { type: "string" },
  zipCode: { type: "string" },
  state: { type: "string" },
  phone: { type: "string" },
  emergencyContact: { type: "string" },
  emergencyContactPhone: { type: "string" },
  authorizedPayer: { type: "string" },
  authorizedPayerPhone: { type: "string" },
  authorizedPayerAddress: { type: "string" },
  authorizedPayerZip: { type: "string" },
  authorizedPayerState: { type: "string" },
  authorizedPayerEmail: { type: "string" },
  ada: { type: "boolean" },
};

const DCR_READ_TOOL_DEFS = [
  { name: "get_student_ferpa" as const, scope: "sis.students.ferpa", label: "FERPA" },
  { name: "get_student_financial" as const, scope: "sis.students.financial", label: "Financial" },
  { name: "get_student_ada" as const, scope: "sis.students.ada", label: "ADA" },
  { name: "get_student_disciplinary" as const, scope: "sis.students.disciplinary", label: "Disciplinary" },
  { name: "get_student_counselor_notes" as const, scope: "sis.students.counselor", label: "Counselor notes" },
  { name: "get_student_risk" as const, scope: "sis.students.risk", label: "Risk" },
  { name: "get_student_academic" as const, scope: "sis.students.academic", label: "Academic" },
];

export const SIS_CHAT_TOOLS = [
  {
    name: "list_students",
    description: "List students with optional search and pagination. Requires sis.students.read (or sis.admin).",
    input_schema: {
      type: "object",
      properties: {
        page: { type: "number" },
        limit: { type: "number" },
        search: { type: "string", description: "Search name or email" },
      },
    },
  },
  {
    name: "get_student",
    description: "Get one student record by UUID. Requires sis.students.read (or sis.admin).",
    input_schema: { type: "object", properties: { id: STUDENT_ID }, required: ["id"] },
  },
  {
    name: "search_students",
    description: "Quick search students by name or email. Requires sis.students.read (or sis.admin).",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "list_high_risk_students",
    description:
      "List students flagged at high or critical risk (GPA, probation, attendance). Requires sis.students.risk (or sis.admin). Prefer this over fetching risk one-by-one.",
    input_schema: {
      type: "object",
      properties: {
        levels: {
          type: "array",
          items: { type: "string" },
          description: "Risk levels to include, default high and critical",
        },
        maxGpa: { type: "number", description: "Include students at or below this GPA (default 2.0)" },
        maxAttendance: { type: "number", description: "Include students below this attendance %" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "create_student",
    description:
      "Create a student with core profile fields only. Prefer create_student_with_records when FERPA/financial/ADA/academic/etc. data is needed. Requires sis.students.write (or sis.admin).",
    input_schema: {
      type: "object",
      properties: STUDENT_PROFILE_PROPERTIES,
      required: ["firstName", "lastName", "email"],
    },
  },
  {
    name: "create_student_with_records",
    description:
      "Create a student with full core profile AND optional category records (FERPA, financial, ADA, disciplinary incidents, counselor notes, risk, academic) in one step. Requires sis.admin. Use @university.edu emails for demo students.",
    input_schema: {
      type: "object",
      properties: {
        student: {
          type: "object",
          description: "Core student profile (all standard SIS fields)",
          properties: STUDENT_PROFILE_PROPERTIES,
          required: ["firstName", "lastName", "email"],
        },
        ferpa: {
          type: "object",
          properties: {
            ferpaWaiverOnFile: { type: "boolean" },
            ferpaWaiverDate: { type: "string" },
            ferpaWaiverScope: { type: "string" },
            directoryInfoOptOut: { type: "boolean" },
            notes: { type: "string" },
          },
        },
        financial: {
          type: "object",
          properties: {
            financialAidStatus: { type: "string" },
            outstandingBalance: { type: "number" },
            expectedFamilyContribution: { type: "number" },
            fafsaYear: { type: "string" },
            paymentPlan: { type: "boolean" },
          },
        },
        ada: {
          type: "object",
          properties: {
            hasAccommodations: { type: "boolean" },
            accommodationTypes: { type: "array", items: { type: "string" } },
            diagnosisCategory: { type: "string" },
            assignedCoordinator: { type: "string" },
            semesterNotes: { type: "string" },
          },
        },
        disciplinary: {
          type: "array",
          items: {
            type: "object",
            properties: {
              incidentDate: { type: "string" },
              incidentType: { type: "string" },
              description: { type: "string" },
              outcome: { type: "string" },
              hearingOfficer: { type: "string" },
            },
            required: ["incidentDate", "incidentType", "description", "outcome"],
          },
        },
        counselorNotes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              counselorName: { type: "string" },
              counselorType: { type: "string" },
              noteDate: { type: "string" },
              note: { type: "string" },
              followUpStatus: { type: "string" },
            },
            required: ["counselorName", "counselorType", "noteDate", "note"],
          },
        },
        risk: {
          type: "object",
          properties: {
            overallRiskLevel: { type: "string" },
            gpa: { type: "number" },
            gpaTrend: { type: "string" },
            attendanceRate: { type: "number" },
            academicProbation: { type: "boolean" },
            interventionFlags: { type: "array", items: { type: "string" } },
          },
        },
        academic: {
          type: "object",
          properties: {
            major: { type: "string" },
            minor: { type: "string" },
            academicStanding: { type: "string" },
            gpa: { type: "number" },
            creditHoursEarned: { type: "number" },
            creditHoursRequired: { type: "number" },
            expectedGraduation: { type: "string" },
            advisor: { type: "string" },
            currentCourses: { type: "array", items: { type: "string" } },
            transcript: { type: "array", items: { type: "object" } },
          },
        },
      },
      required: ["student"],
    },
  },
  {
    name: "update_student",
    description: "Update an existing student by UUID. Requires sis.students.write (or sis.admin).",
    input_schema: {
      type: "object",
      properties: { id: STUDENT_ID, ...STUDENT_PROFILE_PROPERTIES },
      required: ["id"],
    },
  },
  ...DCR_READ_TOOL_DEFS.map((d) => ({
    name: d.name,
    description: `Read ${d.label} record(s). Requires ${d.scope} (or sis.admin).`,
    input_schema: { type: "object", properties: { id: STUDENT_ID }, required: ["id"] },
  })),
  {
    name: "upsert_student_ferpa",
    description: "Create or update FERPA record. Requires sis.students.ferpa (or sis.admin).",
    input_schema: {
      type: "object",
      properties: {
        id: STUDENT_ID,
        ferpaWaiverOnFile: { type: "boolean" },
        ferpaWaiverDate: { type: "string" },
        ferpaWaiverScope: { type: "string" },
        directoryInfoOptOut: { type: "boolean" },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "upsert_student_financial",
    description: "Create or update financial aid record. Requires sis.students.financial (or sis.admin).",
    input_schema: {
      type: "object",
      properties: {
        id: STUDENT_ID,
        financialAidStatus: { type: "string" },
        outstandingBalance: { type: "number" },
        expectedFamilyContribution: { type: "number" },
        fafsaYear: { type: "string" },
        paymentPlan: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "upsert_student_ada",
    description: "Create or update ADA accommodations record. Requires sis.students.ada (or sis.admin).",
    input_schema: {
      type: "object",
      properties: {
        id: STUDENT_ID,
        hasAccommodations: { type: "boolean" },
        accommodationTypes: { type: "array", items: { type: "string" } },
        diagnosisCategory: { type: "string" },
        assignedCoordinator: { type: "string" },
        semesterNotes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "add_student_disciplinary_incident",
    description: "Add a disciplinary incident. Requires sis.students.disciplinary (or sis.admin).",
    input_schema: {
      type: "object",
      properties: {
        id: STUDENT_ID,
        incidentDate: { type: "string" },
        incidentType: { type: "string" },
        description: { type: "string" },
        outcome: { type: "string" },
        hearingOfficer: { type: "string" },
      },
      required: ["id", "incidentDate", "incidentType", "description", "outcome"],
    },
  },
  {
    name: "add_student_counselor_note",
    description: "Add a counselor note. Requires sis.students.counselor (or sis.admin).",
    input_schema: {
      type: "object",
      properties: {
        id: STUDENT_ID,
        counselorName: { type: "string" },
        counselorType: { type: "string" },
        noteDate: { type: "string" },
        note: { type: "string" },
        followUpStatus: { type: "string" },
      },
      required: ["id", "counselorName", "counselorType", "noteDate", "note"],
    },
  },
  {
    name: "upsert_student_risk",
    description: "Create or update risk indicators. Requires sis.students.risk (or sis.admin).",
    input_schema: {
      type: "object",
      properties: {
        id: STUDENT_ID,
        overallRiskLevel: { type: "string" },
        gpa: { type: "number" },
        gpaTrend: { type: "string" },
        attendanceRate: { type: "number" },
        academicProbation: { type: "boolean" },
        interventionFlags: { type: "array", items: { type: "string" } },
      },
      required: ["id"],
    },
  },
  {
    name: "upsert_student_academic",
    description: "Create or update academic record. Requires sis.students.academic (or sis.admin).",
    input_schema: {
      type: "object",
      properties: {
        id: STUDENT_ID,
        major: { type: "string" },
        minor: { type: "string" },
        academicStanding: { type: "string" },
        gpa: { type: "number" },
        creditHoursEarned: { type: "number" },
        advisor: { type: "string" },
        currentCourses: { type: "array", items: { type: "string" } },
        transcript: { type: "array", items: { type: "object" } },
      },
      required: ["id"],
    },
  },
] as const;

function scopeDenied(name: SisToolName, granted: string[]) {
  return formatToolScopeDenied(name, TOOL_REQUIRED_SCOPES[name], granted);
}

function studentPath(id: unknown, suffix: string) {
  return `/api/v1/students/${encodeURIComponent(String(id))}${suffix}`;
}

function apiFetch(path: string, ctx: DelegatedAccess, init?: RequestInit) {
  return sisApiFetch(path, ctx.accessToken, init, ctx.sessionCookie);
}

function patchDcr(path: string, id: unknown, input: Record<string, unknown>, ctx: DelegatedAccess) {
  const { id: _id, ...body } = input;
  return apiFetch(studentPath(id, path), ctx, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

async function runDelegatedTool(
  name: SisToolName,
  input: Record<string, unknown>,
  ctx: DelegatedAccess
) {
  if (!canAccess(ctx.grantedScopes, TOOL_REQUIRED_SCOPES[name])) {
    return scopeDenied(name, ctx.grantedScopes);
  }

  switch (name) {
    case "list_students": {
      const qs = new URLSearchParams();
      qs.set("page", String(input.page ?? 1));
      qs.set("limit", String(Math.min(50, Number(input.limit ?? 10))));
      if (typeof input.search === "string" && input.search) qs.set("search", input.search);
      return apiFetch(`/api/v1/students?${qs}`, ctx);
    }
    case "search_students":
      return runDelegatedTool("list_students", { search: String(input.query ?? ""), limit: 15, page: 1 }, ctx);
    case "list_high_risk_students": {
      const qs = new URLSearchParams();
      if (Array.isArray(input.levels) && input.levels.length) {
        qs.set("levels", input.levels.map(String).join(","));
      }
      if (typeof input.maxGpa === "number") qs.set("maxGpa", String(input.maxGpa));
      if (typeof input.maxAttendance === "number") qs.set("maxAttendance", String(input.maxAttendance));
      if (typeof input.limit === "number") qs.set("limit", String(input.limit));
      const q = qs.toString();
      return apiFetch(`/api/v1/students/at-risk${q ? `?${q}` : ""}`, ctx);
    }
    case "get_student":
      return apiFetch(studentPath(input.id, ""), ctx);
    case "create_student": {
      const parsed = CreateStudentSchema.parse(input);
      return apiFetch("/api/v1/students", ctx, {
        method: "POST",
        body: JSON.stringify(parsed),
      });
    }
    case "create_student_with_records": {
      const parsed = CreateStudentWithRecordsSchema.parse(input);
      return apiFetch("/api/v1/students/with-records", ctx, {
        method: "POST",
        body: JSON.stringify(parsed),
      });
    }
    case "update_student": {
      const { id, ...rest } = input;
      const parsed = UpdateStudentSchema.parse(rest);
      return apiFetch(studentPath(id, ""), ctx, {
        method: "PATCH",
        body: JSON.stringify(parsed),
      });
    }
    case "get_student_ferpa":
      return apiFetch(studentPath(input.id, "/ferpa"), ctx);
    case "upsert_student_ferpa":
      return patchDcr("/ferpa", input.id, input, ctx);
    case "get_student_financial":
      return apiFetch(studentPath(input.id, "/financial"), ctx);
    case "upsert_student_financial":
      return patchDcr("/financial", input.id, input, ctx);
    case "get_student_ada":
      return apiFetch(studentPath(input.id, "/ada"), ctx);
    case "upsert_student_ada":
      return patchDcr("/ada", input.id, input, ctx);
    case "get_student_disciplinary":
      return apiFetch(studentPath(input.id, "/disciplinary"), ctx);
    case "add_student_disciplinary_incident": {
      const { id, ...body } = input;
      return apiFetch(studentPath(id, "/disciplinary"), ctx, {
        method: "POST",
        body: JSON.stringify(body),
      });
    }
    case "get_student_counselor_notes":
      return apiFetch(studentPath(input.id, "/counselor-notes"), ctx);
    case "add_student_counselor_note": {
      const { id, ...body } = input;
      return apiFetch(studentPath(id, "/counselor-notes"), ctx, {
        method: "POST",
        body: JSON.stringify(body),
      });
    }
    case "get_student_risk":
      return apiFetch(studentPath(input.id, "/risk"), ctx);
    case "upsert_student_risk":
      return patchDcr("/risk", input.id, input, ctx);
    case "get_student_academic":
      return apiFetch(studentPath(input.id, "/academic"), ctx);
    case "upsert_student_academic":
      return patchDcr("/academic", input.id, input, ctx);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function runDirectTool(_name: SisToolName, _input: Record<string, unknown>) {
  return {
    error: "Tool calls require OIDC sign-in with delegated OAuth scopes.",
  };
}

export async function runSisTool(
  name: string,
  input: Record<string, unknown>,
  delegated?: DelegatedAccess
) {
  const tool = name as SisToolName;
  if (!(tool in TOOL_REQUIRED_SCOPES)) {
    return { error: `Unknown tool: ${name}` };
  }
  if (!delegated) {
    return runDirectTool(tool, input);
  }
  return runDelegatedTool(tool, input, delegated);
}
