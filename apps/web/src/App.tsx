import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AuthProvider, AdminGuard, StudentGuard, StaffWriteGuard } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { StudentListPage } from "./pages/StudentListPage";
import { StudentFormPage } from "./pages/StudentFormPage";
import { StudentDetailPage } from "./pages/StudentDetailPage";
import { ProfilePage } from "./pages/ProfilePage";
import { api } from "./api";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AuthProvider />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route element={<AdminGuard />}>
          <Route path="/admin/students" element={<StudentListPage />} />
          <Route element={<StaffWriteGuard />}>
            <Route path="/admin/students/new" element={<StudentFormPage />} />
            <Route path="/admin/students/:id/edit" element={<StudentFormPage />} />
          </Route>
          <Route path="/admin/students/:id" element={<StudentDetailPage />} />
        </Route>
        <Route element={<StudentGuard />}>
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>
    </Routes>
  );
}

function HomeRedirect() {
  const { data, isLoading } = useQuery({ queryKey: ["auth", "me"], queryFn: api.getMe, retry: false });
  if (isLoading) return <div className="loading-screen">Loading…</div>;
  return <Navigate to={data?.data.role === "admin" ? "/admin/students" : "/profile"} replace />;
}
