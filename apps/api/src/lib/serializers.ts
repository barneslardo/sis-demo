import type { Student } from "@prisma/client";
import { redactStudentResponseForScopes, type StudentResponse } from "@sis/shared";

export function toStudentResponse(student: Student): StudentResponse {
  return {
    id: student.id,
    userId: student.userId,
    firstName: student.firstName,
    lastName: student.lastName,
    email: student.email,
    enrollmentDate: student.enrollmentDate,
    enrollmentStatus: student.enrollmentStatus,
    enrolledClasses: student.enrolledClasses as string[],
    financialAid: student.financialAid,
    earnedDegrees: student.earnedDegrees as string[],
    address: student.address,
    zipCode: student.zipCode,
    state: student.state,
    phone: student.phone,
    emergencyContact: student.emergencyContact,
    emergencyContactPhone: student.emergencyContactPhone,
    authorizedPayer: student.authorizedPayer,
    authorizedPayerPhone: student.authorizedPayerPhone,
    authorizedPayerAddress: student.authorizedPayerAddress,
    authorizedPayerZip: student.authorizedPayerZip,
    authorizedPayerState: student.authorizedPayerState,
    authorizedPayerEmail: student.authorizedPayerEmail,
    ada: student.ada,
    createdAt: student.createdAt.toISOString(),
    updatedAt: student.updatedAt.toISOString(),
  };
}

export function toStudentResponseForRequest(
  student: Student,
  scopes: string[],
  callerEmail?: string
): StudentResponse {
  return redactStudentResponseForScopes(toStudentResponse(student), scopes, { callerEmail });
}
