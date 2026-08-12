import express from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import passport from "passport";
import rateLimit from "express-rate-limit";
import { ZodError } from "zod";
import { config, isProduction } from "./config.js";
import { errorHandler, sendError } from "./lib/errors.js";
import { requestId } from "./middleware/requestId.js";
import { authRouter } from "./routes/auth.js";
import { chatRouter } from "./routes/chat.js";
import { studentsRouter } from "./routes/students.js";
import { generateOpenApiDocument } from "./openapi.js";
import { mountMcpRoutes, getMcpPublicInfo } from "./mcp/routes.js";
import { isOidcEnabled } from "./lib/oidc.js";

const app = express();

if (config.trustProxy) {
  app.set("trust proxy", 1);
}

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(requestId);

app.use(
  session({
    name: "sis.sid",
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction,
      httpOnly: true,
      sameSite: isProduction ? "none" : "lax",
      domain: config.sessionCookieDomain || undefined,
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    oidc: isOidcEnabled(),
    oauth: config.oauth.enabled,
    oktaPush: {
      enabled: config.oktaPush.enabled,
      orgUrl: config.oktaPush.orgUrl || null,
      extendedProfile: config.oktaPush.includeExtendedProfile,
    },
    mcp: getMcpPublicInfo(),
  });
});

mountMcpRoutes(app);

app.get("/api/v1/openapi.json", (_req, res) => {
  res.json(generateOpenApiDocument());
});

app.use("/auth", authRouter);
app.use("/api/v1/chat", apiLimiter, chatRouter);
app.use("/api/v1/students", apiLimiter, studentsRouter);

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof ZodError) {
    return sendError(res, 400, "VALIDATION_ERROR", "Invalid request data", err.flatten());
  }
  return errorHandler(err, req, res);
});

app.listen(config.port, () => {
  console.log(`SIS API listening on http://localhost:${config.port}`);
  console.log(`  OIDC: ${isOidcEnabled() ? "enabled" : "disabled"}`);
  if (isOidcEnabled()) {
    console.log(`    Redirect: ${config.oidc.redirectUri}`);
  }
  console.log(`  OAuth API: ${config.oauth.enabled ? "enabled" : "disabled"}`);
  const mcp = getMcpPublicInfo();
  console.log(`  MCP: ${mcp.enabled ? mcp.url : "disabled (set OKTA_ISSUER)"}`);
  if (mcp.enabled && mcp.protectedResourceMetadata) {
    console.log(`    OAuth metadata: ${mcp.protectedResourceMetadata}`);
  }
  console.log(`  OpenAPI: http://localhost:${config.port}/api/v1/openapi.json`);
});
