import { prisma } from "../lib/prisma";

export async function upsertUser(email: string, refreshToken?: string, aiConsent?: boolean) {
  console.log("userService.upsertUser called", { email, hasRefreshToken: Boolean(refreshToken), aiConsent });

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      refreshToken: refreshToken || undefined,
      aiConsent: aiConsent === undefined ? undefined : aiConsent,
    },
    create: {
      email,
      refreshToken,
      aiConsent: aiConsent || false,
    },
  });

  console.log("userService.upsertUser completed", { email: user.email, id: user.id });
  return user;
}

export async function getUserByEmail(email: string) {
  console.log("userService.getUserByEmail called", { email });

  const user = await prisma.user.findUnique({
    where: { email }
  });

  console.log("userService.getUserByEmail completed", { email, found: Boolean(user) });
  return user;
}