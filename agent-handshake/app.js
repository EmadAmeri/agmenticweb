const API_BASE = window.localStorage?.getItem("agmentic_agent_handshake_api_base") || window.location.origin;

const sampleMenu = `Snacks | Oyster tartlet | cucumber, finger lime, jalapeno | 9
Starter | Burrata | smoked tomato, basil oil, toasted sourdough | 16
Starter | Beetroot carpaccio | horseradish cream, hazelnut, dill | 14
Main | Sea bass | saffron beurre blanc, fennel, caviar oil | 34
Main | Dry-aged duck | cherry jus, endive, potato millefeuille | 38
Dessert | Chocolate souffle | vanilla ice cream, cacao nib | 13
Wine | Riesling Kabinett | Mosel, citrus, slate | 12`;

const defaultScenario = {
  retailer_name: "Maison Lumiere",
  consumer_name: "Consumer Dining Agent",
  distance_m: 130,
  consumer_intent: "anniversary dinner for two",
  consumer_preferences: ["quiet table", "vegetarian starter", "wine pairing"],
  menu_text: sampleMenu,
  promotions: [{
    name: "Chef welcome pairing",
    type: "percentage",
    value: 12,
    rule: "Use for parties of 2+ before 19:00 or when the consumer asks for wine pairing.",
  }],
};

const els = {
  status: document.querySelector("#status"),
  timeline: document.querySelector("#timeline"),
  connectedAgents: document.querySelector("#connectedAgents"),
  agentLanguage: document.querySelector("#agentLanguage"),
  englishFeed: document.querySelector("#englishFeed"),
  toast: document.querySelector("#toast"),
  pulseDot: document.querySelector("#pulseDot"),
};

let eventSource = null;
let fallbackTimers = [];
const events = [];

function payload() {
  return typeof structuredClone === "function"
    ? structuredClone(defaultScenario)
    : JSON.parse(JSON.stringify(defaultScenario));
}

async function startLive() {
  stopStream();
  resetFeeds();
  setStatus("Registering");

  try {
    const scenario = payload();
    const retailer = await postJson("/api/agents/retailer", {
      name: scenario.retailer_name,
      menu_text: scenario.menu_text,
      promotions: scenario.promotions,
      radius_m: 450,
    });
    const consumer = await postJson("/api/agents/consumer", {
      name: scenario.consumer_name,
      intent: scenario.consumer_intent,
      preferences: scenario.consumer_preferences,
    });
    setStatus("Connecting");
    const connection = await postJson("/api/connections", {
      retailer_agent_id: retailer.id,
      consumer_agent_id: consumer.id,
      distance_m: scenario.distance_m,
    });

    setStatus("Live");
    els.pulseDot.classList.add("active");
    eventSource = new EventSource(`${API_BASE}/api/connections/${connection.connection_id}/events`);
    eventSource.onmessage = (message) => {
      const event = JSON.parse(message.data);
      if (event.type === "error") {
        showToast(event.message || "Connection failed.");
        setStatus("Error");
        stopStream();
        return;
      }
      if (event.type === "complete") {
        setStatus("Complete");
        els.pulseDot.classList.remove("active");
        stopStream();
        return;
      }
      pushEvent(event);
    };
    eventSource.onerror = () => {
      showToast("Backend stream disconnected. Showing browser fallback.");
      startFallbackLive();
    };
  } catch (error) {
    showToast("Backend unavailable on GitHub Pages. Showing browser fallback.");
    startFallbackLive();
  }
}

async function postJson(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => response.statusText);
    throw new Error(details || response.statusText);
  }

  return response.json();
}

function startFallbackLive() {
  stopStream();
  setStatus("Live");
  els.pulseDot.classList.add("active");
  buildFallbackEvents(payload()).forEach((event, index, allEvents) => {
    const timer = window.setTimeout(() => {
      pushEvent(event);
      if (index === allEvents.length - 1) {
        setStatus("Complete");
        els.pulseDot.classList.remove("active");
      }
    }, index * 1150);
    fallbackTimers.push(timer);
  });
}

function pushEvent(event) {
  events.push(event);
  renderEvent(event);
  renderFeeds();
}

function renderEvent(event) {
  if (event.speaker === "system" || els.connectedAgents.textContent.trim()) {
    return;
  }

  els.connectedAgents.hidden = false;
  els.connectedAgents.innerHTML = `
    <span>${escapeHtml(displayAgentName("consumer"))}</span>
    <strong>connected with</strong>
    <span>${escapeHtml(displayAgentName("retailer"))}</span>
  `;
}

function renderFeeds() {
  els.agentLanguage.textContent = events
    .map((event) => JSON.stringify({
      speaker: event.speaker,
      ...event.agent_language,
    }, null, 2))
    .join("\n\n");

  els.englishFeed.innerHTML = events.map((event) => `
    <article class="english-card ${event.speaker}">
      <strong>${escapeHtml(chatLabel(event.speaker))}</strong>
      <p>${escapeHtml(event.english)}</p>
    </article>
  `).join("");
}

function resetFeeds() {
  events.length = 0;
  els.timeline.innerHTML = "";
  els.connectedAgents.innerHTML = "";
  els.connectedAgents.hidden = true;
  els.agentLanguage.textContent = "";
  els.englishFeed.innerHTML = "";
}

function stopStream() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  fallbackTimers.forEach((timer) => window.clearTimeout(timer));
  fallbackTimers = [];
}

function setStatus(text) {
  els.status.textContent = text;
}

function labelFor(speaker) {
  if (speaker === "consumer") return "Consumer agent";
  if (speaker === "retailer") return "Retailer agent";
  return "System";
}

function chatLabel(speaker) {
  if (speaker === "consumer") return displayAgentName("consumer");
  if (speaker === "retailer") return displayAgentName("retailer");
  return "System";
}

function displayAgentName(speaker) {
  const scenario = payload();
  if (speaker === "consumer") return scenario.consumer_name;
  if (speaker === "retailer") return scenario.retailer_name;
  return "";
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 2400);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildFallbackEvents(scenario) {
  const menu = parseMenu(scenario.menu_text);
  const promotion = scenario.promotions[0] || {
    name: "Retailer offer",
    type: "percentage",
    value: 10,
    rule: "Use when the consumer agent shows high intent.",
  };
  const hook = chooseMenuHook(menu, scenario.consumer_preferences, scenario.consumer_intent);
  const counter = chooseCounterHook(menu, hook.name);
  const proposedPrice = hook.price === null ? null : Math.round(hook.price * (1 - Math.min(promotion.value, 35) / 100) * 100) / 100;

  return [
    agentEvent("handshake", "system", "proximity_match", "Both agents are inside the discovery radius. Secure handshake channel opened.", {
      distance_m: scenario.distance_m,
      retailer: scenario.retailer_name,
    }),
    agentEvent("message", "retailer", "HELLO_CONSUMER_AGENT", `${scenario.retailer_name} retailer agent shares a signed menu payload and current offer policy.`, {
      menu_items: menu.length,
      offer_policy: promotion,
      capabilities: ["menu_exchange", "promotion_negotiation", "reservation_intent"],
    }),
    agentEvent("message", "consumer", "CONSUMER_INTENT", `The consumer agent receives the menu and asks for a fit for ${scenario.consumer_intent}.`, {
      intent: scenario.consumer_intent,
      preferences: scenario.consumer_preferences,
      distance_m: scenario.distance_m,
    }),
    agentEvent("message", "retailer", "OFFER_PROPOSAL", `The retailer agent proposes ${hook.name} and applies ${promotion.name}.`, {
      menu_hook: hook,
      promotion,
      proposed_price: proposedPrice,
    }),
    agentEvent("message", "consumer", "COUNTER_REQUEST", `The consumer agent asks whether ${counter.name} can be included without losing the quiet-table preference.`, {
      counter_item: counter,
      required_conditions: ["quiet_table", "clear_allergen_notes", "reservation_hold"],
    }),
    agentEvent("message", "retailer", "ACCEPT_WITH_TERMS", "The retailer agent accepts the counter request and holds the table for 10 minutes.", {
      accepted: true,
      reservation_hold_minutes: 10,
      included_items: [hook.name, counter.name],
      terms: ["promotion_applied_once", "arrival_confirmation_required"],
    }),
    agentEvent("summary", "system", "NEGOTIATION_SUMMARY", "Handshake complete. Menu, offer, counter-request, and accepted terms are visible in both languages.", {
      status: "ready_for_consumer_confirmation",
      retailer: scenario.retailer_name,
      consumer_agent: scenario.consumer_name,
    }),
  ];
}

function agentEvent(type, speaker, action, english, payloadData) {
  return {
    type,
    speaker,
    timestamp: new Date().toISOString(),
    agent_language: {
      protocol: "agmentic-a2a.v1",
      action,
      payload: payloadData,
    },
    english,
  };
}

function parseMenu(text) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split("|").map((part) => part.trim());
    const section = parts.length >= 4 ? parts[0] : "Menu";
    const name = parts.length >= 4 ? parts[1] : parts[0] || "Menu item";
    const description = parts.length >= 4 ? parts[2] : parts[1] || "";
    const price = extractPrice(parts.at(-1) || line);
    return { section, name, description, price };
  });
}

function extractPrice(text) {
  const match = String(text).match(/(?:€|\$|£)?\s?(\d{1,3}(?:[.,]\d{1,2})?)\s*$/);
  return match ? Number(match[1].replace(",", ".")) : null;
}

function chooseMenuHook(menu, preferences, intent) {
  const source = [intent, ...preferences].join(" ").toLowerCase();
  return menu.find((item) => {
    const itemText = `${item.section} ${item.name} ${item.description}`.toLowerCase();
    return source.split(/\W+/).some((word) => word.length > 4 && itemText.includes(word));
  }) || menu[0] || { section: "Menu", name: "seasonal item", description: "", price: null };
}

function chooseCounterHook(menu, firstName) {
  return menu.find((item) => item.name !== firstName && /starter|dessert|wine|snacks/i.test(item.section))
    || menu.find((item) => item.name !== firstName)
    || menu[0]
    || { section: "Menu", name: "reservation hold", description: "", price: null };
}

document.querySelector("#startLive").addEventListener("click", startLive);
document.querySelector("#clearTimeline").addEventListener("click", () => {
  stopStream();
  els.pulseDot.classList.remove("active");
  resetFeeds();
  setStatus("Idle");
});
lucide.createIcons();
