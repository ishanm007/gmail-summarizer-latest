import { prisma } from "../lib/prisma";

export async function upsertUser(
  input:
    | string
    | {
        email: string;
        refreshToken?: string;
        aiConsent?: boolean;
        name?: string | null;
        picture?: string | null;
      },
  refreshTokenArg?: string,
  aiConsentArg?: boolean,
) {
  const payload =
    typeof input === "string"
      ? {
          email: input,
          refreshToken: refreshTokenArg,
          aiConsent: aiConsentArg,
          name: undefined,
          picture: undefined,
        }
      : input;

  console.log("userService.upsertUser called", {
    email: payload.email,
    hasRefreshToken: Boolean(payload.refreshToken),
    aiConsent: payload.aiConsent,
    hasName: Boolean(payload.name),
  });

  const user = await prisma.user.upsert({
    where: { email: payload.email },
    update: {
      refreshToken: payload.refreshToken || undefined,
      aiConsent: payload.aiConsent === undefined ? undefined : payload.aiConsent,
      name: payload.name ?? undefined,
      picture: payload.picture ?? undefined,
    },
    create: {
      email: payload.email,
      refreshToken: payload.refreshToken,
      aiConsent: payload.aiConsent || false,
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    },
  });

  console.log("userService.upsertUser completed", {
    email: user.email,
    id: user.id,
    name: (user as any).name,
  });

  return user;
}

export async function getUserByEmail(email: string) {
  console.log("userService.getUserByEmail called", { email });

  const user = await prisma.user.findUnique({
    where: { email },
  });

  console.log("userService.getUserByEmail completed", {
    email,
    found: Boolean(user),
  });

  return user;
}
