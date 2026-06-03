const STORAGE_KEY = "agmentic_retailer_agent_state_v1";
const API_BASE = localStorage.getItem("agmentic_retailer_api_base")
  || (["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://localhost:8000"
    : "https://api-retailer.agmentic.com");

const sampleMenu = `Snacks | Oyster tartlet | cucumber, finger lime, jalapeno | 9
Starter | Burrata | smoked tomato, basil oil, toasted sourdough | 16
Starter | Beetroot carpaccio | horseradish cream, hazelnut, dill | 14
Main | Sea bass | saffron beurre blanc, fennel, caviar oil | 34
Main | Dry-aged duck | cherry jus, endive, potato millefeuille | 38
Dessert | Chocolate souffle | vanilla ice cream, cacao nib | 13
Wine | Riesling Kabinett | Mosel, citrus, slate | 12`;

const state = {
  menu: null,
  promotions: [],
  location: null,
  nearbyAgents: [],
  apiOnline: false,
};

const protocol = window.AgmenticAgentProtocol;

const defaultNegotiationRules = {
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
};

const els = {
  retailerName: document.querySelector("#retailerName"),
  cuisine: document.querySelector("#cuisine"),
  currency: document.querySelector("#currency"),
  rawMenu: document.querySelector("#rawMenu"),
  menuStatus: document.querySelector("#menuStatus"),
  menuOutput: document.querySelector("#menuOutput"),
  radius: document.querySelector("#radius"),
  radiusValue: document.querySelector("#radiusValue"),
  locationLabel: document.querySelector("#locationLabel"),
  connectionLabel: document.querySelector("#connectionLabel"),
  promoEnabled: document.querySelector("#promoEnabled"),
  promoName: document.querySelector("#promoName"),
  promoType: document.querySelector("#promoType"),
  promoValue: document.querySelector("#promoValue"),
  promoRule: document.querySelector("#promoRule"),
  promoList: document.querySelector("#promoList"),
  agentList: document.querySelector("#agentList"),
  offerPreview: document.querySelector("#offerPreview"),
  negotiationResult: document.querySelector("#negotiationResult"),
  toast: document.querySelector("#toast"),
};

const sampleAgents = [
  {
    id: "consumer-agent-table-2",
    name: "Ava dining agent",
    distance_m: 140,
    intent: "anniversary dinner",
    party_size: 2,
    preferences: ["wine_pairing", "vegetarian starter", "quiet table"],
    attention_signal: "high",
  },
  {
    id: "consumer-agent-business",
    name: "Noah concierge agent",
    distance_m: 310,
    intent: "business dinner tonight",
    party_size: 4,
    preferences: ["fast seating", "seafood", "premium bottle"],
    attention_signal: "medium",
  },
  {
    id: "consumer-agent-dessert",
    name: "Mila taste agent",
    distance_m: 620,
    intent: "after dinner dessert",
    party_size: 2,
    preferences: ["dessert", "non-alcoholic", "walk-in"],
    attention_signal: "low",
  },
];

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "";
  }

  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: els.currency.value,
    maximumFractionDigits: Number.isInteger(number) ? 0 : 2,
  }).format(number);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 2400);
}

async function apiRequest(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await response.text().catch(() => response.statusText));
  }

  state.apiOnline = true;
  return response.json();
}

function parseLine(line, fallbackSection) {
  const parts = line.split("|").map((part) => part.trim()).filter(Boolean);
  let section = fallbackSection;
  let name = "";
  let description = "";
  let price = null;

  if (parts.length >= 4) {
    [section, name, description] = parts;
    price = extractPrice(parts.slice(3).join(" "));
  } else if (parts.length === 3) {
    [section, name] = parts;
    const priceCandidate = extractPrice(parts[2]);
    price = priceCandidate;
    description = priceCandidate === null ? parts[2] : "";
  } else if (parts.length === 2) {
    [name, description] = parts;
    price = extractPrice(description);
  } else {
    name = line.replace(/\s+[-–]\s+.*$/, "").trim();
    description = line === name ? "" : line.replace(name, "").replace(/^[-–]\s*/, "").trim();
    price = extractPrice(line);
  }

  return {
    id: uuid(),
    section: section || "Menu",
    name: name || "Untitled item",
    description: description.replace(/[€$£]\s?\d+([.,]\d{1,2})?/, "").trim(),
    price,
    allergens: detectAllergens(`${name} ${description}`),
    dietary_tags: detectDietaryTags(`${name} ${description}`),
    negotiable: true,
  };
}

function extractPrice(text) {
  const match = String(text).match(/(?:€|\$|£)?\s?(\d{1,3}(?:[.,]\d{1,2})?)(?:\s?(?:eur|usd|gbp))?$/i);
  return match ? Number(match[1].replace(",", ".")) : null;
}

function detectAllergens(text) {
  const source = text.toLowerCase();
  const checks = [
    ["dairy", ["butter", "cream", "cheese", "burrata", "milk", "ice cream"]],
    ["gluten", ["bread", "sourdough", "tartlet", "millefeuille", "souffle"]],
    ["nuts", ["hazelnut", "almond", "pistachio", "walnut"]],
    ["shellfish", ["oyster", "caviar"]],
    ["fish", ["bass", "salmon", "tuna"]],
  ];

  return checks.filter(([, terms]) => terms.some((term) => source.includes(term))).map(([label]) => label);
}

function detectDietaryTags(text) {
  const source = text.toLowerCase();
  const tags = [];
  if (!/(duck|bass|beef|chicken|oyster|fish|caviar|salmon|tuna)/.test(source)) {
    tags.push("vegetarian");
  }
  if (!/(butter|cream|cheese|burrata|milk|ice cream|duck|bass|oyster|caviar)/.test(source)) {
    tags.push("vegan_possible");
  }
  if (/beetroot|tomato|fennel|endive|cucumber/.test(source)) {
    tags.push("produce-led");
  }
  return tags;
}

function detectPairingTags(text) {
  const source = text.toLowerCase();
  const tags = [];
  if (/wine|riesling|champagne|sparkling|pairing/.test(source)) {
    tags.push("wine_pairing");
  }
  if (/dessert|souffle|chocolate|sweet/.test(source)) {
    tags.push("dessert_pairing");
  }
  if (/starter|snack|tartlet|burrata|carpaccio/.test(source)) {
    tags.push("starter_pairing");
  }
  return tags;
}

function syncMenuMetadata() {
  if (!state.menu) {
    return;
  }

  state.menu.retailer = {
    ...(state.menu.retailer || {}),
    name: els.retailerName.value.trim() || "Unnamed retailer",
    cuisine: els.cuisine.value.trim() || "restaurant",
  };
  state.menu.currency = els.currency.value;
  state.menu.updated_at = new Date().toISOString();
}

function standardizeMenu() {
  const rawLines = els.rawMenu.value.split("\n").map((line) => line.trim()).filter(Boolean);
  const items = rawLines.map((line) => parseLine(line, "Menu"));
  const sections = [...new Set(items.map((item) => item.section))];

  state.menu = {
    schema_version: "retailer-menu.v1",
    retailer: {
      name: els.retailerName.value.trim() || "Unnamed retailer",
      cuisine: els.cuisine.value.trim() || "restaurant",
    },
    service_model: "fine_dining",
    currency: els.currency.value,
    sections,
    items,
    updated_at: new Date().toISOString(),
  };

  els.menuStatus.textContent = `${items.length} items`;
  save();
  render();
  syncMenuWithApi();
  showToast("Menu standardized for consumer agents.");
}

async function syncMenuWithApi() {
  try {
    await apiRequest("/retailer/menu/standardize", buildAgentPayload());
  } catch (error) {
    state.apiOnline = false;
  }
}

function promotionPayload() {
  return state.promotions.map((promotion) => ({
    ...promotion,
    enabled: els.promoEnabled.checked,
  }));
}

function addPromotion() {
  const promotion = {
    id: uuid(),
    name: els.promoName.value.trim() || "Untitled promotion",
    type: els.promoType.value,
    value: Number(els.promoValue.value || 0),
    negotiation_rule: els.promoRule.value.trim(),
    max_agent_concession: els.promoType.value === "percentage" ? Math.min(Number(els.promoValue.value || 0), 25) : Number(els.promoValue.value || 0),
  };

  state.promotions.unshift(promotion);
  save();
  render();
  showToast("Promotion added to negotiation policy.");
}

function removePromotion(id) {
  state.promotions = state.promotions.filter((promotion) => promotion.id !== id);
  save();
  render();
}

function buildAgentPayload() {
  return {
    agent: {
      id: "retailer-dining-agent",
      role: "retailer",
      discovery: {
        location_required: true,
        radius_m: Number(els.radius.value),
        current_location: state.location,
      },
      capabilities: [
        "standard_menu_exchange",
        "location_based_discovery",
        "promotion_negotiation",
        "marketing_attention_offer",
      ],
    },
    menu: state.menu,
    marketing: {
      promotions_allowed: els.promoEnabled.checked,
      promotions: promotionPayload(),
    },
  };
}

function saveSharedRetailerPolicy() {
  if (!protocol) {
    return;
  }

  syncMenuMetadata();
  const menuItems = (state.menu?.items || []).map((item) => ({
    id: item.id,
    category: item.section,
    name: item.name,
    description: item.description,
    price: item.price,
    currency: els.currency.value,
    allergens: item.allergens,
    dietaryTags: item.dietary_tags,
    pairingTags: item.pairing_tags || detectPairingTags(`${item.name} ${item.description} ${item.section}`),
    availability: item.availability || "available",
  }));

  const savedPolicy = protocol.saveRetailerPolicy({
    retailerId: "retailer-dining-agent",
    retailerName: els.retailerName.value.trim() || "Unnamed retailer",
    cuisine: els.cuisine.value.trim() || "restaurant",
    currency: els.currency.value,
    location: state.location,
    discoveryRadius: Number(els.radius.value),
    menuItems,
    promotions: state.promotions.map((promotion) => ({
      id: promotion.id,
      name: promotion.name,
      type: promotion.type,
      value: promotion.value,
      maxConcession: promotion.max_agent_concession,
      rule: promotion.negotiation_rule,
      appliesTo: [],
      marketingText: "",
      expiresAt: "",
    })),
    negotiationRules: defaultNegotiationRules,
    marketingAllowed: els.promoEnabled.checked,
  });
  console.info("Retailer policy saved for agent handshake.", savedPolicy);
  return savedPolicy;
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

function generateSharedRetailerOffer() {
  if (!protocol) {
    showToast("Shared agent protocol is not loaded.");
    return null;
  }

  saveSharedRetailerPolicy();
  const consumerProfile = protocol.getConsumerProfile();
  const retailerPolicy = protocol.getRetailerPolicy();

  if (!hasConsumerProfile(consumerProfile)) {
    renderOfferPreview(null, "No consumer agent profile found.");
    showToast("No consumer agent profile found.");
    return null;
  }
  if (!hasRetailerPolicy(retailerPolicy)) {
    renderOfferPreview(null, "No retailer policy or menu found.");
    showToast("No retailer policy or menu found.");
    return null;
  }

  const offer = protocol.generateRetailerOffer({
    consumerProfile,
    retailerPolicy,
    negotiationContext: { source: "retailer_dashboard" },
  });
  renderOfferPreview(offer);
  protocol.addAgentMessage({
    speaker: "retailer_agent",
    action: "RETAILER_OFFER",
    protocol: "agmentic-a2a.v1",
    payload: offer.protocolPayload,
    readableEnglish: offer.readableEnglish,
    visibility: "public",
  });
  showToast("Retailer offer generated for agent handshake.");
  return offer;
}

function renderOfferPreview(offer, emptyMessage = "No retailer offer generated yet.") {
  if (!els.offerPreview) {
    return;
  }

  if (!offer) {
    els.offerPreview.innerHTML = `<p class="empty-state">${escapeHtml(emptyMessage)}</p>`;
    return;
  }

  els.offerPreview.innerHTML = `
    <article class="offer-preview-card">
      <div class="agent-card-header">
        <div>
          <strong>${escapeHtml(offer.offerTitle)}</strong>
          <span>${escapeHtml(offer.offerType)} · ${escapeHtml(offer.marketingTactic)}</span>
        </div>
        <span class="distance-pill">${escapeHtml(offer.retailerName)}</span>
      </div>
      <p>${escapeHtml(offer.readableEnglish)}</p>
      <div class="offer-price-row">
        <span>Before ${money(offer.priceBefore)}</span>
        <strong>After ${money(offer.priceAfter)}</strong>
        <span>${offer.discountPercent}% discount</span>
      </div>
      <small>${escapeHtml(offer.constraintsUsed.join(" ")) || "Policy constraints satisfied."}</small>
    </article>
  `;
}

function negotiationSessionExists() {
  const key = protocol?.STORAGE_KEYS?.negotiationSession || "agmentic_negotiation_session_v1";
  return Boolean(localStorage.getItem(key));
}

function latestPublicMessage(action) {
  if (!protocol?.getAgentMessages) {
    return null;
  }
  return [...protocol.getAgentMessages()].reverse().find((message) => (
    message.action === action && message.visibility === "public"
  )) || null;
}

function latestPublicConsumerMessage(session) {
  const evaluationMessage = latestPublicMessage("CONSUMER_EVALUATION")
    || [...(session.messages || [])].reverse().find((message) => (
      message.action === "CONSUMER_EVALUATION" && message.visibility === "public"
    ));
  return evaluationMessage?.payload?.evaluation?.publicMessageToRetailer
    || evaluationMessage?.readableEnglish
    || "";
}

function statusCopy(status) {
  const labels = {
    accepted: "Consumer agent accepted the offer.",
    rejected: "Consumer agent rejected the offer.",
    counter_unresolved: "Consumer agent asked for a better fit, but no acceptable revision was found.",
    clarification_needed: "Consumer agent needs more information.",
    failed_no_safe_offer: "No safe offer was available for this consumer profile.",
  };
  return labels[status] || "No completed negotiation outcome yet.";
}

function nextStepCopy(status) {
  const labels = {
    accepted: "Hold the proposed items/table and prepare clear confirmation.",
    rejected: "Review allergy, budget, or preference mismatch before sending a new offer.",
    counter_unresolved: "Consider a lighter item, lower price, or non-discount value-add.",
    clarification_needed: "Provide clearer availability, price, allergens, or pairing details.",
    failed_no_safe_offer: "Do not push this offer. Update menu options or allergy-safe alternatives.",
  };
  return labels[status] || "Run a real local negotiation from the handshake dashboard.";
}

function readableStatus(status) {
  const labels = {
    accepted: "Accepted",
    rejected: "Rejected",
    counter_unresolved: "Counter unresolved",
    clarification_needed: "Clarification needed",
    failed_no_safe_offer: "No safe offer",
  };
  return labels[status] || "No outcome";
}

function currentSessionOffer(session) {
  return session.currentOffer?.offer || session.currentOffer || {};
}

function publicSafetySummary(terms) {
  const checks = terms?.safetyChecks || [];
  if (!checks.length) {
    return "No public safety checks recorded.";
  }
  return checks.map((check) => `${check.name || "check"}: ${check.status || "unknown"}`).join(" · ");
}

function renderNegotiationResult() {
  if (!els.negotiationResult) {
    return;
  }
  if (!protocol?.getNegotiationSession || !negotiationSessionExists()) {
    els.negotiationResult.innerHTML = '<p class="empty-state">No real local negotiation has been run yet.</p>';
    return;
  }

  const session = protocol.getNegotiationSession();
  const visibleStatuses = new Set(["accepted", "rejected", "counter_unresolved", "clarification_needed", "failed_no_safe_offer"]);
  if (!visibleStatuses.has(session.status)) {
    els.negotiationResult.innerHTML = '<p class="empty-state">No completed real local negotiation outcome yet.</p>';
    return;
  }

  const terms = session.finalTerms || {};
  const offer = currentSessionOffer(session);
  const acceptedItems = terms.acceptedItems?.length
    ? terms.acceptedItems
    : (offer.proposedItems || []).map((item) => item.name).filter(Boolean);
  const publicMessage = latestPublicConsumerMessage(session) || statusCopy(session.status);
  const finalPrice = terms.finalPrice === null || terms.finalPrice === undefined
    ? ""
    : `${terms.currency || els.currency.value} ${terms.finalPrice}`;
  const discount = terms.discountAmount
    ? `${terms.currency || els.currency.value} ${terms.discountAmount} off${terms.discountPercent ? ` (${terms.discountPercent}%)` : ""}`
    : (terms.valueAdd || offer.marketingTactic || "");
  const caveats = terms.remainingCaveats?.filter(Boolean) || [];

  els.negotiationResult.innerHTML = `
    <article class="negotiation-card">
      <div class="agent-card-header">
        <div>
          <strong>${escapeHtml(statusCopy(session.status))}</strong>
          <span>Public decision: ${escapeHtml(readableStatus(session.status))}</span>
        </div>
        <span class="distance-pill">${escapeHtml(readableStatus(session.status))}</span>
      </div>
      <dl class="negotiation-details">
        <div><dt>Accepted items</dt><dd>${acceptedItems.length ? escapeHtml(acceptedItems.join(", ")) : "None"}</dd></div>
        <div><dt>Final price</dt><dd>${escapeHtml(finalPrice || "Not finalized")}</dd></div>
        <div><dt>Discount/value-add</dt><dd>${escapeHtml(discount || "None recorded")}</dd></div>
        <div><dt>Safety checks</dt><dd>${escapeHtml(publicSafetySummary(terms))}</dd></div>
      </dl>
      <div class="retailer-public-message">
        <span>Public consumer message</span>
        <p>${escapeHtml(publicMessage)}</p>
      </div>
      ${caveats.length ? `
        <div class="retailer-public-message">
          <span>Open caveat</span>
          <p>${escapeHtml(caveats.join(" "))}</p>
        </div>
      ` : ""}
      <div class="next-step-box">
        <span>Retailer next step</span>
        <strong>${escapeHtml(nextStepCopy(session.status))}</strong>
      </div>
    </article>
  `;
}

async function findAgentsInRange() {
  const payload = buildAgentPayload();

  try {
    const data = await apiRequest("/retailer/agents/nearby", payload);
    state.nearbyAgents = normalizeAgents(data.agents || []);
    showToast(`${state.nearbyAgents.length} consumer agents found by API.`);
  } catch (error) {
    state.apiOnline = false;
    state.nearbyAgents = sampleAgents
      .filter((agent) => agent.distance_m <= Number(els.radius.value))
      .map((agent) => ({
        ...agent,
        offer: buildMarketingOffer(agent),
      }));
    showToast("Local agent simulation is on.");
  }

  save();
  render();
}

function normalizeAgents(agents) {
  return agents.map((agent) => ({
    id: agent.id || uuid(),
    name: agent.name || "Consumer agent",
    distance_m: Number(agent.distance_m || 0),
    intent: agent.intent || "dining intent",
    party_size: Number(agent.party_size || 1),
    preferences: agent.preferences || [],
    attention_signal: agent.attention_signal || "medium",
    offer: agent.offer || buildMarketingOffer(agent),
  }));
}

function buildMarketingOffer(agent) {
  const activePromotions = els.promoEnabled.checked ? state.promotions : [];
  const selectedPromotion = choosePromotion(agent, activePromotions);
  const menuHook = chooseMenuHook(agent);
  const channel = chooseMarketingChannel(agent);
  const urgency = agent.attention_signal === "high" ? "hold for 10 minutes" : "soft invitation";

  if (!selectedPromotion) {
    return {
      headline: `Invite ${agent.name} with ${menuHook}`,
      message: `Lead with ${menuHook}, mention proximity, and invite the consumer agent to request preferences before arrival.`,
      method: channel,
      concession: "No promotion selected",
      urgency,
    };
  }

  return {
    headline: `${selectedPromotion.name} for ${agent.intent}`,
    message: `Use ${channel}: open with ${menuHook}, then offer ${formatPromotion(selectedPromotion)} because the intent is ${agent.intent}.`,
    method: channel,
    concession: selectedPromotion.max_agent_concession,
    urgency,
    promotion_id: selectedPromotion.id,
  };
}

function choosePromotion(agent, promotions) {
  if (!promotions.length) {
    return null;
  }

  const preferenceText = [...(agent.preferences || []), agent.intent || ""].join(" ").toLowerCase();
  return promotions.find((promotion) => {
    const rule = promotion.negotiation_rule.toLowerCase();
    return rule.split(/\W+/).some((word) => word.length > 4 && preferenceText.includes(word));
  }) || promotions[0];
}

function chooseMenuHook(agent) {
  const items = state.menu?.items || [];
  if (!items.length) {
    return "the current tasting menu";
  }

  const preferenceText = [...(agent.preferences || []), agent.intent || ""].join(" ").toLowerCase();
  const match = items.find((item) => {
    const source = `${item.name} ${item.description} ${item.section}`.toLowerCase();
    return preferenceText.split(/\W+/).some((word) => word.length > 4 && source.includes(word));
  }) || items[0];

  return match.price === null ? match.name : `${match.name} at ${money(match.price)}`;
}

function chooseMarketingChannel(agent) {
  if (agent.distance_m <= 200) {
    return "proximity nudge";
  }
  if ((agent.preferences || []).some((preference) => /wine|premium|pairing/i.test(preference))) {
    return "value-added upsell";
  }
  if (agent.party_size >= 4) {
    return "group conversion offer";
  }
  return "personalized menu hook";
}

async function negotiateWithAgent(agentId) {
  const agent = state.nearbyAgents.find((item) => item.id === agentId);
  if (!agent) {
    return;
  }

  const offer = buildMarketingOffer(agent);

  try {
    const data = await apiRequest("/retailer/negotiate", {
      agent: buildAgentPayload(),
      consumer_agent: agent,
      objective: "attract_consumer_agent",
      marketing_methods: [
        "proximity nudge",
        "personalized menu hook",
        "value-added upsell",
        "scarcity without over-discounting",
      ],
      proposed_offer: offer,
    });
    agent.offer = data.offer || offer;
    agent.negotiation_status = data.status || "offer_sent";
    showToast(`Offer sent to ${agent.name}.`);
  } catch (error) {
    state.apiOnline = false;
    agent.offer = offer;
    agent.negotiation_status = "local_offer_ready";
    showToast(`Offer prepared for ${agent.name}.`);
  }

  save();
  render();
}

function renderMenu() {
  if (!state.menu?.items?.length) {
    els.menuOutput.innerHTML = '<p class="empty-state">No standardized menu yet. Paste a menu or load the sample, then run standardization.</p>';
    return;
  }

  els.menuOutput.innerHTML = state.menu.sections.map((section) => {
    const items = state.menu.items.filter((item) => item.section === section);
    return `
      <article class="menu-card">
        <h3>${escapeHtml(section)}</h3>
        ${items.map((item) => `
          <div class="menu-item">
            <div class="item-meta">
              <strong>${escapeHtml(item.name)}</strong>
              <strong>${item.price === null ? "Market" : money(item.price)}</strong>
            </div>
            <span>${escapeHtml(item.description || "No description")}</span>
            <span>${[...item.dietary_tags, ...item.allergens.map((allergen) => `contains ${allergen}`)].join(" · ") || "standard item"}</span>
          </div>
        `).join("")}
      </article>
    `;
  }).join("");
}

function renderPromotions() {
  if (!state.promotions.length) {
    els.promoList.innerHTML = '<p class="empty-state">No promotions saved yet.</p>';
    return;
  }

  els.promoList.innerHTML = state.promotions.map((promotion) => `
    <article class="promo-card">
      <strong>${escapeHtml(promotion.name)}</strong>
      <span>${escapeHtml(formatPromotion(promotion))}</span>
      <span>${escapeHtml(promotion.negotiation_rule || "No negotiation rule set.")}</span>
      <button type="button" data-remove-promo="${promotion.id}" aria-label="Remove promotion" title="Remove promotion">
        <i data-lucide="x"></i>
      </button>
    </article>
  `).join("");
}

function formatPromotion(promotion) {
  const value = promotion.type === "percentage" ? `${promotion.value}%` : promotion.type === "fixed" ? money(promotion.value) : promotion.value;
  return `${promotion.type.replace("_", " ")} · ${value} · max concession ${promotion.max_agent_concession}`;
}

function renderAgents() {
  if (!state.nearbyAgents.length) {
    els.agentList.innerHTML = '<p class="empty-state">No consumer agents discovered yet. Set the radius, then find agents in range.</p>';
    return;
  }

  els.agentList.innerHTML = state.nearbyAgents.map((agent) => {
    const offer = agent.offer || buildMarketingOffer(agent);
    return `
      <article class="agent-card">
        <div class="agent-card-header">
          <div>
            <strong>${escapeHtml(agent.name)}</strong>
            <span>${escapeHtml(agent.intent)} · ${agent.party_size} guests</span>
          </div>
          <span class="distance-pill">${Math.round(agent.distance_m)} m</span>
        </div>
        <div class="preference-row">
          ${(agent.preferences || []).map((preference) => `<span>${escapeHtml(preference)}</span>`).join("")}
        </div>
        <div class="offer-box">
          <strong>${escapeHtml(offer.headline)}</strong>
          <span>${escapeHtml(offer.message)}</span>
          <small>${escapeHtml(offer.method)} · ${escapeHtml(offer.urgency)}${agent.negotiation_status ? ` · ${escapeHtml(agent.negotiation_status)}` : ""}</small>
        </div>
        <button class="primary-action" type="button" data-negotiate-agent="${agent.id}">
          <i data-lucide="sparkles"></i>
          Negotiate offer
        </button>
      </article>
    `;
  }).join("");
}

function render() {
  els.radiusValue.textContent = `${els.radius.value} m`;
  els.connectionLabel.textContent = state.menu?.items?.length
    ? "Menu ready"
    : "Ready";
  renderMenu();
  renderPromotions();
  renderAgents();
  renderNegotiationResult();
  lucide.createIcons();
}

function save() {
  syncMenuMetadata();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    rawMenu: els.rawMenu.value,
    retailerName: els.retailerName.value,
    cuisine: els.cuisine.value,
    currency: els.currency.value,
    radius: els.radius.value,
    promoEnabled: els.promoEnabled.checked,
    menu: state.menu,
    promotions: state.promotions,
    location: state.location,
    nearbyAgents: state.nearbyAgents,
  }));
  saveSharedRetailerPolicy();
}

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!stored) {
      els.rawMenu.value = sampleMenu;
      return;
    }

    els.rawMenu.value = stored.rawMenu || "";
    els.retailerName.value = stored.retailerName || "Maison Lumiere";
    els.cuisine.value = stored.cuisine || "modern fine dining";
    els.currency.value = stored.currency || "EUR";
    els.radius.value = stored.radius || 450;
    els.promoEnabled.checked = stored.promoEnabled !== false;
    state.menu = stored.menu || null;
    state.promotions = stored.promotions || [];
    state.location = stored.location || null;
    state.nearbyAgents = stored.nearbyAgents || [];
    if (state.menu?.items?.length) {
      els.menuStatus.textContent = `${state.menu.items.length} items`;
    }
    if (state.location) {
      els.locationLabel.textContent = `${state.location.latitude.toFixed(5)}, ${state.location.longitude.toFixed(5)}`;
    }
  } catch (error) {
    els.rawMenu.value = sampleMenu;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.querySelector("#standardizeMenu").addEventListener("click", standardizeMenu);
document.querySelector("#standardizeTop").addEventListener("click", standardizeMenu);
document.querySelector("#loadSample").addEventListener("click", () => {
  els.rawMenu.value = sampleMenu;
  save();
  showToast("Sample fine-dining menu loaded.");
});
document.querySelector("#clearMenu").addEventListener("click", () => {
  els.rawMenu.value = "";
  state.menu = null;
  els.menuStatus.textContent = "Draft";
  save();
  render();
});
document.querySelector("#savePromotion").addEventListener("click", addPromotion);
document.querySelector("#addPromotion").addEventListener("click", () => els.promoName.focus());
document.querySelector("#findAgents").addEventListener("click", findAgentsInRange);
document.querySelector("#generateAgentOffer").addEventListener("click", generateSharedRetailerOffer);
document.querySelector("#refreshNegotiationResult").addEventListener("click", renderNegotiationResult);
document.querySelector("#copyPayload").addEventListener("click", async () => {
  await navigator.clipboard.writeText(JSON.stringify(buildAgentPayload(), null, 2));
  showToast("Agent payload copied.");
});
document.querySelector("#useLocation").addEventListener("click", () => {
  if (!navigator.geolocation) {
    showToast("Geolocation is not available in this browser.");
    return;
  }

  navigator.geolocation.getCurrentPosition((position) => {
    state.location = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy_m: Math.round(position.coords.accuracy || 0),
      captured_at: new Date().toISOString(),
    };
    els.locationLabel.textContent = `${state.location.latitude.toFixed(5)}, ${state.location.longitude.toFixed(5)}`;
    save();
    render();
    showToast("Location attached to retailer discovery.");
  }, () => {
    showToast("Location permission was not granted.");
  });
});

els.radius.addEventListener("input", () => {
  save();
  render();
});
els.promoEnabled.addEventListener("change", () => {
  save();
  render();
});
["retailerName", "cuisine"].forEach((key) => {
  els[key].addEventListener("input", () => {
    save();
    render();
  });
});
els.currency.addEventListener("change", () => {
  save();
  render();
});
els.rawMenu.addEventListener("change", () => {
  save();
});
els.promoList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-promo]");
  if (button) {
    removePromotion(button.dataset.removePromo);
  }
});
els.agentList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-negotiate-agent]");
  if (button) {
    negotiateWithAgent(button.dataset.negotiateAgent);
  }
});

window.addEventListener("storage", (event) => {
  const sessionKey = protocol?.STORAGE_KEYS?.negotiationSession || "agmentic_negotiation_session_v1";
  const messageKey = protocol?.STORAGE_KEYS?.agentMessages || "agmentic_agent_messages_v1";
  if (event.key === sessionKey || event.key === messageKey) {
    renderNegotiationResult();
  }
});
window.addEventListener("focus", renderNegotiationResult);

load();
render();
