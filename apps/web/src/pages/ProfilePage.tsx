import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { StudentResponse } from "@sis/shared";

const FIELD_LABELS: Record<keyof Omit<StudentResponse, "id" | "userId" | "createdAt" | "updatedAt">, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  email: "Email",
  enrollmentDate: "Enrollment Date",
  enrollmentStatus: "Enrollment Status",
  enrolledClasses: "Enrolled Classes",
  financialAid: "Financial Aid",
  earnedDegrees: "Earned Degrees",
  address: "Address",
  zipCode: "Zip Code",
  state: "State",
  phone: "Phone",
  emergencyContact: "Emergency Contact",
  emergencyContactPhone: "Emergency Contact Phone",
  authorizedPayer: "Authorized Payer",
  authorizedPayerPhone: "Authorized Payer Phone",
  authorizedPayerAddress: "Authorized Payer Address",
  authorizedPayerZip: "Authorized Payer Zip",
  authorizedPayerState: "Authorized Payer State",
  authorizedPayerEmail: "Authorized Payer Email",
  ada: "ADA Accommodations",
};

function formatValue(_key: string, value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === "" || value == null) return "—";
  return String(value);
}

export function ProfilePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", "me"],
    queryFn: api.getMyProfile,
  });

  if (isLoading) return <div className="loading-screen">Loading profile…</div>;
  if (error) return <div className="container"><div className="error">{(error as Error).message}</div></div>;

  const student = data!.data;

  return (
    <div className="container">
      <div className="card">
        <h1>My Profile</h1>
        <p className="subtitle" style={{ marginBottom: "1.25rem" }}>
          {student.firstName} {student.lastName} — read-only view
        </p>
        <dl className="profile-grid">
          {(Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>).map((key) => (
            <div key={key} className="profile-field">
              <dt>{FIELD_LABELS[key]}</dt>
              <dd>{formatValue(key, student[key])}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
