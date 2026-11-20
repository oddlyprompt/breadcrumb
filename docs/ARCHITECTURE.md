# Breadcrumb: architecture

**Stack:** TypeScript, Vite, Vitest, Canvas 2D, Web Audio, IndexedDB, a Web Worker for world generation. No UI framework and no PixiJS: the views are two canvases and imperative DOM panels. This keeps the dependency count at six dev packages. Playwright (provided globally) is used for the browser scripts.

## Layers
- `src/sim/` is the **headless engine**. It has no DOM and no globals, and runs under Node (tests, `scripts/validate.ts`).
- `src/ui/` is rendering and interaction: `mapview.ts` (regional map), `field.ts` (local view and detector mechanic), `draw.ts` (procedural artifact art), `audio.ts` (synthesised sound), `panels.ts` and `devpanel.ts`.
- `src/worker/gen.worker.ts` generates a world off the main thread.

## Determinism
`rng.ts` derives an isolated stream per system from `(seed, GEN_VERSION, name)`. Lazy generation uses `hash32(seed|system|id)` only, never a global stream, so results never depend on the order things are rendered or visited (tested). **Saves store only player state.** The world is regenerated from `(seed, genVersion)`. Bump `GEN_VERSION` only when a change must alter new worlds; add systems with new stream names so existing worlds do not shift.

## Generation pipeline (`world.ts`)
1. `terrain.ts`: 200×200 cells × 250 m = 2,500 km². Elevation, sea, priority-flood drainage, discharge, lakes, orographic rain, temperature.
2. `geology.ts`: provinces typed by relief (shield, fold belt, volcanic arc, marine or terrestrial basin, coastal plain), stratigraphy with real age windows, plutons with contact aureoles, faults. `minerals.ts` and `fossils.ts` are real-property libraries.
3. `deposits.ts`: eleven documented deposit models (orogenic gold, epithermal, porphyry copper, lead-zinc, pegmatite, banded iron, fossil beds, evaporite, coal, geodes, quartz veins), each placed only where its host rock, age and structure allow. Placer trains are routed down real drainage. Each deposit has a `viableFrom` year: geological presence is separate from recoverability.
4. `landscape.ts`: sediment, soil depth, pH, mineralisation (detector noise), salinity, vegetation, wetlands, agricultural suitability, traverse cost. `geography.ts` names features.
5. `history.ts`: year-by-year simulation, 1620s to 2024. Settlements, farms, mines, gold rushes, businesses with owners and successors, roads, railways, crossings, vessels and wrecks, fires, floods, wars, robberies and hidden caches. Every event has prerequisites (`prereqs`) and consequences.
6. `coinage.ts`, `issues.ts`: mintage per denomination and year, design types, business scrip, medals. Rarity is derived from mintage × survival.
7. `sites.ts`: turns history into physical **sites** with activity histories, hot spots and visible remains (foundations, tailings, rail beds…).
8. `artifacts.ts` (lazy, per site): >150 archetypes in `archetypes.ts` are drawn from the site's activities, constrained by production dates, material availability, maker operating years, and the loss mechanism. `preservation.ts` decides survival by material, soil, depth and time buried. Taphonomy moves objects (ploughing, floods, storms) while conserving identity. `specimens.ts` makes rocks, minerals, fossils and placer gold per 64 m chunk from the geology, recording the transport path.
9. `documents.ts`: archive records generated from real events, people, businesses and mines, each with deliberately uncertain place hints.

## Runtime
`game.ts`: `GameState` (the save), `Searcher` (what lies near a point; applies storms and floods after game start deterministically from the weather, so nothing needs storing but the recovered set), digging, panning, travel, selling. `detector.ts` physics: depth and size and conductivity versus soil mineralisation, moisture, salt, interference and discrimination. `identify.ts`: progressive identification, where legibility is computed from wear, corrosion, cleaning and magnification, and attribution needs facts learned elsewhere. `economy.ts` values things from material, condition, derived rarity, regional demand and association, and buyers see only what they can read. `inspect.ts` is the developer provenance inspector.

## Tools
`npm test`, `npm run validate -- N START SAMPLE` (many seeds), `npm run build`, `scripts/play.cjs` (browser playthrough).
