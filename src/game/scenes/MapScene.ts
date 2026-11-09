import Phaser from 'phaser';
import { crossfade } from '../camera/CameraRig';
import { villageSvg } from '../map/villageSvg';
import type { MapFeature } from '../map/worldMap';
import type { Region } from '../map/region';
import { RegionLayer } from '../map/RegionLayer';
import { paintedSvg } from '../map/paintedSvg';

/**
 * The map layers of the zoom, drawn over the live world by their own scene (so the world can fade out
 * and stop drawing entirely once you're zoomed out): the village plan on parchment, and people as
 * portrait tokens. The sandbox drives it every frame with its camera, fade and tokens.
 */

export interface Token {
  id: string;
  /** World ground position (px). */
  x: number;
  y: number;
  /** CSS colour of their tunic. */
  colour: string;
  name: string;
  /** −100..100. */
  mood: number;
  /** What they're doing, as one emoji (or ''). */
  icon: string;
  you: boolean;
  selected: boolean;
}

const FORE = 0.72;
const RADIUS = 15; // CSS px

interface TokenView {
  root: Phaser.GameObjects.Container;
  disc: Phaser.GameObjects.Graphics;
  letter: Phaser.GameObjects.Text;
  icon: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  key: string;
}

export class MapScene extends Phaser.Scene {
  private plan: Phaser.GameObjects.Image | null = null;
  private region: RegionLayer | null = null;
  private painted: Phaser.GameObjects.Image | null = null;
  private tokens = new Map<string, TokenView>();
  private ready = false;
  private alpha = 0;

  constructor() {
    super('map');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.cameras.main.transparent = true;
    this.ready = true;
  }

  /** The region around the village, drawn under the village plan. */
  buildRegion(region: Region): void {
    this.region = new RegionLayer(this, region);
    // The overview's painted map, baked once.
    const { svg, x, y, w, h } = paintedSvg(region);
    const key = 'region-painted';
    if (this.textures.exists(key)) this.textures.remove(key);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    this.load.svg(key, url);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      URL.revokeObjectURL(url);
      this.painted = this.add.image(x, y, key).setOrigin(0, 0).setDisplaySize(w, h).setDepth(-8).setAlpha(0).setVisible(false);
    });
    this.load.start();
  }

  /** Bake and lay down the village plan (once the sandbox has built its world). */
  buildPlan(features: MapFeature[], wM: number, hM: number): void {
    const { svg, w, h } = villageSvg(features, wM, hM);
    const key = 'village-plan';
    if (this.textures.exists(key)) this.textures.remove(key);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    this.load.svg(key, url);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      URL.revokeObjectURL(url);
      this.plan?.destroy();
      this.plan = this.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(w, h).setDepth(0).setAlpha(this.alpha);
    });
    this.load.start();
  }

  /**
   * Follow the world's camera, fade in as it fades out, and place everyone's tokens (a fixed size on
   * screen, whatever the zoom). `screenScale` is device px per CSS px divided by the zoom.
   */
  sync(cam: Phaser.Cameras.Scene2D.Camera, alpha: number, tokens: Token[], screenScale: number, span: number): void {
    if (!this.ready) return;
    const c = this.cameras.main;
    c.setZoom(cam.zoom);
    // The same bounds as the world's camera, so it clamps (and centres) its view the same way.
    if (cam.useBounds) {
      const b = cam.getBounds();
      if (!c.useBounds || c.getBounds().width !== b.width || c.getBounds().height !== b.height) c.setBounds(b.x, b.y, b.width, b.height);
    } else if (c.useBounds) c.removeBounds();
    c.setScroll(cam.scrollX, cam.scrollY);
    this.alpha = alpha;
    // Out at region scale the village plan and the household fade, leaving the region and you.
    const local = alpha * (1 - crossfade(span, 220, 420));
    this.plan?.setAlpha(local).setVisible(local > 0.001);
    // Out in the overview the ink map turns into the painted one (labels stay).
    const paint = alpha * crossfade(span, 3200, 6500);
    this.painted?.setAlpha(paint).setVisible(paint > 0.001);
    this.region?.update(alpha * (1 - crossfade(span, 3200, 6500)), screenScale, alpha);
    const seen = new Set<string>();
    for (const t of tokens) {
      seen.add(t.id);
      let v = this.tokens.get(t.id);
      if (!v) {
        v = this.makeToken();
        this.tokens.set(t.id, v);
      }
      const key = `${t.colour}|${t.mood > 30 ? 'g' : t.mood < -20 ? 'r' : 'a'}|${t.you}|${t.selected}|${t.icon}|${t.name}`;
      if (key !== v.key) {
        v.key = key;
        this.drawToken(v, t);
      }
      const a = t.you ? alpha : local;
      v.root.setPosition(t.x, t.y * FORE).setScale(screenScale).setAlpha(a).setVisible(a > 0.001).setDepth(10 + t.y / 1000 + (t.selected ? 1 : 0));
    }
    for (const [id, v] of this.tokens) {
      if (!seen.has(id)) {
        v.root.destroy();
        this.tokens.delete(id);
      }
    }
  }

  private makeToken(): TokenView {
    const res = Math.min(3, window.devicePixelRatio || 1);
    const disc = this.add.graphics();
    const letter = this.add.text(0, 0, '', { fontFamily: 'Georgia, serif', fontSize: '15px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setResolution(res);
    const icon = this.add.text(RADIUS * 0.8, -RADIUS * 0.8, '', { fontSize: '13px' }).setOrigin(0.5).setResolution(res);
    const name = this.add
      .text(0, RADIUS + 9, '', { fontFamily: 'Georgia, serif', fontSize: '11px', color: '#2a1d14', fontStyle: 'italic', stroke: '#f1e6c8', strokeThickness: 3 })
      .setOrigin(0.5)
      .setResolution(res);
    const root = this.add.container(0, 0, [disc, letter, icon, name]);
    return { root, disc, letter, icon, name, key: '' };
  }

  private drawToken(v: TokenView, t: Token): void {
    const g = v.disc;
    g.clear();
    const ring = t.mood > 30 ? 0x5fa850 : t.mood < -20 ? 0xc0392b : 0xd9a03a;
    // Selected: a gold halo. You: a white ring inside the mood ring.
    if (t.selected) {
      g.fillStyle(0xf0c060, 0.45);
      g.fillCircle(0, 0, RADIUS + 8);
    }
    g.fillStyle(0x1c140c, 0.35);
    g.fillEllipse(0, RADIUS - 1, RADIUS * 1.6, RADIUS * 0.6);
    g.fillStyle(ring, 1);
    g.fillCircle(0, 0, RADIUS + 3);
    g.fillStyle(Phaser.Display.Color.HexStringToColor(t.colour).color, 1);
    g.fillCircle(0, 0, RADIUS);
    g.lineStyle(t.you ? 2.5 : 1.2, t.you ? 0xffffff : 0x1c140c, 1);
    g.strokeCircle(0, 0, RADIUS);
    v.letter.setText(t.name.slice(0, 1).toUpperCase());
    v.icon.setText(t.icon);
    v.name.setText(t.name);
  }
}
