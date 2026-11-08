import { useEffect, useState } from 'react';
import { hudChannel, rosterChannel, uiCommands, type HudState, type RelationshipRow, type RosterMember, type RosterState } from '../game/bridge';
import { inputSourceChannel, type InputSource } from '../game/input/touchInput';
import { opinionWord } from '../game/social/relationships';

/**
 * Who's who: portraits to switch control, and a card for the active character
 * (state, health, temperament, and how they and the others feel about each other).
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

  const card = cardOpen && <Card member={active} hud={hud} rows={roster.relationships} />;

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

const GAIT: Record<string, string> = { still: 'Standing', crouch: 'Sneaking', walk: 'Walking', sprint: 'Running' };

function Card(props: { member: RosterMember; hud: HudState | null; rows: RelationshipRow[] }) {
  const { member: m, hud } = props;
  const f = Math.max(0, m.health / m.maxHealth);
  return (
    <div className="pointer-events-auto w-72 max-w-[calc(100vw-24px)] rounded-2xl bg-neutral-900/75 p-3 text-white shadow-xl ring-1 ring-white/10 backdrop-blur-md">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-base font-semibold">{m.name}</div>
        <div className="text-xs text-white/60" title={m.temperamentNote}>
          {m.temperament}
        </div>
      </div>
      <div className="mt-0.5 truncate text-xs text-white/70">{m.activity}</div>

      <div className="mt-2 flex items-center gap-2 text-[11px] text-white/60">
        <span className="w-12">Health</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full" style={{ width: `${f * 100}%`, background: f > 0.5 ? '#7fd47f' : f > 0.25 ? '#e8c25a' : '#e0574a' }} />
        </div>
        <span className="w-8 text-right tabular-nums">{m.health}</span>
      </div>
      {hud && (
        <div className="mt-1 text-[11px] text-white/50 tabular-nums">
          {hud.mode === 'combat' ? 'Combat ready' : 'Exploring'} · {hud.crouched && hud.gait === 'still' ? 'Crouched' : GAIT[hud.gait]} · {hud.speed.toFixed(1)} m/s · view {hud.span.toFixed(0)} m
        </div>
      )}

      <div className="mt-3 text-[11px] font-medium tracking-wide text-white/50 uppercase">Relationships</div>
      <div className="mt-1 flex flex-col gap-1.5">
        {props.rows.map((r) => (
          <div key={r.id} className="text-xs">
            <div className="flex justify-between">
              <span>{r.name}</span>
              <span className="text-white/50">{opinionWord(r.theirs)} to you</span>
            </div>
            <OpinionBar label="You" value={r.mine} />
            <OpinionBar label="Them" value={r.theirs} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** −100…100 as a bar growing left (red) or right (green) from the centre. */
function OpinionBar({ label, value }: { label: string; value: number }) {
  const w = Math.abs(value) / 2;
  return (
    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/40">
      <span className="w-8">{label}</span>
      <div className="relative h-1 flex-1 rounded-full bg-white/10">
        <div className="absolute top-0 left-1/2 h-full w-px bg-white/30" />
        <div
          className="absolute top-0 h-full rounded-full"
          style={{ left: value >= 0 ? '50%' : `${50 - w}%`, width: `${w}%`, background: value >= 0 ? '#7fd47f' : '#e0574a' }}
        />
      </div>
      <span className="w-7 text-right tabular-nums">{Math.round(value)}</span>
    </div>
  );
}
