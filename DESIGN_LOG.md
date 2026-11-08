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

- `ART_STYLE.md` is the authoritative visual reference: detailed, layered, cel-shaded SVG.
- No pixel art, no isometric diamond grid, no flat/minimalist graphics.
- **2026-11-08 19:11 UTC — correction:** the view is **full top-down** (straight overhead), *not* elevated three-quarter as `ART_STYLE.md` currently says. `ART_STYLE.md`'s perspective section needs updating to match; its other principles stand.
- 1 SVG unit = 1 world pixel. Assets are authored at native size and placed at scale 1.
- Interactive objects (doors, furniture, containers, etc.) stay as separate assets.

### Two-layer presentation
*2026-11-08 18:52 UTC*

- **Overview layer:** text-based overview of the world with menus, strategy-game-style time controls (in the vein of Mount & Blade's map or CK3).
- **Direct-control layer:** drop into a character and control them directly in the full top-down 2D view.
- The player can move between the two at any point.

### Zoom is the transition between the two views
*2026-11-08 19:23 UTC*

- **One continuous world, not two screens.** Zooming in reaches the full top-down direct-control view. Zooming out moves seamlessly into the CK3-style strategic overview (map, menus, character information, world simulation, accelerated time). Zooming back in returns to the detailed 2D world. The rendering and simulation can change underneath, but it should feel continuous.
- **Inputs:** scroll wheel on desktop, pinch on touch. Must work in portrait, landscape and on foldable inner displays (e.g. Pixel 10 Pro Fold).
- **Adjustable zoom range within direct control.**
- **Zooming into a different location must not teleport the player.**
- **Direct control stays restricted** to eligible family members under the control rule above, wherever the camera goes.
- **Evolution note:** the earlier entry describes the overview as text-based. This decision makes it a zoomed-out map view. Whether it stays text-heavy (chronicle, menus) on top of a map is still open.
- **Status:** adjustable zoom within direct control is implemented. The camera is built around continuous zoom bands so the overview can be added as a further band. The overview itself is not built.

### Control rule — who the player can play
*2026-11-08 18:52 UTC*

- **Playable:** the starting character, their parents (while alive), and all of their descendants down the line.
- **Not playable:** siblings, nieces/nephews, cousins and other extended family, unless brought into the line by adoption (below).
- **Marriage never grants control.** Spouses are always NPCs, though their children with a line member are playable.
- **Only recognised parent–child links count.** A secret or unacknowledged child isn't playable until the parentage is acknowledged or uncovered.
- **Adoption counts as a recognised link**, but only for children, wards and orphaned kin. Adults can't be adopted into the line.
  - Consequence: an orphaned niece or nephew taken in becomes playable through the adoption link.
- The simulation tracks **biological** and **recognised** parentage separately, since inheritance, legitimacy and gossip may care about the difference even though control doesn't.

### Direct-control scheme
*2026-11-08 19:11 UTC*

- **Movement:** WASD. Light momentum (short acceleration and deceleration; turns at speed carve slightly wider).
- **Sprint:** hold Ctrl (Minecraft-style). Works whichever of Ctrl/W is pressed first. Sprinting stands you up from a crouch. No stamina yet.
- **Sneak/crouch:** Shift, toggle.
- **Facing:** follows movement direction when exploring; follows the mouse in combat.
- **Combat mode:** toggled with a key (currently R). Out of combat, clicking uses things; in combat, LMB = right hand, RMB = left hand.
- **Third "other" action:** not yet; hands only for now.
- **Interact:** click the object. If out of reach, the character walks there (pathfinding) and uses it.
- **2026-11-08 19:32 UTC — lock-on on desktop too:** F or middle click toggles it in combat. While locked you face the target instead of the mouse.

### Doors are physical
*2026-11-08 19:32 UTC*

- Walk into a door to push it open. No clicking needed. It swings away from whichever side you push from, carries a little momentum, and stays where it's left.
- **Clicking a door locks/unlocks it** for now. Eventually clicking opens a menu of other interactions.
- A locked door won't move ("The door is locked."). You have to shut a door before you can lock it.
- Pathfinding treats unlocked doors as passable (you'll push through) and locked doors as walls.
- **2026-11-08 19:33 UTC — doors swing both ways** (up to 90° either side). With walk-to-push as the way to open doors, a one-way door couldn't be opened from its pull side, and you'd be trapped if it shut behind you. One-way doors would need a pull action (e.g. via the interaction menu) and are only worth revisiting if doors become tactical (barricading, holding shut).

### Touch controls
*2026-11-08 19:23 UTC*

- **Movement:** a floating joystick appears wherever a drag starts on the left half of the screen. A light push walks slowly, a firm push walks at full pace, and pushing to the rim sprints.
- **Use things:** tap the object (out of combat).
- **Zoom:** pinch.
- **Buttons (bottom-right):** Sneak (toggle), Ready/Relax (combat toggle), and in combat Left hand, Right hand, and Lock.
- **Combat aiming on touch: lock-on.** Lock targets the nearest enemy within range, preferring what's in front. While locked you face the target; unlocked, facing follows movement. Lock breaks if the target gets too far away.
- Touch and mouse switch automatically based on which was used last (for touchscreen laptops).

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

### Movement prototype placeholders
*2026-11-08 19:11 UTC*

- **World scale:** `PX_PER_METRE = 64` is a placeholder so movement can be tuned in m/s. The real figure depends on the art scale.
- **Default speeds:** sneak 0.8, walk 1.4, sprint 3.6 m/s; accel 14, decel 18 m/s². Placeholders, live-tunable in the prototype's debug panel. *(2026-11-08 19:32 UTC: lowered from 0.9 / 1.7 / 4.4 — felt too fast.)*
- **Combat key** is R for now.
- **Click-to-walk pathfinding:** 8 px grid A* with obstacle inflation and string-pulling, in pure TypeScript (`src/game/navigation`). Written so NPCs can use it later. Not yet decided whether it scales to whole towns or needs a navmesh / hierarchical approach.
- **Reach checks** ignore line of sight for now (you could, in principle, use something through a thin wall).
- **Character and objects** are placeholder geometry, not final art.
- **Door placeholders (2026-11-08 19:32 UTC):** ~~doors swing both ways up to 90° (real medieval doors usually swing one way).~~ *Moved to Agreed 2026-11-08 19:33 UTC.* Anyone can lock any door: no keys, ownership or lockpicking yet. Doors don't collide with furniture while swinging. No door weight or resistance yet; a first attempt at faking weight shoved the player into the door frame.
- **Rendering smoothness (2026-11-08 19:32 UTC):** physics steps every rendered frame (not fixed 60 Hz), and the character and camera update after physics with frame-rate-independent camera smoothing. This fixed a blur/judder while moving, most visible on high-refresh screens.

### Camera and zoom specifics
*2026-11-08 19:23 UTC*

- **Zoom is measured as a view span:** metres visible across the screen's average side (√(width × height)). Phones, monitors and near-square foldables then show a similar area at the same zoom.
- **Placeholder numbers:** default 8 m; direct-control range 4–22 m; overview would begin beyond 22 m. **The precise thresholds and transition mechanics are open for discussion.**
- **Open questions for the transition:**
  - what fades in and out across the boundary (art detail, labels, map, UI)
  - what happens to time speed as you cross it
  - how the camera's focus detaches from the controlled character in the overview, and what happens when you zoom back in somewhere else (snap back to your character? take control of an eligible family member there? just look?)
- **Art-spec implication:** zoom means the renderer scales the world, which the native-scale rule ("place at scale 1") doesn't currently allow for. Today's placeholder art is vector geometry and stays sharp at any zoom. The canvas also renders at device pixel density, so high-DPI phones are crisp. Final SVG art will need rasterising at (zoom × device pixel ratio) or re-rasterising per zoom range. `ART_STYLE.md` may need an amendment covering zoom.

### Overview as a chronicle
*2026-11-08 18:52 UTC*

- The text-based overview presented as a living chronicle of events in the world.

### Technology stack
*2026-11-08 18:52 UTC — from the project brief*

- React, Vite, TypeScript, Tailwind CSS, Phaser, Dexie/IndexedDB. Cloudflare Workers and D1 deferred until there's a clear need; local-first.
- **SVG rendering in Phaser:** Phaser rasterises SVG to textures. Camera zoom and high-DPI displays would scale those textures, which conflicts with the native-scale rule. Needs a strategy (fixed zoom + DPR-aware rasterisation, per-zoom re-rasterisation, etc.).
- **Normal maps from SVG geometry:** not built into Phaser; would need a custom build step or separately authored normal layers. Worth prototyping on a single asset.
- **Save growth:** an authoritative event log and NPC memories grow without bound; some form of compaction or forgetting will eventually be needed.
