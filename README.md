# medieval-immersive-sim

A browser-based, top-down 2D medieval life immersive simulator. See `DESIGN_LOG.md` for what's agreed, undecided and under consideration.

## Running the movement prototype

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (motor, pathfinding)
npm run build    # typecheck + production build
```

### Controls

| Action | Input |
| --- | --- |
| Move | WASD, or left-click the ground (hold to keep following the cursor) |
| Sprint | Hold Ctrl |
| Sneak | Shift (toggle) |
| Ready / relax (combat mode) | R |
| Open doors | Walk into them |
| Interact with a person or thing | Click it for a radial menu (talk, fight, take control; lock doors, open chests…) |
| Switch character | 1–4, or click a portrait |
| Right hand / left hand (combat) | Left click / right click |
| Lock on to someone (any time; you keep facing them) | F or middle click |
| Talk to whoever you're locked on to / facing | E |
| Zoom | Scroll wheel |
| Show collision | F3 |
| Senses debug overlay (vision cones, noise, scents) | F4, or the Tuning panel |

On touch screens: drag on the left half for a floating stick (push to the rim to sprint), tap the ground to walk there (press and hold to follow your finger), tap people and things for their menu, tap a portrait to switch (tap your own for your card), pinch to zoom. The buttons bottom-right are Sneak, Ready/Relax, and in combat Left, Right and Lock.

The **Movement tuning** panel (top right) live-edits speeds, acceleration and turn rates.

Everything on screen is placeholder geometry for tuning feel — not final art.

## Layout

- `src/game/movement/` — character motor and tuning. Pure TypeScript, no Phaser.
- `src/game/navigation/` — grid pathfinding. Pure TypeScript, no Phaser.
- `src/game/camera/` — continuous zoom rig with view bands (direct control now, overview later). Pure TypeScript.
- `src/game/input/` — touch input bridge.
- `src/game/world/` — placeholder character and interactable objects (Phaser), plus door swing physics (pure TypeScript).
- `src/game/characters/` — characters (shared by player and NPCs) and the NPC brain.
- `src/game/social/`, `src/game/combat/` — relationships, social actions, combat rules. Pure TypeScript.
- `src/game/perception/` — sight, hearing, smell, awareness and memories (rules are pure TypeScript).
- `src/game/scenes/` — the sandbox scene (Phaser).
- `src/ui/` — React HUD, portraits & character card, radial menu, touch controls, tuning panel.
