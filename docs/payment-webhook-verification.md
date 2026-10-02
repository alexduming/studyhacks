# Payment webhook verification

The browser callback and Stripe webhook share a locked order transaction. Order status, membership, credits, and commission commit together. Renewal processing locks the subscription and deduplicates by provider and invoice ID. Failed transactions can be retried; paid orders cannot be downgraded by delayed callbacks.

The Stripe endpoint requires `STRIPE_SIGNING_SECRET` and the unmodified request body. Invalid or stale signatures return 400. Authenticated events outside the supported handlers return 200 without fulfillment. Enable `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.payment_succeeded`, and `customer.subscription.deleted` using API version `2025-08-27.basil`.

## Offline regression suite

Install the regular repository dependencies first. The optional test database can be installed separately without adding a production dependency:

```powershell
npm install --prefix "$env:TEMP/studyhacks-payment-tests" --ignore-scripts --no-package-lock @electric-sql/pglite@0.5.8
$env:NODE_PATH = "$env:TEMP/studyhacks-payment-tests/node_modules"
node --test scripts/test-payment-webhook.cjs
```

The suite uses actual Drizzle models, the Stripe signature verifier, and an isolated PGlite PostgreSQL database. It never loads application environment files. Database access and Stripe subscription retrieval are replaced with local fixtures. Concurrent promises exercise stale reads and duplicate processing on PGlite's single connection; this is not a multi-connection database stress test.

Covered cases: duplicate checkout events, browser/webhook overlap, commission failure and atomic rollback, async payments, paid-order downgrade prevention, mismatched checkout details, invalid/stale signatures, ignored events, renewal invoice duplication, initial invoice exclusion, delayed invoice periods, missing invoice identifiers, repeated cancellation, and repeated yearly upgrades.

## Production checks

Deploy the code and signing secret before enabling the payment events. Check that an unsigned notification returns 400 and a correctly signed ignored event returns 200. Stripe delivery may be verified with an unpaid checkout expiration event; do not fabricate a successful payment against production. Actual payment settlement is outside these nonpayment checks.

No database migration is required. Do not roll back to a version without duplicate-processing protection while live webhook delivery remains enabled.
