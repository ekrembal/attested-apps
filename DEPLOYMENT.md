# GitHub Pages and a local build server

The frontend is a static hash-routed site at https://ekrembal.com/attested-apps/.
In the repository's Settings → Pages → Source, select **GitHub Actions**.
The workflow builds pushes to `main` and uses upload-pages-artifact/deploy-pages;
no gh-pages branch is needed. It sets `VITE_BASE=/attested-apps/` and optionally
reads the repository variable `BACKEND_URL` into `VITE_BACKEND_URL`.

## Runtime Settings

Open Settings in the header to configure `BACKEND_URL`, `PINATA_API_KEY`, and
an IPFS gateway. Values are stored in localStorage; saving reloads the frontend.
An empty backend means same origin. Build-time defaults are `VITE_BACKEND_URL`
(or the older `VITE_API_URL` alias) and `VITE_PINATA_API_KEY`.
JWTs and session tokens stored in the browser are accessible to same-origin
scripts. Use a scoped Pinata upload JWT and do not commit credentials.

## Backend on your PC

Use Node 24 and pnpm 10. In one terminal, establish the verified enclave connection:

```sh
tinfoil container connect attested-harness-online --repo ekrembal/tinfoil-experiments@v0.1.6-online --port 18080
```

In another terminal, set these environment variables (supply secrets privately):

```sh
export JOBS_URL=http://localhost:18080
export CORS_ORIGIN=https://ekrembal.com
export PUBLIC_ORIGIN=https://your-tunnel.trycloudflare.com
pnpm server
```

Also set `JOBS_BEARER_TOKEN` to the enclave's bearer token and `SESSION_SECRET`
to a persistent random secret. Start the tunnel:

```sh
cloudflared tunnel --url http://localhost:8787
```

Set BACKEND_URL in frontend Settings to that tunnel URL. PUBLIC_ORIGIN must match
the backend's external URL, not the frontend URL. CORS_ORIGIN accepts a
comma-separated list of frontend origins, defaults to https://ekrembal.com,
and supports `*` for bearer-header auth. Do not use trailing URL paths as origins.
Login returns an HMAC-signed session token; subsequent requests use Authorization:
Bearer, including artifact downloads. Sessions are scoped to each backend URL.

The server holds builds in memory and drives the harness with a polling loop.
Keep this process alive: **do not deploy it as a Vercel serverless function**.
Restarting it loses builds and queues. Without a persistent SESSION_SECRET,
restarting also invalidates sessions.

## Publishing

The current publishing contract is v3: online npm installs are allowed. Builds
use npm, preserve package-lock.json, relative assets and hash routing, and write
public/app.json. Online builds are not network-isolated or reproducible.

Once a build is verified and ready, choose Upload to IPFS (Pinata). The browser
downloads the authenticated artifact, validates its signed digest and file
manifest, extracts dist/, and uploads its directory with cidVersion=1 to
https://api.pinata.cloud/pinning/pinFileToIPFS. Publishing is enabled only after
the returned CID matches the signed CID. A mismatch is an error, not a new CID
to publish. The default gateway is https://dweb.link; apps open at
https://GATEWAY/ipfs/CID/.

Manual fallback: download dist.tar.gz, then run:

```sh
tar xzf dist-*.tar.gz
ipfs add -r --cid-version=1 --pin dist
```

Verify the final directory CID equals the signed CID, then use the manual
confirmation in the build card before publishing to Nostr. Keep the directory
pinned and reachable. Browse is the default page and hides development-signed
listings, even when the local mock server accepts development builds.

## Local development and preview

```sh
CORS_ORIGIN=http://localhost:5173 pnpm dev:server
VITE_BACKEND_URL=http://127.0.0.1:8787 pnpm dev
```

For a Pages-path preview:

```sh
VITE_BASE=/attested-apps/ pnpm build
VITE_BASE=/attested-apps/ pnpm preview
```

Open http://localhost:4173/attested-apps/ and /attested-apps/#/build.
