import type { AuthUser, StudentResponse } from "@sis/shared";

/** API base URL; empty = same origin (Vite dev proxy or nginx in production). */
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

function chatAbortSignal(): AbortSignal | undefined {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(180_000);
  }
  return undefined;
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
      ...init,
    });
  } catch (err) {
    const hint =
      apiUrl(path).startsWith("http") && typeof window !== "undefined"
        ? " Check that the API is reachable and CORS allows this site."
        : "";
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request timed out.${hint}`);
    }
    throw new Error(
      err instanceof Error ? `${err.message}${hint}` : `Network error.${hint}`
    );
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getAuthConfig: () => fetchJson<{ data: { oidc: boolean } }>("/auth/config"),
  getMe: () => fetchJson<{ data: AuthUser }>("/auth/me"),
  logout: () => fetchJson<{ data: { ok: boolean } }>("/auth/logout", { method: "POST" }),
  devLogin: (
    email: string,
    role: "admin" | "student",
    persona?: string
  ) =>
    fetchJson<{ data: AuthUser }>("/auth/dev/login", {
      method: "POST",
      body: JSON.stringify({ email, role, persona }),
    }),
  devLogout: () => fetchJson<{ data: { ok: boolean } }>("/auth/dev/logout", { method: "POST" }),
  listStudents: (params: { page?: number; limit?: number; search?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.search) qs.set("search", params.search);
    return fetchJson<{ data: StudentResponse[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(
      `/api/v1/students?${qs}`
    );
  },
  getStudent: (id: string) => fetchJson<{ data: StudentResponse }>(`/api/v1/students/${id}`),
  getMyProfile: () => fetchJson<{ data: StudentResponse }>("/api/v1/students/me"),
  createStudent: (data: Record<string, unknown>) =>
    fetchJson<{ data: StudentResponse }>("/api/v1/students", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateStudent: (id: string, data: Record<string, unknown>) =>
    fetchJson<{ data: StudentResponse }>(`/api/v1/students/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteStudent: (id: string) =>
    fetchJson<void>(`/api/v1/students/${id}`, { method: "DELETE" }),
  getStudentFerpa: (id: string) =>
    fetchJson<{ data: StudentFerpaRecord | null }>(`/api/v1/students/${id}/ferpa`),
  getStudentFinancial: (id: string) =>
    fetchJson<{ data: StudentFinancialRecord | null }>(`/api/v1/students/${id}/financial`),
  getStudentAda: (id: string) =>
    fetchJson<{ data: StudentAdaRecord | null }>(`/api/v1/students/${id}/ada`),
  getStudentDisciplinary: (id: string) =>
    fetchJson<{ data: StudentDisciplinaryRecord[] }>(`/api/v1/students/${id}/disciplinary`),
  getStudentCounselorNotes: (id: string) =>
    fetchJson<{ data: StudentCounselorNoteRecord[] }>(`/api/v1/students/${id}/counselor-notes`),
  getStudentRisk: (id: string) =>
    fetchJson<{ data: StudentRiskRecord | null }>(`/api/v1/students/${id}/risk`),
  getStudentAcademic: (id: string) =>
    fetchJson<{ data: StudentAcademicRecord | null }>(`/api/v1/students/${id}/academic`),
  getChatModels: () => fetchJson<{ data: Array<{ id: string; label: string; provider: string }> }>("/api/v1/chat/models"),
  sendChat: (body: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    provider?: string;
  }) =>
    fetchJson<{ data: { content: string; model: string; provider: string } }>("/api/v1/chat", {
      method: "POST",
      body: JSON.stringify(body),
      signal: chatAbortSignal(),
    }),
};

export type StudentFerpaRecord = {
  id: string;
  studentId: string;
  ferpaWaiverOnFile: boolean;
  ferpaWaiverDate: string;
  ferpaWaiverScope: string;
  educationRecordsReleasedTo: unknown[];
  directoryInfoOptOut: boolean;
  holds: unknown[];
  notes: string;
};

export type StudentFinancialRecord = {
  id: string;
  studentId: string;
  financialAidStatus: string;
  aidPackage: Record<string, unknown>;
  expectedFamilyContribution: number;
  outstandingBalance: number;
  paymentPlan: boolean;
  scholarships: unknown[];
  holds: unknown[];
  fafsaYear: string;
  lastDisbursementDate: string;
};

export type StudentAdaRecord = {
  id: string;
  studentId: string;
  hasAccommodations: boolean;
  accommodationTypes: unknown[];
  diagnosisCategory: string;
  documentationOnFile: boolean;
  documentationDate: string;
  assignedCoordinator: string;
  activeAccommodations: boolean;
  semesterNotes: string;
};

export type StudentDisciplinaryRecord = {
  id: string;
  studentId: string;
  incidentDate: string;
  incidentType: string;
  description: string;
  outcome: string;
  sanctionEndDate: string;
  hearingOfficer: string;
  appealed: boolean;
  appealOutcome: string;
};

export type StudentCounselorNoteRecord = {
  id: string;
  studentId: string;
  counselorName: string;
  counselorType: string;
  noteDate: string;
  note: string;
  followUpDate: string;
  followUpStatus: string;
};

export type StudentRiskRecord = {
  id: string;
  studentId: string;
  overallRiskLevel: string;
  gpa: number;
  gpaTrend: string;
  attendanceRate: number;
  missedAssignments: number;
  failingCourses: unknown[];
  academicProbation: boolean;
  interventionFlags: unknown[];
  lastAssessmentDate: string;
};

export type StudentAcademicRecord = {
  id: string;
  studentId: string;
  major: string;
  minor: string;
  concentration: string;
  academicStanding: string;
  gpa: number;
  creditHoursEarned: number;
  creditHoursRequired: number;
  expectedGraduation: string;
  advisor: string;
  transcript: unknown[];
  currentCourses: unknown[];
};
