import { Point, Entity, LineEntity, CircleEntity, ArcEntity } from '../types';

export const distToSegment = (p: Point, a: Point, b: Point): number => {
    const l2 = Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2);
    if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
};

export const isAngleInArc = (angle: number, startAngle: number, endAngle: number) => {
    let s = startAngle % 360;
    let e = endAngle % 360;
    let a = angle % 360;
    if (s < 0) s += 360;
    if (e < 0) e += 360;
    if (a < 0) a += 360;

    if (s <= e) {
        return a >= s && a <= e;
    } else {
        return a >= s || a <= e;
    }
};

export const getIntersections = (entA: Entity, entB: Entity): Point[] => {
    const pts: Point[] = [];
    if (entA.id === entB.id) return pts;

    const getPolylineSegmentsIntersections = (lineStart: Point, lineEnd: Point, poly: Point[]): Point[] => {
        const intersections: Point[] = [];
        for (let i = 0; i < poly.length - 1; i++) {
            const p3 = poly[i];
            const p4 = poly[i+1];
            const x1 = lineStart.x, y1 = lineStart.y, x2 = lineEnd.x, y2 = lineEnd.y;
            const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
            const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
            if (denom !== 0) {
                const t = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
                const u = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
                const eps = 1e-4;
                if (t >= -eps && t <= 1 + eps && u >= -eps && u <= 1 + eps) {
                    const tClamped = Math.max(0, Math.min(1, t));
                    intersections.push({ x: x1 + tClamped * (x2 - x1), y: y1 + tClamped * (y2 - y1) });
                }
            }
        }
        return intersections;
    };

    // Both are lines
    if (entA.type === 'line' && entB.type === 'line') {
        const lineA = entA as LineEntity;
        const lineB = entB as LineEntity;
        const polyA = lineA.inkPoints;
        const polyB = lineB.inkPoints;

        if (polyA && polyA.length > 1 && polyB && polyB.length > 1) {
            polyA.forEach((_, i) => {
                if (i === polyA.length - 1) return;
                const ptsSub = getPolylineSegmentsIntersections(polyA[i], polyA[i+1], polyB);
                pts.push(...ptsSub);
            });
            return pts;
        } else if (polyA && polyA.length > 1) {
            return getPolylineSegmentsIntersections(lineB.start, lineB.end, polyA);
        } else if (polyB && polyB.length > 1) {
            return getPolylineSegmentsIntersections(lineA.start, lineA.end, polyB);
        } else {
            const x1 = lineA.start.x, y1 = lineA.start.y, x2 = lineA.end.x, y2 = lineA.end.y;
            const x3 = lineB.start.x, y3 = lineB.start.y, x4 = lineB.end.x, y4 = lineB.end.y;
            const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
            
            const eps = 0.001; // Extreme precision for CAD inters
            
            if (Math.abs(denom) > 1e-12) {
                const t = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
                const u = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
                
                const overlapEps = 0.005; 
                if (t >= -overlapEps && t <= 1 + overlapEps && u >= -overlapEps && u <= 1 + overlapEps) {
                    const tClamped = Math.max(0, Math.min(1, t));
                    pts.push({ x: x1 + tClamped * (x2 - x1), y: y1 + tClamped * (y2 - y1) });
                }
            } else {
                // Parallel lines - check for overlapping segments
                const d2A = Math.pow(x2-x1,2) + Math.pow(y2-y1,2);
                if (d2A > 1e-10) {
                    // Check if lineB endpoints lie on lineA
                    [lineB.start, lineB.end].forEach(p => {
                        const t = ((p.x - x1) * (x2 - x1) + (p.y - y1) * (y2 - y1)) / d2A;
                        if (t >= 0 && t <= 1) {
                            const dist = Math.hypot(p.x - (x1 + t*(x2-x1)), p.y - (y1 + t*(y2-y1)));
                            if (dist < eps) pts.push(p);
                        }
                    });
                    // Check if lineA endpoints lie on lineB
                    const d2B = Math.pow(x4-x3,2) + Math.pow(y4-y3,2);
                    if (d2B > 1e-10) {
                        [lineA.start, lineA.end].forEach(p => {
                            const t = ((p.x - x3) * (x4 - x3) + (p.y - y3) * (y4 - y3)) / d2B;
                            if (t >= 0 && t <= 1) {
                                const dist = Math.hypot(p.x - (x3 + t*(x4-x3)), p.y - (y3 + t*(y4-y3)));
                                if (dist < eps) pts.push(p);
                            }
                        });
                    }
                }
            }
            
            // Proximity checks: if an endpoint is very close to the other segment
            if (distToSegment({x: x3, y: y3}, lineA.start, lineA.end) < eps) pts.push({x: x3, y: y3});
            if (distToSegment({x: x4, y: y4}, lineA.start, lineA.end) < eps) pts.push({x: x4, y: y4});
            if (distToSegment({x: x1, y: y1}, lineB.start, lineB.end) < eps) pts.push({x: x1, y: y1});
            if (distToSegment({x: x2, y: y2}, lineB.start, lineB.end) < eps) pts.push({x: x2, y: y2});
        }
    }
    // line and circle / arc
    else if ((entA.type === 'line' && (entB.type === 'circle' || entB.type === 'arc')) ||
             ((entA.type === 'circle' || entA.type === 'arc') && entB.type === 'line')) {
        const line = entA.type === 'line' ? entA as LineEntity : entB as LineEntity;
        const circle = entA.type === 'line' ? entB as (CircleEntity | ArcEntity) : entA as (CircleEntity | ArcEntity);
        
        const getCircleSegmentIntersections = (s: Point, e: Point): Point[] => {
            const subPts: Point[] = [];
            const dx = e.x - s.x, dy = e.y - s.y;
            const lenSq = dx * dx + dy * dy;
            if (lenSq < 1e-8) return subPts;

            const len = Math.sqrt(lenSq);
            const ux = dx / len, uy = dy / len;

            // Vector from segment start to circle center
            const vx = circle.center.x - s.x, vy = circle.center.y - s.y;

            // Projection distance along the line segment
            const proj = vx * ux + vy * uy;

            // Projection point on the line
            const projPt = { x: s.x + proj * ux, y: s.y + proj * uy };

            // Perpendicular distance from circle center to line
            const distSq = (circle.center.x - projPt.x) ** 2 + (circle.center.y - projPt.y) ** 2;
            const dist = Math.sqrt(distSq);

            const R = circle.radius;
            const epsTangency = 0.5; // CAD tolerance for tangent lines (sub-pixel / floating precision)
            const epsLine = 0.08;   // Small extension epsilon along segment parameter [0, 1]

            const pushCandidate = (pt: Point) => {
                if (circle.type === 'arc') {
                    const angle = Math.atan2(pt.y - circle.center.y, pt.x - circle.center.x) * 180 / Math.PI;
                    if (!isAngleInArc(angle, circle.startAngle, circle.endAngle)) return;
                }
                if (!subPts.some(existing => Math.hypot(existing.x - pt.x, existing.y - pt.y) < 0.01)) {
                    subPts.push(pt);
                }
            };

            if (dist > R + epsTangency) {
                // Line is outside circle completely
                return subPts;
            } else if (Math.abs(dist - R) <= epsTangency) {
                // Tangent or near-tangent contact point
                const t = proj / len;
                if (t >= -epsLine && t <= 1 + epsLine) {
                    const tClamped = Math.max(0, Math.min(1, t));
                    pushCandidate({ x: s.x + tClamped * dx, y: s.y + tClamped * dy });
                }
            } else {
                // Secant: line crosses circle at 2 points
                const h = Math.sqrt(Math.max(0, R * R - distSq));
                const t1 = (proj - h) / len;
                const t2 = (proj + h) / len;
                [t1, t2].forEach(t => {
                    if (t >= -epsLine && t <= 1 + epsLine) {
                        const tClamped = Math.max(0, Math.min(1, t));
                        pushCandidate({ x: s.x + tClamped * dx, y: s.y + tClamped * dy });
                    }
                });
            }

            return subPts;
        };

        if (line.inkPoints && line.inkPoints.length > 1) {
            line.inkPoints.forEach((_, i) => {
                if (i === line.inkPoints!.length - 1) return;
                const subPts = getCircleSegmentIntersections(line.inkPoints![i], line.inkPoints![i+1]);
                pts.push(...subPts);
            });
        } else {
            const subPts = getCircleSegmentIntersections(line.start, line.end);
            pts.push(...subPts);
        }
    }
    // Circle/Arc and Circle/Arc
    else if ((entA.type === 'circle' || entA.type === 'arc') && (entB.type === 'circle' || entB.type === 'arc')) {
        const c1 = entA as (CircleEntity | ArcEntity);
        const c2 = entB as (CircleEntity | ArcEntity);
        const dx = c2.center.x - c1.center.x;
        const dy = c2.center.y - c1.center.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < c1.radius + c2.radius && dist > Math.abs(c1.radius - c2.radius) && dist > 1e-10) {
            const a = (c1.radius * c1.radius - c2.radius * c2.radius + dist * dist) / (2 * dist);
            const h = Math.sqrt(Math.max(0, c1.radius * c1.radius - a * a));
            const x2 = c1.center.x + a * dx / dist;
            const y2 = c1.center.y + a * dy / dist;
            
            const rx = -dy * (h / dist);
            const ry = dx * (h / dist);
            
            const p1 = { x: x2 + rx, y: y2 + ry };
            const p2 = { x: x2 - rx, y: y2 - ry };
            
            [p1, p2].forEach(p => {
                let valid = true;
                if (c1.type === 'arc') {
                    const ang = Math.atan2(p.y - c1.center.y, p.x - c1.center.x) * 180 / Math.PI;
                    if (!isAngleInArc(ang, c1.startAngle, c1.endAngle)) valid = false;
                }
                if (c2.type === 'arc') {
                    const ang = Math.atan2(p.y - c2.center.y, p.x - c2.center.x) * 180 / Math.PI;
                    if (!isAngleInArc(ang, c2.startAngle, c2.endAngle)) valid = false;
                }
                if (valid) pts.push(p);
            });
        }
    }
    return pts;
};

export const computeCircleTangentTo2Lines = (
    line1: LineEntity,
    line2: LineEntity,
    clickPt1: Point,
    clickPt2: Point
): { center: Point; radius: number } | null => {
    if (!line1 || !line2 || line1.type !== 'line' || line2.type !== 'line') return null;
    if (line1.id === line2.id) return null;

    const x1 = line1.start.x, y1 = line1.start.y;
    const x2 = line1.end.x, y2 = line1.end.y;
    const x3 = line2.start.x, y3 = line2.start.y;
    const x4 = line2.end.x, y4 = line2.end.y;

    const dx1 = x2 - x1, dy1 = y2 - y1;
    const len1 = Math.hypot(dx1, dy1);
    const dx2 = x4 - x3, dy2 = y4 - y3;
    const len2 = Math.hypot(dx2, dy2);

    if (len1 < 1e-6 || len2 < 1e-6) return null;

    const u1x = dx1 / len1, u1y = dy1 / len1;
    const u2x = dx2 / len2, u2y = dy2 / len2;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

    if (Math.abs(denom) < 1e-8) {
        // PARALLEL LINES
        const n1x = -u1y, n1y = u1x;
        const distParallel = Math.abs((x3 - x1) * n1x + (y3 - y1) * n1y);
        if (distParallel < 1e-4) return null; // Collinear

        const radius = distParallel / 2;
        const proj1 = (clickPt1.x - x1) * u1x + (clickPt1.y - y1) * u1y;
        const proj2 = (clickPt2.x - x3) * u2x + (clickPt2.y - y3) * u2y;
        const avgProj = (proj1 + proj2) / 2;

        const pOn1 = { x: x1 + avgProj * u1x, y: y1 + avgProj * u1y };
        const normalOffset = ((x3 - x1) * n1x + (y3 - y1) * n1y) / 2;
        const center = {
            x: pOn1.x + n1x * normalOffset,
            y: pOn1.y + n1y * normalOffset,
        };
        return { center, radius };
    }

    // INTERSECTING LINES
    const intersectX = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom;
    const intersectY = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom;
    const I = { x: intersectX, y: intersectY };

    let v1x = clickPt1.x - I.x, v1y = clickPt1.y - I.y;
    let v2x = clickPt2.x - I.x, v2y = clickPt2.y - I.y;

    let d1 = Math.hypot(v1x, v1y);
    let d2 = Math.hypot(v2x, v2y);

    let ray1 = d1 > 1e-4 ? { x: v1x / d1, y: v1y / d1 } : { x: u1x, y: u1y };
    let ray2 = d2 > 1e-4 ? { x: v2x / d2, y: v2y / d2 } : { x: u2x, y: u2y };

    const dot1 = ray1.x * u1x + ray1.y * u1y;
    const dir1 = dot1 >= 0 ? { x: u1x, y: u1y } : { x: -u1x, y: -u1y };

    const dot2 = ray2.x * u2x + ray2.y * u2y;
    const dir2 = dot2 >= 0 ? { x: u2x, y: u2y } : { x: -u2x, y: -u2y };

    const bisectX = dir1.x + dir2.x;
    const bisectY = dir1.y + dir2.y;
    const bisectLen = Math.hypot(bisectX, bisectY);

    if (bisectLen < 1e-6) return null;

    const b = { x: bisectX / bisectLen, y: bisectY / bisectLen };

    const cosAlpha = Math.max(0.0001, Math.min(0.9999, dir1.x * b.x + dir1.y * b.y));
    const sinAlpha = Math.sqrt(Math.max(0, 1 - cosAlpha * cosAlpha));
    const tanAlpha = sinAlpha / cosAlpha;

    // Distances from I to projections of clickPt1 and clickPt2
    const distFromI1 = (clickPt1.x - I.x) * dir1.x + (clickPt1.y - I.y) * dir1.y;
    const distFromI2 = (clickPt2.x - I.x) * dir2.x + (clickPt2.y - I.y) * dir2.y;

    // Segment projections along dir1 and dir2 from I
    const p1a = (line1.start.x - I.x) * dir1.x + (line1.start.y - I.y) * dir1.y;
    const p1b = (line1.end.x - I.x) * dir1.x + (line1.end.y - I.y) * dir1.y;
    const min1 = Math.min(p1a, p1b);
    const max1 = Math.max(p1a, p1b);

    const p2a = (line2.start.x - I.x) * dir2.x + (line2.start.y - I.y) * dir2.y;
    const p2b = (line2.end.x - I.x) * dir2.x + (line2.end.y - I.y) * dir2.y;
    const min2 = Math.min(p2a, p2b);
    const max2 = Math.max(p2a, p2b);

    // Bounding interval for dT so tangent points lie on visible segments
    const rangeMin = Math.max(0.1, Math.max(min1, min2));
    const rangeMax = Math.min(max1, max2);

    let rawDT = distFromI2; // Use active cursor distance
    if (isNaN(rawDT) || rawDT <= 0) rawDT = (distFromI1 + distFromI2) / 2;

    let dT = rawDT;
    if (rangeMax >= rangeMin && rangeMax > 0.1) {
        dT = Math.max(rangeMin, Math.min(rangeMax, rawDT));
    } else {
        const altMax = Math.min(Math.max(0.1, max1), Math.max(0.1, max2));
        dT = Math.max(0.1, Math.min(altMax, Math.max(rawDT, 1.0)));
    }

    const radius = dT * tanAlpha;
    const distCenterFromI = dT / cosAlpha;

    const center = {
        x: I.x + b.x * distCenterFromI,
        y: I.y + b.y * distCenterFromI
    };

    return { center, radius };
};

