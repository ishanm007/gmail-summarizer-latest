"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
const API_BASE = API_URL;

type Email = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date?: string;
  category?: string;
  hasSummary?: boolean;
  savedSummary?: string | null;
  priorityLevel?: string;
  urgency?: string;
  unsubscribeAvailable?: boolean;
};

type SummaryItem = {
  id: string;
  gmailMessageId: string;
  from: string;
  subject: string;
  snippet: string;
  summary: string;
  category: string;
  actionItems?: string[] | string;
  keyDates?: string[] | string;
  keyTakeaways?: string[] | string;
  importantDetails?: string[] | string;
  keyNumbers?: string[] | string;
  people?: string[] | string;
  companies?: string[] | string;
  links?: string[] | string;
  urgency?: string;
  date?: string;
  createdAt: string;
};

type CategoryItem = {
  key: string;
  label: string;
};

const CATEGORIES: CategoryItem[] = [
  { key: "ALL", label: "📥 All" },
  { key: "ATTENTION_NEEDED", label: "⚠️ Attention Needed" },
  { key: "WORK", label: "💼 Work" },
  { key: "SHOPPING", label: "🛒 Shopping" },
  { key: "FINANCE", label: "💰 Finance" },
  { key: "PROMOTIONS", label: "📢 Promotions" },
  { key: "PERSONAL", label: "👤 Personal" },
  { key: "SPAM", label: "🗑️ Spam" },
];

const CATEGORY_LABELS: Record<string, string> = {
  ALL: "📥 All",
  WORK: "💼 Work",
  SHOPPING: "🛒 Shopping",
  FINANCE: "💰 Finance",
  PROMOTIONS: "📢 Promotions",
  PERSONAL: "👤 Personal",
  SPAM: "🗑️ Spam",
  ATTENTION_NEEDED: "⚠️ Attention Needed",
};

type Usage = {
  plan: string;
  usedToday: number;
  dailyLimit: number | null;
  remaining: number | null;
};

type User = {
  id: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  plan?: string;
  aiConsent?: boolean;
};

type UserProfile = {
  role: string;
  roleLabel?: string | null;
  organizationName?: string | null;
  businessName?: string | null;
  priorities: string[];
  newsletterPreference: string;
  workDomains: string[];
  studyDomains: string[];
  newsletterDomains: string[];
  ignoredDomains: string[];
  onboardingCompleted: boolean;
};

type DomainSuggestion = {
  domain: string;
  count: number;
};

type OnboardingStep = "role" | "details" | "priorities" | "domains";

const ROLES = [
  {
    id: "STUDENT",
    label: "Student",
    icon: "🎓",
    desc: "School, college, exams, research",
  },
  {
    id: "PROFESSIONAL",
    label: "Working Professional",
    icon: "💼",
    desc: "Company, team, clients, meetings",
  },
  {
    id: "BUSINESS_OWNER",
    label: "Business Owner",
    icon: "🚀",
    desc: "Customers, invoices, vendors",
  },
  {
    id: "GOVERNMENT",
    label: "Government Employee",
    icon: "🏛️",
    desc: "Official notices and department work",
  },
  {
    id: "HEALTHCARE",
    label: "Healthcare Professional",
    icon: "⚕️",
    desc: "Patients, hospital, schedules",
  },
  {
    id: "LAW",
    label: "Law / Legal",
    icon: "⚖️",
    desc: "Cases, clients, notices, compliance",
  },
  {
    id: "TEACHER",
    label: "Teacher / Professor",
    icon: "👨‍🏫",
    desc: "Students, classes, institution",
  },
  {
    id: "FREELANCER",
    label: "Freelancer",
    icon: "💻",
    desc: "Clients, projects, invoices",
  },
  {
    id: "CREATOR",
    label: "Creator",
    icon: "🎨",
    desc: "Brands, platforms, audience",
  },
  {
    id: "RESEARCHER",
    label: "Researcher",
    icon: "🔬",
    desc: "Papers, labs, grants, conferences",
  },
  {
    id: "OTHER",
    label: "Something Else",
    icon: "✨",
    desc: "Customize it your way",
  },
];

const PRIORITY_OPTIONS = [
  "Never miss work emails",
  "Never miss finance emails",
  "Highlight assignments and exams",
  "Track deliveries and orders",
  "Keep newsletters low priority",
  "Ignore promotions unless useful",
  "Highlight government/legal/security emails",
];

type Tab = "inbox" | "summarized";
type Urgency = "HIGH" | "MEDIUM" | "LOW";

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item) => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeUrgency(value: unknown): Urgency {
  if (typeof value !== "string") return "MEDIUM";

  const normalized = value.trim().toUpperCase();

  if (normalized === "HIGH") return "HIGH";
  if (normalized === "LOW") return "LOW";
  if (normalized === "MEDIUM") return "MEDIUM";

  if (normalized === "NEGATIVE") return "HIGH";
  if (normalized === "POSITIVE") return "LOW";

  return "MEDIUM";
}

function normalizeUrgencyForCategory(
  category: unknown,
  urgencyValue: unknown,
  fallbackValue?: unknown,
): Urgency {
  const normalizedCategory =
    typeof category === "string" ? category.trim().toUpperCase() : "";

  // Spam and promotional emails should never appear as high priority in the UI,
  // even if the backend returns NEGATIVE sentiment or an older cached summary has HIGH urgency.
  if (normalizedCategory === "SPAM" || normalizedCategory === "PROMOTIONS") {
    return "LOW";
  }

  return normalizeUrgency(urgencyValue || fallbackValue);
}

export default function Home() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<any>(null);
  const [weeklyReportLoading, setWeeklyReportLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>("inbox");
  const [activeCategory, setActiveCategory] = useState<string>("ALL");

  const [emails, setEmails] = useState<Email[]>([]);
  const [inboxPage, setInboxPage] = useState<number>(1);
  const [inboxHasNext, setInboxHasNext] = useState<boolean>(false);
  const [summaries, setSummaries] = useState<SummaryItem[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [gmailSearchResults, setGmailSearchResults] = useState<Email[]>([]);
  const [gmailSearchLoading, setGmailSearchLoading] = useState(false);

  const [usage, setUsage] = useState<Usage>({
    plan: "FREE",
    usedToday: 0,
    dailyLimit: 10,
    remaining: 10,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingSummary, setDeletingSummary] = useState(false);
  const [unsubscribing, setUnsubscribing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<SummaryItem | null>(
    null,
  );
  const selectedItemRef = useRef<HTMLButtonElement | null>(null);

  const [summary, setSummary] = useState("");
  const [actionItems, setActionItems] = useState<string[]>([]);
  const [keyDates, setKeyDates] = useState<string[]>([]);
  const [keyTakeaways, setKeyTakeaways] = useState<string[]>([]);
  const [importantDetails, setImportantDetails] = useState<string[]>([]);
  const [keyNumbers, setKeyNumbers] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [urgency, setUrgency] = useState<Urgency>("MEDIUM");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"PRO" | "PRO_PLUS" | null>(
    null,
  );

  const [profileLoading, setProfileLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("role");
  const [selectedRoles, setSelectedRoles] = useState<string[]>(["STUDENT"]);
  const [organizationName, setOrganizationName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [priorities, setPriorities] = useState<string[]>([
    "Keep newsletters low priority",
  ]);
  const [newsletterPreference, setNewsletterPreference] = useState("PERSONAL");
  const [domainSuggestions, setDomainSuggestions] = useState<
    DomainSuggestion[]
  >([]);
  const [domainLabels, setDomainLabels] = useState<Record<string, string>>({});
  const [savingOnboarding, setSavingOnboarding] = useState(false);

  const apiFetch = (input: RequestInfo, init?: RequestInit) =>
    fetch(input, { ...(init || {}), credentials: "include" });

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    fetchOnboardingProfile();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    fetchUsage();

    if (activeTab === "inbox") fetchEmails(inboxPage);
    if (activeTab === "summarized") fetchSummaries();
  }, [user, activeTab]);

  useEffect(() => {
    if (!user) return;
    if (activeTab === "inbox") fetchEmails(inboxPage);
  }, [inboxPage]);

  useEffect(() => {
    if (!user) return;

    const timer = setTimeout(() => {
      searchFullGmail(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, activeTab, user]);

  async function checkAuth() {
    setAuthLoading(true);

    try {
      const res = await apiFetch(`${API_BASE}/auth/me`);

      if (res.status === 401) {
        setUser(null);
        return;
      }

      const data = await safeJson(res);
      setUser(data.success ? data.user : null);
    } catch (error) {
      console.error(error);
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }

  function loginWithGoogle() {
    window.location.href = `${API_BASE}/auth/google`;
  }

  async function logout() {
    try {
      await apiFetch(`${API_BASE}/auth/logout`, {
        method: "POST",
      });
    } catch (error) {
      console.error(error);
    }

    setUser(null);
    setEmails([]);
    setSummaries([]);
    setSearchQuery("");
    setGmailSearchResults([]);
    setWeeklyReport(null);
    setProfile(null);
    setProfileLoading(true);
    clearSelection();
  }

  function showSuccess(message: string) {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(""), 2000);
  }

  function handlePlanSelect(plan: "PRO" | "PRO_PLUS") {
    setSelectedPlan(plan);
    showSuccess(
      plan === "PRO"
        ? "Pro plan selected. Payment integration coming soon."
        : "Pro+ plan selected. Payment integration coming soon.",
    );
  }

  function getCategoryLabel(category?: string) {
    return category ? CATEGORY_LABELS[category] || category : "👤 Personal";
  }

  function getUrgencyLabel(value: Urgency) {
    if (value === "HIGH") return "🔴 High Priority";
    if (value === "LOW") return "🟢 Low Priority";
    return "🟠 Medium Priority";
  }

  function getUrgencyStyle(value: Urgency) {
    if (value === "HIGH") {
      return "bg-red-500/10 text-red-300 border-red-500/30";
    }

    if (value === "LOW") {
      return "bg-green-500/10 text-green-300 border-green-500/30";
    }

    return "bg-orange-500/10 text-orange-300 border-orange-500/30";
  }

  function getUserDisplayName() {
    return user?.name?.trim() || user?.email?.split("@")[0] || "User";
  }

  function getSelectedCategory() {
    return selectedEmail?.category || selectedSummary?.category || "PERSONAL";
  }

  async function safeJson(res: Response) {
    const contentType = res.headers.get("content-type");

    if (!contentType?.includes("application/json")) {
      const text = await res.text();

      console.error("Backend did not return JSON:", {
        status: res.status,
        url: res.url,
        contentType,
        bodyStart: text.slice(0, 150),
      });

      throw new Error("Backend returned HTML instead of JSON.");
    }

    return res.json();
  }

  async function fetchEmails(page = 1) {
    setLoading(true);

    try {
      const res = await apiFetch(`${API_BASE}/emails?page=${page}`);
      const data = await safeJson(res);

      if (!data.success) {
        throw new Error(data.message || "Failed to fetch emails");
      }

      setEmails(data.emails || []);
      setInboxHasNext(Boolean(data.hasNext));
      setInboxPage(data.page || page);
      setErrorMessage("");
    } catch (error) {
      console.error(error);
      setErrorMessage("Failed to load inbox emails. Please check backend.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchSummaries() {
    setLoading(true);

    try {
      const res = await apiFetch(`${API_BASE}/summarized`);
      const data = await safeJson(res);

      if (!data.success) {
        throw new Error(data.message || "Failed to fetch summaries");
      }

      setSummaries(data.summaries || []);
      setErrorMessage("");
    } catch (error) {
      console.error(error);
      setErrorMessage("Failed to load saved summaries. Please check backend.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchSummariesSilently() {
    try {
      const res = await apiFetch(`${API_BASE}/summarized`);
      const data = await safeJson(res);

      if (data.success) {
        setSummaries(data.summaries || []);
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function fetchUsage() {
    try {
      const res = await apiFetch(`${API_BASE}/usage`);
      const data = await safeJson(res);

      if (data.success) {
        setUsage(data);
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("Failed to load usage data. Please check backend.");
    }
  }

  async function fetchWeeklyReport() {
    setWeeklyReportLoading(true);
    setErrorMessage("");

    try {
      const res = await apiFetch(`${API_BASE}/weekly-report`);
      const data = await safeJson(res);

      if (!data.success) {
        throw new Error(data.message || "Failed to generate weekly report");
      }

      setWeeklyReport(data);
      showSuccess("Weekly report generated successfully.");
    } catch (error) {
      console.error("Weekly report error:", error);
      setWeeklyReport(null);
      setErrorMessage(
        "Failed to generate weekly report. Please check backend.",
      );
    } finally {
      setWeeklyReportLoading(false);
    }
  }

  async function fetchOnboardingProfile() {
    if (!user) return;

    setProfileLoading(true);

    try {
      const res = await apiFetch(`${API_BASE}/onboarding/profile`);

      if (res.status === 401) {
        setProfile(null);
        return;
      }

      const data = await safeJson(res);

      if (data.success) {
        const nextProfile = data.profile || null;
        setProfile(nextProfile);
        setSelectedRoles(
          nextProfile?.role && nextProfile.role !== "NOT_SET"
            ? nextProfile.role.split(",").filter(Boolean)
            : ["STUDENT"],
        );
        setOrganizationName(nextProfile?.organizationName || "");
        setBusinessName(nextProfile?.businessName || "");
        setPriorities(
          nextProfile?.priorities?.length
            ? nextProfile.priorities
            : ["Keep newsletters low priority"],
        );
        setNewsletterPreference(
          nextProfile?.newsletterPreference || "PERSONAL",
        );
      }
    } catch (error) {
      console.error(error);
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }

  async function saveBasicOnboarding(completed = false) {
    const selectedRoleLabels = ROLES.filter((item) =>
      selectedRoles.includes(item.id),
    ).map((item) => item.label);

    const res = await apiFetch(`${API_BASE}/onboarding/profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: selectedRoles.join(","),
        roleLabel: selectedRoleLabels.join(", "),
        organizationName: organizationName.trim() || null,
        businessName: businessName.trim() || null,
        priorities,
        newsletterPreference,
        onboardingCompleted: completed,
      }),
    });

    const data = await safeJson(res);

    if (!data.success) {
      throw new Error(data.message || "Failed to save onboarding");
    }

    setProfile(data.profile);
    return data.profile;
  }

  async function fetchDomainSuggestions() {
    try {
      const res = await apiFetch(`${API_BASE}/onboarding/domain-suggestions`);
      const data = await safeJson(res);

      if (data.success) {
        setDomainSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error(error);
      setDomainSuggestions([]);
    }
  }

  async function handleOnboardingNext() {
    setErrorMessage("");

    try {
      if (onboardingStep === "role") {
        setOnboardingStep("details");
        return;
      }

      if (onboardingStep === "details") {
        setOnboardingStep("priorities");
        saveBasicOnboarding(false).catch((error) => {
          console.error(error);
          setErrorMessage("Failed to save onboarding context.");
        });
        return;
      }

      if (onboardingStep === "priorities") {
        setOnboardingStep("domains");

        Promise.all([
          saveBasicOnboarding(false),
          fetchDomainSuggestions(),
        ]).catch((error) => {
          console.error(error);
          setErrorMessage("Failed to prepare domain suggestions.");
        });

        return;
      }

      setSavingOnboarding(true);

      const labels = Object.entries(domainLabels).map(([domain, type]) => ({
        domain,
        type,
      }));

      const labelsRes = await apiFetch(`${API_BASE}/onboarding/domain-labels`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ labels }),
      });

      await safeJson(labelsRes);
      const savedProfile = await saveBasicOnboarding(true);
      setProfile(savedProfile);
      showSuccess("Your AI inbox profile is ready.");
    } catch (error) {
      console.error(error);
      setErrorMessage(
        "Failed to save onboarding. Please check backend routes.",
      );
    } finally {
      setSavingOnboarding(false);
    }
  }

  function toggleSelectedRole(roleId: string) {
    setSelectedRoles((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId],
    );
  }

  function togglePriority(option: string) {
    setPriorities((prev) =>
      prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option],
    );
  }

  async function searchFullGmail(query: string) {
    if (!query.trim()) {
      setGmailSearchResults([]);
      return;
    }

    if (activeTab === "summarized") return;

    setGmailSearchLoading(true);

    try {
      const res = await apiFetch(
        `${API_BASE}/gmail-search?query=${encodeURIComponent(query)}`,
      );

      const data = await safeJson(res);

      if (!data.success) {
        throw new Error(data.message || "Failed to search Gmail");
      }

      setGmailSearchResults(data.emails || []);
      setErrorMessage("");
    } catch (error) {
      console.error(error);
      setGmailSearchResults([]);
      setErrorMessage("Failed to search Gmail. Please check backend.");
    } finally {
      setGmailSearchLoading(false);
    }
  }

  async function handleEmailClick(email: Email) {
    setSelectedEmail(email);
    setSelectedSummary(null);
    setSummary("");
    setActionItems([]);
    setKeyDates([]);
    setKeyTakeaways([]);
    setImportantDetails([]);
    setKeyNumbers([]);
    setPeople([]);
    setCompanies([]);
    setLinks([]);
    setUrgency("MEDIUM");
    setCopied(false);

    if (email.savedSummary) {
      setSummary(email.savedSummary);
      setUrgency(normalizeUrgencyForCategory(email.category, email.urgency));
      setSummaryLoading(false);
      return;
    }

    setSummaryLoading(true);

    try {
      const res = await apiFetch(`${API_BASE}/email/summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(email),
      });

      const data = await safeJson(res);

      if (data.success) {
        setSummary(data.summary);
        setActionItems(data.actionItems || []);
        setKeyDates(data.keyDates || []);
        setKeyTakeaways(data.keyTakeaways || []);
        setImportantDetails(data.importantDetails || []);
        setKeyNumbers(data.keyNumbers || []);
        setPeople(data.people || []);
        setCompanies(data.companies || []);
        setLinks(data.links || []);
        const finalCategory = email.category || data.category || "PERSONAL";
        const finalUrgency = normalizeUrgencyForCategory(
          finalCategory,
          data.priorityLevel ||
            data.urgency ||
            email.priorityLevel ||
            email.urgency,
        );
        setUrgency(finalUrgency);
        setErrorMessage("");

        setEmails((prev) =>
          prev.map((item) =>
            item.id === email.id
              ? {
                  ...item,
                  hasSummary: true,
                  savedSummary: data.summary,
                  category: item.category || data.category,
                  urgency: finalUrgency,
                }
              : item,
          ),
        );

        await fetchUsage();
        await fetchSummariesSilently();
      } else {
        setSummary(data.message || "Failed to generate summary.");
        setErrorMessage(data.message || "Failed to generate summary.");
      }
    } catch (error) {
      console.error(error);
      setSummary("Something went wrong.");
      setErrorMessage("Failed to summarize email. Please check backend.");
    } finally {
      setSummaryLoading(false);
    }
  }

  async function unsubscribeSelectedEmail() {
    const gmailId = getSelectedGmailId();

    if (!gmailId) return;

    const confirmUnsubscribe = window.confirm(
      "Unsubscribe/block this sender? Future emails from this sender will skip Gmail Inbox and will not appear in this app.",
    );

    if (!confirmUnsubscribe) return;

    setUnsubscribing(true);

    try {
      const res = await apiFetch(`${API_BASE}/email/unsubscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: gmailId }),
      });

      const data = await safeJson(res);

      if (!data.success) {
        throw new Error(data.message || "Failed to unsubscribe");
      }

      setEmails((prev) => prev.filter((email) => email.id !== gmailId));
      setGmailSearchResults((prev) =>
        prev.filter((email) => email.id !== gmailId),
      );

      clearSelection();

      showSuccess(
        data.senderEmail
          ? `Unsubscribed/blocked ${data.senderEmail}.`
          : "Sender unsubscribed/blocked.",
      );
    } catch (error) {
      console.error("Unsubscribe error:", error);
      setErrorMessage(
        "Failed to unsubscribe/block sender. Re-login with Google if permissions were just updated.",
      );
    } finally {
      setUnsubscribing(false);
    }
  }

  async function deleteSummary(id: string) {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this saved summary?",
    );

    if (!confirmDelete) return;

    const oldSummaries = summaries;
    const oldSelectedSummary = selectedSummary;
    const oldSelectedEmail = selectedEmail;
    const oldSummary = summary;
    const oldEmails = emails;

    setDeletingSummary(true);

    const deletedSummary = summaries.find((item) => item.id === id);
    const deletedGmailId = deletedSummary?.gmailMessageId;

    setSummaries((prev) => prev.filter((item) => item.id !== id));

    if (deletedGmailId) {
      setEmails((prev) =>
        prev.map((email) =>
          email.id === deletedGmailId
            ? {
                ...email,
                hasSummary: false,
                savedSummary: null,
              }
            : email,
        ),
      );
    }

    clearSelection();

    try {
      const res = await apiFetch(`${API_BASE}/summary/${id}`, {
        method: "DELETE",
      });

      const data = await safeJson(res);

      if (!data.success) {
        throw new Error(data.message || "Failed to delete summary");
      }

      setErrorMessage("");
      showSuccess("Summary deleted successfully.");
    } catch (error) {
      console.error(error);

      setSummaries(oldSummaries);
      setSelectedSummary(oldSelectedSummary);
      setSelectedEmail(oldSelectedEmail);
      setSummary(oldSummary);
      setEmails(oldEmails);

      setErrorMessage("Failed to delete summary. Please try again.");
    } finally {
      setDeletingSummary(false);
    }
  }

  async function refreshCurrentTab() {
    setRefreshing(true);

    try {
      clearSelection();
      setSearchQuery("");
      setGmailSearchResults([]);

      await fetchUsage();

      if (activeTab === "inbox") await fetchEmails(inboxPage);
      if (activeTab === "summarized") await fetchSummaries();

      setErrorMessage("");
    } catch (error) {
      console.error(error);
      setErrorMessage("Refresh failed. Please check backend.");
    } finally {
      setRefreshing(false);
    }
  }

  function handleSummaryClick(item: SummaryItem) {
    setSelectedSummary(item);
    setSelectedEmail(null);
    setSummary(item.summary);
    setActionItems(parseStringArray(item.actionItems));
    setKeyDates(parseStringArray(item.keyDates));
    setKeyTakeaways(parseStringArray(item.keyTakeaways));
    setImportantDetails(parseStringArray(item.importantDetails));
    setKeyNumbers(parseStringArray(item.keyNumbers));
    setPeople(parseStringArray(item.people));
    setCompanies(parseStringArray(item.companies));
    setLinks(parseStringArray(item.links));
    setUrgency(normalizeUrgencyForCategory(item.category, item.urgency));
    setCopied(false);
    setSummaryLoading(false);
  }

  function clearSelection() {
    setSelectedEmail(null);
    setSelectedSummary(null);
    setSummary("");
    setActionItems([]);
    setKeyDates([]);
    setKeyTakeaways([]);
    setImportantDetails([]);
    setKeyNumbers([]);
    setPeople([]);
    setCompanies([]);
    setLinks([]);
    setUrgency("MEDIUM");
    setCopied(false);
  }

  function clearSearch() {
    setSearchQuery("");
    setGmailSearchResults([]);
  }

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    setActiveCategory("ALL");
    clearSelection();
    clearSearch();
    setErrorMessage("");
    if (tab === "inbox") setInboxPage(1);
  }

  function getSelectedGmailId() {
    return selectedEmail?.id || selectedSummary?.gmailMessageId || null;
  }

  function openSelectedInGmail() {
    const gmailId = getSelectedGmailId();

    if (!gmailId) return;

    window.open(
      `https://mail.google.com/mail/u/0/#inbox/${gmailId}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  async function copySummary() {
    if (!summary) return;

    try {
      const copyText = [
        `Summary:\n${summary}`,
        actionItems.length
          ? `\nAction Items:\n${actionItems.map((item) => `- ${item}`).join("\n")}`
          : "",
        keyTakeaways.length
          ? `\nKey Takeaways:\n${keyTakeaways.map((item) => `- ${item}`).join("\n")}`
          : "",
        importantDetails.length
          ? `\nImportant Details:\n${importantDetails.map((item) => `- ${item}`).join("\n")}`
          : "",
        keyDates.length
          ? `\nKey Dates:\n${keyDates.map((item) => `- ${item}`).join("\n")}`
          : "",
        keyNumbers.length
          ? `\nKey Numbers:\n${keyNumbers.map((item) => `- ${item}`).join("\n")}`
          : "",
        `\nUrgency: ${getUrgencyLabel(urgency)}`,
      ].join("\n");

      await navigator.clipboard.writeText(copyText);

      setCopied(true);
      showSuccess("AI summary copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Copy failed:", error);
      setErrorMessage("Failed to copy summary.");
    }
  }

  function renderInfoList(
    title: string,
    emptyText: string,
    items: string[],
    prefix = "•",
  ) {
    return (
      <div className="mt-4 rounded-xl bg-black/25 p-4">
        <h3 className="mb-3 font-semibold">{title}</h3>

        {items.length === 0 ? (
          <p className="text-sm text-indigo-300/60">{emptyText}</p>
        ) : (
          <ul className="space-y-2 text-sm text-indigo-100">
            {items.map((item, index) => (
              <li key={index} className="rounded-lg bg-indigo-500/10 p-3">
                {prefix} {item}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const displayUsedToday =
    usage.dailyLimit === null
      ? usage.usedToday
      : Math.min(usage.usedToday, usage.dailyLimit);

  const usagePercent =
    usage.dailyLimit === null
      ? 100
      : Math.min((displayUsedToday / usage.dailyLimit) * 100, 100);

  const filteredEmails = (
    searchQuery.trim() ? gmailSearchResults : emails
  ).filter(
    (item) => activeCategory === "ALL" || item.category === activeCategory,
  );

  const filteredSummaries = useMemo(() => {
    return summaries
      .filter(
        (item) => activeCategory === "ALL" || item.category === activeCategory,
      )
      .filter((item) =>
        `${item.subject} ${item.from} ${item.snippet} ${item.summary}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase()),
      );
  }, [summaries, searchQuery, activeCategory]);

  const hasSelectedEmail = Boolean(getSelectedGmailId());
  const showOnboarding =
    Boolean(user) && !profileLoading && !profile?.onboardingCompleted;

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b1220] text-white">
        <p className="text-indigo-100/70">Checking login...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b1220] px-4 text-white">
        <div className="w-full max-w-md rounded-3xl border border-[#24214a] bg-[#111827] p-8 shadow-2xl">
          <h1 className="text-3xl font-bold">Inbix AI</h1>

          <p className="mt-3 text-indigo-300/60">
            Connect your Gmail and get clear AI summaries of important emails.
          </p>

          <button
            onClick={loginWithGoogle}
            className="mt-8 w-full rounded-3xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500"
          >
            Continue with Google
          </button>
        </div>
      </main>
    );
  }

  if (showOnboarding) {
    return (
      <main className="min-h-screen bg-[#050513] px-4 py-8 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-300">
              AI Inbox Setup
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">
              Let Inbix AI understand you.
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-indigo-200/65">
              A quick interactive setup so emails from work, college,
              newsletters, finance, shopping, and official sources are
              classified properly.
            </p>
          </div>

          <div className="rounded-[2rem] border border-indigo-500/20 bg-[#0d0c24] p-5 shadow-2xl shadow-indigo-950/40 md:p-8">
            <div className="mb-7 flex flex-wrap gap-2 text-sm">
              {[
                ["role", "Identity"],
                ["details", "Context"],
                ["priorities", "Priorities"],
                ["domains", "Domains"],
              ].map(([step, label], index) => (
                <span
                  key={step}
                  className={`rounded-full border px-4 py-2 ${
                    onboardingStep === step
                      ? "border-blue-400 bg-blue-600 text-white"
                      : "border-indigo-500/20 bg-indigo-500/10 text-indigo-200/70"
                  }`}
                >
                  {index + 1}. {label}
                </span>
              ))}
            </div>

            {onboardingStep === "role" && (
              <section>
                <h2 className="text-2xl font-bold">What describes you best?</h2>
                <p className="mt-2 text-indigo-200/60">
                  This helps AI understand what “important” means for you.
                </p>

                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {ROLES.map((role) => (
                    <button
                      key={role.id}
                      onClick={() => toggleSelectedRole(role.id)}
                      className={`rounded-3xl border p-5 text-left transition ${
                        selectedRoles.includes(role.id)
                          ? "border-blue-400 bg-blue-600/25 shadow-lg shadow-blue-500/10"
                          : "border-indigo-500/20 bg-black/20 hover:bg-indigo-500/10"
                      }`}
                    >
                      <div className="text-4xl">{role.icon}</div>
                      <h3 className="mt-3 font-bold">{role.label}</h3>
                      <p className="mt-1 text-sm text-indigo-200/55">
                        {role.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {onboardingStep === "details" && (
              <section>
                <h2 className="text-2xl font-bold">Add a little context</h2>
                <p className="mt-2 text-indigo-200/60">
                  Don’t enter email addresses. Just add a company, business,
                  college, school, department, or organization name if useful.
                </p>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {selectedRoles.includes("BUSINESS_OWNER") ? (
                    <label className="block rounded-3xl border border-indigo-500/20 bg-black/20 p-5">
                      <span className="text-sm text-indigo-200/70">
                        Business / brand name
                      </span>
                      <input
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="Example: My Store, Design Studio, Agency"
                        className="mt-3 w-full rounded-2xl bg-indigo-500/10 px-4 py-3 outline-none placeholder:text-indigo-300/40"
                      />
                    </label>
                  ) : (
                    <label className="block rounded-3xl border border-indigo-500/20 bg-black/20 p-5">
                      <span className="text-sm text-indigo-200/70">
                        Organization / institution name
                      </span>
                      <input
                        value={organizationName}
                        onChange={(e) => setOrganizationName(e.target.value)}
                        placeholder="Example: company, college, school, office"
                        className="mt-3 w-full rounded-2xl bg-indigo-500/10 px-4 py-3 outline-none placeholder:text-indigo-300/40"
                      />
                    </label>
                  )}

                  <label className="block rounded-3xl border border-indigo-500/20 bg-black/20 p-5">
                    <span className="text-sm text-indigo-200/70">
                      Newsletters should be treated as
                    </span>
                    <select
                      value={newsletterPreference}
                      onChange={(e) => setNewsletterPreference(e.target.value)}
                      className="mt-3 w-full rounded-2xl bg-[#111827] px-4 py-3 outline-none"
                    >
                      <option value="PERSONAL">Personal + Low priority</option>
                      <option value="PROMOTIONS">
                        Promotions + Low priority
                      </option>
                      <option value="IGNORE">Keep out of the way</option>
                    </select>
                  </label>
                </div>
              </section>
            )}

            {onboardingStep === "priorities" && (
              <section>
                <h2 className="text-2xl font-bold">
                  What should AI never miss?
                </h2>
                <p className="mt-2 text-indigo-200/60">
                  Pick everything that matters. You can change this later.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {PRIORITY_OPTIONS.map((option) => (
                    <button
                      key={option}
                      onClick={() => togglePriority(option)}
                      className={`rounded-3xl border px-5 py-4 text-left transition ${
                        priorities.includes(option)
                          ? "border-green-400 bg-green-500/20 text-white"
                          : "border-indigo-500/20 bg-black/20 text-indigo-100/75 hover:bg-indigo-500/10"
                      }`}
                    >
                      {priorities.includes(option) ? "✅" : "○"} {option}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {onboardingStep === "domains" && (
              <section>
                <h2 className="text-2xl font-bold">
                  Label detected sender domains
                </h2>
                <p className="mt-2 text-indigo-200/60">
                  The app detects likely domains from Gmail. You only tap
                  labels; you don’t type email addresses.
                </p>

                <div className="mt-5 space-y-3">
                  {domainSuggestions.length === 0 ? (
                    <p className="rounded-3xl border border-indigo-500/20 bg-black/20 p-5 text-indigo-200/70">
                      No useful domain suggestions found yet. You can finish
                      setup.
                    </p>
                  ) : (
                    domainSuggestions.map((item) => (
                      <div
                        key={item.domain}
                        className="rounded-3xl border border-indigo-500/20 bg-black/20 p-4"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-bold">{item.domain}</p>
                            <p className="text-sm text-indigo-200/50">
                              Seen {item.count} time
                              {item.count === 1 ? "" : "s"}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {[
                                ["WORK", "💼 Work"],
                                ["UNIVERSITY", "🎓 University"],
                                ["ATTENTION_NEEDED", "⚠️ Attention"],
                                ["FINANCE", "💰 Finance"],
                                ["SHOPPING", "🛒 Shopping"],
                                ["PROMOTIONS", "📢 Promotions"],
                                ["NEWSLETTER", "📰 Newsletter"],
                                ["PERSONAL", "👤 Personal"],
                                ["SECURITY", "🛡️ Security"],
                                ["TRAVEL", "✈️ Travel"],
                                ["SOCIAL", "👥 Social"],
                                ["GITHUB", "💻 GitHub"],
                                ["SPAM", "🚫 Spam"],
                                ["IGNORE", "🙈 Ignore"],

                            ].map(([type, label]) => (
                              <button
                                key={type}
                                onClick={() =>
                                  setDomainLabels((prev) => ({
                                    ...prev,
                                    [item.domain]: type,
                                  }))
                                }
                                className={`rounded-xl px-3 py-2 text-sm ${
                                  domainLabels[item.domain] === type
                                    ? "bg-blue-600 text-white"
                                    : "bg-indigo-500/10 text-indigo-100/70 hover:bg-indigo-500/20"
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            {errorMessage && (
              <p className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {errorMessage}
              </p>
            )}

            <div className="mt-8 flex flex-wrap justify-between gap-3">
              <button
                onClick={() => {
                  if (onboardingStep === "details") setOnboardingStep("role");
                  if (onboardingStep === "priorities")
                    setOnboardingStep("details");
                  if (onboardingStep === "domains")
                    setOnboardingStep("priorities");
                }}
                className="rounded-2xl bg-indigo-500/10 px-5 py-3 font-semibold text-indigo-100 hover:bg-indigo-500/20"
              >
                Back
              </button>

              <button
                onClick={handleOnboardingNext}
                disabled={savingOnboarding}
                className="rounded-2xl bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-600/50"
              >
                {savingOnboarding
                  ? "Saving..."
                  : onboardingStep === "domains"
                    ? "Finish setup"
                    : "Continue"}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen overflow-hidden bg-[#050513] text-white">
      <div className="grid h-screen min-h-0 grid-cols-1 overflow-hidden md:grid-cols-[clamp(260px,19vw,335px)_1fr]">
        <aside className="relative hidden h-screen min-h-0 flex-col overflow-hidden border-r border-[#24214a] bg-[#09091d] p-4 shadow-2xl shadow-black/40 md:flex">
              <img
                src="/inbix-logo.png"
                className="h-40 w-200 object-contain"
                alt="Inbix"
              />
            

            <div className="min-w-0">
              

              
            </div>
          
        
          <nav className="shrink-0 space-y-2">
            {[
              ["inbox", "▣", "Inbox", emails.length],
              ["summarized", "▤", "Summarized & Saved", summaries.length],
            ].map(([tab, icon, label, count]) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab as Tab)}
                className={`group flex w-full items-center justify-between rounded-3xl border px-4 py-3 text-left transition ${
                  activeTab === tab
                    ? "border-indigo-500/60 bg-indigo-500/20 text-white shadow-lg shadow-indigo-500/10"
                    : "border-transparent text-indigo-200/60 hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-4">
                  <span className="text-xl text-indigo-400">{icon}</span>
                  <span className="font-bold">{label}</span>
                </span>

                <span className="rounded-xl bg-indigo-500/20 px-3 py-1 text-sm font-bold text-indigo-200">
                  {count}
                </span>
              </button>
            ))}

            <button className="flex w-full items-center gap-4 rounded-3xl px-4 py-3 text-left font-bold text-indigo-200/50 transition hover:bg-indigo-500/10 hover:text-white">
              <span className="text-xl text-indigo-400">▦</span>
              Dashboard
            </button>

            <button className="flex w-full items-center gap-4 rounded-3xl px-4 py-3 text-left font-bold text-indigo-200/50 transition hover:bg-indigo-500/10 hover:text-white">
              <span className="text-xl text-indigo-400">↗</span>
              Analytics
            </button>

            <button className="flex w-full items-center gap-4 rounded-3xl px-4 py-3 text-left font-bold text-indigo-200/50 transition hover:bg-indigo-500/10 hover:text-white">
              <span className="text-xl text-indigo-400">⚙</span>
              Settings
            </button>
          </nav>

          <div className="mt-auto space-y-5">
            {profile?.onboardingCompleted && (
              <div className="rounded-3xl border border-indigo-500/20 bg-[#111029] p-4 shadow-xl shadow-black/30">
                <p className="font-mono text-xs uppercase tracking-[0.3em] text-indigo-300">
                  AI Profile
                </p>
                <p className="mt-2 font-bold text-indigo-100">
                  {profile.roleLabel || profile.role}
                </p>
                {(profile.organizationName || profile.businessName) && (
                  <p className="mt-1 truncate text-sm text-indigo-200/60">
                    {profile.organizationName || profile.businessName}
                  </p>
                )}
                <button
                  onClick={() => {
                    setOnboardingStep("role");
                    setProfile((prev) =>
                      prev ? { ...prev, onboardingCompleted: false } : prev,
                    );
                  }}
                  className="mt-3 text-sm font-semibold text-blue-300 hover:text-blue-200"
                >
                  Edit AI profile
                </button>
              </div>
            )}

            <div className="rounded-3xl border border-indigo-500/20 bg-[#111029] p-4 shadow-xl shadow-black/30">
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs uppercase tracking-[0.3em] text-indigo-300">
                  {usage.plan} Plan
                </p>

                <p className="text-sm font-semibold text-indigo-200">
                  {displayUsedToday} / {usage.dailyLimit ?? "∞"}
                </p>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-indigo-950">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
                  style={{ width: `${usagePercent}%` }}
                />
              </div>

              <p className="mt-3 text-sm text-indigo-200/60">
                {usage.remaining ?? "Unlimited"} summaries remaining
              </p>

              <button
                onClick={() => setShowUpgradeModal(true)}
                className="mt-4 w-full rounded-3xl bg-gradient-to-r from-blue-500 to-violet-600 py-3 font-bold shadow-lg shadow-violet-500/20 hover:opacity-90"
              >
                ⚡ Upgrade Plan
              </button>
            </div>

            <div className="flex items-center gap-3">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={getUserDisplayName()}
                  className="h-12 w-12 rounded-full border border-indigo-400/30 object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 font-black">
                  {getUserDisplayName().slice(0, 2).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {getUserDisplayName()}
                </p>
                <p className="truncate text-xs text-indigo-300/70">
                  {user.email}
                </p>
              </div>

              <button
                onClick={logout}
                className="rounded-xl px-3 py-2 text-indigo-300 hover:bg-indigo-500/15 hover:text-white"
                title="Logout"
              >
                ↪
              </button>
            </div>
          </div>
        </aside>

        <section className="flex h-screen min-w-0 flex-col overflow-hidden bg-gradient-to-br from-[#050513] via-[#08071d] to-[#0d0b25]">
          <div className="shrink-0 border-b border-[#211d45] px-4 py-4 md:px-6">
            <header>
              <h2 className="text-2xl font-black tracking-tight">
                {activeTab === "inbox" && "Inbox"}
                {activeTab === "summarized" && "Summarized & Saved"}
              </h2>

              <p className="mt-1 max-w-md text-sm text-indigo-300/70">
                {activeTab === "summarized"
                  ? "Search your saved summaries."
                  : "Search your full Gmail and summarize any result."}
              </p>

              {errorMessage && (
                <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  <span>{errorMessage}</span>

                  <button
                    onClick={() => setErrorMessage("")}
                    className="text-red-200 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
              )}

              {successMessage && (
                <div className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
                  {successMessage}
                </div>
              )}

              <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-3xl border border-indigo-500/20 bg-[#0d0c24] px-5 py-3 shadow-inner shadow-black/30">
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={
                      activeTab === "summarized"
                        ? "Search saved summaries..."
                        : "Search your full Gmail..."
                    }
                    className="w-full bg-transparent text-white outline-none placeholder:text-indigo-300/50"
                  />

                  {searchQuery && (
                    <button
                      onClick={clearSearch}
                      className="text-sm text-indigo-100/70 hover:text-white"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap gap-3">
                  <button
                    onClick={refreshCurrentTab}
                    disabled={refreshing}
                    className={`rounded-3xl px-5 py-3 font-semibold ${
                      refreshing
                        ? "cursor-not-allowed bg-blue-600/50"
                        : "bg-gradient-to-r from-blue-500 to-violet-600 shadow-lg shadow-blue-500/20 hover:opacity-90"
                    }`}
                  >
                    {refreshing ? "Refreshing..." : "Refresh"}
                  </button>

                  <button
                    onClick={fetchWeeklyReport}
                    disabled={weeklyReportLoading}
                    className={`rounded-3xl px-5 py-3 font-semibold ${
                      weeklyReportLoading
                        ? "cursor-not-allowed bg-purple-600/50"
                        : "bg-gradient-to-r from-violet-500 to-fuchsia-600 shadow-lg shadow-violet-500/20 hover:opacity-90"
                    }`}
                  >
                    {weeklyReportLoading ? "Generating..." : "Weekly Report"}
                  </button>

                  <button
                    onClick={openSelectedInGmail}
                    disabled={!hasSelectedEmail}
                    className={`rounded-3xl px-5 py-3 font-semibold ${
                      hasSelectedEmail
                        ? "border border-indigo-500/20 bg-[#0d0c24] text-indigo-100 hover:bg-indigo-500/10"
                        : "cursor-not-allowed bg-indigo-500/10 text-gray-500"
                    }`}
                  >
                    Open in Gmail
                  </button>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
                {CATEGORIES.map((category) => (
                  <button
                    key={category.key}
                    onClick={() => setActiveCategory(category.key)}
                    className={`shrink-0 rounded-full border px-3 py-2 text-sm transition ${
                      activeCategory === category.key
                        ? "border-blue-400 bg-blue-600 text-white"
                        : "border-[#24214a] bg-indigo-500/10 text-indigo-100/70 hover:bg-indigo-500/15"
                    }`}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            </header>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 md:px-6">
            {weeklyReport && (
              <div className="mb-4 max-h-[32vh] shrink-0 overflow-y-auto rounded-3xl border border-purple-500/30 bg-purple-500/10 p-5 overscroll-contain">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-bold uppercase text-purple-300">
                      Weekly Email Report
                    </p>

                    <h3 className="mt-2 text-2xl font-bold">
                      Monday to Today Summary
                    </h3>

                    <p className="mt-1 text-sm text-indigo-100/70">
                      {weeklyReport.range?.from} to {weeklyReport.range?.to} •{" "}
                      {weeklyReport.totalEmails ?? 0} emails scanned
                    </p>
                  </div>

                  <button
                    onClick={() => setWeeklyReport(null)}
                    className="rounded-xl bg-indigo-500/15 px-4 py-2 text-sm font-semibold text-indigo-100 hover:bg-white/20"
                  >
                    Close Report
                  </button>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl bg-black/25 p-4 lg:col-span-2">
                    <h4 className="mb-2 font-semibold">📌 Overall Summary</h4>
                    <p className="whitespace-pre-wrap text-sm text-indigo-100">
                      {weeklyReport.report?.summary || "No summary available."}
                    </p>
                  </div>

                  <div className="rounded-xl bg-black/25 p-4">
                    <h4 className="mb-3 font-semibold">⚠️ Important Emails</h4>
                    {(weeklyReport.report?.importantEmails || []).length ===
                    0 ? (
                      <p className="text-sm text-indigo-300/60">
                        No important emails found.
                      </p>
                    ) : (
                      <ul className="space-y-2 text-sm text-indigo-100">
                        {(weeklyReport.report?.importantEmails || []).map(
                          (item: string, index: number) => (
                            <li
                              key={index}
                              className="rounded-lg bg-indigo-500/10 p-3"
                            >
                              • {item}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-xl bg-black/25 p-4">
                    <h4 className="mb-3 font-semibold">✅ Action Items</h4>
                    {(weeklyReport.report?.actionItems || []).length === 0 ? (
                      <p className="text-sm text-indigo-300/60">
                        No action items found.
                      </p>
                    ) : (
                      <ul className="space-y-2 text-sm text-indigo-100">
                        {(weeklyReport.report?.actionItems || []).map(
                          (item: string, index: number) => (
                            <li
                              key={index}
                              className="rounded-lg bg-indigo-500/10 p-3"
                            >
                              ☐ {item}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-xl bg-black/25 p-4">
                    <h4 className="mb-3 font-semibold">💰 Finance Updates</h4>
                    {(weeklyReport.report?.financeUpdates || []).length ===
                    0 ? (
                      <p className="text-sm text-indigo-300/60">
                        No finance updates found.
                      </p>
                    ) : (
                      <ul className="space-y-2 text-sm text-indigo-100">
                        {(weeklyReport.report?.financeUpdates || []).map(
                          (item: string, index: number) => (
                            <li
                              key={index}
                              className="rounded-lg bg-indigo-500/10 p-3"
                            >
                              • {item}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-xl bg-black/25 p-4">
                    <h4 className="mb-3 font-semibold">💼 Work Updates</h4>
                    {(weeklyReport.report?.workUpdates || []).length === 0 ? (
                      <p className="text-sm text-indigo-300/60">
                        No work updates found.
                      </p>
                    ) : (
                      <ul className="space-y-2 text-sm text-indigo-100">
                        {(weeklyReport.report?.workUpdates || []).map(
                          (item: string, index: number) => (
                            <li
                              key={index}
                              className="rounded-lg bg-indigo-500/10 p-3"
                            >
                              • {item}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-xl bg-black/25 p-4">
                    <h4 className="mb-3 font-semibold">🛒 Shopping Updates</h4>
                    {(weeklyReport.report?.shoppingUpdates || []).length ===
                    0 ? (
                      <p className="text-sm text-indigo-300/60">
                        No shopping updates found.
                      </p>
                    ) : (
                      <ul className="space-y-2 text-sm text-indigo-100">
                        {(weeklyReport.report?.shoppingUpdates || []).map(
                          (item: string, index: number) => (
                            <li
                              key={index}
                              className="rounded-lg bg-indigo-500/10 p-3"
                            >
                              • {item}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-xl bg-black/25 p-4">
                    <h4 className="mb-3 font-semibold">
                      📢 Promotions Summary
                    </h4>
                    <p className="text-sm text-indigo-100">
                      {weeklyReport.report?.promotionsSummary ||
                        "No promotional summary available."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[1.15fr_0.9fr]">
              <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl bg-[#0d0c24]">
                <div className="shrink-0 border-b border-[#24214a] p-4">
                  <h3 className="text-xl font-bold">
                    {activeTab === "summarized"
                      ? "Saved Summaries"
                      : searchQuery.trim()
                        ? "Gmail Search Results"
                        : "Email List"}
                  </h3>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  {loading || gmailSearchLoading ? (
                    <div className="p-5 text-indigo-100/70">Loading...</div>
                  ) : activeTab === "summarized" ? (
                    filteredSummaries.length === 0 ? (
                      <div className="p-5 text-indigo-100/70">
                        No summarized emails found.
                      </div>
                    ) : (
                      filteredSummaries.map((item) => (
                        <button
                          key={item.id}
                          ref={
                            selectedSummary?.id === item.id
                              ? selectedItemRef
                              : null
                          }
                          onClick={() => handleSummaryClick(item)}
                          className={`w-full border-b border-[#24214a] p-5 text-left transition-all ${
                            selectedSummary?.id === item.id
                              ? "border-l-4 border-l-blue-400 bg-blue-600/30"
                              : "hover:bg-blue-600/20"
                          }`}
                        >
                          <h3 className="truncate font-bold">{item.subject}</h3>

                          <p className="mt-1 text-sm text-indigo-300/60">
                            {item.from}
                          </p>

                          <p className="mt-2 inline-flex rounded-full bg-indigo-500/10 px-3 py-1 text-xs text-indigo-100/70">
                            {getCategoryLabel(item.category)}
                          </p>

                          <p className="mt-3 line-clamp-2 text-sm text-indigo-100/70">
                            {item.summary}
                          </p>

                          <div className="mt-2 flex items-center justify-between gap-3">
                            <p className="text-xs text-green-400">Saved</p>

                            <p className="text-xs text-gray-500">
                              {new Date(
                                item.date || item.createdAt,
                              ).toLocaleDateString()}
                            </p>
                          </div>
                        </button>
                      ))
                    )
                  ) : filteredEmails.length === 0 ? (
                    <div className="p-5 text-indigo-100/70">
                      No emails found.
                    </div>
                  ) : (
                    filteredEmails.map((email) => (
                      <button
                        key={email.id}
                        ref={
                          selectedEmail?.id === email.id
                            ? selectedItemRef
                            : null
                        }
                        onClick={() => handleEmailClick(email)}
                        className={`w-full border-b border-[#24214a] p-5 text-left transition-all ${
                          selectedEmail?.id === email.id
                            ? "border-l-4 border-l-blue-400 bg-blue-600/30"
                            : "hover:bg-blue-600/20"
                        }`}
                      >
                        <h3 className="truncate font-bold">{email.subject}</h3>

                        <p className="mt-1 text-sm text-indigo-300/60">
                          {email.from}
                        </p>

                        <p className="mt-2 inline-flex rounded-full bg-indigo-500/10 px-3 py-1 text-xs text-indigo-100/70">
                          {getCategoryLabel(email.category)}
                        </p>

                        <p className="mt-3 line-clamp-2 text-sm text-indigo-100/70">
                          {email.snippet}
                        </p>

                        {email.hasSummary ? (
                          <p className="mt-2 text-xs text-green-400">
                            ✅ Summary Ready
                          </p>
                        ) : (
                          <p className="mt-2 text-xs text-yellow-400">
                            ⏳ Preparing Summary
                          </p>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </section>

              <aside className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-indigo-500/25 bg-[#0d0c24] shadow-2xl shadow-indigo-950/40">
                <div className="shrink-0 flex items-center gap-3 border-b border-indigo-500/20 px-5 py-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-lg text-indigo-300">
                    ⚙️
                  </div>

                  <p className="text-sm font-bold uppercase tracking-[0.25em] text-indigo-300">
                    AI Summary
                  </p>

                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50" />
                </div>

                {!selectedEmail && !selectedSummary ? (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-8 text-center">
                    <div className="relative mb-9">
                      <div className="absolute inset-0 rounded-full bg-indigo-500/40 blur-3xl" />

                      <div className="relative flex h-36 w-36 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 via-violet-600 to-purple-900 shadow-2xl shadow-purple-700/40">
                        <span className="text-6xl drop-shadow-lg">✧</span>
                        <span className="absolute right-10 top-9 text-2xl">
                          ✦
                        </span>
                        <span className="absolute bottom-10 left-10 text-xl">
                          ✦
                        </span>
                      </div>
                    </div>

                    <h3 className="text-xl font-bold text-indigo-100">
                      Select an email to activate AI
                    </h3>

                    <p className="mt-3 max-w-sm text-sm text-indigo-300/70">
                      Instant summaries, key points, action items, key dates and
                      priority detection.
                    </p>

                    <div className="mt-7 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-indigo-400" />
                      <span className="h-2 w-2 rounded-full bg-indigo-500/70" />
                      <span className="h-2 w-2 rounded-full bg-indigo-500/40" />
                    </div>
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto p-5 overscroll-contain">
                    <h2 className="mt-3 text-2xl font-bold">
                      {selectedEmail?.subject || selectedSummary?.subject}
                    </h2>

                    <p className="mt-1 text-sm text-indigo-300/60">
                      {selectedEmail?.from || selectedSummary?.from}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <p className="inline-flex rounded-full bg-indigo-500/10 px-3 py-1 text-xs text-indigo-100/70">
                        {getCategoryLabel(getSelectedCategory())}
                      </p>

                      <p
                        className={`inline-flex rounded-full border px-3 py-1 text-xs ${getUrgencyStyle(
                          urgency,
                        )}`}
                      >
                        {getUrgencyLabel(urgency)}
                      </p>
                    </div>

                    <div className="mt-6 rounded-xl bg-black/25 p-4">
                      <h3 className="mb-3 font-semibold">📝 Summary</h3>

                      {summaryLoading ? (
                        <p className="text-indigo-100/70">
                          Generating summary... cached summaries open instantly.
                        </p>
                      ) : (
                        <p className="whitespace-pre-wrap text-indigo-100">
                          {summary}
                        </p>
                      )}
                    </div>

                    {!summaryLoading && (
                      <>
                        {renderInfoList(
                          "🎯 Key Takeaways",
                          "No key takeaways found.",
                          keyTakeaways,
                        )}
                        {renderInfoList(
                          "🔎 Important Details",
                          "No important details found.",
                          importantDetails,
                        )}
                        {renderInfoList(
                          "🔢 Key Numbers",
                          "No key numbers found.",
                          keyNumbers,
                        )}
                        {renderInfoList(
                          "👥 People",
                          "No people detected.",
                          people,
                        )}
                        {renderInfoList(
                          "🏢 Companies / Apps",
                          "No companies detected.",
                          companies,
                        )}
                        {renderInfoList(
                          "🔗 Links",
                          "No useful links found.",
                          links,
                        )}

                        <div className="mt-4 rounded-xl bg-black/25 p-4">
                          <h3 className="mb-3 font-semibold">
                            📌 Action Items
                          </h3>

                          {actionItems.length === 0 ? (
                            <p className="text-sm text-indigo-300/60">
                              No action items found.
                            </p>
                          ) : (
                            <ul className="space-y-2 text-sm text-indigo-100">
                              {actionItems.map((item, index) => (
                                <li
                                  key={index}
                                  className="rounded-lg bg-indigo-500/10 p-3"
                                >
                                  ☐ {item}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div className="mt-4 rounded-xl bg-black/25 p-4">
                          <h3 className="mb-3 font-semibold">📅 Key Dates</h3>

                          {keyDates.length === 0 ? (
                            <p className="text-sm text-indigo-300/60">
                              No key dates found.
                            </p>
                          ) : (
                            <ul className="space-y-2 text-sm text-indigo-100">
                              {keyDates.map((date, index) => (
                                <li
                                  key={index}
                                  className="rounded-lg bg-indigo-500/10 p-3"
                                >
                                  • {date}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div className="mt-4 rounded-xl bg-black/25 p-4">
                          <h3 className="mb-3 font-semibold">⚡ Urgency</h3>

                          <p
                            className={`inline-flex rounded-full border px-4 py-2 text-sm font-semibold ${getUrgencyStyle(
                              urgency,
                            )}`}
                          >
                            {getUrgencyLabel(urgency)}
                          </p>
                        </div>
                      </>
                    )}

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        onClick={copySummary}
                        disabled={!summary || summaryLoading}
                        className={`rounded-xl px-4 py-2 font-medium transition ${
                          summary && !summaryLoading
                            ? "bg-green-600 text-white hover:bg-green-500"
                            : "cursor-not-allowed bg-gray-700 text-indigo-300/60"
                        }`}
                      >
                        {copied ? "✅ Copied!" : "📋 Copy AI Summary"}
                      </button>

                      <button
                        onClick={unsubscribeSelectedEmail}
                        disabled={!hasSelectedEmail || unsubscribing}
                        className={`rounded-xl px-4 py-2 font-medium transition ${
                          hasSelectedEmail && !unsubscribing
                            ? "bg-orange-600 text-white hover:bg-orange-500"
                            : "cursor-not-allowed bg-gray-700 text-indigo-300/60"
                        }`}
                      >
                        {unsubscribing ? "Unsubscribing..." : "🚫 Unsubscribe"}
                      </button>

                      {selectedSummary && (
                        <button
                          onClick={() => deleteSummary(selectedSummary.id)}
                          disabled={deletingSummary}
                          className={`rounded-xl px-4 py-2 text-white ${
                            deletingSummary
                              ? "cursor-not-allowed bg-red-600/50"
                              : "bg-red-600 hover:bg-red-500"
                          }`}
                        >
                          {deletingSummary ? "Deleting..." : "Delete Summary"}
                        </button>
                      )}

                      <button
                        onClick={clearSelection}
                        className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-500"
                      >
                        Clear Selection
                      </button>
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </div>
        </section>
      </div>

      {showUpgradeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-6xl rounded-3xl bg-[#111827] p-8 text-white shadow-2xl">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-4xl font-bold">Choose Your Plan</h2>

                <p className="mt-2 text-indigo-300/60">
                  Unlock more power as your email volume grows.
                </p>
              </div>

              <button
                onClick={() => setShowUpgradeModal(false)}
                className="rounded-xl bg-indigo-500/15 px-4 py-2 hover:bg-white/20"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-3xl border border-[#24214a] bg-indigo-500/10 p-6">
                <h3 className="text-2xl font-bold">Free</h3>

                <p className="mt-2 text-4xl font-bold">₹0</p>

                <p className="mt-1 text-sm text-indigo-300/60">Forever</p>

                <ul className="mt-6 space-y-3 text-indigo-100/70">
                  <li>✓ 10 summaries/day</li>
                  <li>✓ Inbox access</li>
                  <li>✓ Saved summaries</li>
                  <li>✓ Basic search</li>
                  <li>✕ Advanced AI features</li>
                </ul>
              </div>

              <div className="relative flex min-h-[650px] flex-col rounded-3xl border-2 border-blue-500 bg-blue-600/10 p-6 shadow-lg shadow-blue-500/20">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-500 px-4 py-1 text-xs font-bold">
                  ⭐ MOST POPULAR
                </div>

                <h3 className="text-2xl font-bold">Pro</h3>

                <p className="mt-2 text-4xl font-bold">₹199</p>

                <p className="mt-1 text-sm text-indigo-300/60">per month</p>

                <ul className="mt-6 space-y-3 text-indigo-100/70">
                  <li>✓ 100 summaries/day</li>
                  <li>✓ Priority AI processing</li>
                  <li>✓ Smart categories</li>
                  <li>✓ Action items</li>
                  <li>✓ Key dates</li>
                  <li>✓ Urgency detection</li>
                </ul>

                <button
                  onClick={() => handlePlanSelect("PRO")}
                  className="mt-auto w-full rounded-xl bg-blue-600 py-3 font-semibold hover:bg-blue-500"
                >
                  Choose Pro
                </button>
              </div>

              <div className="flex min-h-[650px] flex-col rounded-3xl border border-purple-500/40 bg-purple-600/10 p-6">
                <h3 className="text-2xl font-bold">Pro+</h3>

                <p className="mt-2 text-4xl font-bold">₹499</p>

                <p className="mt-1 text-sm text-indigo-300/60">per month</p>

                <ul className="mt-6 space-y-3 text-indigo-100/70">
                  <li>✓ Unlimited summaries</li>
                  <li>✓ Multiple Gmail accounts</li>
                  <li>✓ Weekly AI reports</li>
                  <li>✓ PDF exports</li>
                  <li>✓ CSV exports</li>
                  <li>✓ Future AI automations</li>
                  <li>✓ Priority support</li>
                </ul>

                <button
                  onClick={() => handlePlanSelect("PRO_PLUS")}
                  className="mt-auto w-full rounded-xl bg-purple-600 py-3 font-semibold hover:bg-purple-500"
                >
                  Choose Pro+
                </button>
              </div>
            </div>

            <div className="mt-8 rounded-3xl bg-indigo-500/10 p-4 text-center text-sm text-indigo-300/60">
              Payments coming soon. Pricing is placeholder and can be changed
              later.
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
