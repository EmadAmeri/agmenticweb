# Retailer Dining Agent Dashboard

Static retailer-side dashboard for the Agmentic dining flow.

It lets a retailer:

- paste or load a raw fine-dining menu
- normalize it into a standard agent exchange schema
- expose a location-based handshake payload for a consumer agent
- enable marketing promotions
- define negotiation rules and promotion guardrails

Open `index.html` directly or serve the folder through GitHub Pages.

Backend contract stubs are shown in the dashboard under **Backend Contract**:

- `POST /agent/handshake`
- `POST /agent/negotiate`

The frontend currently runs fully in-browser and stores drafts in `localStorage`.
