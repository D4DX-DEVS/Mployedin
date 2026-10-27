# mployedin-data Worker

The app's gateway to **D1** (logs) and **Vectorize** (embeddings). The app calls it with HMAC-signed requests through `src/lib/cloudflare/dataWorkerClient.ts`. Endpoints are listed at the top of `src/index.ts`. Plan and reasoning: `docs/CLOUDFLARE-STORAGE-MIGRATION-PLAN.md`.

## One-time setup

Run from this folder, with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the environment (or `npx wrangler login`). The token needs **Workers Scripts: Edit, D1: Edit, Vectorize: Edit, Workers R2 Storage: Edit**.

```bash
npm install

# 1. D1: the existing `mployedin` database holds every log table.
#    Put its id (D1_DATABASE_ID in the app .env) into wrangler.toml, then:
npm run migrate:remote

# 2. Vectorize: two 1024-dim cosine indexes, one vector per job / per seeker
#    (the app's matchEmbedding). The app filters results in Mongo, so no
#    metadata indexes are needed.
npx wrangler vectorize create jobs-1024    --dimensions=1024 --metric=cosine
npx wrangler vectorize create seekers-1024 --dimensions=1024 --metric=cosine
# Admin semantic search (each seeker's search vector, cut to 768):
npx wrangler vectorize create seeker-search-768 --dimensions=768 --metric=cosine

# 3. R2: the PRIVATE bucket (public access OFF). The app stores CVs and documents
#    there, and this Worker archives old log rows there under log-archive/.
npx wrangler r2 bucket create mployedin-private

# 4. Shared secret: the same value goes into the app's DATA_WORKER_SECRET.
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx wrangler secret put DATA_WORKER_SECRET

# 5. Deploy, then check.
npm run deploy
curl https://mployedin-data.<account>.workers.dev/health   # {"ok":true}
```

App env after deploy: `DATA_WORKER_URL=https://mployedin-data.<account>.workers.dev` and `DATA_WORKER_SECRET=<same value>`.

## Local

`npm run migrate:local && npm run dev` runs the Worker with local D1 and R2 (Vectorize has no local mode). Unit tests run from the repo root with the app's jest:

```bash
npx jest workers/mployedin-data
```

They apply the real migrations to SQLite (`node:sqlite`, Node 22.5+) and run the Worker's real SQL.

## Limits this code respects

| Limit (Cloudflare docs, checked 2026-10-26) | Where |
| --- | --- |
| D1: 100 bound parameters per statement | one statement per row; deletes in groups of 90 |
| D1: 10 GB per database (500 MB on Workers Free) | one database + nightly archive of old rows to the private R2 bucket |
| D1: 1000 queries per invocation (paid) | 500 rows per request; 25 archive chunks per table per night |
| Vectorize: topK 100 (50 with metadata) | `/vectors/query` caps |
| Vectorize: 10 metadata indexes, 64 bytes indexed per value | `VECTOR_INDEXES` in `src/vectors.ts` |
| Vectorize: 1000 vectors per upsert from a Worker; our 2 MB body cap fits ~90 of 1024 dims | `/vectors/upsert` takes 50; the app client chunks |
| Vectorize Free: 5M stored dimensions, 30M queried dimensions a month | seeker search alone is ~6,200 × 768 ≈ 4.7M: adding the 1024-d match vectors needs Workers Paid; skill vectors stay in Mongo |
