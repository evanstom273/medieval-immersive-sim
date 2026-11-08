/**
 * A uniform grid of points, for "who's near here?" without checking everyone.
 * Pure TypeScript.
 */
export class SpatialHash<T extends { x: number; y: number }> {
  private cells = new Map<number, T[]>();

  constructor(private readonly cell: number) {}

  private keyOf(cx: number, cy: number): number {
    return cx * 73856093 + cy * 19349663;
  }

  build(items: readonly T[]): void {
    this.cells.clear();
    for (const it of items) {
      const k = this.keyOf(Math.floor(it.x / this.cell), Math.floor(it.y / this.cell));
      const list = this.cells.get(k);
      if (list) list.push(it);
      else this.cells.set(k, [it]);
    }
  }

  /** Everything in the cells overlapping the circle (a superset: check distances yourself). */
  query(x: number, y: number, r: number, out: T[] = []): T[] {
    out.length = 0;
    const x0 = Math.floor((x - r) / this.cell);
    const x1 = Math.floor((x + r) / this.cell);
    const y0 = Math.floor((y - r) / this.cell);
    const y1 = Math.floor((y + r) / this.cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const list = this.cells.get(this.keyOf(cx, cy));
        if (list) for (const it of list) out.push(it);
      }
    }
    return out;
  }
}
