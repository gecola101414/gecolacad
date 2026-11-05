import { Entity, LineEntity, CircleEntity, ArcEntity, Point } from '../types';
import { getIntersections, distToSegment } from './geometry';

/**
 * Helper to compute distance from point p to segment v-w
 */
export function distanceToSegment(p: Point, v: Point, w: Point) {
  const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

const normalizeAngle = (a: number) => {
  let res = a % 360;
  if (res < 0) res += 360;
  return res;
};

const getClockwiseDistance = (angle: number, start: number) => {
  let diff = normalizeAngle(angle - start);
  return diff;
};

const isAngleInArc = (angle: number, start: number, end: number) => {
    const s = normalizeAngle(start);
    const e = normalizeAngle(end);
    const a = normalizeAngle(angle);
    if (s <= e) return a >= s && a <= e;
    return a >= s || a <= e;
};

/**
 * Splits all splittable entities in the collection at their mutual intersections.
 * This "atomizes" the drawing into segments bounded by intersections.
 */
export const splitAllLinesAtIntersections = (entities: Entity[]): Entity[] => {
    // Target all basic geometry for splitting
    const splittable = entities.filter(e => (e.type === 'line' || e.type === 'circle' || e.type === 'arc'));
    const nonSplittable = entities.filter(e => !splittable.find(s => s.id === e.id));
    
    const cutters = [...entities];
    const result: Entity[] = [];

    splittable.forEach(ent => {
        if (ent.type === 'line') {
            const line = ent as LineEntity;
            const pts: { t: number, p: Point }[] = [{ t: 0, p: line.start }, { t: 1, p: line.end }];
            
            const dx = line.end.x - line.start.x;
            const dy = line.end.y - line.start.y;
            const lenSq = dx * dx + dy * dy;
            
            cutters.forEach(other => {
                if (ent.id === other.id) return;
                const inters = getIntersections(ent, other);
                inters.forEach(p => {
                    if (lenSq > 1e-8) {
                        const t = ((p.x - line.start.x) * dx + (p.y - line.start.y) * dy) / lenSq;
                        // High precision: use a small epsilon for splitting (0.0001 to 0.9999)
                        if (t > 0.0001 && t < 0.9999) {
                            if (!pts.some(existing => Math.abs(existing.t - t) < 0.0001)) {
                                pts.push({ t, p });
                            }
                        }
                    }
                });
            });

            if (pts.length > 2) {
                pts.sort((a, b) => a.t - b.t);
                // Remove duplicates points that are very close (t difference)
                const deduped: { t: number, p: Point }[] = [];
                for (let i = 0; i < pts.length; i++) {
                    if (i === 0 || pts[i].t - deduped[deduped.length - 1].t > 0.0001) {
                        deduped.push(pts[i]);
                    }
                }
                
                if (deduped.length > 2) {
                    for (let j = 0; j < deduped.length - 1; j++) {
                        const p1 = deduped[j].p;
                        const p2 = deduped[j+1].p;
                        // Use a stable ID based on coordinates for better persistence
                        const coordHash = `${p1.x.toFixed(2)},${p1.y.toFixed(2)}-${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
                        const newId = j === 0 ? line.id : `${line.id}_atom_${coordHash.replace(/[.,-]/g, '')}`;
                        
                        result.push({
                            ...line,
                            id: newId,
                            start: p1,
                            end: p2
                        });
                    }
                } else {
                    result.push(ent);
                }
            } else {
                result.push(ent);
            }
        } else if (ent.type === 'circle' || ent.type === 'arc') {
            const circle = ent as (CircleEntity | ArcEntity);
            const isArc = ent.type === 'arc';
            const pts: { t: number, p: Point }[] = [];
            
            const startAngle = isArc ? normalizeAngle((ent as ArcEntity).startAngle) : 0;
            const endAngle = isArc ? normalizeAngle((ent as ArcEntity).endAngle) : 360;

            if (isArc) {
                const arc = ent as ArcEntity;
                const startRad = (arc.startAngle * Math.PI) / 180;
                const endRad = (arc.endAngle * Math.PI) / 180;
                const startPt = {
                    x: arc.center.x + Math.cos(startRad) * arc.radius,
                    y: arc.center.y + Math.sin(startRad) * arc.radius
                };
                const endPt = {
                    x: arc.center.x + Math.cos(endRad) * arc.radius,
                    y: arc.center.y + Math.sin(endRad) * arc.radius
                };
                pts.push({ t: startAngle, p: startPt });
                pts.push({ t: endAngle, p: endPt });
            }

            cutters.forEach(other => {
                if (ent.id === other.id) return;
                const inters = getIntersections(ent, other);
                inters.forEach(p => {
                    const t = normalizeAngle(Math.atan2(p.y - circle.center.y, p.x - circle.center.x) * 180 / Math.PI);
                    if (isArc) {
                        if (isAngleInArc(t, startAngle, endAngle)) {
                            if (Math.abs(normalizeAngle(t - startAngle)) > 0.1 && Math.abs(normalizeAngle(t - endAngle)) > 0.1) {
                                if (!pts.some(existing => Math.abs(normalizeAngle(existing.t - t)) < 0.1)) {
                                    pts.push({ t, p });
                                }
                            }
                        }
                    } else {
                        if (!pts.some(existing => Math.abs(normalizeAngle(existing.t - t)) < 0.1)) {
                            pts.push({ t, p });
                        }
                    }
                });
            });

            if (isArc) {
                pts.sort((a, b) => getClockwiseDistance(a.t, startAngle) - getClockwiseDistance(b.t, startAngle));
                if (pts.length <= 2) {
                    result.push(ent);
                } else {
                    for (let j = 0; j < pts.length - 1; j++) {
                        const newId = j === 0 ? circle.id : `${circle.id}_s${j}_${Math.random().toString(36).substr(2, 4)}`;
                        result.push({
                            ...circle,
                            id: newId,
                            type: 'arc',
                            startAngle: pts[j].t,
                            endAngle: pts[j+1].t
                        } as any);
                    }
                }
            } else {
                if (pts.length < 2) {
                    result.push(ent);
                } else {
                    pts.sort((a, b) => a.t - b.t);
                    for (let j = 0; j < pts.length; j++) {
                        result.push({
                            ...circle,
                            id: `${circle.id}_s${j}_${Math.random().toString(36).substr(2, 4)}`,
                            type: 'arc',
                            startAngle: pts[j].t,
                            endAngle: pts[(j + 1) % pts.length].t
                        } as any);
                    }
                }
            }
        } else {
            result.push(ent);
        }
    });

    return [...nonSplittable, ...result];
};

/**
 * Removes exactly overlapping duplicate entities.
 */
export const removeDuplicateEntities = (entities: Entity[]): Entity[] => {
    const unique: Entity[] = [];
    const seen = new Set<string>();

    for (const ent of entities) {
        let key = "";
        if (ent.type === 'line') {
            const line = ent as LineEntity;
            const pts = [line.start, line.end].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
            // Precision: use 3 decimals (mm precision in CAD)
            key = `line-${line.layer}-${pts[0].x.toFixed(3)},${pts[0].y.toFixed(3)}-${pts[1].x.toFixed(3)},${pts[1].y.toFixed(3)}`;
        } else if (ent.type === 'arc' || ent.type === 'circle') {
            const c = ent as (ArcEntity | CircleEntity);
            const sa = (ent as any).startAngle?.toFixed(3) || "0";
            const ea = (ent as any).endAngle?.toFixed(3) || "360";
            key = `${ent.type}-${ent.layer}-${c.center.x.toFixed(3)},${c.center.y.toFixed(3)}-${c.radius.toFixed(3)}-${sa}-${ea}`;
        } else if (ent.type === 'point') {
            const p = ent as any;
            key = `point-${ent.layer}-${p.point.x.toFixed(3)},${p.point.y.toFixed(3)}`;
        }

        if (key) {
            if (!seen.has(key)) {
                unique.push(ent);
                seen.add(key);
            }
        } else {
            unique.push(ent);
        }
    }
    return unique;
};

export const splitLinesAtIntersections = (entities: Entity[]): Entity[] => {
    const split = splitAllLinesAtIntersections(entities);
    return removeDuplicateEntities(split);
};

/**
 * Smart Trim logic: Removes dangling ends that don't connect to anything.
 * Trims a segment to its nearest intersection if that end is dangling.
 */
export function trimEntities(entities: Entity[], selectedIds: string[] = []): Entity[] {
    let newEntities = [...entities];
    
    const activeIds = selectedIds.length > 0 ? selectedIds : entities.filter(e => e.type === 'line').map(e => e.id);
    const activeLines = newEntities.filter(ent => activeIds.includes(ent.id) && ent.type === 'line') as LineEntity[];
    const allLines = newEntities.filter(e => e.type === 'line') as LineEntity[];

    activeLines.forEach(entA => {
        const length = Math.hypot(entA.end.x - entA.start.x, entA.end.y - entA.start.y);
        if (length < 0.1) return;

        const pts: Point[] = [];
        allLines.forEach(entB => {
            if (entA.id === entB.id) return;
            const inters = getIntersections(entA, entB);
            inters.forEach(p => {
                const dStart = Math.hypot(p.x - entA.start.x, p.y - entA.start.y);
                const dEnd = Math.hypot(p.x - entA.end.x, p.y - entA.end.y);
                // Precision: only consider points that are NOT already the endpoints
                if (dStart > 0.5 && dEnd > 0.5) {
                    pts.push(p);
                }
            });
        });

        if (pts.length === 0) return;

        pts.sort((a, b) => Math.hypot(a.x - entA.start.x, a.y - entA.start.y) - Math.hypot(b.x - entA.start.x, b.y - entA.start.y));

        let newStart = entA.start;
        let newEnd = entA.end;

        const isStartConnected = allLines.some(other => {
            if (other.id === entA.id) return false;
            const touch = Math.hypot(other.start.x - entA.start.x, other.start.y - entA.start.y) < 0.8 ||
                          Math.hypot(other.end.x - entA.start.x, other.end.y - entA.start.y) < 0.8;
            if (touch) return true;
            return distanceToSegment(entA.start, other.start, other.end) < 0.8;
        });

        if (!isStartConnected) {
            newStart = pts[0];
        }

        const isEndConnected = allLines.some(other => {
            if (other.id === entA.id) return false;
            const touch = Math.hypot(other.start.x - entA.end.x, other.start.y - entA.end.y) < 0.8 ||
                          Math.hypot(other.end.x - entA.end.x, other.end.y - entA.end.y) < 0.8;
            if (touch) return true;
            return distanceToSegment(entA.end, other.start, other.end) < 0.8;
        });

        if (!isEndConnected) {
            newEnd = pts[pts.length - 1];
        }

        if (Math.hypot(newStart.x - entA.start.x, newStart.y - entA.start.y) > 0.1 || 
            Math.hypot(newEnd.x - entA.end.x, newEnd.y - entA.end.y) > 0.1) {
            newEntities = newEntities.map(ent => ent.id === entA.id ? { ...ent, start: newStart, end: newEnd } : ent);
        }
    });

    return newEntities;
}

/**
 * Unified Super Cleanup: Splits, Trims, and Deduplicates.
 * Atomizes the drawing so all intersections are real segment boundaries.
 */
export const smartCleanDrawing = (entities: Entity[]): Entity[] => {
    // Stage 1: Split everything at intersections
    let cleaned = splitAllLinesAtIntersections(entities);
    // Stage 2: Remove overlapping duplicates
    cleaned = removeDuplicateEntities(cleaned);
    // Stage 3: Trim dangling ends (Smart Trim)
    cleaned = trimEntities(cleaned);
    // Stage 4: Final deduplication and tiny segment removal
    cleaned = cleaned.filter(ent => {
        if (ent.type === 'line') {
            const l = ent as LineEntity;
            return Math.hypot(l.end.x - l.start.x, l.end.y - l.start.y) > 0.05;
        }
        return true;
    });
    return removeDuplicateEntities(cleaned);
};


export const mergeAllSegments = (entities: Entity[]): Entity[] => {
    const lines = entities.filter(e => e.type === 'line') as LineEntity[];
    const others = entities.filter(e => e.type !== 'line');
    
    const groups: { [key: string]: LineEntity[] } = {};
    for (const line of lines) {
        const key = `${line.layer}-${line.mode}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(line);
    }
    
    let mergedLines: LineEntity[] = [];
    for (const key in groups) {
        let group = groups[key];
        let canMerge = true;
        while (canMerge) {
            canMerge = false;
            for (let i = 0; i < group.length; i++) {
                for (let j = i + 1; j < group.length; j++) {
                    const l1 = group[i];
                    const l2 = group[j];
                    const dx1 = l1.end.x - l1.start.x;
                    const dy1 = l1.end.y - l1.start.y;
                    const dx2 = l2.end.x - l2.start.x;
                    const dy2 = l2.end.y - l2.start.y;

                    const connectionType = 
                        (Math.abs(l1.end.x - l2.start.x) < 0.1 && Math.abs(l1.end.y - l2.start.y) < 0.1) ? 'end-start' :
                        (Math.abs(l1.start.x - l2.end.x) < 0.1 && Math.abs(l1.start.y - l2.end.y) < 0.1) ? 'start-end' :
                        (Math.abs(l1.start.x - l2.start.x) < 0.1 && Math.abs(l1.start.y - l2.start.y) < 0.1) ? 'start-start' :
                        (Math.abs(l1.end.x - l2.end.x) < 0.1 && Math.abs(l1.end.y - l2.end.y) < 0.1) ? 'end-end' : null;
                    
                    const collinear = Math.abs(dx1 * dy2 - dy1 * dx2) < 0.5;
                    if (connectionType && collinear) {
                        let start = l1.start;
                        let end = l1.end;
                        if (connectionType === 'end-start') { end = l2.end; }
                        else if (connectionType === 'start-end') { start = l2.start; }
                        else if (connectionType === 'start-start') { start = l1.end; end = l2.end; }
                        else if (connectionType === 'end-end') { start = l1.start; end = l2.start; }
                        
                        const l1Length = Math.sqrt((l1.end.x - l1.start.x) ** 2 + (l1.end.y - l1.start.y) ** 2);
                        const l2Length = Math.sqrt((l2.end.x - l2.start.x) ** 2 + (l2.end.y - l2.start.y) ** 2);
                        const mergedLength = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
                        if (mergedLength < Math.max(l1Length, l2Length) - 0.1) continue;

                        group[i] = { ...l1, start, end };
                        group.splice(j, 1);
                        canMerge = true;
                        break;
                    }
                }
                if (canMerge) break;
            }
        }
        mergedLines.push(...group);
    }
    return [...others, ...mergedLines];
};
