import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { hasScope, OAuthScopes } from "@sis/shared";
import { api } from "../api";

const defaultForm = {
  firstName: "",
  lastName: "",
  email: "",
  enrollmentDate: "",
  enrollmentStatus: false,
  enrolledClasses: "",
  financialAid: false,
  earnedDegrees: "",
  address: "",
  zipCode: "",
  state: "",
  phone: "",
  emergencyContact: "",
  emergencyContactPhone: "",
  authorizedPayer: "",
  authorizedPayerPhone: "",
  authorizedPayerAddress: "",
  authorizedPayerZip: "",
  authorizedPayerState: "",
  authorizedPayerEmail: "",
  ada: false,
};

export function StudentFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState("");

  const { data: me } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: api.getMe,
  });
  const scopes = me?.data.scopes ?? [];
  const canWriteFinancial =
    hasScope(scopes, OAuthScopes.STUDENTS_FINANCIAL) || hasScope(scopes, OAuthScopes.ADMIN);
  const canWriteAda = hasScope(scopes, OAuthScopes.STUDENTS_ADA) || hasScope(scopes, OAuthScopes.ADMIN);
  const canWriteAcademic =
    hasScope(scopes, OAuthScopes.STUDENTS_ACADEMIC) || hasScope(scopes, OAuthScopes.ADMIN);

  const { data, isLoading } = useQuery({
    queryKey: ["student", id],
    queryFn: () => api.getStudent(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (data?.data) {
      const s = data.data;
      setForm({
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email,
        enrollmentDate: s.enrollmentDate,
        enrollmentStatus: s.enrollmentStatus,
        enrolledClasses: s.enrolledClasses?.join(", ") ?? "",
        financialAid: s.financialAid ?? false,
        earnedDegrees: s.earnedDegrees?.join(", ") ?? "",
        address: s.address,
        zipCode: s.zipCode,
        state: s.state,
        phone: s.phone,
        emergencyContact: s.emergencyContact,
        emergencyContactPhone: s.emergencyContactPhone,
        authorizedPayer: s.authorizedPayer,
        authorizedPayerPhone: s.authorizedPayerPhone,
        authorizedPayerAddress: s.authorizedPayerAddress,
        authorizedPayerZip: s.authorizedPayerZip,
        authorizedPayerState: s.authorizedPayerState,
        authorizedPayerEmail: s.authorizedPayerEmail,
        ada: s.ada ?? false,
      });
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      isEdit ? api.updateStudent(id!, payload) : api.createStudent(payload),
    onSuccess: () => navigate("/admin/students"),
    onError: (err: Error) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      enrolledClasses: form.enrolledClasses.split(",").map((s) => s.trim()).filter(Boolean),
      earnedDegrees: form.earnedDegrees.split(",").map((s) => s.trim()).filter(Boolean),
    };
    mutation.mutate(payload);
  }

  function setField(key: keyof typeof form, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  if (isEdit && isLoading) return <div className="loading-screen">Loading…</div>;

  return (
    <div className="container">
      <div className="card">
        <h1>{isEdit ? "Edit Student" : "New Student"}</h1>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              First Name *
              <input required value={form.firstName} onChange={(e) => setField("firstName", e.target.value)} />
            </label>
            <label>
              Last Name *
              <input required value={form.lastName} onChange={(e) => setField("lastName", e.target.value)} />
            </label>
            <label>
              Email *
              <input required type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} />
            </label>
            <label>
              Enrollment Date
              <input value={form.enrollmentDate} onChange={(e) => setField("enrollmentDate", e.target.value)} />
            </label>
            <label>
              Enrollment Status
              <select
                value={String(form.enrollmentStatus)}
                onChange={(e) => setField("enrollmentStatus", e.target.value === "true")}
              >
                <option value="true">Enrolled</option>
                <option value="false">Not Enrolled</option>
              </select>
            </label>
            {canWriteAcademic && (
              <label>
                Enrolled Classes (comma-separated)
                <input value={form.enrolledClasses} onChange={(e) => setField("enrolledClasses", e.target.value)} />
              </label>
            )}
            {canWriteFinancial && (
              <label>
                Financial Aid
                <select
                  value={String(form.financialAid)}
                  onChange={(e) => setField("financialAid", e.target.value === "true")}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
            )}
            {canWriteAcademic && (
              <label>
                Earned Degrees (comma-separated)
                <input value={form.earnedDegrees} onChange={(e) => setField("earnedDegrees", e.target.value)} />
              </label>
            )}
            <label>
              Address
              <input value={form.address} onChange={(e) => setField("address", e.target.value)} />
            </label>
            <label>
              Zip Code
              <input value={form.zipCode} onChange={(e) => setField("zipCode", e.target.value)} />
            </label>
            <label>
              State
              <input value={form.state} onChange={(e) => setField("state", e.target.value)} />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
            </label>
            <label>
              Emergency Contact
              <input value={form.emergencyContact} onChange={(e) => setField("emergencyContact", e.target.value)} />
            </label>
            <label>
              Emergency Contact Phone
              <input
                value={form.emergencyContactPhone}
                onChange={(e) => setField("emergencyContactPhone", e.target.value)}
              />
            </label>
            <label>
              Authorized Payer
              <input value={form.authorizedPayer} onChange={(e) => setField("authorizedPayer", e.target.value)} />
            </label>
            <label>
              Authorized Payer Phone
              <input
                value={form.authorizedPayerPhone}
                onChange={(e) => setField("authorizedPayerPhone", e.target.value)}
              />
            </label>
            <label>
              Authorized Payer Address
              <input
                value={form.authorizedPayerAddress}
                onChange={(e) => setField("authorizedPayerAddress", e.target.value)}
              />
            </label>
            <label>
              Authorized Payer Zip
              <input value={form.authorizedPayerZip} onChange={(e) => setField("authorizedPayerZip", e.target.value)} />
            </label>
            <label>
              Authorized Payer State
              <input
                value={form.authorizedPayerState}
                onChange={(e) => setField("authorizedPayerState", e.target.value)}
              />
            </label>
            <label>
              Authorized Payer Email
              <input
                type="email"
                value={form.authorizedPayerEmail}
                onChange={(e) => setField("authorizedPayerEmail", e.target.value)}
              />
            </label>
            {canWriteAda && (
              <label>
                ADA Accommodations
                <select value={String(form.ada)} onChange={(e) => setField("ada", e.target.value === "true")}>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
            )}
          </div>

          {error && <div className="error" style={{ marginTop: "1rem" }}>{error}</div>}

          <div className="actions form-actions">
            <button className="btn btn-primary" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save"}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => navigate("/admin/students")}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
