import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, apiUrl } from "../api";

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const authError = searchParams.get("error");
  const authMessage = searchParams.get("message");
  const [email, setEmail] = useState("admin@university.edu");
  const [role, setRole] = useState<"admin" | "student">("admin");
  const [persona, setPersona] = useState("enrollment_admin");
  const [error, setError] = useState("");

  const { data: authConfig } = useQuery({
    queryKey: ["auth", "config"],
    queryFn: api.getAuthConfig,
    retry: false,
  });

  const oidcEnabled = authConfig?.data.oidc ?? false;
  const isDev = import.meta.env.DEV;

  async function handleDevLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const { data } = await api.devLogin(email, role, role === "admin" ? persona : "student");
      navigate(data.role === "admin" ? "/admin/students" : "/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <div className="login-landing">
      <section className="login-hero" aria-hidden="true">
        <div className="login-hero-content">
          <h1>Student Information System</h1>
          <p>
            Sign in with your university Okta account. Enrollment Admins manage records; Students
            view their profile.
          </p>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <h2>Welcome back</h2>
          <p className="subtitle">Sign in with Okta to continue.</p>

          {authError && (
            <div className="error" style={{ marginBottom: "1rem" }}>
              Sign-in failed ({authError}
              {authMessage ? `): ${authMessage}` : ")"}
            </div>
          )}

          <div className="login-options">
            {oidcEnabled ? (
              <a className="btn btn-primary btn-saml" href={apiUrl("/auth/oidc/login?returnTo=/")}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 2L4 6v6c0 5.25 3.4 10.15 8 11.35C16.6 22.15 20 17.25 20 12V6l-8-4z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
                Sign in with Okta
              </a>
            ) : (
              <p className="login-hint">Okta sign-in is not configured on the server.</p>
            )}

            {isDev && (
              <>
                <div className="login-divider">or dev login</div>
                <form className="dev-login-form" onSubmit={handleDevLogin}>
                  <label>
                    Email
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Role
                    <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "student")}>
                      <option value="admin">Staff (admin UI)</option>
                      <option value="student">Student</option>
                    </select>
                  </label>
                  {role === "admin" && (
                    <label>
                      Staff persona (scopes)
                      <select value={persona} onChange={(e) => setPersona(e.target.value)}>
                        <option value="enrollment_admin">Enrollment Admin (all datasets)</option>
                        <option value="enrollment_counselor">Enrollment Counselor (FERPA + Financial)</option>
                        <option value="student_affairs">Student Affairs (Academic, ADA, etc.)</option>
                        <option value="registrar">Registrar (core records only)</option>
                      </select>
                    </label>
                  )}
                  {error && <div className="error">{error}</div>}
                  <button type="submit" className="btn btn-secondary" style={{ width: "100%" }}>
                    Dev login
                  </button>
                </form>
                <p className="login-hint" style={{ marginTop: "0.75rem" }}>
                  Dev: <code>admin@university.edu</code> or <code>alice.johnson@university.edu</code>
                </p>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
