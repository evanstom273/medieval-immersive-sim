import { useEffect, useState } from 'react';
import { restDialogChannel, uiCommands, type RestDialogState } from '../game/bridge';

/**
 * TES-style "how long?" dialog for waiting or sleeping. The game is paused
 * behind it. While you rest, time visibly speeds up; noises, people and
 * threats can cut it short. PLACEHOLDER look.
 */
export function RestDialog() {
  const [state, setState] = useState<RestDialogState | null>(restDialogChannel.last ?? null);
  const [hours, setHours] = useState(1);

  useEffect(
    () =>
      restDialogChannel.on((s) => {
        setState(s);
        if (s) setHours(s.defaultHours);
      }),
    [],
  );

  if (!state) return null;
  const sleep = state.kind === 'sleep';
  const end = (state.hourNow + hours) % 24;
  const endText = `${String(Math.floor(end)).padStart(2, '0')}:${String(Math.floor((end % 1) * 60)).padStart(2, '0')}`;
  const answer = (h: number | null) => uiCommands.emit({ kind: 'rest', hours: h });

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) answer(null);
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-neutral-900/95 p-5 text-white shadow-2xl ring-1 ring-white/10">
        <div className="text-lg font-semibold">{sleep ? '🛏️ Sleep' : '⏳ Wait'}</div>
        <div className="mt-0.5 text-xs text-white/50">Time speeds up while you {sleep ? 'sleep' : 'wait'}. Anything alarming will {sleep ? 'wake you' : 'stop you'}.</div>
        <div className="mt-5 flex items-baseline justify-between">
          <span className="text-2xl font-semibold tabular-nums">
            {hours} hour{hours === 1 ? '' : 's'}
          </span>
          <span className="text-sm text-white/60 tabular-nums">until {endText}</span>
        </div>
        <input
          type="range"
          min={1}
          max={state.maxHours}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') answer(hours);
          }}
          autoFocus
          className="mt-3 w-full accent-amber-300"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-full px-4 py-2 text-sm text-white/70 hover:bg-white/10" onClick={() => answer(null)}>
            Cancel
          </button>
          <button className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-amber-200" onClick={() => answer(hours)}>
            {sleep ? 'Sleep' : 'Wait'}
          </button>
        </div>
      </div>
    </div>
  );
}
