import { useEffect, useRef, useState } from 'react';
import { defaultBody, HAIR_COLOURS, randomBody, SKIN_TONES, stageOf, type Body, type Sex, type SliderKey } from '../game/characters/body';
import { buildView, drawFigure, VIEW_DEGREES } from '../game/characters/bodyArt';
import { NAME_IDEAS, type NewPerson } from '../game/characters/newPerson';

/**
 * Character creation: make the person you'll start the game as. Sex, age,
 * the body sliders (fat and muscle change with how someone lives; height,
 * frame, bust, waist and hips are fixed at birth), skin and hair. No clothing
 * yet: everyone starts in the same plain shirt.
 */

const LIFE: { key: SliderKey; label: string; low: string; high: string }[] = [
  { key: 'fat', label: 'Fat', low: 'thinnest', high: 'fattest' },
  { key: 'mus', label: 'Muscle', low: 'wasted', high: 'very muscular' },
];
const BIRTH: { key: SliderKey; label: string; low: string; high: string }[] = [
  { key: 'height', label: 'Height', low: 'short', high: 'tall' },
  { key: 'frame', label: 'Frame', low: 'slight', high: 'broad' },
  { key: 'bust', label: 'Bust', low: 'flat', high: 'full' },
  { key: 'waist', label: 'Waist', low: 'narrow', high: 'thick' },
  { key: 'hips', label: 'Hips', low: 'narrow', high: 'wide' },
];

/** The preview's eight facings: front, then turning to their left round to the back and on round. */
const FACINGS = [0, 1, 2, 3, 4, -3, -2, -1];
const CLOTHES = '#7b5e3b';

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

function Preview({ body, facing }: { body: Body; facing: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 300, h: 400 });

  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = ref.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    // An adult fills most of the height; children are drawn to the same scale, so they look small.
    // Room above for the name, below for the Turn buttons.
    const scale = Math.min((size.h - 116) / 100, size.w / 80) * dpr;
    const f = FACINGS[facing];
    const v = buildView(body, VIEW_DEGREES[Math.abs(f)]);
    // Feet above the Turn buttons.
    ctx.translate(c.width / 2, c.height - 60 * dpr);
    ctx.scale(scale, scale);
    // Ground shadow.
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(0,0,0,0.38)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.scale(Math.max(16, (v.silBox.x1 - v.silBox.x0) * v.X * 0.6), 6);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (f < 0) ctx.scale(-1, 1);
    // Hands (the game draws these itself, where they really are): one each side, the far one behind.
    const th = (VIEW_DEGREES[Math.abs(f)] * Math.PI) / 180;
    const hands = [-1, 1].map((sg) => ({ x: sg * v.handX * Math.cos(th), z: -sg * v.handX * Math.sin(th) }));
    const hand = (x: number, shaded: boolean) => {
      ctx.beginPath();
      ctx.arc(x, v.handY, v.handR, 0, Math.PI * 2);
      ctx.fillStyle = body.skin;
      ctx.fill();
      if (shaded) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fill();
      }
      ctx.strokeStyle = '#2a1d14';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    };
    for (const h of hands) if (h.z < -0.5) hand(h.x, true);
    drawFigure(ctx, v, { clothes: CLOTHES });
    for (const h of hands) if (h.z >= -0.5) hand(h.x, false);
  }, [body, facing, size]);

  return (
    <div ref={box} className="relative h-full w-full">
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

function Slider({ label, value, min, max, low, high, text, onChange }: { label: string; value: number; min: number; max: number; low: string; high: string; text: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-white/80">{text}</span>
      </div>
      <input type="range" min={min} max={max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-amber-300" />
      <div className="flex justify-between text-[11px] text-white/40">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </label>
  );
}

function Swatches({ label, colours, value, onChange }: { label: string; colours: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div>
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {colours.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === value}
            aria-label={c}
            onClick={() => onChange(c)}
            className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-neutral-900 ${c === value ? 'ring-2 ring-amber-300' : 'ring-1 ring-white/20'}`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

const Heading = ({ children }: { children: string }) => <div className="mt-5 mb-2 text-[11px] font-semibold tracking-wider text-white/45 uppercase">{children}</div>;

export function CharacterCreator({ initial, onDone }: { initial: NewPerson; onDone: (p: NewPerson) => void }) {
  const [name, setName] = useState(initial.name);
  const [body, setBody] = useState<Body>(initial.body);
  const [facing, setFacing] = useState(1);
  const set = (patch: Partial<Body>) => setBody((b) => ({ ...b, ...patch }));
  const setSex = (sex: Sex) => setBody((b) => ({ ...b, sex }));
  const start = () => onDone({ name: name.trim() || 'Newcomer', body });
  const turn = (d: number) => setFacing((f) => (f + d + FACINGS.length) % FACINGS.length);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1c1b19] text-white md:flex-row" style={{ touchAction: 'pan-y' }}>
      <div className="relative flex h-[42dvh] shrink-0 flex-col md:h-full md:flex-1">
        <div className="min-h-0 flex-1 bg-[radial-gradient(circle_at_50%_45%,#6c7b52,#3d4730)]">
          <Preview body={body} facing={facing} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-3 text-center">
          <div className="text-lg font-semibold drop-shadow">{name.trim() || 'Newcomer'}</div>
          <div className="text-xs text-white/70 drop-shadow">
            {body.age} · {stageOf(body.age)}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
          <button type="button" onClick={() => turn(-1)} aria-label="Turn left" className="rounded-full bg-neutral-900/70 px-4 py-2 text-sm ring-1 ring-white/15 hover:bg-neutral-800">
            ⟲ Turn
          </button>
          <button type="button" onClick={() => turn(1)} aria-label="Turn right" className="rounded-full bg-neutral-900/70 px-4 py-2 text-sm ring-1 ring-white/15 hover:bg-neutral-800">
            Turn ⟳
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:w-[400px] md:flex-none md:border-l md:border-white/10">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-6" style={{ touchAction: 'pan-y' }}>
          <h1 className="text-xl font-semibold">New character</h1>

          <label className="mt-4 block text-sm font-medium" htmlFor="cc-name">
            Name
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="cc-name"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') start();
              }}
              className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-white ring-1 ring-white/15 outline-none select-text focus:ring-amber-300"
            />
            <button
              type="button"
              aria-label="Suggest a name"
              onClick={() => setName(NAME_IDEAS[Math.floor(Math.random() * NAME_IDEAS.length)])}
              className="rounded-lg bg-white/10 px-3 ring-1 ring-white/15 hover:bg-white/15"
            >
              🎲
            </button>
          </div>

          <div className="mt-4 text-sm font-medium">Sex</div>
          <div className="mt-1 flex gap-2" role="radiogroup" aria-label="Sex">
            {(['m', 'f'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={body.sex === s}
                onClick={() => setSex(s)}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold ring-1 ${body.sex === s ? 'bg-amber-300 text-neutral-900 ring-amber-300' : 'bg-white/5 ring-white/15 hover:bg-white/10'}`}
              >
                {s === 'm' ? 'Male' : 'Female'}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <Slider label="Age" value={body.age} min={0} max={100} low="0" high="100" text={`${body.age} · ${stageOf(body.age)}`} onChange={(age) => set({ age })} />
          </div>

          <Heading>Changes with how they live</Heading>
          <div className="space-y-3">
            {LIFE.map((d) => (
              <Slider key={d.key} label={d.label} value={body[d.key]} min={-10} max={10} low={d.low} high={d.high} text={signed(body[d.key])} onChange={(v) => set({ [d.key]: v })} />
            ))}
          </div>

          <Heading>Fixed at birth</Heading>
          <div className="space-y-3">
            {BIRTH.map((d) => (
              <Slider key={d.key} label={d.label} value={body[d.key]} min={-10} max={10} low={d.low} high={d.high} text={signed(body[d.key])} onChange={(v) => set({ [d.key]: v })} />
            ))}
          </div>

          <Heading>Colouring</Heading>
          <div className="space-y-4">
            <Swatches label="Skin" colours={SKIN_TONES} value={body.skin} onChange={(skin) => set({ skin })} />
            <Swatches label="Hair" colours={HAIR_COLOURS} value={body.hair} onChange={(hair) => set({ hair })} />
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-white/10 px-5 py-3">
          <button type="button" onClick={() => setBody(randomBody(Math.random, { minAge: 16, maxAge: 80 }))} className="rounded-full px-4 py-2 text-sm text-white/80 ring-1 ring-white/15 hover:bg-white/10">
            Randomise
          </button>
          <button type="button" onClick={() => setBody(defaultBody(body.sex))} className="rounded-full px-4 py-2 text-sm text-white/80 ring-1 ring-white/15 hover:bg-white/10">
            Reset
          </button>
          <button type="button" onClick={start} className="ml-auto rounded-full bg-amber-300 px-5 py-2 text-sm font-semibold text-neutral-900 hover:bg-amber-200">
            Start
          </button>
        </div>
      </div>
    </div>
  );
}
