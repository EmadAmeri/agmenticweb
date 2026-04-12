const ui = {
  question: document.getElementById("question"),
  runButton: document.getElementById("run-demo"),
  clearButton: document.getElementById("clear-log"),
  trace: document.getElementById("trace"),
  answer: document.getElementById("final-answer"),
  statusPill: document.getElementById("status-pill"),
};

const productCatalog = [
  {
    sku: "DECK-100",
    name: "Deck Tile Aqua",
    family: "decking",
    project: "terrace",
    colors: ["brown", "anthracite"],
    tags: ["terrace", "decking", "waterproof", "wood", "outdoor"],
    reason: "It is designed for outdoor use and handles moisture well.",
    quantityRule: "Estimate 1.1 packs per square meter for a safe planning buffer.",
  },
  {
    sku: "WOOD-330",
    name: "Timber Shield Decking",
    family: "decking",
    project: "terrace",
    colors: ["brown", "grey"],
    tags: ["terrace", "decking", "waterproof", "balcony", "outdoor"],
    reason: "It has an anti-slip surface and suits higher-traffic terraces.",
    quantityRule: "Estimate 1 pack per square meter for planning purposes.",
  },
  {
    sku: "POOL-210",
    name: "FlowPro 2100 Pool Pump",
    family: "pump",
    project: "pool",
    colors: ["black"],
    tags: ["pool", "pump", "water", "filter"],
    reason: "It is a solid fit for home pools and gives stable circulation.",
    quantityRule: "Single-unit product. Quantity depends on the number of circulation zones.",
  },
  {
    sku: "KITCH-410",
    name: "Base Cabinet 60 White",
    family: "cabinet",
    project: "kitchen",
    colors: ["white"],
    tags: ["kitchen", "cabinet", "base cabinet", "storage", "white"],
    reason: "It matches standard kitchen layouts and works well as a base storage unit.",
    quantityRule: "For a rough kitchen concept, estimate 1 base cabinet per 2.5 square meters.",
  },
  {
    sku: "KITCH-430",
    name: "Tall Cabinet 40 White",
    family: "cabinet",
    project: "kitchen",
    colors: ["white"],
    tags: ["kitchen", "cabinet", "tall cabinet", "pantry", "white"],
    reason: "It is useful for vertical storage and complements base cabinets in medium kitchens.",
    quantityRule: "For planning, add 1 tall cabinet for every 10 to 12 square meters if vertical storage is needed.",
  },
  {
    sku: "KITCH-510",
    name: "Base Cabinet 60 Graphite",
    family: "cabinet",
    project: "kitchen",
    colors: ["graphite", "grey", "black"],
    tags: ["kitchen", "cabinet", "base cabinet", "graphite", "storage"],
    reason: "It gives a darker look while keeping the same modular cabinet footprint.",
    quantityRule: "For a rough kitchen concept, estimate 1 base cabinet per 2.5 square meters.",
  },
];

const inventoryData = {
  munich: {
    "DECK-100": { stock: 20, pickupToday: true, eta: "today" },
    "WOOD-330": { stock: 7, pickupToday: true, eta: "today" },
    "POOL-210": { stock: 3, pickupToday: false, eta: "tomorrow afternoon" },
    "KITCH-410": { stock: 16, pickupToday: true, eta: "today" },
    "KITCH-430": { stock: 6, pickupToday: true, eta: "today" },
    "KITCH-510": { stock: 11, pickupToday: false, eta: "tomorrow" },
  },
  berlin: {
    "DECK-100": { stock: 8, pickupToday: false, eta: "tomorrow" },
    "WOOD-330": { stock: 14, pickupToday: true, eta: "today" },
    "POOL-210": { stock: 5, pickupToday: true, eta: "today" },
    "KITCH-410": { stock: 9, pickupToday: false, eta: "tomorrow" },
    "KITCH-430": { stock: 4, pickupToday: true, eta: "today" },
    "KITCH-510": { stock: 13, pickupToday: true, eta: "today" },
  },
};

const detectionConfig = {
  projectKeywords: {
    terrace: ["terrace", "balcony", "patio", "deck"],
    pool: ["pool", "swimming pool"],
    kitchen: ["kitchen", "cabinet", "kitchen cabinet", "cupboard"],
  },
  familyKeywords: {
    decking: ["decking", "deck", "flooring", "outdoor floor", "tile"],
    pump: ["pump", "water pump", "filter pump"],
    cabinet: ["cabinet", "base cabinet", "tall cabinet", "cupboard", "storage unit"],
  },
  opsKeywords: ["available", "availability", "store", "in stock", "pickup", "ready", "delivery", "arrive", "status", "order", "shipping", "branch"],
  salesKeywords: ["recommend", "which", "best", "suitable", "need", "how many", "how much", "what should", "what do i need"],
  colors: ["white", "black", "brown", "grey", "gray", "graphite", "anthracite"],
  cityMap: {
    munich: "munich",
    berlin: "berlin",
  },
};

ui.clearButton.addEventListener("click", resetUi);
ui.clearButton.addEventListener("click", () => {
  window.agmenticTrack("tool_reset", {
    tool_name: "orchestration_demo",
  });
});

ui.runButton.addEventListener("click", async () => {
  const message = ui.question.value.trim();
  if (!message) {
    return;
  }

  window.agmenticTrack("tool_run", {
    tool_name: "orchestration_demo",
    question_length: message.length,
  });
  window.agmenticTrack("question_submit", {
    question_length: message.length,
    has_store_reference: Boolean(detectCity(normalize(message))),
  });

  resetUi();
  ui.answer.textContent = "Processing...";
  ui.answer.classList.remove("empty");
  setStatus("Running", "running");

  addTrace("Input", `Customer message received: "${message}"`);

  const aiResult = await getAiPlan(message);
  const context = analyzeMessage(message, aiResult?.plan?.entities || {});

  const route = aiResult?.plan
    ? buildRoutePlanFromAi(aiResult.plan, context)
    : buildRoutePlan(context);
  addTrace(
    "Category detected",
    `${route.typeLabel}\n${route.reason}\nConfidence: ${route.confidence}`,
    "Step 1"
  );

  let salesResult = null;
  let opsResult = null;

  if (route.type === "hybrid") {
    addTrace(
      "Question split",
      `Subtask A: ${route.tasks.sales}\nSubtask B: ${route.tasks.operations}`,
      "Step 2"
    );

    [salesResult, opsResult] = await Promise.all([
      runSalesAgent(context),
      runOperationsAgent(context),
    ]);
  } else if (route.type === "sales") {
    addTrace("Question split", `Subtask: ${route.tasks.sales}`, "Step 2");
    salesResult = await runSalesAgent(context);
  } else {
    addTrace("Question split", `Subtask: ${route.tasks.operations}`, "Step 2");
    opsResult = await runOperationsAgent(context);
  }
  addTrace(
    "Agent handoff",
    buildHandoffSummary(route, salesResult, opsResult),
    "Step 3"
  );

  const finalAnswer = synthesizeAnswer({ context, route, salesResult, opsResult });
  addTrace(
    "Unified response",
    "The outputs were merged into one customer-facing answer.",
    "Step 4"
  );
  ui.answer.textContent = finalAnswer;
  setStatus("Complete", "done");
});

function resetUi() {
  ui.trace.innerHTML = "";
  ui.answer.textContent = "No answer generated yet.";
  ui.answer.classList.add("empty");
  setStatus("Ready", "idle");
}

function setStatus(text, stateClass) {
  ui.statusPill.textContent = text;
  ui.statusPill.className = `pill ${stateClass}`;
}

function addTrace(title, body, kicker = "") {
  const item = document.createElement("div");
  item.className = "trace-item";
  item.innerHTML = `${kicker ? `<div class="trace-kicker">${escapeHtml(kicker)}</div>` : ""}<strong>${escapeHtml(title)}</strong><div>${escapeHtml(body).replace(/\n/g, "<br />")}</div>`;
  ui.trace.appendChild(item);
}

function analyzeMessage(message, aiEntities = {}) {
  const text = normalize(message);
  const project = normalizeOptional(aiEntities.project) || detectMappedValue(text, detectionConfig.projectKeywords);
  const family = normalizeOptional(aiEntities.family) || detectMappedValue(text, detectionConfig.familyKeywords);
  const color = normalizeOptional(aiEntities.color) || detectFirst(text, detectionConfig.colors);
  const city = normalizeOptional(aiEntities.city) || detectCity(text);
  const areaSqm = aiEntities.areaSqm ?? detectAreaSqm(text);
  const salesSignals = scoreMatches(text, detectionConfig.salesKeywords);
  const opsSignals = scoreMatches(text, detectionConfig.opsKeywords);
  const quantityIntent =
    aiEntities.quantityIntent ?? (text.includes("how many") || text.includes("how much"));
  const productIntent = Boolean(project || family || salesSignals.length || quantityIntent);
  const operationalIntent = Boolean(city || color || opsSignals.length);

  return {
    raw: message,
    text,
    project,
    family,
    color,
    city,
    areaSqm,
    quantityIntent,
    productIntent,
    operationalIntent,
    salesSignals,
    opsSignals,
    signals: [...salesSignals, ...opsSignals],
  };
}

function buildRoutePlanFromAi(plan, context) {
  const routeType = plan.routeType;
  const labelMap = {
    sales: "Product advice query",
    operations: "Operations or availability query",
    hybrid: "Hybrid product + operations query",
  };

  return {
    type: routeType,
    typeLabel: labelMap[routeType] || "Unknown query type",
    confidence: typeof plan.confidence === "number" ? plan.confidence.toFixed(2) : "0.80",
    reason: plan.summary || "AI router produced a structured route plan.",
    tasks: {
      sales: plan.tasks?.sales || buildSalesTask(context),
      operations: plan.tasks?.operations || buildOperationsTask(context),
    },
  };
}

function buildRoutePlan(context) {
  const productSideStrong = context.productIntent;
  const opsSideStrong =
    context.opsSignals.length > 0 ||
    (Boolean(context.city) && (context.color || context.family || context.project));

  if (productSideStrong && opsSideStrong) {
    return {
      type: "hybrid",
      typeLabel: "Hybrid product + operations query",
      confidence: "0.95",
      reason: "The message contains product-selection intent and store or availability intent.",
      tasks: {
        sales: buildSalesTask(context),
        operations: buildOperationsTask(context),
      },
    };
  }

  if (productSideStrong) {
    return {
      type: "sales",
      typeLabel: "Product advice query",
      confidence: "0.91",
      reason: "The message mainly asks for recommendation, sizing, or product planning.",
      tasks: {
        sales: buildSalesTask(context),
      },
    };
  }

  return {
    type: "operations",
    typeLabel: "Operations or availability query",
    confidence: "0.89",
    reason: "The message mainly asks for store, stock, order, or delivery information.",
    tasks: {
      operations: buildOperationsTask(context),
    },
  };
}

function buildSalesTask(context) {
  const parts = [];
  if (context.project) parts.push(`project=${context.project}`);
  if (context.family) parts.push(`family=${context.family}`);
  if (context.color) parts.push(`preferred_color=${context.color}`);
  if (context.areaSqm) parts.push(`area=${context.areaSqm}sqm`);
  if (context.quantityIntent) parts.push("estimate_quantity=true");
  return `recommend products with constraints: ${parts.join(", ") || "general DIY consultation"}`;
}

function buildOperationsTask(context) {
  const parts = [];
  if (context.city) parts.push(`store=${context.city}`);
  if (context.family) parts.push(`family=${context.family}`);
  if (context.project) parts.push(`project=${context.project}`);
  if (context.color) parts.push(`color=${context.color}`);
  return `check stock, pickup, or delivery with constraints: ${parts.join(", ") || "general support context"}`;
}

async function runSalesAgent(context) {
  await delay(450);

  const candidates = productCatalog
    .map((product) => ({
      product,
      score: scoreProduct(product, context),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.product);

  const products = (candidates.length ? candidates : productCatalog.slice(0, 2)).map((product) => ({
    sku: product.sku,
    name: product.name,
    family: product.family,
    project: product.project,
    reason: product.reason,
    quantityHint: buildQuantityHint(product, context),
  }));

  return {
    agent: "sales",
    decision: context.quantityIntent ? "product_planning_and_recommendation" : "product_recommendation",
    detectedContext: {
      project: context.project,
      family: context.family,
      color: context.color,
      areaSqm: context.areaSqm,
    },
    products,
  };
}

async function runOperationsAgent(context) {
  await delay(520);

  const cityKey = context.city || "munich";
  const stockTable = inventoryData[cityKey] || inventoryData.munich;

  const matchingProducts = productCatalog
    .filter((product) => scoreProduct(product, context) > 0)
    .slice(0, 3);

  const targetProducts = matchingProducts.length ? matchingProducts : productCatalog.slice(0, 2);

  const availability = targetProducts
    .filter((product) => stockTable[product.sku])
    .map((product) => ({
      sku: product.sku,
      name: product.name,
      stock: stockTable[product.sku].stock,
      pickupToday: stockTable[product.sku].pickupToday,
      eta: stockTable[product.sku].eta,
      colorMatch: context.color ? product.colors.includes(context.color) : true,
    }));

  return {
    agent: "operations",
    decision: context.opsSignals.includes("order") ? "order_support" : "inventory_lookup",
    detectedContext: {
      city: cityKey,
      color: context.color,
      family: context.family,
      project: context.project,
    },
    availability,
    note: cityKey
      ? `Operational lookup executed against the ${capitalize(cityKey)} store dataset.`
      : "Operational lookup executed against the default store dataset.",
  };
}

function synthesizeAnswer({ context, route, salesResult, opsResult }) {
  if (route.type === "sales" && salesResult) {
    return buildSalesSummary(salesResult, context);
  }

  if (route.type === "operations" && opsResult) {
    return buildOpsSummary(opsResult, context);
  }

  if (salesResult && opsResult) {
    const preferredProduct =
      opsResult.availability.find((item) => item.colorMatch) || opsResult.availability[0];
    const relatedRecommendation =
      salesResult.products.find((item) => item.sku === preferredProduct?.sku) || salesResult.products[0];
    const quantityLine = relatedRecommendation?.quantityHint ? `${relatedRecommendation.quantityHint}` : "";

    return [
      `For this request, the router correctly identified a hybrid question: product planning plus store availability.`,
      `${relatedRecommendation.name} is a strong fit because ${relatedRecommendation.reason}`,
      quantityLine,
      preferredProduct
        ? `In the ${capitalize(opsResult.detectedContext.city)} store, ${preferredProduct.name} shows ${preferredProduct.stock} units in stock${preferredProduct.pickupToday ? " with same-day pickup available" : ` and estimated readiness ${preferredProduct.eta}`}.`
        : `No exact SKU match was found in the selected store dataset, so the operations side should fall back to category-level stock.`,
      `This is the pattern we would also use in production: detect entities, create a task plan, call the relevant systems, and synthesize one answer.`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return "No answer was generated for this question.";
}

function buildSalesSummary(salesResult, context) {
  const lines = salesResult.products.map((item) => {
    const quantity = item.quantityHint ? ` ${item.quantityHint}` : "";
    return `${item.name}: ${item.reason}${quantity}`;
  });

  return [
    `The router treated this as a product advice question.`,
    context.project ? `Detected project: ${context.project}.` : "",
    lines.join("\n"),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildOpsSummary(opsResult, context) {
  const lines = opsResult.availability.map(
    (item) => `${item.name}: ${item.stock} units in stock, ETA ${item.eta}${item.pickupToday ? ", same-day pickup available" : ""}`
  );

  return [
    `The router treated this as an operations question.`,
    context.city ? `Detected store: ${capitalize(context.city)}.` : "",
    lines.join("\n"),
    opsResult.note,
  ]
    .filter(Boolean)
    .join("\n");
}

function scoreProduct(product, context) {
  let score = 0;

  if (context.project && product.project === context.project) score += 4;
  if (context.family && product.family === context.family) score += 4;
  if (context.color && product.colors.includes(context.color)) score += 2;

  product.tags.forEach((tag) => {
    if (context.text.includes(tag)) score += 1;
  });

  return score;
}

function buildQuantityHint(product, context) {
  if (!context.quantityIntent && !context.areaSqm) {
    return "";
  }

  if (product.family === "cabinet" && context.areaSqm) {
    const baseEstimate = Math.max(2, Math.round(context.areaSqm / 2.5));
    const tallEstimate = Math.max(0, Math.round(context.areaSqm / 10));
    if (product.sku === "KITCH-410") {
      return `For roughly ${context.areaSqm} sqm, start with about ${baseEstimate} base cabinets.`;
    }
    if (product.sku === "KITCH-430") {
      return `For roughly ${context.areaSqm} sqm, add about ${tallEstimate} tall cabinets if you want more vertical storage.`;
    }
  }

  if (product.family === "decking" && context.areaSqm) {
    const packs = Math.ceil(context.areaSqm * (product.sku === "DECK-100" ? 1.1 : 1));
    return `For roughly ${context.areaSqm} sqm, plan around ${packs} packs.`;
  }

  return product.quantityRule;
}

function detectMappedValue(text, mapping) {
  for (const [key, values] of Object.entries(mapping)) {
    if (values.some((value) => text.includes(value))) {
      return key;
    }
  }
  return null;
}

function detectFirst(text, values) {
  return values.find((value) => text.includes(value)) || null;
}

function detectCity(text) {
  return Object.keys(detectionConfig.cityMap).find((city) => text.includes(city)) || null;
}

document.getElementById("hornbachAgmenticLink")?.addEventListener("click", function() {
  window.agmenticTrack("outbound_click", {
    destination_url: this.href,
    link_text: "agmentic",
  });
});

function detectAreaSqm(text) {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(sqm|m2|square meter|square meters)/);
  if (!match) return null;
  return Number(match[1]);
}

function scoreMatches(text, keywords) {
  return keywords.filter((keyword) => text.includes(keyword));
}

function normalize(input) {
  return input.toLowerCase().replace(/[؟?!,.:;]/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function capitalize(value) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeOptional(value) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAiPlan(message) {
  try {
    const endpoint = window.location.hostname.includes("agmentic.com")
      ? "/api/hornbach-orchestrate"
      : "/api/orchestrate";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    addTrace("Router Fallback", `AI router unavailable, local planner used instead. ${error.message}`);
    return null;
  }
}

function buildHandoffSummary(route, salesResult, opsResult) {
  if (route.type === "hybrid") {
    const salesName = salesResult?.products?.[0]?.name || "product advisor";
    const opsStore = opsResult?.detectedContext?.city
      ? capitalize(opsResult.detectedContext.city)
      : "selected store";
    return `The product-advice task was sent to the sales agent and the availability task was sent to the operations agent for ${opsStore}. Top product candidate: ${salesName}.`;
  }

  if (route.type === "sales") {
    const salesName = salesResult?.products?.[0]?.name || "product advisor";
    return `The question was sent to the sales agent. Top product candidate: ${salesName}.`;
  }

  const opsStore = opsResult?.detectedContext?.city
    ? capitalize(opsResult.detectedContext.city)
    : "selected store";
  return `The question was sent to the operations agent for ${opsStore}.`;
}
