import type { ReactNode } from 'react';
import type { HudState, MemoryRow, RelationshipRow, RosterMember } from '../game/bridge';
import { MOCK_PROFILES, SKILLS, type SkillGroup } from '../game/characters/mockProfiles';
import { moodWord, NEED_DEFS } from '../game/life/needs';
import { opinionWord } from '../game/social/relationships';

/**
 * Character panel contents for whoever you're controlling (shown by the
 * bottom bar): tabs for Needs, Skills, People and Self.
 *
 * Skills, occupation, traits and background are PLACEHOLDER mock data (see
 * mockProfiles.ts). Needs, mood, health, temperament, activity,
 * relationships and memories are live.
 */

export type Tab = 'needs' | 'skills' | 'people' | 'character';

export const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'needs', label: 'Needs', icon: '🍞' },
  { id: 'skills', label: 'Skills', icon: '🛠️' },
  { id: 'people', label: 'People', icon: '👥' },
  { id: 'character', label: 'Self', icon: '👤' },
];

const GAIT: Record<string, string> = { still: 'Standing', crouch: 'Sneaking', walk: 'Walking', sprint: 'Running' };
const SENSE_ICON: Record<MemoryRow['sense'], string> = { sight: '👁', sound: '👂', smell: '👃', touch: '✋' };

// ------------------------------------------------------------------ tabs

export function NeedsTab({ member: m }: { member: RosterMember }) {
  const life = m.life;
  if (!life) return null;
  const mood = moodWord(m.mood);
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm">
        <span className="text-xl">{mood.icon}</span>
        <span>
          Mood: <span className="font-semibold">{mood.label}</span>
        </span>
        <span className="ml-auto text-xs text-white/45 tabular-nums">
          {m.mood > 0 ? '+' : ''}
          {m.mood}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {NEED_DEFS.map((n) => (
          <div key={n.id}>
            <div className="mb-1 flex items-center gap-1.5 text-xs">
              <span>{n.icon}</span>
              <span className="text-white/80">{n.label}</span>
            </div>
            <Bar value={life.needs[n.id] ?? 0} />
          </div>
        ))}
      </div>
      {life.moodlets.length > 0 && (
        <div className="mt-4">
          <SectionTitle>Feelings</SectionTitle>
          <div className="flex flex-col gap-1">
            {life.moodlets.map((f) => (
              <div key={f.label} className="flex items-center gap-2 text-xs">
                <span className={`w-8 text-right font-semibold tabular-nums ${f.value > 0 ? 'text-emerald-300' : f.value < 0 ? 'text-rose-300' : 'text-white/50'}`}>
                  {f.value > 0 ? '+' : ''}
                  {f.value}
                </span>
                <span className="text-white/85">{f.label}</span>
                <span className="ml-auto text-white/35 tabular-nums">{f.hoursLeft >= 1 ? `${Math.round(f.hoursLeft)} h` : `${Math.max(1, Math.round(f.hoursLeft * 60))} min`}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SkillsTab({ id }: { id: string }) {
  const p = MOCK_PROFILES[id];
  if (!p) return null;
  const groups: SkillGroup[] = ['Body', 'Mind & tongue', 'Trades'];
  return (
    <div>
      <Placeholder />
      {groups.map((g) => (
        <div key={g} className="mb-3">
          <SectionTitle>{g}</SectionTitle>
          <div className="flex flex-col gap-2">
            {SKILLS.filter((s) => s.group === g).map((s) => {
              const v = p.skills[s.id] ?? { level: 0, progress: 0 };
              return (
                <div key={s.id} className="flex items-center gap-2 text-xs">
                  <span className="w-5 text-center">{s.icon}</span>
                  <span className={`w-20 ${v.level ? 'text-white/85' : 'text-white/40'}`}>{s.label}</span>
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 10 }, (_, i) => (
                        <span key={i} className={`h-2 flex-1 rounded-sm ${i < v.level ? 'bg-white/85' : 'bg-white/10'}`} />
                      ))}
                    </div>
                    {v.level < 10 && (
                      <div className="h-0.5 rounded-full bg-white/5">
                        <div className="h-full rounded-full bg-sky-300/60" style={{ width: `${v.progress * 100}%` }} />
                      </div>
                    )}
                  </div>
                  <span className="w-4 text-right text-white/50 tabular-nums">{v.level}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PeopleTab({ rows, members, memories }: { rows: RelationshipRow[]; members: RosterMember[]; memories: MemoryRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => {
        const other = members.find((x) => x.id === r.id);
        const about = memories.filter((mm) => mm.actor === r.id || mm.target === r.id).slice(0, 2);
        return (
          <div key={r.id} className="rounded-xl bg-white/5 p-2.5">
            <div className="flex items-center gap-2">
              {other && <Avatar colour={other.colour} name={other.name} size={28} dim={other.status === 'ko'} />}
              <div className="flex-1">
                <div className="text-sm font-medium">{r.name}</div>
                <div className="text-[11px] text-white/50">
                  {opinionWord(r.theirs)} to you · {other ? `${other.temperament}` : ''}
                </div>
              </div>
            </div>
            <OpinionBar label="You" value={r.mine} />
            <OpinionBar label="Them" value={r.theirs} />
            {about.map((mm, i) => (
              <div key={i} className="mt-1 truncate text-[11px] text-white/45" style={{ opacity: 0.4 + 0.6 * mm.confidence }}>
                {SENSE_ICON[mm.sense]} {mm.text} · {ago(mm.agoS)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function CharacterTab({ member: m, hud, memories }: { member: RosterMember; hud: HudState | null; memories: MemoryRow[] }) {
  const p = MOCK_PROFILES[m.id];
  return (
    <div>
      <SectionTitle>Temperament</SectionTitle>
      <div className="mb-3 text-sm">
        <span className="font-medium">{m.temperament}</span> <span className="text-white/55">— {m.temperamentNote}</span>
      </div>

      {p && (
        <>
          <SectionTitle>
            Traits <PlaceholderTag />
          </SectionTitle>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {p.traits.map((t) => (
              <span key={t} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">
                {t}
              </span>
            ))}
          </div>
          <SectionTitle>
            Background <PlaceholderTag />
          </SectionTitle>
          <p className="mb-3 text-xs leading-relaxed text-white/70">{p.background}</p>
        </>
      )}

      <SectionTitle>Right now</SectionTitle>
      <div className="mb-3 text-xs text-white/70 tabular-nums">
        {m.activity}
        {hud && (
          <div className="text-white/45">
            {hud.mode === 'combat' ? 'Combat ready' : 'Exploring'} · {hud.crouched && hud.gait === 'still' ? 'Crouched' : GAIT[hud.gait]} · {hud.speed.toFixed(1)} m/s
          </div>
        )}
      </div>

      <SectionTitle>Memories</SectionTitle>
      {memories.length === 0 ? (
        <div className="text-xs text-white/40">Nothing of note.</div>
      ) : (
        <div className="flex flex-col gap-1">
          {memories.map((mm, i) => (
            <div key={i} className="flex items-baseline gap-1.5 text-xs" style={{ opacity: 0.35 + 0.65 * mm.confidence }} title={`${Math.round(mm.confidence * 100)}% sure`}>
              <span className="w-4 shrink-0 text-center">{SENSE_ICON[mm.sense]}</span>
              <span className="flex-1 truncate">{mm.text}</span>
              <span className="shrink-0 text-[10px] text-white/40 tabular-nums">{ago(mm.agoS)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ bits

export function Avatar({ colour, name, size, dim }: { colour: string; name: string; size: number; dim?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow ${dim ? 'grayscale' : ''}`}
      style={{ background: colour, width: size, height: size, fontSize: size * 0.42 }}
    >
      {name[0]}
    </span>
  );
}

export function HealthBar({ value, max }: { value: number; max: number }) {
  const f = Math.max(0, value / max);
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${f * 100}%`, background: f > 0.5 ? '#7fd47f' : f > 0.25 ? '#e8c25a' : '#e0574a' }} />
      </div>
      <span className="text-[10px] text-white/50 tabular-nums">♥ {value}</span>
    </div>
  );
}

function Bar({ value }: { value: number }) {
  const colour = value > 0.6 ? '#7fd47f' : value > 0.3 ? '#e8c25a' : '#e0574a';
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full transition-[width]" style={{ width: `${value * 100}%`, background: colour }} />
    </div>
  );
}

/** −100…100 as a bar growing left (red) or right (green) from the centre. */
function OpinionBar({ label, value }: { label: string; value: number }) {
  const w = Math.abs(value) / 2;
  return (
    <div className="mt-1 flex items-center gap-2 text-[10px] text-white/40">
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

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium tracking-wide text-white/50 uppercase">{children}</div>;
}

function Placeholder() {
  return <div className="mb-3 rounded-lg border border-dashed border-white/15 px-2.5 py-1.5 text-[11px] text-white/45">Placeholder values: not simulated yet.</div>;
}

function PlaceholderTag() {
  return <span className="rounded bg-white/10 px-1 py-px text-[9px] tracking-normal text-white/40 normal-case">placeholder</span>;
}

function ago(s: number): string {
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}
