import { useState } from 'react';
import { DEFAULT_TUNING, tuning, type MovementTuning } from '../game/movement/tuning';
import { loadScale, saveScale, type BuildingScale } from '../game/buildings/scale';
import { DEFAULT_DOOR_TUNING, doorTuning, type DoorTuning } from '../game/world/doorPhysics';
import { gameRestart, uiCommands } from '../game/bridge';

/** Debug panel for live-tuning movement feel. Writes straight into the shared tuning object. */

const FIELDS: { key: keyof MovementTuning; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: 'crouchSpeed', label: 'Sneak speed', min: 0.2, max: 3, step: 0.05, unit: 'm/s' },
  { key: 'walkSpeed', label: 'Walk speed', min: 0.5, max: 4, step: 0.05, unit: 'm/s' },
  { key: 'sprintSpeed', label: 'Sprint speed', min: 1, max: 9, step: 0.1, unit: 'm/s' },
  { key: 'acceleration', label: 'Acceleration', min: 1, max: 60, step: 0.5, unit: 'm/s²' },
  { key: 'deceleration', label: 'Deceleration', min: 1, max: 60, step: 0.5, unit: 'm/s²' },
  { key: 'turnRateExplore', label: 'Turn rate (moving)', min: 90, max: 1800, step: 10, unit: '°/s' },
  { key: 'turnRateCombat', label: 'Turn rate (combat)', min: 90, max: 1800, step: 10, unit: '°/s' },
];

const DOOR_FIELDS: { key: keyof DoorTuning; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: 'momentum', label: 'Door momentum', min: 0, max: 3, step: 0.05, unit: '×' },
  { key: 'friction', label: 'Door friction', min: 0.2, max: 10, step: 0.1, unit: '/s' },
  { key: 'closing', label: 'Door closing weight', min: 0, max: 25, step: 0.5, unit: '' },
];

export function TuningPanel({ perf = false }: { perf?: boolean }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<MovementTuning>({ ...tuning });
  const [doorValues, setDoorValues] = useState<DoorTuning>({ ...doorTuning });
  // Building scale: saved, and applied by rebuilding the game (same person, fresh world).
  const [built, setBuilt] = useState<BuildingScale>(() => loadScale());
  const [scale, setScale] = useState<BuildingScale>(built);
  const scaleChanged = scale.size !== built.size || scale.height !== built.height;

  const setDoor = (key: keyof DoorTuning, value: number) => {
    doorTuning[key] = value;
    setDoorValues({ ...doorTuning });
  };

  const set = (key: keyof MovementTuning, value: number) => {
    tuning[key] = value;
    setValues({ ...tuning });
  };

  const reset = () => {
    Object.assign(tuning, DEFAULT_TUNING);
    setValues({ ...tuning });
    Object.assign(doorTuning, DEFAULT_DOOR_TUNING);
    setDoorValues({ ...doorTuning });
  };

  return (
    <div
      className={`absolute overflow-y-auto rounded bg-black/70 font-mono text-xs text-stone-200 ${open ? 'max-h-[calc(100vh-8rem)] w-72 max-w-[calc(100vw-2rem)]' : 'w-fit'}`}
      style={{ top: 'max(1rem, env(safe-area-inset-top))', right: 'max(1rem, env(safe-area-inset-right))' }}
    >
      <button
        className="w-full px-3 py-2 text-left hover:bg-white/5"
        onClick={(e) => {
          setOpen(!open);
          e.currentTarget.blur();
        }}
      >
        {open ? '▾ Movement tuning' : '▸ Tuning'}
      </button>
      {open && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          {!perf && (
            <div className="flex flex-col gap-2 rounded bg-white/5 p-2">
              <span className="text-stone-300">Buildings (test)</span>
              {(
                [
                  { key: 'size', label: 'Room size', min: 1, max: 5, step: 0.25 },
                  { key: 'height', label: 'Storey height', min: 1, max: 2, step: 0.1 },
                ] as const
              ).map((f) => (
                <label key={f.key} className="flex flex-col gap-0.5">
                  <span className="flex justify-between">
                    <span>{f.label}</span>
                    <span className="text-stone-400">{scale[f.key].toFixed(2)}×</span>
                  </span>
                  <input
                    type="range"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={scale[f.key]}
                    onChange={(e) => setScale({ ...scale, [f.key]: Number(e.target.value) })}
                    onPointerUp={(e) => e.currentTarget.blur()}
                  />
                </label>
              ))}
              <button
                className="rounded bg-white/10 px-2 py-1 enabled:hover:bg-white/20 disabled:opacity-40"
                disabled={!scaleChanged}
                onClick={() => {
                  saveScale(scale);
                  setBuilt(scale);
                  gameRestart.emit(null);
                }}
              >
                {scaleChanged ? 'Rebuild with these (restarts the world)' : 'Change a slider to rebuild'}
              </button>
            </div>
          )}
          {FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-0.5">
              <span className="flex justify-between">
                <span>{f.label}</span>
                <span className="text-stone-400">
                  {values[f.key]} {f.unit}
                </span>
              </span>
              <input
                type="range"
                min={f.min}
                max={f.max}
                step={f.step}
                value={values[f.key]}
                onChange={(e) => set(f.key, Number(e.target.value))}
                // Hand keyboard focus back to the game so WASD doesn't nudge the slider.
                onPointerUp={(e) => e.currentTarget.blur()}
              />
            </label>
          ))}
          {DOOR_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-0.5">
              <span className="flex justify-between">
                <span>{f.label}</span>
                <span className="text-stone-400">
                  {doorValues[f.key]} {f.unit}
                </span>
              </span>
              <input
                type="range"
                min={f.min}
                max={f.max}
                step={f.step}
                value={doorValues[f.key]}
                onChange={(e) => setDoor(f.key, Number(e.target.value))}
                onPointerUp={(e) => e.currentTarget.blur()}
              />
            </label>
          ))}
          <button
            className="mt-1 rounded bg-white/10 px-2 py-1 hover:bg-white/20"
            onClick={(e) => {
              uiCommands.emit({ kind: 'toggleSenses' });
              e.currentTarget.blur();
            }}
          >
            Toggle senses overlay (F4)
          </button>
          <button className="mt-1 rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={reset}>
            Reset to defaults
          </button>
          <a className="mt-1 block rounded bg-white/10 px-2 py-1 text-center hover:bg-white/20" href={perf ? '?' : '?scene=perf'}>
            {perf ? '← Back to the sandbox' : 'Performance test scene →'}
          </a>
        </div>
      )}
    </div>
  );
}
