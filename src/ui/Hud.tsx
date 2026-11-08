import { useEffect, useState } from 'react';
import { hudChannel, messageChannel, type HudState } from '../game/bridge';

const GAIT_LABEL: Record<HudState['gait'], string> = {
  still: 'Standing',
  crouch: 'Sneaking',
  walk: 'Walking',
  sprint: 'Sprinting',
};

interface Message {
  id: number;
  text: string;
}

let nextId = 0;

export function Hud() {
  const [state, setState] = useState<HudState | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => hudChannel.on(setState), []);
  useEffect(
    () =>
      messageChannel.on((text) => {
        setMessages((m) => [...m.slice(-4), { id: nextId++, text }]);
      }),
    [],
  );

  const gait = state ? (state.gait === 'still' && state.crouched ? 'Crouched' : GAIT_LABEL[state.gait]) : '—';

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-4 font-serif text-stone-100">
      <div className="mb-3 flex max-w-xl flex-col gap-1">
        {messages.map((m) => (
          <div key={m.id} className="w-fit rounded bg-black/55 px-3 py-1 text-sm">
            {m.text}
          </div>
        ))}
      </div>
      <div className="flex items-end justify-between gap-4">
        <div className="rounded bg-black/60 px-3 py-2 text-sm leading-6">
          <div>
            <span className={state?.mode === 'combat' ? 'font-bold text-red-300' : 'text-stone-300'}>
              {state?.mode === 'combat' ? 'Combat ready' : 'Exploring'}
            </span>
            <span className="mx-2 text-stone-500">·</span>
            <span>{gait}</span>
          </div>
          <div className="font-mono text-xs text-stone-400">{state ? state.speed.toFixed(2) : '0.00'} m/s</div>
        </div>
        <div className="rounded bg-black/60 px-3 py-2 font-mono text-xs leading-5 text-stone-300">
          <div>WASD move · Ctrl sprint (hold) · Shift sneak (toggle)</div>
          <div>R ready / relax · Click to use · F3 collision</div>
          <div>In combat: LMB right hand · RMB left hand</div>
        </div>
      </div>
    </div>
  );
}
