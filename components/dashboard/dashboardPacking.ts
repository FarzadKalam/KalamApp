export const DASHBOARD_PACKED_ROW = 4;
export const DASHBOARD_PACKED_GAP = 20;

type Size = { id: string; width: number; rows: number };
type Position = Size & { col: number; row: number };

function findSlot(item: Size, placed: Position[], columns: number): Position {
  let best = { col: 0, row: Number.POSITIVE_INFINITY };
  for (let col = 0; col + item.width <= columns; col++) {
    let row = 0;
    for (;;) {
      const collision = placed.find(other =>
        col < other.col + other.width && col + item.width > other.col
        && row < other.row + other.rows && row + item.rows > other.row);
      if (!collision) break;
      row = collision.row + collision.rows;
    }
    if (row < best.row) best = { col, row };
    if (row === 0) break;
  }
  return { ...item, ...best };
}

export function packDashboardSlots(items: Size[], columns: number): Position[] {
  const placed: Position[] = [];
  for (const item of items) placed.push(findSlot(item, placed, columns));
  return placed;
}

export function dashboardPackedDropIndex(items: Size[], id: string, columns: number, columnStep: number, x: number, y: number) {
  const current = items.findIndex(item => item.id === id);
  if (current < 0) return -1;
  const rest = packDashboardSlots(items.filter(item => item.id !== id), columns);
  let target = current;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= rest.length; index++) {
    // Dense placement of this card only depends on the cards ahead of it.
    const position = findSlot(items[current], rest.slice(0, index), columns);
    const farX = position.col * columnStep;
    const farY = position.row * DASHBOARD_PACKED_ROW;
    const score = (x - farX) ** 2 + (y - farY) ** 2;
    if (score < bestScore || (score === bestScore && Math.abs(index - current) < Math.abs(target - current))) {
      bestScore = score;
      target = index;
    }
  }
  return target;
}
