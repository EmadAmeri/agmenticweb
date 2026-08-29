import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext/browser";
import { aDayInvitationEmail, confirmationEmail, welcomeEmail } from "./email-templates";

type Channel = "email" | "sheet" | "confirmation" | "welcome" | "event";

interface QueuePayload {
  outboxId: string;
  leadId: string;
  channel: Channel;
}

interface QueueJob extends QueuePayload {
  delaySeconds?: number;
}

interface Env {
  LEADS_DB: D1Database;
  LEAD_QUEUE: Queue<QueuePayload>;
  LEAD_EMAIL: SendEmail;
  BREVO_API_KEY: string;
  BREVO_API_URL: string;
  ALLOWED_ORIGINS: string;
  LEAD_SOURCE: string;
  LEAD_CATEGORY: string;
  CAMPAIGN_ID: string;
  NOTIFY_FROM: string;
  NOTIFY_TO: string;
  WELCOME_FROM: string;
  EVENT_FROM: string;
  CUSTOMER_EMAILS_ENABLED: string;
  EVENT_EMAILS_ENABLED: string;
  SHEET_ID: string;
  SHEETS_WEBHOOK_URL?: string;
  SHEETS_WEBHOOK_TOKEN?: string;
  OTP_SECRET: string;
  OTP_EMAIL_SERVICE: Fetcher;
  SHOWCASE_SHEETS_URL: string;
  SHOWCASE_SHEETS_SECRET: string;
}

interface LeadRow {
  id: string;
  email: string;
  source: string;
  category: string;
  campaign_id: string;
  page_url: string;
  created_at: string;
  last_submitted_at: string;
  duplicate_count: number;
  email_status: string;
  sheet_status: string;
  last_error: string;
  country: string;
  welcome_status: string;
  event_status: string;
  confirmation_status: string;
  confirmation_sent_at: string | null;
  confirmed_at: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHOWCASE_SOURCE = "agmentic_showcase";
const SHOWCASE_CATEGORY = "interactive_agent_demo";
const SHOWCASE_CAMPAIGN = "showcase-access-v1";
const OTP_TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_MS = 12 * 60 * 60 * 1000;
const CONFIRMATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EVENT_DELAY_MS = 24 * 60 * 60 * 1000;

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function base64url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function issueAccessToken(email: string, env: Env) {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ email, exp: Date.now() + ACCESS_TTL_MS })));
  return `${payload}.${await sign(payload, env.OTP_SECRET)}`;
}

async function verifyAccessToken(token: string, env: Env) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, await sign(payload, env.OTP_SECRET))) return null;
  try {
    const padded = payload.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((payload.length + 3) % 4);
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)))) as { email?: string; exp?: number };
    return data.email && data.exp && data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

async function issueConfirmationToken(lead: Pick<LeadRow, "id" | "email">, env: Env) {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({
    leadId: lead.id,
    email: normalizeEmail(lead.email),
    purpose: "newsletter-confirmation",
    exp: Date.now() + CONFIRMATION_TTL_MS,
  })));
  return `${payload}.${await sign(payload, env.OTP_SECRET)}`;
}

async function verifyConfirmationToken(token: string, env: Env) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, await sign(payload, env.OTP_SECRET))) return null;
  try {
    const padded = payload.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((payload.length + 3) % 4);
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)))) as {
      leadId?: string;
      email?: string;
      purpose?: string;
      exp?: number;
    };
    return data.leadId && data.email && data.purpose === "newsletter-confirmation" && data.exp && data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

function allowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim());
  return allowed.includes(origin) ? origin : "";
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function formatMunichTimestamp(value: string) {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(new Date(value));
  return formatted.replaceAll("/", ".").replace(", ", " · ");
}

async function enqueueOutbox(env: Env, rows: QueueJob[]) {
  if (!rows.length) return;
  await env.LEAD_QUEUE.sendBatch(rows.map(({ delaySeconds, ...body }) => ({ body, delaySeconds })));
  const now = new Date().toISOString();
  await env.LEADS_DB.batch(
    rows.map((row) =>
      env.LEADS_DB.prepare(
        "UPDATE outbox SET status = 'queued', queued_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
      ).bind(now, now, row.outboxId),
    ),
  );
}

async function acceptLead(request: Request, env: Env, origin: string) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400, origin);
  }

  const email = normalizeEmail(body.email);
  const website = clean(body.website, 200);
  if (website) return json({ ok: true }, 202, origin);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ ok: false, error: "Enter a valid email address." }, 400, origin);
  }

  const now = new Date().toISOString();
  const existing = await env.LEADS_DB.prepare(
    "SELECT id FROM leads WHERE normalized_email = ? AND source = ? AND campaign_id = ? LIMIT 1",
  ).bind(email, env.LEAD_SOURCE, env.CAMPAIGN_ID).first<{ id: string }>();

  const leadId = existing?.id || crypto.randomUUID();
  const pageUrl = clean(body.page_url, 500);
  const userAgent = clean(request.headers.get("User-Agent"), 500);
  const country = clean(request.cf?.country, 2);

  if (existing) {
    await env.LEADS_DB.prepare(
      `UPDATE leads
       SET last_submitted_at = ?, duplicate_count = duplicate_count + 1,
           page_url = CASE WHEN ? = '' THEN page_url ELSE ? END
       WHERE id = ?`,
    ).bind(now, pageUrl, pageUrl, leadId).run();
    return json({ ok: true, lead_id: leadId, duplicate: true }, 202, origin);
  }

  const emailOutboxId = crypto.randomUUID();
  const sheetOutboxId = crypto.randomUUID();
  const confirmationOutboxId = crypto.randomUUID();
  const customerEmailsEnabled = env.CUSTOMER_EMAILS_ENABLED === "true";
  const eventEmailsEnabled = customerEmailsEnabled && env.EVENT_EMAILS_ENABLED === "true";
  await env.LEADS_DB.batch([
    env.LEADS_DB.prepare(
      `INSERT INTO leads
       (id, email, normalized_email, source, category, campaign_id, page_url,
        created_at, last_submitted_at, user_agent, country, confirmation_status,
        welcome_status, event_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      leadId, email, email, env.LEAD_SOURCE, env.LEAD_CATEGORY, env.CAMPAIGN_ID,
      pageUrl, now, now, userAgent, country,
      customerEmailsEnabled ? "pending" : "disabled",
      eventEmailsEnabled ? "awaiting_confirmation" : "paused",
      customerEmailsEnabled ? "awaiting_confirmation" : "disabled",
    ),
    env.LEADS_DB.prepare(
      `INSERT INTO outbox
       (id, lead_id, channel, status, available_at, created_at, updated_at)
       VALUES (?, ?, 'email', 'pending', ?, ?, ?)`,
    ).bind(emailOutboxId, leadId, now, now, now),
    env.LEADS_DB.prepare(
      `INSERT INTO outbox
       (id, lead_id, channel, status, available_at, created_at, updated_at)
       VALUES (?, ?, 'sheet', 'pending', ?, ?, ?)`,
    ).bind(sheetOutboxId, leadId, now, now, now),
    ...(customerEmailsEnabled ? [env.LEADS_DB.prepare(
      `INSERT INTO outbox
       (id, lead_id, channel, status, available_at, created_at, updated_at)
       VALUES (?, ?, 'confirmation', 'pending', ?, ?, ?)`,
    ).bind(confirmationOutboxId, leadId, now, now, now)] : []),
  ]);

  const jobs: QueueJob[] = [
    { outboxId: emailOutboxId, leadId, channel: "email" },
  ];
  if (env.SHEETS_WEBHOOK_URL && env.SHEETS_WEBHOOK_TOKEN) {
    jobs.push({ outboxId: sheetOutboxId, leadId, channel: "sheet" });
  }
  if (customerEmailsEnabled) jobs.push({ outboxId: confirmationOutboxId, leadId, channel: "confirmation" });
  try {
    await enqueueOutbox(env, jobs);
  } catch (error) {
    console.error("initial queue enqueue failed; cron will recover", { leadId, error });
  }

  return json({ ok: true, lead_id: leadId }, 202, origin);
}

async function storeShowcaseLead(request: Request, env: Env, email: string) {
  const now = new Date().toISOString();
  const existing = await env.LEADS_DB.prepare(
    "SELECT id FROM leads WHERE normalized_email = ? AND source = ? AND campaign_id = ? LIMIT 1",
  ).bind(email, SHOWCASE_SOURCE, SHOWCASE_CAMPAIGN).first<{ id: string }>();
  const pageUrl = "https://agmentic.com/showcase/";
  if (existing) {
    await env.LEADS_DB.prepare(
      "UPDATE leads SET last_submitted_at = ?, duplicate_count = duplicate_count + 1 WHERE id = ?",
    ).bind(now, existing.id).run();
    return existing.id;
  }
  const leadId = crypto.randomUUID();
  const emailOutboxId = crypto.randomUUID();
  const sheetOutboxId = crypto.randomUUID();
  await env.LEADS_DB.batch([
    env.LEADS_DB.prepare(
      `INSERT INTO leads
       (id, email, normalized_email, source, category, campaign_id, page_url,
        created_at, last_submitted_at, user_agent, country)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(leadId, email, email, SHOWCASE_SOURCE, SHOWCASE_CATEGORY, SHOWCASE_CAMPAIGN, pageUrl, now, now,
      clean(request.headers.get("User-Agent"), 500), clean(request.cf?.country, 2)),
    env.LEADS_DB.prepare(
      "INSERT INTO outbox (id, lead_id, channel, status, available_at, created_at, updated_at) VALUES (?, ?, 'email', 'pending', ?, ?, ?)",
    ).bind(emailOutboxId, leadId, now, now, now),
    env.LEADS_DB.prepare(
      "INSERT INTO outbox (id, lead_id, channel, status, available_at, created_at, updated_at) VALUES (?, ?, 'sheet', 'pending', ?, ?, ?)",
    ).bind(sheetOutboxId, leadId, now, now, now),
  ]);
  try {
    await enqueueOutbox(env, [
      { outboxId: emailOutboxId, leadId, channel: "email" },
      { outboxId: sheetOutboxId, leadId, channel: "sheet" },
    ]);
  } catch (error) {
    console.error("showcase lead queue enqueue failed; cron will recover", { leadId, error });
  }
  return leadId;
}

function requestIp(request: Request) {
  return clean(request.headers.get("CF-Connecting-IP"), 64) || "unknown";
}

async function requestShowcaseCode(request: Request, env: Env, origin: string) {
  const body = (await request.json().catch(() => null)) as { email?: string; website?: string } | null;
  const email = normalizeEmail(body?.email);
  if (clean(body?.website, 200)) return json({ ok: true }, 202, origin);
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ ok: false, error: "Enter a valid email address." }, 400, origin);

  const ip = requestIp(request);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const minuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
  const latest = await env.LEADS_DB.prepare(
    "SELECT created_at FROM otp_challenges WHERE normalized_email = ? ORDER BY created_at DESC LIMIT 1",
  ).bind(email).first<{ created_at: string }>();
  if (latest?.created_at && latest.created_at > minuteAgo) {
    return json({ ok: false, error: "Please wait one minute before requesting another code." }, 429, origin);
  }
  const emailCount = await env.LEADS_DB.prepare(
    "SELECT COUNT(*) AS count FROM otp_challenges WHERE normalized_email = ? AND created_at >= ?",
  ).bind(email, hourAgo).first<{ count: number }>();
  const ipCount = await env.LEADS_DB.prepare(
    "SELECT COUNT(*) AS count FROM otp_challenges WHERE request_ip = ? AND created_at >= ?",
  ).bind(ip, hourAgo).first<{ count: number }>();
  if ((emailCount?.count || 0) >= 5 || (ipCount?.count || 0) >= 20) {
    return json({ ok: false, error: "Too many code requests. Please try again later." }, 429, origin);
  }

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
  const challengeId = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  const codeHash = await sign(`${challengeId}:${email}:${code}`, env.OTP_SECRET);
  const emailResponse = await env.OTP_EMAIL_SERVICE.fetch("https://sentra.internal/internal/showcase-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Agmentic-Internal": env.OTP_SECRET },
    body: JSON.stringify({ email, code, expiresMinutes: 10 }),
  });
  if (!emailResponse.ok) {
    console.error("showcase otp email failed", { status: emailResponse.status, body: (await emailResponse.text()).slice(0, 200) });
    return json({ ok: false, error: "We couldn't send the access code. Please try again." }, 502, origin);
  }
  await env.LEADS_DB.prepare(
    `INSERT INTO otp_challenges
     (id, normalized_email, code_hash, expires_at, attempts, max_attempts, created_at, request_ip, user_agent)
     VALUES (?, ?, ?, ?, 0, 5, ?, ?, ?)`,
  ).bind(challengeId, email, codeHash, expiresAt, now, ip, clean(request.headers.get("User-Agent"), 500)).run();
  return json({ ok: true, challenge_id: challengeId, expires_in: 600 }, 200, origin);
}

async function verifyShowcaseCode(request: Request, env: Env, origin: string) {
  const body = (await request.json().catch(() => null)) as { email?: string; code?: string; challenge_id?: string } | null;
  const email = normalizeEmail(body?.email);
  const code = clean(body?.code, 6);
  const challengeId = clean(body?.challenge_id, 100);
  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code) || !challengeId) return json({ ok: false, error: "Enter the six-digit code." }, 400, origin);
  const row = await env.LEADS_DB.prepare(
    "SELECT id, code_hash, expires_at, attempts, max_attempts, verified_at FROM otp_challenges WHERE id = ? AND normalized_email = ? LIMIT 1",
  ).bind(challengeId, email).first<{ id: string; code_hash: string; expires_at: string; attempts: number; max_attempts: number; verified_at: string | null }>();
  if (!row || row.verified_at || row.expires_at <= new Date().toISOString() || row.attempts >= row.max_attempts) {
    return json({ ok: false, error: "This code has expired. Request a new one." }, 400, origin);
  }
  const matches = safeEqual(row.code_hash, await sign(`${challengeId}:${email}:${code}`, env.OTP_SECRET));
  if (!matches) {
    await env.LEADS_DB.prepare("UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?").bind(challengeId).run();
    return json({ ok: false, error: "That code is not correct." }, 400, origin);
  }
  const verifiedAt = new Date().toISOString();
  await env.LEADS_DB.prepare("UPDATE otp_challenges SET verified_at = ? WHERE id = ?").bind(verifiedAt, challengeId).run();
  await storeShowcaseLead(request, env, email);
  const accessToken = await issueAccessToken(email, env);
  return json({ ok: true, access_token: accessToken, expires_in: ACCESS_TTL_MS / 1000 }, 200, origin);
}

async function showcaseStatus(request: Request, env: Env, origin: string) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const access = await verifyAccessToken(token, env);
  return access ? json({ ok: true, email: access.email, expires_at: access.exp }, 200, origin) : json({ ok: false }, 401, origin);
}

function buildNotification(lead: LeadRow, env: Env) {
  const message = createMimeMessage();
  message.setSender({ name: "Agmentic Leads", addr: env.NOTIFY_FROM });
  message.setRecipient(env.NOTIFY_TO);
  message.setSubject(`New Agmentic lead — ${lead.email}`);
  message.addMessage({
    contentType: "text/plain",
    data: [
      "New Agmentic lead",
      "",
      `Email: ${lead.email}`,
      `Source: ${lead.source}`,
      `Category: ${lead.category}`,
      `Campaign: ${lead.campaign_id}`,
      `Submitted UTC: ${lead.created_at}`,
      `Lead ID: ${lead.id}`,
    ].join("\n"),
  });
  return new EmailMessage(env.NOTIFY_FROM, env.NOTIFY_TO, message.asRaw());
}

async function sendWelcome(lead: LeadRow, env: Env) {
  if (env.CUSTOMER_EMAILS_ENABLED !== "true") throw new Error("customer_email_delivery_disabled");
  const template = welcomeEmail();
  const response = await fetch(env.BREVO_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { email: env.WELCOME_FROM, name: "Agmentic" },
      to: [{ email: lead.email }],
      replyTo: { email: env.WELCOME_FROM, name: "Agmentic" },
      subject: template.subject,
      htmlContent: template.html,
      textContent: template.text,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 160).replaceAll(env.BREVO_API_KEY, "[redacted]");
    throw new Error(`brevo_welcome_failed_${response.status}_${detail}`);
  }
}

async function sendConfirmation(lead: LeadRow, env: Env) {
  if (env.CUSTOMER_EMAILS_ENABLED !== "true") throw new Error("customer_email_delivery_disabled");
  const token = await issueConfirmationToken(lead, env);
  const template = confirmationEmail(`https://agmentic.com/api/confirm-subscription?token=${encodeURIComponent(token)}`);
  const response = await fetch(env.BREVO_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { email: env.WELCOME_FROM, name: "Agmentic" },
      to: [{ email: lead.email }],
      replyTo: { email: env.WELCOME_FROM, name: "Agmentic" },
      subject: template.subject,
      htmlContent: template.html,
      textContent: template.text,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 160).replaceAll(env.BREVO_API_KEY, "[redacted]");
    throw new Error(`brevo_confirmation_failed_${response.status}_${detail}`);
  }
}

async function sendEventInvitation(lead: LeadRow, env: Env) {
  if (env.CUSTOMER_EMAILS_ENABLED !== "true") throw new Error("customer_email_delivery_disabled");
  if (env.EVENT_EMAILS_ENABLED !== "true") throw new Error("event_email_delivery_disabled");
  const template = aDayInvitationEmail();
  const response = await fetch(env.BREVO_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { email: env.EVENT_FROM, name: "Agmentic Events" },
      to: [{ email: lead.email }],
      replyTo: { email: env.WELCOME_FROM, name: "Agmentic" },
      subject: template.subject,
      htmlContent: template.html,
      textContent: template.text,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 160).replaceAll(env.BREVO_API_KEY, "[redacted]");
    throw new Error(`brevo_event_failed_${response.status}_${detail}`);
  }
}

async function syncSheet(lead: LeadRow, env: Env) {
  if (lead.source === SHOWCASE_SOURCE) {
    const response = await fetch(env.SHOWCASE_SHEETS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agmentic-Internal": env.SHOWCASE_SHEETS_SECRET,
      },
      body: JSON.stringify({
        lead_id: lead.id,
        email: lead.email,
        verified_at: lead.created_at,
        source: lead.source,
        category: lead.category,
        campaign_id: lead.campaign_id,
        country: lead.country,
        duplicate_count: lead.duplicate_count,
        sheet_status: "synced",
        last_error: lead.last_error,
      }),
    });
    if (!response.ok) {
      throw new Error(`showcase_sheet_sync_failed_${response.status}_${(await response.text()).slice(0, 80)}`);
    }
    return;
  }
  if (!env.SHEETS_WEBHOOK_URL || !env.SHEETS_WEBHOOK_TOKEN) {
    throw new Error("sheets_webhook_not_configured");
  }
  const response = await fetch(env.SHEETS_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: env.SHEETS_WEBHOOK_TOKEN,
      sheet_id: env.SHEET_ID,
      lead_id: lead.id,
      email: lead.email,
      source: lead.source,
      category: lead.category,
      campaign_id: lead.campaign_id,
      submitted_at: formatMunichTimestamp(lead.created_at),
      email_status: lead.email_status,
      sheet_status: "synced",
      duplicate_count: lead.duplicate_count,
      last_error: lead.last_error,
    }),
  });
  const text = await response.text();
  if (!response.ok || !text.startsWith("OK")) {
    throw new Error(`sheet_sync_failed_${response.status}_${text.slice(0, 80)}`);
  }
}

function confirmationPage(state: "confirmed" | "already-confirmed" | "invalid") {
  const title = state === "confirmed" ? "Email confirmed." : state === "already-confirmed" ? "You’re already confirmed." : "This link is no longer valid.";
  const detail = state === "confirmed"
    ? "Welcome to Agmentic. Keep an eye on your inbox for what’s next."
    : state === "already-confirmed"
      ? "Nothing else to do — you’re already on the list."
      : "The confirmation link may have expired. Return to Agmentic and submit your email again.";
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Agmentic</title><style>html{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;background:#080a07;color:#f4f3ed;font-family:Arial,Helvetica,sans-serif;padding:24px}.card{width:min(620px,100%);border:1px solid #26311d;background:#0b0e09;padding:clamp(32px,7vw,64px)}.brand{font-size:12px;font-weight:700;letter-spacing:3px}.mark,.eyebrow{color:#c7ff00}.mark{font-size:24px;letter-spacing:-1px;margin-right:12px}.line{width:42px;height:2px;background:#c7ff00;margin:48px 0 26px}h1{font-size:clamp(42px,8vw,68px);line-height:.98;letter-spacing:-3px;margin:0 0 24px}p{color:#c8cbc2;font-size:17px;line-height:1.65;margin:0 0 32px}a{display:inline-block;border-radius:999px;background:#c7ff00;color:#080a07;padding:14px 24px;text-decoration:none;text-transform:uppercase;font-size:12px;font-weight:800;letter-spacing:1px}</style></head><body><main class="card"><div class="brand"><span class="mark">A!</span>AGMENTIC</div><div class="line"></div><div class="eyebrow">WHAT’S NEXT</div><h1>${title}</h1><p>${detail}</p><a href="https://agmentic.com">Back to Agmentic&nbsp; →</a></main></body></html>`, {
    status: state === "invalid" ? 400 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

async function confirmSubscription(request: Request, env: Env) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const verified = await verifyConfirmationToken(token, env);
  if (!verified) return confirmationPage("invalid");

  const lead = await env.LEADS_DB.prepare(
    "SELECT * FROM leads WHERE id = ? AND normalized_email = ? AND source = ? AND campaign_id = ? LIMIT 1",
  ).bind(verified.leadId, normalizeEmail(verified.email), env.LEAD_SOURCE, env.CAMPAIGN_ID).first<LeadRow>();
  if (!lead || lead.confirmation_status === "legacy") return confirmationPage("invalid");
  if (lead.confirmation_status === "confirmed") return confirmationPage("already-confirmed");

  const now = new Date().toISOString();
  const welcomeOutboxId = crypto.randomUUID();
  const eventEmailsEnabled = env.EVENT_EMAILS_ENABLED === "true";
  const eventAvailableAt = new Date(Date.now() + EVENT_DELAY_MS).toISOString();
  const eventOutboxId = crypto.randomUUID();
  await env.LEADS_DB.batch([
    env.LEADS_DB.prepare(
      `UPDATE leads SET confirmation_status = 'confirmed', confirmed_at = ?, confirmed_ip = ?,
       confirmed_user_agent = ?, consent_version = 'homepage-double-opt-in-v1',
       welcome_status = 'pending', event_status = ?, last_error = ''
       WHERE id = ? AND confirmation_status IN ('pending', 'sent')`,
    ).bind(now, requestIp(request), clean(request.headers.get("User-Agent"), 500), eventEmailsEnabled ? "pending" : "paused", lead.id),
    env.LEADS_DB.prepare(
      `INSERT OR IGNORE INTO outbox
       (id, lead_id, channel, status, available_at, created_at, updated_at)
       VALUES (?, ?, 'welcome', 'pending', ?, ?, ?)`,
    ).bind(welcomeOutboxId, lead.id, now, now, now),
    ...(eventEmailsEnabled ? [env.LEADS_DB.prepare(
      `INSERT OR IGNORE INTO outbox
       (id, lead_id, channel, status, available_at, created_at, updated_at)
       VALUES (?, ?, 'event', 'pending', ?, ?, ?)`,
    ).bind(eventOutboxId, lead.id, eventAvailableAt, now, now)] : []),
  ]);

  const welcomeOutbox = await env.LEADS_DB.prepare(
    "SELECT id FROM outbox WHERE lead_id = ? AND channel = 'welcome' LIMIT 1",
  ).bind(lead.id).first<{ id: string }>();
  if (welcomeOutbox) {
    try {
      await enqueueOutbox(env, [{ outboxId: welcomeOutbox.id, leadId: lead.id, channel: "welcome" }]);
    } catch (error) {
      console.error("welcome enqueue after confirmation failed; cron will recover", { leadId: lead.id, error });
    }
  }
  return confirmationPage("confirmed");
}

async function processMessage(message: Message<QueuePayload>, env: Env) {
  const payload = message.body;
  const outbox = await env.LEADS_DB.prepare(
    "SELECT status FROM outbox WHERE id = ? AND lead_id = ? AND channel = ?",
  ).bind(payload.outboxId, payload.leadId, payload.channel).first<{ status: string }>();
  if (!outbox || outbox.status === "done") {
    message.ack();
    return;
  }

  const lead = await env.LEADS_DB.prepare("SELECT * FROM leads WHERE id = ?")
    .bind(payload.leadId).first<LeadRow>();
  if (!lead) {
    message.ack();
    return;
  }

  if (payload.channel === "event" && env.EVENT_EMAILS_ENABLED !== "true") {
    const now = new Date().toISOString();
    await env.LEADS_DB.batch([
      env.LEADS_DB.prepare(
        "UPDATE outbox SET status = 'pending', updated_at = ?, last_error = 'event_email_delivery_paused' WHERE id = ?",
      ).bind(now, payload.outboxId),
      env.LEADS_DB.prepare("UPDATE leads SET event_status = 'paused' WHERE id = ?").bind(lead.id),
    ]);
    message.ack();
    return;
  }

  if (payload.channel === "confirmation" || payload.channel === "welcome" || payload.channel === "event") {
    const suppression = await env.LEADS_DB.prepare(
      "SELECT normalized_email FROM email_suppressions WHERE normalized_email = ? LIMIT 1",
    ).bind(normalizeEmail(lead.email)).first<{ normalized_email: string }>();
    if (suppression) {
      const now = new Date().toISOString();
      const statusColumn = payload.channel === "confirmation" ? "confirmation_status" : payload.channel === "welcome" ? "welcome_status" : "event_status";
      await env.LEADS_DB.batch([
        env.LEADS_DB.prepare(
          "UPDATE outbox SET status = 'suppressed', processed_at = ?, updated_at = ?, last_error = 'manual_email_hold' WHERE id = ?",
        ).bind(now, now, payload.outboxId),
        env.LEADS_DB.prepare(
          `UPDATE leads SET ${statusColumn} = 'held' WHERE id = ?`,
        ).bind(lead.id),
      ]);
      message.ack();
      return;
    }
  }

  const now = new Date().toISOString();
  await env.LEADS_DB.prepare(
    "UPDATE outbox SET status = 'processing', attempts = attempts + 1, updated_at = ? WHERE id = ?",
  ).bind(now, payload.outboxId).run();

  try {
    if (payload.channel === "email") {
      await env.LEAD_EMAIL.send(buildNotification(lead, env));
      await env.LEADS_DB.prepare("UPDATE leads SET email_status = 'sent', last_error = '' WHERE id = ?")
        .bind(lead.id).run();
    } else if (payload.channel === "confirmation") {
      await sendConfirmation(lead, env);
      await env.LEADS_DB.prepare("UPDATE leads SET confirmation_status = 'sent', confirmation_sent_at = ?, last_error = '' WHERE id = ?")
        .bind(now, lead.id).run();
    } else if (payload.channel === "welcome") {
      await sendWelcome(lead, env);
      await env.LEADS_DB.prepare("UPDATE leads SET welcome_status = 'sent', welcome_sent_at = ?, last_error = '' WHERE id = ?")
        .bind(now, lead.id).run();
    } else if (payload.channel === "event") {
      await sendEventInvitation(lead, env);
      await env.LEADS_DB.prepare("UPDATE leads SET event_status = 'sent', event_sent_at = ?, last_error = '' WHERE id = ?")
        .bind(now, lead.id).run();
    } else {
      await syncSheet(lead, env);
      await env.LEADS_DB.prepare("UPDATE leads SET sheet_status = 'synced', last_error = '' WHERE id = ?")
        .bind(lead.id).run();
    }
    await env.LEADS_DB.prepare(
      "UPDATE outbox SET status = 'done', processed_at = ?, updated_at = ?, last_error = '' WHERE id = ?",
    ).bind(now, now, payload.outboxId).run();
    message.ack();
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 500) : "unknown_delivery_error";
    const isConfigurationError = detail === "sheets_webhook_not_configured" || detail === "customer_email_delivery_disabled";
    await env.LEADS_DB.batch([
      env.LEADS_DB.prepare(
        `UPDATE outbox SET status = ?, updated_at = ?, last_error = ? WHERE id = ?`,
      ).bind(isConfigurationError ? "pending" : "queued", now, detail, payload.outboxId),
      env.LEADS_DB.prepare(
        `UPDATE leads SET ${payload.channel === "email" ? "email_status" : payload.channel === "confirmation" ? "confirmation_status" : payload.channel === "welcome" ? "welcome_status" : payload.channel === "event" ? "event_status" : "sheet_status"} = 'failed', last_error = ? WHERE id = ?`,
      ).bind(detail, lead.id),
    ]);
    if (isConfigurationError) {
      message.ack();
      return;
    }
    message.retry({ delaySeconds: 60 });
  }
}

async function reconcile(env: Env) {
  const stale = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const rows = await env.LEADS_DB.prepare(
    `SELECT id, lead_id, channel FROM outbox
     WHERE available_at <= ? AND attempts < 10
       AND (status = 'pending' OR (status = 'processing' AND updated_at < ?))
     ORDER BY created_at ASC LIMIT 100`,
  ).bind(now, stale).all<{ id: string; lead_id: string; channel: Channel }>();
  const deliverable = rows.results.filter((row) => {
    if (row.channel === "sheet") return Boolean(env.SHEETS_WEBHOOK_URL && env.SHEETS_WEBHOOK_TOKEN);
    if (row.channel === "event") return env.CUSTOMER_EMAILS_ENABLED === "true" && env.EVENT_EMAILS_ENABLED === "true";
    if (row.channel === "confirmation" || row.channel === "welcome") return env.CUSTOMER_EMAILS_ENABLED === "true";
    return true;
  });
  await enqueueOutbox(env, deliverable.map((row) => ({
    outboxId: row.id,
    leadId: row.lead_id,
    channel: row.channel,
  })));
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if ((request.method === "GET" || request.method === "HEAD") &&
        (url.pathname === "/A!-D" || url.pathname === "/A!-D/")) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "https://lu.ma/o9g57q0b",
          "Cache-Control": "public, max-age=300",
        },
      });
    }
    if (request.method === "GET" && url.pathname === "/api/confirm-subscription") {
      return confirmSubscription(request, env);
    }
    const origin = allowedOrigin(request, env);
    if (!origin) return new Response("Forbidden", { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== "POST") return json({ ok: false }, 405, origin);
    const pathname = new URL(request.url).pathname;
    if (pathname.endsWith("/api/showcase-access/request-code")) return requestShowcaseCode(request, env, origin);
    if (pathname.endsWith("/api/showcase-access/verify-code")) return verifyShowcaseCode(request, env, origin);
    if (pathname.endsWith("/api/showcase-access/status")) return showcaseStatus(request, env, origin);
    return acceptLead(request, env, origin);
  },

  async queue(batch: MessageBatch<QueuePayload>, env: Env) {
    await Promise.all(batch.messages.map((message) => processMessage(message, env)));
  },

  async scheduled(_controller: ScheduledController, env: Env) {
    await reconcile(env);
  },
} satisfies ExportedHandler<Env, QueuePayload>;
