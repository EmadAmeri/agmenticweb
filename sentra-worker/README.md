# Sentra Demo Access Worker

Cloudflare Worker for the static Sentra site. It validates the submitted email server-side with three layers: format checks, MX lookup, and Abstract Email Validation. After a successful check it stores the request in Google Sheets through a Google Apps Script webhook, sends an internal notification through Resend, and returns the direct demo link to the browser.

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
- `ABSTRACT_API_KEY`: Abstract Email Validation / Email Reputation API key
- `SENTRA_FROM_EMAIL`: recommended `sentra@agmentic.com`
- `SENTRA_DEMO_LINK`: direct demo link to open after a successful verification, currently `https://agmentic.com/sentra/events/demo/`
- `SENTRA_NOTIFY_EMAIL`: internal notification inbox, currently `em.ameri94@gmail.com`
- `ALLOWED_ORIGIN`: optional, defaults to `https://agmentic.com`
- `GOOGLE_SHEETS_WEBHOOK_URL`: deployed Google Apps Script web app URL
- `GOOGLE_SHEETS_WEBHOOK_TOKEN`: shared secret posted to the Apps Script webhook body

## Resend setup

1. Add the `agmentic.com` domain in Resend.
2. Copy the DNS records Resend gives you.
3. Add the SPF, DKIM, and DMARC records in Cloudflare DNS.
4. Keep Cloudflare Email Routing for inbound mail only; it does not replace outbound authentication.

## Google Sheet storage

Use the Apps Script file at `google-apps-script/demo-requests.gs`.

Recommended setup:

1. Create a Google Sheet that will hold demo requests.
2. Open `Extensions -> Apps Script`.
3. Paste in `google-apps-script/demo-requests.gs`.
4. In `Project Settings -> Script Properties`, add:
   - `SHEET_ID`: the ID of your target Google Sheet
   - `WEBHOOK_TOKEN`: a long random secret shared with the worker
5. Deploy the script as a Web App:
   - Execute as: `Me`
   - Who has access: `Anyone`
6. Copy the deployed `/exec` URL into `GOOGLE_SHEETS_WEBHOOK_URL`.

The webhook appends each verified request as a new row and uses `LockService` to reduce write collisions.

## Verification flow

1. Local email format validation
2. MX lookup through DNS
3. Abstract Email Validation API
4. Google Sheet append
5. Internal notification email
6. Return demo link to the frontend

The request is blocked if validation fails or if Google Sheet storage fails. Notification email failures are logged, but they do not block the user once the request is safely stored in the sheet.

## Deploy

```bash
cd /Users/apple/Documents/Agmentic/agmenticweb/sentra-worker
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put GROQ_MODEL
npx wrangler secret put ABSTRACT_API_KEY
npx wrangler secret put SENTRA_FROM_EMAIL
npx wrangler secret put SENTRA_DEMO_LINK
npx wrangler secret put SENTRA_NOTIFY_EMAIL
npx wrangler secret put GOOGLE_SHEETS_WEBHOOK_URL
npx wrangler secret put GOOGLE_SHEETS_WEBHOOK_TOKEN
npx wrangler deploy
```
