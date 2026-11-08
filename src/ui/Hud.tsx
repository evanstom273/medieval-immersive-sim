import { useEffect, useState } from 'react';
import { messageChannel } from '../game/bridge';

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

  return (
    <div className="pointer-events-none absolute inset-0 text-white">
      <div
        className="absolute left-1/2 flex w-max max-w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 flex-col items-center gap-1"
        // Narrow screens: drop below the action chip / Tuning button row.
        style={{ top: window.innerWidth < 640 ? 'calc(env(safe-area-inset-top) + 60px)' : 'max(16px, calc(env(safe-area-inset-top) + 12px))' }}
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
