import Phaser from 'phaser';

/**
 * Things floating above a character's head: an emote bubble and a health bar.
 * Drawn in world space but counter-scaled so they stay the same size on
 * screen at any zoom. Clean, modern placeholder styling.
 */
export class Overhead {
  private readonly container: Phaser.GameObjects.Container;
  private readonly bubble: Phaser.GameObjects.Container;
  private readonly bubbleText: Phaser.GameObjects.Text;
  private readonly bar: Phaser.GameObjects.Graphics;
  /** ? / ! badge: noticing / has just noticed the player's character. */
  private readonly indicator: Phaser.GameObjects.Container;
  private readonly indicatorBg: Phaser.GameObjects.Graphics;
  private readonly indicatorText: Phaser.GameObjects.Text;
  private indicatorValue: '?' | '!' | null = null;
  private bubbleUntil = 0;
  private persistentIcon: string | null = null;

  constructor(scene: Phaser.Scene) {
    const bg = scene.add.graphics();
    bg.fillStyle(0xffffff, 0.94);
    bg.fillRoundedRect(-19, -40, 38, 32, 10);
    bg.fillTriangle(-6, -9, 6, -9, 0, -2);
    bg.lineStyle(1.5, 0x000000, 0.18);
    bg.strokeRoundedRect(-19, -40, 38, 32, 10);
    this.bubbleText = scene.add
      .text(0, -24, '', { fontFamily: '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif', fontSize: '20px' })
      .setOrigin(0.5);
    this.bubble = scene.add.container(0, 0, [bg, this.bubbleText]).setVisible(false);
    this.bar = scene.add.graphics();
    this.indicatorBg = scene.add.graphics();
    this.indicatorText = scene.add
      .text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    this.indicator = scene.add.container(24, -16, [this.indicatorBg, this.indicatorText]).setVisible(false);
    this.container = scene.add.container(0, 0, [this.bar, this.bubble, this.indicator]).setDepth(40);
  }

  /** Show an emote for a while. */
  emote(icon: string, now: number, durationMs = 1600): void {
    this.bubbleText.setText(icon);
    this.bubble.setVisible(true);
    this.bubbleUntil = now + durationMs;
  }

  setIndicator(value: '?' | '!' | null): void {
    if (value === this.indicatorValue) return;
    this.indicatorValue = value;
    this.indicator.setVisible(value !== null);
    if (!value) return;
    const g = this.indicatorBg;
    g.clear();
    g.fillStyle(value === '!' ? 0xd9443a : 0xe8b23a, 1);
    g.fillCircle(0, 0, 10);
    g.lineStyle(1.5, 0x000000, 0.25);
    g.strokeCircle(0, 0, 10);
    this.indicatorText.setText(value).setColor(value === '!' ? '#ffffff' : '#2a1d05');
  }

  /** An emote that stays until cleared (e.g. a white flag while yielded). */
  setPersistent(icon: string | null): void {
    this.persistentIcon = icon;
  }

  /**
   * @param scale  world units per screen (CSS) pixel, i.e. devicePixelRatio / camera zoom
   */
  update(x: number, y: number, scale: number, now: number, health: number, maxHealth: number, showBar: boolean): void {
    this.container.setPosition(x, y - 18);
    this.container.setScale(scale);

    if (now >= this.bubbleUntil) {
      if (this.persistentIcon) {
        this.bubbleText.setText(this.persistentIcon);
        this.bubble.setVisible(true);
      } else {
        this.bubble.setVisible(false);
      }
    }
    // Lift the bubble above the bar when both show.
    this.bubble.setY(showBar ? -8 : 0);

    const b = this.bar;
    b.clear();
    if (showBar) {
      const w = 36;
      const f = Math.max(0, health / maxHealth);
      b.fillStyle(0x000000, 0.55);
      b.fillRoundedRect(-w / 2 - 1, -7, w + 2, 6, 3);
      b.fillStyle(f > 0.5 ? 0x7fd47f : f > 0.25 ? 0xe8c25a : 0xe0574a, 1);
      if (f > 0) b.fillRoundedRect(-w / 2, -6, w * f, 4, 2);
    }
  }

  destroy(): void {
    this.container.destroy();
  }
}
