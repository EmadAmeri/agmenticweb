const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? window.location.origin
  : "https://api-dining.agmentic.com";

const sessionId = getSessionId();
const conversation = document.querySelector("#conversation");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const cameraButton = document.querySelector("#cameraButton");
const menuImage = document.querySelector("#menuImage");
const menuPreview = document.querySelector("#menuPreview");
const menuStatus = document.querySelector("#menuStatus");
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
const incomingControls = document.querySelector("#incomingControls");
const activeCallControls = document.querySelector("#activeCallControls");
const agentContactNameInput = document.querySelector("#agentContactName");
const saveContactName = document.querySelector("#saveContactName");
const USE_LOCAL_OCR = true;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const CONTACT_NAME_KEY = "dining_agent_contact_name";
let lastErrorMessage = "";
let recognition = null;
let callActive = false;
let callConnected = false;
let callMuted = false;
let pendingIncomingCall = false;
let ringInterval = null;
let ringContext = null;
let incomingTimeout = null;
let callTimerInterval = null;
let callStartedAt = null;
let microphoneStream = null;

function getSessionId() {
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

function setLoading(isLoading) {
  loader.hidden = !isLoading;
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

async function sendMessage(text) {
  appendMessage("user", text);
  setLoading(true);

  try {
    const data = await request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, message: text }),
    });
    appendMessage("agent", data.response);
  } catch (error) {
    appendError(friendlyError(error));
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
    const data = await request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, message: trimmed }),
    });
    appendMessage("agent", data.response);
    speak(data.response);
    callStatus.textContent = "Connected";
  } catch (error) {
    const message = friendlyError(error);
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
  pendingIncomingCall = false;
  callScreen.hidden = false;
  callScreen.classList.add("incoming");
  callScreen.classList.remove("calling", "connected");
  callScreen.setAttribute("aria-hidden", "false");
  callContactName.textContent = getContactName();
  callAvatar.textContent = initials(getContactName());
  callStatus.textContent = "Incoming call";
  callTimer.textContent = "00:00";
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
  incomingControls.hidden = true;
  activeCallControls.hidden = false;
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
    if (!USE_LOCAL_OCR) {
      await uploadMenuViaServer(file);
      return;
    }

    const tesseract = await loadTesseract();
    if (!tesseract) {
      await uploadMenuViaServer(file);
      return;
    }

    const { text, confidence } = await extractMenuText(file, tesseract);
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
    menuStatus.textContent = `Loaded ${data.items_count} items from this menu.`;
  } catch (error) {
    console.error("Menu upload failed", error);
    menuStatus.textContent = `${friendlyError(error)} (${error.status || "network"}: ${error.message})`;
  } finally {
    hideOcrProgress();
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
    appendError(friendlyError(error));
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

menuImage.addEventListener("change", () => {
  const file = menuImage.files[0];

  if (file) {
    uploadMenu(file);
  }
});

document.querySelector("#openProfile").addEventListener("click", () => {
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

document.querySelector("#newSession").addEventListener("click", () => {
  localStorage.removeItem("dining_session_id");
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
  document.querySelector("#speakerCall").classList.toggle("active");
});
document.querySelector("#keypadCall").addEventListener("click", () => {
  document.querySelector("#keypadCall").classList.toggle("active");
});
document.querySelector("#contactsCall").addEventListener("click", () => {
  document.querySelector("#contactsCall").classList.toggle("active");
});

agentContactNameInput.value = getContactName();
callContactName.textContent = getContactName();
callAvatar.textContent = initials(getContactName());
menuStatus.textContent = "Send me the menu when you're ready.";
requestMicrophonePermission();
