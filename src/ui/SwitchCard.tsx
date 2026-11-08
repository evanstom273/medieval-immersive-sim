import { useEffect, useState } from 'react';
import { switchChannel, type SwitchEvent } from '../game/bridge';
import { Avatar } from './characterPanel';

/** Name card shown as the camera lands on the character you've switched to. */
export function SwitchCard() {
  const [card, setCard] = useState<(SwitchEvent & { key: number }) | null>(null);

  useEffect(() => {
    let timer = 0;
    let key = 0;
    const off = switchChannel.on((e) => {
      if (e.phase !== 'arrive') return;
      setCard({ ...e, key: ++key });
      clearTimeout(timer);
      timer = window.setTimeout(() => setCard(null), 2400);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);

  if (!card) return null;
  return (
    <div
      key={card.key}
      className="switch-card pointer-events-none absolute left-1/2 z-30 flex items-center gap-3 rounded-2xl bg-neutral-900/80 py-2.5 pr-5 pl-2.5 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md"
      style={{ bottom: '30%' }}
    >
      <Avatar colour={card.colour} name={card.name} size={44} />
      <div>
        <div className="text-lg leading-tight font-semibold">{card.name}</div>
        <div className="text-xs text-white/60">{card.activity}</div>
      </div>
    </div>
  );
}
