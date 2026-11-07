# Attested Apps

Browse and build PWAs made by [tinfoil-experiments](https://github.com/ekrembal/tinfoil-experiments). Listings live on Nostr; only apps that pass verification are shown.

Vite + React + shadcn (preset `b0`, Base UI) frontend, small Hono server in `server/`.

## Run locally (no network, no real enclave)

```sh
pnpm install
pnpm dev:server   # store API :8787 + mock harness :8788 + mock Nostr relay :8789
pnpm dev          # frontend on :5173, proxies /api to :8787
```

The mock harness behaves like the jobs API and signs in dev mode. Put `#fail` or `#noappjson` in a prompt to test failures.

## Production

```sh
pnpm build
JOBS_URL=https://<enclave> JOBS_BEARER_TOKEN=... SESSION_SECRET=... PUBLIC_ORIGIN=https://store.example \
ALLOWED_PUBKEYS=npub1...,npub1... pnpm server   # also serves dist/
```

| env | default | |
| --- | --- | --- |
| `ALLOWED_PUBKEYS` | empty (anyone) | comma-separated npubs/hex allowed to build |
| `BUILDS_PER_DAY` | 5 | per pubkey |
| `BUILDS_PER_IP_PER_DAY` | 10 | per client IP (`TRUST_PROXY=1` to read `X-Forwarded-For`) |
| `MAX_QUEUE` | 10 | queued builds waiting for the harness |
| `MAX_PROMPT_CHARS` | 4000 | |
| `ALLOW_DEV_STATEMENTS` | off | accept/list dev-signed builds |
| `RELAYS` | damus, nos.lol, primal | where listings are read and published |

Also: one active build per user, signed-login replay protection, the harness token never reaches the browser. Builds are kept in memory (lost on restart).

## GitHub Pages

Every push to the `app-store` branch runs `.github/workflows/pages.yml`, which builds the site and force-pushes `dist/` to the `app-store-pages` branch. In the repo settings, set Pages to deploy from branch `app-store-pages`, folder `/ (root)`.

The Pages build only browses (listings come from public relays). To enable Build there, run the store server somewhere with `CORS_ORIGIN=https://<user>.github.io` and set the repository variable `STORE_API_URL` to its URL. It then uses a cross-site cookie, which some browsers (Safari) block; serving the frontend from the store server avoids that.

| extra env | |
| --- | --- |
| `CORS_ORIGIN` (server) | frontend origin when it is hosted elsewhere |
| `VITE_API_URL` (build) | store server URL; empty = same origin |

## How publishing works

1. The server prepends the **build instructions** (`src/lib/contract.ts`) to every prompt. The harness adds no prompt of its own, so these carry all the rules: offline, no new dependencies, relative URLs and hash routing (any IPFS gateway), leave the project buildable with `npm install && npm run manifest`, and write `public/app.json` (name, tagline, description, category, icon). They are part of the signed prompt; the UI shows them collapsed.
2. Vite copies `app.json` into `dist/`, so the listing is in the signed file manifest.
3. When the build finishes, the server checks the signature, prompt, parent link, artifact digest and `app.json`. Anything that fails is "rejected" and cannot be published.
4. The builder publishes a NIP-78 event (kind 30078, `t=attested-app`, `d` = hash of the first statement, so follow-ups replace the listing) signed with their own key.
5. Browse re-verifies every listing in the browser and drops any that fail, including listings whose name does not match the signed `app.json`.

IPFS is manual: download `dist.tar.gz` from the build and `ipfs add -r --cid-version=1 dist`; the CID must match the statement.

## Not done yet

- Tinfoil V3 hardware quote verification (browser and server)
- Re-hashing downloaded `dist/` and the UnixFS CID in the browser
- Persistent build storage
