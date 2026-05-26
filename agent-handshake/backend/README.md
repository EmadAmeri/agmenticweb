# Agent Handshake Backend

FastAPI backend for the real retailer-agent and consumer-agent connection.

## Run Locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8010
```

The frontend uses these endpoints:

- `POST /api/agents/retailer`
- `POST /api/consumer-memory/{session_id}`
- `POST /api/agents/consumer`
- `POST /api/connections`
- `GET /api/connections/{connection_id}/events`

Consumer memory is loaded from `fine_dining_agent/memory/user_data_<session>.json` when the backend is deployed beside the existing consumer agent project. The negotiation also writes a short result note back to that same memory profile.

GitHub Pages cannot run this Python backend directly. Deploy this folder to a Python-capable host, then set `localStorage.agmentic_agent_handshake_api_base` in the browser to the hosted API origin.
