export function simplifyPoints(points: {x: number, y: number}[], tolerance: number): {x: number, y: number}[] {
  if (points.length <= 2) return points;
  let dmax = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = pointLineDistance(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }
  if (dmax > tolerance) {
    const recResults1 = simplifyPoints(points.slice(0, index + 1), tolerance);
    const recResults2 = simplifyPoints(points.slice(index, end + 1), tolerance);
    return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
  } else {
    return [points[0], points[end]];
  }
}

function pointLineDistance(p: {x: number, y: number}, p1: {x: number, y: number}, p2: {x: number, y: number}) {
  const num = Math.abs((p2.y - p1.y) * p.x - (p2.x - p1.x) * p.y + p2.x * p1.y - p2.y * p1.x);
  const den = Math.sqrt(Math.pow(p2.y - p1.y, 2) + Math.pow(p2.x - p1.x, 2));
  return den === 0 ? Math.sqrt(Math.pow(p.x - p1.x, 2) + Math.pow(p.y - p1.y, 2)) : num / den;
}
