import { DEMO_DATA } from "./demo-data";

interface Env {
  RESEND_API_KEY: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  SENTRA_DEMO_LINK?: string;
  SENTRA_NOTIFY_EMAIL?: string;
  SENTRA_FROM_EMAIL?: string;
  ALLOWED_ORIGIN?: string;
}

type CompanyMetric = (typeof DEMO_DATA.companyMetrics)[number];
type AttendeeMetric = (typeof DEMO_DATA.attendeeMetrics)[number];
type TopicMetric = (typeof DEMO_DATA.topicMetrics)[number];
type KnowledgeRow = (typeof DEMO_DATA.knowledgeBase)[number];

const DEFAULT_FROM = "sentra@agmentic.com";
const DEFAULT_ALLOWED_ORIGIN = "https://agmentic.com";
const DEFAULT_DEMO_LINK = "https://agmentic.com/chatbot/";
const DEFAULT_NOTIFY_EMAIL = "em.ameri94@gmail.com";
const DEFAULT_GROQ_MODEL = "groq/compound-mini";
const USAGE_LIMIT_MESSAGE =
  "The AI demo has currently reached its usage limit or is temporarily unavailable. Please try again shortly.";

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

function requesterTemplate(email: string, demoLink?: string) {
  const accessSection = demoLink
    ? `
      <div style="margin: 24px 0 20px;">
        <a href="${demoLink}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#D89A3D;color:#111827;text-decoration:none;font-size:14px;font-weight:600;">
          See it work →
        </a>
      </div>
      <p style="font-size:12px;line-height:1.7;color:rgba(237,232,223,.62);margin:0;">
        If the button doesn't open, use this link:<br />
        <a href="${demoLink}" style="color:#EDE8DF;text-decoration:none;">${demoLink}</a>
      </p>
    `
    : `
      <p style="font-size:14px;line-height:1.8;color:rgba(237,232,223,.72);margin:0;">
        We received your request and will send your Sentra demo link shortly.
      </p>
    `;

  return `
    <div style="margin:0;padding:24px;background:#0B1020;">
      <div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;background:linear-gradient(180deg,#11192E 0%,#0E1527 100%);color:#EDE8DF;border:1px solid rgba(237,232,223,.12);border-radius:20px;padding:32px 24px;box-sizing:border-box;">
        <p style="font-family:Inter,Segoe UI,Arial,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#D89A3D;margin:0 0 14px;">By Agmentic</p>
        <p style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.1;font-weight:700;color:#EDE8DF;margin:0 0 6px;">Sentra</p>
        <h1 style="font-size:34px;line-height:1.02;font-weight:700;letter-spacing:-0.03em;margin:0 0 14px;color:#F3EEE6;">See what Sentra knows.</h1>
        <p style="font-family:Inter,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.7;color:rgba(237,232,223,.72);margin:0 0 10px;">
          Open the link below, ask questions, and see real answers in about two minutes.
        </p>
        <p style="font-family:Inter,Segoe UI,Arial,sans-serif;font-size:13px;line-height:1.7;color:rgba(237,232,223,.58);margin:0 0 4px;">
          Requested for <strong>${email}</strong>
        </p>
        ${accessSection}
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid rgba(237,232,223,.08);font-family:Inter,Segoe UI,Arial,sans-serif;font-size:12px;line-height:1.7;color:rgba(237,232,223,.52);">
          If you didn't request this email, you can safely ignore it.
        </div>
      </div>
    </div>
  `;
}

function notifyTemplate(email: string, demoLink?: string) {
  return `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#FFFFFF;color:#13203A;border-radius:16px;border:1px solid rgba(19,32,58,.08);">
      <p style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#842029;margin:0 0 12px;">New Request</p>
      <h1 style="font-size:22px;margin:0 0 16px;">Sentra demo access requested</h1>
      <p style="font-size:14px;line-height:1.7;margin:0 0 8px;"><strong>Email:</strong> ${email}</p>
      <p style="font-size:14px;line-height:1.7;margin:0;">${demoLink ? `<strong>Demo link:</strong> ${demoLink}` : "No demo link configured yet."}</p>
    </div>
  `;
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

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

function compactContext(text: string) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const compact: string[] = [];
  let used = 0;
  const budget = 1800;
  for (const line of lines) {
    const snippet = line.slice(0, 220);
    const size = snippet.length + 1;
    if (used + size > budget) break;
    compact.push(snippet);
    used += size;
  }
  return compact.join("\n");
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

async function rewriteWithGroq(question: string, answer: string, sources: string[], env: Env) {
  if (!env.GROQ_API_KEY) {
    return { answer: null as string | null, error: "missing_api_key" };
  }

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
          content:
            "You are Sentra, a decision-intelligence assistant. Answer only from the grounded context provided. Do not invent companies, people, metrics, or recommendations. Write clean plain text for a simple chat bubble UI. Do not use markdown tables, pipes, bold markers, code fences, or source lists. Prefer one short intro sentence followed by compact numbered items or hyphen bullets.",
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
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase() || "";

  if (!isValidEmail(email)) {
    return json({ error: "Invalid email address" }, 400, origin);
  }

  if (!env.RESEND_API_KEY) {
    return json({ error: "Email service is not configured" }, 500, origin);
  }

  const demoLink = env.SENTRA_DEMO_LINK?.trim() || DEFAULT_DEMO_LINK;
  const from = env.SENTRA_FROM_EMAIL?.trim() || DEFAULT_FROM;
  const notifyEmail = env.SENTRA_NOTIFY_EMAIL?.trim() || DEFAULT_NOTIFY_EMAIL;

  await sendEmail(env.RESEND_API_KEY, {
    from,
    to: [email],
    subject: "Your Sentra demo link",
    html: requesterTemplate(email, demoLink),
  });

  if (notifyEmail) {
    await sendEmail(env.RESEND_API_KEY, {
      from,
      to: [notifyEmail],
      subject: `New Sentra demo access request: ${email}`,
      html: notifyTemplate(email, demoLink),
    });
  }

  return json({ success: true, message: "Demo access email sent" }, 200, origin);
}

async function handleChat(request: Request, env: Env, origin: string) {
  const body = (await request.json().catch(() => null)) as { question?: string } | null;
  const question = body?.question?.trim() || "";
  const grounded = groundedAnswer(question);

  const groqResult = await rewriteWithGroq(question, grounded.answer, grounded.sources, env);
  if (groqResult.answer) {
    return json(
      {
        answer: groqResult.answer,
        sources: grounded.sources,
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

async function handleHornbachOrchestrate(request: Request, env: Env, origin: string) {
  const body = (await request.json().catch(() => null)) as { message?: string } | null;
  const message = body?.message?.trim() || "";

  if (!message) {
    return json({ error: "message is required" }, 400, origin);
  }

  if (!env.GROQ_API_KEY) {
    return json({ error: "AI router is not configured" }, 500, origin);
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "AgmenticHornbachDemo/1.0",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      temperature: 0.1,
      max_tokens: 260,
      messages: [
        {
          role: "system",
          content:
            "You are an orchestration router for a DIY retail demo. Read one customer message and return only valid JSON. Detect whether the question is sales, operations, or hybrid. Extract project, family, color, city, areaSqm, and quantityIntent. Keep values short and lowercase where possible. A hybrid question combines product advice with stock, store, pickup, or delivery intent.",
        },
        {
          role: "user",
          content: message,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "hornbach_orchestration_plan",
          strict: true,
          schema: {
            type: "object",
            properties: {
              routeType: {
                type: "string",
                enum: ["sales", "operations", "hybrid"],
              },
              confidence: { type: "number" },
              summary: { type: "string" },
              entities: {
                type: "object",
                properties: {
                  project: { type: ["string", "null"] },
                  family: { type: ["string", "null"] },
                  color: { type: ["string", "null"] },
                  city: { type: ["string", "null"] },
                  areaSqm: { type: ["number", "null"] },
                  quantityIntent: { type: "boolean" },
                },
                required: ["project", "family", "color", "city", "areaSqm", "quantityIntent"],
                additionalProperties: false,
              },
              signals: {
                type: "array",
                items: { type: "string" },
              },
              tasks: {
                type: "object",
                properties: {
                  sales: { type: ["string", "null"] },
                  operations: { type: ["string", "null"] },
                },
                required: ["sales", "operations"],
                additionalProperties: false,
              },
            },
            required: ["routeType", "confidence", "summary", "entities", "signals", "tasks"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    return json({ error: `Groq request failed with status ${response.status}` }, 502, origin);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    return json({ error: "AI router returned an empty response" }, 502, origin);
  }

  return json(
    {
      provider: "groq",
      model: "openai/gpt-oss-20b",
      plan: JSON.parse(content),
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

      if (url.pathname.endsWith("/api/hornbach-orchestrate")) {
        return await handleHornbachOrchestrate(request, env, origin);
      }

      return json({ error: "Not found" }, 404, origin);
    } catch (error) {
      console.error("sentra worker error", error);
      return json({ error: "The request could not be completed right now." }, 500, origin);
    }
  },
};
