# Agmentic Guided Showcase

A single-page, sandboxed product showcase for sharing by link. It keeps the Fine Dining Agent experience interactive while enforcing limited use through the live Fine Dining API.

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

## Live capabilities and boundaries

- Two chat questions are answered by the configured Cloudflare LLM.
- One browser-permissioned location lookup returns up to three nearby restaurants.
- The preset menu prices, budget, party size, likes, and dislikes are editable within validated ranges.
- Two deterministic retailer handshakes use the current live state and can produce different offers.
- Calendar, weather, call, availability, and reservation are explicitly simulated.
- Session quotas and menu boundaries are enforced by `api-dining.agmentic.com`, not only by the browser.
- No payment or real booking is attempted.
