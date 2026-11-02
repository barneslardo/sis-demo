import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { canDecideAdmissions, hasScope, OAuthScopes } from "@sis/shared";
import { api, type ApplicantRecord, type ApplicantStatus } from "../api";

const TABS: { status: ApplicantStatus; label: string }[] = [
  { status: "pending", label: "Pending" },
  { status: "approved", label: "Approved" },
  { status: "denied", label: "Denied" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "—";
}

export function ApplicantsPage() {
  const [status, setStatus] = useState<ApplicantStatus>("pending");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const queryClient = useQueryClient();

  const { data: me } = useQuery({ queryKey: ["auth", "me"], queryFn: api.getMe });
  const canDecide = me ? canDecideAdmissions(me.data.email, me.data.groups ?? []) : false;
  const canRemove = hasScope(me?.data.scopes ?? [], OAuthScopes.ADMIN);

  const { data, isLoading, error } = useQuery({
    queryKey: ["applicants", status],
    queryFn: () => api.listApplicants(status),
    refetchInterval: 15_000,
    // Keep counts + rows on screen while switching tabs.
    placeholderData: keepPreviousData,
  });

  const onResult = (applicant: ApplicantRecord, oktaOk: boolean, oktaMessage?: string) => {
    queryClient.invalidateQueries({ queryKey: ["applicants"] });
    queryClient.invalidateQueries({ queryKey: ["students"] });
    const name = `${applicant.firstName} ${applicant.lastName}`;
    if (!oktaOk) {
      setNotice({ kind: "error", text: `${name} ${applicant.status}, but the Okta update failed: ${oktaMessage}` });
    } else if (applicant.status === "approved") {
      setNotice({ kind: "ok", text: `${name} admitted as ${applicant.universityEmail}. Okta will move them to Students.` });
    } else {
      setNotice({ kind: "ok", text: `${name} ${applicant.status}.` });
    }
  };

  const decide = useMutation({
    mutationFn: (vars: { id: string; decision: "approve" | "deny" }) =>
      api.decideApplicant(vars.id, vars.decision),
    onSuccess: ({ data: applicant, oktaSync }) =>
      onResult(applicant, oktaSync.ok, "error" in oktaSync ? oktaSync.error : !oktaSync.ok ? oktaSync.reason : undefined),
    onError: (err) => setNotice({ kind: "error", text: (err as Error).message }),
  });

  const retry = useMutation({
    mutationFn: (id: string) => api.retryApplicantOktaSync(id),
    onSuccess: ({ data: applicant, oktaSync }) =>
      onResult(applicant, oktaSync.ok, "error" in oktaSync ? oktaSync.error : !oktaSync.ok ? oktaSync.reason : undefined),
    onError: (err) => setNotice({ kind: "error", text: (err as Error).message }),
  });

  const remove = useMutation({
    mutationFn: (a: ApplicantRecord) => api.removeApplicant(a.id),
    onSuccess: ({ data }, a) => {
      queryClient.invalidateQueries({ queryKey: ["applicants"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      setNotice({
        kind: "ok",
        text: `Removed ${a.firstName} ${a.lastName}${data.removedStudentId ? ` and student ${a.universityEmail}` : ""} from the SIS.`,
      });
    },
    onError: (err) => setNotice({ kind: "error", text: (err as Error).message }),
  });

  const busyId = decide.isPending
    ? decide.variables?.id
    : retry.isPending
      ? retry.variables
      : remove.isPending
        ? remove.variables?.id
        : undefined;
  const applicants = data?.data ?? [];
  const counts = data?.meta;

  return (
    <div className="container">
      <div className="card">
        <div className="page-header">
          <div>
            <h1>Admissions</h1>
            <p className="subtitle">
              Applicants provisioned from Okta after Google sign-up and profile completion.
            </p>
          </div>
        </div>

        <div className="tab-bar" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.status}
              role="tab"
              aria-selected={status === tab.status}
              className={`tab ${status === tab.status ? "tab-active" : ""}`}
              onClick={() => {
                setStatus(tab.status);
                setNotice(null);
              }}
            >
              {tab.label}
              {counts && <span className="tab-count">{counts[tab.status]}</span>}
            </button>
          ))}
        </div>

        {notice && <div className={notice.kind === "ok" ? "notice-ok" : "error"}>{notice.text}</div>}
        {!canDecide && status === "pending" && (
          <p className="muted">Only Enrollment Counselors and Enrollment Admins can approve or deny.</p>
        )}

        {isLoading ? (
          <div className="loading-screen">Loading applicants…</div>
        ) : error ? (
          <div className="error">{(error as Error).message}</div>
        ) : applicants.length === 0 ? (
          <p className="muted empty-state">No {status} applicants.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Program</th>
                  <th>Entry term</th>
                  <th>High school</th>
                  <th>{status === "pending" ? "Applied" : "Decided"}</th>
                  <th>{status === "approved" ? "University account" : "Decision"}</th>
                </tr>
              </thead>
              <tbody>
                {applicants.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>
                        {a.firstName} {a.lastName}
                      </strong>
                      <div className="muted">{a.personalEmail}</div>
                      {a.phone && <div className="muted">{a.phone}</div>}
                      {!a.active && <span className="status-chip status-denied">Withdrawn</span>}
                    </td>
                    <td>{a.intendedProgramLabel || "—"}</td>
                    <td>{capitalize(a.entryTerm)}</td>
                    <td>{a.highSchool || "—"}</td>
                    <td>
                      {status === "pending" ? formatDate(a.appliedAt) : formatDate(a.decidedAt)}
                      {status !== "pending" && a.decidedBy && <div className="muted">{a.decidedBy}</div>}
                    </td>
                    <td>
                      {status === "pending" ? (
                        <div className="decision-toggle" role="group" aria-label="Admission decision">
                          <button
                            className="decision-approve"
                            disabled={!canDecide || !a.active || busyId === a.id}
                            onClick={() => {
                              if (confirm(`Approve ${a.firstName} ${a.lastName}? This creates their student record and university account.`)) {
                                decide.mutate({ id: a.id, decision: "approve" });
                              }
                            }}
                          >
                            Approve
                          </button>
                          <button
                            className="decision-deny"
                            disabled={!canDecide || !a.active || busyId === a.id}
                            onClick={() => {
                              if (confirm(`Deny ${a.firstName} ${a.lastName}?`)) {
                                decide.mutate({ id: a.id, decision: "deny" });
                              }
                            }}
                          >
                            Deny
                          </button>
                        </div>
                      ) : (
                        <DecisionCell
                          applicant={a}
                          canRetry={canDecide}
                          busy={busyId === a.id}
                          onRetry={() => retry.mutate(a.id)}
                        />
                      )}
                      {canRemove && (
                        <button
                          className="btn btn-danger btn-sm remove-applicant"
                          disabled={busyId === a.id}
                          onClick={() => {
                            const extra = a.studentId
                              ? ` and the student record ${a.universityEmail}`
                              : "";
                            if (
                              confirm(
                                `Remove ${a.firstName} ${a.lastName}${extra} from the SIS?\n\nThis is a demo reset. Okta is not changed — delete the Okta user separately.`
                              )
                            ) {
                              remove.mutate(a);
                            }
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DecisionCell(props: {
  applicant: ApplicantRecord;
  canRetry: boolean;
  busy: boolean;
  onRetry: () => void;
}) {
  const { applicant: a } = props;
  const sync = a.oktaSync;
  return (
    <div className="decision-cell">
      {a.status === "approved" ? (
        <>
          <span className="status-chip status-approved">Admitted</span>
          <div>{a.universityEmail}</div>
          <div className="muted">Student # {a.studentNumber}</div>
          {a.studentId && (
            <Link className="btn btn-secondary btn-sm" to={`/admin/students/${a.studentId}`}>
              Student record
            </Link>
          )}
        </>
      ) : (
        <span className="status-chip status-denied">Denied</span>
      )}
      {sync?.ok ? (
        <div className="muted">Okta updated {new Date(sync.at).toLocaleTimeString()}</div>
      ) : (
        <div className="okta-sync-failed">
          Okta not updated{sync && "error" in sync ? `: ${sync.error}` : sync && "reason" in sync ? `: ${sync.reason}` : ""}
          {props.canRetry && (
            <button className="btn btn-secondary btn-sm" disabled={props.busy} onClick={props.onRetry}>
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
