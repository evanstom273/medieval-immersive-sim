/**
 * The building format: a building is a plan made of catalogue pieces (walls,
 * floors, doors, windows, stairs, roofs), not a picture. The game assembles
 * it from those pieces, so walls cut away, doors open, roofs lift and
 * materials can be swapped (e.g. per region) without redrawing anything.
 * Preset buildings and, later, build mode both use this format.
 *
 * Units are metres. Plan axes: x runs east, y runs south (down the screen in
 * the game's view), origin at the building's north-west outer corner.
 * Storeys are numbered by level: −1 cellar, 0 ground, 1 the floor above…
 *
 * Not loaded by the game yet: this fixes the shape of the data first.
 */

export type WallMaterial = 'daub' | 'timber' | 'rubble' | 'brick' | 'ashlar' | 'plank';
export type FloorMaterial = 'earth' | 'matting' | 'boards' | 'flags' | 'quarry' | 'tiles' | 'marble' | 'turkey';
export type RoofCovering = 'thatch' | 'shingle' | 'tile' | 'slate' | 'lead';
export type RoofShape = 'gable' | 'hipped' | 'leanTo' | 'flat' | 'battlements' | 'cone' | 'pyramid' | 'dutchGable';
export type DoorStyle = 'plank' | 'oak' | 'panel' | 'stable' | 'arched' | 'gate';
export type WindowStyle = 'shutters' | 'leaded' | 'mullion' | 'sash' | 'shop' | 'slit';

export type Pt = [number, number];

export interface Opening {
  kind: 'door' | 'window';
  style: DoorStyle | WindowStyle;
  /** Distance along the wall from its `from` end to the opening's near edge. */
  at: number;
  width: number;
  /** Doors: from the floor. Windows: the glazed height. */
  height: number;
  /** Windows: height of the sill above the floor. */
  sill?: number;
  /** Doors: which side the hinges are on, looking from `from` towards `to`, and which way it swings. */
  hinge?: 'left' | 'right';
  swing?: 'in' | 'out';
}

/** A straight wall given by its centre line: east–west, north–south, or at 45° (e.g. a corner cut off for a door). */
export interface Wall {
  from: Pt;
  to: Pt;
  thickness: number;
  material: WallMaterial;
  /** Outside wall (vs. an inside partition): outside walls take the weather and the roof. */
  exterior: boolean;
  openings: Opening[];
  /** Where the wall stops, above its storey's floor, if short of the full storey (e.g. a projecting bay under its own roof). */
  top?: number;
}

/** A room: an outline on the floor, a name, a floor covering and what it's for. */
export interface Room {
  name: string;
  /** What it's for, for people and the simulation (e.g. living, sleeping, store, trade). */
  use: string;
  outline: Pt[];
  floor: FloorMaterial;
}

/** Fixed things that are part of the building rather than furniture. */
export type Fixture =
  | { kind: 'hearth'; x: number; y: number; w: number; d: number }
  | { kind: 'ladder' | 'stair'; x: number; y: number; w: number; d: number; /** Goes up towards: */ heading: 'n' | 's' | 'e' | 'w'; toLevel: number; style?: string }
  | { kind: 'hatch'; x: number; y: number; w: number; d: number }
  /** The opening in a floor where a stair from below comes up. */
  | { kind: 'stairwell'; x: number; y: number; w: number; d: number }
  /** A column holding up the floor above (e.g. where an upper storey overhangs a cut-away corner). (x, y) is its centre. */
  | { kind: 'column'; x: number; y: number; w: number; d: number; material: WallMaterial };

export interface Storey {
  level: number;
  /** Height of the floor above the ground. */
  floorZ: number;
  /** Floor to ceiling (or to the eaves, for the top storey). */
  height: number;
  walls: Wall[];
  rooms: Room[];
  fixtures: Fixture[];
}

export interface Roof {
  shape: RoofShape;
  /** Which way the ridge runs, for gabled shapes: east–west or north–south. */
  ridge: 'ew' | 'ns';
  covering: RoofCovering;
  /** Degrees. */
  pitch: number;
  /** How far the eaves and verges reach past the walls. */
  overhang: number;
  /** Height of the eaves above the ground. */
  eaves: number;
}

export interface Chimney {
  x: number;
  y: number;
  w: number;
  d: number;
  material: WallMaterial;
  /** How far the stack rises above the ridge. */
  aboveRidge: number;
}

/**
 * A small gabled roof of its own, ridge north–south, over part of the front (a projecting bay, a porch):
 * from where it meets the main wall (`from`, y) out to its own gable at `to` (y), across x … x + w.
 */
export interface Gablet {
  x: number;
  w: number;
  from: number;
  to: number;
  eaves: number;
  covering: RoofCovering;
  pitch: number;
  overhang: number;
  /** The material of its gable end. */
  material: WallMaterial;
}

/** A sign hung over the street (shops and taverns had them). */
export interface Sign {
  text: string;
  /** Along the front, from the west corner. */
  at: number;
}

export interface Building {
  id: string;
  name: string;
  /** What kind of building (cottage, townhouse, shop, alehouse, inn…). */
  kind: string;
  /** Outer footprint. */
  size: { w: number; d: number };
  storeys: Storey[];
  roof: Roof;
  chimneys: Chimney[];
  gablets?: Gablet[];
  sign?: Sign;
  notes?: string;
}

/** A building placed on the map: its north-west corner at (x, y), in metres. Buildings in a row share their side walls' line. */
export interface Plot {
  building: Building;
  x: number;
  y: number;
}
