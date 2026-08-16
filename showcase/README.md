# Agmentic Guided Showcase

A self-contained, single-page concept demo for sharing by link. It uses curated scenarios and deterministic browser-side negotiation logic, so it does not require an AI provider, database, calendar account, restaurant integration, or backend to run.

## Preview locally

From the workspace root:

```bash
python3 -m http.server 8090
```

Open:

```text
http://localhost:8090/showcase-demo/
```

## Publish

The directory is self-contained. Deploy it as-is. The public entry point is `index.html`, and these assets live under `assets/`:

- `assets/agmentic-mark.png`
- `assets/hero-left.jpg`
- `assets/mascot.png`

## Showcase boundaries

- Calendar, weather, location, call, availability, and reservation are explicitly simulated.
- Menu/policy matching, derived signal handling, budget checks, event generation, and outcome selection are working deterministic logic.
- No personal data leaves the browser.
- No payment or real booking is attempted.
