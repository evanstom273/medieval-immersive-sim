import { useEffect, useState } from 'react';
import { hudChannel, rosterChannel, uiCommands, type HudState, type RosterMember, type RosterState } from '../game/bridge';
import { inputSourceChannel, type InputSource } from '../game/input/touchInput';
import { CharacterDock } from './CharacterDock';

/**
 * Who's who: portraits to switch control, and the character panel for whoever
 * you're controlling. Click/tap your own portrait to open or close the panel.
 */
export function PortraitBar() {
  const [roster, setRoster] = useState<RosterState | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [source, setSource] = useState<InputSource>(() => inputSourceChannel.last ?? 'mouse');
  const [cardOpen, setCardOpen] = useState(true);

  useEffect(() => rosterChannel.on(setRoster), []);
  useEffect(() => hudChannel.on(setHud), []);
  // Re-read on mount: the touch layer may have announced itself after this component first rendered.
  useEffect(() => {
    setSource(inputSourceChannel.last ?? 'mouse');
    return inputSourceChannel.on(setSource);
  }, []);
  useEffect(() => setCardOpen(source !== 'touch'), [source]);

  if (!roster) return null;
  const touch = source === 'touch';
  const active = roster.members.find((m) => m.id === roster.activeId)!;

  const portraits = (
    <div className="pointer-events-auto flex gap-2">
      {roster.members.map((m, i) => (
        <Portrait
          key={m.id}
          member={m}
          index={i}
          size={touch ? 44 : 52}
          showKey={!touch}
          onPress={() => (m.controlled ? setCardOpen((o) => !o) : uiCommands.emit({ kind: 'switchTo', id: m.id }))}
        />
      ))}
    </div>
  );

  const card = cardOpen && (
    <CharacterDock
      member={active}
      members={roster.members}
      hud={hud}
      rows={roster.relationships}
      memories={roster.memories}
      sheet={touch}
      onClose={() => setCardOpen(false)}
    />
  );

  return (
    <div
      className={`pointer-events-none absolute z-10 flex flex-col gap-2 ${touch ? 'top-0 left-0' : 'bottom-0 left-0'}`}
      style={
        touch
          ? { paddingTop: 'max(12px, env(safe-area-inset-top))', paddingLeft: 'max(12px, env(safe-area-inset-left))' }
          : { padding: 16 }
      }
    >
      {touch ? (
        <>
          {portraits}
          {card}
        </>
      ) : (
        <>
          {card}
          {portraits}
        </>
      )}
    </div>
  );
}

function Portrait(props: { member: RosterMember; index: number; size: number; showKey: boolean; onPress: () => void }) {
  const { member: m, size } = props;
  const r = size / 2 - 2;
  const circ = 2 * Math.PI * r;
  const f = Math.max(0, m.health / m.maxHealth);
  const badge = m.status === 'ko' ? '💫' : m.status === 'yielded' ? '🏳️' : m.mode === 'combat' ? '⚔️' : null;
  return (
    <button
      className={`relative shrink-0 rounded-full transition ${m.controlled ? 'scale-110' : 'opacity-85 hover:opacity-100'}`}
      style={{ width: size, height: size }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        props.onPress();
      }}
      title={`${m.name} — ${m.activity}`}
    >
      <span
        className={`absolute inset-[4px] flex items-center justify-center rounded-full font-semibold text-white shadow-md ${m.status === 'ko' ? 'grayscale' : ''}`}
        style={{ background: m.colour, fontSize: size * 0.36 }}
      >
        {m.name[0]}
      </span>
      <svg className="absolute inset-0 -rotate-90" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={3} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={f > 0.5 ? '#7fd47f' : f > 0.25 ? '#e8c25a' : '#e0574a'}
          strokeWidth={3}
          strokeDasharray={`${circ * f} ${circ}`}
          strokeLinecap="round"
        />
        {m.controlled && <circle cx={size / 2} cy={size / 2} r={r + 1.5} fill="none" stroke="white" strokeWidth={1.5} opacity={0.9} />}
      </svg>
      {badge && <span className="absolute -top-1 -right-1 rounded-full bg-neutral-900/85 px-0.5 text-[11px] leading-4">{badge}</span>}
      {props.showKey && (
        <span className="absolute -bottom-1 -left-1 rounded-full bg-neutral-900/85 px-1.5 text-[10px] leading-4 font-medium text-white/70">{props.index + 1}</span>
      )}
    </button>
  );
}
