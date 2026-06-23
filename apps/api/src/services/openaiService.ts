import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type EmailCategory =
  | "WORK"
  | "SHOPPING"
  | "FINANCE"
  | "PROMOTIONS"
  | "PERSONAL"
  | "SPAM"
  | "ATTENTION_NEEDED";

export type EmailUrgency = "LOW" | "MEDIUM" | "HIGH";

type BasicEmail = {
  from: string;
  subject: string;
  snippet: string;
  body?: string;
};

export type UserProfileContext = {
  role?: string | null;
  roleLabel?: string | null;
  organizationName?: string | null;
  businessName?: string | null;
  priorities?: string[];
  newsletterPreference?: string | null;
  workDomains?: string[];
  studyDomains?: string[];
  newsletterDomains?: string[];
  ignoredDomains?: string[];
};

type RuleHit = {
  category: EmailCategory;
  confidence: number;
  reason: string;
};

const CATEGORY_VALUES: EmailCategory[] = [
  "WORK",
  "SHOPPING",
  "FINANCE",
  "PROMOTIONS",
  "PERSONAL",
  "SPAM",
  "ATTENTION_NEEDED",
];

const URGENCY_VALUES: EmailUrgency[] = ["LOW", "MEDIUM", "HIGH"];

const CLASSIFIER_SYSTEM_PROMPT = `
You are an AI email classifier.

Return exactly one category from:
WORK, SHOPPING, FINANCE, PROMOTIONS, PERSONAL, SPAM, ATTENTION_NEEDED.

Important:
- Classify by the actual email content, not only by sender.
- A payment, transaction, receipt, bank, wallet, UPI, debit, credit, refund, invoice, or billing email is FINANCE.
- Marketing/cashback/referral/offer emails from financial or shopping apps are PROMOTIONS.
- Newsletters, digests, Substack/Medium posts, blog updates, creator updates, article briefings, and content recommendations are PERSONAL with LOW urgency, not SPAM or PROMOTIONS, unless they are mainly selling offers/discounts or contain clear scam/phishing indicators.
- Order/delivery/shipping/tracking emails are SHOPPING.
- OTP/KYC/security/account-access/legal/tax/government emails requiring action are ATTENTION_NEEDED.
- Scam, fake prize, phishing, suspicious money request, or lottery emails are SPAM.
- Work/client/project/team/meeting/deadline emails are WORK.
- If the user profile says a sender domain is work/study, use that context unless the email is clearly finance, security/action-required, shopping, spam, or a newsletter.
- Personal direct communication is PERSONAL.

Output only the single category word in UPPERCASE.
`;

const CLASSIFIER_USER_PROMPT = `
Choose exactly one category from:
WORK, SHOPPING, FINANCE, PROMOTIONS, PERSONAL, SPAM, ATTENTION_NEEDED.

Priority rules:
1. FINANCE wins over PROMOTIONS when the email is about a real transaction, payment, UPI, money received/sent, bill, invoice, receipt, refund, debit, credit, wallet balance, or bank statement.
2. ATTENTION_NEEDED wins when the email is about OTP, KYC, account locked, login/security alert, tax, legal, government, compliance, passport, visa, or official action required.
3. SHOPPING wins when it is about an actual order, delivery, shipment, tracking, return, exchange, or purchase.
4. PERSONAL includes normal newsletters, digests, Substack/Medium posts, creator updates, article briefings, blog posts, and content recommendations. These must always be LOW urgency.
5. PROMOTIONS is only for marketing, offers, discounts, cashback offers, refer-and-earn, sales, ads, or app promotional notifications.
6. SPAM is only for suspicious, fake prizes, lottery, phishing, unknown senders asking for money/info, scam links, or clearly unsafe bulk unwanted mail. Normal newsletters/digests are PERSONAL, not SPAM.
7. WORK is projects, teams, clients, meetings, deadlines, tasks, company/business communication.

Return only one uppercase category.
`;

const RICH_SUMMARY_SYSTEM_PROMPT = `
You are an elite executive email assistant.

Your job is NOT to classify the email. The backend has already chosen the category and urgency using deterministic rules.
Your only job is to extract the useful information from the email and explain it clearly.

Return ONLY valid JSON using this exact schema:

{
  "summary": "A useful 70-150 word summary when the email has enough content. Shorter is allowed only for tiny emails.",
  "keyTakeaways": ["Main point 1", "Main point 2"],
  "importantDetails": ["Specific detail user should not miss"],
  "actionItems": ["Specific task the user should do"],
  "keyDates": ["Important date or deadline"],
  "keyNumbers": ["Money, percentages, quantities, IDs, balances, transaction amounts"],
  "people": ["People mentioned"],
  "companies": ["Companies, institutions, apps, or organizations mentioned"],
  "links": ["Important links if present"]
}

Summary quality rules:
- Do NOT output category, urgency, priority, sentiment, or tags.
- Explain what the email actually says. Do not write generic filler like "This email appears to be a newsletter" or "The email discusses".
- Pull out concrete facts, names, amounts, dates, deadlines, transaction IDs, places, policy changes, offers, warnings, and next steps.
- If the email is a newsletter/article, summarize the actual article/news content and its main points.
- If the email is transactional, include amount, sender/receiver, status, ID, balance, and date/time if available.
- If the email is promotional, include the offer, discount, deadline, eligibility, product/service, and limitations.
- If the email is work-related, include who needs what, deadline, meeting/project details, and required response.
- Never invent missing facts. Empty arrays are okay.
- Output JSON only. No markdown.
`;

const WEEKLY_REPORT_SYSTEM_PROMPT = `
You are an AI weekly email report generator.

Return ONLY valid JSON.

Use this exact schema:

{
  "summary": "Overall weekly email summary in 5-8 useful lines.",
  "importantEmails": ["Important email with reason"],
  "actionItems": ["Task user should do"],
  "financeUpdates": ["Finance related update"],
  "shoppingUpdates": ["Shopping or delivery update"],
  "workUpdates": ["Work related update"],
  "promotionsSummary": "Short summary of promotional emails."
}

Rules:
- Summarize only the provided emails.
- Use concrete details from email bodies/snippets.
- Do not invent emails, dates, tasks, or facts.
- Spam and promotions should not be treated as important.
- Important emails should include only finance, work, legal, tax, security, government, or real action-required emails.
- Output JSON only.
`;

function normalizeCategory(raw: string): EmailCategory {
  const normalized = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_ ]+/g, " ")
    .replace(/\s+/g, "_")
    .trim();

  if (CATEGORY_VALUES.includes(normalized as EmailCategory)) {
    return normalized as EmailCategory;
  }

  if (/SPAM|UNWANTED|SCAM|JUNK|BULK|COMMERCIAL|SUSPICIOUS|PHISHING/.test(normalized)) return "SPAM";
  if (/NEWSLETTER|DIGEST|SUBSTACK|MEDIUM|BLOG|ARTICLE|BRIEFING|CREATOR/.test(normalized)) return "PERSONAL";
  if (/PROMO|OFFER|DEAL|SALE|PROMOTION|ADVERTISE|ADVERTISEMENT|AD/.test(normalized)) return "PROMOTIONS";
  if (/SHOP|ORDER|PURCHASE|RECEIPT|DELIVERY|DELIVERED|TRACKING|SHIPMENT/.test(normalized)) return "SHOPPING";
  if (/BILL|INVOICE|PAYMENT|PAID|BANK|STATEMENT|FINANCE|ACCOUNT|REFUND|DEPOSIT|WITHDRAWAL|TRANSFER|SALARY|TRANSACTION|AMOUNT|UPI|DEBIT|CREDIT/.test(normalized)) return "FINANCE";
  if (/ATTENTION|GOVERNMENT|TAX|LEGAL|COMPLIANCE|OFFICIAL|NOTICE|ITR|COURT|SECURITY|KYC|OTP/.test(normalized)) return "ATTENTION_NEEDED";
  if (/WORK|JOB|PROJECT|CLIENT|COLLEAGUE|TEAM|OFFICE|TASK|MEETING|DEADLINE|REPORT|AGENDA/.test(normalized)) return "WORK";

  return "PERSONAL";
}

function normalizeUrgency(raw: unknown): EmailUrgency {
  if (typeof raw !== "string") return "LOW";
  const normalized = raw.trim().toUpperCase();
  if (URGENCY_VALUES.includes(normalized as EmailUrgency)) return normalized as EmailUrgency;
  return "LOW";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getEmailText(email: BasicEmail) {
  return `${email.from || ""} ${email.subject || ""} ${email.snippet || ""} ${email.body || ""}`;
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

function extractSenderDomain(from: string) {
  const emailAddress = extractEmailAddress(from);
  const domain = emailAddress.split("@")[1] || "";
  return normalizeDomain(domain);
}

function domainMatches(senderDomain: string, domains: string[] = []) {
  const normalizedSender = normalizeDomain(senderDomain);
  if (!normalizedSender) return false;

  return domains.some((domain) => {
    const normalized = normalizeDomain(domain);
    return Boolean(normalized) && (normalizedSender === normalized || normalizedSender.endsWith(`.${normalized}`));
  });
}

function buildUserProfilePrompt(profile?: UserProfileContext) {
  if (!profile) return "User profile: Not provided.";

  return `User profile context:
Role: ${profile.roleLabel || profile.role || "Not set"}
Organization / institution: ${profile.organizationName || profile.businessName || "Not set"}
Newsletter preference: ${profile.newsletterPreference || "PERSONAL"}
Priorities: ${(profile.priorities || []).join(", ") || "Not set"}
Work domains confirmed by user: ${(profile.workDomains || []).join(", ") || "None"}
Study domains confirmed by user: ${(profile.studyDomains || []).join(", ") || "None"}
Newsletter domains confirmed by user: ${(profile.newsletterDomains || []).join(", ") || "None"}
Ignored domains confirmed by user: ${(profile.ignoredDomains || []).join(", ") || "None"}

Profile rules:
- If sender domain matches confirmed work domains, classify as WORK unless the content is clearly FINANCE, ATTENTION_NEEDED, SHOPPING, SPAM, or a newsletter.
- If sender domain matches confirmed study domains, classify school/college/exam/assignment/institution emails as ATTENTION_NEEDED when action is required, otherwise PERSONAL.
- If sender domain matches confirmed newsletter domains, classify as PERSONAL with LOW urgency unless it is clearly a scam, payment/security issue, or actual shopping transaction.
- If sender domain matches ignored domains, do not mark it urgent unless it is clearly security/legal/payment failure.
`;
}

function applyProfileRules(email: BasicEmail, profile?: UserProfileContext): RuleHit | null {
  if (!profile) return null;

  const senderDomain = extractSenderDomain(email.from || "");
  if (!senderDomain) return null;

  const lower = getEmailText(email).toLowerCase();

  const criticalPatterns = [
    /\botp\b/i,
    /\bsecurity alert\b/i,
    /\baccount locked\b/i,
    /\bpayment failed\b/i,
    /\bfraud\b/i,
    /\bunauthorized\b/i,
    /\blegal notice\b/i,
    /\btax notice\b/i,
    /\bkyc\b/i,
  ];

  const financeLikePatterns = [
    /\bsalary\b/i,
    /\breimbursement\b/i,
    /\binvoice\b/i,
    /\bpayment\b/i,
    /\bpaid\b/i,
    /\bcredited\b/i,
    /\bdebited\b/i,
    /₹\s?\d+/i,
    /\binr\s?\d+/i,
  ];

  if (domainMatches(senderDomain, profile.newsletterDomains || []) && !hasAny(lower, criticalPatterns)) {
    return { category: "PERSONAL", confidence: 98, reason: "user-confirmed newsletter domain" };
  }

  if (domainMatches(senderDomain, profile.workDomains || [])) {
    if (hasAny(lower, criticalPatterns)) {
      return { category: "ATTENTION_NEEDED", confidence: 98, reason: "critical work-domain alert" };
    }

    if (hasAny(lower, financeLikePatterns)) {
      return { category: "FINANCE", confidence: 94, reason: "finance content from work domain" };
    }

    if (isNewsletterEmail(email)) {
      return { category: "PERSONAL", confidence: 96, reason: "newsletter from work domain" };
    }

    return { category: "WORK", confidence: 97, reason: "user-confirmed work domain" };
  }

  if (domainMatches(senderDomain, profile.studyDomains || [])) {
    if (hasAny(lower, criticalPatterns) || /\b(assignment|exam|deadline|submission|result|admit card|fee due|attendance)\b/i.test(lower)) {
      return { category: "ATTENTION_NEEDED", confidence: 96, reason: "study-domain action item" };
    }

    return { category: "PERSONAL", confidence: 92, reason: "user-confirmed study domain" };
  }

  return null;
}

function getContentForAi(email: BasicEmail) {
  const body = (email.body || "").trim();
  const snippet = (email.snippet || "").trim();
  return body || snippet;
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}


function isNewsletterEmail(email: BasicEmail) {
  const text = getEmailText(email).toLowerCase();
  const sender = (email.from || "").toLowerCase();

  const newsletterSenderPatterns = [
    /substack/i,
    /medium/i,
    /beehiiv/i,
    /mailchimp/i,
    /convertkit/i,
    /ghost\.io/i,
    /newsletter/i,
    /digest/i,
    /noreply/i,
    /no-reply/i,
  ];

  const newsletterContentPatterns = [
    /\bnewsletter\b/i,
    /\bdaily digest\b/i,
    /\bweekly digest\b/i,
    /\bweekly roundup\b/i,
    /\bdaily brief\b/i,
    /\bmorning brief\b/i,
    /\bdigest\b/i,
    /\bsubstack\b/i,
    /\bmedium daily digest\b/i,
    /\bfeatured stories\b/i,
    /\bread more\b/i,
    /\bview in browser\b/i,
  ];

  const strongNonNewsletterPatterns = [
    /\botp\b/i,
    /\bkyc\b/i,
    /\bsecurity alert\b/i,
    /\baccount locked\b/i,
    /\bpayment failed\b/i,
    /\bfraud\b/i,
    /\bunauthorized\b/i,
    /\border (confirmed|shipped|delivered|cancelled)\b/i,
  ];

  return (
    (hasAny(sender, newsletterSenderPatterns) || hasAny(text, newsletterContentPatterns)) &&
    !hasAny(text, strongNonNewsletterPatterns)
  );
}

function classifyByRules(email: BasicEmail, profile?: UserProfileContext): RuleHit {
  const profileHit = applyProfileRules(email, profile);
  if (profileHit) return profileHit;
  const text = getEmailText(email);
  const lower = text.toLowerCase();
  const sender = (email.from || "").toLowerCase();

  const spamPatterns = [
    /\blottery\b/i,
    /\bjackpot\b/i,
    /\bwinner\b/i,
    /\bclaim now\b/i,
    /\bfree gift\b/i,
    /\bcrypto giveaway\b/i,
    /\bearn money fast\b/i,
    /\bclick here immediately\b/i,
    /\bverify your wallet\b/i,
    /\bsend money\b/i,
    /\bscam\b/i,
    /\bphishing\b/i,
    /\bsuspicious link\b/i,
  ];

  const financePatterns = [
    /\bpayment\b.*\b(success|successful|completed|received|sent|done|failed|declined|pending|processed)\b/i,
    /\b(success|successful|completed|failed|declined|pending)\b.*\bpayment\b/i,
    /\bpaid\b/i,
    /\bmoney\b.*\b(received|sent|credited|debited|transferred|added|withdrawn)\b/i,
    /\b(received|sent|credited|debited|transferred|added|withdrawn)\b.*\bmoney\b/i,
    /\bamount\b.*\b(credited|debited|paid|received|sent)\b/i,
    /\b(credited|debited)\b/i,
    /\btransaction\b/i,
    /\btransaction id\b/i,
    /\btxn\b/i,
    /\bupi\b/i,
    /\bwallet\b/i,
    /\bbalance\b/i,
    /\bbank\b/i,
    /\bstatement\b/i,
    /\binvoice\b/i,
    /\bbill\b/i,
    /\bbilling\b/i,
    /\breceipt\b/i,
    /\brefund\b/i,
    /\bsalary\b/i,
    /\bdeposit\b/i,
    /\bwithdrawal\b/i,
    /\bautopay\b/i,
    /\bmandate\b/i,
    /\b₹\s?\d+/i,
    /\brs\.?\s?\d+/i,
    /\binr\s?\d+/i,
  ];

  const attentionPatterns = [
    /\botp\b/i,
    /\bone time password\b/i,
    /\bverification code\b/i,
    /\bverify your account\b/i,
    /\bkyc\b/i,
    /\bpan\b/i,
    /\baadhaar\b/i,
    /\baccount locked\b/i,
    /\baccount suspended\b/i,
    /\bsecurity alert\b/i,
    /\bnew login\b/i,
    /\blogin attempt\b/i,
    /\bpassword reset\b/i,
    /\btax\b/i,
    /\bincome tax\b/i,
    /\bitr\b/i,
    /\bcompliance\b/i,
    /\blegal\b/i,
    /\bcourt\b/i,
    /\bgovernment\b/i,
    /\bofficial notice\b/i,
    /\bpassport\b/i,
    /\bvisa\b/i,
    /\bdeadline to respond\b/i,
    /\baction required\b/i,
  ];

  const shoppingPatterns = [
    /\border\b.*\b(confirmed|placed|shipped|delivered|cancelled|returned|refunded|packed|dispatched)\b/i,
    /\b(order confirmation|order update|order id|order number)\b/i,
    /\b(delivery|delivered|out for delivery|shipment|shipped|tracking|tracking number)\b/i,
    /\b(return request|exchange request)\b/i,
    /\bpackage\b/i,
  ];

  const workPatterns = [
    /\bmeeting\b/i,
    /\bcalendar invite\b/i,
    /\bagenda\b/i,
    /\bproject\b/i,
    /\bclient\b/i,
    /\bdeadline\b/i,
    /\breport\b/i,
    /\bstatus update\b/i,
    /\bfollow up\b/i,
    /\btask assigned\b/i,
    /\bbusiness proposal\b/i,
    /\binterview\b/i,
    /\bjob application\b/i,
    /\bteam\b/i,
    /\boffice\b/i,
  ];

  const promotionPatterns = [
    /\boffer\b/i,
    /\bdiscount\b/i,
    /\bcoupon\b/i,
    /\bsale\b/i,
    /\blimited time\b/i,
    /\bdeal alert\b/i,
    /\bpromo\b/i,
    /\bpromotion\b/i,
    /\badvertisement\b/i,
    /\bmarketing\b/i,
    /\bsave up to\b/i,
    /\bcashback offer\b/i,
    /\breward points\b/i,
    /\brefer\b.*\bearn\b/i,
    /\binvite\b.*\bearn\b/i,
    /\bnew arrivals\b/i,
    /\blast chance\b/i,
    /\bfinal offer\b/i,
  ];

  const financeSenderPatterns = [
    /famapp/i,
    /phonepe/i,
    /paytm/i,
    /gpay/i,
    /googlepay/i,
    /razorpay/i,
    /stripe/i,
    /paypal/i,
    /wise/i,
    /bank/i,
    /hdfc/i,
    /icici/i,
    /axis/i,
    /sbi/i,
    /kotak/i,
  ];

  const shoppingSenderPatterns = [
    /amazon/i,
    /flipkart/i,
    /myntra/i,
    /ajio/i,
    /meesho/i,
    /zomato/i,
    /swiggy/i,
    /uber/i,
    /ola/i,
  ];

  const newsletterSenderPatterns = [
    /substack/i,
    /medium/i,
    /beehiiv/i,
    /mailchimp/i,
    /convertkit/i,
    /ghost\.io/i,
    /newsletter/i,
    /digest/i,
    /noreply/i,
    /no-reply/i,
  ];

  const newsletterContentPatterns = [
    /\bnewsletter\b/i,
    /\bdaily digest\b/i,
    /\bweekly digest\b/i,
    /\bdigest\b/i,
    /\bsubstack\b/i,
    /\bmedium daily digest\b/i,
    /\bfeatured stories\b/i,
    /\bread more\b/i,
    /\bview in browser\b/i,
  ];

  if (hasAny(lower, spamPatterns)) return { category: "SPAM", confidence: 98, reason: "clear spam/scam keywords" };

  if (isNewsletterEmail(email)) {
    const salesOnlyPatterns = [
      /\b(discount|coupon|sale|deal alert|limited time offer|cashback offer|refer.*earn|invite.*earn|buy now|shop now|new arrivals|save up to|final offer)\b/i,
    ];

    if (hasAny(lower, salesOnlyPatterns)) {
      return { category: "PROMOTIONS", confidence: 94, reason: "newsletter is mainly promotional/sales content" };
    }

    return { category: "PERSONAL", confidence: 96, reason: "newsletter/digest/article/content email" };
  }

  if (hasAny(lower, financePatterns)) return { category: "FINANCE", confidence: 97, reason: "real payment/transaction/finance content" };

  if (hasAny(sender, financeSenderPatterns) && !hasAny(lower, promotionPatterns)) {
    if (hasAny(lower, [/\baccount\b/i, /\bwallet\b/i, /\bbalance\b/i, /\bpayment\b/i, /\bupi\b/i, /₹\s?\d+/i])) {
      return { category: "FINANCE", confidence: 92, reason: "financial sender with account/payment content" };
    }
  }

  if (hasAny(lower, attentionPatterns)) {
    if (hasAny(lower, promotionPatterns) && !/\b(otp|kyc|pan|aadhaar|security alert|account locked|tax|itr|legal|court|government|passport|visa)\b/i.test(lower)) {
      return { category: "PROMOTIONS", confidence: 93, reason: "marketing phrasing, not genuine action required" };
    }

    return { category: "ATTENTION_NEEDED", confidence: 95, reason: "official/security/account action content" };
  }

  if (hasAny(lower, shoppingPatterns)) return { category: "SHOPPING", confidence: 94, reason: "order/delivery/shipping content" };
  if (hasAny(sender, shoppingSenderPatterns) && !hasAny(lower, promotionPatterns)) return { category: "SHOPPING", confidence: 85, reason: "shopping sender without promotional content" };
  if (hasAny(lower, workPatterns)) return { category: "WORK", confidence: 88, reason: "work/project/meeting content" };
  if (hasAny(lower, promotionPatterns)) return { category: "PROMOTIONS", confidence: 90, reason: "marketing/offer/newsletter/content update" };

  return { category: "PERSONAL", confidence: 45, reason: "no strong category match" };
}

function classifyByKeywords(email: BasicEmail, profile?: UserProfileContext): EmailCategory {
  return classifyByRules(email, profile).category;
}

function calculateUrgencyByRules(email: BasicEmail, category: EmailCategory, profile?: UserProfileContext): EmailUrgency {
  const text = getEmailText(email).toUpperCase();

  if (category === "SPAM" || category === "PROMOTIONS") return "LOW";
  if (isNewsletterEmail(email)) return "LOW";

  const senderDomain = extractSenderDomain(email.from || "");
  if (profile && domainMatches(senderDomain, profile.newsletterDomains || [])) return "LOW";

  if (category === "SHOPPING") {
    if (/(FAILED DELIVERY|DELIVERY FAILED|RETURN|EXCHANGE|CANCELLED|PAYMENT FAILED)/.test(text)) return "MEDIUM";
    return "LOW";
  }

  if (category === "FINANCE") {
    if (/(FAILED|DECLINED|OVERDUE|DUE TODAY|PAYMENT DUE|ACTION REQUIRED|ACCOUNT LOCKED|SUSPICIOUS TRANSACTION|UNAUTHORIZED|FRAUD|CHARGEBACK)/.test(text)) return "HIGH";
    return "MEDIUM";
  }

  if (category === "ATTENTION_NEEDED") return "HIGH";

  if (category === "WORK") {
    if (/(URGENT|ASAP|DUE TODAY|DEADLINE|ACTION REQUIRED|PLEASE RESPOND|FINAL REMINDER|ESCALATION|TODAY|TOMORROW)/.test(text)) return "HIGH";
    return "MEDIUM";
  }

  return "LOW";
}

function chooseFinalCategory(aiCategory: EmailCategory, ruleHit: RuleHit): EmailCategory {
  if (ruleHit.confidence >= 85) return ruleHit.category;
  if ((ruleHit.category === "SPAM" || ruleHit.category === "PROMOTIONS" || ruleHit.category === "PERSONAL") && aiCategory === "ATTENTION_NEEDED") return ruleHit.category;
  if (ruleHit.category === "FINANCE" && aiCategory === "PROMOTIONS") return "FINANCE";
  if (aiCategory === "PERSONAL" && ruleHit.category !== "PERSONAL") return ruleHit.category;
  return aiCategory;
}

export async function classifyEmailCategory(email: BasicEmail, profile?: UserProfileContext): Promise<EmailCategory> {
  const ruleHit = classifyByRules(email, profile);

  if (ruleHit.confidence >= 92) {
    console.log(`[Rule Classification] ${email.subject} -> ${ruleHit.category} (${ruleHit.reason})`);
    return ruleHit.category;
  }

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
        {
          role: "user",
          content: `${CLASSIFIER_USER_PROMPT}

${buildUserProfilePrompt(profile)}

Rule engine suggestion:
Category: ${ruleHit.category}
Confidence: ${ruleHit.confidence}
Reason: ${ruleHit.reason}

Email:
From: ${email.from}
Subject: ${email.subject}
Snippet: ${email.snippet}
Body: ${getContentForAi(email).slice(0, 4000)}`,
        },
      ],
      max_tokens: 20,
      temperature: 0,
    });

    const rawCategory = completion.choices[0].message.content || "PERSONAL";
    const explicit = CATEGORY_VALUES.find((value) => new RegExp(`\\b${value}\\b`, "i").test(rawCategory));
    const aiCategory = explicit ? explicit : normalizeCategory(rawCategory);

    return chooseFinalCategory(aiCategory, ruleHit);
  } catch (error) {
    console.error("[AI Classification Error]", error);
    return ruleHit.category;
  }
}

function parseJsonObject(content: string) {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function cleanSummaryText(rawSummary: string, rawAiContent?: string) {
  const trimmed = (rawSummary || "").trim();

  if (!trimmed && rawAiContent) {
    const parsed = parseJsonObject(rawAiContent);
    if (parsed && typeof parsed.summary === "string") return parsed.summary.trim();
  }

  if (trimmed.startsWith("{") && trimmed.includes('"summary"')) {
    const parsed = parseJsonObject(trimmed);
    if (parsed && typeof parsed.summary === "string") return parsed.summary.trim();
  }

  return trimmed;
}

function buildFallbackRichSummary(email: BasicEmail, category: EmailCategory) {
  const urgency = calculateUrgencyByRules(email, category);
  const text = getContentForAi(email).trim();
  const summarySource = text || email.snippet || email.subject || "No readable email content was available.";

  return {
    summary: summarySource.length > 500 ? `${summarySource.slice(0, 500).trim()}...` : summarySource,
    category,
    actionItems: [],
    keyDates: [],
    keyTakeaways: [],
    importantDetails: [],
    keyNumbers: [],
    people: [],
    companies: [],
    links: [],
    urgency,
  };
}

export async function summarizeAndClassifyEmail(email: BasicEmail, profile?: UserProfileContext) {
  // IMPORTANT: GPT is no longer allowed to decide category or urgency here.
  // The email-list rule engine is the single source of truth for tags.
  // This prevents mismatches like: Email List = FINANCE, AI Summary = PERSONAL.
  const ruleHit = classifyByRules(email, profile);
  const category: EmailCategory = ruleHit.category;
  const urgency: EmailUrgency = calculateUrgencyByRules(email, category, profile);
  const contentForAi = getContentForAi(email).slice(0, 5500);

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: RICH_SUMMARY_SYSTEM_PROMPT },
        {
          role: "user",
          content: `${buildUserProfilePrompt(profile)}

Backend-selected metadata. Use this only as context. Do not change it and do not output it:
Category: ${category}
Urgency: ${urgency}
Rule reason: ${ruleHit.reason}

Email metadata:
From: ${email.from}
Subject: ${email.subject}
Snippet: ${email.snippet}

Full email content:
${contentForAi}`,
        },
      ],
      max_tokens: 550,
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0].message.content || "";
    const parsed = parseJsonObject(raw);

    let summary = cleanSummaryText(raw, raw) || "No useful summary could be generated.";
    let actionItems: string[] = [];
    let keyDates: string[] = [];
    let keyTakeaways: string[] = [];
    let importantDetails: string[] = [];
    let keyNumbers: string[] = [];
    let people: string[] = [];
    let companies: string[] = [];
    let links: string[] = [];

    if (parsed) {
      if (typeof parsed.summary === "string" && parsed.summary.trim()) {
        summary = cleanSummaryText(parsed.summary, raw);
      }

      actionItems = normalizeStringArray(parsed.actionItems);
      keyDates = normalizeStringArray(parsed.keyDates);
      keyTakeaways = normalizeStringArray(parsed.keyTakeaways);
      importantDetails = normalizeStringArray(parsed.importantDetails);
      keyNumbers = normalizeStringArray(parsed.keyNumbers);
      people = normalizeStringArray(parsed.people);
      companies = normalizeStringArray(parsed.companies);
      links = normalizeStringArray(parsed.links);
    }

    return {
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
    };
  } catch (error) {
    console.error("[Rich Summary Error]", error);
    return buildFallbackRichSummary(email, category);
  }
}

export async function summarizeEmails(emails: BasicEmail[]) {
  const emailText = emails
    .map(
      (email, index) =>
        `${index + 1}.
From: ${email.from}
Subject: ${email.subject}
Snippet: ${email.snippet}
Body: ${(email.body || "").slice(0, 2500)}`,
    )
    .join("\n\n");

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an AI assistant that summarizes unread emails into useful bullet points with concrete facts, dates, amounts, names, and action items. Do not treat spam or promotions as urgent.",
      },
      { role: "user", content: `Summarize these unread emails:\n\n${emailText}` },
    ],
    temperature: 0.2,
  });

  return completion.choices[0].message.content || "";
}

export async function summarizeSingleEmail(email: BasicEmail) {
  const result = await summarizeAndClassifyEmail(email);
  return result.summary;
}

export async function summarizeWeeklyEmails(emails: BasicEmail[]) {
  if (emails.length === 0) {
    return {
      summary: "No emails found for this week.",
      importantEmails: [],
      actionItems: [],
      financeUpdates: [],
      shoppingUpdates: [],
      workUpdates: [],
      promotionsSummary: "No promotional emails found.",
    };
  }

  const emailText = emails
    .map(
      (email, index) =>
        `${index + 1}.
From: ${email.from}
Subject: ${email.subject}
Snippet: ${email.snippet}
Body: ${(email.body || "").slice(0, 3000)}`,
    )
    .join("\n\n");

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: WEEKLY_REPORT_SYSTEM_PROMPT },
      { role: "user", content: `Create a weekly email report from these emails:\n\n${emailText}` },
    ],
    max_tokens: 1100,
    temperature: 0,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0].message.content || "";
  const parsed = parseJsonObject(raw);

  if (!parsed) {
    return {
      summary: raw.trim() || "Could not generate weekly report.",
      importantEmails: [],
      actionItems: [],
      financeUpdates: [],
      shoppingUpdates: [],
      workUpdates: [],
      promotionsSummary: "",
    };
  }

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "Weekly report generated.",
    importantEmails: normalizeStringArray(parsed.importantEmails),
    actionItems: normalizeStringArray(parsed.actionItems),
    financeUpdates: normalizeStringArray(parsed.financeUpdates),
    shoppingUpdates: normalizeStringArray(parsed.shoppingUpdates),
    workUpdates: normalizeStringArray(parsed.workUpdates),
    promotionsSummary: typeof parsed.promotionsSummary === "string" ? parsed.promotionsSummary : "",
  };
}
