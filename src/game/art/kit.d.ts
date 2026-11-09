/** Types for the catalogue drawing kit (kit.js). Loosely typed: it's generated drawing code. */
export interface KitItem {
  d: string;
  fill: string;
  fo: number;
  stroke: string;
  sw: number;
  so: number;
  clip: string;
  tf: string;
  mask: string;
}
export interface KitLabel {
  x: number;
  y: number;
  text: string;
  size: number;
  weight: number;
  fill: string;
  anchor: string;
  stroke: string;
  sw: number;
}
export interface KitOutput {
  items: KitItem[];
  clips: { id: string; d: string }[];
  masks: { id: string; d: string }[];
  labels: KitLabel[];
}
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Kit {
  M: number;
  RISE: number;
  FORE: number;
  OUT: string;
  begin(seed: number): void;
  end(): KitOutput;
  setOrigin(x: number, y: number): void;
  [fn: string]: any;
}
export function makeKit(): Kit;
