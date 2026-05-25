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
- `POST /api/agents/consumer`
- `POST /api/connections`
- `GET /api/connections/{connection_id}/events`

GitHub Pages cannot run this Python backend directly. Deploy this folder to a Python-capable host, then set `localStorage.agmentic_agent_handshake_api_base` in the browser to the hosted API origin.
