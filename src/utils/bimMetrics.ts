import { CADEntity, Point } from '../types';

export const getRoomAreaMq = (points: Point[]) => {
  if (!points || points.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += (points[j].x + points[i].x) * (points[j].y - points[i].y);
  }
  return Math.abs(area / 2) / 10000;
};

export const getRoomPerimeterM = (points: Point[]) => {
  if (!points || points.length < 2) return 0;
  let peri = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    peri += Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }
  return peri / 100;
};

export const computeMetrics = (entity: CADEntity) => {
  let areaMq = 0;
  let perimetroM = 0;
  let altezzaM = (entity as any).bimHeight || (entity as any).height || 2.70;
  if (altezzaM > 10) altezzaM = altezzaM / 100;
  let volumeMc = 0;
  let spessoreCm = (entity as any).bimWidth || (entity as any).width || 12;

  const points = (entity as any).bimPoints || (entity as any).points || [];
  
  if (points && points.length > 2) {
      areaMq = getRoomAreaMq(points);
      perimetroM = getRoomPerimeterM(points);
      volumeMc = areaMq * altezzaM;
      if (!spessoreCm) spessoreCm = 15;
  } else if (entity.type === 'rectangle') {
      const rect = entity as any;
      const rawW = Math.abs(rect.p2.x - rect.p1.x);
      const rawH = Math.abs(rect.p2.y - rect.p1.y);
      const w = rawW / 100;
      const h = rawH / 100;
      areaMq = Math.round(w * h * 100) / 100;
      perimetroM = Math.round(2 * (w + h) * 100) / 100;
      spessoreCm = (entity as any).bimWidth || 15; 
      volumeMc = areaMq * altezzaM;
  } else if (entity.type === 'circle') {
      const circ = entity as any;
      const r = circ.radius / 100;
      areaMq = Math.PI * r * r;
      perimetroM = 2 * Math.PI * r;
      volumeMc = areaMq * altezzaM;
  } else if (entity.type === 'line') {
    const line = entity as any;
    const start = line.start || { x: 0, y: 0 };
    const end = line.end || { x: 0, y: 0 };
    const lengthM = Math.hypot(end.x - start.x, end.y - start.y) / 100;
    const thicknessM = (spessoreCm || 15) / 100;
    areaMq = lengthM * thicknessM;
    perimetroM = lengthM;
    volumeMc = areaMq * altezzaM;
  } else if ((entity as any).bimType === 'door' || (entity as any).bimType === 'window') {
    const wCm = (entity as any).bimWidth || (entity as any).width || 80;
    const hCm = (entity as any).bimWindowHeight || (entity as any).bimHeight || ((entity as any).bimType === 'door' ? 210 : 140);
    areaMq = (wCm * hCm) / 10000;
    perimetroM = (2 * (wCm + hCm)) / 100;
    volumeMc = areaMq * altezzaM;
  } else if (entity.type === 'bim-csg' && (entity as any).bimArea) {
    areaMq = (entity as any).bimArea;
    perimetroM = 0;
    volumeMc = areaMq * altezzaM;
  } else if ((entity as any).radius) {
    const r = (entity as any).radius / 100;
    areaMq = Math.PI * r * r;
    perimetroM = 2 * Math.PI * r;
    volumeMc = areaMq * altezzaM;
  }

  return { areaMq, perimetroM, altezzaM, volumeMc, spessoreCm };
};
