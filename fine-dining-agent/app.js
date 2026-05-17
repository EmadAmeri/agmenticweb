const API_BASE = "https://api-dining.agmentic.com";

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
let lastErrorMessage = "";

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
    const error = new Error(response.statusText);
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

async function uploadMenu(file) {
  const formData = new FormData();
  formData.append("session_id", sessionId);
  formData.append("image", file);

  menuPreview.src = URL.createObjectURL(file);
  menuPreview.hidden = false;
  menuStatus.textContent = "Reading the menu...";
  setLoading(true);

  try {
    const data = await request("/menu", {
      method: "POST",
      body: formData,
    });
    menuStatus.textContent = `Loaded ${data.items_count} items from this ${data.restaurant_type} menu.`;
  } catch (error) {
    menuStatus.textContent = friendlyError(error);
  } finally {
    setLoading(false);
  }
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
  profilePanel.classList.add("open");
  profilePanel.setAttribute("aria-hidden", "false");
  loadProfile();
});

document.querySelector("#closeProfile").addEventListener("click", () => {
  profilePanel.classList.remove("open");
  profilePanel.setAttribute("aria-hidden", "true");
});

document.querySelector("#clearMemory").addEventListener("click", clearMemory);

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

menuStatus.textContent = "Send me the menu when you're ready.";
