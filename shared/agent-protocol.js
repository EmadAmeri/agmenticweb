(function () {
  const STORAGE_KEYS = {
    consumerProfile: "agmentic_consumer_agent_profile_v1",
    retailerPolicy: "agmentic_retailer_agent_policy_v1",
    negotiationSession: "agmentic_negotiation_session_v1",
    agentMessages: "agmentic_agent_messages_v1",
  };

  const DEFAULT_NEGOTIATION_RULES = {
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

  function now() {
    return new Date().toISOString();
  }

  function generateId(prefix) {
    if (window.crypto?.randomUUID) {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function asArray(value) {
    if (Array.isArray(value)) {
      return value.filter((item) => item !== undefined && item !== null);
    }
    if (value === undefined || value === null || value === "") {
      return [];
    }
    return [value];
  }

  function asNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function asString(value, fallback = "") {
    if (value === undefined || value === null) {
      return fallback;
    }
    return String(value);
  }

  function readJson(key, fallback) {
    try {
      const raw = window.localStorage?.getItem(key);
      if (!raw) {
        return fallback;
      }
      return JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      window.localStorage?.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Storage can be unavailable in private or embedded contexts.
    }
    return value;
  }

  function createMenuItem(input = {}, defaults = {}) {
    const currency = asString(input.currency || defaults.currency, "EUR");
    return {
      id: asString(input.id, generateId("menu-item")),
      category: asString(input.category || input.section, "Menu"),
      name: asString(input.name, "Untitled item"),
      description: asString(input.description),
      price: input.price === null || input.price === "" ? null : asNumber(input.price, 0),
      currency,
      allergens: asArray(input.allergens),
      dietaryTags: asArray(input.dietaryTags || input.dietary_tags),
      pairingTags: asArray(input.pairingTags || input.pairing_tags),
      availability: asString(input.availability, "available"),
    };
  }

  function createPromotion(input = {}) {
    const promotionType = asString(input.type, "percentage");
    return {
      id: asString(input.id, generateId("promotion")),
      name: asString(input.name, "Untitled promotion"),
      type: promotionType === "complimentary" ? "complimentary_item" : promotionType,
      value: asNumber(input.value, 0),
      maxConcession: asNumber(input.maxConcession ?? input.max_agent_concession ?? input.value, 0),
      rule: asString(input.rule || input.negotiation_rule),
      appliesTo: asArray(input.appliesTo || input.applies_to),
      marketingText: asString(input.marketingText || input.marketing_text),
      expiresAt: asString(input.expiresAt || input.expires_at),
    };
  }

  function createNegotiationRules(input = {}) {
    const source = input && !Array.isArray(input) && typeof input === "object" ? input : {};
    return {
      maxDiscountPercent: asNumber(source.maxDiscountPercent, DEFAULT_NEGOTIATION_RULES.maxDiscountPercent),
      preferValueAddBeforeDiscount: Boolean(source.preferValueAddBeforeDiscount ?? DEFAULT_NEGOTIATION_RULES.preferValueAddBeforeDiscount),
      neverViolateAllergies: Boolean(source.neverViolateAllergies ?? DEFAULT_NEGOTIATION_RULES.neverViolateAllergies),
      neverOfferUnavailableItems: Boolean(source.neverOfferUnavailableItems ?? DEFAULT_NEGOTIATION_RULES.neverOfferUnavailableItems),
      requireClearPriceDisclosure: Boolean(source.requireClearPriceDisclosure ?? DEFAULT_NEGOTIATION_RULES.requireClearPriceDisclosure),
      allowedTactics: asArray(source.allowedTactics).length
        ? asArray(source.allowedTactics).map(String)
        : [...DEFAULT_NEGOTIATION_RULES.allowedTactics],
    };
  }

  function budgetPostureFromAmount(amount) {
    if (!amount) return "";
    if (amount <= 20) return "low";
    if (amount <= 45) return "medium";
    return "high";
  }

  // The consumer agent records the user's goal (party size, per-person budget,
  // drink, intent) as a memory note like:
  //   "Dining request: party of 4; budget 24 € per person; intent ...; request ..."
  // The handshake reads the consumer profile, so we parse that goal here so the
  // negotiation runs against the actual request instead of stale posture data.
  function parseDiningGoal(notes) {
    const text = asArray(notes).join(" ; ").toLowerCase();
    if (!text) return null;
    const result = { budgetPerPerson: null, partySize: null, goal: "", wantsDrink: false };

    let budget = text.match(/budget(?:\s+of)?\s*(?:€|\$|£)?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:€|\$|£|eur|euros?)?\s*(?:per\s+person|per\s+head|per\s+guest|each|\bpp\b|a\s+head)/);
    if (!budget) budget = text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|\$|£|eur|euros?)\s*(?:per\s+person|per\s+head|per\s+guest|each|\bpp\b|a\s+head)/);
    if (budget) result.budgetPerPerson = asNumber(budget[1].replace(",", "."), 0) || null;

    const party = text.match(/party of\s+(\d{1,2})/)
      || text.match(/table for\s+(\d{1,2})/)
      || text.match(/\bfor\s+(\d{1,2})\b/)
      || text.match(/\b(\d{1,2})\s+(?:people|persons?|guests?|pax)\b/);
    if (party) result.partySize = asNumber(party[1], 0) || null;

    if (/\b(drink|drinks|wine|beverage|cocktail)\b/.test(text)) result.wantsDrink = true;

    const intent = text.match(/intent\s+([^.;]+)/);
    if (intent) result.goal = intent[1].trim();
    else if (/dining request/.test(text)) result.goal = "dinner reservation";

    return (result.budgetPerPerson || result.partySize || result.goal) ? result : null;
  }

  function createConsumerAgentProfile(input = {}) {
    const memoryNotes = asArray(input.memoryNotes || input.memory_notes || input.notes);
    const goalFromNotes = parseDiningGoal(memoryNotes) || {};

    let budgetPerPerson = input.budgetPerPerson ?? input.budget_per_person ?? null;
    if (budgetPerPerson === null || budgetPerPerson === "") budgetPerPerson = goalFromNotes.budgetPerPerson ?? null;
    budgetPerPerson = budgetPerPerson === null ? null : (asNumber(budgetPerPerson, 0) || null);

    let partySize = input.partySize ?? input.party_size ?? null;
    if (partySize === null || partySize === "") partySize = goalFromNotes.partySize ?? null;
    partySize = partySize === null ? null : (asNumber(partySize, 0) || null);

    const goal = asString(input.goal || goalFromNotes.goal);
    // Keep `occasion` clean for the scoring engine; the free-text goal lives in
    // its own field so it does not pollute occasion/coherence scoring.
    const occasion = asString(input.occasion);
    let budgetRange = asString(input.budgetRange || input.budget_range);
    if (!budgetRange && budgetPerPerson) budgetRange = budgetPostureFromAmount(budgetPerPerson);
    let winePreference = asString(input.winePreference || input.wine_preference);
    if (!winePreference && goalFromNotes.wantsDrink) winePreference = "open to a drink or wine pairing";

    return {
      userId: asString(input.userId || input.user_id || input.sessionId || input.session_id, "default"),
      sessionId: asString(input.sessionId || input.session_id, "default"),
      name: asString(input.name, "Consumer Dining Agent"),
      likes: asArray(input.likes || input.liked),
      dislikes: asArray(input.dislikes || input.disliked),
      allergies: asArray(input.allergies),
      dietaryPreference: asString(input.dietaryPreference || input.dietary_preference),
      budgetRange,
      budgetPerPerson,
      partySize,
      goal,
      occasion,
      confidenceLevel: asString(input.confidenceLevel || input.confidence_level, "unknown"),
      winePreference,
      preferredTableStyle: asString(input.preferredTableStyle || input.preferred_table_style),
      memoryNotes,
      diningHistory: asArray(input.diningHistory || input.dining_history),
      updatedAt: asString(input.updatedAt || input.updated_at, now()),
    };
  }

  function createRetailerAgentPolicy(input = {}) {
    const currency = asString(input.currency, "EUR");
    return {
      retailerId: asString(input.retailerId || input.retailer_id || input.id, "retailer-dining-agent"),
      retailerName: asString(input.retailerName || input.retailer_name || input.name, "Unnamed retailer"),
      cuisine: asString(input.cuisine, "restaurant"),
      currency,
      location: input.location || null,
      discoveryRadius: asNumber(input.discoveryRadius || input.discovery_radius || input.radius_m, 450),
      menuItems: asArray(input.menuItems || input.menu_items).map((item) => createMenuItem(item, { currency })),
      promotions: asArray(input.promotions).map(createPromotion),
      negotiationRules: createNegotiationRules(input.negotiationRules || input.negotiation_rules),
      marketingAllowed: Boolean(input.marketingAllowed ?? input.marketing_allowed ?? true),
      updatedAt: asString(input.updatedAt || input.updated_at, now()),
    };
  }

  function createAgentMessage(input = {}) {
    return {
      id: asString(input.id, generateId("agent-message")),
      timestamp: asString(input.timestamp, now()),
      speaker: asString(input.speaker, "system"),
      protocol: asString(input.protocol, "agmentic-a2a.v1"),
      action: asString(input.action),
      payload: input.payload && typeof input.payload === "object" ? input.payload : {},
      readableEnglish: asString(input.readableEnglish || input.readable_english || input.english),
      visibility: ["public", "consumer_private", "retailer_private"].includes(input.visibility)
        ? input.visibility
        : "public",
    };
  }

  function createNegotiationSession(input = {}) {
    const createdAt = asString(input.createdAt || input.created_at, now());
    return {
      sessionId: asString(input.sessionId || input.session_id, generateId("negotiation")),
      consumerId: asString(input.consumerId || input.consumer_id),
      retailerId: asString(input.retailerId || input.retailer_id),
      status: asString(input.status, "draft"),
      messages: asArray(input.messages).map(createAgentMessage),
      currentOffer: input.currentOffer || input.current_offer || null,
      finalTerms: input.finalTerms || input.final_terms || null,
      createdAt,
      updatedAt: asString(input.updatedAt || input.updated_at, createdAt),
    };
  }

  function lowerText(value) {
    return String(value || "").toLowerCase();
  }

  function itemSearchText(item) {
    return [
      item.category,
      item.name,
      item.description,
      ...asArray(item.allergens),
      ...asArray(item.dietaryTags),
      ...asArray(item.pairingTags),
    ].join(" ").toLowerCase();
  }

  function includesAny(source, terms) {
    const text = lowerText(source);
    return asArray(terms).some((term) => {
      const normalized = lowerText(term).trim();
      return normalized && text.includes(normalized);
    });
  }

  function isAvailable(item) {
    return !["unavailable", "sold_out", "sold out", "disabled"].includes(lowerText(item.availability));
  }

  function isWineItem(item) {
    return /wine|riesling|pinot|chardonnay|sauvignon|cabernet|merlot|sparkling|champagne/.test(itemSearchText(item));
  }

  function isWineCategory(item) {
    return /wine|drink|beverage/.test(lowerText(item.category))
      || /riesling|pinot|chardonnay|sauvignon|cabernet|merlot|sparkling|champagne/.test(lowerText(item.name));
  }

  function isStarterCategory(item) {
    return /starter|snack|appetizer|small/.test(lowerText(item.category));
  }

  function isMainCategory(item) {
    return /main|mains|entree|entrée|haupt/.test(lowerText(item.category));
  }

  function isDessertCategory(item) {
    return /dessert|sweet/.test(lowerText(item.category));
  }

  function isLightItem(item) {
    return /seafood|fish|salad|vegetable|citrus|white wine|greens|beetroot|tomato|fennel|cucumber|starter|snack/.test(itemSearchText(item));
  }

  function isHeavyItem(item) {
    return /duck|steak|beef|lamb|pork|heavy cream|cream|fried|rich sauce|butter|beurre blanc|millefeuille|foie|truffle/.test(itemSearchText(item));
  }

  function consumerWantsLightDinner(consumer) {
    return /light|lighter|not too heavy|fresh/.test([
      ...asArray(consumer.likes),
      ...asArray(consumer.memoryNotes),
      consumer.occasion,
    ].join(" ").toLowerCase());
  }

  function hasAllergyConflict(item, allergies) {
    return asArray(allergies).length && includesAny(itemSearchText(item), allergies);
  }

  function scoreMenuItem(item, consumer) {
    const text = itemSearchText(item);
    let score = 0;

    asArray(consumer.likes).forEach((like) => {
      if (includesAny(text, [like])) score += 8;
    });
    asArray(consumer.dislikes).forEach((dislike) => {
      if (includesAny(text, [dislike])) score -= 12;
    });
    if (/light/.test([...asArray(consumer.likes), ...asArray(consumer.memoryNotes)].join(" ").toLowerCase()) && isLightItem(item)) {
      score += 7;
    }
    if (consumer.winePreference && isWineItem(item)) {
      score += includesAny(text, [consumer.winePreference]) ? 8 : 4;
    }
    if (/anniversary|date night|business dinner/.test(lowerText(consumer.occasion))) {
      if (/wine|dessert|starter|pairing|table/.test(text)) score += 3;
    }
    if (item.price !== null) {
      score += Math.max(0, 4 - (asNumber(item.price) / 40));
    }
    return score;
  }

  function scoreMenuItemBreakdown(item, consumerProfile, retailerPolicy = {}) {
    const consumer = createConsumerAgentProfile(consumerProfile || {});
    const retailer = createRetailerAgentPolicy(retailerPolicy || {});
    const text = itemSearchText(item);
    const breakdown = {
      likes: 0,
      dislikes: 0,
      allergies: 0,
      occasion: 0,
      winePairing: 0,
      lightDinner: 0,
      confidence: 0,
      memory: 0,
      promotionFit: 0,
      pairingFit: 0,
    };

    asArray(consumer.likes).forEach((like) => {
      if (includesAny(text, [like])) breakdown.likes += like === "seafood" ? 14 : 8;
    });
    asArray(consumer.dislikes).forEach((dislike) => {
      if (includesAny(text, [dislike.replace(/^very\s+/, "")])) breakdown.dislikes -= 16;
    });
    if (hasAllergyConflict(item, consumer.allergies)) {
      breakdown.allergies -= 100;
    }
    if (/anniversary|date night/.test(lowerText(consumer.occasion))) {
      if (includesAny(text, ["anniversary"])) breakdown.occasion += 14;
      else if (isStarterCategory(item) || isDessertCategory(item) || isWineCategory(item)) breakdown.occasion += 4;
    } else if (/business dinner/.test(lowerText(consumer.occasion))) {
      if (isMainCategory(item) && !isHeavyItem(item)) breakdown.occasion += 10;
      if (isWineCategory(item)) breakdown.occasion += 4;
    }
    if (consumer.winePreference) {
      if (isWineCategory(item) && includesAny(text, [consumer.winePreference])) breakdown.winePairing += 22;
      if (!isWineCategory(item) && includesAny(text, [consumer.winePreference])) breakdown.winePairing += 16;
      if (includesAny(text, ["seafood pairing"])) breakdown.winePairing += 8;
    }
    if (consumerWantsLightDinner(consumer)) {
      if (isLightItem(item)) breakdown.lightDinner += 10;
      if (isHeavyItem(item)) breakdown.lightDinner -= 14;
    }
    if (lowerText(consumer.confidenceLevel) === "low") {
      if (isMainCategory(item) || isWineCategory(item)) breakdown.confidence += 6;
      if (includesAny(text, ["pairing", "anniversary", "white wine", "seafood"])) breakdown.confidence += 4;
      if (includesAny(text, ["oyster", "jalapeno"])) breakdown.confidence -= 3;
    }
    const memoryText = asArray(consumer.memoryNotes).join(" ").toLowerCase();
    if (/lighter seafood|likes lighter seafood/.test(memoryText) && includesAny(text, ["seafood", "fish", "sea bass"])) {
      breakdown.memory += 12;
    }
    if (/clear, simple recommendations|clear simple recommendations/.test(memoryText) && (isMainCategory(item) || isWineCategory(item))) {
      breakdown.memory += 5;
    }
    retailer.promotions.forEach((promotion) => {
      const appliesTo = asArray(promotion.appliesTo);
      if (appliesTo.includes(item.id)) breakdown.promotionFit += 12;
      if (includesAny(promotion.marketingText, [item.name]) || includesAny(promotion.rule, [item.name])) breakdown.promotionFit += 4;
    });
    if (includesAny(text, ["seafood"])) breakdown.pairingFit += 8;
    if (includesAny(text, ["white wine"])) breakdown.pairingFit += 8;
    if (includesAny(text, ["citrus"])) breakdown.pairingFit += 4;
    if (isMainCategory(item)) breakdown.pairingFit += 10;
    if (isWineCategory(item)) breakdown.pairingFit += 8;

    return {
      item: item.name,
      totalScore: roundPercent(Object.values(breakdown).reduce((sum, value) => sum + value, 0)),
      scoreBreakdown: breakdown,
    };
  }

  function createMealPath(input = {}) {
    return {
      id: asString(input.id, generateId("meal-path")),
      starters: asArray(input.starters).map(createMenuItem),
      mains: asArray(input.mains).map(createMenuItem),
      desserts: asArray(input.desserts).map(createMenuItem),
      wines: asArray(input.wines).map(createMenuItem),
      totalPrice: roundMoney(input.totalPrice),
      coherenceScore: roundPercent(input.coherenceScore),
      pairingScore: roundPercent(input.pairingScore),
      confidenceScore: roundPercent(input.confidenceScore),
      occasionScore: roundPercent(input.occasionScore),
      consumerFitScore: roundPercent(input.consumerFitScore),
      promotionScore: roundPercent(input.promotionScore),
      totalScore: roundPercent(input.totalScore),
      scoreBreakdown: input.scoreBreakdown || {},
      appliedPromotion: input.appliedPromotion || null,
      valueAdds: asArray(input.valueAdds),
      reasons: asArray(input.reasons),
      risks: asArray(input.risks),
    };
  }

  function pathItems(path) {
    return [
      ...asArray(path.starters),
      ...asArray(path.mains),
      ...asArray(path.desserts),
      ...asArray(path.wines),
    ];
  }

  function itemNames(items) {
    return asArray(items).map((item) => item.name).filter(Boolean).join(" + ");
  }

  function clampScore(value) {
    return Math.max(0, Math.min(100, roundPercent(value)));
  }

  function scoreMealPath(path, consumerProfile, retailerPolicy = {}) {
    const consumer = createConsumerAgentProfile(consumerProfile || {});
    const retailer = createRetailerAgentPolicy(retailerPolicy || {});
    const items = pathItems(path);
    const pathText = items.map(itemSearchText).join(" ");
    const foodText = [...path.starters, ...path.mains, ...path.desserts].map(itemSearchText).join(" ");
    const mainText = path.mains.map(itemSearchText).join(" ");
    const wineText = path.wines.map(itemSearchText).join(" ");
    const hasStarter = path.starters.length > 0;
    const hasMain = path.mains.length > 0;
    const hasDessert = path.desserts.length > 0;
    const hasWine = path.wines.length > 0;
    const hasSnackStarter = path.starters.some((item) => /snack/.test(lowerText(item.category)));
    const heavyCount = items.filter(isHeavyItem).length;
    const totalPrice = roundMoney(items.reduce((sum, item) => sum + asNumber(item.price, 0), 0));
    const reasons = [];
    const risks = [];

    let coherenceScore = 20;
    if (hasStarter) coherenceScore += 12;
    if (hasMain) coherenceScore += 30;
    if (hasWine) coherenceScore += 18;
    if (hasDessert) coherenceScore += 8;
    if (hasStarter && hasMain) coherenceScore += 10;
    if (hasMain && hasWine) coherenceScore += 14;
    if (hasSnackStarter && /anniversary|date night/.test(lowerText(consumer.occasion))) {
      coherenceScore -= 20;
      risks.push("Snack starter is less complete than a composed starter for the occasion.");
    }
    if (!hasMain) {
      coherenceScore -= 32;
      risks.push("No main course, so this is weak as a dinner experience.");
    }

    let pairingScore = 20;
    if (includesAny(mainText || foodText, ["seafood", "fish", "sea bass"]) && includesAny(wineText, ["white wine", "riesling"])) {
      pairingScore += 42;
      reasons.push("Seafood and white wine form a strong pairing.");
    }
    if (includesAny(pathText, ["citrus"])) pairingScore += 10;
    if (includesAny(pathText, ["beetroot", "fresh", "light"]) && includesAny(pathText, ["sea bass", "riesling"])) pairingScore += 14;
    if (includesAny(pathText, ["burrata", "sourdough"]) && consumerWantsLightDinner(consumer)) pairingScore -= 14;
    if (hasStarter && hasMain) pairingScore += 8;
    if (hasDessert && hasWine) pairingScore += 4;

    let confidenceScore = 45;
    if (lowerText(consumer.confidenceLevel) === "low") {
      if (hasMain && hasWine) confidenceScore += 24;
      if (hasStarter && hasMain) confidenceScore += 10;
      if (totalPrice) confidenceScore += 6;
      if (includesAny(pathText, ["oyster", "jalapeno"])) {
        confidenceScore -= 18;
        risks.push("Oyster and jalapeno may feel less confidence-giving for a low-confidence diner.");
      }
      if (includesAny(pathText, ["burrata", "sourdough"])) confidenceScore -= 8;
      if (includesAny(pathText, ["beetroot", "fresh"])) confidenceScore += 8;
      reasons.push("The path is scored for clear, easy ordering.");
    }

    let occasionScore = 35;
    const occasion = lowerText(consumer.occasion);
    if (/anniversary|date night/.test(occasion)) {
      if (hasMain && hasWine) occasionScore += 28;
      if (hasStarter) occasionScore += 10;
      if (hasStarter && hasMain && hasWine) {
        coherenceScore += 8;
        occasionScore += 8;
        reasons.push("Starter, main, and wine create a more complete occasion path.");
      }
      if (!hasStarter && hasMain && hasWine) {
        coherenceScore -= 6;
        occasionScore -= 6;
        risks.push("No starter; this is simpler than a composed occasion path.");
      }
      if (includesAny(pathText, ["anniversary", "sea bass", "riesling"])) occasionScore += 18;
      if (includesAny(pathText, ["beetroot", "fresh", "light"])) occasionScore += 12;
      if (includesAny(pathText, ["burrata", "sourdough"])) occasionScore -= 6;
      if (hasSnackStarter) occasionScore -= 12;
      if (includesAny(pathText, ["oyster", "shellfish", "jalapeno"])) occasionScore -= 10;
      if (heavyCount) occasionScore -= 16;
      if (!hasMain) occasionScore -= 24;
    } else if (/business dinner/.test(occasion)) {
      if (hasMain) occasionScore += 22;
      if (!heavyCount) occasionScore += 12;
      if (hasWine) occasionScore += 6;
      if (hasDessert) occasionScore -= 4;
    } else if (/first date/.test(occasion)) {
      if (hasStarter && hasMain) occasionScore += 18;
      if (hasWine) occasionScore += 10;
      if (heavyCount) occasionScore -= 14;
    } else if (/solo/.test(occasion)) {
      if (items.length <= 2) occasionScore += 18;
      if (items.length > 3) occasionScore -= 14;
    }

    let consumerFitScore = 40;
    asArray(consumer.likes).forEach((like) => {
      const likeSource = like === "seafood" ? foodText : pathText;
      if (includesAny(likeSource, [like])) consumerFitScore += like === "seafood" ? 18 : 10;
    });
    asArray(consumer.dislikes).forEach((dislike) => {
      if (includesAny(pathText, [dislike.replace(/^very\s+/, "")])) consumerFitScore -= 18;
    });
    if (consumerWantsLightDinner(consumer)) {
      consumerFitScore += 12;
      if (includesAny(pathText, ["beetroot", "fresh", "light", "citrus"])) consumerFitScore += 18;
      if (includesAny(pathText, ["burrata", "sourdough"])) consumerFitScore -= 24;
      if (includesAny(pathText, ["oyster", "jalapeno"])) consumerFitScore -= 8;
      if (includesAny(pathText, ["shellfish"])) consumerFitScore -= 16;
      if (hasDessert) {
        consumerFitScore -= 16;
        confidenceScore -= 6;
        occasionScore -= 4;
        risks.push("Dessert makes the path feel less light for this consumer.");
      }
      consumerFitScore -= heavyCount * 28;
    }
    if (hasAllergyConflict({ ...items[0], category: "", name: pathText, description: "", allergens: [], dietaryTags: [], pairingTags: [] }, consumer.allergies)) {
      consumerFitScore -= 100;
    }
    const memoryText = asArray(consumer.memoryNotes).join(" ").toLowerCase();
    if (/lighter seafood/.test(memoryText) && includesAny(pathText, ["sea bass", "seafood", "fish"])) consumerFitScore += 14;
    if (/clear, simple recommendations|clear simple recommendations/.test(memoryText) && hasMain) consumerFitScore += 8;

    let promotionScore = 0;
    let appliedPromotion = null;
    retailer.promotions.forEach((promotion) => {
      const appliesTo = asArray(promotion.appliesTo);
      const matched = items.filter((item) => appliesTo.includes(item.id));
      if (matched.length) {
        promotionScore += 18 + (matched.length * 8);
        appliedPromotion = promotion;
      }
      if (includesAny(promotion.marketingText, ["anniversary", "sea bass", "riesling"])) promotionScore += 8;
    });

    const valueAdds = [];
    if (includesAny(consumer.preferredTableStyle, ["quiet"])) {
      valueAdds.push("quiet_table");
      confidenceScore += 8;
      occasionScore += 8;
    }

    const scoreBreakdown = {
      coherenceScore: clampScore(coherenceScore),
      pairingScore: clampScore(pairingScore),
      confidenceScore: clampScore(confidenceScore),
      occasionScore: clampScore(occasionScore),
      consumerFitScore: clampScore(consumerFitScore),
      promotionScore: clampScore(promotionScore),
    };
    const totalScore = roundPercent(
      (scoreBreakdown.consumerFitScore * 0.30)
      + (scoreBreakdown.coherenceScore * 0.20)
      + (scoreBreakdown.pairingScore * 0.18)
      + (scoreBreakdown.occasionScore * 0.15)
      + (scoreBreakdown.confidenceScore * 0.10)
      + (scoreBreakdown.promotionScore * 0.07),
    );

    return createMealPath({
      ...path,
      totalPrice,
      ...scoreBreakdown,
      totalScore,
      scoreBreakdown,
      appliedPromotion,
      valueAdds,
      reasons,
      risks,
    });
  }

  function generateMealPaths({ consumerProfile, retailerPolicy, limit = 5 } = {}) {
    const consumer = createConsumerAgentProfile(consumerProfile || {});
    const retailer = createRetailerAgentPolicy(retailerPolicy || {});
    const allergies = asArray(consumer.allergies);
    const safeItems = retailer.menuItems.filter((item) => (
      isAvailable(item) && !(allergies.length && includesAny(itemSearchText(item), allergies))
    ));
    const starters = safeItems.filter(isStarterCategory);
    const mains = safeItems.filter(isMainCategory);
    const desserts = safeItems.filter(isDessertCategory);
    const wines = safeItems.filter(isWineCategory);
    const rawPaths = [];

    const addPath = ({ starter = null, main = null, dessert = null, wine = null }) => {
      const startersList = starter ? [starter] : [];
      const mainsList = main ? [main] : [];
      const dessertsList = dessert ? [dessert] : [];
      const winesList = wine ? [wine] : [];
      const signature = itemNames([...startersList, ...mainsList, ...dessertsList, ...winesList]);
      if (!signature || rawPaths.some((path) => path.signature === signature)) return;
      rawPaths.push({ signature, starters: startersList, mains: mainsList, desserts: dessertsList, wines: winesList });
    };

    mains.forEach((main) => {
      wines.forEach((wine) => addPath({ main, wine }));
      starters.forEach((starter) => addPath({ starter, main }));
      starters.forEach((starter) => wines.forEach((wine) => addPath({ starter, main, wine })));
      starters.forEach((starter) => desserts.forEach((dessert) => wines.forEach((wine) => addPath({ starter, main, dessert, wine }))));
      desserts.forEach((dessert) => wines.forEach((wine) => addPath({ main, dessert, wine })));
    });
    starters.forEach((starter) => wines.forEach((wine) => addPath({ starter, wine })));

    return rawPaths
      .map((path) => scoreMealPath(path, consumer, retailer))
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, limit);
  }

  function compareItemAndMealPathEngines({ consumerProfile, retailerPolicy, limit = 5 } = {}) {
    const consumer = createConsumerAgentProfile(consumerProfile || {});
    const retailer = createRetailerAgentPolicy(retailerPolicy || {});
    const itemScores = retailer.menuItems
      .filter((item) => isAvailable(item))
      .map((item) => scoreMenuItemBreakdown(item, consumer, retailer))
      .sort((a, b) => b.totalScore - a.totalScore);
    const currentOffer = generateRetailerOffer({ consumerProfile: consumer, retailerPolicy: retailer });
    const mealPaths = generateMealPaths({ consumerProfile: consumer, retailerPolicy: retailer, limit });

    return {
      currentItemWinner: itemScores[0] || null,
      currentOfferWinner: currentOffer,
      itemScores,
      bestMealPathWinner: mealPaths[0] || null,
      mealPaths,
    };
  }

  function chooseMarketingTactic(consumer, retailerRules) {
    const allowed = asArray(retailerRules.allowedTactics);
    if (includesAny(consumer.preferredTableStyle, ["quiet"]) && allowed.includes("quiet_table")) {
      return "quiet_table";
    }
    if (consumer.winePreference && allowed.includes("wine_pairing")) {
      return "wine_pairing";
    }
    if (/anniversary|date night/.test(lowerText(consumer.occasion)) && allowed.includes("soft_upgrade")) {
      return "soft_upgrade";
    }
    if (allowed.includes("bundle_offer")) {
      return "bundle_offer";
    }
    return allowed[0] || "personalized_menu_hook";
  }

  function promotionMatchesConsumer(promotion, consumer, items, tactic) {
    const haystack = [
      promotion.name,
      promotion.rule,
      promotion.marketingText,
      promotion.type,
      tactic,
      consumer.occasion,
      consumer.winePreference,
      consumer.preferredTableStyle,
      ...asArray(consumer.likes),
      ...items.map((item) => itemSearchText(item)),
    ].join(" ").toLowerCase();
    const appliesTo = asArray(promotion.appliesTo);
    return !appliesTo.length || appliesTo.some((term) => includesAny(haystack, [term]));
  }

  function promotionPriority(promotion, rules) {
    const valueAddTypes = ["bundle", "complimentary_item", "table_hold", "wine_pairing", "soft_upgrade"];
    const valueAdd = valueAddTypes.includes(promotion.type);
    if (rules.preferValueAddBeforeDiscount) {
      return valueAdd ? 0 : 1;
    }
    return valueAdd ? 1 : 0;
  }

  function choosePromotion(promotions, consumer, items, rules, tactic) {
    return asArray(promotions)
      .filter((promotion) => promotionMatchesConsumer(promotion, consumer, items, tactic))
      .sort((a, b) => promotionPriority(a, rules) - promotionPriority(b, rules))
      [0] || null;
  }

  function applyPromotion(promotion, priceBefore, rules, constraintsUsed) {
    if (!promotion) {
      constraintsUsed.push("No eligible promotion was available.");
      return {
        priceAfter: priceBefore,
        discountAmount: 0,
        discountPercent: 0,
        appliedPromotion: null,
        offerType: "personalized_menu_offer",
      };
    }

    const maxDiscountPercent = asNumber(rules.maxDiscountPercent, DEFAULT_NEGOTIATION_RULES.maxDiscountPercent);
    const maxConcession = asNumber(promotion.maxConcession, asNumber(promotion.value, 0));
    let discountAmount = 0;
    let discountPercent = 0;
    let offerType = promotion.type;

    if (promotion.type === "percentage") {
      discountPercent = Math.min(asNumber(promotion.value), maxConcession, maxDiscountPercent);
      if (discountPercent < asNumber(promotion.value)) {
        constraintsUsed.push(`Percentage promotion capped at ${discountPercent}%.`);
      }
      discountAmount = roundMoney(priceBefore * (discountPercent / 100));
    } else if (promotion.type === "fixed") {
      discountAmount = Math.min(asNumber(promotion.value), maxConcession, priceBefore);
      if (discountAmount < asNumber(promotion.value)) {
        constraintsUsed.push(`Fixed promotion capped at ${discountAmount}.`);
      }
      discountPercent = priceBefore ? roundPercent((discountAmount / priceBefore) * 100) : 0;
    } else if (promotion.type === "bundle") {
      discountAmount = Math.min(asNumber(promotion.value), maxConcession, priceBefore);
      discountPercent = priceBefore ? roundPercent((discountAmount / priceBefore) * 100) : 0;
      if (!discountAmount) {
        constraintsUsed.push("Bundle promotion used as value-add without discount.");
      }
    } else if (["complimentary_item", "table_hold", "wine_pairing", "soft_upgrade"].includes(promotion.type)) {
      constraintsUsed.push(`${promotion.type} promotion used as value-add.`);
      offerType = "value_add";
    } else {
      constraintsUsed.push(`Promotion type ${promotion.type} is unsupported for discounts.`);
      offerType = "personalized_menu_offer";
    }

    return {
      priceAfter: roundMoney(Math.max(0, priceBefore - discountAmount)),
      discountAmount: roundMoney(discountAmount),
      discountPercent: roundPercent(discountPercent),
      appliedPromotion: promotion,
      offerType,
    };
  }

  function roundMoney(value) {
    return Math.round(asNumber(value) * 100) / 100;
  }

  function roundPercent(value) {
    return Math.round(asNumber(value) * 10) / 10;
  }

  function generateRetailerOffer({ consumerProfile, retailerPolicy, negotiationContext = {} } = {}) {
    const consumer = createConsumerAgentProfile(consumerProfile || {});
    const retailer = createRetailerAgentPolicy(retailerPolicy || {});
    const rules = createNegotiationRules(retailer.negotiationRules);
    const constraintsUsed = [];
    const allergies = asArray(consumer.allergies);
    const dislikes = asArray(consumer.dislikes);
    const safeItems = retailer.menuItems
      .filter((item) => {
        if (!isAvailable(item)) {
          constraintsUsed.push(`${item.name} skipped because it is unavailable.`);
          return false;
        }
        if (allergies.length && includesAny(itemSearchText(item), allergies)) {
          constraintsUsed.push(`${item.name} skipped because it conflicts with consumer allergies.`);
          return false;
        }
        return true;
      })
      .filter((item) => !(dislikes.length && includesAny(itemSearchText(item), dislikes)));

    if (!safeItems.length) {
      const createdAt = now();
      const payload = {
        offerId: generateId("offer"),
        retailerId: retailer.retailerId,
        retailerName: retailer.retailerName,
        status: "rejected_no_safe_items",
        constraintsUsed: constraintsUsed.length ? constraintsUsed : ["No safe menu item matched the consumer profile."],
      };
      return {
        offerId: payload.offerId,
        retailerId: retailer.retailerId,
        retailerName: retailer.retailerName,
        proposedItems: [],
        offerType: "safe_rejection",
        offerTitle: "No safe retailer offer",
        offerDescription: "The retailer agent could not safely propose menu items for this consumer profile.",
        priceBefore: 0,
        priceAfter: 0,
        discountAmount: 0,
        discountPercent: 0,
        appliedPromotion: null,
        constraintsUsed: payload.constraintsUsed,
        marketingTactic: "safety_first",
        retailerReasoning: "All candidate menu items were unavailable, disliked, or conflicted with allergies.",
        readableEnglish: `${retailer.retailerName} cannot safely make an offer from the current menu because every candidate conflicts with the consumer profile.`,
        protocolPayload: payload,
        createdAt,
      };
    }

    let selectionItems = safeItems;
    if (consumer.budgetPerPerson) {
      const withinBudget = safeItems.filter((item) => item.price === null || asNumber(item.price, 0) <= consumer.budgetPerPerson);
      if (withinBudget.length) {
        selectionItems = withinBudget;
        constraintsUsed.push(`Filtered to items within ${retailer.currency} ${consumer.budgetPerPerson} per person.`);
      } else {
        constraintsUsed.push(`No menu item fits ${retailer.currency} ${consumer.budgetPerPerson} per person; offering the closest option.`);
      }
    }
    const sortedItems = [...selectionItems].sort((a, b) => scoreMenuItem(b, consumer) - scoreMenuItem(a, consumer));
    const primaryItem = sortedItems.find((item) => !isWineItem(item)) || sortedItems[0];
    const proposedItems = [primaryItem];
    if (consumer.winePreference) {
      const wineItem = sortedItems.find((item) => item.id !== proposedItems[0].id && isWineItem(item));
      if (wineItem) proposedItems.push(wineItem);
    }
    const tactic = chooseMarketingTactic(consumer, rules);
    const promotion = choosePromotion(retailer.promotions, consumer, proposedItems, rules, tactic);
    const priceBefore = roundMoney(proposedItems.reduce((sum, item) => sum + asNumber(item.price, 0), 0));
    const applied = applyPromotion(promotion, priceBefore, rules, constraintsUsed);
    const occasionText = consumer.occasion ? ` for ${consumer.occasion}` : "";
    const tableText = tactic === "quiet_table" ? " with a quiet-table note" : "";
    const titleItem = proposedItems.map((item) => item.name).join(" + ");
    const discountText = applied.discountAmount
      ? ` Price before ${retailer.currency} ${priceBefore}, after ${retailer.currency} ${applied.priceAfter}.`
      : ` Price is disclosed at ${retailer.currency} ${priceBefore}.`;
    const readableEnglish = `${retailer.retailerName} offers ${titleItem}${occasionText}${tableText}.${discountText}`;
    const createdAt = now();

    const offer = {
      offerId: generateId("offer"),
      retailerId: retailer.retailerId,
      retailerName: retailer.retailerName,
      proposedItems,
      offerType: applied.offerType,
      offerTitle: `${titleItem}${occasionText}`,
      offerDescription: `${titleItem} matched to the consumer profile with tactic ${tactic}.`,
      priceBefore,
      priceAfter: applied.priceAfter,
      discountAmount: applied.discountAmount,
      discountPercent: applied.discountPercent,
      appliedPromotion: applied.appliedPromotion,
      constraintsUsed,
      marketingTactic: tactic,
      retailerReasoning: [
        "Filtered unavailable items and allergy conflicts.",
        "Scored remaining items against likes, dislikes, light-meal signals, wine preference, and occasion.",
        applied.appliedPromotion ? `Applied promotion ${applied.appliedPromotion.name} within concession limits.` : "No discount promotion applied.",
        negotiationContext.note ? `Context: ${negotiationContext.note}` : "",
      ].filter(Boolean).join(" "),
      readableEnglish,
      protocolPayload: {},
      createdAt,
    };
    offer.protocolPayload = {
      protocol: "agmentic-a2a.v1",
      action: "RETAILER_OFFER",
      offer: {
        offerId: offer.offerId,
        retailerId: offer.retailerId,
        retailerName: offer.retailerName,
        proposedItems: offer.proposedItems,
        offerType: offer.offerType,
        offerTitle: offer.offerTitle,
        priceBefore: offer.priceBefore,
        priceAfter: offer.priceAfter,
        discountAmount: offer.discountAmount,
        discountPercent: offer.discountPercent,
        appliedPromotion: offer.appliedPromotion,
        constraintsUsed: offer.constraintsUsed,
        marketingTactic: offer.marketingTactic,
        createdAt: offer.createdAt,
      },
    };
    return offer;
  }

  function normalizeOffer(input = {}) {
    const payloadOffer = input.offer && typeof input.offer === "object" ? input.offer : null;
    const source = payloadOffer || input;
    return {
      ...source,
      proposedItems: asArray(source.proposedItems || source.proposed_items).map((item) => {
        const normalized = createMenuItem(item, { currency: source.currency });
        if (item?.availability === undefined || item?.availability === null || item?.availability === "") {
          normalized.availability = "";
        }
        return normalized;
      }),
      priceBefore: source.priceBefore === undefined || source.priceBefore === null || source.priceBefore === ""
        ? null
        : asNumber(source.priceBefore, 0),
      priceAfter: source.priceAfter === undefined || source.priceAfter === null || source.priceAfter === ""
        ? null
        : asNumber(source.priceAfter, 0),
      discountAmount: asNumber(source.discountAmount, 0),
      discountPercent: asNumber(source.discountPercent, 0),
      marketingTactic: asString(source.marketingTactic),
    };
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

  function evaluateBudget(consumer, offer) {
    const budget = lowerText(consumer.budgetRange);
    const priceAfter = offer.priceAfter;
    const priceBefore = offer.priceBefore;
    const check = {
      status: "ok",
      budgetRange: consumer.budgetRange || "unknown",
      priceAfter,
      reason: "Price is within the known budget posture.",
    };

    if (priceAfter === null) {
      return { ...check, status: "needs_clarification", reason: "The offer does not disclose priceAfter." };
    }
    if (consumer.budgetPerPerson && priceAfter > consumer.budgetPerPerson) {
      return {
        ...check,
        status: priceAfter > consumer.budgetPerPerson * 1.25 ? "fail" : "counter",
        reason: `The offer is above the ${consumer.budgetPerPerson} per person budget.`,
        suggestedMax: consumer.budgetPerPerson,
      };
    }
    if (/low/.test(budget) && priceAfter > 30) {
      return {
        ...check,
        status: priceAfter > 55 ? "fail" : "counter",
        reason: "The offer is above a low budget posture.",
        suggestedMax: 30,
      };
    }
    if (/medium/.test(budget) && priceAfter > 55) {
      return {
        ...check,
        status: "counter",
        reason: "The offer is above a medium budget comfort range.",
        suggestedMax: 55,
      };
    }
    if (priceBefore !== null && priceBefore > priceAfter) {
      return { ...check, status: "strong", reason: "The offer gives a clear price improvement." };
    }
    return check;
  }

  function evaluateRetailerOffer({ consumerProfile, retailerPolicy, offer, negotiationContext = {} } = {}) {
    const consumer = createConsumerAgentProfile(consumerProfile || {});
    const retailer = createRetailerAgentPolicy(retailerPolicy || {});
    const normalizedOffer = normalizeOffer(offer || {});
    const items = normalizedOffer.proposedItems;
    const createdAt = now();
    const safetyChecks = [];
    const rejectedItems = [];
    const acceptedItems = [];
    const allergies = asArray(consumer.allergies);
    const wantsLightDinner = consumerWantsLightDinner(consumer);
    let score = 50;

    items.forEach((item) => {
      const itemReasons = [];
      if (hasAllergyConflict(item, allergies)) {
        itemReasons.push("allergy_conflict");
      }
      if (!asString(item.availability).trim()) {
        itemReasons.push("availability_unclear");
      } else if (!isAvailable(item)) {
        itemReasons.push("unavailable");
      }
      if (itemReasons.length) {
        rejectedItems.push({ id: item.id, name: item.name, reasons: itemReasons });
      } else {
        acceptedItems.push({ id: item.id, name: item.name });
      }
    });

    const allergyConflicts = rejectedItems.filter((item) => item.reasons.includes("allergy_conflict"));
    const availabilityUnclear = rejectedItems.filter((item) => item.reasons.includes("availability_unclear"));
    const unavailableItems = rejectedItems.filter((item) => item.reasons.includes("unavailable"));

    safetyChecks.push({
      name: "allergies",
      status: allergyConflicts.length ? "fail" : "pass",
      detail: allergyConflicts.length
        ? `${allergyConflicts.map((item) => item.name).join(", ")} conflicts with consumer allergies.`
        : "No proposed item conflicts with known allergies.",
    });
    safetyChecks.push({
      name: "availability",
      status: availabilityUnclear.length ? "needs_clarification" : unavailableItems.length ? "fail" : "pass",
      detail: availabilityUnclear.length
        ? `${availabilityUnclear.map((item) => item.name).join(", ")} has unclear availability.`
        : unavailableItems.length
          ? `${unavailableItems.map((item) => item.name).join(", ")} is unavailable.`
          : "All proposed items show available status.",
    });
    safetyChecks.push({
      name: "price_disclosure",
      status: normalizedOffer.priceAfter === null ? "needs_clarification" : "pass",
      detail: normalizedOffer.priceAfter === null
        ? "The offer is missing priceAfter."
        : `Price after is disclosed as ${retailer.currency} ${roundMoney(normalizedOffer.priceAfter)}.`,
    });

    const budgetCheck = evaluateBudget(consumer, normalizedOffer);
    const matchedLikes = [];
    const matchedDislikes = [];
    let heavyCount = 0;
    let wineMatch = false;

    items.forEach((item) => {
      const text = itemSearchText(item);
      asArray(consumer.likes).forEach((like) => {
        if (includesAny(text, [like])) matchedLikes.push(like);
      });
      asArray(consumer.dislikes).forEach((dislike) => {
        if (includesAny(text, [dislike])) matchedDislikes.push(dislike);
      });
      if (wantsLightDinner && isLightItem(item)) score += 7;
      if (wantsLightDinner && isHeavyItem(item)) heavyCount += 1;
      if (consumer.winePreference && isWineItem(item) && includesAny(text, [consumer.winePreference])) {
        wineMatch = true;
      }
    });

    score += Math.min(20, matchedLikes.length * 6);
    score -= Math.min(30, matchedDislikes.length * 12);
    if (wantsLightDinner) score -= heavyCount * 10;
    if (consumer.winePreference) score += wineMatch ? 8 : -4;
    if (/anniversary|date night|business dinner/.test(lowerText(consumer.occasion))) {
      score += /quiet_table|soft_upgrade|wine_pairing/.test(normalizedOffer.marketingTactic) ? 8 : 3;
    }
    if (normalizedOffer.priceBefore !== null && normalizedOffer.priceAfter !== null && normalizedOffer.priceAfter < normalizedOffer.priceBefore) {
      score += Math.min(12, Math.max(2, normalizedOffer.discountPercent || 4));
    }

    const preferenceCheck = {
      matchedLikes: [...new Set(matchedLikes)],
      matchedDislikes: [...new Set(matchedDislikes)],
      wantsLightDinner,
      heavyItems: heavyCount,
      winePreferenceMatched: Boolean(wineMatch),
      status: matchedDislikes.length || heavyCount > 0 ? "mixed" : "good",
    };

    const balanceCheck = {
      status: "good",
      itemCount: items.length,
      heavyItemCount: heavyCount,
      reason: "The offer is a coherent meal path.",
    };
    if (heavyCount >= 2) {
      balanceCheck.status = "poor";
      balanceCheck.reason = "Too many heavy items are grouped together for this consumer profile.";
      score -= 12;
    } else if (items.length > 3) {
      balanceCheck.status = "mixed";
      balanceCheck.reason = "The offer includes more items than a low-risk recommendation needs.";
      score -= 6;
    }

    const hasRealValue = normalizedOffer.discountAmount > 0
      || ["quiet_table", "wine_pairing", "soft_upgrade"].includes(normalizedOffer.marketingTactic)
      || normalizedOffer.appliedPromotion;
    const upsellCheck = {
      status: "pass",
      reason: "No obvious unnecessary upsell detected.",
    };
    if (items.length > 2 && !hasRealValue) {
      upsellCheck.status = "fail";
      upsellCheck.reason = "The offer adds extra items without clear consumer benefit.";
      score -= 15;
    } else if (/bundle|limited|upgrade/.test(lowerText(normalizedOffer.offerType)) && normalizedOffer.priceAfter >= normalizedOffer.priceBefore) {
      upsellCheck.status = "mixed";
      upsellCheck.reason = "The offer uses value-add language but needs clearer consumer value.";
      score -= 6;
    }

    if (budgetCheck.status === "strong") score += 6;
    if (budgetCheck.status === "counter") score -= 10;
    if (budgetCheck.status === "fail") score -= 22;
    // The user's explicit per-person budget is their primary stated constraint;
    // a safe offer that meets it should be enough to close the deal.
    if (consumer.budgetPerPerson && normalizedOffer.priceAfter !== null && normalizedOffer.priceAfter <= consumer.budgetPerPerson) {
      score += 12;
    }
    if (allergyConflicts.length || unavailableItems.length) score = Math.min(score, 15);
    if (availabilityUnclear.length || normalizedOffer.priceAfter === null) score = Math.min(score, 45);
    const consumerScore = Math.max(0, Math.min(100, Math.round(score)));

    let decision = "accept";
    let counterRequest = "";
    let publicMessageToRetailer = "This offer works for the consumer. Please keep the terms and clear price disclosure.";

    if (allergyConflicts.length || unavailableItems.length) {
      decision = "reject";
      publicMessageToRetailer = allergyConflicts.length
        ? "We cannot accept this offer because one or more proposed items conflict with known allergies."
        : "We cannot accept this offer because one or more proposed items are unavailable.";
    } else if (availabilityUnclear.length || normalizedOffer.priceAfter === null) {
      decision = "ask_clarification";
      publicMessageToRetailer = normalizedOffer.priceAfter === null
        ? "Please confirm the final price after any promotion before the consumer can evaluate this."
        : "Please confirm availability for every proposed item before the consumer can evaluate this.";
    } else if (upsellCheck.status === "fail" || consumerScore < 35) {
      decision = "reject";
      publicMessageToRetailer = "This offer does not feel aligned with the consumer's requested meal path. Please propose a simpler option.";
    } else if (budgetCheck.status === "counter" || budgetCheck.status === "fail" || balanceCheck.status !== "good" || preferenceCheck.status === "mixed" || consumerScore < 72) {
      decision = "counter_offer";
      if (budgetCheck.suggestedMax) {
        counterRequest = `Can you keep this under ${retailer.currency} ${budgetCheck.suggestedMax}?`;
      } else if (wantsLightDinner && heavyCount) {
        counterRequest = "Please suggest a lighter alternative.";
      } else if (consumer.preferredTableStyle && includesAny(consumer.preferredTableStyle, ["quiet"])) {
        counterRequest = "Can you offer a quiet table instead of a discount?";
      } else if (items.length > 1) {
        counterRequest = `${items[0].name} works well, but please simplify the rest of the offer.`;
      } else {
        counterRequest = "Please adjust the offer to make the consumer benefit clearer.";
      }
      publicMessageToRetailer = counterRequest;
    }

    const privateConsumerNote = [
      `Internal score ${consumerScore}/100.`,
      consumer.confidenceLevel === "low" ? "Consumer confidence is low, so clear simple terms matter." : "",
      matchedDislikes.length ? `Dislike signals matched: ${[...new Set(matchedDislikes)].join(", ")}.` : "",
      heavyCount ? "The offer may feel too heavy for the user's stated preference." : "",
      negotiationContext.note ? `Context: ${negotiationContext.note}` : "",
    ].filter(Boolean).join(" ");
    const readableEnglish = `Consumer agent decision: ${decision}. ${publicMessageToRetailer}`;

    const evaluation = {
      evaluationId: generateId("evaluation"),
      decision,
      consumerScore,
      acceptedItems,
      rejectedItems,
      counterRequest,
      safetyChecks,
      budgetCheck,
      preferenceCheck,
      balanceCheck,
      upsellCheck,
      privateConsumerNote,
      publicMessageToRetailer,
      readableEnglish,
      protocolPayload: {},
      createdAt,
    };

    evaluation.protocolPayload = {
      protocol: "agmentic-a2a.v1",
      action: "CONSUMER_EVALUATION",
      evaluation: {
        evaluationId: evaluation.evaluationId,
        decision: evaluation.decision,
        consumerScore: evaluation.consumerScore,
        acceptedItems: evaluation.acceptedItems,
        rejectedItems: evaluation.rejectedItems,
        counterRequest: evaluation.counterRequest,
        safetyChecks: evaluation.safetyChecks,
        budgetCheck: evaluation.budgetCheck,
        preferenceCheck: evaluation.preferenceCheck,
        balanceCheck: evaluation.balanceCheck,
        upsellCheck: evaluation.upsellCheck,
        publicMessageToRetailer: evaluation.publicMessageToRetailer,
        createdAt: evaluation.createdAt,
      },
    };

    return evaluation;
  }

  function extractCounterBudget(evaluation) {
    const fromCheck = asNumber(evaluation?.budgetCheck?.suggestedMax, 0);
    if (fromCheck) return fromCheck;
    const match = asString(evaluation?.counterRequest).match(/(?:under|below|less than)\s+(?:[A-Z]{3}|€|\$|£)?\s*(\d+(?:[.,]\d+)?)/i);
    return match ? asNumber(match[1].replace(",", "."), 0) : 0;
  }

  function reviseRetailerOffer({ consumerProfile, retailerPolicy, previousOffer, evaluation } = {}) {
    const consumer = createConsumerAgentProfile(consumerProfile || {});
    const retailer = createRetailerAgentPolicy(retailerPolicy || {});
    const previous = normalizeOffer(previousOffer || {});
    const targetBudget = extractCounterBudget(evaluation) || asNumber(consumer.budgetPerPerson, 0) || 0;
    const wantsLight = consumerWantsLightDinner(consumer);
    const previousItemIds = new Set(previous.proposedItems.map((item) => item.id));
    const allergies = asArray(consumer.allergies);
    const dislikes = asArray(consumer.dislikes);
    const constraintsUsed = [
      `Consumer counter request: ${asString(evaluation?.counterRequest || evaluation?.publicMessageToRetailer, "Please improve alignment.")}`,
    ];

    let candidates = retailer.menuItems.filter((item) => {
      if (!isAvailable(item)) return false;
      if (hasAllergyConflict(item, allergies)) return false;
      if (dislikes.length && includesAny(itemSearchText(item), dislikes)) return false;
      if (wantsLight && isHeavyItem(item)) return false;
      return true;
    });

    if (targetBudget) {
      candidates = candidates.filter((item) => asNumber(item.price, 0) <= targetBudget);
    }

    if (!candidates.length) {
      constraintsUsed.push("No safer or lower-priced menu item was available within the retailer policy.");
      const createdAt = now();
      return {
        offerId: generateId("offer"),
        retailerId: retailer.retailerId,
        retailerName: retailer.retailerName,
        proposedItems: [],
        offerType: "revision_unavailable",
        offerTitle: "No revised offer available",
        offerDescription: "The retailer agent could not revise the offer within current menu and policy boundaries.",
        priceBefore: 0,
        priceAfter: 0,
        discountAmount: 0,
        discountPercent: 0,
        appliedPromotion: null,
        constraintsUsed,
        marketingTactic: "policy_limited",
        retailerReasoning: "No safe menu candidate could improve on the counter request without violating rules.",
        readableEnglish: `${retailer.retailerName} cannot revise safely within the current menu and concession policy.`,
        protocolPayload: {
          protocol: "agmentic-a2a.v1",
          action: "RETAILER_REVISED_OFFER",
          offer: {
            status: "revision_unavailable",
            constraintsUsed,
            createdAt,
          },
        },
        createdAt,
      };
    }

    const sorted = [...candidates].sort((a, b) => {
      const priceBias = targetBudget ? asNumber(a.price, 0) - asNumber(b.price, 0) : 0;
      if (priceBias) return priceBias;
      const noveltyBias = Number(previousItemIds.has(a.id)) - Number(previousItemIds.has(b.id));
      if (noveltyBias) return noveltyBias;
      return scoreMenuItem(b, consumer) - scoreMenuItem(a, consumer);
    });
    const primary = sorted.find((item) => !isWineItem(item)) || sorted[0];
    const revisedMenu = [primary];

    if (consumer.winePreference) {
      const wineItem = sorted.find((item) => {
        const total = asNumber(primary.price, 0) + asNumber(item.price, 0);
        return item.id !== primary.id
          && isWineItem(item)
          && (!targetBudget || total <= targetBudget);
      });
      if (wineItem) revisedMenu.push(wineItem);
    }

    const revisionPolicy = createRetailerAgentPolicy({
      ...retailer,
      menuItems: revisedMenu,
      promotions: retailer.promotions,
      negotiationRules: retailer.negotiationRules,
    });
    const revisedOffer = generateRetailerOffer({
      consumerProfile: consumer,
      retailerPolicy: revisionPolicy,
      negotiationContext: {
        note: `Revision after consumer counter: ${asString(evaluation?.counterRequest || "counter requested")}`,
      },
    });
    revisedOffer.offerType = revisedOffer.offerType === "safe_rejection" ? revisedOffer.offerType : "revised_offer";
    revisedOffer.offerTitle = `Revised: ${revisedOffer.offerTitle}`;
    revisedOffer.offerDescription = `Revised within policy after counter request. ${revisedOffer.offerDescription}`;
    revisedOffer.constraintsUsed = [...revisedOffer.constraintsUsed, ...constraintsUsed];
    revisedOffer.readableEnglish = `${retailer.retailerName} revises the offer: ${revisedOffer.proposedItems.map((item) => item.name).join(" + ")}. Price before ${retailer.currency} ${revisedOffer.priceBefore}, after ${retailer.currency} ${revisedOffer.priceAfter}.`;
    revisedOffer.protocolPayload = {
      protocol: "agmentic-a2a.v1",
      action: "RETAILER_REVISED_OFFER",
      offer: {
        offerId: revisedOffer.offerId,
        retailerId: revisedOffer.retailerId,
        retailerName: revisedOffer.retailerName,
        proposedItems: revisedOffer.proposedItems,
        offerType: revisedOffer.offerType,
        offerTitle: revisedOffer.offerTitle,
        priceBefore: revisedOffer.priceBefore,
        priceAfter: revisedOffer.priceAfter,
        discountAmount: revisedOffer.discountAmount,
        discountPercent: revisedOffer.discountPercent,
        appliedPromotion: revisedOffer.appliedPromotion,
        constraintsUsed: revisedOffer.constraintsUsed,
        marketingTactic: revisedOffer.marketingTactic,
        createdAt: revisedOffer.createdAt,
      },
    };
    return revisedOffer;
  }

  function sessionMessage({ speaker, action, payload, readableEnglish, visibility = "public" }) {
    return addAgentMessage({
      speaker,
      action,
      protocol: "agmentic-a2a.v1",
      payload: {
        protocol: "agmentic-a2a.v1",
        action,
        ...payload,
      },
      readableEnglish,
      visibility,
    });
  }

  function termsFromEvaluation({ retailer, offer, evaluation, status }) {
    const normalizedOffer = normalizeOffer(offer || {});
    const acceptedItemNames = asArray(evaluation?.acceptedItems).map((item) => item.name);
    return {
      status,
      retailerId: retailer.retailerId,
      retailerName: retailer.retailerName,
      acceptedItems: acceptedItemNames,
      finalPrice: normalizedOffer.priceAfter,
      currency: retailer.currency,
      discountAmount: normalizedOffer.discountAmount,
      discountPercent: normalizedOffer.discountPercent,
      valueAdd: normalizedOffer.marketingTactic || normalizedOffer.offerType || "",
      safetyChecks: asArray(evaluation?.safetyChecks),
      remainingCaveats: [
        evaluation?.decision === "counter_offer" ? evaluation.counterRequest : "",
        evaluation?.decision === "ask_clarification" ? evaluation.publicMessageToRetailer : "",
      ].filter(Boolean),
    };
  }

  function runLocalNegotiationSession({ consumerProfile, retailerPolicy, maxRounds = 2 } = {}) {
    clearNegotiationSession();
    const consumer = createConsumerAgentProfile(consumerProfile || {});
    const retailer = createRetailerAgentPolicy(retailerPolicy || {});
    const createdAt = now();
    const sessionId = generateId("negotiation");
    const result = {
      sessionId,
      status: "accepted",
      messages: [],
      firstOffer: null,
      firstEvaluation: null,
      revisedOffer: null,
      finalEvaluation: null,
      finalTerms: null,
      createdAt,
      updatedAt: createdAt,
    };

    saveNegotiationSession({
      sessionId,
      consumerId: consumer.userId,
      retailerId: retailer.retailerId,
      status: "started",
      messages: [],
      currentOffer: null,
      finalTerms: null,
      createdAt,
      updatedAt: createdAt,
    });

    const record = (message) => {
      result.messages.push(message);
      return message;
    };
    const fail = (status, readableEnglish, payload = {}) => {
      result.status = status;
      record(sessionMessage({
        speaker: "system",
        action: "SESSION_FAILED",
        payload: { sessionId, status, ...payload },
        readableEnglish,
      }));
      result.updatedAt = now();
      saveNegotiationSession({
        sessionId,
        consumerId: consumer.userId,
        retailerId: retailer.retailerId,
        status,
        messages: result.messages,
        currentOffer: result.revisedOffer || result.firstOffer,
        finalTerms: result.finalTerms,
        createdAt,
        updatedAt: result.updatedAt,
      });
      return result;
    };

    record(sessionMessage({
      speaker: "system",
      action: "SESSION_STARTED",
      payload: { sessionId, maxRounds },
      readableEnglish: "Local real negotiation started from shared browser state.",
    }));

    if (!hasConsumerProfile(consumer)) {
      return fail("failed_no_consumer", "No consumer agent profile found.");
    }
    if (!hasRetailerPolicy(retailer)) {
      return fail("failed_no_retailer", "No retailer policy or menu found.");
    }

    record(sessionMessage({
      speaker: "consumer_agent",
      action: "CONSUMER_AGENT_CONNECTED",
      payload: {
        sessionId,
        consumer: {
          userId: consumer.userId,
          sessionId: consumer.sessionId,
          likesCount: consumer.likes.length,
          allergiesCount: consumer.allergies.length,
          budgetRange: consumer.budgetRange,
          occasion: consumer.occasion,
          confidenceLevel: consumer.confidenceLevel,
          winePreference: consumer.winePreference,
        },
      },
      readableEnglish: `Consumer agent connected with ${consumer.likes.length} likes, ${consumer.allergies.length} allergies, ${consumer.budgetRange || "unknown"} budget posture, and ${consumer.occasion || "no stated occasion"}.`,
    }));
    record(sessionMessage({
      speaker: "retailer_agent",
      action: "RETAILER_AGENT_CONNECTED",
      payload: {
        sessionId,
        retailer: {
          retailerId: retailer.retailerId,
          retailerName: retailer.retailerName,
          cuisine: retailer.cuisine,
          discoveryRadius: retailer.discoveryRadius,
          marketingAllowed: retailer.marketingAllowed,
        },
      },
      readableEnglish: `${retailer.retailerName} retailer agent connected within ${retailer.discoveryRadius} m discovery radius.`,
    }));
    record(sessionMessage({
      speaker: "retailer_agent",
      action: "MENU_POLICY_TRANSFER",
      payload: {
        sessionId,
        menuItems: retailer.menuItems,
        promotions: retailer.promotions,
        negotiationRules: retailer.negotiationRules,
        marketingAllowed: retailer.marketingAllowed,
      },
      readableEnglish: `${retailer.retailerName} transfers ${retailer.menuItems.length} menu items, ${retailer.promotions.length} promotions, and negotiation rules.`,
    }));

    const firstOffer = generateRetailerOffer({
      consumerProfile: consumer,
      retailerPolicy: retailer,
      negotiationContext: { sessionId, round: 1 },
    });
    result.firstOffer = firstOffer;
    if (firstOffer.offerType === "safe_rejection" || !firstOffer.proposedItems.length) {
      result.status = "failed_no_safe_offer";
      record(sessionMessage({
        speaker: "retailer_agent",
        action: "RETAILER_OFFER",
        payload: firstOffer.protocolPayload,
        readableEnglish: firstOffer.readableEnglish,
      }));
      return fail("failed_no_safe_offer", "The consumer agent could not find a safe, good-fit option from the current restaurant menu.", {
        constraintsUsed: firstOffer.constraintsUsed,
      });
    }

    record(sessionMessage({
      speaker: "retailer_agent",
      action: "RETAILER_OFFER",
      payload: firstOffer.protocolPayload,
      readableEnglish: firstOffer.readableEnglish,
    }));
    const firstEvaluation = evaluateRetailerOffer({
      consumerProfile: consumer,
      retailerPolicy: retailer,
      offer: firstOffer,
      negotiationContext: { sessionId, round: 1 },
    });
    result.firstEvaluation = firstEvaluation;
    result.finalEvaluation = firstEvaluation;
    record(sessionMessage({
      speaker: "consumer_agent",
      action: "CONSUMER_EVALUATION",
      payload: firstEvaluation.protocolPayload,
      readableEnglish: firstEvaluation.readableEnglish,
    }));

    if (firstEvaluation.decision === "accept") {
      result.status = "accepted";
      result.finalTerms = termsFromEvaluation({ retailer, offer: firstOffer, evaluation: firstEvaluation, status: result.status });
    } else if (firstEvaluation.decision === "reject") {
      result.status = "rejected";
      result.finalTerms = termsFromEvaluation({ retailer, offer: firstOffer, evaluation: firstEvaluation, status: result.status });
    } else if (firstEvaluation.decision === "ask_clarification") {
      result.status = "clarification_needed";
      result.finalTerms = termsFromEvaluation({ retailer, offer: firstOffer, evaluation: firstEvaluation, status: result.status });
    } else if (firstEvaluation.decision === "counter_offer" && maxRounds > 1) {
      record(sessionMessage({
        speaker: "consumer_agent",
        action: "CONSUMER_COUNTER_OFFER",
        payload: {
          sessionId,
          counterRequest: firstEvaluation.counterRequest,
          sourceEvaluationId: firstEvaluation.evaluationId,
        },
        readableEnglish: `Consumer agent counters: ${firstEvaluation.counterRequest}`,
      }));
      const revisedOffer = reviseRetailerOffer({
        consumerProfile: consumer,
        retailerPolicy: retailer,
        previousOffer: firstOffer,
        evaluation: firstEvaluation,
      });
      result.revisedOffer = revisedOffer;
      record(sessionMessage({
        speaker: "retailer_agent",
        action: "RETAILER_REVISED_OFFER",
        payload: revisedOffer.protocolPayload,
        readableEnglish: revisedOffer.readableEnglish,
      }));

      if (!revisedOffer.proposedItems.length) {
        result.status = "counter_unresolved";
        result.finalTerms = termsFromEvaluation({ retailer, offer: firstOffer, evaluation: firstEvaluation, status: result.status });
      } else {
        const revisedEvaluation = evaluateRetailerOffer({
          consumerProfile: consumer,
          retailerPolicy: retailer,
          offer: revisedOffer,
          negotiationContext: { sessionId, round: 2 },
        });
        result.finalEvaluation = revisedEvaluation;
        record(sessionMessage({
          speaker: "consumer_agent",
          action: "CONSUMER_EVALUATION",
          payload: revisedEvaluation.protocolPayload,
          readableEnglish: revisedEvaluation.readableEnglish,
        }));
        if (revisedEvaluation.decision === "accept" && revisedEvaluation.consumerScore >= firstEvaluation.consumerScore) {
          result.status = "accepted";
          result.finalTerms = termsFromEvaluation({ retailer, offer: revisedOffer, evaluation: revisedEvaluation, status: result.status });
        } else {
          result.status = revisedEvaluation.decision === "reject" ? "rejected" : "counter_unresolved";
          result.finalTerms = termsFromEvaluation({ retailer, offer: revisedOffer, evaluation: revisedEvaluation, status: result.status });
        }
      }
    } else {
      result.status = "counter_unresolved";
      result.finalTerms = termsFromEvaluation({ retailer, offer: firstOffer, evaluation: firstEvaluation, status: result.status });
    }

    record(sessionMessage({
      speaker: "system",
      action: "FINAL_TERMS",
      payload: {
        sessionId,
        status: result.status,
        finalTerms: result.finalTerms,
      },
      readableEnglish: result.status === "accepted"
        ? `Final terms accepted with ${retailer.retailerName}.`
        : `Local negotiation finished with status ${result.status}.`,
    }));

    result.updatedAt = now();
    saveNegotiationSession({
      sessionId,
      consumerId: consumer.userId,
      retailerId: retailer.retailerId,
      status: result.status,
      messages: result.messages,
      currentOffer: result.revisedOffer || result.firstOffer,
      finalTerms: result.finalTerms,
      createdAt,
      updatedAt: result.updatedAt,
    });
    return result;
  }

  function getConsumerProfile() {
    return createConsumerAgentProfile(readJson(STORAGE_KEYS.consumerProfile, {}));
  }

  function saveConsumerProfile(profile) {
    return writeJson(
      STORAGE_KEYS.consumerProfile,
      createConsumerAgentProfile({ ...profile, updatedAt: now() }),
    );
  }

  function getRetailerPolicy() {
    return createRetailerAgentPolicy(readJson(STORAGE_KEYS.retailerPolicy, {}));
  }

  function saveRetailerPolicy(policy) {
    return writeJson(
      STORAGE_KEYS.retailerPolicy,
      createRetailerAgentPolicy({ ...policy, updatedAt: now() }),
    );
  }

  function getNegotiationSession() {
    return createNegotiationSession(readJson(STORAGE_KEYS.negotiationSession, {}));
  }

  function saveNegotiationSession(session) {
    return writeJson(
      STORAGE_KEYS.negotiationSession,
      createNegotiationSession({ ...session, updatedAt: now() }),
    );
  }

  function getAgentMessages() {
    return asArray(readJson(STORAGE_KEYS.agentMessages, [])).map(createAgentMessage);
  }

  function addAgentMessage(message) {
    const messages = getAgentMessages();
    const normalized = createAgentMessage(message);
    messages.push(normalized);
    writeJson(STORAGE_KEYS.agentMessages, messages);

    const session = getNegotiationSession();
    session.messages = messages;
    session.updatedAt = now();
    saveNegotiationSession(session);
    return normalized;
  }

  function clearNegotiationSession() {
    try {
      window.localStorage?.removeItem(STORAGE_KEYS.negotiationSession);
      window.localStorage?.removeItem(STORAGE_KEYS.agentMessages);
    } catch (error) {
      // Ignore storage failures.
    }
  }

  function clearAgentMessages() {
    try {
      window.localStorage?.removeItem(STORAGE_KEYS.agentMessages);
    } catch (error) {
      // Ignore storage failures.
    }

    const existingSession = readJson(STORAGE_KEYS.negotiationSession, null);
    if (existingSession) {
      const session = createNegotiationSession(existingSession);
      session.messages = [];
      session.updatedAt = now();
      saveNegotiationSession(session);
    }
  }

  window.AgmenticAgentProtocol = {
    STORAGE_KEYS,
    createConsumerAgentProfile,
    createRetailerAgentPolicy,
    createNegotiationRules,
    createMenuItem,
    createMealPath,
    createPromotion,
    createAgentMessage,
    createNegotiationSession,
    getConsumerProfile,
    saveConsumerProfile,
    getRetailerPolicy,
    saveRetailerPolicy,
    getNegotiationSession,
    saveNegotiationSession,
    getAgentMessages,
    addAgentMessage,
    clearNegotiationSession,
    clearAgentMessages,
    generateRetailerOffer,
    evaluateRetailerOffer,
    scoreMenuItemBreakdown,
    generateMealPaths,
    compareItemAndMealPathEngines,
    runLocalNegotiationSession,
  };
}());
