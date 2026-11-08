import { useEffect, useRef, useState } from 'react';
import { menuChannel, uiCommands, type MenuState } from '../game/bridge';

/**
 * Interaction menu: options fan out in a ring around what you clicked.
 *
 * Options trigger on release, and only if the press also started on them, so
 * the click/tap that opened the menu can't accidentally pick something.
 */
export function RadialMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const pressed = useRef<string | null>(null);

  useEffect(() => menuChannel.on(setMenu), []);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && uiCommands.emit({ kind: 'menuClose' });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  if (!menu) return null;

  const n = menu.options.length;
  const R = n <= 2 ? 62 : n <= 5 ? 78 : 96;
  const margin = R + 52;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const cx = Math.min(Math.max(menu.x, margin), W - margin);
  const cy = Math.min(Math.max(menu.y, margin), H - margin);

  return (
    <div
      className="absolute inset-0 z-30 touch-none select-none"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          uiCommands.emit({ kind: 'menuClose' });
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="absolute" style={{ left: cx, top: cy }}>
        <div className="radial-pop pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-neutral-900/80 px-3 py-1.5 text-center text-white shadow-lg ring-1 ring-white/10 backdrop-blur-sm">
          <div className="text-sm font-semibold whitespace-nowrap">{menu.title}</div>
          {menu.subtitle && <div className="text-[11px] whitespace-nowrap text-white/60">{menu.subtitle}</div>}
        </div>
        {menu.options.map((o, i) => {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / n;
          const x = Math.cos(a) * R;
          const y = Math.sin(a) * R;
          const disabled = !!o.disabled;
          return (
            <button
              key={o.id}
              className="radial-pop absolute flex w-[76px] flex-col items-center gap-1"
              style={{ left: x, top: y, animationDelay: `${i * 18}ms` }}
              aria-disabled={disabled}
              title={o.disabled}
              onPointerDown={(e) => {
                e.stopPropagation();
                pressed.current = o.id;
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                if (pressed.current === o.id && !disabled) uiCommands.emit({ kind: 'menuChoice', optionId: o.id });
                pressed.current = null;
              }}
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-full text-xl shadow-lg ring-1 transition ${
                  disabled ? 'bg-neutral-800/70 opacity-45 ring-white/10' : 'bg-white/95 ring-black/10 hover:scale-110 active:scale-95'
                }`}
              >
                {o.icon}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] leading-tight font-medium whitespace-nowrap shadow ${disabled ? 'bg-neutral-900/70 text-white/50' : 'bg-neutral-900/80 text-white'}`}>
                {disabled ? o.disabled : o.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
