import { DEMO_DATA } from "./demo-data";
import { MEMBER_DATA } from "./member-data";

interface Env {
  RESEND_API_KEY: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  ABSTRACT_API_KEY?: string;
  SENTRA_DEMO_LINK?: string;
  SENTRA_NOTIFY_EMAIL?: string;
  SENTRA_FROM_EMAIL?: string;
  ALLOWED_ORIGIN?: string;
  GOOGLE_SHEETS_WEBHOOK_URL?: string;
  GOOGLE_SHEETS_WEBHOOK_TOKEN?: string;
}

type CompanyMetric = (typeof DEMO_DATA.companyMetrics)[number];
type AttendeeMetric = (typeof DEMO_DATA.attendeeMetrics)[number];
type TopicMetric = (typeof DEMO_DATA.topicMetrics)[number];
type KnowledgeRow = (typeof DEMO_DATA.knowledgeBase)[number];
type MemberMetric = (typeof MEMBER_DATA.accountMetrics)[number];
type DemoKind = "events" | "members";

const DEFAULT_FROM = "sentra@agmentic.com";
const DEFAULT_ALLOWED_ORIGIN = "https://agmentic.com";
const DEFAULT_DEMO_LINK = "https://agmentic.com/sentra/events/demo/";
const DEFAULT_NOTIFY_EMAIL = "em.ameri94@gmail.com";
const DEFAULT_GROQ_MODEL = "groq/compound-mini";
const USAGE_LIMIT_MESSAGE =
  "The AI demo has currently reached its usage limit or is temporarily unavailable. Please try again shortly.";
const DEFAULT_REPLY_TO = "hello@agmentic.com";
const ABSTRACT_ENDPOINT = "https://emailreputation.abstractapi.com/v1/";

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
    },
  });
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isLikelyDeliverableEmail(email: string) {
  if (!isValidEmail(email)) return false;
  const [, domain = ""] = email.split("@");
  if (!domain || domain.length < 4) return false;
  if (!domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;
  if (domain.includes("..")) return false;
  const tld = domain.split(".").pop() || "";
  return tld.length >= 2;
}

async function hasMailExchange(email: string) {
  const [, domain = ""] = email.split("@");
  if (!domain) return false;

  const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, {
    headers: {
      Accept: "application/dns-json",
    },
  });

  if (!response.ok) {
    throw new Error(`mx_lookup_failed_${response.status}`);
  }

  const data = (await response.json()) as {
    Status?: number;
    Answer?: Array<{ type?: number }>;
  };

  if (data.Status !== 0) return false;
  return Boolean(data.Answer?.some((answer) => answer.type === 15));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function notifyTemplate(
  details: {
    email: string;
    pageCategory: string;
    industryLabel: string;
    salesLane: string;
    sheetStatus: string;
    verificationSummary: string;
  },
  demoLink?: string,
) {
  const safeEmail = escapeHtml(details.email);
  const safePageCategory = escapeHtml(details.pageCategory);
  const safeIndustryLabel = escapeHtml(details.industryLabel);
  const safeSalesLane = escapeHtml(details.salesLane);
  const safeSheetStatus = escapeHtml(details.sheetStatus);
  const safeVerificationSummary = escapeHtml(details.verificationSummary);
  const safeDemoLink = demoLink ? escapeHtml(demoLink) : "";
  return `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#FFFFFF;color:#13203A;border-radius:16px;border:1px solid rgba(19,32,58,.08);">
      <p style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#842029;margin:0 0 12px;">New Request</p>
      <h1 style="font-size:22px;margin:0 0 16px;">Sentra demo access requested</h1>
      <p style="font-size:14px;line-height:1.7;margin:0 0 8px;"><strong>Email:</strong> ${safeEmail}</p>
      <p style="font-size:14px;line-height:1.7;margin:0 0 8px;"><strong>Page category:</strong> ${safePageCategory}</p>
      <p style="font-size:14px;line-height:1.7;margin:0 0 8px;"><strong>Industry:</strong> ${safeIndustryLabel}</p>
      <p style="font-size:14px;line-height:1.7;margin:0 0 8px;"><strong>Sales lane:</strong> ${safeSalesLane}</p>
      <p style="font-size:14px;line-height:1.7;margin:0 0 8px;"><strong>Verification:</strong> ${safeVerificationSummary}</p>
      <p style="font-size:14px;line-height:1.7;margin:0 0 8px;"><strong>Google Sheet:</strong> ${safeSheetStatus}</p>
      <p style="font-size:14px;line-height:1.7;margin:0;">${demoLink ? `<strong>Demo link:</strong> ${safeDemoLink}` : "No demo link configured yet."}</p>
    </div>
  `;
}

type AbstractValidationResult = {
  accepted: boolean;
  status: string;
  statusDetail: string;
  qualityScore: number | null;
  isSmtpValid: boolean;
  isMxValid: boolean;
  isFormatValid: boolean;
  isDisposable: boolean;
  isCatchall: boolean;
  isFreeEmail: boolean;
};

async function validateWithAbstract(email: string, apiKey: string) {
  const url = new URL(ABSTRACT_ENDPOINT);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("email", email);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`abstract_http_${response.status}`);
  }

  const data = (await response.json()) as {
    email_deliverability?: {
      status?: string;
      status_detail?: string;
      is_format_valid?: boolean;
      is_smtp_valid?: boolean;
      is_mx_valid?: boolean;
    };
    email_quality?: {
      score?: number;
      is_free_email?: boolean;
      is_disposable?: boolean;
      is_catchall?: boolean;
    };
  };

  const deliverability = data.email_deliverability || {};
  const quality = data.email_quality || {};
  const status = deliverability.status || "unknown";
  const isFormatValid = Boolean(deliverability.is_format_valid);
  const isMxValid = Boolean(deliverability.is_mx_valid);
  const isSmtpValid = Boolean(deliverability.is_smtp_valid);
  const isDisposable = Boolean(quality.is_disposable);
  const isCatchall = Boolean(quality.is_catchall);
  const isFreeEmail = Boolean(quality.is_free_email);
  const qualityScore = typeof quality.score === "number" ? quality.score : null;
  const accepted =
    isFormatValid &&
    isMxValid &&
    !isDisposable &&
    (status === "deliverable" || isSmtpValid || (status === "unknown" && isCatchall));

  return {
    accepted,
    status,
    statusDetail: deliverability.status_detail || "",
    qualityScore,
    isSmtpValid,
    isMxValid,
    isFormatValid,
    isDisposable,
    isCatchall,
    isFreeEmail,
  } satisfies AbstractValidationResult;
}

function buildVerificationSummary(result: AbstractValidationResult) {
  const parts = [
    `status=${result.status}`,
    `smtp=${result.isSmtpValid ? "yes" : "no"}`,
    `mx=${result.isMxValid ? "yes" : "no"}`,
  ];

  if (result.isDisposable) parts.push("disposable=yes");
  if (result.isCatchall) parts.push("catchall=yes");
  if (result.qualityScore !== null) parts.push(`score=${result.qualityScore}`);

  return parts.join(", ");
}

async function appendLeadToGoogleSheet(
  env: Env,
  payload: {
    token: string;
    requestedAt: string;
    email: string;
    pageCategory: string;
    industry: string;
    industryLabel: string;
    salesLane: string;
    origin: string;
    userAgent: string;
    mxCheckPassed: boolean;
    abstractStatus: string;
    abstractStatusDetail: string;
    abstractIsSmtpValid: boolean;
    abstractIsMxValid: boolean;
    abstractIsDisposable: boolean;
    abstractIsCatchall: boolean;
    abstractIsFreeEmail: boolean;
    abstractQualityScore: number | null;
  },
) {
  if (!env.GOOGLE_SHEETS_WEBHOOK_URL) {
    throw new Error("google_sheets_webhook_missing");
  }

  const response = await fetch(env.GOOGLE_SHEETS_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.text()).trim();
  let parsed: { success?: boolean; error?: string } | null = null;
  try {
    parsed = body ? (JSON.parse(body) as { success?: boolean; error?: string }) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new Error(`google_sheets_http_${response.status}:${body}`);
  }

  if (!parsed?.success) {
    throw new Error(`google_sheets_rejected:${parsed?.error || body || "unknown_error"}`);
  }

  return "saved";
}

async function sendEmail(apiKey: string, payload: Record<string, unknown>) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(responseText);
  }

  try {
    return JSON.parse(responseText) as { id?: string };
  } catch {
    return { id: undefined };
  }
}

function notifyText(email: string, demoLink?: string) {
  return [
    "New Sentra demo access request",
    "",
    `Email: ${email}`,
    demoLink ? `Demo link: ${demoLink}` : "No demo link configured yet.",
  ].join("\n");
}

function compactContext(text: string) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const compact: string[] = [];
  let used = 0;
  const budget = 3200;
  for (const line of lines) {
    const snippet = line.slice(0, 220);
    const size = snippet.length + 1;
    if (used + size > budget) break;
    compact.push(snippet);
    used += size;
  }
  return compact.join("\n");
}

function formatUsd(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function memberRiskReason(member: MemberMetric) {
  const reasons: string[] = [];
  if (member.status === "churned") reasons.push(`churn already recorded${member.churn_reason ? ` (${member.churn_reason})` : ""}`);
  if (member.urgent_high_tickets >= 2) reasons.push(`${member.urgent_high_tickets} urgent/high support tickets`);
  else if (member.urgent_high_tickets === 1) reasons.push("one urgent/high support ticket");
  if (member.escalations > 0) reasons.push(`${member.escalations} escalation${member.escalations === 1 ? "" : "s"}`);
  if (member.avg_satisfaction !== null && member.avg_satisfaction < 3.5) reasons.push(`low satisfaction (${member.avg_satisfaction})`);
  if (member.total_usage < 80) reasons.push("very low product usage");
  else if (member.total_usage < 200) reasons.push("soft product usage");
  if (member.error_count > 30) reasons.push(`${member.error_count} usage errors`);
  if (!member.auto_renew) reasons.push("auto-renew is off");
  if (member.is_trial) reasons.push("still in trial");
  return reasons.length ? reasons.join(", ") : "healthy usage and support signals";
}

function memberAction(member: MemberMetric) {
  if (member.status === "churned") return "Run a win-back or loss-analysis conversation before spending expansion effort.";
  if (member.risk_score >= 45) return "Prioritize a retention call this week with support context and usage recovery steps.";
  if (member.urgent_high_tickets || member.escalations) return "Have customer success review the open support pattern before renewal outreach.";
  if (member.total_usage < 200) return "Send targeted enablement around the features they already use, then check adoption again.";
  if (member.mrr >= 3000) return "Protect the relationship with executive check-in and expansion discovery.";
  return "Keep in nurture and monitor usage, tickets, and renewal signals.";
}

function findMembers(question: string) {
  const q = question.toLowerCase();
  return MEMBER_DATA.accountMetrics
    .map((member) => {
      const haystack = `${member.account_name} ${member.account_id} ${member.industry} ${member.country} ${member.plan_tier} ${member.status}`.toLowerCase();
      let score = 0;
      if (q.includes(member.account_name.toLowerCase())) score += 10;
      if (q.includes(member.account_id.toLowerCase())) score += 12;
      for (const token of q.split(/\s+/)) {
        if (token && haystack.includes(token)) score += 1;
      }
      return { member, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.member.risk_score - a.member.risk_score)
    .slice(0, 5)
    .map((item) => item.member);
}

function isMemberDatasetQuestion(lowered: string) {
  return ["dataset", "data files", "what data", "available data", "loaded data", "csv"].some((term) => lowered.includes(term));
}

function isMemberRiskQuestion(lowered: string) {
  return ["risk", "at risk", "churn", "cancel", "renewal", "drifting", "low engagement", "save", "retain"].some((term) => lowered.includes(term));
}

function isMemberValueQuestion(lowered: string) {
  return ["mrr", "arr", "revenue", "highest value", "top value", "enterprise", "valuable"].some((term) => lowered.includes(term));
}

function isMemberUsageQuestion(lowered: string) {
  return ["usage", "feature", "adoption", "engaged", "most engaged", "errors"].some((term) => lowered.includes(term));
}

function isMemberSupportQuestion(lowered: string) {
  return ["support", "ticket", "urgent", "escalation", "satisfaction"].some((term) => lowered.includes(term));
}

function describeMember(member: MemberMetric, index?: number) {
  const prefix = typeof index === "number" ? `${index + 1}. ` : "";
  const features = member.top_features.length ? member.top_features.join(", ") : "no clear feature concentration";
  return [
    `${prefix}${member.account_name} (${member.account_id}) | ${member.plan_tier} | ${member.country} | MRR ${formatUsd(member.mrr)} | risk ${member.risk_score}`,
    `   Signals: ${memberRiskReason(member)}.`,
    `   Usage/support: ${member.total_usage} usage actions, ${member.error_count} errors, ${member.support_tickets} tickets, satisfaction ${member.avg_satisfaction ?? "n/a"}, top features: ${features}.`,
    `   Action: ${memberAction(member)}`,
  ].join("\n");
}

function groundedMemberAnswer(question: string) {
  const lowered = question.trim().toLowerCase();
  if (!lowered) {
    return {
      answer: "Ask me about member churn risk, renewals, usage, support tickets, revenue, plan tiers, countries, industries, or the loaded datasets.",
      sources: [] as string[],
    };
  }

  if (isMemberDatasetQuestion(lowered)) {
    const lines = [
      "The membership demo is grounded in these Ravenstack datasets:",
      "",
      ...Object.entries(MEMBER_DATA.datasetCounts).map(([name, count]) => `- ${name}: ${count} rows`),
      "",
      `Across those files I can see ${MEMBER_DATA.summary.account_count} accounts, ${MEMBER_DATA.summary.subscription_count} subscriptions, ${MEMBER_DATA.summary.usage_event_count} feature-usage events, ${MEMBER_DATA.summary.support_ticket_count} support tickets, and ${MEMBER_DATA.summary.churn_event_count} churn events.`,
    ];
    return { answer: lines.join("\n"), sources: Object.keys(MEMBER_DATA.datasetCounts) };
  }

  if (isMemberRiskQuestion(lowered)) {
    const requested = lowered.includes("10") || lowered.includes("ten") ? 10 : 5;
    const top = MEMBER_DATA.topRiskAccounts.slice(0, requested);
    const lines = [
      `These are the ${top.length} member accounts I would treat as highest retention risk from the Ravenstack data:`,
      "",
      ...top.map((member, index) => describeMember(member, index)),
    ];
    return {
      answer: lines.join("\n"),
      sources: ["ravenstack_accounts.csv", "ravenstack_subscriptions.csv", "ravenstack_feature_usage.csv", "ravenstack_support_tickets.csv", "ravenstack_churn_events.csv"],
    };
  }

  if (isMemberValueQuestion(lowered)) {
    const top = MEMBER_DATA.topValueAccounts.slice(0, 5);
    const lines = [
      "These are the highest-value member accounts by current MRR in the loaded data:",
      "",
      ...top.map((member, index) => describeMember(member, index)),
    ];
    return { answer: lines.join("\n"), sources: ["ravenstack_accounts.csv", "ravenstack_subscriptions.csv"] };
  }

  if (isMemberUsageQuestion(lowered)) {
    const lines = [
      "Usage signals from the membership dataset:",
      "",
      "Most-used features:",
      ...MEMBER_DATA.topFeatures.slice(0, 7).map((feature, index) => `${index + 1}. ${feature.feature_name} | usage ${feature.usage_count} | errors ${feature.error_count}`),
      "",
      "Most engaged accounts:",
      ...MEMBER_DATA.topUsageAccounts.slice(0, 5).map((member, index) => `${index + 1}. ${member.account_name} | ${member.total_usage} usage actions | ${member.usage_events} events | MRR ${formatUsd(member.mrr)}`),
    ];
    return { answer: lines.join("\n"), sources: ["ravenstack_feature_usage.csv", "ravenstack_subscriptions.csv", "ravenstack_accounts.csv"] };
  }

  if (isMemberSupportQuestion(lowered)) {
    const supportHeavy = MEMBER_DATA.accountMetrics
      .filter((member) => member.support_tickets > 0)
      .sort((a, b) => b.urgent_high_tickets - a.urgent_high_tickets || b.escalations - a.escalations || b.support_tickets - a.support_tickets)
      .slice(0, 5);
    const lines = [
      "Support pressure is concentrated in these accounts:",
      "",
      ...supportHeavy.map((member, index) => describeMember(member, index)),
      "",
      "Ticket mix:",
      ...MEMBER_DATA.supportPriorities.map((item) => `- ${item.priority}: ${item.count}`),
    ];
    return { answer: lines.join("\n"), sources: ["ravenstack_support_tickets.csv", "ravenstack_accounts.csv"] };
  }

  if (lowered.includes("summary") || lowered.includes("overview") || lowered.includes("health")) {
    const lines = [
      "Here is the current membership health snapshot from the loaded data:",
      "",
      `- Accounts: ${MEMBER_DATA.summary.account_count}`,
      `- Active accounts: ${MEMBER_DATA.summary.active_accounts}`,
      `- Churned accounts: ${MEMBER_DATA.summary.churned_accounts}`,
      `- At-risk active accounts: ${MEMBER_DATA.summary.at_risk_accounts}`,
      `- Total MRR: ${formatUsd(MEMBER_DATA.summary.total_mrr)}`,
      `- Total ARR: ${formatUsd(MEMBER_DATA.summary.total_arr)}`,
      `- Average risk score: ${MEMBER_DATA.summary.avg_risk_score}`,
      `- Average support satisfaction: ${MEMBER_DATA.summary.avg_satisfaction}`,
      "",
      "Top churn reasons:",
      ...MEMBER_DATA.churnReasons.map((item) => `- ${item.reason_code}: ${item.count}`),
    ];
    return { answer: lines.join("\n"), sources: Object.keys(MEMBER_DATA.datasetCounts) };
  }

  const memberMatches = findMembers(question);
  if (memberMatches.length) {
    const member = memberMatches[0];
    return {
      answer: [`Here is the current member profile I found in the Ravenstack data:`, "", describeMember(member)].join("\n"),
      sources: ["ravenstack_accounts.csv", "ravenstack_subscriptions.csv", "ravenstack_feature_usage.csv", "ravenstack_support_tickets.csv", "ravenstack_churn_events.csv"],
    };
  }

  return {
    answer:
      "I could not find enough evidence in the current membership dataset to answer that confidently.\n\nTry asking about churn risk, renewals, highest-value members, support tickets, feature usage, plan tiers, countries, industries, or a specific account name such as Company_0.",
    sources: [],
  };
}

function scoreCompany(company: CompanyMetric) {
  return company.priority_score;
}

function buildCompanyRationale(company: CompanyMetric) {
  const parts: string[] = [];
  if (company.attendee_count >= 3) parts.push("strong representation");
  else if (company.attendee_count >= 1) parts.push("at least one attendee");
  if (company.c_level_count >= 1) parts.push("decision-makers present");
  else if (company.head_director_count >= 1) parts.push("senior operators represented");
  if (company.engagement_events >= 4) parts.push("engagement above baseline");
  else if (company.engagement_events >= 1) parts.push("some behavioral engagement");
  if (company.ticket_revenue_eur >= 1000) parts.push("clear ticket-spend signal");
  if (company.is_sponsor) parts.push(`already a sponsor (${company.sponsor_tier ?? "tier unknown"})`);
  return parts.length ? parts.join(", ") : "limited raw signals";
}

function companyAction(company: CompanyMetric) {
  if (company.is_sponsor) return "Run a sponsor success and expansion conversation.";
  if (company.c_level_count >= 1 && company.engagement_events >= 2) return "Prioritize executive outreach with a tailored invitation.";
  if (company.attendee_count >= 1) return "Keep warm with targeted follow-up and qualification.";
  return "Monitor for more interaction before prioritizing.";
}

function findCompanies(question: string) {
  const q = question.toLowerCase();
  return DEMO_DATA.companyMetrics
    .map((company) => {
      const haystack = `${company.company_name} ${company.company_id} ${company.segment} ${company.company_type} ${company.country}`.toLowerCase();
      let score = 0;
      if (q.includes(company.company_name.toLowerCase())) score += 10;
      if (q.includes(company.company_id.toLowerCase())) score += 10;
      for (const token of q.split(/\s+/)) {
        if (token && haystack.includes(token)) score += 1;
      }
      return { company, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || scoreCompany(b.company) - scoreCompany(a.company))
    .slice(0, 5)
    .map((item) => item.company);
}

function findKnowledge(question: string) {
  const q = question.toLowerCase();
  return DEMO_DATA.knowledgeBase
    .map((row) => {
      const haystack = `${row.title} ${row.text}`.toLowerCase();
      let score = 0;
      if (q.includes(row.title.toLowerCase())) score += 8;
      for (const token of q.split(/\s+/)) {
        if (token && haystack.includes(token)) score += 1;
      }
      return { row, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((item) => item.row);
}

function isCompanyListQuestion(lowered: string) {
  const companyTerms = ["company", "companies", "firms", "accounts", "sponsors"];
  const shortlistTerms = ["top", "best", "invite", "invitation", "shortlist", "list", "priority", "prioritize", "dinner", "meeting", "outreach"];
  return companyTerms.some((term) => lowered.includes(term)) && shortlistTerms.some((term) => lowered.includes(term));
}

function isAttendeeListQuestion(lowered: string) {
  const peopleTerms = ["who", "people", "person", "attendee", "contact", "contacts"];
  const actionTerms = ["follow up", "follow-up", "invite", "talk", "meet", "outreach", "next", "this week"];
  return peopleTerms.some((term) => lowered.includes(term)) && actionTerms.some((term) => lowered.includes(term));
}

function isTopicQuestion(lowered: string) {
  return lowered.includes("topic") || (lowered.includes("focus") && lowered.includes("deserve")) || (lowered.includes("focus") && lowered.includes("what"));
}

function isDatasetQuestion(lowered: string) {
  return ["dataset", "data files", "what data", "available data", "loaded data"].some((term) => lowered.includes(term));
}

function groundedAnswer(question: string) {
  const lowered = question.trim().toLowerCase();
  if (!lowered) {
    return {
      answer: "Ask me about companies, attendees, topics, datasets, tickets, sponsors, or lead handling.",
      sources: [] as string[],
    };
  }

  if (isDatasetQuestion(lowered)) {
    const lines = ["The live demo currently uses these data sources:"];
    for (const [name, count] of Object.entries(DEMO_DATA.datasetCounts)) {
      lines.push(`- ${name}: ${count} rows`);
    }
    return { answer: lines.join("\n"), sources: Object.keys(DEMO_DATA.datasetCounts).slice(0, 6) };
  }

  if (isCompanyListQuestion(lowered)) {
    const requested = lowered.includes("10") || lowered.includes("ten") ? 10 : 5;
    const top = DEMO_DATA.companyMetrics.filter((company) => company.attendee_count > 0).slice(0, requested);
    const context = lowered.includes("dinner") ? "for a dinner invite list" : "for priority outreach";
    const lines = [`Here are the top ${top.length} companies I would shortlist ${context}, based on the raw demo event data:`, ""];
    top.forEach((company, index) => {
      lines.push(
        `${index + 1}. ${company.company_name} | C-level: ${company.c_level_count} | head/director: ${company.head_director_count} | engagement: ${company.engagement_events} | ticket revenue: EUR ${company.ticket_revenue_eur}`,
      );
      lines.push(`   Why: ${buildCompanyRationale(company)}.`);
      lines.push(`   Action: ${companyAction(company)}`);
    });
    return {
      answer: lines.join("\n"),
      sources: ["companies.csv", "attendees.csv", "tickets.csv", "session_engagement.csv", "sponsors.csv"],
    };
  }

  if (isAttendeeListQuestion(lowered)) {
    const top = DEMO_DATA.attendeeMetrics.slice(0, 5);
    const lines = ["These are the top 5 people I would follow up with next from the raw demo event data:", ""];
    top.forEach((person, index) => {
      lines.push(
        `${index + 1}. ${person.name} | ${person.job_title} at ${person.company_name} | ${person.seniority} | engagement: ${person.engagement_events} | sessions: ${person.unique_sessions_attended}`,
      );
    });
    lines.push("");
    lines.push("This list is ranked from attendee seniority and observed session engagement.");
    return { answer: lines.join("\n"), sources: ["attendees.csv", "tickets.csv", "session_engagement.csv"] };
  }

  if (isTopicQuestion(lowered)) {
    const lines = ["These are the topics that deserve the most focus based on raw session attendance data:", ""];
    DEMO_DATA.topicMetrics.slice(0, 5).forEach((topic, index) => {
      lines.push(
        `${index + 1}. ${topic.topic} | engagement events: ${topic.engagement_events} | unique companies: ${topic.unique_companies} | sessions: ${topic.session_count}`,
      );
    });
    lines.push("");
    lines.push("This ranking is computed from actual attendance patterns across sessions and companies.");
    return { answer: lines.join("\n"), sources: ["sessions.csv", "session_engagement.csv", "attendees.csv"] };
  }

  const companyMatches = findCompanies(question);
  if (companyMatches.length) {
    const company = companyMatches[0];
    const attendees = DEMO_DATA.attendeeMetrics
      .filter((attendee) => attendee.company_id === company.company_id)
      .slice(0, 4);
    const lines = [
      `Here is the current demo view of ${company.company_name}:`,
      "",
      `- Segment: ${company.segment} | Type: ${company.company_type} | Country: ${company.country}`,
      `- Attendees: ${company.attendee_count} | C-level: ${company.c_level_count} | Head/Director: ${company.head_director_count}`,
      `- Engagement events: ${company.engagement_events} | Unique sessions: ${company.unique_sessions_attended}`,
      `- Tickets: ${company.ticket_count} | Ticket revenue: EUR ${company.ticket_revenue_eur}`,
      `- Sponsor status: ${company.is_sponsor ? company.sponsor_tier ?? "Sponsor" : "Not a sponsor"}`,
      "",
      `Interpretation: ${buildCompanyRationale(company)}.`,
      `Recommended action: ${companyAction(company)}`,
    ];
    if (attendees.length) {
      lines.push("");
      lines.push("Relevant people from this company:");
      attendees.forEach((person) => {
        lines.push(`- ${person.name} (${person.job_title}) | ${person.seniority} | engagement: ${person.engagement_events}`);
      });
    }
    return {
      answer: lines.join("\n"),
      sources: ["companies.csv", "attendees.csv", "tickets.csv", "session_engagement.csv", "sponsors.csv"],
    };
  }

  const knowledgeMatches = findKnowledge(question);
  if (knowledgeMatches.length) {
    const lines = ["Here is the closest process or policy guidance from the demo knowledge base:", ""];
    knowledgeMatches.forEach((row) => {
      lines.push(`- ${row.title}: ${row.text}`);
    });
    return { answer: lines.join("\n"), sources: ["knowledge_base.csv"] };
  }

  return {
    answer:
      "I could not find enough evidence in the current demo dataset to answer that confidently.\n\nTry asking about a company, who to invite next, which topics are attracting the most engagement, sponsorship packages, tickets, GDPR, or lead handling.",
    sources: [],
  };
}

async function rewriteWithGroq(question: string, answer: string, sources: string[], env: Env, demoKind: DemoKind) {
  if (!env.GROQ_API_KEY) {
    return { answer: null as string | null, error: "missing_api_key" };
  }
  const systemPrompt =
    demoKind === "members"
      ? "You are Sentra for membership and subscription teams. Answer only from the grounded Ravenstack membership context provided. Do not invent accounts, metrics, churn reasons, usage, support tickets, or recommendations. Write clean plain text for a simple chat bubble UI. Do not use markdown tables, pipes, bold markers, code fences, or source lists. Prefer one short intro sentence followed by compact numbered items or hyphen bullets. Keep the language focused on retention, renewals, member health, product usage, support pressure, and next best actions."
      : "You are Sentra, a decision-intelligence assistant for conference teams. Answer only from the grounded event context provided. Do not invent companies, people, metrics, or recommendations. Write clean plain text for a simple chat bubble UI. Do not use markdown tables, pipes, bold markers, code fences, or source lists. Prefer one short intro sentence followed by compact numbered items or hyphen bullets.";

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "AgmenticSentraDemo/1.0",
    },
    body: JSON.stringify({
      model: env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
      temperature: 0.15,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `User question:\n${question}\n\nGrounded context:\n${compactContext(answer)}\n\nSources:\n${sources.join(", ") || "None"}\n\nRewrite this as a polished assistant answer while staying faithful to the grounded context. Keep it concise, readable, and well-structured in plain text.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return { answer: null as string | null, error: `http_${response.status}:${await response.text()}` };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  return { answer: content ?? null, error: content ? null : "invalid_response" };
}

async function handleDemoAccess(request: Request, env: Env, origin: string) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    pageCategory?: string;
    industry?: string;
    industryLabel?: string;
    salesLane?: string;
  } | null;
  const email = normalizeEmail(body?.email || "");
  const pageCategory = body?.pageCategory?.trim() || "generic";
  const industry = body?.industry?.trim() || "generic";
  const industryLabel = body?.industryLabel?.trim() || "Generic";
  const salesLane = body?.salesLane?.trim() || "Shared qualification";

  if (!isLikelyDeliverableEmail(email)) {
    return json({ error: "Invalid email address" }, 400, origin);
  }

  let hasMx = false;
  try {
    hasMx = await hasMailExchange(email);
  } catch (error) {
    console.error("sentra mx lookup error", { email, error });
    return json({ error: "We couldn't verify this email domain right now. Please try again." }, 502, origin);
  }

  if (!hasMx) {
    return json({ error: "Please enter a reachable work email address." }, 400, origin);
  }

  if (!env.RESEND_API_KEY) {
    return json({ error: "Email service is not configured" }, 500, origin);
  }

  if (!env.ABSTRACT_API_KEY) {
    return json({ error: "Email verification is not configured" }, 500, origin);
  }

  if (!env.GOOGLE_SHEETS_WEBHOOK_URL || !env.GOOGLE_SHEETS_WEBHOOK_TOKEN) {
    return json({ error: "Google Sheet storage is not configured" }, 500, origin);
  }

  const demoLink = env.SENTRA_DEMO_LINK?.trim() || DEFAULT_DEMO_LINK;
  const fromAddress = env.SENTRA_FROM_EMAIL?.trim() || DEFAULT_FROM;
  const from = fromAddress.includes("<") ? fromAddress : `Sentra by Agmentic <${fromAddress}>`;
  const notifyEmail = env.SENTRA_NOTIFY_EMAIL?.trim() || DEFAULT_NOTIFY_EMAIL;
  const replyTo = DEFAULT_REPLY_TO;
  const requestedAt = new Date().toISOString();

  let abstractResult: AbstractValidationResult;
  try {
    abstractResult = await validateWithAbstract(email, env.ABSTRACT_API_KEY);
  } catch (error) {
    console.error("sentra abstract verification error", { email, error });
    return json({ error: "We couldn't complete email verification right now. Please try again." }, 502, origin);
  }

  if (!abstractResult.accepted) {
    return json({ error: "Please enter a real, reachable email address." }, 400, origin);
  }

  let sheetStatus = "saved";
  try {
    sheetStatus = await appendLeadToGoogleSheet(env, {
      token: env.GOOGLE_SHEETS_WEBHOOK_TOKEN,
      requestedAt,
      email,
      pageCategory,
      industry,
      industryLabel,
      salesLane,
      origin,
      userAgent: request.headers.get("User-Agent") || "",
      mxCheckPassed: true,
      abstractStatus: abstractResult.status,
      abstractStatusDetail: abstractResult.statusDetail,
      abstractIsSmtpValid: abstractResult.isSmtpValid,
      abstractIsMxValid: abstractResult.isMxValid,
      abstractIsDisposable: abstractResult.isDisposable,
      abstractIsCatchall: abstractResult.isCatchall,
      abstractIsFreeEmail: abstractResult.isFreeEmail,
      abstractQualityScore: abstractResult.qualityScore,
    });
  } catch (error) {
    console.error("sentra google sheet storage error", { email, error });
    return json({ error: "We couldn't save your request right now. Please try again." }, 502, origin);
  }

  console.log("sentra demo request stored in google sheet", {
    email,
    requestedAt,
    abstractStatus: abstractResult.status,
  });

  if (notifyEmail) {
    try {
      const notifyResult = await sendEmail(env.RESEND_API_KEY, {
        from,
        to: [notifyEmail],
        reply_to: replyTo,
        subject: `New Sentra demo access request: ${email}`,
        html: notifyTemplate(
          {
            email,
            pageCategory,
            industryLabel,
            salesLane,
            sheetStatus,
            verificationSummary: buildVerificationSummary(abstractResult),
          },
          demoLink,
        ),
        text: [
          notifyText(email, demoLink),
          `Page category: ${pageCategory}`,
          `Industry: ${industryLabel}`,
          `Sales lane: ${salesLane}`,
          `Verification: ${buildVerificationSummary(abstractResult)}`,
          `Google Sheet: ${sheetStatus}`,
        ].join("\n"),
      });
      console.log("sentra notify email accepted", { email, notifyEmail, resendId: notifyResult.id ?? null });
    } catch (error) {
      sheetStatus = "saved, notify_failed";
      console.error("sentra notify email failed", { email, error });
    }
  }

  return json(
    {
      success: true,
      message: "Demo access granted",
      demoLink,
      verified: true,
      stored: true,
      notifyStatus: sheetStatus,
    },
    200,
    origin,
  );
}

async function handleChat(request: Request, env: Env, origin: string) {
  const body = (await request.json().catch(() => null)) as { question?: string; demoType?: string } | null;
  const question = body?.question?.trim() || "";
  const demoKind: DemoKind = body?.demoType === "members" ? "members" : "events";
  const grounded = demoKind === "members" ? groundedMemberAnswer(question) : groundedAnswer(question);

  const groqResult = await rewriteWithGroq(question, grounded.answer, grounded.sources, env, demoKind);
  if (groqResult.answer) {
    return json(
      {
        answer: groqResult.answer,
        sources: grounded.sources,
        demo_type: demoKind,
        llm_provider: "groq",
        llm_model: env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
      },
      200,
      origin,
    );
  }

  return json(
    {
      answer: USAGE_LIMIT_MESSAGE,
      sources: [],
      llm_provider: "unavailable",
      llm_error: groqResult.error,
    },
    200,
    origin,
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") || env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, origin);
    }

    try {
      if (url.pathname.endsWith("/api/sentra-demo-access")) {
        return await handleDemoAccess(request, env, origin);
      }

      if (url.pathname.endsWith("/api/sentra-chat")) {
        return await handleChat(request, env, origin);
      }

      return json({ error: "Not found" }, 404, origin);
    } catch (error) {
      console.error("sentra worker error", error);
      return json({ error: "The request could not be completed right now." }, 500, origin);
    }
  },
};
