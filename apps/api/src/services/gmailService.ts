import { google } from "googleapis";
import { oauth2Client } from "../config/google";
import { prisma } from "../lib/prisma";

export type EmailItem = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  body?: string;
  unsubscribeAvailable?: boolean;
};

export type UnsubscribeResult = {
  success: boolean;
  message: string;
  senderEmail: string;
  senderName: string;
  unsubscribedByHeader: boolean;
  blockedLabelName: string;
  affectedMessages: number;
};

const BLOCKED_LABEL_NAME = "GmailSummarizerBlocked";

async function isAlreadySummarized(
  userId: string | undefined,
  gmailMessageId: string,
) {
  if (!userId) return false;

  const existing = await prisma.emailSummary.findUnique({
    where: {
      userId_gmailMessageId: {
        userId,
        gmailMessageId,
      },
    },
  });

  return Boolean(existing);
}

function getHeaderValue(
  headers: { name?: string | null; value?: string | null }[],
  headerName: string,
  fallback: string,
) {
  return (
    headers.find(
      (header) => header.name?.toLowerCase() === headerName.toLowerCase(),
    )?.value || fallback
  );
}

function extractEmailAddress(from: string) {
  const angleMatch = from.match(/<([^>]+)>/);
  if (angleMatch?.[1]) return angleMatch[1].trim().toLowerCase();

  const plainMatch = from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (plainMatch?.[0]) return plainMatch[0].trim().toLowerCase();

  return from.trim().toLowerCase();
}

function extractSenderName(from: string) {
  const withoutEmail = from.replace(/<[^>]+>/g, "").trim();
  return withoutEmail.replace(/^"|"$/g, "").trim() || extractEmailAddress(from);
}

function hasUnsubscribeHeader(
  headers: { name?: string | null; value?: string | null }[],
) {
  return Boolean(
    getHeaderValue(headers, "List-Unsubscribe", "") ||
      getHeaderValue(headers, "List-Unsubscribe-Post", ""),
  );
}

function blockedSearchExclusion() {
  return `-label:${BLOCKED_LABEL_NAME}`;
}

function decodeBase64Url(data?: string | null) {
  if (!data) return "";

  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function cleanEmailBody(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\[image:[^\]]+\]/gi, "")
    .replace(/unsubscribe\s*\|\s*view in browser/gi, "")
    .trim()
    .slice(0, 18000);
}

function extractTextFromPayload(payload: any): string {
  if (!payload) return "";

  const mimeType = String(payload.mimeType || "").toLowerCase();
  const bodyData = payload.body?.data;

  if (bodyData) {
    const decoded = decodeBase64Url(bodyData);

    if (mimeType.includes("text/plain")) {
      return decoded;
    }

    if (mimeType.includes("text/html")) {
      return htmlToText(decoded);
    }
  }

  const parts = payload.parts || [];
  if (!Array.isArray(parts) || parts.length === 0) return "";

  const plainParts: string[] = [];
  const htmlParts: string[] = [];

  for (const part of parts) {
    const extracted = extractTextFromPayload(part);
    const partMime = String(part?.mimeType || "").toLowerCase();

    if (!extracted) continue;

    if (partMime.includes("text/plain")) {
      plainParts.push(extracted);
    } else if (partMime.includes("text/html")) {
      htmlParts.push(extracted);
    } else {
      plainParts.push(extracted);
    }
  }

  return plainParts.join("\n\n") || htmlParts.join("\n\n");
}

async function getOrCreateBlockedLabel() {
  const gmail = google.gmail({
    version: "v1",
    auth: oauth2Client,
  });

  const labelsResponse = await gmail.users.labels.list({ userId: "me" });

  const existing = labelsResponse.data.labels?.find(
    (label) => label.name === BLOCKED_LABEL_NAME,
  );

  if (existing?.id) return existing;

  const created = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: BLOCKED_LABEL_NAME,
      labelListVisibility: "labelHide",
      messageListVisibility: "hide",
    },
  });

  if (!created.data.id) {
    throw new Error("Failed to create blocked sender label");
  }

  return created.data;
}

async function getEmailMetadata(
  messageId: string,
  options: { includeBody?: boolean } = {},
): Promise<EmailItem> {
  const gmail = google.gmail({
    version: "v1",
    auth: oauth2Client,
  });

  const email = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: options.includeBody ? "full" : "metadata",
    metadataHeaders: [
      "From",
      "Subject",
      "Date",
      "List-Unsubscribe",
      "List-Unsubscribe-Post",
    ],
  });

  const headers = email.data.payload?.headers || [];
  const rawDate = getHeaderValue(headers, "Date", "");
  let parsedDate = "";

  if (rawDate) {
    const dateObj = new Date(rawDate);
    if (!Number.isNaN(dateObj.getTime())) parsedDate = dateObj.toISOString();
  }

  if (!parsedDate && email.data.internalDate) {
    parsedDate = new Date(parseInt(email.data.internalDate, 10)).toISOString();
  }

  if (!parsedDate) parsedDate = new Date().toISOString();

  const body = options.includeBody
    ? cleanEmailBody(extractTextFromPayload(email.data.payload) || email.data.snippet || "")
    : undefined;

  return {
    id: messageId,
    from: getHeaderValue(headers, "From", "Unknown sender"),
    subject: getHeaderValue(headers, "Subject", "No Subject"),
    snippet: email.data.snippet || "",
    date: parsedDate,
    body,
    unsubscribeAvailable: hasUnsubscribeHeader(headers),
  };
}

export async function getFullEmailById(messageId: string): Promise<EmailItem> {
  return getEmailMetadata(messageId, { includeBody: true });
}

export async function getUnreadEmails(
  page = 1,
  limit = 20,
  userId?: string,
): Promise<{ emails: EmailItem[]; hasNext: boolean }> {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const fetchSize = Math.max(limit * page, 100);

  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: fetchSize,
    q: `is:unread -in:trash ${blockedSearchExclusion()}`,
  });

  const messages = response.data.messages || [];
  const filtered: EmailItem[] = [];

  for (const message of messages) {
    if (!message.id) continue;

    const alreadySummarized = await isAlreadySummarized(userId, message.id);
    if (alreadySummarized) continue;

    const email = await getEmailMetadata(message.id);
    filtered.push(email);
  }

  const start = (page - 1) * limit;
  const end = start + limit;

  return {
    emails: filtered.slice(start, end),
    hasNext: end < filtered.length,
  };
}

export async function getRecentEmails(
  limit = 20,
  userId?: string,
): Promise<EmailItem[]> {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: 50,
    q: `-in:trash ${blockedSearchExclusion()}`,
  });

  const messages = response.data.messages || [];
  const emails: EmailItem[] = [];

  for (const message of messages) {
    if (!message.id) continue;

    const alreadySummarized = await isAlreadySummarized(userId, message.id);
    if (alreadySummarized) continue;

    const email = await getEmailMetadata(message.id);
    emails.push(email);

    if (emails.length >= limit) break;
  }

  return emails;
}

export async function searchGmailEmails(
  query: string,
  limit = 20,
  userId?: string,
): Promise<EmailItem[]> {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const safeQuery = query.trim();

  if (!safeQuery) return [];

  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: 100,
    q: `${safeQuery} -in:trash ${blockedSearchExclusion()}`,
  });

  const messages = response.data.messages || [];
  const emails: EmailItem[] = [];

  for (const message of messages) {
    if (!message.id) continue;

    const alreadySummarized = await isAlreadySummarized(userId, message.id);
    if (alreadySummarized) continue;

    const email = await getEmailMetadata(message.id);
    emails.push(email);

    if (emails.length >= limit) break;
  }

  return emails;
}

export async function unsubscribeFromEmail(
  messageId: string,
): Promise<UnsubscribeResult> {
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const message = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: [
      "From",
      "Subject",
      "List-Unsubscribe",
      "List-Unsubscribe-Post",
    ],
  });

  const headers = message.data.payload?.headers || [];
  const fromHeader = getHeaderValue(headers, "From", "Unknown sender");
  const senderEmail = extractEmailAddress(fromHeader);
  const senderName = extractSenderName(fromHeader);
  const unsubscribedByHeader = hasUnsubscribeHeader(headers);

  if (!senderEmail || !senderEmail.includes("@")) {
    throw new Error("Could not detect sender email address");
  }

  const blockedLabel = await getOrCreateBlockedLabel();
  if (!blockedLabel.id) throw new Error("Blocked label was not available");

  try {
    await gmail.users.settings.filters.create({
      userId: "me",
      requestBody: {
        criteria: { from: senderEmail },
        action: {
          addLabelIds: [blockedLabel.id],
          removeLabelIds: ["INBOX"],
        },
      },
    });
  } catch (error: any) {
    const messageText = String(error?.message || error);
    if (!/already exists|duplicate/i.test(messageText)) {
      console.error("[Create Gmail Filter Error]", error);
    }
  }

  const matchingMessagesResponse = await gmail.users.messages.list({
    userId: "me",
    maxResults: 500,
    q: `from:${senderEmail} -in:trash`,
  });

  const messageIds =
    matchingMessagesResponse.data.messages
      ?.map((item) => item.id)
      .filter((id): id is string => Boolean(id)) || [];

  if (messageIds.length > 0) {
    await gmail.users.messages.batchModify({
      userId: "me",
      requestBody: {
        ids: messageIds,
        addLabelIds: [blockedLabel.id],
        removeLabelIds: ["INBOX", "UNREAD"],
      },
    });
  }

  return {
    success: true,
    senderEmail,
    senderName,
    unsubscribedByHeader,
    blockedLabelName: BLOCKED_LABEL_NAME,
    affectedMessages: messageIds.length,
    message: unsubscribedByHeader
      ? `Blocked future emails from ${senderEmail}. This sender also provides an unsubscribe header, but Gmail API does not expose a safe universal one-click unsubscribe endpoint, so the app blocked the sender in Gmail instead.`
      : `Blocked future emails from ${senderEmail}. Future messages from this sender will skip your Gmail Inbox and will not appear in this app.`,
  };
}
