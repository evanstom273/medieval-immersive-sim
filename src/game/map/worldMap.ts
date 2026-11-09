/**
 * What the world map shows: the lie of the land in metres (buildings and their names, the well, the
 * fire, fences…), where everyone is, and your waypoint. The scene fills it in; the map draws it.
 */

export type MapFeature =
  | { kind: 'building'; name: string; x: number; y: number; w: number; h: number }
  | { kind: 'paving'; x: number; y: number; w: number; h: number }
  | { kind: 'wall'; x: number; y: number; w: number; h: number }
  | { kind: 'well' | 'fire' | 'midden' | 'dummy'; x: number; y: number; r: number; name: string };

export interface MapPerson {
  x: number;
  y: number;
  name: string;
  /** The person you control. */
  you: boolean;
}

export interface Waypoint {
  /** World metres. */
  x: number;
  y: number;
  /** Walk there yourself (false) or auto-walk with time sped up (true). */
  auto: boolean;
}

export interface MapState {
  /** World size, metres. */
  w: number;
  h: number;
  features: MapFeature[];
  people: MapPerson[];
  waypoint: Waypoint | null;
}
