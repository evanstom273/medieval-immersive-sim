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
  /** Doing something that can be cancelled (walking somewhere, talking, squaring up). */
  busy: boolean;
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
  | { kind: 'toggleSenses' }
  | { kind: 'setPaused'; paused: boolean }
  | { kind: 'setWalls'; mode: 'up' | 'cutaway' | 'down' }
  | { kind: 'cycleWalls' }
  | { kind: 'cancelAction' }
  /** Open the wait dialog for the character you control. */
  | { kind: 'wait' }
  /** Answer to the rest dialog: rest this many hours, or null to cancel. */
  | { kind: 'rest'; hours: number | null };

/** Game → UI: a character switch started / landed. */
export interface SwitchEvent {
  phase: 'start' | 'arrive';
  id: string;
  name: string;
  colour: string;
  activity: string;
}
export const switchChannel = new Channel<SwitchEvent>();

/** Game → UI: Sims-style wall display mode. */
export const wallsChannel = new Channel<'up' | 'cutaway' | 'down'>();

/** Game → UI: is the simulation paused? */
export const pausedChannel = new Channel<boolean>();
export const uiCommands = new Channel<UiCommand>();

/** Game → UI: the game clock (placeholder day length; see time/clock.ts). */
export interface ClockState {
  time: string;
  date: string;
  isDaytime: boolean;
  /** How many times normal speed time is running (1 normally; more while waiting or sleeping). */
  speed: number;
}
export const clockChannel = new Channel<ClockState>();

/** Game → UI: the TES-style "how long?" dialog for waiting or sleeping, or null to close it. */
export interface RestDialogState {
  kind: 'wait' | 'sleep';
  /** Hour of day now, for showing when you'd finish. */
  hourNow: number;
  defaultHours: number;
  maxHours: number;
}
export const restDialogChannel = new Channel<RestDialogState | null>();

// ------------------------------------------------------------------ performance test scene

/** UI → perf scene. */
export type PerfCommand = { kind: 'spawn'; count: number } | { kind: 'setPeople'; total: number } | { kind: 'startTest' } | { kind: 'cancelTest' };
export const perfCommands = new Channel<PerfCommand>();

/** Perf scene → UI, a few times a second: live numbers over the last second. */
export interface PerfStats {
  fps: number;
  low1Fps: number;
  frameMs: number;
  maxFrameMs: number;
  ticksPerSec: number;
  people: number;
  heapMb: number | null;
  /** Average ms per frame in each section over the last second. */
  sections: Record<string, number>;
  /** Recent frame times (ms), oldest first, for the graph. */
  recentFrameMs: number[];
  /** Seconds left on a running 30 s test, or null. */
  testLeft: number | null;
  renderer: string;
}
export const perfStatsChannel = new Channel<PerfStats>();

/** Perf scene → UI: a finished test, ready to download. */
export interface PerfResult {
  filename: string;
  csv: string;
  summary: { avgFps: number; low1Fps: number; avgFrameMs: number; p95FrameMs: number; maxFrameMs: number; ticksPerSec: number; frames: number; people: number };
}
export const perfResultChannel = new Channel<PerfResult>();
