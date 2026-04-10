# HORNBACH Orchestration Worker

Cloudflare Worker dedicated to the HORNBACH orchestration demo.

This worker is intentionally separate from `sentra-worker` so the two demos do
not share routes or application logic.

## Route

- `https://agmentic.com/api/hornbach-orchestrate`

## Secrets

Set these in Cloudflare Workers:

- `GROQ_API_KEY`
- `GROQ_MODEL` optional, recommended: `groq/compound-mini`
- `ALLOWED_ORIGIN` optional, default: `https://agmentic.com`

## Deploy

```bash
cd /Users/apple/Documents/Agmentic/agmenticweb/hornbach-worker
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put GROQ_MODEL
npx wrangler deploy
```
