import { prisma } from "../lib/prisma";

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

function stringifyArray(value?: string[]) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

function normalizeCategory(category?: string) {
  const allowed = [
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

  const normalized = String(category || "PERSONAL").toUpperCase();

  return allowed.includes(normalized) ? normalized : "PERSONAL";
}

function normalizePriority(priority?: string) {
  const allowed = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const normalized = String(priority || "LOW").toUpperCase();

  return allowed.includes(normalized) ? normalized : "LOW";
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

  // IMPORTANT:
  // This must come from the email-list/category pipeline whenever available.
  // Do not let the summary panel silently re-classify into a different tag.
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
    // Keep old UI/backend compatibility because some files still read `urgency`.
    urgency: priorityLevel,
    priorityReason: data.priorityReason ?? null,
    whyReceived: data.whyReceived ?? null,

    sentiment: data.sentiment ?? "NEUTRAL",

    // Prisma schema expects String?, so keep date as a string.
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
