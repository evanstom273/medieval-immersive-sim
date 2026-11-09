import { useEffect, useState } from 'react';
import { clockChannel, hudChannel, pausedChannel, rosterChannel, uiCommands, wallsChannel, type ClockState, type HudState, type RosterMember, type RosterState } from '../game/bridge';
import { MOCK_PROFILES } from '../game/characters/mockProfiles';
import { moodWord } from '../game/life/needs';
import { inputSourceChannel, type InputSource } from '../game/input/touchInput';
import { Avatar, CharacterTab, NeedsTab, PeopleTab, SkillsTab, TABS, type Tab } from './characterPanel';

/**
 * The main game bar along the bottom of the screen:
 * - left: the character you control (big portrait, mood, what they're doing)
 *   and the rest of the household to switch to;
 * - centre: time controls and clock;
 * - right: the character panel (Needs / Skills / People / Self) above its tabs.
 * Plus a "current action" chip at the top left.
 *
 * Skills are PLACEHOLDERS; needs and mood are live. The clock is real (day length is a placeholder).
 * No speed buttons: direct control has no fast-forward (only waiting / sleeping speed time up).
 */
export function BottomBar() {
  const [roster, setRoster] = useState<RosterState | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [source, setSource] = useState<InputSource>(() => inputSourceChannel.last ?? 'mouse');
  const [tab, setTab] = useState<Tab | null>('needs');
  const [paused, setPaused] = useState(false);

  useEffect(() => rosterChannel.on(setRoster), []);
  useEffect(() => hudChannel.on(setHud), []);
  useEffect(() => pausedChannel.on(setPaused), []);
  useEffect(() => {
    setSource(inputSourceChannel.last ?? 'mouse');
    return inputSourceChannel.on(setSource);
  }, []);
  // Panel open by default on desktop; closed on phones until you tap a tab.
  useEffect(() => setTab(source === 'touch' ? null : 'needs'), [source]);

  if (!roster) return null;
  const touch = source === 'touch';
  const active = roster.members.find((m) => m.id === roster.activeId)!;
  const others = roster.members.filter((m) => m.id !== roster.activeId);
  const indexOf = (id: string) => roster.members.findIndex((m) => m.id === id);
  const pickTab = (t: Tab) => setTab((cur) => (cur === t ? null : t));

  const panel = tab && (
    <div
      className={`pointer-events-auto flex flex-col overflow-hidden bg-neutral-900/85 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md ${
        touch ? 'mx-2 mb-2 max-h-[55vh] rounded-2xl' : 'mb-2 h-[340px] w-[380px] rounded-2xl'
      }`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="text-sm font-semibold">
          {TABS.find((t) => t.id === tab)!.icon} {TABS.find((t) => t.id === tab)!.label}
          <span className="ml-2 text-xs font-normal text-white/45">{active.name}</span>
        </span>
        <button className="rounded-full px-2 text-lg leading-none text-white/50 hover:bg-white/10 hover:text-white" onClick={() => setTab(null)} aria-label="Close panel">
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {tab === 'needs' && <NeedsTab member={active} />}
        {tab === 'skills' && <SkillsTab id={active.id} />}
        {tab === 'people' && <PeopleTab rows={roster.relationships} members={roster.members} memories={roster.memories} />}
        {tab === 'character' && <CharacterTab member={active} hud={hud} memories={roster.memories} />}
      </div>
    </div>
  );

  return (
    <>
      <CurrentAction member={active} touch={touch} />

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col">
        {touch && panel}
        <div
          className={`pointer-events-auto flex items-end justify-between border-t ${touch ? 'gap-1' : 'gap-3'} border-white/10 bg-gradient-to-t from-neutral-950/85 to-neutral-950/55 backdrop-blur-sm ${
            touch ? 'px-2 pt-2' : 'px-4 pt-3'
          }`}
          // Content height plus the phone's gesture/safe area, so the bar sits flush with the bottom edge.
          style={{
            height: `calc(${touch ? 72 : 100}px + env(safe-area-inset-bottom))`,
            paddingBottom: `calc(${touch ? 8 : 12}px + env(safe-area-inset-bottom))`,
            paddingLeft: `max(${touch ? 8 : 16}px, env(safe-area-inset-left))`,
            paddingRight: `max(${touch ? 8 : 16}px, env(safe-area-inset-right))`,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* ---- left: who you are, and everyone else */}
          <div className={`flex shrink-0 items-end ${touch ? 'gap-1' : 'gap-3'}`}>
            <div className={`flex ${touch ? 'flex-row items-end -space-x-2' : 'flex-col gap-1.5'} order-1`}>
              {others.map((m) => (
                <MiniPortrait key={m.id} member={m} size={touch ? 24 : 28} keyHint={touch ? null : indexOf(m.id) + 1} />
              ))}
            </div>
            <BigPortrait member={active} size={touch ? 44 : 84} onPress={() => pickTab('character')} />
            {!touch && <Identity member={active} />}
          </div>

          {/* ---- centre: time, and walls up / cutaway / down */}
          <div className={`flex items-center self-center ${touch ? 'gap-1' : 'gap-2'}`}>
            <TimeControls paused={paused} touch={touch} resting={/^(Waiting|Sleeping)/.test(active.activity)} />
            {/* Walls mean nothing on the map. */}
            {!hud?.onMap && <WallsButton touch={touch} />}
            <MapButton touch={touch} />
            {/* Touch has its own Sprint button by the thumb. */}
            {!touch && <SprintButton on={!!hud?.sprinting} />}
          </div>

          {/* ---- right: panel tabs (panel pops up above on desktop) */}
          <div className="relative flex flex-col items-end">
            {!touch && <div className="absolute right-0 bottom-full">{panel}</div>}
            <div className={`flex rounded-full bg-white/5 ring-1 ring-white/10 ${touch ? 'gap-0.5 p-0.5' : 'gap-1 p-1'}`}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  title={t.label}
                  onClick={(e) => {
                    pickTab(t.id);
                    e.currentTarget.blur();
                  }}
                  className={`flex items-center justify-center rounded-full transition ${touch ? 'h-8 w-7 text-sm' : 'h-10 w-10 text-lg'} ${
                    tab === t.id ? 'bg-white text-neutral-900 shadow' : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  {t.icon}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ pieces


function healthColour(f: number): string {
  return f > 0.5 ? '#7fd47f' : f > 0.25 ? '#e8c25a' : '#e0574a';
}

function statusBadge(m: RosterMember): string | null {
  return m.status === 'ko' ? '💫' : m.status === 'yielded' ? '🏳️' : m.mode === 'combat' ? '⚔️' : null;
}

function Ring({ size, f, children, highlight }: { size: number; f: number; children: React.ReactNode; highlight?: boolean }) {
  const r = size / 2 - 2;
  const circ = 2 * Math.PI * r;
  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }}>
      <span className="absolute inset-[4px]">{children}</span>
      <svg className="pointer-events-none absolute inset-0 -rotate-90" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={3} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={healthColour(f)} strokeWidth={3} strokeDasharray={`${circ * f} ${circ}`} strokeLinecap="round" />
        {highlight && <circle cx={size / 2} cy={size / 2} r={r + 1.5} fill="none" stroke="white" strokeWidth={1.5} opacity={0.9} />}
      </svg>
    </span>
  );
}

function BigPortrait({ member: m, size, onPress }: { member: RosterMember; size: number; onPress: () => void }) {
  const badge = statusBadge(m);
  return (
    <button className="relative order-2 shrink-0" onClick={(e) => (onPress(), e.currentTarget.blur())} title={`${m.name} — open their details`}>
      <Ring size={size} f={m.health / m.maxHealth} highlight>
        <Avatar colour={m.colour} name={m.name} size={size - 8} dim={m.status === 'ko'} />
      </Ring>
      {badge && <span className="absolute -top-1 -right-1 rounded-full bg-neutral-900/90 px-1 text-sm">{badge}</span>}
    </button>
  );
}

function MiniPortrait({ member: m, size, keyHint }: { member: RosterMember; size: number; keyHint: number | null }) {
  const badge = statusBadge(m);
  return (
    <button
      className="relative shrink-0 opacity-85 transition hover:scale-110 hover:opacity-100"
      title={`${m.name} — ${m.activity}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        uiCommands.emit({ kind: 'switchTo', id: m.id });
      }}
    >
      <Ring size={size} f={m.health / m.maxHealth}>
        <Avatar colour={m.colour} name={m.name} size={size - 8} dim={m.status === 'ko'} />
      </Ring>
      {badge && <span className="absolute -top-1.5 -right-1.5 text-[10px]">{badge}</span>}
      {keyHint !== null && <span className="absolute -bottom-0.5 -left-1.5 rounded-full bg-neutral-900/90 px-1 text-[9px] leading-3.5 text-white/60">{keyHint}</span>}
    </button>
  );
}

function Identity({ member: m }: { member: RosterMember }) {
  const mood = moodWord(m.mood);
  const p = MOCK_PROFILES[m.id];
  return (
    <div className="order-3 flex min-w-0 flex-col pb-1 text-white">
      <div className="text-lg leading-tight font-semibold">{m.name}</div>
      {p && <div className="text-[11px] text-white/45">{p.occupation}</div>}
      <div className="mt-1 flex items-center gap-1.5">
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs" title={`Mood ${m.mood > 0 ? '+' : ''}${m.mood}`}>
          {mood.icon} {mood.label}
        </span>
        <span className="text-[11px] text-white/45 tabular-nums">♥ {m.health}</span>
      </div>
      <div className="mt-0.5 max-w-[16rem] truncate text-xs text-white/60">{m.activity}</div>
    </div>
  );
}

function TimeControls({ paused: worldPaused, touch, resting }: { paused: boolean; touch: boolean; resting: boolean }) {
  const [clock, setClock] = useState<ClockState | null>(clockChannel.last ?? null);
  useEffect(() => clockChannel.on(setClock), []);
  // Out in the overview the same controls run the fast-forward: pause, and speeds 1–5 in place of waiting.
  const overview = clock?.overview ?? null;
  const paused = overview !== null ? overview === 0 : worldPaused;
  const btn = `flex items-center justify-center rounded-full transition ${touch ? 'h-8 w-8 text-xs' : 'h-9 w-9 text-sm'}`;
  return (
    <div className="relative flex shrink-0 flex-col items-center gap-1 self-center">
      <div className={`flex items-center gap-1 rounded-full bg-white/5 text-white ring-1 ring-white/10 ${touch ? 'p-0.5' : 'p-1'}`}>
        <button
          className={`${btn} ${paused ? 'bg-amber-300 text-neutral-900' : 'hover:bg-white/10'}`}
          title={paused ? 'Resume (Space)' : 'Pause (Space)'}
          onClick={(e) => {
            uiCommands.emit({ kind: 'setPaused', paused: !paused });
            e.currentTarget.blur();
          }}
        >
          {paused ? '▶' : '❚❚'}
        </button>
        {overview !== null ? (
          <div className="flex items-center gap-0.5 px-1" title="Speed (1–5)">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                aria-label={`Speed ${n}`}
                className={`rounded-sm ${touch ? 'h-5 w-2' : 'h-7 w-3.5'}`}
                style={{ background: n <= overview ? '#fcd34d' : 'rgba(255,255,255,0.18)' }}
                onClick={(e) => {
                  uiCommands.emit({ kind: 'overviewSpeed', speed: n });
                  e.currentTarget.blur();
                }}
              />
            ))}
          </div>
        ) : (
          <button
            className={`${btn} ${resting ? 'bg-white/15' : 'hover:bg-white/10'}`}
            title={resting ? 'Stop waiting / get up' : 'Wait… (choose how many hours)'}
            onClick={(e) => {
              uiCommands.emit(resting ? { kind: 'cancelAction' } : { kind: 'wait' });
              e.currentTarget.blur();
            }}
          >
            ⏳
          </button>
        )}
      </div>
      {clock && (
        <div className="flex flex-col items-center leading-tight" title="Placeholder day length (see the design log)">
          <span className={`text-white/80 tabular-nums ${touch ? 'text-[11px]' : 'text-xs'}`}>
            {clock.isDaytime ? '☀️' : '🌙'}
            {touch ? '' : ' '}
            {clock.time}
            {/* On phones the pause button already shows it's paused; space is tight. */}
            {paused && !touch ? ' · Paused' : overview ? ` · ${OVERVIEW_SPEED_LABEL[overview]}` : clock.speed > 1 ? ` ×${clock.speed}` : ''}
          </span>
          <span className={`whitespace-nowrap text-white/45 ${touch ? 'text-[10px]' : 'text-[11px]'}`}>{touch ? clock.shortDate : clock.date}</span>
        </div>
      )}
    </div>
  );
}

/** How fast the overview runs at each speed (matches the scene's days per second). */
const OVERVIEW_SPEED_LABEL = ['', '1 day/s', '3 days/s', '1 week/s', '2 weeks/s', '1 month/s'];

/** Top-left: what you're doing right now, with a cancel button. */
function CurrentAction({ member: m, touch }: { member: RosterMember; touch: boolean }) {
  if (!m.busy) return null;
  const icon = /^(Sleeping|Asleep)/.test(m.activity) ? '💤' : /^On their own/.test(m.activity) ? '🧭' : /^Waiting/.test(m.activity) ? '⏳' : m.mode === 'combat' ? '⚔️' : /^(Going to|Chat|Joke|Compliment|Embrace|Argue|Insult)/.test(m.activity) ? '💬' : /Running|Walking/.test(m.activity) ? '👣' : '•';
  return (
    <div
      className="pointer-events-auto fixed z-20 flex items-center gap-2 rounded-full bg-neutral-900/80 py-1 pr-1 pl-3 text-sm text-white shadow-lg ring-1 ring-white/10 backdrop-blur-sm"
      style={{ top: touch ? 'max(12px, env(safe-area-inset-top))' : 16, left: touch ? 'max(12px, env(safe-area-inset-left))' : 16 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span>{icon}</span>
      <span className="max-w-[14rem] truncate">{m.activity}</span>
      <button
        className="flex h-6 w-6 items-center justify-center rounded-full text-white/60 hover:bg-white/15 hover:text-white"
        title="Cancel"
        onClick={(e) => {
          uiCommands.emit({ kind: 'cancelAction' });
          e.currentTarget.blur();
        }}
      >
        ×
      </button>
    </div>
  );
}


type WallMode = 'up' | 'cutaway' | 'down';
const WALL_LABEL: Record<WallMode, string> = { up: 'Walls up', cutaway: 'Cutaway', down: 'Walls down' };

/** Little wall icon: three bars at full, stepped (cut away at the front), or low. */
function WallIcon({ mode }: { mode: WallMode }) {
  const heights = mode === 'up' ? [12, 12, 12] : mode === 'cutaway' ? [12, 8, 3] : [3, 3, 3];
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden>
      {heights.map((h, i) => (
        <rect key={i} x={1 + i * 6} y={13 - h} width="4" height={h} rx="1" fill="currentColor" />
      ))}
    </svg>
  );
}

/** Sims-style wall display: cycles walls up → cutaway → walls down (V). */
function WallsButton({ touch }: { touch: boolean }) {
  const [mode, setMode] = useState<WallMode>(() => wallsChannel.last ?? 'cutaway');
  useEffect(() => {
    setMode(wallsChannel.last ?? 'cutaway');
    return wallsChannel.on(setMode);
  }, []);
  return (
    <button
      className={`flex items-center justify-center gap-1.5 rounded-full bg-white/5 text-white ring-1 ring-white/10 hover:bg-white/10 ${touch ? 'h-8 w-8' : 'h-11 px-3 text-sm'}`}
      title={`${WALL_LABEL[mode]} (V to change)`}
      onClick={(e) => {
        uiCommands.emit({ kind: 'cycleWalls' });
        e.currentTarget.blur();
      }}
    >
      <WallIcon mode={mode} />
      {!touch && <span>{WALL_LABEL[mode]}</span>}
    </button>
  );
}

/** Sprint on / off (desktop; holding Ctrl sprints too). */
function SprintButton({ on }: { on: boolean }) {
  return (
    <button
      className={`flex h-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm ring-1 ${on ? 'bg-white/90 text-neutral-900 ring-white' : 'bg-white/5 text-white ring-white/10 hover:bg-white/10'}`}
      title="Sprint on / off (or hold Ctrl)"
      onClick={(e) => {
        uiCommands.emit({ kind: 'toggleSprint' });
        e.currentTarget.blur();
      }}
    >
      <span aria-hidden>»</span>
      <span>Sprint</span>
    </button>
  );
}

/** Opens the world map (M). */
function MapButton({ touch }: { touch: boolean }) {
  return (
    <button
      className={`flex items-center justify-center gap-1.5 rounded-full bg-white/5 text-white ring-1 ring-white/10 hover:bg-white/10 ${touch ? 'h-8 w-8' : 'h-11 px-3 text-sm'}`}
      title="World map (M)"
      onClick={(e) => {
        uiCommands.emit({ kind: 'map' });
        e.currentTarget.blur();
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <path d="M1 3l4.5-1.5 5 1.5L15 1.5v11.5l-4.5 1.5-5-1.5L1 14.5z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M5.5 1.5v11.5M10.5 3v11.5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      {!touch && <span>Map</span>}
    </button>
  );
}
