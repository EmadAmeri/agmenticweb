const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? window.location.origin
  : "https://api-dining.agmentic.com";

const conversation = document.querySelector("#conversation");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const cameraButton = document.querySelector("#cameraButton");
const locationButton = document.querySelector("#locationButton");
const menuPanel = document.querySelector(".camera-card");
const menuImage = document.querySelector("#menuImage");
const menuPreview = document.querySelector("#menuPreview");
const menuStatus = document.querySelector("#menuStatus");
const restaurantList = document.querySelector("#restaurantList");
const providerToggle = document.querySelector("#providerToggle");
const providerLabel = document.querySelector("#providerLabel");
const localModelStatus = document.querySelector("#localModelStatus");
const loader = document.querySelector("#loader");
const profilePanel = document.querySelector("#profilePanel");
const profileContent = document.querySelector("#profileContent");
const suggestModal = document.querySelector("#suggestModal");
const suggestForm = document.querySelector("#suggestForm");
const ocrProgress = document.querySelector("#ocrProgress");
const ocrProgressBar = document.querySelector("#ocrProgressBar");
const callScreen = document.querySelector("#callScreen");
const callStatus = document.querySelector("#callStatus");
const callContactName = document.querySelector("#callContactName");
const callAvatar = document.querySelector("#callAvatar");
const callTimer = document.querySelector("#callTimer");
const callRouteLabel = document.querySelector("#callRouteLabel");
const incomingShortcuts = document.querySelector("#incomingShortcuts");
const incomingControls = document.querySelector("#incomingControls");
const activeCallControls = document.querySelector("#activeCallControls");
const agentContactNameInput = document.querySelector("#agentContactName");
const saveContactName = document.querySelector("#saveContactName");
const userIdInput = document.querySelector("#userIdInput");
const saveUserIdButton = document.querySelector("#saveUserId");
const USE_LOCAL_OCR_FALLBACK = true;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const USER_ID_KEY = "dining_user_id";
const CONTACT_NAME_KEY = "dining_agent_contact_name";
const PROVIDER_MODE_KEY = "dining_provider_mode";
const LOCAL_MENU_TEXT_KEY = "dining_local_menu_text";
const LOCAL_MENU_DATA_KEY = "dining_local_menu_data";
const LOCAL_MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
const LOCAL_FALLBACK_MODEL_ID = "SmolLM2-360M-Instruct-q4f32_1-MLC";
const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm";
const AGENT_PROTOCOL_URL = "../shared/agent-protocol.js?v=1";
let sessionId = getSessionId();
let lastErrorMessage = "";
let providerMode = localStorage.getItem(PROVIDER_MODE_KEY) || "cloud";
let localEngine = null;
let localModelPromise = null;
let localChatHistory = [];
let recognition = null;
let callActive = false;
let callConnected = false;
let callMuted = false;
let speakerEnabled = false;
let pendingIncomingCall = false;
let ringInterval = null;
let ringContext = null;
let incomingTimeout = null;
let callTimerInterval = null;
let callStartedAt = null;
let microphoneStream = null;
let agentProtocolPromise = null;

function getSessionId() {
  const userId = getUserId();
  if (userId) {
    const id = `user_${slugifyUserId(userId)}`;
    localStorage.setItem("dining_session_id", id);
    return id;
  }

  let id = localStorage.getItem("dining_session_id");

  if (!id) {
    id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const random = Math.random() * 16 | 0;
      const value = char === "x" ? random : (random & 0x3 | 0x8);
      return value.toString(16);
    });
    localStorage.setItem("dining_session_id", id);
  }

  return id;
}

function getUserId() {
  return localStorage.getItem(USER_ID_KEY) || "";
}

function setUserId(value) {
  const userId = value.trim();

  if (!userId) {
    return;
  }

  localStorage.setItem(USER_ID_KEY, userId);
  sessionId = `user_${slugifyUserId(userId)}`;
  localStorage.setItem("dining_session_id", sessionId);
  localChatHistory = [];
}

function slugifyUserId(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "default";
}

function userStorageKey(key) {
  return `${key}:${sessionId}`;
}

function setLoading(isLoading) {
  loader.hidden = !isLoading;
}

function updateMenuPanelVisibility() {
  const hasContent = Boolean(
    menuStatus.textContent.trim()
    || localModelStatus.textContent.trim()
    || !menuPreview.hidden
    || !ocrProgress.hidden
    || !restaurantList.hidden,
  );
  menuPanel.classList.toggle("has-content", hasContent);
}

function friendlyError(error) {
  if (error.status === 429) {
    return "Give me a sec — try again in 30s";
  }

  return "Something did not work. Try again in a moment.";
}

function appendMessage(role, text) {
  lastErrorMessage = "";

  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  row.appendChild(bubble);
  conversation.appendChild(row);
  conversation.scrollTop = conversation.scrollHeight;
}

function appendError(text) {
  if (text === lastErrorMessage) {
    return;
  }

  appendMessage("agent", text);
  lastErrorMessage = text;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);

  if (!response.ok) {
    const details = await response.text().catch(() => response.statusText);
    const error = new Error(details || response.statusText);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function isLocalMode() {
  return providerMode === "local";
}

function setProviderMode(mode) {
  providerMode = mode;
  localStorage.setItem(PROVIDER_MODE_KEY, mode);
  updateProviderToggle();
  localModelStatus.textContent = "";
}

function updateProviderToggle() {
  const local = isLocalMode();
  providerToggle.classList.toggle("local", local);
  providerToggle.setAttribute("aria-pressed", String(local));
  providerLabel.textContent = local ? "Local" : "Cloud";
}

async function getLocalEngine() {
  if (localEngine) {
    return localEngine;
  }

  if (!navigator.gpu) {
    throw new Error("Local AI needs WebGPU. Try Safari/Chrome updates, or use Cloud mode.");
  }

  if (!localModelPromise) {
    localModelStatus.textContent = "Loading local model for the first time...";
    localModelPromise = import(WEBLLM_URL).then(async (webllm) => {
      try {
        return await createLocalEngine(webllm, LOCAL_MODEL_ID);
      } catch (error) {
        localModelStatus.textContent = "Bigger local model failed. Trying the smaller fallback...";
        return createLocalEngine(webllm, LOCAL_FALLBACK_MODEL_ID);
      }
    }).then((engine) => {
      localEngine = engine;
      localModelStatus.textContent = "Local model ready.";
      return engine;
    }).catch((error) => {
      localModelPromise = null;
      throw error;
    });
  }

  return localModelPromise;
}

function createLocalEngine(webllm, modelId) {
  return webllm.CreateMLCEngine(
    modelId,
    {
      initProgressCallback: (report) => {
        const percent = Number.isFinite(report.progress)
          ? ` ${Math.round(report.progress * 100)}%`
          : "";
        localModelStatus.textContent = `${modelId}: ${report.text || "Loading local model..."}${percent}`;
      },
    },
    { context_window_size: 2048 },
  );
}

function saveLocalMenuText(text) {
  localStorage.setItem(userStorageKey(LOCAL_MENU_TEXT_KEY), text);
}

function getLocalMenuText() {
  return localStorage.getItem(userStorageKey(LOCAL_MENU_TEXT_KEY))
    || localStorage.getItem(LOCAL_MENU_TEXT_KEY)
    || "";
}

function saveStructuredMenu(data, rawText = "") {
  const payload = {
    menu: data.menu || null,
    restaurant: data.restaurant || null,
    source_url: data.source_url || data.restaurant?.source_url || "",
    items_count: data.items_count || data.menu?.items?.length || 0,
    restaurant_type: data.restaurant_type || data.menu?.restaurant_type || "",
    raw_text_preview: rawText.slice(0, 1800),
    saved_at: new Date().toISOString(),
  };
  localStorage.setItem(userStorageKey(LOCAL_MENU_DATA_KEY), JSON.stringify(payload));
}

function getStructuredMenu() {
  try {
    return JSON.parse(
      localStorage.getItem(userStorageKey(LOCAL_MENU_DATA_KEY))
        || localStorage.getItem(LOCAL_MENU_DATA_KEY)
        || "null",
    );
  } catch (error) {
    return null;
  }
}

function localMenuPromptContext() {
  const structured = getStructuredMenu();

  if (structured?.menu?.items?.length) {
    const restaurant = structured.restaurant || {};
    const menu = structured.menu;
    const restaurantLines = [
      restaurant.name ? `Name: ${restaurant.name}` : "",
      restaurant.address ? `Address: ${restaurant.address}` : "",
      restaurant.cuisine ? `Cuisine: ${restaurant.cuisine}` : "",
      restaurant.distance_m ? `Distance: ${restaurant.distance_m}m` : "",
      restaurant.source_url ? `Menu source: ${restaurant.source_url}` : "",
    ].filter(Boolean).join("\n");
    const itemLines = menu.items.slice(0, 80).map((item) => (
      `- ${item.name} | ${item.section || "Menu"} | ${item.price || ""} | ${item.description || ""}`
    )).join("\n");

    return [
      "Structured restaurant context:",
      restaurantLines || "No restaurant name available.",
      "",
      `Menu type: ${menu.restaurant_type || structured.restaurant_type || "restaurant"}`,
      `Menu language: ${menu.language || "unknown"}`,
      "Structured menu items:",
      itemLines,
    ].join("\n");
  }

  const menuText = getLocalMenuText();
  if (menuText) {
    return `Raw OCR menu text:\n${menuText.slice(0, 5200)}`;
  }

  return "";
}

async function localChat(text) {
  const menuContext = localMenuPromptContext();

  if (!menuContext) {
    throw new Error("Local mode needs a structured menu first. Photograph the menu or load an online menu.");
  }

  const directAnswer = answerStructuredMenuQuestion(text);
  if (directAnswer) {
    localChatHistory.push({ role: "user", content: text }, { role: "assistant", content: directAnswer });
    return directAnswer;
  }

  const engine = await getLocalEngine();
  const messages = [
    {
      role: "system",
      content: [
        "You are Dining, a calm fine-dining companion.",
        "Answer in one short sentence when possible.",
        "Use plain everyday language.",
        "Use the structured restaurant and menu context as the main source.",
        "You may use general food knowledge to explain ingredients, taste, texture, and pairings.",
        "Do not invent menu items, prices, or restaurant facts.",
        "For direct menu facts like cheapest, lightest, or price questions, answer in one short sentence with the dish name and price.",
        "When explaining a dish, say what it is, how it tends to taste, and who might like it.",
        "If the menu context is unclear, say that simply.",
        "",
        menuContext,
      ].join("\n"),
    },
    ...localChatHistory.slice(-6),
    { role: "user", content: text },
  ];
  const completion = await engine.chat.completions.create({
    messages,
    temperature: 0.4,
    max_tokens: 140,
  });
  const response = completion.choices?.[0]?.message?.content?.trim() || "I could not answer that locally yet.";
  const shortResponse = shortenLocalResponse(response);
  localChatHistory.push({ role: "user", content: text }, { role: "assistant", content: shortResponse });
  return shortResponse;
}

function answerStructuredMenuQuestion(text) {
  const structured = getStructuredMenu();
  const items = structured?.menu?.items || [];

  if (!items.length) {
    return "";
  }

  const lowered = text.toLowerCase();
  if (!lowered.includes("cheapest") && !lowered.includes("least expensive") && !lowered.includes("lowest price")) {
    return "";
  }

  const section = requestedSection(lowered);
  let scopedItems = items.filter((item) => !section || sectionMatches(item.section, section));

  if (section === "main" && !scopedItems.length) {
    scopedItems = items.filter((item) => looksLikeMainFood(item));
  }

  let candidates = scopedItems
    .map((item) => ({ item, price: parseMenuPrice(item.price) }))
    .filter((entry) => Number.isFinite(entry.price));

  if (section === "main" && !candidates.length) {
    candidates = items
      .filter((item) => !looksLikeNonMainItem(item))
      .map((item) => ({ item, price: parseMenuPrice(item.price) }))
      .filter((entry) => Number.isFinite(entry.price));
  }

  if (!candidates.length) {
    return section
      ? `I can't see a priced ${section} item in this menu.`
      : "I can't see clear prices in this menu.";
  }

  candidates.sort((a, b) => a.price - b.price);
  const cheapest = candidates[0].item;
  return `The cheapest ${section || "option"} is ${cheapest.name} at ${cheapest.price}.`;
}

function requestedSection(text) {
  if (text.includes("main") || text.includes("entrée") || text.includes("entree") || text.includes("haupt")) {
    return "main";
  }
  if (text.includes("starter") || text.includes("appetizer") || text.includes("vorspeise")) {
    return "starter";
  }
  if (text.includes("dessert") || text.includes("nachspeise")) {
    return "dessert";
  }
  if (text.includes("drink") || text.includes("wine") || text.includes("getränk") || text.includes("getrank")) {
    return "drinks";
  }
  return "";
}

function sectionMatches(value, section) {
  const normalized = String(value || "").toLowerCase();
  const groups = {
    main: ["main", "mains", "main course", "hauptgang", "hauptgänge", "hauptgange", "hauptgerichte", "entree", "entrée"],
    starter: ["starter", "starters", "appetizer", "appetizers", "vorspeise", "vorspeisen"],
    dessert: ["dessert", "desserts", "nachspeise", "nachspeisen"],
    drinks: ["drink", "drinks", "wine", "weine", "getränke", "getranke"],
  };

  return (groups[section] || []).some((name) => normalized.includes(name));
}

function looksLikeMainFood(item) {
  const text = [
    item.section,
    item.name,
    item.description,
  ].join(" ").toLowerCase();

  if (looksLikeNonMainItem(item)) {
    return false;
  }

  const mainWords = [
    "schnitzel",
    "roast",
    "steak",
    "duck",
    "beef",
    "pork",
    "chicken",
    "fish",
    "salmon",
    "trout",
    "veal",
    "lamb",
    "pasta",
    "risotto",
    "burger",
    "dumpling",
    "potato",
    "rice",
    "main",
    "haupt",
  ];

  return mainWords.some((word) => text.includes(word));
}

function looksLikeNonMainItem(item) {
  const text = [
    item.section,
    item.name,
    item.description,
  ].join(" ").toLowerCase();

  if (sectionMatches(item.section, "drinks") || sectionMatches(item.section, "dessert") || sectionMatches(item.section, "starter")) {
    return true;
  }

  const excludedWords = [
    "wine",
    "beer",
    "cocktail",
    "drink",
    "dessert",
    "cake",
    "ice cream",
    "sorbet",
    "starter",
    "appetizer",
    "soup",
    "salad",
  ];

  return excludedWords.some((word) => text.includes(word));
}

function parseMenuPrice(value) {
  const match = String(value || "").match(/(\d+(?:[,.]\d{1,2})?)/);
  return match ? Number(match[1].replace(",", ".")) : NaN;
}

function shortenLocalResponse(response) {
  return response
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("\n");
}

async function generateAgentResponse(text) {
  const hasMenu = Boolean(getStructuredMenu()?.menu?.items?.length);

  // A dining request without a menu (e.g. "a table for 4, budget 25 euro
  // per person") must reach the backend so the agent can capture it and set
  // up the retailer negotiation, instead of being told to load a menu.
  if (!hasMenu && wantsDiningReservation(text)) {
    const data = await request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, message: text }),
    });
    // Carry the user's goal into the shared consumer-agent profile so the
    // Agent Handshake page negotiates against this request (same origin =>
    // shared localStorage). The consumer agent already stored the goal as a
    // memory note; here we mirror the memory into the shared profile.
    syncConsumerGoalToHandshake();
    return data.response;
  }

  if (isLocalMode()) {
    return localChat(text);
  }

  if (wantsRetailerOffer(text)) {
    return negotiateRetailerOffer(text);
  }

  if (!hasMenu) {
    return "I need a real menu first. Use the camera or location button, then I’ll answer from that menu only.";
  }

  const data = await request("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message: text }),
  });
  return data.response;
}

function wantsDiningReservation(text) {
  const lowered = text.toLowerCase();
  const booking = [
    "table for",
    "book a table",
    "book a restaurant",
    "reserve",
    "reservation",
    "find a restaurant",
    "find me a restaurant",
    "find a place",
    "table at",
  ];
  if (booking.some((word) => lowered.includes(word))) {
    return true;
  }

  const dining = ["dinner", "lunch", "brunch", "dine", "eat out", "restaurant"];
  const budget = ["budget", "per person", "per head", "per guest", "a head", " pp", "each"];
  const partySize = /\bfor\s+(\d{1,2}|two|three|four|five|six)\b/.test(lowered)
    || /\b(\d{1,2})\s+(people|persons?|guests?|pax)\b/.test(lowered);

  const hasDining = dining.some((word) => lowered.includes(word));
  const hasBudget = budget.some((word) => lowered.includes(word));

  if (hasDining && (hasBudget || partySize)) {
    return true;
  }
  if (hasBudget && partySize) {
    return true;
  }
  return false;
}

function wantsRetailerOffer(text) {
  const lowered = text.toLowerCase();
  return [
    "offer",
    "discount",
    "deal",
    "negotiate",
    "negotiation",
    "promotion",
    "coupon",
    "retailer agent",
  ].some((word) => lowered.includes(word));
}

async function negotiateRetailerOffer(text) {
  const structured = getStructuredMenu();
  if (!structured?.menu?.items?.length) {
    return "I need a real menu first. Use the camera or location button, then I can check for retailer-agent offers.";
  }

  const protocol = await loadAgentProtocol();
  const retailerPolicy = protocol?.getRetailerPolicy?.() || null;
  const data = await request("/retailer/negotiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      message: text,
      retailer_policy: retailerPolicy,
    }),
  });
  return data.response;
}

async function loadAgentProtocol() {
  if (window.AgmenticAgentProtocol) {
    return window.AgmenticAgentProtocol;
  }

  if (!agentProtocolPromise) {
    agentProtocolPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = AGENT_PROTOCOL_URL;
      script.async = true;
      script.onload = () => resolve(window.AgmenticAgentProtocol || null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  }

  return agentProtocolPromise;
}

// Mirror the consumer's backend memory (incl. the dining-request goal note)
// into the shared consumer-agent profile that the Agent Handshake page reads.
// The handshake engine parses budget / party size / drink from the notes.
async function syncConsumerGoalToHandshake() {
  try {
    const protocol = await loadAgentProtocol();
    if (!protocol?.saveConsumerProfile) return;

    let memory = { liked: [], disliked: [], notes: [] };
    try {
      memory = await request(`/profile/${sessionId}`);
    } catch (error) {
      // No backend profile yet; still record the session so the handshake links.
    }

    protocol.saveConsumerProfile({
      userId: sessionId.replace(/^user_/, "") || sessionId,
      sessionId,
      name: "Consumer Dining Agent",
      likes: (memory.liked || []).map((entry) => entry.item).filter(Boolean),
      dislikes: (memory.disliked || []).map((entry) => entry.item).filter(Boolean),
      notes: (memory.notes || []).map((entry) => entry.text).filter(Boolean),
    });
  } catch (error) {
    // Non-fatal: the chat reply still works even if the handshake sync fails.
  }
}

async function sendMessage(text) {
  appendMessage("user", text);
  setLoading(true);

  try {
    appendMessage("agent", await generateAgentResponse(text));
  } catch (error) {
    appendError(isLocalMode() ? error.message : friendlyError(error));
  } finally {
    setLoading(false);
  }
}

async function sendCallMessage(text) {
  const trimmed = text.trim();

  if (!trimmed || !callConnected) {
    return;
  }

  appendMessage("user", trimmed);
  callStatus.textContent = "Thinking...";

  try {
    const response = await generateAgentResponse(trimmed);
    appendMessage("agent", response);
    speak(response);
    callStatus.textContent = "Connected";
  } catch (error) {
    const message = isLocalMode() ? error.message : friendlyError(error);
    speak(message);
    callStatus.textContent = "Connection issue";
  }
}

function openFakeCall() {
  if (callActive || pendingIncomingCall) {
    return;
  }

  pendingIncomingCall = true;
  requestMicrophonePermission();
  incomingTimeout = window.setTimeout(showIncomingCall, 2800);
}

function showIncomingCall() {
  if (!pendingIncomingCall) {
    return;
  }

  callActive = true;
  callConnected = false;
  callMuted = false;
  speakerEnabled = false;
  pendingIncomingCall = false;
  callScreen.hidden = false;
  callScreen.classList.add("incoming");
  callScreen.classList.remove("calling", "connected");
  callScreen.setAttribute("aria-hidden", "false");
  callContactName.textContent = getContactName();
  callAvatar.textContent = initials(getContactName());
  callStatus.textContent = "Incoming call";
  callTimer.textContent = "00:00";
  callRouteLabel.textContent = "mobile";
  incomingShortcuts.hidden = false;
  incomingControls.hidden = false;
  activeCallControls.hidden = true;
  setupRecognition();
  startRinging();
}

function connectFakeCall() {
  if (!callActive) {
    return;
  }

  callConnected = true;
  callStartedAt = Date.now();
  stopRinging();
  callScreen.classList.remove("incoming", "calling");
  callScreen.classList.add("connected");
  incomingShortcuts.hidden = true;
  incomingControls.hidden = true;
  activeCallControls.hidden = false;
  document.querySelector("#speakerCall").classList.remove("active");
  callRouteLabel.textContent = "iPhone";
  callStatus.textContent = SpeechRecognition ? "Connected" : "Connected - use keyboard dictation";
  startCallTimer();

  const greeting = `Hi, it's ${getContactName()}. I'm here with you.`;
  speak(greeting);
}

function endFakeCall() {
  callActive = false;
  callConnected = false;
  pendingIncomingCall = false;
  callScreen.hidden = true;
  callScreen.classList.remove("incoming", "calling", "connected");
  callScreen.setAttribute("aria-hidden", "true");
  callStatus.textContent = "Incoming call";
  callTimer.textContent = "00:00";
  callRouteLabel.textContent = "mobile";
  incomingShortcuts.hidden = false;
  incomingControls.hidden = false;
  activeCallControls.hidden = true;
  clearTimeout(incomingTimeout);
  clearInterval(callTimerInterval);
  stopRinging();
  window.speechSynthesis?.cancel();

  if (recognition) {
    recognition.onend = null;
    recognition.abort();
  }
}

function setupRecognition() {
  if (!SpeechRecognition || recognition) {
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onstart = () => {
    callStatus.textContent = "Listening...";
  };

  recognition.onresult = (event) => {
    const text = Array.from(event.results)
      .map((result) => result[0]?.transcript || "")
      .join(" ")
      .trim();
    sendCallMessage(text);
  };

  recognition.onerror = () => {
    callStatus.textContent = "Connected";
  };

  recognition.onend = () => {
    if (callConnected) {
      if (callStatus.textContent === "Listening...") {
        callStatus.textContent = "Connected";
      }
      window.setTimeout(startListening, 500);
    }
  };
}

function startListening() {
  if (!callConnected || !SpeechRecognition || !recognition) {
    return;
  }

  window.speechSynthesis?.cancel();
  try {
    recognition.start();
  } catch (error) {
    // SpeechRecognition throws if it is already active.
  }
}

function speak(text) {
  if (callMuted || !("speechSynthesis" in window)) {
    if (callConnected) {
      startListening();
    }
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.95;
  utterance.onend = () => {
    if (callConnected) {
      startListening();
    }
  };
  window.speechSynthesis.speak(utterance);
}

async function requestMicrophonePermission() {
  if (!navigator.mediaDevices?.getUserMedia || microphoneStream) {
    return;
  }

  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    microphoneStream.getTracks().forEach((track) => track.stop());
  } catch (error) {
    // iOS may require the actual Accept tap; SpeechRecognition will ask again then.
  }
}

function getContactName() {
  return localStorage.getItem(CONTACT_NAME_KEY) || "Dining Agent";
}

function saveContact() {
  const name = agentContactNameInput.value.trim() || "Dining Agent";
  localStorage.setItem(CONTACT_NAME_KEY, name);
  callContactName.textContent = name;
  callAvatar.textContent = initials(name);
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "D";
}

function startCallTimer() {
  clearInterval(callTimerInterval);
  callTimerInterval = window.setInterval(() => {
    const seconds = Math.floor((Date.now() - callStartedAt) / 1000);
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    callTimer.textContent = `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }, 500);
}

function startRinging() {
  stopRinging();
  navigator.vibrate?.([300, 180, 300]);
  playRingTone();
  ringInterval = window.setInterval(playRingTone, 1450);
}

function stopRinging() {
  clearInterval(ringInterval);
  ringInterval = null;
}

function playRingTone() {
  try {
    ringContext = ringContext || new (window.AudioContext || window.webkitAudioContext)();
    ringContext.resume?.();
    playTone(440, 0.16, 0);
    playTone(554, 0.16, 0.2);
  } catch (error) {
    // Some iOS modes block Web Audio; the visual ringing state still works.
  }
}

function playTone(frequency, duration, delay) {
  const oscillator = ringContext.createOscillator();
  const gain = ringContext.createGain();
  const start = ringContext.currentTime + delay;
  oscillator.frequency.value = frequency;
  oscillator.type = "sine";
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.12, start + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ringContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

async function uploadMenu(file) {
  menuPreview.src = URL.createObjectURL(file);
  menuPreview.hidden = false;
  menuStatus.textContent = "Reading menu...";
  setOcrProgress(0);
  setLoading(true);

  try {
    try {
      menuStatus.textContent = "Reading menu with the vision API...";
      const data = await uploadMenuViaServer(file);
      saveStructuredMenu(data);
      menuStatus.textContent = isLocalMode()
        ? `Structured ${data.items_count} items for local AI. Ask me anything.`
        : `Loaded ${data.items_count} items from this menu.`;
      return;
    } catch (serverError) {
      if (!USE_LOCAL_OCR_FALLBACK) {
        throw serverError;
      }

      console.warn("Vision API menu reading failed; using OCR fallback", serverError);
      menuStatus.textContent = "Vision reading had trouble. Trying local OCR...";
    }

    const data = await uploadMenuWithOcrFallback(file);
    saveStructuredMenu(data);
    menuStatus.textContent = isLocalMode()
      ? `Structured ${data.items_count} items for local AI. Ask me anything.`
      : `Loaded ${data.items_count} items from this menu.`;
  } catch (error) {
    console.error("Menu upload failed", error);
    menuStatus.textContent = `${friendlyError(error)} (${error.status || "network"}: ${error.message})`;
  } finally {
    hideOcrProgress();
    setLoading(false);
  }
}

async function uploadMenuWithOcrFallback(file) {
    const tesseract = await loadTesseract();
    if (!tesseract) {
      return uploadMenuViaServer(file);
    }

    const { text, confidence } = await extractMenuText(file, tesseract);
    saveLocalMenuText(text);
    console.debug("OCR text extracted", {
      confidence,
      lines: text.split("\n").filter(Boolean).length,
      text,
    });

    if (confidence < 30) {
      menuStatus.textContent = "The photo was hard to read, but I found some text. Loading it now...";
    } else {
      menuStatus.textContent = "Menu text found. Structuring it...";
    }

    const data = await request("/menu/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, text }),
    }).catch(async (error) => {
      if (error.status === 404 || error.status === 405) {
        menuStatus.textContent = "Text parser is not live yet. Using image fallback...";
        return uploadMenuViaServer(file);
      }
      throw error;
    });

    saveLocalMenuText(text);
    return data;
}

async function findRestaurantFromLocation() {
  if (!navigator.geolocation) {
    menuStatus.textContent = "Location is not available in this browser.";
    return;
  }

  restaurantList.hidden = true;
  restaurantList.innerHTML = "";
  menuStatus.textContent = "Checking restaurants near you...";
  setLoading(true);

  try {
    const position = await getCurrentPosition();
    const accuracy = Math.round(position.coords.accuracy || 0);
    menuStatus.textContent = accuracy
      ? `Location found, accuracy about ${accuracy}m. Checking restaurants...`
      : "Location found. Checking restaurants...";
    const data = await request("/location/restaurants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }),
    });

    renderRestaurants(data.restaurants || []);
  } catch (error) {
    menuStatus.textContent = `${friendlyError(error)} (${error.message || "location"})`;
  } finally {
    setLoading(false);
  }
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000,
    });
  });
}

function renderRestaurants(restaurants) {
  if (!restaurants.length) {
    menuStatus.textContent = "I could not find a nearby restaurant. Photograph the menu instead.";
    return;
  }

  restaurantList.hidden = false;
  restaurantList.innerHTML = "";
  menuStatus.textContent = "Pick the restaurant you're in.";

  restaurants.forEach((restaurant) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "restaurant-option";
    button.innerHTML = `
      <strong>${escapeHtml(restaurant.name)}</strong>
      <span>${restaurant.distance_m}m away${restaurant.cuisine ? ` · ${escapeHtml(restaurant.cuisine)}` : ""}</span>
    `;
    button.addEventListener("click", () => loadOnlineMenu(restaurant));
    restaurantList.appendChild(button);
  });
}

async function loadOnlineMenu(restaurant) {
  menuStatus.textContent = `Looking for ${restaurant.name}'s online menu...`;
  setLoading(true);

  try {
    const data = await request("/location/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, restaurant }),
    });
    if (!data.items_count) {
      const emptyMenuError = new Error("No readable menu items found");
      emptyMenuError.status = 404;
      throw emptyMenuError;
    }

    saveStructuredMenu(data);
    restaurantList.hidden = true;
    menuStatus.textContent = isLocalMode()
      ? `Structured ${data.items_count} items from ${restaurant.name} for local AI.`
      : `Loaded ${data.items_count} items from ${restaurant.name}.`;
  } catch (error) {
    if (error.status === 404) {
      menuStatus.textContent = "I found the restaurant, but not a readable online menu. Photograph the menu instead.";
    } else {
      menuStatus.textContent = `${friendlyError(error)} (${error.status || "network"}: ${error.message})`;
    }
  } finally {
    setLoading(false);
  }
}

async function loadTesseract() {
  if (window.Tesseract) {
    return window.Tesseract;
  }

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  }).catch(() => {});

  return window.Tesseract || null;
}

async function extractMenuText(file, tesseract) {
  const variants = await buildOcrVariants(file);
  const texts = [];
  const confidences = [];

  for (const [index, variant] of variants.entries()) {
    const result = await tesseract.recognize(variant.canvas, "eng+fra", {
      logger: (message) => {
        if (message.status === "recognizing text") {
          const base = index / variants.length;
          const progress = base + ((message.progress || 0) / variants.length);
          const percent = Math.round(progress * 100);
          menuStatus.textContent = `Reading menu... ${percent}%`;
          setOcrProgress(percent);
        }
      },
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: variant.psm,
    });
    texts.push(result.data.text);
    confidences.push(result.data.confidence || 0);
  }

  return {
    text: mergeOcrText(texts),
    confidence: confidences.reduce((sum, value) => sum + value, 0) / Math.max(confidences.length, 1),
  };
}

async function buildOcrVariants(file) {
  const image = await loadImage(file);
  const midpoint = Math.floor(image.width / 2);
  const halfHeight = Math.floor(image.height / 2);
  const overlapX = Math.round(image.width * 0.04);
  const overlapY = Math.round(image.height * 0.06);

  return [
    { canvas: renderOcrCanvas(image, 0, 0, image.width, image.height), psm: "11" },
    { canvas: renderOcrCanvas(image, 0, 0, midpoint + overlapX, image.height), psm: "6" },
    { canvas: renderOcrCanvas(image, Math.max(0, midpoint - overlapX), 0, image.width - midpoint + overlapX, image.height), psm: "6" },
    { canvas: renderOcrCanvas(image, 0, 0, midpoint + overlapX, halfHeight + overlapY), psm: "6" },
    { canvas: renderOcrCanvas(image, 0, Math.max(0, halfHeight - overlapY), midpoint + overlapX, image.height - halfHeight + overlapY), psm: "6" },
    { canvas: renderOcrCanvas(image, Math.max(0, midpoint - overlapX), 0, image.width - midpoint + overlapX, halfHeight + overlapY), psm: "6" },
    { canvas: renderOcrCanvas(image, Math.max(0, midpoint - overlapX), Math.max(0, halfHeight - overlapY), image.width - midpoint + overlapX, image.height - halfHeight + overlapY), psm: "6" },
  ];
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

function renderOcrCanvas(image, sourceX, sourceY, sourceWidth, sourceHeight) {
  const scale = Math.max(2.5, Math.min(5, 2600 / Math.max(sourceWidth, sourceHeight)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);

  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const gray = (data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114);
    const contrasted = Math.max(0, Math.min(255, ((gray - 128) * 1.45) + 128));
    const value = contrasted > 205 ? 255 : contrasted < 115 ? 0 : contrasted;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function mergeOcrText(texts) {
  const seen = new Set();
  const lines = [];

  for (const text of texts) {
    for (const line of text.split("\n")) {
      const cleaned = line.replace(/\s+/g, " ").trim();
      const key = cleaned.toLowerCase().replace(/[^a-z0-9$€£.]+/g, "");
      if (!cleaned || seen.has(key)) {
        continue;
      }
      seen.add(key);
      lines.push(cleaned);
    }
  }

  return lines.join("\n");
}

async function uploadMenuViaServer(file) {
  const formData = new FormData();
  formData.append("session_id", sessionId);
  formData.append("image", file);

  const data = await request("/menu", {
    method: "POST",
    body: formData,
  });
  return data;
}

function setOcrProgress(percent) {
  ocrProgress.hidden = false;
  ocrProgressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function hideOcrProgress() {
  ocrProgress.hidden = true;
  ocrProgressBar.style.width = "0%";
}

async function suggestMeal(occasion, numCourses) {
  setLoading(true);

  try {
    if (isLocalMode()) {
      const response = await localChat(
        `Build me a ${Number(numCourses)} course meal for ${occasion}. Give each course and a short reason.`,
      );
      appendMessage("agent", response);
      return;
    }

    const meal = await request("/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        occasion,
        num_courses: Number(numCourses),
      }),
    });

    appendMessage("agent", formatMeal(meal));
  } catch (error) {
    appendError(isLocalMode() ? error.message : friendlyError(error));
  } finally {
    setLoading(false);
  }
}

function formatMeal(meal) {
  const courses = meal.courses
    .map((course, index) => (
      `${index + 1}. ${course.name} (${course.section}, ${course.price})\n${course.reasoning}`
    ))
    .join("\n\n");

  return `${courses}\n\nHow it flows: ${meal.overall_notes}\n\nWine: ${meal.wine_suggestion.style}\n${meal.wine_suggestion.reasoning}`;
}

async function loadProfile() {
  profileContent.textContent = "Loading...";

  try {
    const profile = await request(`/profile/${sessionId}`);
    profileContent.innerHTML = profileHtml(profile);
  } catch (error) {
    profileContent.textContent = friendlyError(error);
  }
}

function profileHtml(profile) {
  return [
    profileGroup("Liked", profile.liked, "item"),
    profileGroup("Disliked", profile.disliked, "item"),
    profileGroup("Notes", profile.notes, "text"),
  ].join("");
}

function profileGroup(title, items, key) {
  const content = items.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item[key])}</li>`).join("")}</ul>`
    : "<p>Nothing yet.</p>";

  return `<section class="profile-group"><h3>${title}</h3>${content}</section>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function clearMemory() {
  setLoading(true);

  try {
    await request(`/profile/${sessionId}`, { method: "DELETE" });
    await loadProfile();
    appendMessage("agent", "Memory cleared.");
  } catch (error) {
    appendError(friendlyError(error));
  } finally {
    setLoading(false);
  }
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();

  if (!text) {
    return;
  }

  chatInput.value = "";
  sendMessage(text);
});

cameraButton.addEventListener("click", () => menuImage.click());
locationButton.addEventListener("click", findRestaurantFromLocation);

menuImage.addEventListener("change", () => {
  const file = menuImage.files[0];

  if (file) {
    uploadMenu(file);
  }
});

document.querySelector("#openProfile").addEventListener("click", () => {
  userIdInput.value = getUserId();
  agentContactNameInput.value = getContactName();
  profilePanel.classList.add("open");
  profilePanel.setAttribute("aria-hidden", "false");
  loadProfile();
});

document.querySelector("#closeProfile").addEventListener("click", () => {
  profilePanel.classList.remove("open");
  profilePanel.setAttribute("aria-hidden", "true");
});

document.querySelector("#clearMemory").addEventListener("click", clearMemory);
saveContactName.addEventListener("click", saveContact);
saveUserIdButton.addEventListener("click", async () => {
  setUserId(userIdInput.value);
  await loadProfile();
  menuStatus.textContent = `Using memory for ${getUserId() || "this user"}.`;
});
providerToggle.addEventListener("click", () => {
  setProviderMode(isLocalMode() ? "cloud" : "local");
});

document.querySelector("#newSession").addEventListener("click", () => {
  localStorage.removeItem(userStorageKey(LOCAL_MENU_TEXT_KEY));
  localStorage.removeItem(userStorageKey(LOCAL_MENU_DATA_KEY));
  window.location.reload();
});

document.querySelector("#openSuggest").addEventListener("click", () => {
  suggestModal.hidden = false;
});

document.querySelector("#closeSuggest").addEventListener("click", () => {
  suggestModal.hidden = true;
});

suggestForm.addEventListener("submit", (event) => {
  event.preventDefault();
  suggestModal.hidden = true;
  suggestMeal(
    document.querySelector("#occasionInput").value.trim() || "casual dinner",
    document.querySelector("#coursesInput").value || 3,
  );
});

document.querySelector("#openCall").addEventListener("click", openFakeCall);
document.querySelector("#endCall").addEventListener("click", endFakeCall);
document.querySelector("#declineCall").addEventListener("click", endFakeCall);
document.querySelector("#acceptCall").addEventListener("click", connectFakeCall);
document.querySelector("#muteCall").addEventListener("click", () => {
  callMuted = !callMuted;
  document.querySelector("#muteCall").classList.toggle("active", callMuted);
  if (callMuted) {
    window.speechSynthesis?.cancel();
  }
});
document.querySelector("#speakerCall").addEventListener("click", () => {
  speakerEnabled = !speakerEnabled;
  document.querySelector("#speakerCall").classList.toggle("active", speakerEnabled);
  callRouteLabel.textContent = speakerEnabled ? "speaker" : "iPhone";
});
document.querySelector("#keypadCall").addEventListener("click", () => {
  document.querySelector("#keypadCall").classList.toggle("active");
});
document.querySelector("#contactsCall").addEventListener("click", () => {
  document.querySelector("#contactsCall").classList.toggle("active");
});

agentContactNameInput.value = getContactName();
userIdInput.value = getUserId();
callContactName.textContent = getContactName();
callAvatar.textContent = initials(getContactName());
menuStatus.textContent = "";
updateProviderToggle();
localModelStatus.textContent = "";
updateMenuPanelVisibility();
new MutationObserver(updateMenuPanelVisibility).observe(menuPanel, {
  attributes: true,
  childList: true,
  characterData: true,
  subtree: true,
});
requestMicrophonePermission();
