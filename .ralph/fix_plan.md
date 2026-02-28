# Rohlik Stats — Fix Plan

## Phase 1: Railway Migration
- [x] Create `Dockerfile` — multi-stage build: install deps, build Next.js, run production server with `npm start`. Expose PORT env var. Use Node 20 alpine base.
- [x] Create `railway.toml` — Railway deployment config with build command, start command, health check path `/api/health`.
- [x] Add health check endpoint `src/app/api/health/route.ts` — returns `{ status: "ok", timestamp }`. Simple GET endpoint.
- [x] Update `next.config.ts` — remove any Vercel-specific config (preferredRegion, etc.). Make it platform-agnostic. Set `output: "standalone"` for Docker deployment.
- [x] Update `src/app/api/proxy/route.ts` — remove Vercel-specific `preferredRegion` and `maxDuration` exports. These are Vercel-only and will error on Railway.
- [x] Update `src/app/api/categories/route.ts` — remove Vercel-specific `preferredRegion` and `maxDuration` exports.
- [x] Update any other API routes that use Vercel-specific exports — check `save/route.ts`, `stats/[id]/route.ts`, `generate/route.ts` for `preferredRegion` or `maxDuration` and remove them.

## Phase 2: Redis Migration
- [x] Update `src/lib/kv.ts` — the current `RedisKV` class uses the `redis` npm package with `REDIS_URL`. Add support for Upstash Redis as an alternative: if `UPSTASH_REDIS_REST_URL` is set, use `@upstash/redis` REST client instead. Keep the `redis` package path as fallback for standard Redis. This lets us use the shared Upstash instance.
- [x] Install `@upstash/redis` package — `npm install @upstash/redis`. Verify build still works.
- [x] Run tests to verify KV changes don't break anything — `npm test`. Fix if needed.

## Phase 3: Local Testing
- [x] Test the app locally with `npm run dev` — verify the landing page loads, login form works, and API routes respond. Check that the local file-based KV works (no Redis needed for dev).
- [x] Test Rohlik API proxy locally — use the test credentials from `.env` to verify login flow works from localhost (no IP throttling). Document any issues in this task's notes.
- [x] Test full stats generation flow locally — login, fetch orders, process stats, view dashboard. Verify all tabs work (Overview, Categories, Products). If Rohlik throttles even localhost, note the behavior. **RESULT**: Full flow works from localhost. 484 orders fetched, 2110 categories downloaded, permalink generated. All tabs (Overview, Categories, Products) and Product Detail view work correctly. No Rohlik throttling from localhost. Total flow took ~15 minutes due to rate-limiting delays.

## Phase 4: Deploy to Railway
- [x] Deploy to Railway using the CLI. Run: `railway init --name rohlik-stats` to create the project, then `railway service create --name web`. Set env vars using `railway variables set` for: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, NODE_ENV=production, PORT=3000. Then deploy with `railway up`. Get the public URL with `railway domain`. Verify deployment succeeds. **RESULT**: Deployed successfully. Project created, web service with env vars set, `railway up` built and deployed. Public URL: https://web-production-23d1c.up.railway.app — health endpoint returns OK, landing page returns 200.
- [x] Test deployed app — curl the health endpoint and landing page on the Railway URL. Check if Rohlik API proxy works from Railway's IP (not throttled like Vercel). Use `railway logs` to debug any issues. **RESULT**: Health endpoint returns `{"status":"ok"}`, landing page returns HTTP 200 (12KB, 0.68s). Categories API (Upstash Redis) works. Stats retrieval API works. However, Rohlik API proxy returns 403 — Cloudflare blocks Railway's datacenter IPs with a challenge page (same issue as Vercel). Railway IPs are NOT Czech-residential. The proxy works correctly but Rohlik/Cloudflare rejects requests from datacenter IPs regardless of provider.
- [x] Configure custom domain (if available) — add domain to Railway project if user has one. Otherwise skip this task and mark as done. **RESULT**: Skipped — no custom domain available. Railway-provided domain https://web-production-23d1c.up.railway.app is in use.

## Phase 5: Polish
- [x] Remove `.vercel/` directory and Vercel-specific files — clean up the project from Vercel deployment artifacts. **RESULT**: Removed `.vercel/` directory (README.txt, project.json) and `public/vercel.svg`. Updated 3 stale "Vercel KV" comments in source to "Redis".
- [x] Update README.md — update deployment instructions from Vercel to Railway. Update any references to Vercel KV. **RESULT**: Replaced default create-next-app README with project-specific README covering: description, how it works, tech stack, local dev setup, env vars, testing, Railway deployment, architecture, and rate limiting.
- [x] Run full test suite and build — `npm test && npm run build`. Ensure everything passes cleanly. **RESULT**: 25/25 tests pass, build compiles successfully with no TypeScript errors. All 9 routes generated.

## Phase 6: Bug Fixes — Proxy Error Handling
- [ ] Fix "Cannot read properties of null (reading 'status')" crash on login. In `src/app/page.tsx` around line 186, `loginRes.data` is null when the proxy gets a non-JSON response from Rohlik (Cloudflare HTML block page). Add a null check: if `loginRes.data` is null, throw a user-friendly error like "Rohlik server je momentalne nedostupny. Zkuste to pozdeji nebo z jineho pripojeni." Also fix the proxy at `src/app/api/proxy/route.ts` — when Rohlik returns non-JSON (HTML block/challenge page), return `{ data: null, error: "cloudflare_blocked", status: 403 }` instead of just `{ data: null, status: <code> }` so the client can distinguish between rate limiting and IP blocking.
- [ ] Apply the same null-safety to ALL places in `src/app/page.tsx` that read from proxy responses — check every `proxyCall()` result usage. Any `.data.something` access needs a null guard. Search for all `loginRes.data`, `res.data`, and similar patterns.
- [ ] Run `npm test && npm run build` to verify the fix compiles and tests pass.
- [ ] Commit, push, and redeploy to Railway with `railway up`. Verify the deployed app shows a friendly error message instead of crashing.
