import { useEffect, useState } from 'react';
import { messageChannel } from '../game/bridge';
import { inputSourceChannel, type InputSource } from '../game/input/touchInput';

interface Message {
  id: number;
  text: string;
}

let nextId = 0;

/** Message log (top centre) and, on desktop, a controls reminder (bottom right). */
export function Hud() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [source, setSource] = useState<InputSource>(() => inputSourceChannel.last ?? 'mouse');
  const [help, setHelp] = useState(true);

  // Re-read on mount: the touch layer may have announced itself after this component first rendered.
  useEffect(() => {
    setSource(inputSourceChannel.last ?? 'mouse');
    return inputSourceChannel.on(setSource);
  }, []);
  useEffect(
    () =>
      messageChannel.on((text) => {
        const id = nextId++;
        setMessages((m) => [...m.slice(-3), { id, text }]);
        // Messages fade after a while.
        setTimeout(() => setMessages((m) => m.filter((x) => x.id !== id)), 9000);
      }),
    [],
  );
  const touch = source === 'touch';

  return (
    <div className="pointer-events-none absolute inset-0 text-white">
      <div
        className="absolute left-1/2 flex w-max max-w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 flex-col items-center gap-1"
        style={{ top: touch ? 'max(76px, calc(env(safe-area-inset-top) + 64px))' : 16 }}
      >
        {messages.map((m) => (
          <div key={m.id} className="rounded-full bg-neutral-900/70 px-3 py-1 text-center text-sm shadow ring-1 ring-white/10 backdrop-blur-sm">
            {m.text}
          </div>
        ))}
      </div>
      {!touch && (
        <div className="pointer-events-auto absolute right-4 bottom-4 rounded-2xl bg-neutral-900/70 px-3 py-2 text-xs leading-5 text-white/70 ring-1 ring-white/10 backdrop-blur-sm">
          <button className="w-full text-left font-medium text-white/80" onClick={(e) => (setHelp(!help), e.currentTarget.blur())}>
            {help ? '▾' : '▸'} Controls
          </button>
          {help && (
            <div className="mt-1">
              <div>WASD move · Ctrl run · Shift sneak</div>
              <div>Click ground to walk · hold to follow</div>
              <div>Click people & things for options</div>
              <div>1–4 switch person · Scroll zoom</div>
              <div>E talk · F lock-on (any time)</div>
              <div>R fight stance · LMB/RMB punch</div>
              <div>F3 collision · F4 senses overlay</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
