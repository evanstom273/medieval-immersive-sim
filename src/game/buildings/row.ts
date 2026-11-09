import type { Building, DoorStyle, Opening, Plot, Pt, Wall, WallMaterial, WindowStyle } from './format';

/**
 * A terrace of four town buildings sharing side walls along a street (the
 * street is to the south): a coffee house, a butcher's, a narrow townhouse
 * and a general store. Middle to upper class, two full storeys, gables to the
 * street. Rooms are labelled until there's furniture.
 */

const ext = (from: Pt, to: Pt, material: WallMaterial, openings: Opening[] = [], thickness = 0.3): Wall => ({ from, to, thickness, material, exterior: true, openings });
const party = (x: number, d: number, material: WallMaterial): Wall => ({ from: [x, 0], to: [x, d], thickness: 0.2, material, exterior: true, openings: [] });
const part = (from: Pt, to: Pt, openings: Opening[] = []): Wall => ({ from, to, thickness: 0.15, material: 'daub', exterior: false, openings });
const door = (style: DoorStyle, at: number, width = 0.9, height = 2.0, hinge: 'left' | 'right' = 'left'): Opening => ({ kind: 'door', style, at, width, height, hinge, swing: 'in' });
const win = (style: WindowStyle, at: number, width: number, height: number, sill: number): Opening => ({ kind: 'window', style, at, width, height, sill });
const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

const D = 10;

export const COFFEE_HOUSE: Building = {
  id: 'coffee-house-1',
  name: 'Coffee house',
  kind: 'coffee house',
  size: { w: 6.5, d: D },
  storeys: [
    {
      level: 0,
      floorZ: 0,
      height: 3,
      walls: [
        ext([0, 0.15], [6.5, 0.15], 'timber', [win('leaded', 1.0, 1.1, 1.0, 1.0), door('plank', 4.8, 0.9, 1.9)]),
        // The door is set back in a porch, under the projecting bay of the floor above.
        ext([0, 9.85], [2.4, 9.85], 'timber', [win('mullion', 0.45, 1.6, 1.5, 0.85)]),
        ext([4.1, 9.85], [6.5, 9.85], 'timber', [win('mullion', 0.35, 1.6, 1.5, 0.85)]),
        ext([2.4, 8.85], [4.1, 8.85], 'timber', [door('panel', 0.35, 1.0, 2.05)]),
        ext([2.55, 8.85], [2.55, 10], 'timber'),
        ext([3.95, 8.85], [3.95, 10], 'timber'),
        party(0.1, D, 'timber'),
        party(6.4, D, 'timber'),
        part([0.2, 6.0], [6.3, 6.0], [door('plank', 2.4, 0.9, 1.9)]),
      ],
      rooms: [
        { name: 'Coffee room', use: 'trade: coffee, news, talk', outline: [[0.2, 6.075], [6.3, 6.075], [6.3, 9.7], [4.1, 9.7], [4.1, 8.7], [2.4, 8.7], [2.4, 9.7], [0.2, 9.7]], floor: 'boards' },
        { name: 'Kitchen', use: 'work: brewing, cooking', outline: box(0.2, 0.3, 6.3, 5.925), floor: 'quarry' },
      ],
      fixtures: [
        { kind: 'hearth', x: 0.2, y: 2.0, w: 1.2, d: 1.6 },
        { kind: 'stair', x: 5.2, y: 1.0, w: 1.0, d: 3.0, heading: 'n', toLevel: 1 },
        { kind: 'column', x: 2.55, y: 10.85, w: 0.26, d: 0.26, material: 'ashlar' },
        { kind: 'column', x: 3.95, y: 10.85, w: 0.26, d: 0.26, material: 'ashlar' },
      ],
    },
    {
      level: 1,
      floorZ: 3,
      height: 2.8,
      walls: [
        ext([0, 0.15], [6.5, 0.15], 'timber', [win('leaded', 1.5, 1.1, 1.1, 0.8)]),
        // The middle is pulled out over the porch as a bay with its own gable, on columns.
        ext([0, 9.85], [2.4, 9.85], 'timber', [win('leaded', 0.6, 1.1, 1.2, 0.8)]),
        ext([4.1, 9.85], [6.5, 9.85], 'timber', [win('leaded', 0.7, 1.1, 1.2, 0.8)]),
        ext([2.4, 10.85], [4.1, 10.85], 'timber', [win('leaded', 0.3, 1.1, 1.2, 0.8)], 0.3),
        { ...ext([2.55, 9.85], [2.55, 11], 'timber'), top: 2.3 },
        { ...ext([3.95, 9.85], [3.95, 11], 'timber'), top: 2.3 },
        party(0.1, D, 'timber'),
        party(6.4, D, 'timber'),
        part([0.2, 5.0], [6.3, 5.0], [door('plank', 3.8, 0.85, 1.9)]),
      ],
      rooms: [
        { name: 'Long room', use: 'trade: meetings, clubs, auctions', outline: [[0.2, 5.075], [6.3, 5.075], [6.3, 9.7], [3.8, 9.7], [3.8, 10.7], [2.7, 10.7], [2.7, 9.7], [0.2, 9.7]], floor: 'boards' },
        { name: "Keeper's chamber", use: 'sleeping', outline: box(0.2, 0.3, 6.3, 4.925), floor: 'boards' },
      ],
      fixtures: [{ kind: 'stairwell', x: 5.2, y: 1.0, w: 1.0, d: 3.0 }],
    },
  ],
  roof: { shape: 'gable', ridge: 'ns', covering: 'tile', pitch: 50, overhang: 0.3, eaves: 5.8 },
  chimneys: [{ x: 0.2, y: 2.2, w: 0.8, d: 0.8, material: 'brick', aboveRidge: 0.6 }],
  gablets: [{ x: 2.4, w: 1.7, from: 9.85, to: 11, eaves: 5.3, covering: 'tile', pitch: 50, overhang: 0.25, material: 'timber' }],
  sign: { text: 'COFFEE', at: 5.6 },
  notes: 'The door is set back in a porch; above it the middle of the upper floor projects as a bay with its own gable, carried on two columns.',
};

export const BUTCHERS: Building = {
  id: 'butchers-1',
  name: "Butcher's",
  kind: 'butcher',
  size: { w: 5, d: D },
  storeys: [
    {
      level: 0,
      floorZ: 0,
      height: 3,
      walls: [
        ext([0, 0.15], [5, 0.15], 'brick', [door('plank', 2.4, 0.9, 1.9)]),
        ext([0, 9.85], [5, 9.85], 'brick', [win('shop', 0.4, 2.6, 1.3, 0.8), door('stable', 3.55, 0.95, 2.0)]),
        party(0.1, D, 'brick'),
        party(4.9, D, 'brick'),
        part([0.2, 5.5], [4.8, 5.5], [door('plank', 2.3, 0.9, 1.9)]),
      ],
      rooms: [
        { name: 'Shop', use: 'trade: meat', outline: box(0.2, 5.575, 4.8, 9.7), floor: 'flags' },
        { name: 'Cutting room', use: 'work: butchery, hanging', outline: box(0.2, 0.3, 4.8, 5.425), floor: 'quarry' },
      ],
      fixtures: [
        { kind: 'stair', x: 0.3, y: 1.0, w: 0.9, d: 2.8, heading: 'n', toLevel: 1 },
        { kind: 'hearth', x: 3.7, y: 2.0, w: 1.1, d: 1.4 },
      ],
    },
    {
      level: 1,
      floorZ: 3,
      height: 2.8,
      walls: [
        ext([0, 0.15], [5, 0.15], 'timber', [win('leaded', 2.0, 1.0, 1.0, 0.9)]),
        ext([0, 9.85], [5, 9.85], 'timber', [win('leaded', 0.8, 1.1, 1.2, 0.8), win('leaded', 3.0, 1.1, 1.2, 0.8)]),
        party(0.1, D, 'timber'),
        party(4.9, D, 'timber'),
        part([0.2, 5.0], [4.8, 5.0], [door('plank', 2.2, 0.85, 1.9)]),
      ],
      rooms: [
        { name: 'Parlour', use: 'living', outline: box(0.2, 5.075, 4.8, 9.7), floor: 'boards' },
        { name: 'Chamber', use: 'sleeping', outline: box(0.2, 0.3, 4.8, 4.925), floor: 'boards' },
      ],
      fixtures: [{ kind: 'stairwell', x: 0.3, y: 1.0, w: 0.9, d: 2.8 }],
    },
  ],
  roof: { shape: 'gable', ridge: 'ns', covering: 'tile', pitch: 50, overhang: 0.3, eaves: 5.8 },
  chimneys: [{ x: 3.9, y: 2.3, w: 0.8, d: 0.8, material: 'brick', aboveRidge: 0.6 }],
  sign: { text: 'BUTCHER', at: 4.3 },
};

export const TOWNHOUSE: Building = {
  id: 'townhouse-1',
  name: 'Townhouse',
  kind: 'townhouse',
  size: { w: 4.5, d: D },
  storeys: [
    {
      level: 0,
      floorZ: 0,
      height: 3,
      walls: [
        ext([0, 0.15], [4.5, 0.15], 'brick', [door('plank', 0.35, 0.8, 1.9), win('sash', 2.5, 1.0, 1.5, 0.8)]),
        ext([0, 9.85], [4.5, 9.85], 'brick', [door('panel', 0.45, 0.9, 1.85), win('sash', 2.55, 1.05, 1.75, 0.7)]),
        party(0.1, D, 'brick'),
        party(4.4, D, 'brick'),
        part([1.55, 0.3], [1.55, 9.7], [door('plank', 2.4, 0.8, 1.9), door('panel', 6.4, 0.8, 1.9)]),
        part([1.625, 5.2], [4.3, 5.2]),
      ],
      rooms: [
        { name: 'Passage', use: 'hall and stair', outline: box(0.2, 0.3, 1.475, 9.7), floor: 'flags' },
        { name: 'Kitchen', use: 'cooking, servants', outline: box(1.625, 0.3, 4.3, 5.125), floor: 'flags' },
        { name: 'Parlour', use: 'living, receiving', outline: box(1.625, 5.275, 4.3, 9.7), floor: 'boards' },
      ],
      fixtures: [
        { kind: 'stair', x: 0.3, y: 1.0, w: 1.0, d: 3.0, heading: 'n', toLevel: 1 },
        { kind: 'hearth', x: 3.2, y: 1.8, w: 1.1, d: 1.4 },
      ],
    },
    {
      level: 1,
      floorZ: 3,
      height: 3,
      walls: [
        ext([0, 0.15], [4.5, 0.15], 'brick', [win('sash', 2.5, 1.0, 1.5, 0.7)]),
        ext([0, 9.85], [4.5, 9.85], 'brick', [win('sash', 0.5, 1.05, 1.75, 0.6), win('sash', 2.55, 1.05, 1.75, 0.6)]),
        party(0.1, D, 'brick'),
        party(4.4, D, 'brick'),
        part([1.55, 0.3], [1.55, 4.425], [door('plank', 2.4, 0.8, 1.9)]),
        part([0.2, 4.5], [4.3, 4.5], [door('panel', 0.4, 0.8, 1.9)]),
      ],
      rooms: [
        { name: 'Landing', use: 'stair', outline: box(0.2, 0.3, 1.475, 4.425), floor: 'boards' },
        { name: 'Bedchamber', use: 'sleeping', outline: box(1.625, 0.3, 4.3, 4.425), floor: 'boards' },
        { name: 'Dining room', use: 'dining, receiving', outline: box(0.2, 4.575, 4.3, 9.7), floor: 'turkey' },
      ],
      fixtures: [{ kind: 'stairwell', x: 0.3, y: 1.0, w: 1.0, d: 3.0 }],
    },
  ],
  roof: { shape: 'dutchGable', ridge: 'ns', covering: 'tile', pitch: 50, overhang: 0.3, eaves: 6.0 },
  chimneys: [{ x: 3.4, y: 2.0, w: 0.8, d: 0.8, material: 'brick', aboveRidge: 0.6 }],
};

export const GENERAL_STORE: Building = {
  id: 'general-store-1',
  name: 'General store',
  kind: 'general store',
  size: { w: 6, d: D },
  storeys: [
    {
      level: 0,
      floorZ: 0,
      height: 3,
      walls: [
        ext([0, 0.15], [6, 0.15], 'ashlar', [door('plank', 4.4, 1.1, 2.0)]),
        // The street corner is cut off on the diagonal for the door; the floor above overhangs it, on a column.
        ext([0, 9.85], [3.8, 9.85], 'ashlar', [win('shop', 0.4, 2.4, 1.3, 0.8)]),
        ext([3.8, 9.85], [5.85, 7.8], 'ashlar', [door('oak', 0.95, 1.0, 2.0)]),
        party(0.1, D, 'ashlar'),
        ext([5.85, 0], [5.85, 7.8], 'ashlar', [win('leaded', 5.8, 1.0, 1.2, 0.9)]),
        part([0.2, 5.0], [5.7, 5.0], [door('plank', 2.8, 1.0, 1.9)]),
      ],
      rooms: [
        { name: 'Shop', use: 'trade: groceries, candles, cloth, tools', outline: [[0.2, 5.075], [5.7, 5.075], [5.7, 7.74], [3.74, 9.7], [0.2, 9.7]], floor: 'boards' },
        { name: 'Storeroom', use: 'store', outline: box(0.2, 0.3, 5.7, 4.925), floor: 'earth' },
      ],
      fixtures: [
        { kind: 'stair', x: 0.3, y: 1.0, w: 0.95, d: 3.0, heading: 'n', toLevel: 1 },
        { kind: 'column', x: 5.82, y: 9.82, w: 0.3, d: 0.3, material: 'ashlar' },
      ],
    },
    {
      level: 1,
      floorZ: 3,
      height: 2.8,
      walls: [
        ext([0, 0.15], [6, 0.15], 'ashlar', [win('leaded', 2.5, 1.1, 1.0, 0.9)]),
        ext([0, 9.85], [6, 9.85], 'ashlar', [win('mullion', 0.6, 1.9, 1.3, 0.8), win('mullion', 3.5, 1.9, 1.3, 0.8)]),
        party(0.1, D, 'ashlar'),
        ext([5.85, 0], [5.85, D], 'ashlar', [win('leaded', 6.2, 1.0, 1.1, 0.8)]),
        part([0.2, 5.0], [5.7, 5.0], [door('plank', 1.6, 0.85, 1.9)]),
      ],
      rooms: [
        { name: 'Parlour', use: 'living', outline: box(0.2, 5.075, 5.7, 9.7), floor: 'boards' },
        { name: 'Chamber', use: 'sleeping', outline: box(0.2, 0.3, 5.7, 4.925), floor: 'boards' },
      ],
      fixtures: [
        { kind: 'stairwell', x: 0.3, y: 1.0, w: 0.95, d: 3.0 },
        { kind: 'hearth', x: 4.55, y: 1.8, w: 1.1, d: 1.4 },
      ],
    },
  ],
  roof: { shape: 'gable', ridge: 'ns', covering: 'slate', pitch: 45, overhang: 0.3, eaves: 5.8 },
  chimneys: [{ x: 4.8, y: 2.1, w: 0.8, d: 0.8, material: 'ashlar', aboveRidge: 0.6 }],
  sign: { text: 'GENERAL STORE', at: 0.2 },
  notes: 'On the corner: the ground floor is cut away on the diagonal for the door, the floor above carried on a column.',
};

/** The four, side by side along the street. */
export const TERRACE: Plot[] = [
  { building: COFFEE_HOUSE, x: 0, y: 0 },
  { building: BUTCHERS, x: 6.5, y: 0 },
  { building: TOWNHOUSE, x: 11.5, y: 0 },
  { building: GENERAL_STORE, x: 16, y: 0 },
];
