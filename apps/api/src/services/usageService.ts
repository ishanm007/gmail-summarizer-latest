import { prisma } from "../lib/prisma";

const FREE_DAILY_LIMIT = 10;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function getTodayUsage(userId: string) {
  return prisma.dailyUsage.findUnique({
    where: {
      userId_date: {
        userId,
        date: todayKey(),
      },
    },
  });
}

export async function getTodayUsageCount(userId: string) {
  const usage = await getTodayUsage(userId);
  return usage?.count || 0;
}

export async function incrementTodayUsage(userId: string) {
  return prisma.dailyUsage.upsert({
    where: {
      userId_date: {
        userId,
        date: todayKey(),
      },
    },
    update: {
      count: {
        increment: 1,
      },
    },
    create: {
      userId,
      date: todayKey(),
      count: 1,
    },
  });
}

export async function canSummarizeToday(userId: string, plan: string) {
  if (plan === "PRO_PLUS") {
    return true;
  }

  const usage = await getTodayUsage(userId);
  const count = usage?.count || 0;

  if (plan === "PRO") {
    return count < 100;
  }

  return count < 10;
}

export function getDailyLimitByPlan(plan: string) {
  if (plan === "PRO_PLUS") {
    return null;
  }

  if (plan === "PRO") {
    return 100;
  }

  return 10;
}

export async function getUsageStatus(userId: string, plan: "FREE" | "PRO") {
  const usedToday = await getTodayUsageCount(userId);
  const dailyLimit = plan === "PRO" ? null : FREE_DAILY_LIMIT;
  const remaining =
    dailyLimit === null ? null : Math.max(dailyLimit - usedToday, 0);

  return {
    plan,
    usedToday,
    dailyLimit,
    remaining,
    limitReached: dailyLimit !== null && usedToday >= dailyLimit,
  };
}