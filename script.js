const revealTargets = document.querySelectorAll(
  ".hero-copy, .hero-panel, .logo-band, .section-heading, .manifesto-card, .flow-card, .closing-panel, .site-footer"
);

revealTargets.forEach((element) => {
  element.setAttribute("data-reveal", "");
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.14,
  }
);

revealTargets.forEach((element) => {
  observer.observe(element);
});
