import { Router } from "express";
import passport from "passport";
import { resolveUserRole, resolveOidcUserRole } from "@sis/shared";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { enrichAuthUser, sessionUserFromIdentity } from "../lib/auth-user.js";
import { upsertUserFromIdentity } from "../lib/user-provision.js";
import { isOidcEnabled } from "../lib/oidc.js";
import { oidcRouter } from "./oidc.js";

declare module "express-session" {
  interface SessionData {
    returnTo?: string;
    oidc?: { state: string; nonce: string; verifier: string };
    idToken?: string;
    refreshToken?: string;
    authMethod?: "oidc" | "dev";
  }
}

export const authRouter = Router();

authRouter.use("/oidc", oidcRouter);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user as Express.User));

function redirectToLogin(res: import("express").Response, code: string, message?: string) {
  const qs = new URLSearchParams({ error: code });
  if (message) qs.set("message", message);
  return res.redirect(`${config.appUrl}/login?${qs.toString()}`);
}

authRouter.get("/config", (_req, res) => {
  res.json({
    data: {
      oidc: isOidcEnabled(),
    },
  });
});

/** Primary sign-in entry — OIDC only */
authRouter.get("/login", (req, res) => {
  if (!isOidcEnabled()) {
    return res.status(503).json({
      error: { code: "OIDC_DISABLED", message: "OIDC is not configured" },
    });
  }
  const returnTo =
    typeof req.query.returnTo === "string" && req.query.returnTo.startsWith("/")
      ? req.query.returnTo
      : "/";
  res.redirect(`/auth/oidc/login?returnTo=${encodeURIComponent(returnTo)}`);
});

authRouter.get("/me", async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } });
    }
    res.json({ data: await enrichAuthUser(req.user) });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/dev/login", async (req, res, next) => {
  if (config.nodeEnv === "production") {
    return next(new AppError(403, "FORBIDDEN", "Dev login disabled in production"));
  }
  const { email, role: bodyRole, persona, groups: bodyGroups } = req.body as {
    email?: string;
    role?: "admin" | "student";
    persona?: string;
    groups?: string[];
  };
  if (!email) {
    return next(new AppError(400, "VALIDATION_ERROR", "email required"));
  }

  const devGroups =
    Array.isArray(bodyGroups) && bodyGroups.length
      ? bodyGroups.map(String)
      : persona === "enrollment_counselor"
        ? ["Enrollment Counselor"]
        : persona === "student_affairs"
          ? ["Student Affairs"]
          : persona === "registrar"
            ? ["Registrar"]
            : persona === "enrollment_admin"
              ? ["Enrollment Admins"]
              : persona === "student"
                ? ["Students"]
                : [];

  const role =
    bodyRole ??
    resolveOidcUserRole(email.toLowerCase(), devGroups) ??
    resolveUserRole(email, devGroups);

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({ data: { email, role } });
  } else if (user.role !== role) {
    user = await prisma.user.update({ where: { id: user.id }, data: { role } });
  }

  if (role === "student") {
    const existing = await prisma.student.findUnique({ where: { email } });
    if (!existing) {
      await prisma.student.create({
        data: {
          userId: user.id,
          email,
          firstName: "Demo",
          lastName: "Student",
          enrollmentDate: "2024-09-01",
          enrollmentStatus: true,
          enrolledClasses: ["CS101", "MATH201"],
        },
      });
    }
  }

  const sessionUser = sessionUserFromIdentity({
    id: user.id,
    email: user.email,
    role: user.role,
    oktaId: user.oktaId,
    firstName: role === "student" ? "Demo" : undefined,
    lastName: role === "student" ? "Student" : undefined,
    groups: devGroups.length ? devGroups : role === "admin" ? ["Enrollment Admins"] : ["Students"],
  });

  req.session.authMethod = "dev";
  req.login(sessionUser, (err) => {
    if (err) return next(err);
    res.json({ data: sessionUser });
  });
});

authRouter.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.json({ data: { ok: true } }));
  });
});

authRouter.post("/dev/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.json({ data: { ok: true } }));
  });
});
