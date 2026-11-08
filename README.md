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
| Move | WASD |
| Sprint | Hold Ctrl |
| Sneak | Shift (toggle) |
| Ready / relax (combat mode) | R |
| Use something (exploring) | Left click — walks there if out of reach |
| Right hand / left hand (combat) | Left click / right click |
| Show collision | F3 |

The **Movement tuning** panel (top right) live-edits speeds, acceleration and turn rates.

Everything on screen is placeholder geometry for tuning feel — not final art.

## Layout

- `src/game/movement/` — character motor and tuning. Pure TypeScript, no Phaser.
- `src/game/navigation/` — grid pathfinding. Pure TypeScript, no Phaser.
- `src/game/world/` — placeholder character and interactable objects (Phaser).
- `src/game/scenes/` — the movement test scene (Phaser).
- `src/ui/` — React HUD and tuning panel.
