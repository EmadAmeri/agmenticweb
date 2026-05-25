# Retailer Dining Agent Dashboard

Static retailer-side dashboard for the Agmentic dining flow.

It lets a retailer:

- paste or load a raw fine-dining menu
- normalize it into a standard agent exchange schema
- enable marketing promotions
- define negotiation rules and promotion guardrails
- discover nearby consumer agents by radius
- generate marketing-led negotiation offers

Open `index.html` directly or serve the folder through GitHub Pages.

The frontend calls these API paths when a backend is available:

- `POST /retailer/menu/standardize`
- `POST /retailer/agents/nearby`
- `POST /retailer/negotiate`

Set `localStorage.agmentic_retailer_api_base` to point at a local backend, or use the default production API host. If the API is offline, the dashboard falls back to local simulation so menu, promotions, nearby agents, and offers can still be tested.
