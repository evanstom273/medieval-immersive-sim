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
| Lock / unlock a door | Click it (walks there if out of reach) |
| Use something else (exploring) | Left click — walks there if out of reach |
| Right hand / left hand (combat) | Left click / right click |
| Lock on to a target (combat) | F or middle click |
| Zoom | Scroll wheel |
| Show collision | F3 |

On touch screens: drag on the left half for a floating stick (push to the rim to sprint), tap the ground to walk there (press and hold to follow your finger), tap things to use them, pinch to zoom. The buttons bottom-right are Sneak, Ready/Relax, and in combat Left, Right and Lock.

The **Movement tuning** panel (top right) live-edits speeds, acceleration and turn rates.

Everything on screen is placeholder geometry for tuning feel — not final art.

## Layout

- `src/game/movement/` — character motor and tuning. Pure TypeScript, no Phaser.
- `src/game/navigation/` — grid pathfinding. Pure TypeScript, no Phaser.
- `src/game/camera/` — continuous zoom rig with view bands (direct control now, overview later). Pure TypeScript.
- `src/game/input/` — touch input bridge.
- `src/game/world/` — placeholder character and interactable objects (Phaser), plus door swing physics (pure TypeScript).
- `src/game/scenes/` — the movement test scene (Phaser).
- `src/ui/` — React HUD, touch controls and tuning panel.
