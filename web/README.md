# Handshake web

Frontend for Handshake on Rialo devnet. Vite, TypeScript, Three.js, GSAP. Three views: Explore (a sphere of cards you can spin and open), Deals (a WebGL grid with glass-lens edges; create, open and approve deals here) and Proof (a chrome bot over a horizontal text track).

- `src/lib/rialo/` holds the chain code: deal and heartbeat address derivation, instruction encoding, and the 704-byte deal decoder. `test/` checks each against transactions and accounts recorded from devnet.
- `api/rpc.ts` is a same-origin relay to the devnet RPC, which sends no CORS headers. It only forwards `get*`, `send*`, `request*` and `simulate*` methods.
- `scripts/e2e.ts` runs the same chain code against devnet (the `web-e2e` workflow).

## Deploy to Vercel

Import the repo, set **Root Directory** to `web`, keep the detected Vite settings. Optional env var: `RIALO_RPC` (defaults to `http://devnet.rialo.io:4100`).

## Local

```
npm ci
npm run dev      # proxies /api/rpc to devnet
npm test
npm run build
```

The wallet is a throwaway key generated in the browser and kept in localStorage. It is for devnet test funds only.
