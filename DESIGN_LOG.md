# Design Log — Medieval Life Immersive Simulator

A running record of design decisions. Entries are timestamped (UTC) and grouped by status.

- **Agreed** — decided. Change only by explicit revisit.
- **Undecided** — open questions that need a decision.
- **Under consideration** — ideas and directions being explored, not committed.

When an item changes status, move it and add a dated note rather than silently rewriting history.

---

## Agreed

### Core philosophy
*2026-11-08 18:52 UTC — from the project brief*

- The world does not revolve around the player; the player lives in the world.
- Gameplay emerges from interacting systems, not scripted scenarios. No mandatory storyline.
- The player and NPCs share the same underlying simulation and mechanics wherever practical.
- Incremental, collaborative development. The brief describes a vision, not an implementation plan.

### Visual direction
*2026-11-08 18:52 UTC — from the project brief*

- `ART_STYLE.md` is the authoritative visual reference: detailed, layered, cel-shaded SVG in an elevated three-quarter top-down view.
- No pixel art, no strict overhead view, no isometric diamond grid, no flat/minimalist graphics.
- 1 SVG unit = 1 world pixel. Assets are authored at native size and placed at scale 1.
- Interactive objects (doors, furniture, containers, etc.) stay as separate assets.

### Two-layer presentation
*2026-11-08 18:52 UTC*

- **Overview layer:** text-based overview of the world with menus, strategy-game-style time controls (in the vein of Mount & Blade's map or CK3).
- **Direct-control layer:** drop into a character and control them directly in the full top-down 2D view.
- The player can move between the two at any point.

### Control rule — who the player can play
*2026-11-08 18:52 UTC*

- **Playable:** the starting character, their parents (while alive), and all of their descendants down the line.
- **Not playable:** siblings, nieces/nephews, cousins and other extended family, unless brought into the line by adoption (below).
- **Marriage never grants control.** Spouses are always NPCs, though their children with a line member are playable.
- **Only recognised parent–child links count.** A secret or unacknowledged child isn't playable until the parentage is acknowledged or uncovered.
- **Adoption counts as a recognised link**, but only for children, wards and orphaned kin. Adults can't be adopted into the line.
  - Consequence: an orphaned niece or nephew taken in becomes playable through the adoption link.
- The simulation tracks **biological** and **recognised** parentage separately, since inheritance, legitimacy and gossip may care about the difference even though control doesn't.

---

## Undecided

### Time model
*2026-11-08 18:52 UTC*

- How time runs in each layer: speeds, compression, pausing, skips.
- How the overview and direct-control clocks relate. Does dropping in force real-time? Can time advance while controlling someone?
- Overall time scale of a playthrough (years? generations?).
- *Note:* the two-layer presentation largely addresses the conflict between real-time play and life-scale simulation, but the specifics remain open.

### Line extinction and player continuity
*2026-11-08 18:52 UTC*

- What happens when no playable characters remain (game over, or something else)?
- Long-term growth of the playable roster: over several generations, descendants could make up a large share of a small town. Is that a problem for crime and stakes, or an intended late-game arc?

### Possessed characters' own minds
*2026-11-08 18:52 UTC*

- When the player drives a character to act against their nature, does the character remember choosing it? Does it change them (memories, personality, guilt)?
- How (or whether) to handle the player knowing things the controlled character doesn't.

### Historical setting and legal structure
*2026-11-08 18:52 UTC*

- Real place and period (e.g. medieval England, Bohemia) vs. an invented but historically grounded setting.
- Affects which emergent stories are possible, e.g. fixed bread prices (Assize of Bread and Ale), guild control of trades, inheritance law, punishments.

### World scope
*2026-11-08 18:52 UTC*

- Option A: one deeply simulated settlement.
- Option B: an entire world.
- Option C: a simulated region (principal town plus villages, farms, castles, roads).

### Lazy procedural NPCs — what's lazy
*2026-11-08 18:52 UTC*

- Which attributes exist from creation and which are generated on realisation.
- What triggers realisation (player interaction, direct control, major events, connection to realised characters).

### Moment-to-moment play
*2026-11-08 18:52 UTC*

- Combat: presence and form.
- Dialogue: systemic, authored, or other.
- How information about the world is presented to the player.

### Economy closure
*2026-11-08 18:52 UTC*

- Fully closed economy (goods and money conserved) vs. one with external sources and sinks (e.g. outside trade, merchants, regional prices) to keep it stable.

---

## Under consideration

### Simulation architecture
*2026-11-08 18:52 UTC*

- Simulation engine in pure TypeScript, independent of Phaser and React, possibly running in a Web Worker.
- Deterministic simulation with seeded randomness, useful for consistent lazy generation and for debugging/replay.
- Different systems updating at different frequencies.

### Simulation level of detail
*2026-11-08 18:52 UTC*

- Full-detail agents near the active character; abstract agents elsewhere; possibly statistical households far away.
- Separate from lazy generation (detail of *simulation* vs. detail of *character data*), though the two complement each other.
- Maps naturally onto the two-layer presentation: the overview runs abstract, and dropping in spins up a full-detail bubble.
- Open problem: building a coherent concrete scene when dropping into a character mid-activity, and folding it back into abstract state on leaving without losing meaningful changes.

### Lazy generation as constrained generation
*2026-11-08 18:52 UTC*

- An authoritative store of established facts (event log, ownership, deaths, marriages) that generation must never contradict.
- Distinction between pre-game backstory (invented freely but consistently) and simulated history (recorded, untouchable).
- Cheap core traits (e.g. temperament) derived from the seed at creation, so off-screen decisions stay consistent with later realisation; expensive detail (memories, history, relationships) generated lazily.

### Knowledge and belief model
*2026-11-08 18:52 UTC*

- Characters hold beliefs with confidence and source. Witnessing creates knowledge; gossip spreads and degrades it; investigation gathers it; reputation aggregates it.
- Candidate foundation for crime, suspicion, secrets, gossip and reputation.
- Covers the brief's distinction between world facts, generated facts, player knowledge and NPC beliefs.

### Actions as first-class objects
*2026-11-08 18:52 UTC*

- The player as an agent with a different controller. Player and NPC actions (steal, buy, work, assault…) go through the same pipeline, so detection and consequences apply uniformly.
- Reinforced by the control rule: any line member can be played, so their mechanics must be identical to everyone else's.

### Overview as a chronicle
*2026-11-08 18:52 UTC*

- The text-based overview presented as a living chronicle of events in the world.

### Technology stack
*2026-11-08 18:52 UTC — from the project brief*

- React, Vite, TypeScript, Tailwind CSS, Phaser, Dexie/IndexedDB. Cloudflare Workers and D1 deferred until there's a clear need; local-first.
- **SVG rendering in Phaser:** Phaser rasterises SVG to textures. Camera zoom and high-DPI displays would scale those textures, which conflicts with the native-scale rule. Needs a strategy (fixed zoom + DPR-aware rasterisation, per-zoom re-rasterisation, etc.).
- **Normal maps from SVG geometry:** not built into Phaser; would need a custom build step or separately authored normal layers. Worth prototyping on a single asset.
- **Save growth:** an authoritative event log and NPC memories grow without bound; some form of compaction or forgetting will eventually be needed.
