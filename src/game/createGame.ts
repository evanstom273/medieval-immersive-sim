import Phaser from 'phaser';
import { SandboxScene } from './scenes/SandboxScene';

/**
 * The canvas is sized in DEVICE pixels and displayed at CSS size, so high-density
 * screens (phones, the Fold) render sharply instead of upscaling a CSS-sized canvas.
 * Phaser 4 has no `resolution` setting, so this is done by hand: game size = CSS
 * size × devicePixelRatio, displayed at zoom 1/devicePixelRatio.
 */
export function createGame(parent: HTMLElement): Phaser.Game {
  const dpr = () => Math.min(window.devicePixelRatio || 1, 3);
  const size = () => ({
    w: Math.max(1, Math.round(parent.clientWidth * dpr())),
    h: Math.max(1, Math.round(parent.clientHeight * dpr())),
  });
  const initial = size();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#1c1b19',
    scale: {
      mode: Phaser.Scale.NONE,
      width: initial.w,
      height: initial.h,
      zoom: 1 / dpr(),
    },
    render: {
      antialias: true,
      roundPixels: false,
    },
    physics: {
      default: 'arcade',
      // Variable step: the body moves every rendered frame, matching high-refresh screens
      // (e.g. 120 Hz phones) instead of only on 60 Hz physics ticks.
      arcade: { debug: false, fixedStep: false },
    },
    input: {
      activePointers: 3,
    },
    // After start-up or regaining focus, Phaser clamps frame time to 1/60 s for `panicMax` frames,
    // so a device that renders slowly at first runs in slow motion. Keep that window short.
    fps: {
      panicMax: 20,
    },
    scene: [SandboxScene],
  });

  // Follow container size (orientation changes, folding/unfolding, window resizes) and DPR changes.
  const resize = () => {
    const { w, h } = size();
    if (w !== game.scale.width || h !== game.scale.height) game.scale.resize(w, h);
    game.scale.setZoom(1 / dpr());
  };
  const observer = new ResizeObserver(resize);
  observer.observe(parent);
  window.addEventListener('resize', resize);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    observer.disconnect();
    window.removeEventListener('resize', resize);
  });

  return game;
}

/** Device pixels per CSS pixel, as used by the game canvas. */
export function canvasDpr(game: Phaser.Game): number {
  return game.scale.width / Math.max(1, game.canvas.clientWidth || game.scale.width);
}
