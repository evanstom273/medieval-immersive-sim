import { useEffect, useState } from 'react';
import { floorChannel, messageChannel, uiCommands, type FloorState } from '../game/bridge';

interface Message {
  id: number;
  text: string;
}

let nextId = 0;

/** Message log, top centre. (Controls help lives in the bottom bar's "?".) */
export function Hud() {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(
    () =>
      messageChannel.on((text) => {
        const id = nextId++;
        setMessages((m) => [...m.slice(-3), { id, text }]);
        setTimeout(() => setMessages((m) => m.filter((x) => x.id !== id)), 9000);
      }),
    [],
  );

  const [floor, setFloor] = useState<FloorState | null>(() => floorChannel.last ?? null);
  useEffect(() => floorChannel.on(setFloor), []);
  const top = hudTop();

  return (
    <div className="pointer-events-none absolute inset-0 text-white">
      <div
        className="absolute left-1/2 flex w-max max-w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 flex-col items-center gap-1"
        style={{ top: floor ? `calc(${top} + 46px)` : top }}
      >
        {messages.map((m) => (
          <div key={m.id} className="rounded-full bg-neutral-900/70 px-3 py-1 text-center text-sm shadow ring-1 ring-white/10 backdrop-blur-sm">
            {m.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Where the top-of-screen HUD row starts. Narrow screens: below the action chip / Tuning button row. */
function hudTop(): string {
  return window.innerWidth < 640 ? 'calc(env(safe-area-inset-top) + 60px)' : 'max(16px, calc(env(safe-area-inset-top) + 12px))';
}

/** Sims-style floor buttons: show the storey below or above (above the top one are the roofs). PageDown / PageUp too. */
export function FloorButtons() {
  const [floor, setFloor] = useState<FloorState | null>(() => floorChannel.last ?? null);
  useEffect(() => floorChannel.on(setFloor), []);
  if (!floor) return null;
  const top = hudTop();
  const btn = 'flex h-9 w-9 items-center justify-center rounded-full text-lg transition-colors enabled:hover:bg-white/15 disabled:opacity-30';
  return (
    <div className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-neutral-900/75 p-0.5 shadow ring-1 ring-white/10 backdrop-blur-sm" style={{ top }}>
      <button className={btn} disabled={!floor.canDown} title="Floor below (Page Down)" aria-label="Floor below" onClick={() => uiCommands.emit({ kind: 'floor', dir: -1 })}>
        ▼
      </button>
      <span className="min-w-[7.5rem] text-center text-sm font-medium select-none">{floor.label}</span>
      <button className={btn} disabled={!floor.canUp} title="Floor above (Page Up)" aria-label="Floor above" onClick={() => uiCommands.emit({ kind: 'floor', dir: 1 })}>
        ▲
      </button>
    </div>
  );
}
