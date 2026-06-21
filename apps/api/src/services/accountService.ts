import { prisma } from "../lib/prisma";

export async function upsertAccount(data: {
  userId: string;
  provider: string;
  providerAccountId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
}) {
  const account = await (prisma as any).account.upsert({
    where: {
      provider_providerAccountId: {
        provider: data.provider,
        providerAccountId: data.providerAccountId,
      },
    },
    update: {
      accessToken: data.accessToken || undefined,
      refreshToken: data.refreshToken || undefined,
      userId: data.userId,
    },
    create: {
      userId: data.userId,
      provider: data.provider,
      providerAccountId: data.providerAccountId,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    },
  });

  return account;
}
