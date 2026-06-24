import { prisma } from "../lib/prisma";

const ALLOWED_CATEGORIES = [
  "WORK",
  "SHOPPING",
  "FINANCE",
  "PROMOTIONS",
  "PERSONAL",
  "SPAM",
  "ATTENTION_NEEDED",
  "UNIVERSITY",
  "SECURITY",
  "TRAVEL",
  "NEWSLETTER",
  "SOCIAL",
  "GITHUB",
];

const ALLOWED_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export async function findSavedSummary(
  userId: string,
  gmailMessageId: string,
): Promise<any> {
  return prisma.emailSummary.findUnique({
    where: {
      userId_gmailMessageId: {
        userId,
        gmailMessageId,
      },
    },
  });
}

export async function findSavedSummariesByMessageIds(
  userId: string,
  gmailMessageIds: string[],
): Promise<Map<string, any>> {
  const uniqueIds = Array.from(new Set(gmailMessageIds.filter(Boolean)));

  if (uniqueIds.length === 0) {
    return new Map();
  }

  const summaries = await prisma.emailSummary.findMany({
    where: {
      userId,
      gmailMessageId: {
        in: uniqueIds,
      },
    },
  });

  return new Map(
    summaries.map((summary) => [summary.gmailMessageId, summary]),
  );
}

export async function getSavedSummaryMessageIdSet(
  userId: string,
  gmailMessageIds: string[],
): Promise<Set<string>> {
  const uniqueIds = Array.from(new Set(gmailMessageIds.filter(Boolean)));

  if (uniqueIds.length === 0) {
    return new Set();
  }

  const summaries = await prisma.emailSummary.findMany({
    where: {
      userId,
      gmailMessageId: {
        in: uniqueIds,
      },
    },
    select: {
      gmailMessageId: true,
    },
  });

  return new Set(summaries.map((summary) => summary.gmailMessageId));
}

function stringifyArray(value?: string[]) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

function normalizeCategory(category?: string) {
  const normalized = String(category || "PERSONAL").toUpperCase();
  return ALLOWED_CATEGORIES.includes(normalized) ? normalized : "PERSONAL";
}

function normalizePriority(priority?: string) {
  const normalized = String(priority || "LOW").toUpperCase();
  return ALLOWED_PRIORITIES.includes(normalized) ? normalized : "LOW";
}

export async function saveEmailSummary(data: {
  userId: string;
  gmailMessageId: string;

  from: string;
  subject: string;
  snippet: string;

  title?: string;
  overview?: string;
  summary: string;

  category: string;

  actionItems?: string[];
  keyDates?: string[];
  keyTakeaways?: string[];
  importantDetails?: string[];
  keyNumbers?: string[];
  people?: string[];
  companies?: string[];
  links?: string[];

  priorityLevel?: string;
  priorityReason?: string;
  whyReceived?: string;

  sentiment?: string;
  date?: string | null;
}) {
  const priorityLevel = normalizePriority(data.priorityLevel);

  const payload = {
    from: data.from,
    subject: data.subject,
    snippet: data.snippet,

    title: data.title ?? null,
    overview: data.overview ?? null,
    summary: data.summary,

    category: normalizeCategory(data.category),

    actionItems: stringifyArray(data.actionItems),
    keyDates: stringifyArray(data.keyDates),
    keyTakeaways: stringifyArray(data.keyTakeaways),
    importantDetails: stringifyArray(data.importantDetails),
    keyNumbers: stringifyArray(data.keyNumbers),
    people: stringifyArray(data.people),
    companies: stringifyArray(data.companies),
    links: stringifyArray(data.links),

    priorityLevel,
    urgency: priorityLevel,

    priorityReason: data.priorityReason ?? null,
    whyReceived: data.whyReceived ?? null,
    sentiment: data.sentiment ?? "NEUTRAL",

    date: data.date ? String(data.date) : null,
  };

  return prisma.emailSummary.upsert({
    where: {
      userId_gmailMessageId: {
        userId: data.userId,
        gmailMessageId: data.gmailMessageId,
      },
    },
    update: payload,
    create: {
      userId: data.userId,
      gmailMessageId: data.gmailMessageId,
      ...payload,
    },
  });
}

export function saveEmailSummaryInBackground(data: Parameters<typeof saveEmailSummary>[0]) {
  void saveEmailSummary(data).catch((error) => {
    console.error(`[Background Summary Save Error] ${data.subject}:`, error);
  });
}