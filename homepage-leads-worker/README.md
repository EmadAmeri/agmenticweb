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

Cloudflare Email Service requires direct verified destination addresses. `hello@agmentic.com` remains the public contact address, while notification delivery must list the two verified personal destinations in the email binding.

## Lead identity

The unique key is normalized email + source + campaign. Repeated submissions in one campaign increment `duplicate_count`; the same email can register for a different campaign.
