import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import {
  CreateStudentSchema,
  StudentResponseSchema,
  UpdateStudentSchema,
  OAuthScopes,
} from "@sis/shared";
import { z } from "zod";
import { config } from "./config.js";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

registry.register("Student", StudentResponseSchema);
registry.register("CreateStudent", CreateStudentSchema);
registry.register("UpdateStudent", UpdateStudentSchema);

registry.registerPath({
  method: "get",
  path: "/api/v1/students",
  tags: ["Students"],
  summary: "List students",
  security: [{ bearerAuth: [] }, { sessionAuth: [] }],
  request: {
    query: z.object({
      page: z.coerce.number().optional(),
      limit: z.coerce.number().optional(),
      search: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Paginated student list",
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/students/{id}",
  tags: ["Students"],
  summary: "Get student by ID",
  security: [{ bearerAuth: [] }, { sessionAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: "Student record" } },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/students/me",
  tags: ["Students"],
  summary: "Get own student profile",
  security: [{ bearerAuth: [] }, { sessionAuth: [] }],
  responses: { 200: { description: "Caller student profile" } },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/students",
  tags: ["Students"],
  summary: "Create student",
  security: [{ bearerAuth: [] }, { sessionAuth: [] }],
  request: { body: { content: { "application/json": { schema: CreateStudentSchema } } } },
  responses: { 201: { description: "Created student" } },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/students/{id}",
  tags: ["Students"],
  summary: "Update student",
  security: [{ bearerAuth: [] }, { sessionAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { "application/json": { schema: UpdateStudentSchema } } },
  },
  responses: { 200: { description: "Updated student" } },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/students/{id}",
  tags: ["Students"],
  summary: "Delete student",
  security: [{ bearerAuth: [] }, { sessionAuth: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: "Deleted" } },
});

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: `Okta OAuth 2.0 access token. Scopes: ${Object.values(OAuthScopes).join(", ")}`,
});

registry.registerComponent("securitySchemes", "sessionAuth", {
  type: "apiKey",
  in: "cookie",
  name: "connect.sid",
  description: "Session cookie from Okta OIDC sign-in (sis.sid)",
});

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "SIS Demo API",
      version: "1.0.0",
      description:
        "Student Information System demo API for Okta Workflows, agentic AI, and MCP integration.",
    },
    servers: [
      {
        url: config.apiPublicUrl.replace(/\/$/, ""),
        description: "API (production CNAME: sis-api.skylarbarnes.com)",
      },
      { url: "http://localhost:3010", description: "Local development" },
    ],
  });
}
