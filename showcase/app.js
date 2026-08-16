const scenarios = {
  business: {
    label: "Business dinner",
    occasion: "Client dinner",
    party: 4,
    budget: 32,
    preference: "Quiet room",
    calendar: "Client dinner with Acme · 19:00",
    sentence: "Find a quiet business dinner for four near Berlin Mitte, under €32 per person.",
    item: "Sea bass",
    itemDetail: "Saffron beurre blanc · fennel",
    basePrice: 34,
    finalPrice: 29.92,
    promotion: "Chef welcome · 12% concession",
    condition: "Quiet table held for 10 minutes",
    shared: ["business_dining", "quiet_seating", "budget_32", "party_4"],
  },
  anniversary: {
    label: "Anniversary",
    occasion: "Anniversary dinner",
    party: 2,
    budget: 48,
    preference: "Wine pairing",
    calendar: "Anniversary dinner · 20:00",
    sentence: "Find a celebratory anniversary dinner for two, with a wine pairing under €48 per person.",
    item: "Wagyu beef cheek",
    itemDetail: "Celeriac purée · bordelaise",
    basePrice: 42,
    finalPrice: 42,
    promotion: "Dessert moment · included",
    condition: "Celebration table preference noted",
    shared: ["celebration", "pairing_value", "budget_48", "party_2"],
  },
  budget: {
    label: "Smart budget dinner",
    occasion: "Casual dinner",
    party: 3,
    budget: 28,
    preference: "Vegetarian option",
    calendar: "Dinner with friends · 18:30",
    sentence: "Find a vegetarian-friendly dinner for three, with the best value under €28 per person.",
    item: "Wild mushroom risotto",
    itemDetail: "Parmesan foam · chanterelle",
    basePrice: 29,
    finalPrice: 25.52,
    promotion: "Chef welcome · 12% concession",
    condition: "Vegetarian suitability checked",
    shared: ["group_dining", "vegetarian_option", "budget_28", "party_3"],
  },
};

const state = {
  scenario: "business",
  signals: new Set(["calendar", "location"]),
  callPriority: "",
  protocolVisible: false,
  running: false,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

function goToStep(name) {
  const visibleStep = name === "handshake" ? "intent" : name;
  $$("[data-step]").forEach((step) => step.classList.toggle("active", step.dataset.step === visibleStep));
  $$("[data-guide]").forEach((item) => item.classList.toggle("active", item.dataset.guide === name));
  const order = ["scenario", "signals", "intent", "handshake"];
  const current = order.indexOf(name);
  $$("[data-progress]").forEach((item) => {
    const index = order.indexOf(item.dataset.progress);
    item.classList.toggle("active", index === current);
    item.classList.toggle("complete", index < current);
  });
  if (name === "intent") renderIntent();
}

function selectScenario(name) {
  state.scenario = name;
  state.callPriority = "";
  $$("[data-scenario]").forEach((button) => {
    const selected = button.dataset.scenario === name;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });
  $("#calendarSignal").textContent = scenarios[name].calendar;
}

function toggleSignal(button) {
  const signal = button.dataset.signal;
  if (state.signals.has(signal)) state.signals.delete(signal);
  else state.signals.add(signal);
  const enabled = state.signals.has(signal);
  button.classList.toggle("enabled", enabled);
  button.setAttribute("aria-pressed", String(enabled));
  if (signal === "call") $("#fakeCall").hidden = !enabled;
}

function effectivePreference(scenario) {
  if (state.callPriority === "quiet") return "Quiet room";
  if (state.callPriority === "price") return "Lowest price";
  if (state.signals.has("weather")) return `${scenario.preference} · indoor seating`;
  return scenario.preference;
}

function renderIntent() {
  const scenario = scenarios[state.scenario];
  const preference = effectivePreference(scenario);
  $("#intentSentence").textContent = scenario.sentence;
  $("#intentOccasion").textContent = scenario.occasion;
  $("#intentParty").textContent = `${scenario.party} guests`;
  $("#intentBudget").textContent = `€${scenario.budget} / person`;
  $("#intentPreference").textContent = preference;
  $("#privateCount").textContent = `${Math.max(3, state.signals.size + 2)} context points`;
  const signals = [...scenario.shared];
  if (state.signals.has("weather")) signals.push("indoor_preferred");
  if (state.callPriority) signals.push(`${state.callPriority}_priority`);
  $("#sharedSignals").textContent = `${signals.length} derived signals`;
}

function buildEvents(scenario) {
  const preference = effectivePreference(scenario);
  const shared = [...scenario.shared];
  if (state.signals.has("weather")) shared.push("indoor_preferred");
  if (state.callPriority) shared.push(`${state.callPriority}_priority`);
  return [
    {
      actor: "System",
      action: "SECURE_CHANNEL",
      title: "Agents establish a scoped channel",
      copy: "This exchange is limited to one dining request and expires after the showcase.",
      data: { protocol: "agmentic-guided.v1", scope: "single_dining_request", retention: "ephemeral" },
    },
    {
      actor: "Consumer",
      action: "INTENT_BRIEF",
      title: `Consumer shares ${shared.length} derived signals`,
      copy: `${scenario.party} guests · €${scenario.budget} per person · ${preference}. Raw notes remain blocked.`,
      data: { purchase_context: scenario.occasion, constraints: { party_size: scenario.party, budget_per_person: scenario.budget }, signals: shared, raw_profile_shared: false },
    },
    {
      actor: "Retailer",
      action: "MENU_POLICY",
      title: "Maison Lumière returns menu and policy",
      copy: "17 menu items, a maximum 12% price concession, and value-added table benefits are available.",
      data: { menu_items: 17, max_concession_percent: 12, capabilities: ["menu_exchange", "budget_respect", "table_hold"] },
    },
    {
      actor: "Retailer",
      action: "OFFER_PROPOSAL",
      title: `${scenario.item} proposed at €${scenario.finalPrice.toFixed(2)}`,
      copy: `${scenario.promotion}. The item matches the occasion and remains below the declared budget.`,
      data: { item: scenario.item, list_price: scenario.basePrice, proposed_price: scenario.finalPrice, promotion: scenario.promotion, within_budget: true },
    },
    {
      actor: "Consumer",
      action: "VERIFY_CONSTRAINTS",
      title: "Consumer agent checks the offer",
      copy: `Budget passes. ${preference} is preserved. Availability remains explicitly simulated.`,
      data: { budget: "pass", preference: "pass", availability: "simulated", payment: "not_requested" },
    },
    {
      actor: "Retailer",
      action: "ACCEPT_WITH_TERMS",
      title: "Offer is ready for the user",
      copy: `${scenario.condition}. No booking or payment has been made.`,
      data: { status: "ready_for_user_confirmation", condition: scenario.condition, booking: "simulated" },
    },
  ];
}

function eventMarkup(event, index) {
  return `<li class="protocol-event">
    <span class="event-number">0${index + 1}</span>
    <div>
      <div class="event-meta"><span>${escapeHtml(event.actor)}</span><span>${escapeHtml(event.action)}</span></div>
      <strong>${escapeHtml(event.title)}</strong>
      <p>${escapeHtml(event.copy)}</p>
      <pre class="event-json">${escapeHtml(JSON.stringify(event.data, null, 2))}</pre>
    </div>
  </li>`;
}

async function runHandshake() {
  if (state.running || !$("#consent").checked) return;
  state.running = true;
  $("#runHandshake").disabled = true;
  goToStep("handshake");
  $("#handshake").scrollIntoView({ behavior: "smooth", block: "start" });
  $("#emptyProtocol").hidden = true;
  $("#eventStream").innerHTML = "";
  $("#outcome").hidden = true;
  const status = $("#handshakeStatus");
  status.className = "handshake-status running";
  status.querySelector("span").textContent = "Negotiating live";

  const scenario = scenarios[state.scenario];
  for (const [index, event] of buildEvents(scenario).entries()) {
    $("#eventStream").insertAdjacentHTML("beforeend", eventMarkup(event, index));
    await wait(520);
  }

  status.className = "handshake-status complete";
  status.querySelector("span").textContent = "Offer verified";
  renderOutcome(scenario);
  state.running = false;
  $("#runHandshake").disabled = false;
}

function renderOutcome(scenario) {
  $("#outcomeTitle").textContent = `${scenario.label} at Maison Lumière`;
  $("#outcomeMeta").textContent = `${scenario.party} guests · ${scenario.condition}`;
  $("#outcomeItems").innerHTML = `<span><strong>${escapeHtml(scenario.item)}</strong></span><span>${escapeHtml(scenario.itemDetail)}</span><span>${escapeHtml(scenario.promotion)}</span>`;
  $("#outcomePrice").textContent = `€${scenario.finalPrice.toFixed(2)}`;
  $("#outcomeBudget").textContent = `€${(scenario.budget - scenario.finalPrice).toFixed(2)} below budget`;
  $("#outcomeExplanation").textContent = `The retailer policy allowed ${scenario.promotion.toLowerCase()}. The consumer agent verified that €${scenario.finalPrice.toFixed(2)} is below the €${scenario.budget} per-person cap and that “${effectivePreference(scenario)}” remains represented. Venue availability and reservation are simulated in this showcase.`;
  $("#outcomeExplanation").hidden = true;
  $("#outcome").hidden = false;
  $("#outcome").focus({ preventScroll: true });
}

function resetDemo() {
  state.scenario = "business";
  state.signals = new Set(["calendar", "location"]);
  state.callPriority = "";
  state.running = false;
  selectScenario("business");
  $$("[data-signal]").forEach((button) => {
    const enabled = state.signals.has(button.dataset.signal);
    button.classList.toggle("enabled", enabled);
    button.setAttribute("aria-pressed", String(enabled));
  });
  $("#fakeCall").hidden = true;
  $("#consent").checked = true;
  $("#runHandshake").disabled = false;
  $("#eventStream").innerHTML = "";
  $("#emptyProtocol").hidden = false;
  $("#outcome").hidden = true;
  $("#handshakeStatus").className = "handshake-status";
  $("#handshakeStatus span").textContent = "Waiting for a brief";
  goToStep("scenario");
  $("#demo").scrollIntoView({ behavior: "smooth", block: "start" });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

$$('[data-scroll-demo]').forEach((button) => button.addEventListener("click", () => $("#demo").scrollIntoView({ behavior: "smooth" })));
$$('[data-scenario]').forEach((button) => button.addEventListener("click", () => selectScenario(button.dataset.scenario)));
$$('[data-signal]').forEach((button) => button.addEventListener("click", () => toggleSignal(button)));
$$('[data-next]').forEach((button) => button.addEventListener("click", () => goToStep(button.dataset.next)));
$$('[data-back]').forEach((button) => button.addEventListener("click", () => goToStep(button.dataset.back)));
$$('[data-call-answer]').forEach((button) => button.addEventListener("click", () => {
  state.callPriority = button.dataset.callAnswer;
  $$("[data-call-answer]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
  $("#fakeCall strong").textContent = button.dataset.callAnswer === "quiet" ? "Priority saved: quiet room." : "Priority saved: lowest price.";
}));
$("#consent").addEventListener("change", (event) => { $("#runHandshake").disabled = !event.target.checked; });
$("#runHandshake").addEventListener("click", runHandshake);
$("#protocolToggle").addEventListener("click", (event) => {
  state.protocolVisible = !state.protocolVisible;
  event.currentTarget.setAttribute("aria-pressed", String(state.protocolVisible));
  event.currentTarget.textContent = state.protocolVisible ? "Hide protocol data" : "Show protocol data";
  $("#eventStream").classList.toggle("show-protocol", state.protocolVisible);
});
$("#replayDemo").addEventListener("click", resetDemo);
$("#explainOutcome").addEventListener("click", () => {
  const panel = $("#outcomeExplanation");
  panel.hidden = !panel.hidden;
  $("#explainOutcome").textContent = panel.hidden ? "Why this offer?" : "Hide explanation";
});

selectScenario("business");
goToStep("scenario");
