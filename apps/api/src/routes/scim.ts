import crypto from "node:crypto";
import express, { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import type { Applicant, Prisma } from "@prisma/client";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";

/**
 * Okta → SIS SCIM 2.0 (Users only). Okta provisions prospective students here once they land in
 * the "Pending Enrollment" group; counselors decide in the SIS (routes/applicants.ts).
 *
 * Writes only touch the applicants table — never Student, and never the SIS → Okta push, so a
 * provisioning update can't echo back into Okta.
 */

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
/** Okta app profile attributes use this as their "External namespace". */
export const APPLICANT_EXTENSION = "urn:ietf:params:scim:schemas:extension:sis:2.0:Applicant";

const INTAKE_FIELDS = ["intendedProgram", "entryTerm", "highSchool"] as const;

export const scimRouter = Router();

scimRouter.use(
  rateLimit({ windowMs: 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false })
);
// Okta sends application/scim+json, which the app-wide express.json() ignores.
scimRouter.use(express.json({ type: ["application/json", "application/scim+json"] }));
scimRouter.use(requireScimToken);

function scimError(res: Response, status: number, detail: string, scimType?: string) {
  return res
    .status(status)
    .type("application/scim+json")
    .json({ schemas: [ERROR_SCHEMA], status: String(status), detail, ...(scimType ? { scimType } : {}) });
}

function sendScim(res: Response, status: number, body: unknown) {
  return res.status(status).type("application/scim+json").json(body);
}

function requireScimToken(req: Request, res: Response, next: NextFunction) {
  if (!config.scim.enabled) {
    return scimError(res, 503, "SCIM provisioning is not configured (set SCIM_API_TOKEN)");
  }
  // Okta's custom SCIM integrations send "Bearer <token>"; the OIN "Header Auth" test app
  // sends the raw token as the Authorization value. Accept both.
  const header = (req.headers.authorization ?? "").trim();
  const presented = header.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(presented);
  const b = Buffer.from(config.scim.token);
  if (!presented || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return scimError(res, 401, "Invalid bearer token");
  }
  return next();
}

type ScimAttrs = {
  userName?: string;
  externalId?: string;
  firstName?: string;
  lastName?: string;
  personalEmail?: string;
  phone?: string;
  active?: boolean;
  oktaUserId?: string;
  intendedProgram?: string;
  entryTerm?: string;
  highSchool?: string;
};

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return String(value).trim();
}

function firstValue(list: unknown): string | undefined {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const entries = list as { value?: unknown; primary?: boolean }[];
  return str((entries.find((e) => e?.primary) ?? entries[0])?.value);
}

function asBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "True") return true;
  if (value === "false" || value === "False") return false;
  return undefined;
}

/** Pull our attributes out of a SCIM User body (core attrs + any extension object). */
function parseScimUser(body: Record<string, unknown>): ScimAttrs {
  const name = (body.name ?? {}) as Record<string, unknown>;
  const attrs: ScimAttrs = {
    userName: str(body.userName),
    externalId: str(body.externalId),
    firstName: str(name.givenName),
    lastName: str(name.familyName),
    personalEmail: firstValue(body.emails),
    phone: firstValue(body.phoneNumbers),
    active: asBool(body.active),
  };

  // Okta puts custom app attributes under their external namespace; accept any extension URN
  // (and top level) so a namespace typo in the Okta app profile doesn't silently drop them.
  const sources: Record<string, unknown>[] = [body];
  for (const [key, value] of Object.entries(body)) {
    if (key.startsWith("urn:") && value && typeof value === "object" && !Array.isArray(value)) {
      sources.push(value as Record<string, unknown>);
    }
  }
  for (const source of sources) {
    for (const field of [...INTAKE_FIELDS, "oktaUserId"] as const) {
      const value = str(source[field]);
      if (value !== undefined && attrs[field] === undefined) attrs[field] = value;
    }
  }
  return attrs;
}

function resolveOktaId(attrs: ScimAttrs): string | undefined {
  if (attrs.oktaUserId?.startsWith("00u")) return attrs.oktaUserId;
  if (attrs.externalId?.startsWith("00u")) return attrs.externalId;
  return undefined;
}

function toApplicantData(attrs: ScimAttrs): Prisma.ApplicantUpdateInput {
  const data: Prisma.ApplicantUpdateInput = {};
  if (attrs.userName) data.userName = attrs.userName;
  if (attrs.firstName !== undefined) data.firstName = attrs.firstName;
  if (attrs.lastName !== undefined) data.lastName = attrs.lastName;
  if (attrs.personalEmail) data.personalEmail = attrs.personalEmail;
  if (attrs.phone !== undefined) data.phone = attrs.phone;
  if (attrs.active !== undefined) data.active = attrs.active;
  for (const field of INTAKE_FIELDS) {
    if (attrs[field] !== undefined) data[field] = attrs[field];
  }
  const oktaId = resolveOktaId(attrs);
  if (oktaId) data.oktaId = oktaId;
  return data;
}

function toScimUser(applicant: Applicant, req: Request) {
  const base = `${req.protocol}://${req.get("host")}${req.baseUrl}`;
  return {
    schemas: [USER_SCHEMA, APPLICANT_EXTENSION],
    id: applicant.id,
    ...(applicant.oktaId ? { externalId: applicant.oktaId } : {}),
    userName: applicant.userName,
    name: {
      givenName: applicant.firstName,
      familyName: applicant.lastName,
      formatted: `${applicant.firstName} ${applicant.lastName}`.trim(),
    },
    displayName: `${applicant.firstName} ${applicant.lastName}`.trim(),
    emails: [{ value: applicant.personalEmail, type: "home", primary: true }],
    ...(applicant.phone ? { phoneNumbers: [{ value: applicant.phone, type: "mobile" }] } : {}),
    active: applicant.active,
    [APPLICANT_EXTENSION]: {
      intendedProgram: applicant.intendedProgram,
      entryTerm: applicant.entryTerm,
      highSchool: applicant.highSchool,
      admissionStatus: applicant.status,
      ...(applicant.universityEmail ? { universityEmail: applicant.universityEmail } : {}),
      ...(applicant.studentNumber ? { studentNumber: applicant.studentNumber } : {}),
    },
    meta: {
      resourceType: "User",
      created: applicant.createdAt.toISOString(),
      lastModified: applicant.updatedAt.toISOString(),
      location: `${base}/Users/${applicant.id}`,
    },
  };
}

/** Supports the filters Okta sends: `userName eq "x"` and `externalId eq "x"`. */
function parseFilter(filter: string | undefined): Prisma.ApplicantWhereInput | null | "unsupported" {
  if (!filter) return null;
  const match = filter.match(/^\s*(userName|externalId|id)\s+eq\s+"((?:[^"\\]|\\.)*)"\s*$/i);
  if (!match) return "unsupported";
  const value = match[2].replace(/\\(.)/g, "$1");
  const attr = match[1].toLowerCase();
  if (attr === "username") return { userName: { equals: value, mode: "insensitive" } };
  if (attr === "externalid") return { oktaId: value };
  return { id: value };
}

scimRouter.get("/ServiceProviderConfig", (_req, res) => {
  sendScim(res, 200, {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      { type: "oauthbearertoken", name: "Bearer token", description: "Static bearer token" },
    ],
  });
});

scimRouter.get("/Users", async (req, res, next) => {
  try {
    const where = parseFilter(typeof req.query.filter === "string" ? req.query.filter : undefined);
    if (where === "unsupported") {
      return scimError(res, 400, "Only userName/externalId/id eq filters are supported", "invalidFilter");
    }
    const startIndex = Math.max(1, Number(req.query.startIndex) || 1);
    const count = Math.min(200, Math.max(0, Number(req.query.count ?? 100) || 0));
    const [total, applicants] = await Promise.all([
      prisma.applicant.count({ where: where ?? {} }),
      prisma.applicant.findMany({
        where: where ?? {},
        orderBy: { createdAt: "asc" },
        skip: startIndex - 1,
        take: count,
      }),
    ]);
    return sendScim(res, 200, {
      schemas: [LIST_SCHEMA],
      totalResults: total,
      startIndex,
      itemsPerPage: applicants.length,
      Resources: applicants.map((a) => toScimUser(a, req)),
    });
  } catch (err) {
    next(err);
  }
});

scimRouter.get("/Users/:id", async (req, res, next) => {
  try {
    const applicant = await prisma.applicant.findUnique({ where: { id: req.params.id } });
    if (!applicant) return scimError(res, 404, "User not found");
    return sendScim(res, 200, toScimUser(applicant, req));
  } catch (err) {
    next(err);
  }
});

scimRouter.post("/Users", async (req, res, next) => {
  try {
    const attrs = parseScimUser(req.body ?? {});
    if (!attrs.userName) return scimError(res, 400, "userName is required", "invalidValue");

    const existing = await prisma.applicant.findFirst({
      where: { userName: { equals: attrs.userName, mode: "insensitive" } },
    });
    if (existing) return scimError(res, 409, "User already exists", "uniqueness");

    const applicant = await prisma.applicant.create({
      data: {
        userName: attrs.userName,
        firstName: attrs.firstName ?? "",
        lastName: attrs.lastName ?? "",
        personalEmail: attrs.personalEmail ?? attrs.userName,
        phone: attrs.phone ?? "",
        intendedProgram: attrs.intendedProgram ?? "",
        entryTerm: attrs.entryTerm ?? "",
        highSchool: attrs.highSchool ?? "",
        active: attrs.active ?? true,
        oktaId: resolveOktaId(attrs),
      },
    });
    console.log(`[scim] created applicant ${applicant.id} (${applicant.userName})`);
    return sendScim(res, 201, toScimUser(applicant, req));
  } catch (err) {
    next(err);
  }
});

scimRouter.put("/Users/:id", async (req, res, next) => {
  try {
    const existing = await prisma.applicant.findUnique({ where: { id: req.params.id } });
    if (!existing) return scimError(res, 404, "User not found");
    const applicant = await prisma.applicant.update({
      where: { id: existing.id },
      data: toApplicantData(parseScimUser(req.body ?? {})),
    });
    return sendScim(res, 200, toScimUser(applicant, req));
  } catch (err) {
    next(err);
  }
});

/** Okta uses PATCH for activate/deactivate (`active`), sometimes for single attributes. */
scimRouter.patch("/Users/:id", async (req, res, next) => {
  try {
    const existing = await prisma.applicant.findUnique({ where: { id: req.params.id } });
    if (!existing) return scimError(res, 404, "User not found");

    const body = (req.body ?? {}) as { schemas?: string[]; Operations?: unknown[] };
    if (!Array.isArray(body.Operations)) {
      return scimError(res, 400, `Expected ${PATCH_SCHEMA} with Operations`, "invalidSyntax");
    }

    const merged: Record<string, unknown> = {};
    for (const raw of body.Operations) {
      const op = raw as { op?: string; path?: string; value?: unknown };
      if (!["add", "replace"].includes(String(op.op ?? "").toLowerCase())) continue;
      if (op.path) {
        setPath(merged, op.path, op.value);
      } else if (op.value && typeof op.value === "object") {
        for (const [key, value] of Object.entries(op.value as Record<string, unknown>)) {
          setPath(merged, key, value);
        }
      }
    }

    const applicant = await prisma.applicant.update({
      where: { id: existing.id },
      data: toApplicantData(parseScimUser(merged)),
    });
    if (existing.active && !applicant.active) {
      console.log(`[scim] deactivated applicant ${applicant.id} (${applicant.userName})`);
    }
    return sendScim(res, 200, toScimUser(applicant, req));
  } catch (err) {
    next(err);
  }
});

/** Expand a SCIM attribute path ("name.givenName", "<urn>:intendedProgram") into a body shape. */
function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const urnMatch = path.match(/^(urn:[^ ]+):([^:.]+)$/);
  if (urnMatch) {
    const ext = (target[urnMatch[1]] ??= {}) as Record<string, unknown>;
    ext[urnMatch[2]] = value;
    return;
  }
  const [head, ...rest] = path.split(".");
  if (rest.length === 0) {
    target[head] = value;
    return;
  }
  const child = (target[head] ??= {}) as Record<string, unknown>;
  child[rest.join(".")] = value;
}

/** Okta doesn't send DELETE; treat it as a hard remove of an undecided applicant. */
scimRouter.delete("/Users/:id", async (req, res, next) => {
  try {
    const existing = await prisma.applicant.findUnique({ where: { id: req.params.id } });
    if (!existing) return scimError(res, 404, "User not found");
    if (existing.status !== "pending") {
      await prisma.applicant.update({ where: { id: existing.id }, data: { active: false } });
    } else {
      await prisma.applicant.delete({ where: { id: existing.id } });
    }
    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

scimRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[scim]", err);
  return scimError(res, 500, "Internal error");
});
