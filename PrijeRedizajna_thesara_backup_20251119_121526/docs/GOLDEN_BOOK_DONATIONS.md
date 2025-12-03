# Golden Book Donations

## Stripe setup

- Create a dedicated Payment Link/Checkout Session for the Golden Book donation price (`GOLDEN_BOOK_PRICE_ID`) so we can detect it via Stripe webhooks.
- Configure the success redirect to `https://<domain>/donate/thank-you?pi={CHECKOUT_SESSION_ID}` (or `{CHECKOUT_SESSION:PAYMENT_INTENT}` if available) so donors land on our thank-you page.
- Keep metadata minimal—alias is collected by our form instead of Stripe billing details.

## API configuration (`apps/api/.env`)

```
GOLDEN_BOOK_ENABLED=true
GOLDEN_BOOK_PRICE_ID=price_xxx
GOLDEN_BOOK_PRODUCT_ID=prod_xxx
GOLDEN_BOOK_PAYMENT_LINK=https://buy.stripe.com/...
GOLDEN_BOOK_CAMPAIGN_ID=goldenbook-2024-q4
GOLDEN_BOOK_CAMPAIGN_START_MS=0        # optional window (ms since epoch)
GOLDEN_BOOK_CAMPAIGN_END_MS=0
GOLDEN_BOOK_ALIAS_GRACE_MS=86400000    # fallback to anonymous after 24h
```

- `GOLDEN_BOOK_ENABLED` gates detection inside the Stripe webhook.
- `*_PRICE_ID` / `*_PRODUCT_ID` identify donation line items; `PAYMENT_LINK` is used on the frontend CTA.
- Campaign window is optional (0 = always open); we still keep every donation for historical Golden Book view.

## Backend behaviour

- `checkout.session.completed` grabs `line_items` and, if any match the configured price/product, we persist a donation record in Firestore (`donations/{paymentIntentId}`) with amount/currency/email + `aliasStatus='pending'`.
- `POST /donations/alias` (or `/api/donations/alias`) accepts `{ paymentIntentId, alias }`, sanitises the alias and updates the record. Empty alias => `Anonimni Donator`.
- `GET /donations` (or `/api/donations`) returns a public-safe list (alias + timestamp + campaignId, no amounts).

## Frontend flow

1. CTA button opens `GOLDEN_BOOK_PAYMENT_LINK` while campaign is active; otherwise show “coming soon”.
2. Thank-you page reads `paymentIntentId` from the Stripe redirect query param and calls `POST /api/donations/alias`.
3. The Golden Book page consumes `GET /api/donations` to render the permanent list (90-day window only restricts new entries, not display).

This keeps donors in control of their published alias while still leveraging Stripe’s hosted payments and webhook reliability.
