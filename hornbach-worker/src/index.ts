interface Env {
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  ALLOWED_ORIGIN?: string;
}

const DEFAULT_ALLOWED_ORIGIN = "https://agmentic.com";
const DEFAULT_GROQ_MODEL = "groq/compound-mini";

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

function extractJsonObject(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  return text.trim();
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

  const model = env.GROQ_MODEL || DEFAULT_GROQ_MODEL;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "AgmenticHornbachDemo/1.0",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 260,
      messages: [
        {
          role: "system",
          content:
            'You are an orchestration router for a DIY retail demo. Read one customer message and return only a single JSON object with no extra text. Detect whether the question is sales, operations, or hybrid. Extract project, family, color, city, areaSqm, and quantityIntent. Keep values short and lowercase where possible. A hybrid question combines product advice with stock, store, pickup, or delivery intent. Return this exact shape: {"routeType":"sales|operations|hybrid","confidence":0.0,"summary":"...","entities":{"project":null,"family":null,"color":null,"city":null,"areaSqm":null,"quantityIntent":false},"signals":[],"tasks":{"sales":null,"operations":null}}',
        },
        {
          role: "user",
          content: message,
        },
      ],
    }),
  });

  if (!response.ok) {
    return json({ error: `Groq request failed with status ${response.status}: ${await response.text()}` }, 502, origin);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    return json({ error: "AI router returned an empty response" }, 502, origin);
  }

  let plan: unknown;
  try {
    plan = JSON.parse(extractJsonObject(content));
  } catch {
    return json({ error: `AI router returned invalid JSON: ${content}` }, 502, origin);
  }

  return json(
    {
      provider: "groq",
      model,
      plan,
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
      if (url.pathname.endsWith("/api/hornbach-orchestrate")) {
        return await handleHornbachOrchestrate(request, env, origin);
      }

      return json({ error: "Not found" }, 404, origin);
    } catch (error) {
      console.error("hornbach worker error", error);
      return json({ error: "The request could not be completed right now." }, 500, origin);
    }
  },
};
