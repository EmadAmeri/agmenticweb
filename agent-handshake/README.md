# Agmentic Agent Handshake

GitHub Pages frontend for a live consumer-agent and retailer-agent interaction.

It shows:

- proximity handshake between consumer and retailer agents
- retailer menu and offer transfer
- consumer counter-request
- accepted negotiation terms
- the same stream in agent protocol language and plain English

The page first tries to connect to the real FastAPI backend:

- `POST /api/agents/retailer`
- `POST /api/agents/consumer`
- `POST /api/connections`
- `GET /api/connections/{connection_id}/events`

On GitHub Pages, where Python does not run, it automatically keeps the page live with a browser fallback. To point the page at a hosted backend, set:

```js
localStorage.setItem("agmentic_agent_handshake_api_base", "https://your-api-host.example")
```
