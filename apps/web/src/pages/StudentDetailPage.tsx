import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  DCR_CATEGORIES,
  OAuthScopes,
  canAccessScope,
  hasScope,
  type AuthUser,
  type DcrCategoryId,
} from "@sis/shared";
import { api } from "../api";

type TabId = "overview" | DcrCategoryId;

function boolLabel(v: boolean | undefined) {
  if (v === undefined) return "—";
  return v ? "Yes" : "No";
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="detail-field">
      <dt>{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}

function JsonList({ value }: { value: unknown }) {
  if (value == null) return <>—</>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <>—</>;
    return (
      <ul className="detail-list">
        {value.map((item, i) => (
          <li key={i}>{typeof item === "object" ? JSON.stringify(item) : String(item)}</li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return <pre className="detail-json">{JSON.stringify(value, null, 2)}</pre>;
  }
  return <>{String(value)}</>;
}

function PermissionGate({
  allowed,
  staffGroup,
  children,
}: {
  allowed: boolean;
  staffGroup: string;
  children: ReactNode;
}) {
  if (allowed) return <>{children}</>;
  return (
    <div className="permission-denied">
      <h3>Access restricted</h3>
      <p>
        Your Okta group does not include permission to view this dataset. In the demo,{" "}
        <strong>{staffGroup}</strong> staff receive this access via OAuth scope enforcement.
      </p>
    </div>
  );
}

function OverviewPanel({
  student,
  scopes,
}: {
  student: Awaited<ReturnType<typeof api.getStudent>>["data"];
  scopes: string[];
}) {
  return (
    <div className="detail-grid">
      <section className="detail-section">
        <h3>Identity</h3>
        <dl>
          <Field label="First name" value={student.firstName} />
          <Field label="Last name" value={student.lastName} />
          <Field label="Email" value={student.email} />
          <Field label="Phone" value={student.phone} />
        </dl>
      </section>
      <section className="detail-section">
        <h3>Enrollment</h3>
        <dl>
          <Field label="Status" value={student.enrollmentStatus ? "Enrolled" : "Not enrolled"} />
          <Field label="Enrollment date" value={student.enrollmentDate} />
          {canAccessScope(scopes, OAuthScopes.STUDENTS_ACADEMIC) && (
            <>
              <Field label="Classes" value={<JsonList value={student.enrolledClasses} />} />
              <Field label="Degrees earned" value={<JsonList value={student.earnedDegrees} />} />
            </>
          )}
          {canAccessScope(scopes, OAuthScopes.STUDENTS_FINANCIAL) && (
            <Field label="Financial aid (flag)" value={boolLabel(student.financialAid)} />
          )}
          {canAccessScope(scopes, OAuthScopes.STUDENTS_ADA) && (
            <Field label="ADA (flag)" value={boolLabel(student.ada)} />
          )}
        </dl>
      </section>
      <section className="detail-section">
        <h3>Address &amp; emergency</h3>
        <dl>
          <Field label="Address" value={[student.address, student.state, student.zipCode].filter(Boolean).join(", ")} />
          <Field label="Emergency contact" value={student.emergencyContact} />
          <Field label="Emergency phone" value={student.emergencyContactPhone} />
        </dl>
      </section>
      <section className="detail-section">
        <h3>Authorized payer</h3>
        <dl>
          <Field label="Name" value={student.authorizedPayer} />
          <Field label="Email" value={student.authorizedPayerEmail} />
          <Field label="Phone" value={student.authorizedPayerPhone} />
          <Field
            label="Address"
            value={[student.authorizedPayerAddress, student.authorizedPayerState, student.authorizedPayerZip]
              .filter(Boolean)
              .join(", ")}
          />
        </dl>
      </section>
    </div>
  );
}

function DcrPanel({
  categoryId,
  studentId,
  scopes,
}: {
  categoryId: DcrCategoryId;
  studentId: string;
  scopes: string[];
}) {
  const meta = DCR_CATEGORIES.find((c) => c.id === categoryId)!;
  const allowed = canAccessScope(scopes, meta.scope);

  const ferpa = useQuery({
    queryKey: ["student", studentId, "ferpa"],
    queryFn: () => api.getStudentFerpa(studentId),
    enabled: categoryId === "ferpa" && allowed,
    retry: false,
  });
  const financial = useQuery({
    queryKey: ["student", studentId, "financial"],
    queryFn: () => api.getStudentFinancial(studentId),
    enabled: categoryId === "financial" && allowed,
    retry: false,
  });
  const ada = useQuery({
    queryKey: ["student", studentId, "ada"],
    queryFn: () => api.getStudentAda(studentId),
    enabled: categoryId === "ada" && allowed,
    retry: false,
  });
  const disciplinary = useQuery({
    queryKey: ["student", studentId, "disciplinary"],
    queryFn: () => api.getStudentDisciplinary(studentId),
    enabled: categoryId === "disciplinary" && allowed,
    retry: false,
  });
  const counselor = useQuery({
    queryKey: ["student", studentId, "counselor"],
    queryFn: () => api.getStudentCounselorNotes(studentId),
    enabled: categoryId === "counselor" && allowed,
    retry: false,
  });
  const risk = useQuery({
    queryKey: ["student", studentId, "risk"],
    queryFn: () => api.getStudentRisk(studentId),
    enabled: categoryId === "risk" && allowed,
    retry: false,
  });
  const academic = useQuery({
    queryKey: ["student", studentId, "academic"],
    queryFn: () => api.getStudentAcademic(studentId),
    enabled: categoryId === "academic" && allowed,
    retry: false,
  });

  const activeQuery =
    categoryId === "ferpa"
      ? ferpa
      : categoryId === "financial"
        ? financial
        : categoryId === "ada"
          ? ada
          : categoryId === "disciplinary"
            ? disciplinary
            : categoryId === "counselor"
              ? counselor
              : categoryId === "risk"
                ? risk
                : academic;

  return (
    <PermissionGate allowed={allowed} staffGroup={meta.staffGroup}>
      {activeQuery.isLoading && <div className="loading-inline">Loading {meta.label}…</div>}
      {activeQuery.error && (
        <div className="error">{(activeQuery.error as Error).message}</div>
      )}
      {categoryId === "ferpa" && ferpa.data?.data && (
        <div className="detail-grid">
          <section className="detail-section">
            <dl>
              <Field label="FERPA waiver on file" value={boolLabel(ferpa.data.data.ferpaWaiverOnFile)} />
              <Field label="Waiver date" value={ferpa.data.data.ferpaWaiverDate} />
              <Field label="Waiver scope" value={ferpa.data.data.ferpaWaiverScope} />
              <Field label="Directory info opt-out" value={boolLabel(ferpa.data.data.directoryInfoOptOut)} />
              <Field label="Released to" value={<JsonList value={ferpa.data.data.educationRecordsReleasedTo} />} />
              <Field label="Holds" value={<JsonList value={ferpa.data.data.holds} />} />
              <Field label="Notes" value={ferpa.data.data.notes} />
            </dl>
          </section>
        </div>
      )}
      {categoryId === "financial" && financial.data?.data && (
        <div className="detail-grid">
          <section className="detail-section">
            <dl>
              <Field label="Aid status" value={financial.data.data.financialAidStatus} />
              <Field label="FAFSA year" value={financial.data.data.fafsaYear} />
              <Field label="Outstanding balance" value={`$${financial.data.data.outstandingBalance.toFixed(2)}`} />
              <Field label="EFC" value={financial.data.data.expectedFamilyContribution} />
              <Field label="Payment plan" value={boolLabel(financial.data.data.paymentPlan)} />
              <Field label="Last disbursement" value={financial.data.data.lastDisbursementDate} />
              <Field label="Aid package" value={<JsonList value={financial.data.data.aidPackage} />} />
              <Field label="Scholarships" value={<JsonList value={financial.data.data.scholarships} />} />
              <Field label="Holds" value={<JsonList value={financial.data.data.holds} />} />
            </dl>
          </section>
        </div>
      )}
      {categoryId === "ada" && ada.data?.data && (
        <div className="detail-grid">
          <section className="detail-section">
            <dl>
              <Field label="Has accommodations" value={boolLabel(ada.data.data.hasAccommodations)} />
              <Field label="Active accommodations" value={boolLabel(ada.data.data.activeAccommodations)} />
              <Field label="Types" value={<JsonList value={ada.data.data.accommodationTypes} />} />
              <Field label="Diagnosis category" value={ada.data.data.diagnosisCategory} />
              <Field label="Documentation on file" value={boolLabel(ada.data.data.documentationOnFile)} />
              <Field label="Documentation date" value={ada.data.data.documentationDate} />
              <Field label="Coordinator" value={ada.data.data.assignedCoordinator} />
              <Field label="Semester notes" value={ada.data.data.semesterNotes} />
            </dl>
          </section>
        </div>
      )}
      {categoryId === "disciplinary" && disciplinary.data && (
        <div className="detail-section">
          {disciplinary.data.data.length === 0 ? (
            <p className="muted">No disciplinary incidents on file.</p>
          ) : (
            <div className="incident-list">
              {disciplinary.data.data.map((inc) => (
                <article key={inc.id} className="incident-card">
                  <header>
                    <strong>{inc.incidentType}</strong>
                    <span>{inc.incidentDate}</span>
                  </header>
                  <p>{inc.description}</p>
                  <dl>
                    <Field label="Outcome" value={inc.outcome} />
                    <Field label="Sanction end" value={inc.sanctionEndDate} />
                    <Field label="Hearing officer" value={inc.hearingOfficer} />
                    <Field label="Appealed" value={boolLabel(inc.appealed)} />
                    <Field label="Appeal outcome" value={inc.appealOutcome} />
                  </dl>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
      {categoryId === "counselor" && counselor.data && (
        <div className="detail-section">
          {counselor.data.data.length === 0 ? (
            <p className="muted">No counselor notes on file.</p>
          ) : (
            <div className="incident-list">
              {counselor.data.data.map((note) => (
                <article key={note.id} className="incident-card">
                  <header>
                    <strong>{note.counselorName}</strong>
                    <span>{note.noteDate}</span>
                  </header>
                  <p className="note-meta">
                    {note.counselorType} counselor
                    {note.followUpStatus ? ` · Follow-up: ${note.followUpStatus}` : ""}
                  </p>
                  <p>{note.note}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
      {categoryId === "risk" && risk.data?.data && (
        <div className="detail-grid">
          <section className="detail-section">
            <dl>
              <Field label="Overall risk" value={risk.data.data.overallRiskLevel} />
              <Field label="GPA" value={risk.data.data.gpa} />
              <Field label="GPA trend" value={risk.data.data.gpaTrend} />
              <Field label="Attendance rate" value={`${risk.data.data.attendanceRate}%`} />
              <Field label="Missed assignments" value={risk.data.data.missedAssignments} />
              <Field label="Academic probation" value={boolLabel(risk.data.data.academicProbation)} />
              <Field label="Failing courses" value={<JsonList value={risk.data.data.failingCourses} />} />
              <Field label="Intervention flags" value={<JsonList value={risk.data.data.interventionFlags} />} />
              <Field label="Last assessment" value={risk.data.data.lastAssessmentDate} />
            </dl>
          </section>
        </div>
      )}
      {categoryId === "academic" && academic.data?.data && (
        <div className="detail-grid">
          <section className="detail-section">
            <dl>
              <Field label="Major" value={academic.data.data.major} />
              <Field label="Minor" value={academic.data.data.minor} />
              <Field label="Concentration" value={academic.data.data.concentration} />
              <Field label="Standing" value={academic.data.data.academicStanding} />
              <Field label="GPA" value={academic.data.data.gpa} />
              <Field label="Credits earned" value={academic.data.data.creditHoursEarned} />
              <Field label="Credits required" value={academic.data.data.creditHoursRequired} />
              <Field label="Expected graduation" value={academic.data.data.expectedGraduation} />
              <Field label="Advisor" value={academic.data.data.advisor} />
              <Field label="Current courses" value={<JsonList value={academic.data.data.currentCourses} />} />
              <Field label="Transcript" value={<JsonList value={academic.data.data.transcript} />} />
            </dl>
          </section>
        </div>
      )}
      {allowed && !activeQuery.isLoading && !activeQuery.error && activeQuery.data?.data === null && (
        <p className="muted">No {meta.label.toLowerCase()} record on file for this student.</p>
      )}
    </PermissionGate>
  );
}

export function StudentDetailPage({ user }: { user?: AuthUser }) {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabId>("overview");

  const { data: me } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: api.getMe,
    enabled: !user,
  });
  const authUser = user ?? me?.data;
  const scopes = authUser?.scopes ?? [];

  const { data, isLoading, error } = useQuery({
    queryKey: ["student", id],
    queryFn: () => api.getStudent(id!),
    enabled: Boolean(id),
  });

  if (isLoading || !authUser) return <div className="loading-screen">Loading student…</div>;
  if (error || !data) {
    return (
      <div className="container">
        <div className="error">{(error as Error)?.message ?? "Student not found"}</div>
      </div>
    );
  }

  const student = data.data;
  const canWrite = hasScope(scopes, OAuthScopes.STUDENTS_WRITE) || hasScope(scopes, OAuthScopes.ADMIN);

  const tabs: Array<{ id: TabId; label: string; locked?: boolean; hint?: string }> = [
    { id: "overview", label: "Overview" },
    ...DCR_CATEGORIES.map((cat) => ({
      id: cat.id as TabId,
      label: cat.label,
      locked: !canAccessScope(scopes, cat.scope),
      hint: cat.staffGroup,
    })),
  ];

  return (
    <div className="container">
      <div className="card student-detail">
        <div className="page-header">
          <div>
            <Link className="back-link" to="/admin/students">
              ← Students
            </Link>
            <h1>
              {student.firstName} {student.lastName}
            </h1>
            <p className="subtitle">{student.email}</p>
          </div>
          <div className="header-actions">
            {canWrite && (
              <Link className="btn btn-secondary" to={`/admin/students/${student.id}/edit`}>
                Edit record
              </Link>
            )}
          </div>
        </div>

        {authUser.persona && (
          <p className="persona-banner">
            Signed in as <strong>{authUser.persona}</strong>
            {authUser.groups?.length ? ` (${authUser.groups.join(", ")})` : ""}. Tabs you cannot
            access are locked to match your Okta group scopes.
          </p>
        )}

        <div className="detail-tabs" role="tablist" aria-label="Student record sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`detail-tab${tab === t.id ? " active" : ""}${t.locked ? " locked" : ""}`}
              onClick={() => setTab(t.id)}
              title={t.locked ? `Requires ${t.hint} group access` : undefined}
            >
              {t.label}
              {t.locked && <span className="lock-icon" aria-hidden="true">🔒</span>}
            </button>
          ))}
        </div>

        <div className="detail-panel" role="tabpanel">
          {tab === "overview" ? (
            <OverviewPanel student={student} scopes={scopes} />
          ) : (
            <DcrPanel categoryId={tab} studentId={student.id} scopes={scopes} />
          )}
        </div>
      </div>
    </div>
  );
}
