import { useEffect, useState } from 'react';
import { hudChannel, pausedChannel, rosterChannel, uiCommands, wallsChannel, type HudState, type RosterMember, type RosterState } from '../game/bridge';
import { MOCK_PROFILES, NEEDS } from '../game/characters/mockProfiles';
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
 * Mood, needs, skills, the clock and the speed buttons are PLACEHOLDERS.
 */
export function BottomBar() {
  const [roster, setRoster] = useState<RosterState | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [source, setSource] = useState<InputSource>(() => inputSourceChannel.last ?? 'mouse');
  const [tab, setTab] = useState<Tab | null>('needs');
  const [paused, setPaused] = useState(false);
  const [help, setHelp] = useState(false);

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
        {tab === 'needs' && <NeedsTab id={active.id} />}
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
            height: `calc(${touch ? 60 : 100}px + env(safe-area-inset-bottom))`,
            paddingBottom: `calc(${touch ? 8 : 12}px + env(safe-area-inset-bottom))`,
            paddingLeft: `max(${touch ? 8 : 16}px, env(safe-area-inset-left))`,
            paddingRight: `max(${touch ? 8 : 16}px, env(safe-area-inset-right))`,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* ---- left: who you are, and everyone else */}
          <div className={`flex shrink-0 items-end ${touch ? 'gap-1' : 'gap-3'}`}>
            <div className={`flex ${touch ? 'flex-row items-end gap-1' : 'flex-col gap-1.5'} order-1`}>
              {others.map((m) => (
                <MiniPortrait key={m.id} member={m} size={touch ? 24 : 28} keyHint={touch ? null : indexOf(m.id) + 1} />
              ))}
            </div>
            <BigPortrait member={active} size={touch ? 44 : 84} onPress={() => pickTab('character')} />
            {!touch && <Identity member={active} />}
          </div>

          {/* ---- centre: time, and walls up / cutaway / down */}
          <div className={`flex items-center self-center ${touch ? 'gap-1' : 'gap-2'}`}>
            <TimeControls paused={paused} touch={touch} help={help} setHelp={setHelp} />
            <WallsButton touch={touch} />
          </div>

          {/* ---- right: panel tabs (panel pops up above on desktop) */}
          <div className="relative flex flex-col items-end">
            {!touch && <div className="absolute right-0 bottom-full">{panel}</div>}
            <div className={`flex rounded-full bg-white/5 p-1 ring-1 ring-white/10 ${touch ? 'gap-0.5' : 'gap-1'}`}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  title={t.label}
                  onClick={(e) => {
                    pickTab(t.id);
                    e.currentTarget.blur();
                  }}
                  className={`flex items-center justify-center rounded-full transition ${touch ? 'h-8 w-8 text-sm' : 'h-10 w-10 text-lg'} ${
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

/** Placeholder mood from the mock needs. */
function moodOf(id: string): { label: string; icon: string } {
  const p = MOCK_PROFILES[id];
  if (!p) return { label: 'Fine', icon: '🙂' };
  const avg = NEEDS.reduce((s, n) => s + p.needs[n.id], 0) / NEEDS.length;
  if (avg > 0.75) return { label: 'Content', icon: '😌' };
  if (avg > 0.55) return { label: 'Fine', icon: '🙂' };
  if (avg > 0.4) return { label: 'Uneasy', icon: '😕' };
  return { label: 'Miserable', icon: '😣' };
}

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
  const mood = moodOf(m.id);
  const p = MOCK_PROFILES[m.id];
  return (
    <div className="order-3 flex min-w-0 flex-col pb-1 text-white">
      <div className="text-lg leading-tight font-semibold">{m.name}</div>
      {p && <div className="text-[11px] text-white/45">{p.occupation}</div>}
      <div className="mt-1 flex items-center gap-1.5">
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs" title="Placeholder: mood isn't simulated yet">
          {mood.icon} {mood.label}
        </span>
        <span className="text-[11px] text-white/45 tabular-nums">♥ {m.health}</span>
      </div>
      <div className="mt-0.5 max-w-[16rem] truncate text-xs text-white/60">{m.activity}</div>
    </div>
  );
}

function TimeControls({ paused, touch, help, setHelp }: { paused: boolean; touch: boolean; help: boolean; setHelp: (v: boolean) => void }) {
  const btn = `flex items-center justify-center rounded-full transition ${touch ? 'h-8 w-8 text-xs' : 'h-9 w-9 text-sm'}`;
  return (
    <div className="relative flex shrink-0 flex-col items-center gap-1 self-center">
      <div className="flex items-center gap-1 rounded-full bg-white/5 p-1 text-white ring-1 ring-white/10">
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
        {!touch &&
          ['▶', '▶▶', '▶▶▶'].map((label, i) => (
            <button
              key={label}
              className={`${btn} w-auto px-2 text-xs ${i === 0 && !paused ? 'bg-white/15' : i > 0 ? 'cursor-not-allowed text-white/30' : 'hover:bg-white/10'}`}
              title={i === 0 ? 'Normal speed' : 'Faster speeds: waiting on the time model (undecided)'}
              onClick={(e) => {
                if (i === 0) uiCommands.emit({ kind: 'setPaused', paused: false });
                e.currentTarget.blur();
              }}
            >
              {label}
            </button>
          ))}
        <button
          className={`${btn} text-xs ${help ? 'bg-white/15' : 'hover:bg-white/10'}`}
          title="Controls"
          onClick={(e) => {
            setHelp(!help);
            e.currentTarget.blur();
          }}
        >
          ?
        </button>
      </div>
      {!touch && (
        <div className="text-[11px] text-white/50" title="Placeholder: the clock isn't simulated yet">
          {paused ? 'Paused · ' : ''}Day 1 · Morning
        </div>
      )}
      {help && (
        <div className="absolute bottom-full mb-3 w-72 rounded-2xl bg-neutral-900/90 p-3 text-xs leading-5 text-white/75 shadow-xl ring-1 ring-white/10 backdrop-blur-md">
          {touch ? (
            <>
              <div>Drag left half to move · rim to run</div>
              <div>Tap ground to walk · hold to follow</div>
              <div>Tap people & things for options</div>
              <div>Pinch to zoom · tap portraits to switch</div>
            </>
          ) : (
            <>
              <div>WASD move · Ctrl run · Shift sneak</div>
              <div>Click ground to walk · hold to follow</div>
              <div>Click people & things for options</div>
              <div>E talk · F lock-on · R fight stance · LMB/RMB punch</div>
              <div>1–4 switch person · Scroll zoom · Space pause · V walls</div>
              <div>F3 collision · F4 senses overlay</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Top-left: what you're doing right now, with a cancel button. */
function CurrentAction({ member: m, touch }: { member: RosterMember; touch: boolean }) {
  if (!m.busy) return null;
  const icon = m.mode === 'combat' ? '⚔️' : /^(Going to|Chat|Joke|Compliment|Embrace|Argue|Insult)/.test(m.activity) ? '💬' : /Running|Walking/.test(m.activity) ? '👣' : '•';
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
      className={`flex items-center justify-center gap-1.5 rounded-full bg-white/5 text-white ring-1 ring-white/10 hover:bg-white/10 ${touch ? 'h-9 w-9' : 'h-11 px-3 text-sm'}`}
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
