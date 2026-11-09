import type { Building } from './format';

/**
 * A small cottage: a hall (the house-place, where the cooking, eating and
 * most of living happen) round a stone hearth, a buttery for food and drink,
 * a chamber to sleep in, and a loft in the roof up a ladder. Timber frame on
 * a stone plinth, a rubble gable end carrying the chimney, thatch.
 */
export const COTTAGE: Building = {
  id: 'cottage-1',
  name: 'Cottage',
  kind: 'cottage',
  size: { w: 9, d: 5.4 },
  storeys: [
    {
      level: 0,
      floorZ: 0,
      height: 2.6,
      walls: [
        {
          from: [0, 0.15],
          to: [9, 0.15],
          thickness: 0.3,
          material: 'timber',
          exterior: true,
          openings: [
            { kind: 'door', style: 'plank', at: 1.9, width: 0.85, height: 1.85, hinge: 'left', swing: 'in' },
            { kind: 'window', style: 'shutters', at: 6.8, width: 0.7, height: 0.6, sill: 1.1 },
          ],
        },
        {
          from: [0, 5.25],
          to: [9, 5.25],
          thickness: 0.3,
          material: 'timber',
          exterior: true,
          openings: [
            { kind: 'window', style: 'leaded', at: 0.9, width: 1.1, height: 0.95, sill: 0.9 },
            { kind: 'door', style: 'plank', at: 3.0, width: 0.9, height: 1.85, hinge: 'left', swing: 'in' },
            { kind: 'window', style: 'leaded', at: 6.5, width: 1.1, height: 0.95, sill: 0.9 },
          ],
        },
        { from: [0.15, 0], to: [0.15, 5.4], thickness: 0.3, material: 'rubble', exterior: true, openings: [] },
        {
          from: [8.85, 0],
          to: [8.85, 5.4],
          thickness: 0.3,
          material: 'timber',
          exterior: true,
          openings: [{ kind: 'window', style: 'shutters', at: 3.3, width: 0.6, height: 0.6, sill: 1.1 }],
        },
        {
          from: [5.4, 0.3],
          to: [5.4, 5.1],
          thickness: 0.15,
          material: 'daub',
          exterior: false,
          openings: [
            { kind: 'door', style: 'plank', at: 0.55, width: 0.75, height: 1.8, hinge: 'left', swing: 'in' },
            { kind: 'door', style: 'plank', at: 3.0, width: 0.75, height: 1.8, hinge: 'right', swing: 'in' },
          ],
        },
        { from: [5.475, 2.3], to: [8.7, 2.3], thickness: 0.15, material: 'daub', exterior: false, openings: [] },
      ],
      rooms: [
        { name: 'Hall', use: 'living: cooking, eating, work', outline: [[0.3, 0.3], [5.325, 0.3], [5.325, 5.1], [0.3, 5.1]], floor: 'flags' },
        { name: 'Buttery', use: 'store: food and drink', outline: [[5.475, 0.3], [8.7, 0.3], [8.7, 2.225], [5.475, 2.225]], floor: 'earth' },
        { name: 'Chamber', use: 'sleeping', outline: [[5.475, 2.375], [8.7, 2.375], [8.7, 5.1], [5.475, 5.1]], floor: 'boards' },
      ],
      fixtures: [
        { kind: 'hearth', x: 0.3, y: 1.7, w: 1.1, d: 2.0 },
        { kind: 'ladder', x: 4.35, y: 1.2, w: 0.5, d: 1.0, heading: 'n', toLevel: 1 },
      ],
    },
    {
      level: 1,
      floorZ: 2.4,
      height: 1.9,
      walls: [
        { from: [0.15, 0.3], to: [0.15, 5.1], thickness: 0.3, material: 'rubble', exterior: true, openings: [] },
        {
          from: [8.85, 0.3],
          to: [8.85, 5.1],
          thickness: 0.3,
          material: 'timber',
          exterior: true,
          openings: [{ kind: 'window', style: 'shutters', at: 2.1, width: 0.6, height: 0.5, sill: 0.4 }],
        },
      ],
      rooms: [{ name: 'Loft', use: 'sleeping, storage', outline: [[0.3, 0.3], [8.7, 0.3], [8.7, 5.1], [0.3, 5.1]], floor: 'boards' }],
      fixtures: [{ kind: 'hatch', x: 4.25, y: 1.1, w: 0.7, d: 0.9 }],
    },
  ],
  roof: { shape: 'gable', ridge: 'ew', covering: 'thatch', pitch: 50, overhang: 0.4, eaves: 2.6 },
  chimneys: [{ x: 0.2, y: 2.3, w: 0.9, d: 0.8, material: 'brick', aboveRidge: 0.9 }],
  notes: 'One-and-a-half storeys: the loft is in the roof space, highest along the ridge.',
};
