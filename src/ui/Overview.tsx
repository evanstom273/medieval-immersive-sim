import { useEffect, useRef, useState } from 'react';
import { askChannel, noticeChannel, overviewChannel, uiCommands, type LifeAsk, type LifeNotice, type OverviewState } from '../game/bridge';

/**
 * The overview's UI (the generational fast-forward): the family panel with the date and CKIII-style
 * speed controls, notices of births, deaths and marriages, and the stops where the game asks you
 * (naming a baby born into the family; choosing who to carry on as).
 */

const INK = '#3b2a1a';
const PAPER = '#efe3c3';
const serif = { fontFamily: 'Georgia, serif' };

export function OverviewPanel() {
  const [s, setS] = useState<OverviewState | null>(() => overviewChannel.last ?? null);
  useEffect(() => overviewChannel.on(setS), []);
  if (!s) return null;
  return (
    <>
      {/* The family, down the left. */}
      <div className="pointer-events-auto absolute z-20 flex max-h-[calc(100vh-11rem)] w-60 flex-col overflow-hidden rounded-md shadow-xl ring-1 ring-black/30" style={{ left: 'max(12px, env(safe-area-inset-left))', top: 'max(64px, calc(env(safe-area-inset-top) + 56px))', background: PAPER, color: INK, ...serif }}>
        <div className="border-b px-3 py-2" style={{ borderColor: 'rgba(59,42,26,0.25)' }}>
          <div className="text-base italic">Your family</div>
          <div className="text-[11px] opacity-70">{s.population} souls in the region</div>
        </div>
        <div className="overflow-y-auto px-2 py-1">
          {s.family.length === 0 && <div className="px-1 py-2 text-sm italic opacity-70">None living.</div>}
          {s.family.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded px-1 py-1" style={{ background: m.you ? 'rgba(168,38,28,0.12)' : 'transparent' }}>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: m.you ? '#a8261c' : '#6b5236' }}>
                {m.name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{m.name}</div>
                <div className="truncate text-[11px] opacity-70">
                  {m.tie} · {m.age} · {m.stage}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t px-3 py-1.5 text-[11px] italic opacity-70" style={{ borderColor: 'rgba(59,42,26,0.25)' }}>
          Zoom in to stop and go back to the village.
        </div>
      </div>
    </>
  );
}

/** Notices from the fast-forward, stacked top right; family news stays a little longer. */
export function LifeNotices() {
  const [list, setList] = useState<LifeNotice[]>([]);
  useEffect(
    () =>
      noticeChannel.on((n) => {
        setList((l) => [...l.slice(-4), n]);
        setTimeout(() => setList((l) => l.filter((x) => x.id !== n.id)), n.family ? 9000 : 6000);
      }),
    [],
  );
  if (!list.length) return null;
  return (
    <div className="pointer-events-none absolute z-20 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-1.5" style={{ right: 'max(12px, env(safe-area-inset-right))', top: 'max(64px, calc(env(safe-area-inset-top) + 56px))', ...serif }}>
      {list.map((n) => (
        <div key={n.id} className="flex gap-2 rounded-md px-3 py-2 shadow-lg ring-1 ring-black/25" style={{ background: n.family ? PAPER : 'rgba(239,227,195,0.85)', color: INK }}>
          <span className="text-lg leading-none">{n.icon}</span>
          <div className="min-w-0">
            <div className="text-sm leading-snug">{n.text}</div>
            <div className="text-[11px] italic opacity-60">{n.date}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The fast-forward stops to ask you: a name for a baby born into the family, or who carries on after you. */
export function LifeAskDialog() {
  const [ask, setAsk] = useState<LifeAsk | null>(() => askChannel.last ?? null);
  const [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => askChannel.on(setAsk), []);
  useEffect(() => {
    if (ask?.kind === 'name') {
      setName(ask.suggestion);
      setTimeout(() => input.current?.select(), 30);
    }
  }, [ask]);
  if (!ask) return null;
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-md p-5 shadow-2xl ring-1 ring-black/40" style={{ background: PAPER, color: INK, ...serif }}>
        {ask.kind === 'name' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              uiCommands.emit({ kind: 'nameBaby', id: ask.id, name: name || ask.suggestion });
            }}
          >
            <div className="mb-1 text-2xl">👶</div>
            <div className="mb-3 text-base">
              A {ask.sex === 'm' ? 'son' : 'daughter'} is born to {ask.parents}. What will {ask.sex === 'm' ? 'he' : 'she'} be called?
            </div>
            <input ref={input} className="mb-3 w-full rounded border px-2 py-1.5 text-base" style={{ borderColor: 'rgba(59,42,26,0.4)', background: '#fbf6e8' }} value={name} onChange={(e) => setName(e.target.value)} maxLength={24} aria-label="Name" />
            <button type="submit" className="w-full rounded px-3 py-2 text-white" style={{ background: '#a8261c' }}>
              Name them
            </button>
          </form>
        ) : (
          <div>
            <div className="mb-1 text-2xl">🕯️</div>
            <div className="mb-1 text-base">You have died: {ask.died}.</div>
            <div className="mb-3 text-sm italic opacity-80">{ask.family ? 'Who carries the family on?' : 'Your family is gone. Who will you be now?'}</div>
            <div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
              {ask.options.map((m) => (
                <button key={m.id} className="flex items-center justify-between rounded px-3 py-2 text-left ring-1 ring-black/15 hover:bg-black/5" onClick={() => uiCommands.emit({ kind: 'chooseHeir', id: m.id })}>
                  <span>{m.name}</span>
                  <span className="text-xs opacity-70">
                    {m.tie ? `${m.tie} · ` : ''}
                    {m.age}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
