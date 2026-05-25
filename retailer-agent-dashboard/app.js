const STORAGE_KEY = "agmentic_retailer_agent_state_v1";

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
  negotiationPreview: document.querySelector("#negotiationPreview"),
  contractBlock: document.querySelector("#contractBlock"),
  toast: document.querySelector("#toast"),
};

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
  showToast("Menu standardized for consumer agents.");
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
      ],
    },
    menu: state.menu,
    marketing: {
      promotions_allowed: els.promoEnabled.checked,
      promotions: promotionPayload(),
    },
  };
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

function renderNegotiation() {
  const itemCount = state.menu?.items?.length || 0;
  const promoCount = els.promoEnabled.checked ? state.promotions.length : 0;
  const radius = Number(els.radius.value);

  els.negotiationPreview.innerHTML = `
    <p><strong>Policy:</strong> expose a normalized fine-dining menu to nearby consumer agents within ${radius} meters.</p>
    <ul>
      <li>${itemCount} menu items are available for structured recommendation and dietary matching.</li>
      <li>${promoCount} marketing promotions can be offered during negotiation.</li>
      <li>Agent may negotiate only inside saved promotion values and rules.</li>
      <li>Location is used for discovery, not for changing menu prices.</li>
    </ul>
  `;
}

function renderContract() {
  els.contractBlock.textContent = JSON.stringify({
    "POST /agent/handshake": {
      request: {
        consumer_agent_id: "consumer-agent-uuid",
        latitude: 52.520008,
        longitude: 13.404954,
        preferences: ["vegetarian", "wine_pairing"],
      },
      response: buildAgentPayload(),
    },
    "POST /agent/negotiate": {
      request: {
        consumer_agent_id: "consumer-agent-uuid",
        target: "reservation_or_order",
        requested_outcome: "best available dining offer",
      },
      response: {
        accepted_promotions: promotionPayload(),
        guardrails: "Never exceed max_agent_concession. Respect promotion negotiation_rule.",
      },
    },
  }, null, 2);
}

function render() {
  els.radiusValue.textContent = `${els.radius.value} m`;
  els.connectionLabel.textContent = state.menu?.items?.length
    ? "Standard menu is ready for a nearby consumer agent."
    : "Ready to expose menu when a consumer agent is nearby.";
  renderMenu();
  renderPromotions();
  renderNegotiation();
  renderContract();
  lucide.createIcons();
}

function save() {
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
  }));
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
["retailerName", "cuisine", "currency", "rawMenu"].forEach((key) => {
  els[key].addEventListener("change", save);
});
els.promoList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-promo]");
  if (button) {
    removePromotion(button.dataset.removePromo);
  }
});

load();
render();
