# Daily Flowers Boekhouddashboard

Interne boekhoud- en controletool voor Daily Flowers met:

- omzetmonitoring per kanaal en AFS-machine
- Shopify order backfill/sync
- Mollie/AFS transacties en aansluiting
- W&V en grootboekimports
- btw-export

## Railway deploy

Deze repo is ingericht voor een single-service Railway deployment:

1. Maak in Railway een nieuw project vanaf deze GitHub-repo.
2. Voeg een Railway PostgreSQL database toe.
3. Zet de webservice environment variables.
4. Deploy. De start command draait eerst migrations en start daarna de app/API.

Belangrijkste variables:

```env
LOCAL_DATABASE_URL=${{Postgres.DATABASE_URL}}
LOCAL_JWT_SECRET=replace-with-a-long-random-secret
LOCAL_TOKEN_TTL_SECONDS=604800
LOCAL_ADMIN_EMAIL=admin@example.com
LOCAL_ADMIN_PASSWORD=replace-with-a-strong-password

SHOPIFY_API_VERSION=2026-04
SHOPIFY_SYNC_DAYS=60
SHOPIFY_WEBHOOK_SECRET=replace-me

MOLLIE_API_KEY=replace-me
MOLLIE_SYNC_FROM=2026-01-01T00:00:00Z
MOLLIE_INCREMENTAL_OVERLAP_HOURS=72
MOLLIE_INITIAL_LOOKBACK_DAYS=7
MOLLIE_FETCH_TIMEOUT_MS=30000
```

Zet secrets alleen in Railway variables, nooit in de repo. Op Railway zijn
`LOCAL_ADMIN_EMAIL` en `LOCAL_ADMIN_PASSWORD` verplicht; lokaal wordt zonder
deze variables automatisch de dev-login hieronder aangemaakt.

De app gebruikt dezelfde Railway service voor frontend en API. Webhookpaden:

- Shopify: `/functions/v1/shopify-webhook`
- Mollie: `/functions/v1/mollie-webhook`
- Handmatige sweep: `/functions/v1/daily-sweep`

## Lokaal draaien

```bash
npm install
npm run local:db
npm run local:api
npm run dev
```

Dev login:

```text
admin@dailyflowers.local / dailyflowers
```
