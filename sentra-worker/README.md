# Sentra Demo Access Worker

Cloudflare Worker for the static Sentra site. It receives a work email from the demo-access modal and sends branded emails through Resend without exposing the API key in frontend code.

## Route

- `https://agmentic.com/api/sentra-demo-access`
- `https://www.agmentic.com/api/sentra-demo-access`
- `https://agmentic.com/api/sentra-chat`
- `https://www.agmentic.com/api/sentra-chat`

## Secrets / Vars

Set these in Cloudflare Workers:

- `RESEND_API_KEY`: Resend API key
- `GROQ_API_KEY`: Groq API key for chat responses
- `GROQ_MODEL`: optional, defaults to `groq/compound-mini`
- `SENTRA_FROM_EMAIL`: recommended `sentra@agmentic.com`
- `SENTRA_DEMO_LINK`: direct demo link to include in the email, currently `https://agmentic.com/chatbot/`
- `SENTRA_NOTIFY_EMAIL`: internal notification inbox, currently `em.ameri94@gmail.com`
- `ALLOWED_ORIGIN`: optional, defaults to `https://agmentic.com`

## Resend setup

1. Add the `agmentic.com` domain in Resend.
2. Copy the DNS records Resend gives you.
3. Add the SPF, DKIM, and DMARC records in Cloudflare DNS.
4. Keep Cloudflare Email Routing for inbound mail only; it does not replace outbound authentication.

## Deploy

```bash
cd /Users/apple/Documents/Agmentic/agmenticweb/sentra-worker
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put GROQ_MODEL
npx wrangler secret put SENTRA_FROM_EMAIL
npx wrangler secret put SENTRA_DEMO_LINK
npx wrangler secret put SENTRA_NOTIFY_EMAIL
npx wrangler deploy
```
