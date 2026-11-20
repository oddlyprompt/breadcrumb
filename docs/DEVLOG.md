# Development log

## Wave 1
- **Phase A.** Seeded streams, terrain, geology, deposit archetypes. The geology map reads as a real survey; worlds differ in dominant resources (some are gold-rich, some fossil-rich with no metals).
- **Phase B.** History simulation. First version produced 771 settlements and 13k businesses and took 53 s. It was fixed with indexed lookups, founding caps and event filtering, and now runs in about 0.4 s.
- **Phase C.** Sites, artifacts, specimens, documents. The first volume was 1.8M objects, so a documented *salvage factor* and per-site caps were added. The **validator** found real defects, all fixed at their cause: people acting after death, tokens outside issue periods, iron corroding too fast, a site's life not covering its own activity, storms random-walking beach finds up to 2 km away, and archetypes produced after their end date. It is now clean across 40+ seeds.
- **Phase D/E.** Map, field view, detector, panels, audio, saves. A browser playthrough found: the player started inside a non-searchable town; public commons were blocked by the built-up circle; beach finds were outside their indexed area. All fixed.
- Balance probe (`scripts/botplay.ts`): free surface searching earns $0.2k to $17k across the nearest 40 sites per seed, versus $5k to $16k for a basic detector. This is seed dependent, so there is no universal best activity.

## Known gaps
No real-device test; no audio device available in CI, so sound is checked only for errors. Wave 1 explicitly excludes boats, diving, mining, auctions and rivals.
