# Agmentic Homepage Leads

Independent lead capture service for the Agmentic homepage.

## Reliability model

1. The HTTP request is accepted only after the lead and two outbox rows are stored in D1.
2. Email and Google Sheet delivery are processed asynchronously through Cloudflare Queues.
3. Queue retries use a DLQ after ten failures.
4. A five-minute Cron reconciles pending or stale outbox rows.
5. D1 is the source of truth; Google Sheets is an operational mirror.

## Secrets

- `SHEETS_WEBHOOK_URL`: dedicated Apps Script web-app URL.
- `SHEETS_WEBHOOK_TOKEN`: random token stored in both Worker secrets and Apps Script properties.
- `BREVO_API_KEY`: Brevo API key stored only as a Cloudflare Worker secret.

Brevo's free transactional email API handles customer email from the Worker, so Cloudflare Workers Paid Email Sending is not required. The sending domain must be authenticated in Brevo before `CUSTOMER_EMAILS_ENABLED` can be changed to `true`.

## Customer email safety

- `CUSTOMER_EMAILS_ENABLED` is `false` by default. No welcome email is queued or sent in this state.
- Enabling it affects only brand-new homepage registrations. Existing leads are never backfilled automatically.
- Welcome messages use `hello@agmentic.com`; event invitations use `event@agmentic.com`.
- `event@agmentic.com` also routes incoming replies to the verified Agmentic operations inbox.
- Keep the event invitation template manual until consent, unsubscribe handling, and the selected event registration URL are confirmed.

## Lead identity

The unique key is normalized email + source + campaign. Repeated submissions in one campaign increment `duplicate_count`; the same email can register for a different campaign.
