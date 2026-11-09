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
- ~~**2026-11-08 19:11 UTC — correction:** the view is **full top-down** (straight overhead), *not* elevated three-quarter as `ART_STYLE.md` currently says. `ART_STYLE.md`'s perspective section needs updating to match; its other principles stand.~~ *Superseded 2026-11-08 21:37 UTC: the view is **true 2:1 isometric** (see below).*
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

- Walk into a door to push it open. No clicking needed. It swings away from whichever side you push from and carries momentum.
- **2026-11-08 19:42 UTC — doors swing back shut by themselves** (weighted, like a sprung door). They pick up speed and thud into the frame with a small bounce. *(Replaces "stays where it's left".)*
- **If you're in the doorway** as it swings back, it comes to rest against you rather than bouncing off, and closes once you're clear.
- **Sneaking eases doors:** a gentler push, and the door settles shut softly with no thud. This sets up door noise mattering for stealth once there's a noise system. The thud currently shows a small dust puff, a placeholder for sound/noise.
- **Clicking a door locks/unlocks it** for now. Eventually clicking opens a menu of other interactions.
- A locked door won't move ("The door is locked."). You have to shut a door before you can lock it.
- Pathfinding treats unlocked doors as passable (you'll push through) and locked doors as walls.
- **2026-11-08 19:33 UTC — doors swing both ways** (up to 90° either side). With walk-to-push as the way to open doors, a one-way door couldn't be opened from its pull side, and you'd be trapped if it shut behind you. One-way doors would need a pull action (e.g. via the interaction menu) and are only worth revisiting if doors become tactical (barricading, holding shut).

### Point-and-click movement
*2026-11-08 19:53 UTC*

- **Alongside WASD and touch**, not instead of them. Any WASD or stick input cancels a point-and-click order.
- **Desktop:** left-click the ground to walk there. Hold the button and the character follows the cursor (Diablo-style); on release they finish walking to the last point. Clicking an object still uses it (walking over first if needed). In combat, clicks remain punches, so there's no click-to-move while fighting.
- **Touch:** tap the ground to walk there, tap an object to use it. Press and hold (or drag starting on the right half) to follow your finger. A drag starting on the left half is still the stick.
- **Speed is distance-based:** short trips walk, long trips run. While following, they run when the cursor/finger is far away and walk when it's close. **Sneaking always stays sneaking.**
- **Feedback:** a marker at the destination and a faint line along the route.

### Touch controls
*2026-11-08 19:23 UTC*

- **Movement:** a floating joystick appears wherever a drag starts on the left half of the screen. A light push walks slowly, a firm push walks at full pace, and pushing to the rim sprints.
- **2026-11-08 19:38 UTC — the stick never breaks a sneak:** while sneaking, the stick tops out at full sneak speed, even at the rim. Only the sprint key (Ctrl) stands you up.
- **Use things:** tap the object (out of combat).
- **Zoom:** pinch.
- **Buttons (bottom-right):** Sneak (toggle), Ready/Relax (combat toggle), and in combat Left hand, Right hand, and Lock.
- **Combat aiming on touch: lock-on.** Lock targets the nearest enemy within range, preferring what's in front. While locked you face the target; unlocked, facing follows movement. Lock breaks if the target gets too far away.
- Touch and mouse switch automatically based on which was used last (for touchscreen laptops).

### People sandbox: multiple characters, autonomy, social actions, combat, UI
*2026-11-08 20:18 UTC*

- **Test cast:** four unrelated characters (Edric, Agnes, Maud, Wat). **All playable for testing**, so the family control rule isn't applied yet (they aren't related). Switch with the portrait bar (click/tap) or keys 1–4. Whoever you leave carries on autonomously, and the camera pans to whoever you take over.
- **Autonomy (when not controlled):** idle wandering, using nearby objects, and chatting with each other. No needs model yet.
- **Interactions:** clicking/tapping a person or object opens a **radial menu** around it. People: social actions, Fight, Take control. Objects: their options (door Lock/Unlock, chest Open/Close, sign Read). Yourself: Yield/Stand up, Sneak. Clicking the ground still walks there. *(Supersedes "clicking a door locks it": doors now use the menu, as planned.)*
- **Dialogue: Sims-style social actions with emote bubbles.** Chat, Joke, Compliment, Embrace, Argue, Insult. No written lines. Both characters show emote bubbles; the outcome shifts **one-directional opinions** (what A thinks of B ≠ what B thinks of A). Friendly actions land more often with people who already like you.
- **2026-11-08 20:23 UTC — lock-on works outside combat too** (F, middle-click, or the Lock button, which is now always visible on touch). Out of combat it targets people only; you keep facing them as you move, and the ring is cream rather than red. Locks on people carry across into and out of combat.
- **2026-11-08 20:23 UTC — Talk** (E, or a Talk button on touch) opens the interaction menu for whoever you're locked on to, or, with no lock, the nearest person roughly in front of you. Tapping/clicking people still works as well.
- **Combat responses depend on temperament:** Bold fight back, Wary run (fighting if cornered), Meek yield. Everyone yields once beaten down far enough. **Defeat = yield/surrender**; knockout only if you keep hitting someone who has yielded. No deaths yet.
- **Shared mechanics:** NPCs walk, talk, punch and use things through exactly the same code as the player; the brain only decides what to do.
- **UI style: clean & modern.** Neutral translucent panels and crisp type; the art carries the medieval feel. Portrait bar with health rings and status badges; a card for the active character (activity, health, temperament, relationships both ways).

### Senses, awareness and memory
*2026-11-08 20:36 UTC*

- **Everyone perceives, including the character you control.** Your character sees, hears, smells and remembers by the same rules; only NPCs react automatically. You still see the whole area yourself for now.
- **Sight:** a forward vision cone with a range; walls and door leaves block it. Being in view isn't the same as being noticed. Awareness builds over a moment: faster up close and in the centre of vision, slower at the edges, much slower when sneaking. Up close you're noticed at once, unless sneaking.
- **Sound:** noise events with a loudness (how far they carry); each wall in between muffles them. Footsteps (louder running, silent sneaking), punches, talk, quarrels, shouts, door thuds, someone hitting the floor. Hearing makes people glance over and can make them *suspect* someone's there, never be sure.
- **Smell (all three, on one framework):**
  - **presence:** sensing someone unseen right next to you; they turn round
  - **lingering scents:** everyone leaves a faint trail (fainter when sneaking), and fights leave blood; both fade
  - **event smells:** a cooking fire draws people over to warm themselves; a midden makes them wrinkle their nose and move off
- **Perceptions are beliefs, not facts:** seeing a fight gives "Edric hit Agnes"; hearing one gives "a fight, over there". The victim knows who hit them.
- **Memories:** stored per character with sense, confidence and time; repeats strengthen them; they fade. Shown on the character card. This is the groundwork for witnesses, crime and gossip.
- **Witnessing a fight (temperament + relationships):**
  - Bold step in on the side of whoever they like more, or shout at the attacker to stop and watch if they don't care either way.
  - Wary keep their distance and watch, and cry out if it's a friend being hit.
  - Meek back away.
  - Seeing an attack lowers your opinion of the attacker, more so if you like the victim.
  - Bold people who only *hear* a fight go and investigate; meek ones move away.
- **Awareness indicators:** a ? (noticing you) / ! (has just noticed you) over people, shown only while you're sneaking or in a fight stance, when being noticed matters. Plus a **senses debug overlay** (F4, or the Tuning panel): cones, noise rings, scents, smell radii.

### Character panel
*2026-11-08 20:42 UTC*

- **Tabbed panel for the character you control:** Needs, Skills, People (relationships), Self (character). It only ever shows whoever you're controlling.
- ~~Desktop: docked bottom-left above the portraits… Phones: bottom sheet from your portrait.~~ *Superseded 2026-11-08 20:46 UTC by the bottom bar (below).*
- **What's live and what's placeholder:**
  - **Live:** health, temperament, current activity, relationships (both directions, with memories involving each person), memories.
  - **Static placeholder data** (`src/game/characters/mockProfiles.ts`), labelled as such in the panel: needs (Hunger, Rest, Warmth, Comfort, Hygiene, Company, plus a mood summary), skills (Body: Brawling, Stealth, Labour; Mind & tongue: Persuasion, Haggling, Letters; Trades: Baking, Smithing, Farming, Carpentry; levels 0–10), age, occupation, traits and background.
- The need and skill lists, the occupations, traits and backgrounds are example content to settle the layout, not design decisions.

### Bottom bar (main game UI)
*2026-11-08 20:46 UTC*

- **A full-width game bar along the bottom, Sims-style in structure but our own clean look:**
  - **Left:** a big portrait of the character you control (health ring, status badge), with their name, occupation, mood and current activity beside it, and the rest of the household as small portraits to switch to.
  - **Centre:** time controls and clock.
  - **Right:** the character panel (Needs / Skills / People / Self), popping up above a row of tab icons. Open by default on desktop; click the active tab or × to close.
- **Top-left: current-action chip** (e.g. "Walking", "Chat · Agnes", "Ready to fight") with × to cancel.
- **Pause works** (button or Space): the world freezes; camera, zoom and menus still work.
- **Placeholders:** the faster-speed buttons are shown but disabled until the time model is decided; the clock ("Day 1 · Morning") and mood are not simulated.
- **Controls help** moved into a "?" on the bar.
- **Phones:** a compact version of the same bar; the panel opens as a sheet above it; the touch buttons sit above the bar.

### GTA-style character switching
*2026-11-08 21:03 UTC*

- **Switching plays a camera transition:** pull out, pan across, drop in on the new person. **Scaled to distance:** a nearby hop is a ~1 s glide with a slight pull-out; a long one pulls right out and **holds a wide shot of both people** before dropping in (~2.5 s across the sandbox).
- **The world keeps running:** the person you leave carries on by themselves at once; the person you're heading to keeps doing their thing, and the camera follows them, so you land mid-activity. **You take control on landing.**
- **Not skippable:** input during the switch is ignored (keys, clicks, taps, the stick, zoom). Pause still works and freezes the transition too.
- **2026-11-08 21:11 UTC:** picking someone else mid-switch isn't ignored: it's queued, and the next switch starts as soon as this one lands.
- **Flourishes:** colour drains from the game as you rise and returns as you drop in (lighter on short hops; the UI keeps its colour); a **name card** with who you've become and what they're doing appears on landing.
- **Overview tie-in:** the switch is a zoom out / pan / zoom in, the same camera movement planned for moving between direct control and the overview. When the overview exists, long switches could pass through it.
- **Placeholders:** pull-out height (1.35 × distance + 6 m), wide shot for switches over 15 m (0.7 s), phase timings.

### Character art direction
*2026-11-08 21:29 UTC*

- **Characters: simple, readable, RimWorld / Prison Architect-style figures.** Simple body shapes, a head, and **floating hands** not connected to the body; no limbs, no animation. Detailed enough to read clearly, simple in form.
- Built so **equipment is easy later:** held items attach to a hand, worn items to the head or body (layered).
- **Environments keep the art doc's direction** (detailed, layered, cel-shaded SVG). The character simplification applies to characters only.
- In top-down, characters are seen from above; in the angled views they're upright figures facing one of **8 directions**, with hands placed exactly where they're aiming so combat stays precise.
- *2026-11-09 01:35 UTC:* the in-game figures are now **the mock-up art** (the "Body sliders" design board): an upper body with no legs, a head with a face and hair, floating hands. Every person's figure is worked out from their body (sex, age, fat, muscle, height, frame, bust, waist, hips, skin, hair), from five angles mirrored to eight facings. Lying down (asleep or out cold) uses the front view with the eyes shut. **Clothing:** everyone wears one plain shirt in their clothes colour for now (PLACEHOLDER, clothing options to come).

### Character creation
*2026-11-09 01:35 UTC*

- **The sandbox starts with character creation.** Name (with a 🎲 suggestion), sex, age (0–100, showing the life stage), fat and muscle ("changes with how they live"), height, frame, bust, waist and hips ("fixed at birth"), skin tone and hair colour, with a live preview you can turn round. Randomise, Reset, Start.
- The person you make **joins the test cast** (as a fifth playable person, keys 1–5) and you start as them. The last person made is remembered, so starting again doesn't mean rebuilding them.
- PLACEHOLDERS: the skin and hair palettes; temperament (Bold) and the character-panel profile (Newcomer, no traits or background, every skill at 1); clothes colour (brown). Any age can be chosen, including babies, who walk about like anyone else.
- The perf test skips creation and draws its crowd from **16 fixed looks**, so thousands of people share 16 textures.
- **The fighting age rule is now enforced:** children can't go into combat mode ("Children can't fight."), the Fight option says why it's unavailable, punches pass by people you aren't allowed to hit, and NPCs only fight back, defend or join in where the rule allows (otherwise they flee, watch or shout).
- Height and weight for shoving now come from the body sliders and age (PLACEHOLDER formula) instead of the mock profiles.

### ~~View: isometric~~ *(superseded 2026-11-08 21:45 UTC by ¾, below)*
*2026-11-08 21:37 UTC*

- ~~**The game view is true 2:1 isometric**~~, chosen after comparing all three in-game. It's now the default; top-down and ¾ stay available in the Tuning panel for comparison and debugging.
- **WASD and the touch stick are screen-relative:** up walks up the screen, right walks right, whatever the view.
- **Next for the art:** draw the environment properly for isometric per the art doc, and rewrite `ART_STYLE.md`'s perspective section (it still describes three-quarter).

### View: ¾ (three-quarter)
*2026-11-08 21:45 UTC*

- **2026-11-08 21:56 UTC: the other views are removed from the game.** ¾ is the only view; there's no view switcher. (The projection layer keeps the maths for the others, unused.) F3's collision view now draws in ¾.
- **The game view is ¾:** an oblique view from the south. The world grid stays lined up with the screen (up is north, walls run straight across or up, rooms are rectangles), but you still see tops and front faces, and heights rise up the screen. Chosen over isometric because it's easier to read and reason about while keeping the 3D feel. It's the default; the others stay in the Tuning panel.
- **Screen-relative WASD and touch stick** carry over.
- **Next for the art:** draw the environment properly for ¾ per the art doc, and rewrite `ART_STYLE.md`'s perspective section to match.

### Walls: up / cutaway / down (Sims-style)
*2026-11-08 21:45 UTC*

- **Three wall modes**, switched with a walls button on the bottom bar (or V), remembered between sessions:
  - **Walls up:** full height. If a wall hides the character you control, that bit fades.
  - **Cutaway (default):** walls standing in front of a room (floor behind them from the camera's point of view) are cut down to knee height, and side walls step down along their front stretch, doll's-house style. Back walls stay up. Any wall that would hide the character you control also drops.
  - **Walls down:** every wall is a low stub.
- Walls glide up and down rather than snapping. A cut wall shows a darker cross-section on top. Doors are cut down with their wall.
- **Placeholders:** cut height 0.35 m; side walls step down within 2.5 m of a room's front; glide speed 7 m/s.

### Doors and windows in walls
*2026-11-08 21:53 UTC*

- **Doors** stand on a stone threshold with wall carried on above them (a lintel piece), instead of a gap over the door.
- **Windows: glass and shutters** (both, since the setting isn't fully decided):
  - **Glass** opens inwards and can be **latched only from inside** the room. You can see through it; closed, it muffles sound like the wall.
  - **Shutters** outside open and close from either side. Closed, they **block sight**. *(2026-11-08 21:56 UTC: open, they fold right back flat against the outside of the wall.)*
  - **Climb through** when both glass and shutters are open: walk up, climb over, land on the other side. It makes a little noise, and **anyone who sees it remembers it** ("Saw Edric climb through a window"), groundwork for burglary and witnesses.
  - ~~Windows always block walking and pathfinding; NPCs don't climb through them yet.~~ *Updated 2026-11-08 22:03 UTC, below.*
- **2026-11-08 22:03 UTC: NPCs use doors and windows** (PLACEHOLDER rules):
  - **Windows as a route:** NPCs can route through windows, at a cost of ~6 m of extra walking, so they only do it when it's genuinely shorter. From inside, they open it right up (unlatch, glass, shutters) and climb out; from outside, only if it's already open.
  - *2026-11-08 22:09 UTC:* **from outside, an unlatched window can be opened** (glass and shutters) and climbed through, by NPCs and by you; **only the latch keeps people out.** The "Climb through" option opens the window up first if needed, and is only unavailable from outside a latched window.
  - **Locked doors:** from inside, an NPC wanting to leave unbars the door (cost ~2 m) and goes out, without relocking. From outside, a locked door is a wall (no keys yet).
  - ~~**Your character's click-to-walk never routes through windows.**~~ *Changed 2026-11-08 22:06 UTC:* your click-to-walk walks normally if it can, and **only if there's no other way** (e.g. the door's locked) does it climb through an open window, or unbar a locked door from inside, like the NPCs. You get a message when it's going to climb ("There's no other way: you'll have to go through a window."), and "You can't find a way there." when there's no route at all.
  - **Idle:** NPCs sometimes open or close windows and shutters.
  - Built as "links" in the pathfinder: hops between two points with an action attached (climb / unbar).
  - Emergent bits this already allows: a locked-in NPC lets themselves out; someone outside a locked house gets in through an open window (and is seen doing it).
- Windows sit in walls with a low wall under them (sill, 0.9 m) and wall above (from 1.8 m). The whole window drops with its wall in cutaway / walls down.
- The test house has one window in each wall. Placeholder art.

### Calendar
*2026-11-08 22:14 UTC*

- **7 days a week · 4 weeks a month (28 days) · 3 months a season · 12 months a year · 48 weeks a year · 336 days a year.**
- So: four seasons of 84 days; every month is exactly four weeks, and every month and season starts on the same weekday.
- Still open (see Time model): how long a day lasts in real time, and how fast time runs in each view.
- *2026-11-08 22:18 UTC:* a "day" means **day + night of equal length**. Options under discussion: 10 (5+5), 20 (10+10), 30 (15+15) or 40 (20+20) real minutes per full day.

### No fast-forward in direct control
*2026-11-08 22:18 UTC*

- **Direct control always runs at normal speed (1×).** Fast-forward exists only in the overview. Pausing is still allowed.
- So the day length is how long everything takes while you're in someone's shoes, waiting and sleeping included. Skipping time (a night, a wait) means zooming out to the overview.
- Implications: zooming out becomes part of everyday play (e.g. sleeping through the night), so the overview needs to be pleasant to drop into for that. The greyed-out speed buttons on the direct-control bar contradict this and should come off (they belong to the overview).
- ~~*Under consideration (2026-11-08 22:21 UTC):* an exception tied to actions: a TES-style wait (choose how many hours) and/or sleeping/waiting that speeds time up, ending when the action ends. Not a free speed control. Open: a skip/fade versus a visible speed-up; what can interrupt it (noises, people, threats via the senses system).~~ *(superseded below)*

### Waiting and sleeping
*2026-11-08 22:31 UTC*

**Agreed:**
- Both a **TES-style wait** (pick how many hours) and **sleep**. Both show a **visible speed-up**: you watch the world carry on fast around you. Time goes back to normal the moment it ends.
- **Your senses can cut it short.** Noises, someone hitting you, seeing a fight. Sleeping takes more to rouse you than waiting does, and sleepers see nothing (eyes shut).
- This is the only exception to "no fast-forward in direct control". The ▶▶/▶▶▶ buttons are off the bar.

**Implemented, with my PLACEHOLDER calls (change freely):**
- Wait: **Wait…** on your own menu (click yourself). Sleep: click the **bed** (a placeholder bed in the house's north-west corner). Both open a "how long?" dialog (1–24 h) that pauses the game behind it. Sleep defaults to "until dawn" if that's within 12 hours, else 8 hours.
- Speed while resting: **60×** (an 8-hour sleep ≈ 10 real seconds at the placeholder day length). Slower machines get less, because it's capped at a 10 ms budget per frame; the bar shows the actual speed (e.g. "×60").
- What interrupts it: being hit (always); a shout, raised voices, a thud or a door bang if heard clearly enough (higher bar when asleep, and footsteps and chatter never do); hearing fighting; and while waiting only, seeing an attack or smelling blood. Moving, clicking, fighting, talking, sneaking or switching person also ends it. Cancel via the action chip ✕.
- ~~Nobody talks to a sleeping character. People chatting to you while you *wait* don't interrupt it (undecided whether they should).~~
- *2026-11-08 22:39 UTC, agreed:* **nobody comes up to talk to you while you're waiting or sleeping.** Anyone already on their way over gives up. Your senses can still wake you (noises, being hit, etc.).
- *2026-11-08 22:39 UTC, agreed:* a **⏳ Wait button** on the bar, in place of the "?" help button. Pressing it while resting stops the rest. (The controls cheat-sheet that lived behind "?" is gone for now.)

### Game clock
*2026-11-08 22:31 UTC*

- The clock runs, using the decided calendar. The bar shows the time (☀️/🌙) and "Day · Month · Year". Month and weekday names are undecided, so they're numbers for now.
- PLACEHOLDERS: a full day lasts **30 real minutes** (one constant, `DAY_REAL_MINUTES`; day length is still undecided), day runs 06:00–18:00, and the game starts at 07:00 on day 1. No lighting change at night yet.

### Ages and life stages
*2026-11-09 01:10 UTC*

- **Everyone has a real age in whole years** (0 to about 100) and a **birthday**: the day of the year they were born on (1–336), so birthdays are spread across the year. Age goes up by one on each birthday.
- **Life stages are labels over age ranges**, Sims-style but with a preteen stage. Deliberately modern rather than historically accurate (creative liberty):

  | Stage | Ages |
  |---|---|
  | Baby | 0 |
  | Toddler | 1–3 |
  | Child | 4–9 |
  | Preteen | 10–12 |
  | Teenager | 13–17 |
  | Young adult | 18–29 |
  | Adult | 30–64 |
  | Elder | 65+ |

- *Supersedes the idea of brackets without ages* (each person spending a random 3–5 years in a bracket): the sim needs a number anyway, and real ages are simpler.
- *2026-11-09 01:52 UTC:* **Who can be played: everyone from Child (4) up.** Babies (0) and toddlers (1–3) stay part of the family but can't be played; they become playable on turning 4. In game: they can't be chosen in character creation (age starts at 4) or taken control of ("Too young to play").
- **Who can fight whom** (decided earlier, recorded now): young adults, adults and elders can attack each other. **Teenagers can only attack teenagers.** **Children (preteens and younger) can't attack or be attacked at all**, not even by other children. This is a hard rule.

### Life simulation
*2026-11-09 02:26 UTC*

- **The design lives in the "Life Simulation Design" doc** (needs, mood and traits, daily life, objects and items, food chain, skills, work and money, homes, health and death, children, relationships, leisure, drink, animals, crime). Decided there through Q&A; built in slices, not all at once.
- **Slice 1, built:** needs and objects.
  - **Nine needs** (hunger, thirst, rest, warmth, hygiene, bladder, company, comfort, fun) on the game clock. Each has its own effects (tired = slower, hungry or exhausted = conversations go worse) and feeds mood alongside **moodlets** ("Slept in a bed", "Saw a fight", "Wet myself"…). Live in the Needs tab with mood and feelings; signs over people's heads (🥱, 💧, 🥶…).
  - **Neglect bites:** thirst, hunger and cold cost health (at nothing, they collapse; death itself isn't built yet). Exhausted people fall asleep where they stand. Hold it too long and there's an accident.
  - **Objects offer actions** and say which needs they help: bed and straw pallet (sleep), bench (sit), hearth and the cooking fire (warm yourself), well (drink, wash), privy, larder (eat), ale barrel. The house is furnished with these, plus a table, and a privy outside.
  - **NPCs see to their needs first**, choosing the most useful action nearby, with a simple routine (bed at night, meals around 7, 12 and 18). Otherwise they wander and chat (more when lonely). **NPCs now sleep.**
  - **Free will:** leave the person you control alone for 15 seconds and they look after themselves; any input takes back control.
  - PLACEHOLDERS: every number (drain rates, gains, thresholds, moodlet values, mood formula); the larder's endless food (real food comes with items); warmth from season, time, indoors and fires only (no weather or clothing yet), with the year assumed to start in spring; no traits weighting choices yet; the furniture's plain-box art and layout.

### Art pass: the catalogue
*2026-11-09 02:40 UTC*

- **The game's art is now being made in the art-style document's style** (detailed, layered, cel-shaded SVG; elevated ¾; 1 SVG unit = 1 world pixel).
- **Setting: invented but grounded** in real ~~medieval~~ Europe, not one region. *(Period changed 2026-11-09 03:58 UTC: Stuart era, see "Period" below.)* **For now: temperate and green** (mild wet summers, cold winters, oak woods, fields, hedges, a river). Kept open: if there's a wider world outside the town, it could have **biomes, each with towns whose building styles match**, so materials and styles should be easy to swap per region.
- **Method: a catalogue first**, on design boards (one board per category, approved and tweaked before anything goes into the game), the same way as the character mock-ups.
- **Variety: quality tiers (poor / ordinary / fine) and a few looks within each tier.**
  - *2026-11-09 03:20 UTC:* **tiers describe each piece, not matched sets.** Walls, floors, roofs and furniture are independent: any wall with any floor (cheap walls with a fine floor is fine), in preset buildings and in a future build mode alike.
- **Modular pieces join seamlessly:** walls meeting at corners or in a straight run read as one thing (one outline, texture carrying on across the join); the same for floors across a room.
- **What the catalogue covers:**
  - **Buildings:** homes (cottage, townhouse, better-off house, manor), trade buildings (bakery, forge, mill, brewery or alehouse, workshop, barn, stable), public (church, tavern or inn, market hall or stalls, town gate and walls), outbuildings (privy, woodshed, pigsty, henhouse, well, fences, gates).
  - **Building parts:** walls by material (wattle-and-daub, timber frame, stone, plank, with worn and damaged versions), floors (earth with rushes, planks, flagstones, tiles), roofs (thatch, shingles, clay tiles, slate), doors, windows (shutters, rare glazing), stairs and ladders.
  - **Outdoors:** ground (grass, dirt, mud, cobbles, gravel, sand, with blended edges), water (river, stream, pond, ford, bridge, mill race), plants (trees, bushes, hedges, flowers, weeds, crops by growth stage), and seasonal versions.
  - **Furniture:** sleeping (pallet to curtained bed, cradle), seating and tables, storage (chests, cupboards, shelves, barrels, sacks, baskets, crates), hearth and kitchen.
  - **Household items:** tableware (wooden and pewter), cooking gear, light (candles, rushlights, lanterns), cleaning and care (broom, bucket, basin, chamber pot, linen).
  - **Food and drink:** raw, cooked, drink and containers, each food fresh, stale and rotten.
  - **Tools and goods:** farming, crafts, trade goods, money.
  - **Animals:** livestock and young, working animals with carts and ploughs, pets and vermin, wild animals.
  - **Details:** dirt and wear, bodies and graves, fire and smoke at several sizes, weather overlays.
- **Not in this pass:** weapons (later); clothing (its own pass afterwards).
- **First board: buildings and structure.**
- *2026-11-09 04:10 UTC (after the Stuart-era decision):* walls are wattle and daub, timber frame, rubble, **brick (Flemish bond)**, dressed stone and planks. Floors are earth and rushes, boards, flagstones, **plain red quarry tiles**, the red-and-yellow glazed chequer (kept because it looks good, though it's an older style) and **black-and-white marble on the diagonal**. Undecided: carpets and rugs (in this period mostly a luxury thrown over tables; probably objects laid on a floor rather than a floor type) and rush matting (what most homes actually had).

### Period: the Stuart era
*2026-11-09 03:58 UTC*

- **~~Medieval~~ → the Stuart era (roughly 1603–1714).** "Medieval" was a first thought, not a commitment; none of the systems built so far depend on it. The setting stays invented but grounded, so this pins down technology, look and society, not a real place or real history.
- **It can borrow from either side:** Tudor buildings still standing and in use (timber-framed houses, old halls), and early Georgian things just arriving (sash windows, brick terraces) where they fit.
- **Knock-on effects to work through as they come up:** firearms exist (matters when weapons are designed); print, newspapers, pamphlets and contracts make Letters a bigger skill and spread gossip and news; chimneys and glazing are normal in ordinary homes; coffee houses alongside alehouses; post-Reformation church (services, not Mass). Money is unchanged (pounds, shillings, pence).
- **The art so far mostly survives:** wattle and daub, timber frame, rubble, dressed stone, planks, earth floors, boards and flagstones were all still in use. The glazed floor tiles are a medieval style and may want a period update.
- The repository keeps its name.

---

## Undecided

### Time model
*2026-11-08 18:52 UTC*

- How time runs in each layer: speeds, compression, pausing, skips.
- How the overview and direct-control clocks relate. Does dropping in force real-time? Can time advance while controlling someone?
- Overall time scale of a playthrough (years? generations?).
- *2026-11-08 22:14 UTC: the calendar is decided (see Calendar). Still open: real-time length of a day, speeds, and how the clocks of the two views relate.*
- *Note:* the two-layer presentation largely addresses the conflict between real-time play and life-scale simulation, but the specifics remain open.
- *2026-11-09 01:10 UTC:* generational play (skipping years and generations) happens in the zoomed-out view, so a game year can stay a full 336-day year; direct control doesn't need to squash a lifetime.

### Line extinction and player continuity
*2026-11-08 18:52 UTC*

- What happens when no playable characters remain (game over, or something else)?
- Long-term growth of the playable roster: over several generations, descendants could make up a large share of a small town. Is that a problem for crime and stakes, or an intended late-game arc?

### Possessed characters' own minds
*2026-11-08 18:52 UTC*

- When the player drives a character to act against their nature, does the character remember choosing it? Does it change them (memories, personality, guilt)?
- How (or whether) to handle the player knowing things the controlled character doesn't.

### View perspective (being compared in-game)
*2026-11-08 21:29 UTC*

- **All three views are in the game for side-by-side testing**, switched with the view button on the bottom bar (remembered between sessions):
  - **Top-down:** straight overhead, as before.
  - **¾ view:** an oblique view from the south; you see tops and south faces, and heights rise up the screen.
  - **True 2:1 isometric:** from the south-east, ground axes along the diagonals.
- The simulation is unchanged: it all happens on the ground plane, and the view is just a projection (`src/game/view/projection.ts`). Clicks, taps and mouse aim map back to the ground.
- **For the comparison only:** the environment is placeholder blocks with height (walls 2.4 m, crates 0.8 m, door 2 m…). In the angled views, walls split into 1 m chunks for correct draw order, and chunks hiding the character you control fade out.
- ~~**To decide:** which view to keep.~~ *Decided 2026-11-08 21:37 UTC: isometric.* Then the environment art gets drawn properly for that view per the art doc, and `ART_STYLE.md`'s perspective section gets rewritten to match.
- *Supersedes, if a non-top-down view is chosen:* "the view is full top-down" in Visual direction above.

### Historical setting and legal structure
*2026-11-08 18:52 UTC*

- *2026-11-09 03:58 UTC: the place is decided (invented but grounded) and so is the period (Stuart era; see "Period" under Agreed). Still open: the legal structure (courts, punishments, inheritance law, how much trades are regulated beyond "loosely").*
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
- **Point-and-click numbers (2026-11-08 19:53 UTC):** run if the route is over 6 m; while following, run beyond 4 m and walk again inside 3 m; hold 180 ms (mouse) / 250 ms (touch) to start following. Clicking inside something solid walks to the nearest standable spot within 2 m. Placeholders.
- **Move orders** (`src/game/navigation/MoveOrder.ts`) are pure TypeScript and driver-agnostic, so NPCs can use the same "go there" logic later.
- **People sandbox placeholders (2026-11-08 20:18 UTC):**
  - temperaments Bold/Wary/Meek; yield at 25%/45%/immediately
  - punches 9 (right) / 6 (left), and each hit lowers the victim's opinion of the attacker by 10
  - yield lasts 25 s, knockout 15 s (you wake on 20 health)
  - health regenerates after 8 s without being hit
  - social success chances and opinion shifts per action (`src/game/social/socialActions.ts`)
  - starting opinions random (seeded)
  - idle choice weights: wander 5, idle 2.5, use object 1, chat 2

  The whole cast is a test cast.
- **Not yet (2026-11-08 20:18 UTC):** ~~bystanders don't react to violence they see~~ *(done 2026-11-08 20:36 UTC: see Senses)*; no grudges or revenge after a knockout; insults never escalate to fights on their own; no action queue (one thing at a time); NPCs don't open doors deliberately, they just push through.
- **Seeded randomness (2026-11-08 20:18 UTC):** NPC choices and social outcomes use a seeded RNG (`src/game/util/rng.ts`), a first step toward reproducible simulation.
- **Senses placeholders (2026-11-08 20:36 UTC):**
  - sight 14 m with a 120° cone; awareness gain 2.2/s at full visibility, decays 0.2/s; noticed at once within 1.2 m
  - sneaking ×0.35 visibility; standing still ×0.75; running ×1.3
  - loudness in metres: footsteps 3 (running 7, sneaking 0), punch 10, shout 18, talk 5, quarrel 9, door up to 6, thud 8; each wall keeps 35%
  - presence 1.6 m; blood smelled within 2.5 m; trails fade over 40 s, blood over 3 min
  - fire smell radius 10 m, midden 5 m
  - memory half-life 3 min (real time, not game time)
  - intervene if you like one side 15+ more than the other
  - walls and crates block sight; the well, fire, dummy, chest and sign don't
- **Not yet (2026-11-08 20:36 UTC):** witnesses don't tell anyone what they saw (no gossip/reporting); memories don't change behaviour later (no grudges); NPCs don't follow trails; no lighting or night; NPCs don't check behind themselves; walls and closed doors muffle sound but sound doesn't route round through doorways.
- **Reach checks** ignore line of sight for now (you could, in principle, use something through a thin wall).
- **Character and objects** are placeholder geometry, not final art.
- **Door placeholders (2026-11-08 19:32 UTC):** ~~doors swing both ways up to 90° (real medieval doors usually swing one way).~~ *Moved to Agreed 2026-11-08 19:33 UTC.* Anyone can lock any door: no keys, ownership or lockpicking yet. Doors don't collide with furniture while swinging. No door weight or resistance yet; a first attempt at faking weight shoved the player into the door frame. *(2026-11-08 19:37 UTC: doors made lighter: they keep swinging after a push (momentum 1.4×) and slow gently (friction 2.2/s). Both are live-tunable in the debug panel; values are placeholders.)* *(2026-11-08 19:42 UTC: added closing weight 7, bounce 30%, thud threshold 0.8 rad/s. Closing weight is tunable; all placeholders.)*
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

### Lying down; bumping into people
*2026-11-08 22:50 UTC*

**Agreed:**
- Knocked out and asleep use **the same figure as standing, lying on its back** (rotated onto the floor or the bed and foreshortened by the view), not a separate flat drawing.
- **How much people shove each other depends on the person** (traits, size, etc.).

**Implemented, with my PLACEHOLDER calls:**
- Lying: face up with eyes shut. Arms at the sides when asleep, flung out when knocked out.
- Movement fix (bug): touching anything used to wipe your speed every frame, so you crawled past people and objects. Now only the part of your movement going straight into something solid is cancelled.
- People no longer use the physics engine's own collision with each other (it split every bump 50/50). When two people bump, each gives way in proportion to how easy they are to shift. "Resistance" is roughly kilograms of stand:
  - weight × (1 + Labour skill / 20, standing in for strength)
  - × temperament: bold 1.15, wary 1, meek 0.8
  - × traits: Strong 1.25, Stubborn 1.2, Hot-headed / Brash 1.15, Cautious 0.9, Gentle 0.85
  - × 1.3 when braced (standing still, squared up or crouched), × 0.7 when out cold (limp)
- Builds are placeholders in the mock profiles: Edric 1.75 m / 80 kg, Agnes 1.62 / 58, Maud 1.57 / 54, Wat 1.86 / 96. Sizes don't change how anyone's drawn yet.
- Result: Maud walking into Wat stops dead (he moves ~0.2 m); Wat walking into Maud shoves her ~1.8 m in 3 s, and sprinting he bowls her ~4 m. Off-centre, you slide round people.

### Performance test scene (tooling)
*2026-11-08 23:07 UTC*

- Open with **`?scene=perf`**, or Tuning → "Performance test scene". An open field with some crates, you, and as many people as you want: +1 … +500 buttons add, and the box **sets the total** (you included, up to 5000), spawning or removing people to match. Everyone runs the full game simulation: brains, senses, bumping, physics, drawing. Reset reloads with nobody but you.
- Live HUD: FPS, 1% low, ms/frame, ticks/s (world steps per second), a frame-time graph, heap (Chrome only), and ms per frame for each part: scene update (brains, movement, bumping, senses, UI feed), physics, drawing, render.
- **Run 30 s test → CSV** records every frame and downloads a CSV: one row per frame with every timing, plus a header block with device, renderer, canvas size and the summary (average FPS, 1% low, p95 frame time, ticks/s).
- First finding: **senses dominate**. Everyone checks sight against everyone else 10 times a second, so the cost grows with the square of the headcount. In the test browser: ~4 ms/frame at 50 people, ~52 ms at 200, ~725 ms at 500. Drawing and physics stay small. Not optimised: that's a separate decision.
- Bug found and fixed along the way: since the waiting/sleeping change, senses and footstep noise had been running **twice per tick** in the normal game.
- *2026-11-08 23:30 UTC: senses and render optimised (asked for, to get the benchmark right).* Behaviour unchanged; same look.
  - **Senses:** each person's senses still tick about 10× a second, but people are updated a few at a time across frames (no spike). They only compare people within sight range (a spatial grid). The line-of-sight check, the expensive part, only runs if the target is in range and in their field of view. Noise skips counting walls for anyone out of earshot. Scent marks are indexed by kind, so looking for blood no longer scans everyone's trails.
  - **Render:** people are no longer redrawn as vector shapes every frame. Each body part is baked once per facing into shared texture sheets (five facings plus mirroring), in white, and each person is a set of tinted sprites. Lying down is the same sprites rotated.
  - Test browser (no GPU, so frame rates there aren't meaningful), ms per frame at 501 people: senses 725 → 72, render 159 → 12. At 51 people: senses 4.1 → 0.8, render 17.8 → 1.2.

### Off-screen level of detail (middle tier)
*2026-11-08 23:44 UTC*

**Agreed:** the middle tier, with a toggle.
- People near the camera (on screen plus a 3 m margin, and always the person you control) get the full simulation.
- Everyone else gets a cheaper one. They still think, walk their routes (walls and doors still apply), hear noises and witness attacks, because those are events. They don't do the regular look-around (sight and smell sweeps), and they don't bump into each other.
- Off-screen people and scenery aren't drawn. That's separate from the toggle: drawing what nobody can see is never useful.
- Toggle: perf HUD "Off-screen LOD: on/off" (on by default; the setting is shared, so the sandbox uses it too). Off = everyone in full detail, the worst case. The HUD shows "Full detail: N of M", and the CSV records whether LOD was on plus a `full_detail` column.
- PLACEHOLDER/known: "near" is camera-based. When the overview zoom exists, zoomed out shows everything, so it'll need a rule like "near the camera's focus" and/or "household always full detail". Smelling blood off screen doesn't happen (it's part of the look-around), but blood is still there to be smelt when someone comes near.

**Perf test field:** now 240 × 160 m (village-sized) with about one crate per 150 m², and people spawn across the whole field. Supporting fixes: route-finding reuses its working memory (it was allocating whole-map arrays per route), bumping uses a local grid instead of every pair, and scenery off camera isn't drawn.
- *2026-11-08 23:59 UTC: garbage-collection hitches.* Allocation measured with Chrome's sampler at 500 people: about **48 → 19 MB/s** of garbage. Fixes:
  - **Route-finding:** reuses its queue and tables; the queue no longer allocates on every swap; no new point per searched cell; goals can give a plain distance; no empty list per cell for links.
  - **Movement:** steps people's motors in place and reuses one input object; standing still shares one "not moving" value.
  - **Noise:** only nearby listeners are checked (the senses grid). The footstep log is only kept while the debug overlay is on.
  - **Physics:** wall collisions only for people in full detail (as agreed for the middle tier: off-screen people walk planned routes without physics); Arcade's per-frame tree of all moving bodies is off (people don't collide through Arcade).
  - **Drawing:** only the ground near the camera is drawn; the "controlled" ring is only created for people who are ever controlled.
  - Checked: nobody ends up inside a crate; the sandbox's waiting, sleeping, waking and senses checks pass.
- *Pre-existing quirk, noted (not changed):* if you can already see whoever made a noise, you don't "hear" it as news. So a shout from someone you're watching won't interrupt a wait.

### Fixed simulation rates (Minecraft-style ticks)
*2026-11-09 00:15 UTC*

**Agreed:** the world at **20 ticks a second**, movement at **60**.
- **World ticks (20/s, every 50 ms):** brains, conversations, footstep noise, senses.
- **Movement steps (60/s):** routes, motors, doors, climbing, poses, knockback, and Arcade's physics, which the game now steps itself instead of once per rendered frame.
- **Drawing** happens every frame, with people's positions smoothed between movement steps, so 120 Hz screens stay fluid. Big jumps (teleports, climbing, getting into bed) aren't smoothed.
- **Falling behind:** the game runs extra steps to stay on real time, up to 8 a frame or 40 ms of work; past that, time slips instead of the screen freezing. This replaces the old "below 20 fps everything goes into slow motion".
- **Waiting and sleeping** are now simply "run many steps per frame" (within a 10 ms budget). This made a 3-hour wait about twice as quick to sit through in the test browser.
- The perf HUD's **ticks/s** now means world ticks (about 20). Per-frame timings can include more than one step on slow frames (the CSV's `ticks` column shows world ticks per frame).
