import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, Link } from "react-router-dom";
import { hasScope, OAuthScopes } from "@sis/shared";
import { api } from "../api";
import { AdminChatPanel } from "./AdminChatPanel";

export function AuthProvider() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: api.getMe,
    retry: false,
  });

  if (isLoading) return <div className="loading-screen">Loading…</div>;
  if (error || !data?.data) return <Navigate to="/login" replace />;

  const roleLabel = data.data.role === "admin" ? "Administrator" : "Student";
  const personaLabel = data.data.persona;

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <strong>SIS</strong>
          <span className="header-user">{data.data.displayName}</span>
          {personaLabel ? (
            <span className="header-role">{personaLabel}</span>
          ) : (
            <span className="header-role">{roleLabel}</span>
          )}
        </div>
        <nav>
          {data.data.role === "admin" ? (
            <Link to="/admin/students">Students</Link>
          ) : (
            <Link to="/profile">My Profile</Link>
          )}
          <button
            className="btn btn-secondary"
            onClick={async () => {
              await api.logout();
              window.location.href = "/login";
            }}
          >
            Logout
          </button>
        </nav>
      </header>
      <main className="app-main">
        <Outlet context={data.data} />
      </main>
      {data.data.role === "admin" && <AdminChatPanel />}
    </>
  );
}

export function AdminGuard() {
  const { data, isLoading } = useQuery({ queryKey: ["auth", "me"], queryFn: api.getMe, retry: false });
  if (isLoading) return <div className="loading-screen">Loading…</div>;
  if (data?.data.role !== "admin") return <Navigate to="/profile" replace />;
  return <Outlet />;
}

export function StaffWriteGuard() {
  const { data, isLoading } = useQuery({ queryKey: ["auth", "me"], queryFn: api.getMe, retry: false });
  if (isLoading) return <div className="loading-screen">Loading…</div>;
  const scopes = data?.data.scopes ?? [];
  const canWrite =
    data?.data.role === "admin" &&
    (hasScope(scopes, OAuthScopes.ADMIN) || hasScope(scopes, OAuthScopes.STUDENTS_WRITE));
  if (!canWrite) return <Navigate to="/admin/students" replace />;
  return <Outlet />;
}

export function StudentGuard() {
  const { data, isLoading } = useQuery({ queryKey: ["auth", "me"], queryFn: api.getMe, retry: false });
  if (isLoading) return <div className="loading-screen">Loading…</div>;
  if (data?.data.role !== "student") return <Navigate to="/admin/students" replace />;
  return <Outlet />;
}
