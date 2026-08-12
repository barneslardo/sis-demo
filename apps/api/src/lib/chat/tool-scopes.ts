import { OAuthScopes, type OAuthScope } from "@sis/shared";
import type { SisToolName } from "./sis-tools.js";

/** OAuth scopes required to invoke each chat tool (admin scope satisfies all). */
export const TOOL_REQUIRED_SCOPES: Record<SisToolName, OAuthScope[]> = {
  list_students: [OAuthScopes.STUDENTS_READ, OAuthScopes.ADMIN],
  search_students: [OAuthScopes.STUDENTS_READ, OAuthScopes.ADMIN],
  list_high_risk_students: [OAuthScopes.STUDENTS_RISK, OAuthScopes.ADMIN],
  get_student: [OAuthScopes.STUDENTS_READ, OAuthScopes.ADMIN],
  create_student: [OAuthScopes.STUDENTS_WRITE, OAuthScopes.ADMIN],
  create_student_with_records: [OAuthScopes.ADMIN],
  update_student: [OAuthScopes.STUDENTS_WRITE, OAuthScopes.ADMIN],
  get_student_ferpa: [OAuthScopes.STUDENTS_FERPA, OAuthScopes.ADMIN],
  upsert_student_ferpa: [OAuthScopes.STUDENTS_FERPA, OAuthScopes.ADMIN],
  get_student_financial: [OAuthScopes.STUDENTS_FINANCIAL, OAuthScopes.ADMIN],
  upsert_student_financial: [OAuthScopes.STUDENTS_FINANCIAL, OAuthScopes.ADMIN],
  get_student_ada: [OAuthScopes.STUDENTS_ADA, OAuthScopes.ADMIN],
  upsert_student_ada: [OAuthScopes.STUDENTS_ADA, OAuthScopes.ADMIN],
  get_student_disciplinary: [OAuthScopes.STUDENTS_DISCIPLINARY, OAuthScopes.ADMIN],
  add_student_disciplinary_incident: [OAuthScopes.STUDENTS_DISCIPLINARY, OAuthScopes.ADMIN],
  get_student_counselor_notes: [OAuthScopes.STUDENTS_COUNSELOR, OAuthScopes.ADMIN],
  add_student_counselor_note: [OAuthScopes.STUDENTS_COUNSELOR, OAuthScopes.ADMIN],
  get_student_risk: [OAuthScopes.STUDENTS_RISK, OAuthScopes.ADMIN],
  upsert_student_risk: [OAuthScopes.STUDENTS_RISK, OAuthScopes.ADMIN],
  get_student_academic: [OAuthScopes.STUDENTS_ACADEMIC, OAuthScopes.ADMIN],
  upsert_student_academic: [OAuthScopes.STUDENTS_ACADEMIC, OAuthScopes.ADMIN],
};
