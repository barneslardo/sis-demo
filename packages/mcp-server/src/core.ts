import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { OAuthScopes } from "@sis/shared";
import { apiRequest } from "./api-client.js";

export function createSisMcpServer() {
  const server = new Server(
    {
      name: "sis-demo",
      version: "1.0.0",
      description:
        "Student Information System — list, read, and manage student records via the SIS REST API.",
    },
    { capabilities: { tools: {}, resources: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      // ── Core student tools ────────────────────────────────────────────────
      {
        name: "list_students",
        description: `List students with optional search and pagination. Requires scope: ${OAuthScopes.STUDENTS_READ} or ${OAuthScopes.ADMIN}.`,
        inputSchema: {
          type: "object",
          properties: {
            page: { type: "number", description: "Page number (default 1)" },
            limit: { type: "number", description: "Results per page (default 20)" },
            search: { type: "string", description: "Search by name or email" },
          },
        },
      },
      {
        name: "get_student",
        description: `Get a student by ID. Requires scope: ${OAuthScopes.STUDENTS_READ} or ${OAuthScopes.ADMIN}.`,
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Student UUID" } },
          required: ["id"],
        },
      },
      {
        name: "get_my_profile",
        description: `Get the authenticated user's student profile. Requires scope: ${OAuthScopes.STUDENTS_READ_SELF}.`,
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "create_student",
        description: `Create a student record. Requires scope: ${OAuthScopes.STUDENTS_WRITE} or ${OAuthScopes.ADMIN}.`,
        inputSchema: {
          type: "object",
          properties: {
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
          },
          required: ["firstName", "lastName", "email"],
        },
      },
      {
        name: "update_student",
        description: `Update a student record. Requires scope: ${OAuthScopes.STUDENTS_WRITE} or ${OAuthScopes.ADMIN}.`,
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Student UUID" },
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
          },
          required: ["id"],
        },
      },
      {
        name: "delete_student",
        description: `Delete a student record. Requires scope: ${OAuthScopes.STUDENTS_WRITE} or ${OAuthScopes.ADMIN}.`,
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Student UUID" } },
          required: ["id"],
        },
      },
      // ── FERPA (Enrollment Counselors) ─────────────────────────────────────
      {
        name: "get_student_ferpa",
        description: `Get a student's FERPA record. Requires scope: ${OAuthScopes.STUDENTS_FERPA}. Enrollment Counselor access only.`,
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Student UUID" } },
          required: ["id"],
        },
      },
      // ── Financial (Enrollment Counselors) ────────────────────────────────
      {
        name: "get_student_financial",
        description: `Get a student's financial aid record. Requires scope: ${OAuthScopes.STUDENTS_FINANCIAL}. Enrollment Counselor access only.`,
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Student UUID" } },
          required: ["id"],
        },
      },
      // ── ADA (Student Affairs) ─────────────────────────────────────────────
      {
        name: "get_student_ada",
        description: `Get a student's ADA accommodation record. Requires scope: ${OAuthScopes.STUDENTS_ADA}. Student Affairs access only.`,
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Student UUID" } },
          required: ["id"],
        },
      },
      // ── Disciplinary (Student Affairs) ────────────────────────────────────
      {
        name: "get_student_disciplinary",
        description: `Get a student's disciplinary history. Requires scope: ${OAuthScopes.STUDENTS_DISCIPLINARY}. Student Affairs access only.`,
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Student UUID" } },
          required: ["id"],
        },
      },
      // ── Counselor Notes (Student Affairs) ────────────────────────────────
      {
        name: "get_student_counselor_notes",
        description: `Get counselor notes for a student. Requires scope: ${OAuthScopes.STUDENTS_COUNSELOR}. Student Affairs access only.`,
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Student UUID" } },
          required: ["id"],
        },
      },
      // ── Risk Indicators (Student Affairs) ────────────────────────────────
      {
        name: "get_student_risk",
        description: `Get a student's risk indicator profile (GPA trend, attendance, flags). Requires scope: ${OAuthScopes.STUDENTS_RISK}. Student Affairs access only.`,
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Student UUID" } },
          required: ["id"],
        },
      },
      // ── Academic Record (Student Affairs) ────────────────────────────────
      {
        name: "get_student_academic",
        description: `Get a student's full academic record including transcript and standing. Requires scope: ${OAuthScopes.STUDENTS_ACADEMIC}. Student Affairs access only.`,
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Student UUID" } },
          required: ["id"],
        },
      },
    ],
  }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: "sis://students",
        name: "Students",
        description: "Student records in the SIS demo",
        mimeType: "application/json",
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request, extra) => {
    const accessToken = extra?.authInfo?.token;
    const uri = request.params.uri;
    if (uri === "sis://students") {
      const result = await apiRequest<{ data: unknown[] }>("/api/v1/students?limit=100", {
        accessToken,
      });
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(result.data, null, 2) }],
      };
    }
    const match = uri.match(/^sis:\/\/students\/(.+)$/);
    if (match) {
      const result = await apiRequest<{ data: unknown }>(`/api/v1/students/${match[1]}`, {
        accessToken,
      });
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(result.data, null, 2) }],
      };
    }
    throw new Error(`Unknown resource: ${uri}`);
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as Record<string, unknown>;
    const accessToken = extra?.authInfo?.token;

    try {
      let result: unknown;

      switch (name) {
        case "list_students": {
          const qs = new URLSearchParams();
          if (a.page) qs.set("page", String(a.page));
          if (a.limit) qs.set("limit", String(a.limit));
          if (a.search) qs.set("search", String(a.search));
          result = await apiRequest(`/api/v1/students?${qs}`, { accessToken });
          break;
        }
        case "get_student":
          result = await apiRequest(`/api/v1/students/${a.id}`, { accessToken });
          break;
        case "get_my_profile":
          result = await apiRequest("/api/v1/students/me", { accessToken });
          break;
        case "create_student":
          result = await apiRequest("/api/v1/students", {
            method: "POST",
            body: JSON.stringify(args),
            accessToken,
          });
          break;
        case "update_student": {
          const { id, ...body } = a;
          result = await apiRequest(`/api/v1/students/${id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
            accessToken,
          });
          break;
        }
        case "delete_student":
          await apiRequest(`/api/v1/students/${a.id}`, { method: "DELETE", accessToken });
          result = { deleted: true, id: a.id };
          break;
        // Data-category tools
        case "get_student_ferpa":
          result = await apiRequest(`/api/v1/students/${a.id}/ferpa`, { accessToken });
          break;
        case "get_student_financial":
          result = await apiRequest(`/api/v1/students/${a.id}/financial`, { accessToken });
          break;
        case "get_student_ada":
          result = await apiRequest(`/api/v1/students/${a.id}/ada`, { accessToken });
          break;
        case "get_student_disciplinary":
          result = await apiRequest(`/api/v1/students/${a.id}/disciplinary`, { accessToken });
          break;
        case "get_student_counselor_notes":
          result = await apiRequest(`/api/v1/students/${a.id}/counselor-notes`, { accessToken });
          break;
        case "get_student_risk":
          result = await apiRequest(`/api/v1/students/${a.id}/risk`, { accessToken });
          break;
        case "get_student_academic":
          result = await apiRequest(`/api/v1/students/${a.id}/academic`, { accessToken });
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  });

  return server;
}
