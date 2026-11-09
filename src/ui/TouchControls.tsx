import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { hudChannel, type HudState } from '../game/bridge';
import { inputSourceChannel, touchCommands, touchStick, type TouchCommand } from '../game/input/touchInput';

/**
 * Touch controls. Active on touch devices; hands back to the mouse the moment a
 * mouse is used (touchscreen laptops).
 *
 * - Drag starting on the left half: movement stick, centred where your thumb first lands; it stays put while you
 *   steer (it doesn't follow your thumb). It walks; the Sprint button runs.
 * - Tap: walk to the spot, or use the thing under your finger (out of combat).
 * - Press and hold (or drag on the right half): walk there and keep following your finger.
 * - Two fingers: pinch to zoom.
 * - Buttons bottom-right: talk, ready (combat), lock-on, sneak, and in combat left / right hand.
 */

const STICK_RADIUS = 56; // CSS px
const DRAG_THRESHOLD = 12; // px before a touch counts as a drag
const TAP_MAX_MS = 300;
/** Held still this long without dragging: becomes hold-to-follow. */
const HOLD_MS = 250;

type Role = 'pending' | 'stick' | 'pinch' | 'follow' | 'ignored';

interface Track {
  id: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  t0: number;
  role: Role;
  holdTimer?: number;
}

const send = (c: TouchCommand) => touchCommands.emit(c);

export function TouchControls() {
  const [active, setActive] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);
  const [hud, setHud] = useState<HudState | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const tracks = useRef(new Map<number, Track>());
  const stickOrigin = useRef({ x: 0, y: 0 });
  const pinchDist = useRef(0);

  // Kept in a ref too so the stick handler sees it without re-rendering.
  const crouched = useRef(false);
  const sprinting = useRef(false);
  useEffect(
    () =>
      hudChannel.on((h) => {
        crouched.current = h.crouched;
        sprinting.current = h.sprinting;
        setHud(h);
      }),
    [],
  );

  // Switch between touch and mouse based on what was actually used last.
  useEffect(() => {
    if (active) inputSourceChannel.emit('touch');
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        setActive((was) => {
          if (!was) inputSourceChannel.emit('touch');
          return true;
        });
      } else if (e.pointerType === 'mouse') {
        setActive((was) => {
          if (was) inputSourceChannel.emit('mouse');
          return false;
        });
      }
    };
    window.addEventListener('pointerdown', onDown, { capture: true });
    return () => window.removeEventListener('pointerdown', onDown, { capture: true });
  }, []);

  const local = (e: ReactPointerEvent) => {
    const r = layer.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const showStick = (on: boolean) => {
    if (base.current) base.current.style.opacity = on ? '1' : '0';
    if (knob.current) knob.current.style.opacity = on ? '1' : '0';
  };

  const releaseStick = () => {
    touchStick.move = { x: 0, y: 0 };
    touchStick.sprint = false;
    showStick(false);
  };

  const startFollow = (t: Track) => {
    t.role = 'follow';
    clearTimeout(t.holdTimer);
    send({ kind: 'press', x: t.x, y: t.y });
  };

  const pinchPair = () => [...tracks.current.values()].filter((t) => t.role === 'pinch');

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    const track: Track = { id: e.pointerId, startX: p.x, startY: p.y, x: p.x, y: p.y, t0: performance.now(), role: 'pending' };
    tracks.current.set(e.pointerId, track);
    track.holdTimer = window.setTimeout(() => {
      if (track.role === 'pending' && tracks.current.get(track.id) === track) startFollow(track);
    }, HOLD_MS);

    // Two free fingers (not driving the stick) make a pinch.
    const free = [...tracks.current.values()].filter((t) => t.role === 'pending');
    if (free.length === 2) {
      free.forEach((t) => {
        t.role = 'pinch';
        clearTimeout(t.holdTimer);
      });
      pinchDist.current = Math.hypot(free[0].x - free[1].x, free[0].y - free[1].y);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = tracks.current.get(e.pointerId);
    if (!t) return;
    const p = local(e);
    t.x = p.x;
    t.y = p.y;

    if (t.role === 'pinch') {
      const pair = pinchPair();
      if (pair.length === 2) {
        const d = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
        if (d > 0 && pinchDist.current > 0) send({ kind: 'zoom', factor: pinchDist.current / d });
        pinchDist.current = d;
      }
      return;
    }

    if (t.role === 'pending' && Math.hypot(t.x - t.startX, t.y - t.startY) > DRAG_THRESHOLD) {
      const width = layer.current!.clientWidth;
      const stickTaken = [...tracks.current.values()].some((o) => o.role === 'stick');
      clearTimeout(t.holdTimer);
      const followTaken = [...tracks.current.values()].some((o) => o.role === 'follow');
      if (t.startX < width / 2 && !stickTaken) {
        t.role = 'stick';
        stickOrigin.current = { x: t.startX, y: t.startY };
        showStick(true);
      } else if (!followTaken) {
        startFollow(t);
      } else {
        t.role = 'ignored';
      }
    }

    if (t.role === 'follow') {
      send({ kind: 'hold', x: t.x, y: t.y });
      return;
    }

    if (t.role === 'stick') {
      const o = stickOrigin.current;
      let dx = t.x - o.x;
      let dy = t.y - o.y;
      const len = Math.hypot(dx, dy);
      const n = Math.min(len / STICK_RADIUS, 1);
      // Small deadzone, then a gentle push walks slowly and a firm one at full pace (the Sprint button runs).
      const mag = Math.min(1, Math.max(0, (n - 0.15) / (0.8 - 0.15)));
      touchStick.move = len > 0 ? { x: (dx / len) * mag, y: (dy / len) * mag } : { x: 0, y: 0 };
      touchStick.sprint = false;

      const kx = (dx / (len || 1)) * Math.min(len, STICK_RADIUS);
      const ky = (dy / (len || 1)) * Math.min(len, STICK_RADIUS);
      if (base.current) base.current.style.transform = `translate(${o.x - STICK_RADIUS}px, ${o.y - STICK_RADIUS}px)`;
      if (knob.current) {
        knob.current.style.transform = `translate(${o.x + kx - 26}px, ${o.y + ky - 26}px)`;
        knob.current.style.background = sprinting.current && !crouched.current ? 'rgba(240, 200, 120, 0.85)' : 'rgba(255, 255, 255, 0.55)';
      }
    }
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = tracks.current.get(e.pointerId);
    if (!t) return;
    tracks.current.delete(e.pointerId);
    clearTimeout(t.holdTimer);
    if (t.role === 'stick') releaseStick();
    if (t.role === 'follow') send({ kind: 'release' });
    if (t.role === 'pinch') {
      // The other finger stays down but no longer pinches.
      pinchPair().forEach((o) => (o.role = 'ignored'));
    }
    if (
      e.type === 'pointerup' &&
      t.role === 'pending' &&
      performance.now() - t.t0 < TAP_MAX_MS &&
      Math.hypot(t.x - t.startX, t.y - t.startY) <= DRAG_THRESHOLD
    ) {
      send({ kind: 'tap', x: t.x, y: t.y });
    }
  };

  if (!active) return null;

  const combat = hud?.mode === 'combat';

  return (
    <div
      ref={layer}
      className="absolute inset-0 touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div
        ref={base}
        className="pointer-events-none absolute top-0 left-0 rounded-full border-2 border-white/40 bg-black/20 opacity-0 transition-opacity"
        style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2 }}
      />
      <div
        ref={knob}
        className="pointer-events-none absolute top-0 left-0 h-[52px] w-[52px] rounded-full border-2 border-black/30 opacity-0 transition-opacity"
      />

      <div
        className="absolute"
        style={{
          right: 'max(16px, env(safe-area-inset-right))',
          // Above the bottom bar.
          bottom: 'calc(76px + env(safe-area-inset-bottom))',
          width: 216,
          height: 150,
        }}
      >
        <Btn size={52} right={164} bottom={8} on={hud?.crouched} onPress={() => send({ kind: 'toggleCrouch' })}>
          Sneak
        </Btn>
        {!combat && (
          <Btn size={52} right={96} bottom={8} on={hud?.sprinting} onPress={() => send({ kind: 'toggleSprint' })}>
            Sprint
          </Btn>
        )}
        <Btn size={52} right={164} bottom={92} onPress={() => send({ kind: 'talk' })}>
          Talk
        </Btn>
        <Btn size={52} right={96} bottom={92} on={combat} onPress={() => send({ kind: 'toggleCombat' })}>
          {combat ? 'Relax' : 'Ready'}
        </Btn>
        <Btn size={52} right={12} bottom={92} on={hud?.locked} onPress={() => send({ kind: 'toggleLock' })}>
          Lock
        </Btn>
        {combat && (
          <>
            <Btn size={76} right={0} bottom={0} onPress={() => send({ kind: 'punch', hand: 'right' })}>
              Right
            </Btn>
            <Btn size={64} right={88} bottom={6} onPress={() => send({ kind: 'punch', hand: 'left' })}>
              Left
            </Btn>
          </>
        )}
      </div>
    </div>
  );
}

function Btn(props: { size: number; right: number; bottom: number; on?: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <button
      className={`absolute flex items-center justify-center rounded-full text-xs font-medium text-white shadow-lg ring-1 backdrop-blur-sm active:scale-95 ${
        props.on ? 'bg-white/90 text-neutral-900 ring-white' : 'bg-neutral-900/65 ring-white/15'
      }`}
      style={{ width: props.size, height: props.size, right: props.right, bottom: props.bottom }}
      // Act on press, not release, and keep the touch away from the stick/tap layer.
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        props.onPress();
      }}
    >
      {props.children}
    </button>
  );
}
