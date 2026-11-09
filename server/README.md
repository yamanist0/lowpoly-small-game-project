# Online server

The Worker serves the Vite `dist` build and sends `/api/*` to a single Durable Object for live player presence and city ownership. D1 stores guest sessions, money, inventory and city ownership. The Worker looks for `/assets/*` in the R2 `MEDIA` binding first and falls back to Workers Static Assets when a key has not been uploaded. Objects are also readable at `/media/<key>`.

## Local development

After installing the project dependencies, run:

```sh
npm run build
npx wrangler d1 migrations apply neon-coast-db --local
npx wrangler dev
```

Use the URL reported by Wrangler. `npm run dev` alone serves the game but does not run the Worker or D1. `node server/test.mjs` exercises the protocol with Node 22's SQLite; it is not a substitute for a Workers runtime test.

## Deployment setup

The configured D1 database was created for this project. Enable R2 and create the configured bucket in the same Cloudflare account, then upload the assets, run a dry run and deploy with that account. For another account, create a D1 database and update its ID before applying migrations. The user must retain backups of the D1 database before migrations against existing data. The configured D1 database has its initial migration applied. After building, populate R2 with `node server/upload-assets.mjs --remote neon-coast-assets` (use the actual bucket name). For local storage use `--local`. The script uploads only hashed files from `dist/assets`, assigns MIME types and immutable cache headers, stops on an error, and never deletes objects. Deploy the matching build after successful upload. Unuploaded files remain available through the static fallback.

## Protocol and trust boundary

`POST /api/session` accepts `{name}` for a new guest or `{token}` for an existing one. It returns `{token,player:{id,name,money,inventory},cities,spawn}`. Tokens are bearer credentials; only hashes are stored in D1. `POST /api/save` accepts `{token,money,inventory}`. `POST /api/claim` accepts `{token,ix,iz}`; it atomically claims an unowned valid city for $20,000. Save the current balance before claiming, and avoid concurrent saves and claims. Cities are `{ix,iz,ownerId,ownerName}`.

Connect to `/api/world` via WebSocket; the first message is `{type:"auth",token}`. The server responds with `hello`, and accepts `{type:"move",x,z,heading}`. Presence broadcasts are `player`, `leave`, and `city`. Authentication messages must not be logged.

**Current limitation:** existing single-player game simulation and save values remain client-authoritative. Money, inventory and player motion are range-checked, but a modified client can submit arbitrary valid values and cheat. This is a cooperative prototype, not an anti-cheat or competitive economy. Never depend on these balances for real money or valuable transactions. Guest identities depend on browser-stored bearer tokens; losing the token loses access to the account.
