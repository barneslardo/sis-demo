const fs = require("fs");
const path = require("path");

/** Load repo-root .env into a plain object for PM2 */
function loadEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.trim();
    }
    env[key] = value;
  }
  return env;
}

const rootDir = __dirname;
const envPath = path.join(rootDir, ".env");
const fileEnv = loadEnvFile(envPath);
const logsDir = path.join(rootDir, "logs", "pm2");

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const sharedPm2 = {
  instances: 1,
  exec_mode: "fork",
  autorestart: true,
  max_restarts: 50,
  min_uptime: "10s",
  restart_delay: 4000,
  exp_backoff_restart_delay: 2000,
  kill_timeout: 8000,
  listen_timeout: 15000,
  watch: false,
  merge_logs: true,
  time: true,
};

module.exports = {
  apps: [
    {
      name: "sis-api",
      cwd: path.join(rootDir, "apps/api"),
      script: "dist/index.js",
      interpreter: "node",
      error_file: path.join(logsDir, "sis-api-error.log"),
      out_file: path.join(logsDir, "sis-api-out.log"),
      env: {
        ...process.env,
        ...fileEnv,
        NODE_ENV: "production",
        API_PORT: fileEnv.API_PORT || process.env.API_PORT || "3010",
      },
      ...sharedPm2,
    },
    {
      name: "sis-web",
      cwd: path.join(rootDir, "apps/web"),
      script: "node_modules/vite/bin/vite.js",
      args: "preview --host 0.0.0.0 --port 5173",
      interpreter: "node",
      error_file: path.join(logsDir, "sis-web-error.log"),
      out_file: path.join(logsDir, "sis-web-out.log"),
      env: {
        ...process.env,
        ...fileEnv,
        NODE_ENV: "production",
      },
      ...sharedPm2,
    },
  ],
};
