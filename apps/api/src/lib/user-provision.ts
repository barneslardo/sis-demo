import type { User } from "@prisma/client";
import type { UserRole } from "@sis/shared";
import { prisma } from "./prisma.js";

export async function upsertUserFromIdentity(opts: {
  email: string;
  oktaId?: string | null;
  role: UserRole;
  firstName?: string;
  lastName?: string;
}) {
  const byEmail = await prisma.user.findUnique({ where: { email: opts.email } });
  const byOktaId = opts.oktaId
    ? await prisma.user.findUnique({ where: { oktaId: opts.oktaId } })
    : null;

  let user: User;

  if (byOktaId && byEmail && byOktaId.id !== byEmail.id) {
    // Okta-linked account exists under a different email row — prefer the Okta id match.
    user = await prisma.$transaction(async (tx) => {
      const emailStudent = await tx.student.findUnique({ where: { userId: byEmail.id } });
      if (emailStudent) {
        await tx.student.update({
          where: { id: emailStudent.id },
          data: { userId: byOktaId.id, email: opts.email },
        });
      }
      await tx.user.update({
        where: { id: byEmail.id },
        data: {
          email: `archived-${byEmail.id}@sis.local`,
          active: false,
          oktaId: null,
        },
      });
      return tx.user.update({
        where: { id: byOktaId.id },
        data: { email: opts.email, role: opts.role, active: true },
      });
    });
  } else if (byOktaId) {
    user = await prisma.user.update({
      where: { id: byOktaId.id },
      data: {
        email: opts.email,
        role: opts.role,
        active: true,
      },
    });
  } else if (byEmail) {
    user = await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        oktaId: opts.oktaId ?? byEmail.oktaId,
        role: opts.role,
        active: true,
      },
    });
  } else {
    user = await prisma.user.create({
      data: {
        email: opts.email,
        oktaId: opts.oktaId ?? null,
        role: opts.role,
      },
    });
  }

  if (opts.role === "student") {
    const firstName = opts.firstName ?? "Student";
    const lastName = opts.lastName ?? "User";
    const existingStudent =
      (await prisma.student.findUnique({ where: { email: opts.email } })) ??
      (await prisma.student.findFirst({ where: { userId: user.id } }));
    if (!existingStudent) {
      await prisma.student.create({
        data: { userId: user.id, email: opts.email, firstName, lastName },
      });
    } else if (existingStudent.userId !== user.id) {
      await prisma.student.update({
        where: { id: existingStudent.id },
        data: { userId: user.id, email: opts.email, firstName, lastName },
      });
    }
  }

  return user;
}
