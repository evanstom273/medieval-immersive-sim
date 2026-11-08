import type { Gait } from './movement/motor';
import type { MenuOption } from './world/interactables';

/** Minimal pub/sub so Phaser can talk to the React HUD without either importing the other. */
export class Channel<T> {
  private listeners = new Set<(value: T) => void>();
  /** Most recent value, for late subscribers. */
  last: T | undefined;

  emit(value: T): void {
    this.last = value;
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
  /** Camera view span, metres across. */
  span: number;
  /** Touch lock-on active. */
  locked: boolean;
}

export const hudChannel = new Channel<HudState>();
export const messageChannel = new Channel<string>();

// ------------------------------------------------------------------ roster & menus


export interface RosterMember {
  id: string;
  name: string;
  /** CSS colour of their tunic, for portraits. */
  colour: string;
  health: number;
  maxHealth: number;
  status: 'ok' | 'yielded' | 'ko';
  mode: ControlMode;
  controlled: boolean;
  temperament: string;
  temperamentNote: string;
  /** What they're up to, e.g. "Chatting with Agnes". */
  activity: string;
}

export interface RelationshipRow {
  id: string;
  name: string;
  /** Active character's opinion of them. */
  mine: number;
  /** Their opinion of the active character. */
  theirs: number;
}

export interface MemoryRow {
  text: string;
  /** Who it involves (ids), so the panel can show memories per relationship. */
  actor?: string;
  target?: string;
  sense: 'sight' | 'sound' | 'smell' | 'touch';
  /** 0..1, fading over time. */
  confidence: number;
  agoS: number;
}

export interface RosterState {
  members: RosterMember[];
  activeId: string;
  relationships: RelationshipRow[];
  /** What the active character remembers perceiving, most recent first. */
  memories: MemoryRow[];
}

export const rosterChannel = new Channel<RosterState>();

export interface MenuState {
  /** Screen position (CSS px, relative to the game container) to centre the menu on. */
  x: number;
  y: number;
  title: string;
  subtitle?: string;
  options: MenuOption[];
}

export const menuChannel = new Channel<MenuState | null>();

/** UI → game. */
export type UiCommand =
  | { kind: 'switchTo'; id: string }
  | { kind: 'menuChoice'; optionId: string }
  | { kind: 'menuClose' }
  | { kind: 'toggleSenses' };
export const uiCommands = new Channel<UiCommand>();
