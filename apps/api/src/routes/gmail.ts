import express from "express";
import {
  getUnreadEmails,
  getRecentEmails,
  searchGmailEmails,
  unsubscribeFromEmail,
  getFullEmailById,
} from "../services/gmailService";
import {
  classifyEmailCategory,
  summarizeAndClassifyEmail,
  summarizeWeeklyEmails,
  EmailCategory,
  UserProfileContext,
} from "../services/openaiService";
import { getUserByEmail } from "../services/userService";
import { findSavedSummary, saveEmailSummary } from "../services/summaryService";
import {
  canSummarizeToday,
  incrementTodayUsage,
  getTodayUsage,
  getDailyLimitByPlan,
} from "../services/usageService";

const router = express.Router();

type Email = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date?: string;
  category?: EmailCategory;
};

function formatGmailDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}/${month}/${day}`;
}

function getCurrentWeekRange() {
  const today = new Date();

  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  return {
    startDate: formatGmailDate(monday),
    endDate: formatGmailDate(tomorrow),
  };
}

function parseSavedArray(value: unknown): string[] {
  if (!value || typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
      : [];
  } catch {
    return [];
  }
}

function stringifyArray(value: string[]) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

function cleanStoredSummary(summary: unknown) {
  if (typeof summary !== "string") return "";

  const trimmed = summary.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("{") && trimmed.includes('"summary"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed.summary === "string" && parsed.summary.trim()) {
        return parsed.summary.trim();
      }
    } catch {
      // Keep original text below if it is not valid JSON.
    }
  }

  return trimmed;
}

function getDisplayUsageCount(usedToday: number, dailyLimit: number | null) {
  if (dailyLimit === null) return usedToday;
  return Math.min(usedToday, dailyLimit);
}


function parseJsonArray(value: unknown): string[] {
  if (!value || typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
      : [];
  } catch {
    return [];
  }
}

function normalizeDomain(domain: string) {
  return domain.trim().toLowerCase().replace(/^@+/, "").replace(/^www\./, "");
}

function extractEmailAddress(from: string) {
  const angleMatch = from.match(/<([^>]+)>/);
  if (angleMatch?.[1]) return angleMatch[1].trim().toLowerCase();

  const plainMatch = from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (plainMatch?.[0]) return plainMatch[0].trim().toLowerCase();

  return "";
}

function extractDomainFromFrom(from: string) {
  const email = extractEmailAddress(from);
  const domain = email.split("@")[1] || "";
  return normalizeDomain(domain);
}

function isGenericPersonalDomain(domain: string) {
  return [
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
    "icloud.com",
    "proton.me",
    "protonmail.com",
    "aol.com",
  ].includes(normalizeDomain(domain));
}

function profileToContext(profile: any): UserProfileContext | undefined {
  if (!profile) return undefined;

  return {
    role: profile.role,
    roleLabel: profile.roleLabel,
    organizationName: profile.organizationName,
    businessName: profile.businessName,
    priorities: parseJsonArray(profile.priorities),
    newsletterPreference: profile.newsletterPreference,
    workDomains: parseJsonArray(profile.workDomains),
    studyDomains: parseJsonArray(profile.studyDomains),
    newsletterDomains: parseJsonArray(profile.newsletterDomains),
    ignoredDomains: parseJsonArray(profile.ignoredDomains),
  };
}

async function getUserProfileContext(userId: string) {
  const { prisma } = await import("../lib/prisma");
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  return profileToContext(profile);
}

async function getOrCreateUserProfile(userId: string) {
  const { prisma } = await import("../lib/prisma");

  return prisma.userProfile.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

function profileResponse(profile: any) {
  return {
    id: profile.id,
    role: profile.role,
    roleLabel: profile.roleLabel,
    organizationName: profile.organizationName,
    businessName: profile.businessName,
    priorities: parseJsonArray(profile.priorities),
    newsletterPreference: profile.newsletterPreference,
    workDomains: parseJsonArray(profile.workDomains),
    studyDomains: parseJsonArray(profile.studyDomains),
    newsletterDomains: parseJsonArray(profile.newsletterDomains),
    ignoredDomains: parseJsonArray(profile.ignoredDomains),
    onboardingCompleted: Boolean(profile.onboardingCompleted),
  };
}


function looksLikeNewsletter(email: { from?: string | null; subject?: string | null; snippet?: string | null; summary?: string | null }) {
  const text = `${email.from || ""} ${email.subject || ""} ${email.snippet || ""} ${email.summary || ""}`.toLowerCase();

  return /\b(newsletter|daily digest|weekly digest|weekly roundup|daily brief|morning brief|substack|medium daily digest|featured stories|read more|view in browser)\b/i.test(text)
    || /\b(substack|medium|beehiiv|mailchimp|convertkit|ghost\.io|newsletter|digest|noreply|no-reply)\b/i.test(String(email.from || ""));
}

function normalizeStoredUrgency(category: EmailCategory | string | null | undefined, urgency: string | null | undefined, email?: { from?: string | null; subject?: string | null; snippet?: string | null; summary?: string | null }) {
  if (email && looksLikeNewsletter(email)) return "LOW";
  if (category === "SPAM" || category === "PROMOTIONS" || category === "PERSONAL") return "LOW";
  if (urgency === "HIGH" || urgency === "MEDIUM" || urgency === "LOW") return urgency;
  return "LOW";
}

function buildCachedSummaryResponse(existingSummary: any) {
  return {
    summary: cleanStoredSummary(existingSummary.summary),
    category: existingSummary.category || "PERSONAL",
    actionItems: parseSavedArray(existingSummary.actionItems),
    keyDates: parseSavedArray(existingSummary.keyDates),
    keyTakeaways: parseSavedArray(existingSummary.keyTakeaways),
    importantDetails: parseSavedArray(existingSummary.importantDetails),
    keyNumbers: parseSavedArray(existingSummary.keyNumbers),
    people: parseSavedArray(existingSummary.people),
    companies: parseSavedArray(existingSummary.companies),
    links: parseSavedArray(existingSummary.links),
    urgency: normalizeStoredUrgency(existingSummary.category, existingSummary.urgency, existingSummary),
  };
}

async function attachSummaryData(userId: string, emails: Email[]) {
  const userProfile = await getUserProfileContext(userId);

  return Promise.all(
    emails.map(async (email) => {
      try {
        const savedSummary = await findSavedSummary(userId, email.id);
        let category: EmailCategory = "PERSONAL";

        try {
          category = await classifyEmailCategory(email, userProfile);
          console.log(`[Classification] ${email.subject} -> ${category}`);
        } catch (error) {
          console.error(`[Classification Error] ${email.subject}:`, error);
          category = (savedSummary?.category as EmailCategory) || "PERSONAL";
        }

        if (savedSummary) {
          const correctedUrgency = normalizeStoredUrgency(category, savedSummary.urgency, {
            ...email,
            summary: savedSummary.summary,
          });

          if (savedSummary.category !== category || savedSummary.urgency !== correctedUrgency) {
            try {
              const { prisma } = await import("../lib/prisma");
              await prisma.emailSummary.update({
                where: { id: savedSummary.id },
                data: {
                  category,
                  urgency: correctedUrgency,
                },
              });
            } catch (error) {
              console.error(`[Saved Category/Urgency Update Error] ${email.subject}:`, error);
            }
          }
        }

        return {
          ...email,
          category,
          hasSummary: Boolean(savedSummary),
          savedSummary: savedSummary?.summary ? cleanStoredSummary(savedSummary.summary) : null,
        };
      } catch (error) {
        console.error(`[attachSummaryData Error] ${email.subject}:`, error);
        return {
          ...email,
          category: "PERSONAL",
          hasSummary: false,
          savedSummary: null,
        };
      }
    }),
  );
}

router.get("/emails", async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const page = Math.max(parseInt(String(req.query.page || "1"), 10) || 1, 1);

    const result = await getUnreadEmails(page, 20, user.id);
    const inboxEmails = result.emails || [];
    const hasNext = Boolean(result.hasNext);

    const emailsWithSummaryData = await attachSummaryData(user.id, inboxEmails);

    return res.json({
      success: true,
      count: emailsWithSummaryData.length,
      page,
      perPage: 20,
      hasNext,
      emails: emailsWithSummaryData,
    });
  } catch (error) {
    console.error("Fetch emails error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch emails",
    });
  }
});


router.get("/past-emails", async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const emails = await getRecentEmails(20, user.id);
    const emailsWithSummaryData = await attachSummaryData(user.id, emails);

    return res.json({
      success: true,
      count: emailsWithSummaryData.length,
      emails: emailsWithSummaryData,
    });
  } catch (error) {
    console.error("Fetch past emails error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch past emails",
    });
  }
});

router.get("/weekly-report", async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { startDate, endDate } = getCurrentWeekRange();

    const gmailQuery = `after:${startDate} before:${endDate}`;

    const emails = await searchGmailEmails(gmailQuery, 50, user.id);

    const fullEmails = await Promise.all(
      emails.map((email) => getFullEmailById(email.id)),
    );

    const report = await summarizeWeeklyEmails(
      fullEmails.map((email) => ({
        from: email.from,
        subject: email.subject,
        snippet: email.snippet,
        body: email.body || email.snippet,
      })),
    );

    return res.json({
      success: true,
      range: {
        from: startDate,
        to: endDate,
      },
      totalEmails: emails.length,
      emails,
      report,
    });
  } catch (error) {
    console.error("Weekly report error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate weekly report",
    });
  }
});


router.post("/email/unsubscribe", async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const messageId = String(req.body?.id || "").trim();

    if (!messageId) {
      return res.status(400).json({
        success: false,
        message: "Email id is required",
      });
    }

    const result = await unsubscribeFromEmail(messageId);

    return res.json({
      ...result,
      success: Boolean(result.success ?? true),
    });
  } catch (error) {
    console.error("Unsubscribe email error:", error);

    return res.status(500).json({
      success: false,
      message:
        "Failed to unsubscribe/block this sender. Please re-login with Google if you recently upgraded Gmail permissions.",
    });
  }
});

router.get("/summary", async (req, res) => {
  return res.status(400).json({
    success: false,
    message:
      "Bulk summary is disabled. Use /email/summary to summarize one selected email only.",
  });
});

router.post("/email/summary", async (req, res) => {
  try {
    const email = req.body;
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!email?.id || !email?.from || !email?.subject) {
      return res.status(400).json({
        success: false,
        message: "Email data is required",
      });
    }

    const userProfile = await getUserProfileContext(user.id);

    const existingSummary = await findSavedSummary(user.id, email.id);
    if (existingSummary) {
      const cleanedSummary = cleanStoredSummary(existingSummary.summary);
      let correctedCategory = (existingSummary.category as EmailCategory) || "PERSONAL";

      try {
        correctedCategory = await classifyEmailCategory(email, userProfile);
      } catch (error) {
        console.error(`[Cached Summary Classification Error] ${email.subject}:`, error);
      }

      if (cleanedSummary !== existingSummary.summary || correctedCategory !== existingSummary.category) {
        try {
          const { prisma } = await import("../lib/prisma");
          await prisma.emailSummary.update({
            where: { id: existingSummary.id },
            data: {
              summary: cleanedSummary,
              category: correctedCategory,
            },
          });
          existingSummary.summary = cleanedSummary;
          existingSummary.category = correctedCategory;
        } catch (error) {
          console.error(`[Cached Summary Cleanup Error] ${email.subject}:`, error);
        }
      }

      return res.json({
        success: true,
        cached: true,
        countedUsage: false,
        email,
        ...buildCachedSummaryResponse(existingSummary),
      });
    }

    const allowed = await canSummarizeToday(user.id, user.plan);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message:
          "Free limit reached. You can summarize 10 emails per day. Upgrade to Pro for unlimited summaries.",
      });
    }

    const fullEmail = await getFullEmailById(email.id);

    const {
      summary,
      category,
      actionItems,
      keyDates,
      keyTakeaways,
      importantDetails,
      keyNumbers,
      people,
      companies,
      links,
      urgency,
    } = await summarizeAndClassifyEmail(
      {
        from: fullEmail.from || email.from,
        subject: fullEmail.subject || email.subject,
        snippet: fullEmail.snippet || email.snippet || "",
        body: fullEmail.body || fullEmail.snippet || email.snippet || "",
      },
      userProfile,
    );

    await saveEmailSummary({
      userId: user.id,
      gmailMessageId: email.id,
      from: fullEmail.from || email.from,
      subject: fullEmail.subject || email.subject,
      snippet: fullEmail.snippet || email.snippet || "",
      summary,
      category,
      date: fullEmail.date || email.date,
    });

    const { prisma } = await import("../lib/prisma");

    await prisma.emailSummary.updateMany({
      where: {
        userId: user.id,
        gmailMessageId: email.id,
      },
      data: {
        actionItems: stringifyArray(actionItems),
        keyDates: stringifyArray(keyDates),
        keyTakeaways: stringifyArray(keyTakeaways),
        importantDetails: stringifyArray(importantDetails),
        keyNumbers: stringifyArray(keyNumbers),
        people: stringifyArray(people),
        companies: stringifyArray(companies),
        links: stringifyArray(links),
        urgency,
      },
    });

    const latestUsage = await getTodayUsage(user.id);
    const dailyLimit = getDailyLimitByPlan(user.plan);

    if (dailyLimit === null || (latestUsage?.count || 0) < dailyLimit) {
      await incrementTodayUsage(user.id);
    }

    return res.json({
      success: true,
      cached: false,
      countedUsage: true,
      email,
      summary,
      category,
      actionItems,
      keyDates,
      keyTakeaways,
      importantDetails,
      keyNumbers,
      people,
      companies,
      links,
      urgency,
    });
  } catch (error) {
    console.error("Single summary error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to summarize email",
    });
  }
});


router.get("/onboarding/profile", async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const profile = await getOrCreateUserProfile(user.id);

    return res.json({
      success: true,
      profile: profileResponse(profile),
    });
  } catch (error) {
    console.error("Fetch onboarding profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch onboarding profile",
    });
  }
});

router.post("/onboarding/profile", async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { prisma } = await import("../lib/prisma");
    const body = req.body || {};

    const profile = await prisma.userProfile.upsert({
      where: { userId: user.id },
      update: {
        role: String(body.role || "NOT_SET"),
        roleLabel: body.roleLabel ? String(body.roleLabel) : null,
        organizationName: body.organizationName ? String(body.organizationName) : null,
        businessName: body.businessName ? String(body.businessName) : null,
        priorities: stringifyArray(Array.isArray(body.priorities) ? body.priorities : []),
        newsletterPreference: String(body.newsletterPreference || "PERSONAL"),
        onboardingCompleted: Boolean(body.onboardingCompleted),
      },
      create: {
        userId: user.id,
        role: String(body.role || "NOT_SET"),
        roleLabel: body.roleLabel ? String(body.roleLabel) : null,
        organizationName: body.organizationName ? String(body.organizationName) : null,
        businessName: body.businessName ? String(body.businessName) : null,
        priorities: stringifyArray(Array.isArray(body.priorities) ? body.priorities : []),
        newsletterPreference: String(body.newsletterPreference || "PERSONAL"),
        onboardingCompleted: Boolean(body.onboardingCompleted),
      },
    });

    return res.json({
      success: true,
      profile: profileResponse(profile),
    });
  } catch (error) {
    console.error("Save onboarding profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save onboarding profile",
    });
  }
});

router.get("/onboarding/domain-suggestions", async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const emails = await searchGmailEmails("newer_than:90d", 100, user.id);
    const counts = new Map<string, number>();

    for (const email of emails) {
      const domain = extractDomainFromFrom(email.from || "");
      if (!domain || isGenericPersonalDomain(domain)) continue;
      counts.set(domain, (counts.get(domain) || 0) + 1);
    }

    const profile = await getOrCreateUserProfile(user.id);
    const knownDomains = new Set([
      ...parseJsonArray(profile.workDomains),
      ...parseJsonArray(profile.studyDomains),
      ...parseJsonArray(profile.newsletterDomains),
      ...parseJsonArray(profile.ignoredDomains),
    ].map(normalizeDomain));

    const suggestions = Array.from(counts.entries())
      .filter(([domain]) => !knownDomains.has(normalizeDomain(domain)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([domain, count]) => ({ domain, count }));

    return res.json({ success: true, suggestions });
  } catch (error) {
    console.error("Domain suggestions error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to detect domain suggestions",
    });
  }
});

router.post("/onboarding/domain-labels", async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { prisma } = await import("../lib/prisma");
    const labels = Array.isArray(req.body?.labels) ? req.body.labels : [];
    const profile = await getOrCreateUserProfile(user.id);

    const workDomains = new Set(parseJsonArray(profile.workDomains).map(normalizeDomain));
    const studyDomains = new Set(parseJsonArray(profile.studyDomains).map(normalizeDomain));
    const newsletterDomains = new Set(parseJsonArray(profile.newsletterDomains).map(normalizeDomain));
    const ignoredDomains = new Set(parseJsonArray(profile.ignoredDomains).map(normalizeDomain));

    for (const label of labels) {
      const domain = normalizeDomain(String(label?.domain || ""));
      const type = String(label?.type || "").toUpperCase();
      if (!domain) continue;

      workDomains.delete(domain);
      studyDomains.delete(domain);
      newsletterDomains.delete(domain);
      ignoredDomains.delete(domain);

      if (type === "WORK") workDomains.add(domain);
      if (type === "STUDY") studyDomains.add(domain);
      if (type === "NEWSLETTER") newsletterDomains.add(domain);
      if (type === "IGNORE") ignoredDomains.add(domain);
    }

    const updated = await prisma.userProfile.update({
      where: { userId: user.id },
      data: {
        workDomains: stringifyArray([...workDomains]),
        studyDomains: stringifyArray([...studyDomains]),
        newsletterDomains: stringifyArray([...newsletterDomains]),
        ignoredDomains: stringifyArray([...ignoredDomains]),
      },
    });

    return res.json({ success: true, profile: profileResponse(updated) });
  } catch (error) {
    console.error("Save domain labels error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save domain labels",
    });
  }
});

router.get("/debug/create-user", async (req, res) => {
  try {
    const user = await getUserByEmail("debug@example.com");
    if (user) {
      return res.json({
        success: true,
        message: "User already exists",
        user,
      });
    }

    const { upsertUser } = await import("../services/userService");
    const newUser = await upsertUser("debug@example.com");

    res.cookie("userId", newUser.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });

    return res.json({
      success: true,
      message: "User created",
      user: newUser,
    });
  } catch (error) {
    console.error("Create debug user error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create user",
    });
  }
});

router.get("/summarized", async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { prisma } = await import("../lib/prisma");

    const summaries = await prisma.emailSummary.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    const cleanedSummaries = await Promise.all(
      summaries.map(async (summary) => {
        const cleanedSummary = cleanStoredSummary(summary.summary);
        let correctedCategory = (summary.category as EmailCategory) || "PERSONAL";

        try {
          correctedCategory = await classifyEmailCategory({
            from: summary.from,
            subject: summary.subject,
            snippet: summary.snippet || cleanedSummary,
          });
        } catch (err) {
          console.error(`[Reclassify Saved Summary Error] ${summary.id}:`, err);
        }

        const correctedUrgency = normalizeStoredUrgency(correctedCategory, summary.urgency, {
          ...summary,
          summary: cleanedSummary,
        });

        if (cleanedSummary !== summary.summary || correctedCategory !== summary.category || correctedUrgency !== summary.urgency) {
          try {
            await prisma.emailSummary.update({
              where: { id: summary.id },
              data: {
                summary: cleanedSummary,
                category: correctedCategory,
                urgency: correctedUrgency,
              },
            });
          } catch (err) {
            console.error(`[Clean Saved Summary Error] ${summary.id}:`, err);
          }
        }

        return {
          ...summary,
          summary: cleanedSummary,
          category: correctedCategory,
          actionItems: summary.actionItems || stringifyArray([]),
          keyDates: summary.keyDates || stringifyArray([]),
          keyTakeaways: summary.keyTakeaways || stringifyArray([]),
          importantDetails: summary.importantDetails || stringifyArray([]),
          keyNumbers: summary.keyNumbers || stringifyArray([]),
          people: summary.people || stringifyArray([]),
          companies: summary.companies || stringifyArray([]),
          links: summary.links || stringifyArray([]),
          urgency: correctedUrgency,
        };
      }),
    );

    return res.json({
      success: true,
      count: cleanedSummaries.length,
      summaries: cleanedSummaries,
    });
  } catch (error) {
    console.error("Fetch summarized emails error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch summarized emails",
    });
  }
});

router.delete("/summary/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { prisma } = await import("../lib/prisma");

    const summary = await prisma.emailSummary.findFirst({
      where: { id, userId: user.id },
    });

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: "Summary not found",
      });
    }

    await prisma.emailSummary.delete({
      where: { id: summary.id },
    });

    return res.json({
      success: true,
      message: "Summary deleted successfully",
    });
  } catch (error) {
    console.error("Delete summary error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete summary",
    });
  }
});

router.get("/usage", async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const usage = await getTodayUsage(user.id);
    const rawUsedToday = usage?.count || 0;
    const dailyLimit = getDailyLimitByPlan(user.plan);
    const usedToday = getDisplayUsageCount(rawUsedToday, dailyLimit);
    const remaining =
      dailyLimit === null ? null : Math.max(dailyLimit - usedToday, 0);

    return res.json({
      success: true,
      plan: user.plan,
      usedToday,
      dailyLimit,
      remaining,
      limitReached: dailyLimit !== null && usedToday >= dailyLimit,
    });
  } catch (error) {
    console.error("Fetch usage error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch usage",
    });
  }
});

router.get("/search", async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!query) {
      return res.json({
        success: true,
        results: [],
      });
    }

    const { prisma } = await import("../lib/prisma");

    const results = await prisma.emailSummary.findMany({
      where: {
        userId: user.id,
        OR: [
          { subject: { contains: query } },
          { from: { contains: query } },
          { snippet: { contains: query } },
          { summary: { contains: query } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      success: true,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error("Search summaries error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to search summaries",
    });
  }
});

router.get("/gmail-search", async (req, res) => {
  try {
    const query = String(req.query.query || "").trim();

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const emails = await searchGmailEmails(query, 20, user.id);
    const emailsWithSummaryData = await attachSummaryData(user.id, emails);

    return res.json({
      success: true,
      emails: emailsWithSummaryData,
    });
  } catch (error) {
    console.error("Gmail search error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to search Gmail",
    });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { prisma } = await import("../lib/prisma");

    const totalSummaries = await prisma.emailSummary.count({
      where: { userId: user.id },
    });

    const usage = await getTodayUsage(user.id);
    const rawUsedToday = usage?.count || 0;
    const dailyLimit = getDailyLimitByPlan(user.plan);
    const usedToday = getDisplayUsageCount(rawUsedToday, dailyLimit);
    const remaining =
      dailyLimit === null ? null : Math.max(dailyLimit - usedToday, 0);

    const unreadResult = await getUnreadEmails(1, 10, user.id);
    const unreadEmails = unreadResult.emails || [];

    return res.json({
      success: true,
      totalSummaries,
      unreadCount: unreadEmails.length,
      plan: user.plan,
      usedToday,
      dailyLimit,
      remaining,
      limitReached: dailyLimit !== null && usedToday >= dailyLimit,
    });
  } catch (error) {
    console.error("Fetch stats error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch stats",
    });
  }
});

export default router;