import { PrismaClient } from "@prisma/client";
import { demoAdminEmails } from "@sis/shared";

const prisma = new PrismaClient();

const sampleStudents = [
  {
    email: "alice.johnson@university.edu",
    firstName: "Alice",
    lastName: "Johnson",
    enrollmentDate: "2023-09-01",
    enrollmentStatus: true,
    enrolledClasses: ["CS101", "MATH201", "ENG102"],
    financialAid: true,
    earnedDegrees: [],
    address: "123 Campus Dr",
    zipCode: "10001",
    state: "NY",
    phone: "555-0101",
    emergencyContact: "Mary Johnson",
    emergencyContactPhone: "555-0102",
    authorizedPayer: "Mary Johnson",
    authorizedPayerPhone: "555-0102",
    authorizedPayerAddress: "123 Campus Dr",
    authorizedPayerZip: "10001",
    authorizedPayerState: "NY",
    authorizedPayerEmail: "mary.j@email.com",
    ada: false,
  },
  {
    email: "bob.smith@university.edu",
    firstName: "Bob",
    lastName: "Smith",
    enrollmentDate: "2022-09-01",
    enrollmentStatus: true,
    enrolledClasses: ["PHYS301", "CHEM201"],
    financialAid: false,
    earnedDegrees: ["Associate of Science"],
    address: "456 Oak Ave",
    zipCode: "90210",
    state: "CA",
    phone: "555-0201",
    emergencyContact: "John Smith",
    emergencyContactPhone: "555-0202",
    authorizedPayer: "John Smith",
    authorizedPayerPhone: "555-0202",
    authorizedPayerAddress: "456 Oak Ave",
    authorizedPayerZip: "90210",
    authorizedPayerState: "CA",
    authorizedPayerEmail: "john.s@email.com",
    ada: true,
  },
  {
    email: "carol.williams@university.edu",
    firstName: "Carol",
    lastName: "Williams",
    enrollmentDate: "2024-01-15",
    enrollmentStatus: true,
    enrolledClasses: ["BIO101", "PSY101"],
    financialAid: true,
    earnedDegrees: [],
    address: "789 Pine St",
    zipCode: "60601",
    state: "IL",
    phone: "555-0301",
    emergencyContact: "Jane Williams",
    emergencyContactPhone: "555-0302",
    authorizedPayer: "Jane Williams",
    authorizedPayerPhone: "555-0302",
    authorizedPayerAddress: "789 Pine St",
    authorizedPayerZip: "60601",
    authorizedPayerState: "IL",
    authorizedPayerEmail: "jane.w@email.com",
    ada: false,
  },
  {
    email: "david.brown@university.edu",
    firstName: "David",
    lastName: "Brown",
    enrollmentDate: "2021-09-01",
    enrollmentStatus: false,
    enrolledClasses: [],
    financialAid: false,
    earnedDegrees: ["Bachelor of Science"],
    address: "321 Elm Blvd",
    zipCode: "77001",
    state: "TX",
    phone: "555-0401",
    emergencyContact: "Susan Brown",
    emergencyContactPhone: "555-0402",
    authorizedPayer: "David Brown",
    authorizedPayerPhone: "555-0401",
    authorizedPayerAddress: "321 Elm Blvd",
    authorizedPayerZip: "77001",
    authorizedPayerState: "TX",
    authorizedPayerEmail: "david.brown@university.edu",
    ada: false,
  },
  {
    email: "eva.davis@university.edu",
    firstName: "Eva",
    lastName: "Davis",
    enrollmentDate: "2024-09-01",
    enrollmentStatus: true,
    enrolledClasses: ["ART101", "HIST201", "MUS101"],
    financialAid: true,
    earnedDegrees: [],
    address: "654 Maple Rd",
    zipCode: "98101",
    state: "WA",
    phone: "555-0501",
    emergencyContact: "Tom Davis",
    emergencyContactPhone: "555-0502",
    authorizedPayer: "Tom Davis",
    authorizedPayerPhone: "555-0502",
    authorizedPayerAddress: "654 Maple Rd",
    authorizedPayerZip: "98101",
    authorizedPayerState: "WA",
    authorizedPayerEmail: "tom.d@email.com",
    ada: true,
  },
];

async function main() {
  console.log("Seeding database...");

  const admin1 = await prisma.user.upsert({
    where: { email: "admin@university.edu" },
    update: {},
    create: { email: "admin@university.edu", role: "admin" },
  });

  const admin2 = await prisma.user.upsert({
    where: { email: "registrar@university.edu" },
    update: {},
    create: { email: "registrar@university.edu", role: "admin" },
  });

  for (const email of demoAdminEmails()) {
    await prisma.user.upsert({
      where: { email },
      update: { role: "admin", active: true },
      create: { email, role: "admin" },
    });
  }

  for (const studentData of sampleStudents) {
    const user = await prisma.user.upsert({
      where: { email: studentData.email },
      update: {},
      create: { email: studentData.email, role: "student" },
    });

    const student = await prisma.student.upsert({
      where: { email: studentData.email },
      update: {
        ...studentData,
        userId: user.id,
        enrolledClasses: studentData.enrolledClasses,
        earnedDegrees: studentData.earnedDegrees,
      },
      create: {
        ...studentData,
        userId: user.id,
        enrolledClasses: studentData.enrolledClasses,
        earnedDegrees: studentData.earnedDegrees,
      },
    });

    await prisma.studentFerpa.upsert({
      where: { studentId: student.id },
      update: {},
      create: {
        studentId: student.id,
        ferpaWaiverOnFile: studentData.financialAid,
        ferpaWaiverDate: studentData.enrollmentDate,
        ferpaWaiverScope: "parents",
        directoryInfoOptOut: false,
      },
    });

    await prisma.studentFinancial.upsert({
      where: { studentId: student.id },
      update: {},
      create: {
        studentId: student.id,
        financialAidStatus: studentData.financialAid ? "active" : "none",
        outstandingBalance: studentData.financialAid ? 1200 : 0,
        fafsaYear: "2024-25",
      },
    });

    await prisma.studentAda.upsert({
      where: { studentId: student.id },
      update: {},
      create: {
        studentId: student.id,
        hasAccommodations: studentData.ada,
        accommodationTypes: studentData.ada ? ["extended_time"] : [],
        assignedCoordinator: studentData.ada ? "Jordan Lee" : "",
      },
    });

    await prisma.studentRisk.upsert({
      where: { studentId: student.id },
      update: {},
      create: {
        studentId: student.id,
        overallRiskLevel: studentData.enrollmentStatus ? "low" : "high",
        gpa: studentData.enrollmentStatus ? 3.2 : 1.8,
        attendanceRate: studentData.enrollmentStatus ? 92 : 61,
      },
    });

    await prisma.studentAcademic.upsert({
      where: { studentId: student.id },
      update: {},
      create: {
        studentId: student.id,
        major: "Undeclared",
        academicStanding: studentData.enrollmentStatus ? "good" : "probation",
        gpa: studentData.enrollmentStatus ? 3.2 : 1.8,
        currentCourses: studentData.enrolledClasses,
      },
    });
  }

  const alice = await prisma.student.findUnique({ where: { email: "alice.johnson@university.edu" } });
  if (alice) {
    await prisma.studentCounselorNote.create({
      data: {
        studentId: alice.id,
        counselorName: "Dr. James Whitfield",
        counselorType: "academic",
        noteDate: "2024-10-01",
        note: "Discussed course load and time management strategies.",
        followUpStatus: "completed",
      },
    });
    await prisma.studentDisciplinary.create({
      data: {
        studentId: alice.id,
        incidentDate: "2023-11-15",
        incidentType: "academic_integrity",
        description: "Late assignment submission policy review.",
        outcome: "warning",
        hearingOfficer: "Dean Martinez",
      },
    });
  }

  console.log(
    `Seeded ${sampleStudents.length} students (with DCR records) and 2 admins (${admin1.email}, ${admin2.email})`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
