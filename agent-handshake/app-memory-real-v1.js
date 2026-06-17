const DEFAULT_API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? window.location.origin
  : "https://api-handshake.agmentic.com";
const API_BASE = window.localStorage?.getItem("agmentic_agent_handshake_api_base") || DEFAULT_API_BASE;

// The consumer agent's live memory (likes, notes, and the dining-request goal)
// is served by the fine-dining backend. The handshake refreshes from it on
// connect so it always negotiates against the user's current request instead
// of a stale browser-cached profile.
const FINE_DINING_API_BASE = window.localStorage?.getItem("agmentic_fine_dining_api_base")
  || (["localhost", "127.0.0.1"].includes(window.location.hostname) ? "http://localhost:8000" : "https://api-dining.agmentic.com");
const DINING_USER_ID_KEY = "dining_user_id";
const DINING_SESSION_ID_KEY = "dining_session_id";

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
  consumer_memory_session_id: "agent-handshake-consumer",
  distance_m: 130,
  consumer_intent: "anniversary dinner for two",
  consumer_preferences: ["quiet table", "vegetarian starter", "wine pairing"],
  consumer_memory: {
    liked: ["quiet table", "vegetarian starter", "wine pairing"],
    disliked: ["noisy seating", "shellfish-heavy menu"],
    notes: ["Prefers calm rooms, clear vegetarian options, and wine-pairing value."],
  },
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
  modeLabel: document.querySelector("#modeLabel"),
  sharedStateSummary: document.querySelector("#sharedStateSummary"),
  mealPathComparison: document.querySelector("#mealPathComparison"),
  finalResultCard: document.querySelector("#finalResultCard"),
  generateRetailerOfferDebug: document.querySelector("#generateRetailerOfferDebug"),
  evaluateRetailerOfferDebug: document.querySelector("#evaluateRetailerOfferDebug"),
};

let eventSource = null;
let fallbackTimers = [];
const events = [];
const protocol = window.AgmenticAgentProtocol;
const maisonLumiereDemoConsumer = {
  userId: "demo-consumer-emma",
  sessionId: "demo-session-maison-lumiere",
  name: "Emma",
  likes: ["seafood", "citrus", "light dinner", "quiet table"],
  dislikes: ["very heavy food"],
  allergies: [],
  dietaryPreference: "",
  budgetRange: "medium",
  budgetPerPerson: 50,
  partySize: 2,
  occasion: "anniversary dinner",
  confidenceLevel: "low",
  winePreference: "white wine",
  preferredTableStyle: "quiet table",
  memoryNotes: [
    "Prefers clear, simple recommendations.",
    "Likes lighter seafood dishes.",
    "Does not want to look unsure in front of the waiter.",
  ],
  diningHistory: [],
};

const maisonLumiereDemoRetailer = {
  retailerId: "demo-retailer-maison-lumiere",
  retailerName: "Maison Lumiere",
  cuisine: "modern fine dining",
  currency: "EUR",
  location: {
    city: "Munich",
    country: "Germany",
  },
  discoveryRadius: 450,
  marketingAllowed: true,
  menuItems: [
    {
      id: "item-oyster-tartlet",
      category: "Snacks",
      name: "Oyster tartlet",
      description: "cucumber, finger lime, jalapeno",
      price: 9,
      currency: "EUR",
      allergens: ["shellfish"],
      dietaryTags: [],
      pairingTags: ["citrus", "fresh", "snack"],
      availability: "available",
    },
    {
      id: "item-burrata",
      category: "Starter",
      name: "Burrata",
      description: "smoked tomato, basil oil, toasted sourdough",
      price: 16,
      currency: "EUR",
      allergens: ["dairy", "gluten"],
      dietaryTags: ["vegetarian"],
      pairingTags: ["soft", "starter", "wine-friendly"],
      availability: "available",
    },
    {
      id: "item-beetroot",
      category: "Starter",
      name: "Beetroot carpaccio",
      description: "horseradish cream, hazelnut, dill",
      price: 14,
      currency: "EUR",
      allergens: ["nuts", "dairy"],
      dietaryTags: ["vegetarian"],
      pairingTags: ["light", "fresh", "starter"],
      availability: "available",
    },
    {
      id: "item-sea-bass",
      category: "Main",
      name: "Sea bass",
      description: "saffron beurre blanc, fennel, caviar oil",
      price: 34,
      currency: "EUR",
      allergens: ["fish", "dairy"],
      dietaryTags: ["pescatarian"],
      pairingTags: ["seafood", "white wine", "light", "anniversary"],
      availability: "available",
    },
    {
      id: "item-duck",
      category: "Main",
      name: "Dry-aged duck",
      description: "cherry jus, endive, potato millefeuille",
      price: 38,
      currency: "EUR",
      allergens: ["dairy"],
      dietaryTags: [],
      pairingTags: ["rich", "heavy", "red wine"],
      availability: "available",
    },
    {
      id: "item-souffle",
      category: "Dessert",
      name: "Chocolate souffle",
      description: "vanilla ice cream, cacao nib",
      price: 13,
      currency: "EUR",
      allergens: ["dairy", "egg", "gluten"],
      dietaryTags: ["vegetarian"],
      pairingTags: ["dessert", "sweet"],
      availability: "available",
    },
    {
      id: "item-riesling",
      category: "Wine",
      name: "Riesling Kabinett",
      description: "Mosel, citrus, slate",
      price: 12,
      currency: "EUR",
      allergens: ["sulfites"],
      dietaryTags: [],
      pairingTags: ["white wine", "citrus", "seafood pairing"],
      availability: "available",
    },
  ],
  promotions: [
    {
      id: "promo-chef-welcome-pairing",
      name: "Chef welcome pairing",
      type: "percentage",
      value: 12,
      maxConcession: 12,
      rule: "Use for parties of 2+ before 19:00 or when consumer asks for wine pairing.",
      appliesTo: ["item-sea-bass", "item-riesling"],
      marketingText: "A calm anniversary pairing with sea bass and Riesling.",
      expiresAt: "",
    },
  ],
  negotiationRules: {
    maxDiscountPercent: 12,
    preferValueAddBeforeDiscount: true,
    neverViolateAllergies: true,
    neverOfferUnavailableItems: true,
    requireClearPriceDisclosure: true,
    allowedTactics: [
      "proximity_nudge",
      "wine_pairing",
      "bundle_offer",
      "quiet_table",
      "limited_hold",
      "soft_upgrade",
    ],
  },
};

function payload() {
  return typeof structuredClone === "function"
    ? structuredClone(defaultScenario)
    : JSON.parse(JSON.stringify(defaultScenario));
}

async function startLive() {
  stopStream();
  resetFeeds();
  setMode("Legacy scripted demo");
  renderSharedStateSummary();
  setStatus("Registering");

  try {
    const scenario = payload();
    await postJson(`/api/consumer-memory/${encodeURIComponent(scenario.consumer_memory_session_id)}`, scenario.consumer_memory);
    const retailer = await postJson("/api/agents/retailer", {
      name: scenario.retailer_name,
      menu_text: scenario.menu_text,
      promotions: scenario.promotions,
      radius_m: 450,
    });
    const consumer = await postJson("/api/agents/consumer", {
      name: scenario.consumer_name,
      memory_session_id: scenario.consumer_memory_session_id,
      intent: scenario.consumer_intent,
      preferences: scenario.consumer_preferences,
    });
    setStatus("Connecting");
    const connection = await postJson("/api/connections", {
      retailer_agent_id: retailer.id,
      consumer_agent_id: consumer.id,
      distance_m: scenario.distance_m,
    });

    setStatus("Demo stream");
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
        setStatus("Demo complete");
        els.pulseDot.classList.remove("active");
        stopStream();
        return;
      }
      pushEvent(event);
    };
    eventSource.onerror = () => {
      showToast("Scripted backend demo disconnected. Showing browser fallback.");
      startFallbackLive();
    };
  } catch (error) {
    showToast("Scripted backend demo unavailable. Showing browser fallback.");
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
  setMode("Legacy scripted demo");
  setStatus("Demo stream");
  els.pulseDot.classList.add("active");
  buildFallbackEvents(payload()).forEach((event, index, allEvents) => {
    const timer = window.setTimeout(() => {
      pushEvent(event);
      if (index === allEvents.length - 1) {
        setStatus("Demo complete");
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

  const visibleConversation = events
    .filter((event) => event.speaker !== "system");

  els.englishFeed.innerHTML = visibleConversation.map((event) => `
    <article class="english-card ${event.speaker}">
      <strong>${escapeHtml(chatLabel(event))}</strong>
      <p>${escapeHtml(event.english)}</p>
    </article>
  `).join("");
  els.englishFeed.scrollTop = els.englishFeed.scrollHeight;
}

function resetFeeds() {
  events.length = 0;
  els.timeline.innerHTML = "";
  els.connectedAgents.innerHTML = "";
  els.connectedAgents.hidden = true;
  els.agentLanguage.textContent = "";
  els.englishFeed.innerHTML = "";
  renderFinalResult(null);
  renderSharedStateSummary();
  renderMealPathComparison();
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

function setMode(text) {
  if (els.modeLabel) {
    els.modeLabel.textContent = text;
  }
}

function statusLabel(status) {
  const labels = {
    accepted: "Accepted by consumer agent",
    rejected: "Rejected by consumer agent",
    counter_unresolved: "Counter unresolved",
    clarification_needed: "Clarification needed",
    failed_no_safe_offer: "No safe offer available",
    failed_no_consumer: "Missing consumer profile",
    failed_no_retailer: "Missing retailer policy/menu",
  };
  return labels[status] || status || "Idle";
}

function labelFor(speaker) {
  if (speaker === "consumer") return "Consumer agent";
  if (speaker === "retailer") return "Retailer agent";
  return "System";
}

function chatLabel(event) {
  if (event.speakerLabel) return event.speakerLabel;
  if (event.speaker === "consumer") return displayAgentName("consumer");
  if (event.speaker === "retailer") return displayAgentName("retailer");
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

function renderSharedStateSummary() {
  if (!els.sharedStateSummary || !protocol) {
    return;
  }

  const consumer = protocol.getConsumerProfile();
  const retailer = protocol.getRetailerPolicy();
  const hasConsumer = hasConsumerProfile(consumer);
  const hasRetailer = Boolean(retailer.retailerId && retailer.retailerId !== "retailer-dining-agent")
    || Boolean(retailer.retailerName && retailer.retailerName !== "Unnamed retailer")
    || retailer.menuItems.length
    || retailer.promotions.length;
  const hasMenu = Boolean(retailer.menuItems.length);
  const marketingLabel = retailer.marketingAllowed ? "yes" : "no";
  const missing = [
    hasConsumer ? "" : "consumer profile",
    hasRetailer ? "" : "retailer policy",
    hasMenu ? "" : "menu",
  ].filter(Boolean);
  const readiness = !missing.length ? "Ready for real local negotiation" : `Missing ${missing.join(", ")}`;
  const readinessClass = !missing.length ? "ready" : "missing";

  els.sharedStateSummary.innerHTML = `
    <div class="readiness-row ${readinessClass}">
      <strong>${escapeHtml(readiness)}</strong>
      <span>Promotions are optional.</span>
    </div>
    <div class="state-grid">
      <section>
        <strong>Consumer Agent</strong>
        <dl>
          <div><dt>Session id</dt><dd>${escapeHtml(hasConsumer ? consumer.sessionId : "missing")}</dd></div>
          <div><dt>Likes</dt><dd>${consumer.likes.length}</dd></div>
          <div><dt>Allergies</dt><dd>${consumer.allergies.length}</dd></div>
          <div><dt>Party size</dt><dd>${escapeHtml(consumer.partySize || "—")}</dd></div>
          <div><dt>Goal</dt><dd>${escapeHtml(consumer.goal || consumer.occasion || "none")}</dd></div>
          <div><dt>Budget</dt><dd>${escapeHtml(consumer.budgetPerPerson ? `${consumer.budgetPerPerson}/person` : (consumer.budgetRange || "none"))}</dd></div>
          <div><dt>Confidence</dt><dd>${escapeHtml(consumer.confidenceLevel || "unknown")}</dd></div>
          <div><dt>Wine</dt><dd>${escapeHtml(consumer.winePreference || "none")}</dd></div>
        </dl>
      </section>
      <section>
        <strong>Retailer Agent</strong>
        <dl>
          <div><dt>Name</dt><dd>${escapeHtml(hasRetailer ? retailer.retailerName : "missing")}</dd></div>
          <div><dt>Menu items</dt><dd>${retailer.menuItems.length}</dd></div>
          <div><dt>Promotions</dt><dd>${retailer.promotions.length}</dd></div>
          <div><dt>Marketing allowed</dt><dd>${marketingLabel}</dd></div>
          <div><dt>Radius</dt><dd>${retailer.discoveryRadius} m</dd></div>
          <div><dt>Readiness</dt><dd>${escapeHtml(!missing.length ? "ready" : missing.join(", "))}</dd></div>
        </dl>
      </section>
    </div>
  `;
}

function compactItems(items) {
  return (items || []).map((item) => item.name).filter(Boolean).join(", ") || "None";
}

function scoreRows(scoreBreakdown = {}) {
  return Object.entries(scoreBreakdown)
    .map(([key, value]) => `<span>${escapeHtml(key.replace(/([A-Z])/g, " $1"))}: <strong>${escapeHtml(value)}</strong></span>`)
    .join("");
}

function renderMealPathComparison() {
  if (!els.mealPathComparison || !protocol?.compareItemAndMealPathEngines) {
    return;
  }
  const consumer = protocol.getConsumerProfile();
  const retailer = protocol.getRetailerPolicy();
  if (!hasConsumerProfile(consumer) || !hasRetailerPolicy(retailer)) {
    els.mealPathComparison.hidden = true;
    els.mealPathComparison.innerHTML = "";
    return;
  }

  const comparison = protocol.compareItemAndMealPathEngines({
    consumerProfile: consumer,
    retailerPolicy: retailer,
    limit: 5,
  });
  const currentOfferItems = compactItems(comparison.currentOfferWinner?.proposedItems);
  const bestPath = comparison.bestMealPathWinner;
  const pathCards = comparison.mealPaths.map((path, index) => `
    <article class="meal-path-card ${index === 0 ? "winner" : ""}">
      <div class="meal-path-title">
        <strong>${index + 1}. ${escapeHtml([
          compactItems(path.starters),
          compactItems(path.mains),
          compactItems(path.desserts),
          compactItems(path.wines),
        ].filter((part) => part !== "None").join(" + "))}</strong>
        <span>${escapeHtml(path.totalScore)} pts · ${escapeHtml(retailer.currency)} ${escapeHtml(path.totalPrice)}</span>
      </div>
      <dl>
        <div><dt>Starter</dt><dd>${escapeHtml(compactItems(path.starters))}</dd></div>
        <div><dt>Main</dt><dd>${escapeHtml(compactItems(path.mains))}</dd></div>
        <div><dt>Dessert</dt><dd>${escapeHtml(compactItems(path.desserts))}</dd></div>
        <div><dt>Wine</dt><dd>${escapeHtml(compactItems(path.wines))}</dd></div>
      </dl>
      <div class="score-chip-row">${scoreRows(path.scoreBreakdown)}</div>
    </article>
  `).join("");

  els.mealPathComparison.hidden = false;
  els.mealPathComparison.innerHTML = `
    <div class="comparison-heading">
      <div>
        <strong>Item Engine vs Meal Path Engine</strong>
        <span>Phase 1 runs both engines side by side. Retailer offers are not replaced yet.</span>
      </div>
    </div>
    <div class="engine-compare-grid">
      <article>
        <span>Current item engine offer</span>
        <strong>${escapeHtml(currentOfferItems)}</strong>
        <small>Top scored item: ${escapeHtml(comparison.currentItemWinner?.item?.name || comparison.currentItemWinner?.item || "None")} (${escapeHtml(comparison.currentItemWinner?.totalScore || 0)} pts)</small>
      </article>
      <article class="winner">
        <span>Best meal path winner</span>
        <strong>${escapeHtml([
          compactItems(bestPath?.starters),
          compactItems(bestPath?.mains),
          compactItems(bestPath?.wines),
        ].filter((part) => part !== "None").join(" + ") || "None")}</strong>
        <small>${escapeHtml(bestPath?.totalScore || 0)} pts · ${escapeHtml(retailer.currency)} ${escapeHtml(bestPath?.totalPrice || 0)}</small>
      </article>
    </div>
    <div class="meal-path-list">${pathCards}</div>
  `;
}

function hasConsumerProfile(profile) {
  return Boolean(profile?.sessionId && profile.sessionId !== "default")
    || Boolean(profile?.likes?.length)
    || Boolean(profile?.dislikes?.length)
    || Boolean(profile?.allergies?.length)
    || Boolean(profile?.memoryNotes?.length);
}

function hasRetailerPolicy(policy) {
  return Boolean(policy?.retailerId && policy?.menuItems?.length);
}

function generateRetailerOfferFromSharedState() {
  if (!protocol) {
    showToast("Shared agent protocol is not loaded.");
    return;
  }

  const consumerProfile = protocol.getConsumerProfile();
  const retailerPolicy = protocol.getRetailerPolicy();

  if (!hasConsumerProfile(consumerProfile)) {
    showToast("No consumer agent profile found.");
    return;
  }
  if (!hasRetailerPolicy(retailerPolicy)) {
    showToast("No retailer policy or menu found.");
    return;
  }

  const offer = protocol.generateRetailerOffer({
    consumerProfile,
    retailerPolicy,
    negotiationContext: { source: "agent_handshake_debug" },
  });
  protocol.addAgentMessage({
    speaker: "retailer_agent",
    action: "RETAILER_OFFER",
    protocol: "agmentic-a2a.v1",
    payload: offer.protocolPayload,
    readableEnglish: offer.readableEnglish,
    visibility: "public",
  });
  pushEvent({
    type: "message",
    speaker: "retailer",
    timestamp: offer.createdAt,
    agent_language: offer.protocolPayload,
    english: offer.readableEnglish,
  });
  setStatus("Debug offer");
}

function latestRetailerOfferMessage() {
  if (!protocol?.getAgentMessages) {
    return null;
  }

  return [...protocol.getAgentMessages()].reverse().find((message) => {
    const payload = message.payload || {};
    return message.action === "RETAILER_OFFER"
      || payload.action === "RETAILER_OFFER"
      || Boolean(payload.offer);
  }) || null;
}

function offerFromMessage(message) {
  if (!message) {
    return null;
  }
  const payload = message.payload || {};
  return payload.offer || payload.protocolPayload?.offer || payload;
}

function evaluateLatestRetailerOffer() {
  if (!protocol) {
    showToast("Shared agent protocol is not loaded.");
    return;
  }

  const consumerProfile = protocol.getConsumerProfile();
  const retailerPolicy = protocol.getRetailerPolicy();
  const offerMessage = latestRetailerOfferMessage();
  const offer = offerFromMessage(offerMessage);

  if (!hasConsumerProfile(consumerProfile)) {
    showToast("No consumer agent profile found.");
    return;
  }
  if (!offerMessage || !offer) {
    showToast("No retailer offer found.");
    return;
  }

  const evaluation = protocol.evaluateRetailerOffer({
    consumerProfile,
    retailerPolicy,
    offer,
    negotiationContext: { source: "agent_handshake_debug" },
  });

  protocol.addAgentMessage({
    speaker: "consumer_agent",
    action: "CONSUMER_EVALUATION",
    protocol: "agmentic-a2a.v1",
    payload: evaluation.protocolPayload,
    readableEnglish: evaluation.readableEnglish,
    visibility: "public",
  });
  pushEvent({
    type: "message",
    speaker: "consumer",
    timestamp: evaluation.createdAt,
    agent_language: evaluation.protocolPayload,
    english: evaluation.readableEnglish,
  });
  setStatus("Debug evaluation");
}

function eventFromAgentMessage(message) {
  const speakerMap = {
    consumer_agent: "consumer",
    retailer_agent: "retailer",
    system: "system",
  };
  const retailer = protocol?.getRetailerPolicy?.();
  return {
    type: "message",
    speaker: speakerMap[message.speaker] || message.speaker || "system",
    speakerLabel: message.speaker === "consumer_agent"
      ? "Consumer Agent"
      : message.speaker === "retailer_agent"
        ? retailer?.retailerName || "Retailer Agent"
        : "System",
    timestamp: message.timestamp,
    agent_language: message.payload,
    english: message.readableEnglish,
  };
}

function runRealLocalNegotiation() {
  if (!protocol?.runLocalNegotiationSession) {
    showToast("Shared agent protocol is not loaded.");
    return;
  }

  stopStream();
  els.pulseDot.classList.add("active");
  resetFeeds();
  setMode("Local real negotiation");
  setStatus("Negotiating");
  renderSharedStateSummary();

  const consumerProfile = protocol.getConsumerProfile();
  const retailerPolicy = protocol.getRetailerPolicy();
  const session = protocol.runLocalNegotiationSession({
    consumerProfile,
    retailerPolicy,
    maxRounds: 2,
  });

  resetFeeds();
  setMode("Local real negotiation");
  session.messages.forEach((message) => pushEvent(eventFromAgentMessage(message)));
  renderFinalResult(session);
  setStatus(statusLabel(session.status));
  els.pulseDot.classList.remove("active");

  if (session.status === "failed_no_consumer") {
    showToast("No consumer agent profile found.");
  } else if (session.status === "failed_no_retailer") {
    showToast("No retailer policy or menu found.");
  } else if (session.status === "failed_no_safe_offer") {
    showToast("No safe retailer offer was available.");
  }
}

async function runPrimaryNegotiation() {
  if (!protocol) {
    startLive();
    return;
  }

  // Pull the consumer's current goal/memory before negotiating so a real
  // session always reflects the latest dining request, not stale cached data.
  await refreshConsumerProfileFromMemory();

  const consumerProfile = protocol.getConsumerProfile();
  const retailerPolicy = protocol.getRetailerPolicy();
  if (!hasConsumerProfile(consumerProfile)) {
    loadMaisonLumiereDemo({ silent: true });
  } else if (!hasRetailerPolicy(retailerPolicy)) {
    protocol.saveRetailerPolicy(cloneDemoData(maisonLumiereDemoRetailer));
    renderSharedStateSummary();
    renderMealPathComparison();
  }
  runRealLocalNegotiation();
}

// Rebuild a real consumer-agent profile (sessionId "user_*") from the live
// fine-dining memory: likes/dislikes/notes plus the parsed dining goal
// (party size, per-person budget, intent). Demo/default profiles are left
// untouched, and any fetch failure keeps the existing cached profile.
async function refreshConsumerProfileFromMemory() {
  if (!protocol?.getConsumerProfile || !protocol?.saveConsumerProfile) return;

  const current = protocol.getConsumerProfile();
  const sessionId = resolveDiningSessionId(current);
  if (!/^user_/.test(sessionId)) return;

  try {
    const [memory, diningResponse] = await Promise.all([
      fetch(`${FINE_DINING_API_BASE}/profile/${encodeURIComponent(sessionId)}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${FINE_DINING_API_BASE}/dining-request/${encodeURIComponent(sessionId)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (!memory) return;

    const dining = diningResponse?.dining_request || null;
    const budgetPerPerson = dining && dining.budget_amount != null
      ? (dining.budget_per_person ? dining.budget_amount : (dining.party_size ? dining.budget_amount / dining.party_size : dining.budget_amount))
      : null;

    protocol.saveConsumerProfile({
      userId: sessionId.replace(/^user_/, "") || sessionId,
      sessionId,
      name: current.name || "Consumer Dining Agent",
      likes: (memory.liked || []).map((entry) => entry.item).filter(Boolean),
      dislikes: (memory.disliked || []).map((entry) => entry.item).filter(Boolean),
      allergies: extractAllergies(memory.notes || []),
      notes: (memory.notes || []).map((entry) => entry.text).filter(Boolean),
      partySize: dining ? dining.party_size : null,
      budgetPerPerson,
      goal: dining ? dining.intent : "",
      winePreference: dining?.raw && /\b(drink|drinks|wine|beverage|cocktail)\b/i.test(dining.raw)
        ? "open to a drink or wine pairing"
        : "",
    });
  } catch (error) {
    // Keep the existing cached profile if the live memory is unreachable.
  }
}

function resolveDiningSessionId(current = {}) {
  const currentSession = current?.sessionId || "";
  if (/^user_/.test(currentSession)) return currentSession;

  const storedSession = window.localStorage?.getItem(DINING_SESSION_ID_KEY) || "";
  if (/^user_/.test(storedSession)) return storedSession;

  const storedUser = window.localStorage?.getItem(DINING_USER_ID_KEY) || "";
  const slug = slugifyUserId(storedUser);
  return slug ? `user_${slug}` : currentSession;
}

function slugifyUserId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function extractAllergies(notes = []) {
  const values = [];
  notes
    .map((entry) => entry?.text || entry)
    .filter(Boolean)
    .forEach((text) => {
      const lower = String(text).toLowerCase();
      const match = lower.match(/allergic to ([^.]+)/);
      if (!match) return;
      match[1]
        .split(/,| and | & /)
        .map((item) => item.trim().replace(/^the\s+/, "").replace(/\s+when possible$/, ""))
        .filter(Boolean)
        .forEach((item) => values.push(item));
    });
  return [...new Set(values)];
}

function renderFinalResult(session) {
  if (!els.finalResultCard) {
    return;
  }
  if (!session) {
    els.finalResultCard.hidden = true;
    els.finalResultCard.innerHTML = "";
    return;
  }

  const terms = session.finalTerms || {};
  const finalEvaluation = session.finalEvaluation || session.firstEvaluation || {};
  const checks = (terms.safetyChecks || finalEvaluation.safetyChecks || [])
    .map((check) => `${escapeHtml(check.name || "check")}: ${escapeHtml(check.status || "unknown")}`)
    .join(" · ") || "No safety checks recorded";
  const caveats = (terms.remainingCaveats || [])
    .map((caveat) => `<li>${escapeHtml(caveat)}</li>`)
    .join("") || "<li>None</li>";
  const acceptedItems = (terms.acceptedItems || [])
    .map((item) => escapeHtml(item))
    .join(", ") || "None";
  const price = terms.finalPrice === null || terms.finalPrice === undefined
    ? "not finalized"
    : `${escapeHtml(terms.currency || "")} ${escapeHtml(terms.finalPrice)}`;
  const value = terms.discountAmount
    ? `${escapeHtml(terms.currency || "")} ${escapeHtml(terms.discountAmount)} discount (${escapeHtml(terms.discountPercent || 0)}%)`
    : escapeHtml(terms.valueAdd || "No discount/value-add recorded");

  els.finalResultCard.hidden = false;
  els.finalResultCard.innerHTML = `
    <div class="final-result-heading">
      <span>Final result</span>
      <strong>${escapeHtml(statusLabel(session.status))}</strong>
    </div>
    <dl>
      <div><dt>Retailer</dt><dd>${escapeHtml(terms.retailerName || "Unknown")}</dd></div>
      <div><dt>Accepted items</dt><dd>${acceptedItems}</dd></div>
      <div><dt>Final price</dt><dd>${price}</dd></div>
      <div><dt>Discount/value-add</dt><dd>${value}</dd></div>
      <div><dt>Consumer-safe checks</dt><dd>${checks}</dd></div>
    </dl>
    <div class="final-caveats">
      <span>Remaining caveats</span>
      <ul>${caveats}</ul>
    </div>
  `;
}

function cloneDemoData(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function loadMaisonLumiereDemo({ allergyMode = false, silent = false } = {}) {
  if (!protocol) {
    showToast("Shared agent protocol is not loaded.");
    return;
  }

  const consumerProfile = cloneDemoData(maisonLumiereDemoConsumer);
  const retailerPolicy = cloneDemoData(maisonLumiereDemoRetailer);

  if (allergyMode) {
    consumerProfile.userId = "demo-consumer-emma-allergy";
    consumerProfile.sessionId = "demo-session-maison-lumiere-allergy";
    consumerProfile.allergies = ["fish", "shellfish", "dairy"];
    consumerProfile.dislikes = ["wine", "riesling", "nuts", "gluten", "egg", "very heavy food"];
    consumerProfile.winePreference = "";
    consumerProfile.memoryNotes = [
      ...consumerProfile.memoryNotes,
      "Needs strict allergy protection for fish, shellfish, and dairy.",
      "Does not want a wine-only recommendation.",
    ];
  }

  protocol.saveConsumerProfile(consumerProfile);
  protocol.saveRetailerPolicy(retailerPolicy);
  protocol.clearNegotiationSession();
  protocol.clearAgentMessages?.();

  stopStream();
  resetFeeds();
  setMode("Real local negotiation");
  setStatus("Ready");
  renderSharedStateSummary();
  renderMealPathComparison();
  if (!silent) {
    showToast(allergyMode
      ? "Allergy rejection demo loaded. Ready for real local negotiation."
      : "Maison Lumiere demo loaded. Ready for real local negotiation.");
  }
}

function buildFallbackEvents(scenario) {
  const menu = parseMenu(scenario.menu_text);
  const promotion = scenario.promotions[0] || {
    name: "Retailer offer",
    type: "percentage",
    value: 10,
    rule: "Use when the consumer agent shows high intent.",
  };
  const hook = chooseMenuHook(menu, [...scenario.consumer_preferences, ...scenario.consumer_memory.liked, ...scenario.consumer_memory.notes], scenario.consumer_intent);
  const counter = chooseCounterHook(menu, hook.name);
  const proposedPrice = hook.price === null ? null : Math.round(hook.price * (1 - Math.min(promotion.value, 35) / 100) * 100) / 100;
  const memoryProfile = {
    liked: scenario.consumer_memory.liked.map((item) => ({ item, reason: "browser fallback memory" })),
    disliked: scenario.consumer_memory.disliked.map((item) => ({ item, reason: "browser fallback memory" })),
    notes: scenario.consumer_memory.notes.map((text) => ({ text })),
  };

  return [
    agentEvent("handshake", "system", "proximity_match", `${scenario.consumer_name} connected with ${scenario.retailer_name}.`, {
      distance_m: scenario.distance_m,
      retailer: scenario.retailer_name,
    }),
    agentEvent("message", "retailer", "MENU_TRANSFER", `${scenario.retailer_name} sends the scripted demo menu and offer policy.`, {
      menu_items: menu.length,
      offer_policy: [promotion],
      capabilities: ["menu_exchange", "promotion_negotiation", "reservation_hold"],
    }),
    agentEvent("message", "consumer", "MENU_RECEIVED", `${scenario.consumer_name} receives ${menu.length} menu items and checks them against memory.`, {
      intent: scenario.consumer_intent,
      request_preferences: scenario.consumer_preferences,
      memory_profile: memoryProfile,
      effective_preferences: [...scenario.consumer_preferences, ...scenario.consumer_memory.liked, ...scenario.consumer_memory.notes],
      distance_m: scenario.distance_m,
    }),
    agentEvent("message", "retailer", "OFFER_PROPOSAL", `${scenario.retailer_name} offers ${hook.name} at ${proposedPrice} using ${promotion.name}.`, {
      menu_hook: hook,
      promotion,
      proposed_price: proposedPrice,
    }),
    agentEvent("message", "consumer", "COUNTER_REQUEST", `${scenario.consumer_name} can accept if ${counter.name} is included and the quiet table preference is preserved.`, {
      counter_item: counter,
      required_conditions: ["vegetarian_safe_option", "quiet_table", "clear_allergen_notes", "reservation_hold"],
      memory_used: memoryProfile,
    }),
    agentEvent("message", "retailer", "ACCEPT_WITH_TERMS", `${scenario.retailer_name} accepts the counter request and holds the table for 10 minutes.`, {
      accepted: true,
      reservation_hold_minutes: 10,
      included_items: [hook.name, counter.name],
      terms: ["promotion_applied_once", "arrival_confirmation_required"],
    }),
    agentEvent("summary", "system", "NEGOTIATION_COMPLETE", "Menu exchange and negotiation completed between the two agents.", {
      status: "ready_for_consumer_confirmation",
      retailer_agent: scenario.retailer_name,
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

document.querySelector("#loadMaisonDemo").addEventListener("click", () => loadMaisonLumiereDemo());
document.querySelector("#loadAllergyDemo").addEventListener("click", () => loadMaisonLumiereDemo({ allergyMode: true }));
document.querySelector("#startLocalNegotiation").addEventListener("click", runPrimaryNegotiation);
document.querySelector("#startLive").addEventListener("click", startLive);
document.querySelector("#clearTimeline").addEventListener("click", () => {
  stopStream();
  els.pulseDot.classList.remove("active");
  resetFeeds();
  setMode("Real local negotiation");
  setStatus("Idle");
});
els.generateRetailerOfferDebug.addEventListener("click", generateRetailerOfferFromSharedState);
els.evaluateRetailerOfferDebug.addEventListener("click", evaluateLatestRetailerOffer);
renderSharedStateSummary();
renderMealPathComparison();
setMode("Real local negotiation");
if (protocol) {
  const consumer = protocol.getConsumerProfile();
  const retailer = protocol.getRetailerPolicy();
  if (hasConsumerProfile(consumer) && hasRetailerPolicy(retailer)) {
    setStatus("Ready");
  } else if (!hasConsumerProfile(consumer)) {
    setStatus("Missing consumer");
  } else {
    setStatus("Missing retailer");
  }
}
lucide.createIcons();
