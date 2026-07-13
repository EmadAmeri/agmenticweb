const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const WORKER_URL = "https://compass-form-worker.em-ameri94.workers.dev";

function initLoadSequence() {
  const items = Array.from(document.querySelectorAll("[data-load-step]"));

  if (!items.length) {
    return;
  }

  if (prefersReducedMotion.matches) {
    items.forEach((item) => item.classList.add("is-loaded"));
    return;
  }

  requestAnimationFrame(() => {
    items.forEach((item, index) => {
      window.setTimeout(() => {
        item.classList.add("is-loaded");
      }, index * 80);
    });
  });
}

function scrollToHash(hash) {
  const target = document.querySelector(hash);

  if (!target) {
    return;
  }

  target.scrollIntoView({
    behavior: prefersReducedMotion.matches ? "auto" : "smooth",
    block: "start"
  });
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const hash = link.getAttribute("href");

    if (!hash || hash === "#") {
      return;
    }

    event.preventDefault();
    scrollToHash(hash);
    history.pushState(null, "", hash);
  });
});

function initLayerScan() {
  const instrument = document.querySelector("[data-layer-scan]");

  if (!instrument) {
    return;
  }

  const svg = instrument.querySelector("svg");
  const beam = instrument.querySelector(".scan-line__beam");
  const point = instrument.querySelector(".scan-line__point");
  const layers = Array.from(instrument.querySelectorAll("[data-layer]")).map((layer) => {
    const y = Number(layer.dataset.y);

    return {
      element: layer,
      center: y + 27
    };
  });

  if (!svg || !beam || !point || !layers.length) {
    return;
  }

  const minY = layers[0].center;
  const maxY = layers[layers.length - 1].center;
  const rangeY = maxY - minY;
  let currentY = minY;
  let targetY = minY;
  let cursorControlled = false;
  let animationFrame = null;

  function setScanLine(y) {
    beam.setAttribute("y1", y);
    beam.setAttribute("y2", y);
    point.setAttribute("cy", y);
  }

  function updateActiveLayer(y) {
    layers.forEach((layer) => {
      layer.element.classList.toggle("is-active", Math.abs(y - layer.center) < 28);
    });
  }

  function setStaticState() {
    layers.forEach((layer) => layer.element.classList.add("is-active"));
    setScanLine((minY + maxY) / 2);
  }

  if (prefersReducedMotion.matches) {
    setStaticState();
    return;
  }

  if (window.matchMedia("(pointer: fine)").matches) {
    const pointInSvg = svg.createSVGPoint();

    svg.addEventListener("pointermove", (event) => {
      const matrix = svg.getScreenCTM();

      if (!matrix) {
        return;
      }

      pointInSvg.x = event.clientX;
      pointInSvg.y = event.clientY;

      const svgPoint = pointInSvg.matrixTransform(matrix.inverse());
      targetY = Math.min(maxY, Math.max(minY, svgPoint.y));
      cursorControlled = true;
    });

    svg.addEventListener("pointerleave", () => {
      cursorControlled = false;
    });
  }

  function animate(time) {
    if (!cursorControlled) {
      targetY = minY + ((Math.sin(time / 1800) + 1) / 2) * rangeY;
    }

    currentY += (targetY - currentY) * 0.075;
    setScanLine(currentY);
    updateActiveLayer(currentY);
    animationFrame = requestAnimationFrame(animate);
  }

  animationFrame = requestAnimationFrame(animate);

  prefersReducedMotion.addEventListener("change", (event) => {
    if (!event.matches) {
      return;
    }

    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }

    setStaticState();
  });
}

initLayerScan();

function initScrollReveals() {
  const rows = Array.from(document.querySelectorAll("[data-reveal-row]"));
  const sections = Array.from(document.querySelectorAll("[data-reveal-section]"));
  const revealItems = [...sections, ...rows];

  if (!revealItems.length) {
    return;
  }

  if (prefersReducedMotion.matches || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, {
    rootMargin: "0px 0px -12% 0px",
    threshold: 0.15
  });

  revealItems.forEach((item) => observer.observe(item));

  prefersReducedMotion.addEventListener("change", (event) => {
    if (!event.matches) {
      return;
    }

    observer.disconnect();
    revealItems.forEach((item) => item.classList.add("is-visible"));
  });
}

initLoadSequence();
initScrollReveals();

function initBookingForm() {
  const form = document.querySelector("[data-booking-form]");

  if (!form) {
    return;
  }

  const submitButton = form.querySelector("button[type='submit']");
  const errorMessage = form.querySelector("[data-form-error]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (errorMessage) {
      errorMessage.hidden = true;
    }

    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      const formData = new FormData(form);
      const payload = {
        name: formData.get("name") || "",
        company: formData.get("company") || "",
        email: formData.get("email") || "",
        message: formData.get("message") || "",
        website: formData.get("website") || ""
      };
      const response = await fetch(WORKER_URL, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error("Form submission failed");
      }

      const confirmation = document.createElement("p");
      confirmation.className = "booking-confirmation";
      confirmation.textContent = "Got it. We'll reply within a day — usually faster.";
      form.replaceWith(confirmation);
    } catch (error) {
      if (errorMessage) {
        errorMessage.hidden = false;
      }

      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

initBookingForm();
