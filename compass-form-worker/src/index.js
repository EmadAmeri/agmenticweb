import { EmailMessage } from "cloudflare:email";
import { Mailbox, createMimeMessage } from "mimetext/browser";

const ALLOWED_ORIGIN = "https://agmentic.com";
const FROM_EMAIL = "hello@agmentic.com";
const DESTINATION_EMAIL = "hello@agmentic.com";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8",
      "Vary": "Origin"
    }
  });
}

function isAllowedOrigin(request) {
  return request.headers.get("Origin") === ALLOWED_ORIGIN;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "Invalid JSON body." };
  }

  const allowedFields = new Set(["name", "company", "email", "message", "website"]);
  const hasUnknownField = Object.keys(payload).some((key) => !allowedFields.has(key));

  if (hasUnknownField) {
    return { ok: false, error: "Unexpected field." };
  }

  const name = clean(payload.name);
  const company = clean(payload.company);
  const email = clean(payload.email);
  const message = clean(payload.message);
  const website = clean(payload.website);

  if (!name || !company || !email) {
    return { ok: false, error: "Name, company, and email are required." };
  }

  if (!isEmail(email)) {
    return { ok: false, error: "Email is invalid." };
  }

  if (message.length > 3000) {
    return { ok: false, error: "Message is too long." };
  }

  return {
    ok: true,
    data: { name, company, email, message, website }
  };
}

function buildEmail({ name, company, email, message }) {
  const msg = createMimeMessage();
  const body = [
    "New Compass request",
    "",
    `Name: ${name}`,
    `Company: ${company}`,
    `Email: ${email}`,
    "",
    "Message:",
    message || "(No message provided.)"
  ].join("\n");

  msg.setSender({ name: "Agmentic Compass", addr: FROM_EMAIL });
  msg.setRecipient(DESTINATION_EMAIL);
  msg.setHeader("Reply-To", new Mailbox(email));
  msg.setSubject(`Compass request — ${name}, ${company}`);
  msg.addMessage({
    contentType: "text/plain",
    data: body
  });

  return new EmailMessage(FROM_EMAIL, DESTINATION_EMAIL, msg.asRaw());
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return isAllowedOrigin(request)
        ? jsonResponse({ ok: true })
        : jsonResponse({ ok: false }, 403);
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false }, 405);
    }

    if (!isAllowedOrigin(request)) {
      return jsonResponse({ ok: false }, 403);
    }

    let payload;

    try {
      payload = await request.json();
    } catch (error) {
      return jsonResponse({ ok: false }, 400);
    }

    const validated = validatePayload(payload);

    if (!validated.ok) {
      return jsonResponse({ ok: false }, 400);
    }

    if (validated.data.website) {
      return jsonResponse({ ok: true });
    }

    try {
      await env.CONTACT_EMAIL.send(buildEmail(validated.data));
      return jsonResponse({ ok: true });
    } catch (error) {
      console.error("Compass email send failed", {
        code: error?.code,
        message: error?.message
      });
      return jsonResponse({ ok: false }, 500);
    }
  }
};
