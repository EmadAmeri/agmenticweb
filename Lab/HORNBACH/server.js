const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8000);
const ROOT = __dirname;
const GROQ_API_KEY = loadEnvKey() || process.env.GROQ_API_KEY || "";
const MODEL = "openai/gpt-oss-20b";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/api/orchestrate") {
      const body = await readJson(req);
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) {
        return sendJson(res, 400, { error: "message is required" });
      }

      const aiPlan = GROQ_API_KEY ? await getGroqPlan(message) : null;
      return sendJson(res, 200, {
        provider: aiPlan ? "groq" : "fallback",
        model: aiPlan ? MODEL : null,
        plan: aiPlan,
      });
    }

    if (req.method === "GET") {
      return serveStatic(url.pathname, res);
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, {
      error: "Server error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, () => {
  console.log(`HORNBACH MVP server running on http://127.0.0.1:${PORT}`);
});

async function getGroqPlan(message) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You are an AI router for a DIY retail assistant. Extract customer intent and output only schema-compliant JSON. Focus on project type, product family, quantity-sizing intent, store/availability intent, city, color, and area. Route to sales for product advice, operations for stock/delivery/store checks, and hybrid when both are present. Keep text concise and in English.",
        },
        {
          role: "user",
          content: message,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "orchestration_plan",
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
    const errorText = await response.text();
    throw new Error(`Groq API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Groq returned no content");
  }

  return JSON.parse(content);
}

function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(ROOT, path.normalize(safePath));
  if (!filePath.startsWith(ROOT)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "text/plain; charset=utf-8" });
    res.end(data);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function loadEnvKey() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) {
    return "";
  }

  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(/^GROQ_API_KEY=(.+)$/m);
  return match ? match[1].trim() : "";
}
