import type { Gait } from './movement/motor';

/** Minimal pub/sub so Phaser can talk to the React HUD without either importing the other. */
export class Channel<T> {
  private listeners = new Set<(value: T) => void>();

  emit(value: T): void {
    for (const l of this.listeners) l(value);
  }

  on(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export type ControlMode = 'explore' | 'combat';

export interface HudState {
  mode: ControlMode;
  gait: Gait;
  crouched: boolean;
  /** Current speed in m/s. */
  speed: number;
}

export const hudChannel = new Channel<HudState>();
export const messageChannel = new Channel<string>();
