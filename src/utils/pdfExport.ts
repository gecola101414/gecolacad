import { jsPDF } from 'jspdf';
import { Entity, LineEntity } from '../types';

export interface TavolaExport {
  id: string;
  name: string;
  format: 'A0' | 'A1' | 'A2' | 'A3' | 'A4';
  scale: number;
  unit: 'm' | 'cm' | 'mm';
  position: { x: number; y: number };
  visible: boolean;
  datiCartiglio?: {
    progetto?: string;
    titolo?: string;
    autore?: string;
    data?: string;
  };
  measuredCalibrationMm?: number;
}

export const exportNativePDF = (
  entities: Entity[], 
  format: string, 
  scaleDenom: number, 
  unit: string,
  tavola?: TavolaExport,
  action: 'download' | 'bloburl' = 'download'
): string | void => {
  if (entities.length === 0 && !tavola) return;

  // Find bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  if (tavola) {
      const getPaperSizeMmLocal = (fmt: string) => {
        switch (fmt.toUpperCase()) {
          case 'A4': return { w: 297, h: 210 };
          case 'A3': return { w: 420, h: 297 };
          case 'A2': return { w: 594, h: 420 };
          case 'A1': return { w: 841, h: 594 };
          case 'A0': return { w: 1189, h: 841 };
          default: return { w: 297, h: 210 };
        }
      };
      
      const pSize = getPaperSizeMmLocal(tavola.format);
      let factor = 1000;
      if (tavola.unit === 'cm') factor = 10;
      if (tavola.unit === 'mm') factor = 1;
      
      const drawingWidth = pSize.w * (tavola.scale / factor);
      const drawingHeight = pSize.h * (tavola.scale / factor);
      
      minX = tavola.position.x;
      minY = tavola.position.y;
      maxX = minX + drawingWidth;
      maxY = minY + drawingHeight;
  } else {
      entities.forEach(ent => {
        if (ent.type === 'line' || ent.type === 'dimension') {
          minX = Math.min(minX, ent.start.x, ent.end.x);
          minY = Math.min(minY, ent.start.y, ent.end.y);
          maxX = Math.max(maxX, ent.start.x, ent.end.x);
          maxY = Math.max(maxY, ent.start.y, ent.end.y);
        } else if (ent.type === 'circle' || ent.type === 'arc') {
          minX = Math.min(minX, ent.center.x - ent.radius);
          minY = Math.min(minY, ent.center.y - ent.radius);
          maxX = Math.max(maxX, ent.center.x + ent.radius);
          maxY = Math.max(maxY, ent.center.y + ent.radius);
        } else if (ent.type === 'rectangle') {
          minX = Math.min(minX, ent.p1.x, ent.p2.x);
          minY = Math.min(minY, ent.p1.y, ent.p2.y);
          maxX = Math.max(maxX, ent.p1.x, ent.p2.x);
          maxY = Math.max(maxY, ent.p1.y, ent.p2.y);
        } else if (ent.type === 'point') {
            const p = ent.point || (ent as any).position;
            if (p) {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            }
        } else if (ent.type === 'text') {
            minX = Math.min(minX, ent.point.x);
            minY = Math.min(minY, ent.point.y);
            maxX = Math.max(maxX, ent.point.x + 2); // Approximate right bound
            maxY = Math.max(maxY, ent.point.y + 1); // Approximate bottom bound
        }
      });
  }

  if (minX === Infinity) return;

  const drawingWidth = maxX - minX;
  const drawingHeight = maxY - minY;

  // Precision Calibration Factor
  // 1.0 is the faithful ratio.
  const CALIBRATION_FACTOR = tavola && tavola.measuredCalibrationMm && tavola.measuredCalibrationMm > 0
      ? 10 / tavola.measuredCalibrationMm 
      : 1.0; 

  const chosenFormat = tavola ? tavola.format : format;
  const chosenScaleDenom = tavola ? tavola.scale : scaleDenom;
  const chosenUnit = tavola ? tavola.unit : unit;

  const getPaperSizeMmLocal = (fmt: string) => {
    switch (fmt.toUpperCase()) {
      case 'A4': return { w: 210, h: 297 };
      case 'A3': return { w: 297, h: 420 };
      case 'A2': return { w: 420, h: 594 };
      case 'A1': return { w: 594, h: 841 };
      case 'A0': return { w: 841, h: 1189 };
      default: return { w: 210, h: 297 };
    }
  };

  const pSizeRes = getPaperSizeMmLocal(chosenFormat);
  const orientation = drawingWidth > drawingHeight ? 'l' : 'p';
  const finalPageWidth = orientation === 'l' ? pSizeRes.h : pSizeRes.w;
  const finalPageHeight = orientation === 'l' ? pSizeRes.w : pSizeRes.h;

  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: [finalPageWidth, finalPageHeight],
    putOnlyUsedFonts: true,
    floatPrecision: 16
  });

  // Suggest 'Actual Size' to the printer
  pdf.viewerPreferences({
    'PrintScaling': 'None'
  });

  const unitToMm = {
      mm: 1,
      cm: 10,
      m: 1000
  };
  const multiplier = unitToMm[chosenUnit as keyof typeof unitToMm] || 1;
  // Apply the calibration factor to the base scale
  const scale = (multiplier / chosenScaleDenom) * CALIBRATION_FACTOR;
  
  const marginMm = 5;
  // Map tavola.position (x, y) to marginMm on the PDF
  const offsetX = marginMm - (tavola ? tavola.position.x : minX) * scale;
  const offsetY = marginMm - (tavola ? tavola.position.y : minY) * scale;

  const tx = (x: number) => x * scale + offsetX;
  const ty = (y: number) => y * scale + offsetY;
  const ts = (val: number) => val * scale;

  entities.forEach(entity => {
      // All lines black
      pdf.setDrawColor(0, 0, 0); 
      
      let baseLw = entity.lineWidth && typeof entity.lineWidth === 'number' ? entity.lineWidth : 1;
      let lw = Math.max(0.1, baseLw * 0.2); // Standard mapping for CAD lines
      
      if (entity.mode === 'ink') {
          // Special mapping for Kina pens to guarantee visible solid black
          lw = baseLw <= 0.25 ? 0.3 : baseLw <= 0.5 ? 0.5 : baseLw <= 1.0 ? 1.0 : baseLw <= 2.0 ? 2.0 : baseLw;
      }
      
      if (entity.type === 'dimension') lw = 0.1;
      pdf.setLineWidth(lw);

      if (entity.dashed) {
          pdf.setLineDashPattern([2, 2], 0);
      } else {
          pdf.setLineDashPattern([], 0);
      }

      if (entity.type === 'line') {
          const lEnt = entity as LineEntity;
          if (lEnt.inkPoints && lEnt.inkPoints.length > 1) {
              let lastX = lEnt.start.x;
              let lastY = lEnt.start.y;
              for(let i=0; i<lEnt.inkPoints.length; i++) {
                  const pt = lEnt.inkPoints[i];
                  const t = i / (lEnt.inkPoints.length - 1);
                  const bx = lEnt.start.x + (lEnt.end.x - lEnt.start.x) * t;
                  const by = lEnt.start.y + (lEnt.end.y - lEnt.start.y) * t;
                  const px = lEnt.isFreehand ? pt.x : bx + pt.x;
                  const py = lEnt.isFreehand ? pt.y : by + pt.y;
                  
                  // Apply width and alpha from inkPoint
                  const isInk = lEnt.mode === 'ink';
                  const baseLw = typeof lEnt.lineWidth === 'number' ? lEnt.lineWidth : 1.0;
                  
                  // For ink, we ensure a slightly thicker base on PDF so it presents solidly, mapping the nominal thickness
                  const effectiveInkPDFWidth = isInk
                        ? (baseLw === 0.25 ? 0.3 : baseLw === 0.5 ? 0.5 : baseLw === 1.0 ? 1.0 : baseLw === 2.0 ? 2.0 : baseLw)
                        : baseLw * 0.4; // Pencil / standard freehand fallback

                  const lw_current = isInk 
                      ? Math.max(0.1, (0.8 + pt.width * 0.4) * effectiveInkPDFWidth)
                      : Math.max(0.1, pt.width * effectiveInkPDFWidth);
                      
                  pdf.setLineWidth(lw_current);
                  if (isInk) {
                      pdf.setDrawColor(0, 0, 0); // Pure black
                  } else {
                      const gray = Math.round((1 - Math.min(1, pt.alpha)) * 255);
                      pdf.setDrawColor(gray, gray, gray);
                  }
                  
                  pdf.line(tx(lastX), ty(lastY), tx(px), ty(py));
                  lastX = px;
                  lastY = py;
              }
              // Reset to default
              pdf.setDrawColor(0, 0, 0);
              pdf.setLineWidth(lw);
          } else {
              pdf.line(tx(entity.start.x), ty(entity.start.y), tx(entity.end.x), ty(entity.end.y));
          }
      } else if (entity.type === 'circle') {
          pdf.circle(tx(entity.center.x), ty(entity.center.y), ts(entity.radius), 'S');
      } else if (entity.type === 'rectangle') {
          const w = Math.abs(entity.p2.x - entity.p1.x);
          const h = Math.abs(entity.p2.y - entity.p1.y);
          const x = Math.min(entity.p1.x, entity.p2.x);
          const y = Math.min(entity.p1.y, entity.p2.y);
          pdf.rect(tx(x), ty(y), ts(w), ts(h), 'S');
      } else if (entity.type === 'point') {
          const p = entity.point || (entity as any).position;
          if (p) {
             pdf.setDrawColor(255, 0, 0);
             pdf.setFillColor(255, 0, 0);
             pdf.circle(tx(p.x), ty(p.y), 0.5, 'F');
          }
      } else if (entity.type === 'dimension') {
            const dx = entity.end.x - entity.start.x;
            const dy = entity.end.y - entity.start.y;
            const L = Math.sqrt(dx * dx + dy * dy);
            if (L === 0) return;
            const nx = -dy / L;
            const ny = dx / L;

            const p1 = { x: entity.start.x + nx * entity.offset, y: entity.start.y + ny * entity.offset };
            const p2 = { x: entity.end.x + nx * entity.offset, y: entity.end.y + ny * entity.offset };
            
            // Define a fixed scale factor equivalent to a 200 unit length dimension
            const scaleFactor = 2.0;

            pdf.setLineWidth(0.1 * Math.max(1, scaleFactor * 0.5));

            // Dimension line
            pdf.line(tx(p1.x), ty(p1.y), tx(p2.x), ty(p2.y));

            // Extension lines (gampette) proportional to length
            const legBehind = 20 * scaleFactor; 
            const legAhead = 8 * scaleFactor;
            const offsetDir = entity.offset >= 0 ? 1 : -1;
            
            pdf.line(
                tx(p1.x - nx * legBehind * offsetDir), 
                ty(p1.y - ny * legBehind * offsetDir), 
                tx(p1.x + nx * legAhead * offsetDir), 
                ty(p1.y + ny * legAhead * offsetDir)
            );

            pdf.line(
                tx(p2.x - nx * legBehind * offsetDir), 
                ty(p2.y - ny * legBehind * offsetDir), 
                tx(p2.x + nx * legAhead * offsetDir), 
                ty(p2.y + ny * legAhead * offsetDir)
            );

            // Inclined intersection slashes proportional to length
            const slashSize = 5 * scaleFactor;
            pdf.line(
                tx(p1.x - nx * slashSize - ny * slashSize), 
                ty(p1.y - ny * slashSize + nx * slashSize), 
                tx(p1.x + nx * slashSize + ny * slashSize), 
                ty(p1.y + ny * slashSize - nx * slashSize)
            );
            pdf.line(
                tx(p2.x - nx * slashSize - ny * slashSize), 
                ty(p2.y - ny * slashSize + nx * slashSize), 
                tx(p2.x + nx * slashSize + ny * slashSize), 
                ty(p2.y + ny * slashSize - nx * slashSize)
            );

            // Text
            pdf.setTextColor(0, 0, 0);
            pdf.setFont("helvetica", "normal");
            const fontSize = Math.max(2, 12 * scaleFactor);
            pdf.setFontSize(ts(fontSize) * (72 / 25.4)); // Scaled drawing units converted to PDF Points
            
            const numValue = Math.round(L * 100) / 100;
            const valueStr = Number.isInteger(numValue) ? numValue.toString() : numValue.toFixed(2).replace('.', ',');
            const textToPrint = entity.customText || valueStr;
            
            let angle = Math.atan2(dy, dx);
            if (angle >= Math.PI / 2 - 0.01) {
                angle -= Math.PI;
            } else if (angle < -Math.PI / 2 - 0.01) {
                angle += Math.PI;
            }
            
            // Translate the text 3 drawing units (scaled) perpendicularly (upwards relative to text)
            const textX = (p1.x + p2.x) / 2 + (3 * scaleFactor) * Math.sin(angle);
            const textY = (p1.y + p2.y) / 2 - (3 * scaleFactor) * Math.cos(angle);
            
            pdf.text(textToPrint, tx(textX), ty(textY), { angle: 360 - (angle * 180 / Math.PI), align: 'center', baseline: 'bottom' });


      } else if (entity.type === 'arc') {
          const segments = 36;
          let startA = entity.startAngle;
          let endA = entity.endAngle;
          if (endA < startA) endA += Math.PI * 2;
          
          let prevX: number | null = null;
          let prevY: number | null = null;
          
          for(let i=0; i<=segments; i++){
              const ang = startA + (endA - startA) * (i / segments);
              const px = tx(entity.center.x + Math.cos(ang) * entity.radius);
              const py = ty(entity.center.y + Math.sin(ang) * entity.radius);
              if (prevX !== null && prevY !== null) {
                  pdf.line(prevX, prevY, px, py);
              }
              prevX = px;
              prevY = py;
          }
      } else if (entity.type === 'text') {
          // Parse color
          let r = 0, g = 0, b = 0;
          if (entity.color && entity.color.startsWith('#')) {
              const hex = entity.color.replace('#', '');
              if (hex.length === 6) {
                  r = parseInt(hex.substring(0, 2), 16);
                  g = parseInt(hex.substring(2, 4), 16);
                  b = parseInt(hex.substring(4, 6), 16);
              }
          }
          pdf.setTextColor(r, g, b);
          const font = (entity.fontFamily || 'monospace').toLowerCase().includes('sans') ? 'helvetica' : 'monospace';
          const style = entity.fontWeight === 'bold' ? 'bold' : 'normal';
          pdf.setFont(font, style);
          // Scale font size (pt)
          pdf.setFontSize(ts(entity.fontSize) * (72 / 25.4));
          // Use 'bottom' equivalent in jsPDF if needed, but jsPDF text baseline is bottom by default
          let align: 'left'|'center'|'right' = 'left';
          if (entity.textAlign === 'center') align = 'center';
          if (entity.textAlign === 'right') align = 'right';
          
          pdf.text(entity.text, tx(entity.point.x), ty(entity.point.y), { align, baseline: 'top' });
      } else if (entity.type === 'hatch') {
          drawHatchInPDF(pdf, entity, tx, ty, ts, scale);
      }
  });

  if (tavola) {
      const getPaperSizeMmLocal = (fmt: string) => {
        switch (fmt.toUpperCase()) {
          case 'A4': return { w: 297, h: 210 };
          case 'A3': return { w: 420, h: 297 };
          case 'A2': return { w: 594, h: 420 };
          case 'A1': return { w: 841, h: 594 };
          case 'A0': return { w: 1189, h: 841 };
          default: return { w: 297, h: 210 };
        }
      };
      
      const pSize = getPaperSizeMmLocal(tavola.format);
      
      // Draw standard inner margin line (5mm on paper)
      pdf.setDrawColor(37, 99, 235);
      pdf.setLineWidth(0.4);
      pdf.setLineDashPattern([], 0);
      
      const marginMm = 5;
      pdf.rect(marginMm, marginMm, pSize.w - 2 * marginMm, pSize.h - 2 * marginMm, 'S');
      
      // Setup scale and apply CALIBRATION_FACTOR directly to margins and sizes too
      const cartW = 120 * CALIBRATION_FACTOR;
      const cartH = 40 * CALIBRATION_FACTOR;
      const marginMmCart = marginMm * CALIBRATION_FACTOR;
      
      const cartX = pSize.w - marginMm - cartW;
      const cartY = pSize.h - marginMm - cartH;
      
      pdf.setFillColor(255, 255, 255);
      pdf.rect(cartX, cartY, cartW, cartH, 'FD');
      
      // Secondary subdivision lines
      pdf.setLineWidth(0.2 * CALIBRATION_FACTOR);
      pdf.line(cartX, cartY + cartH * 0.4, cartX + cartW, cartY + cartH * 0.4);
      pdf.line(cartX, cartY + cartH * 0.7, cartX + cartW, cartY + cartH * 0.7);
      pdf.line(cartX + cartW * 0.5, cartY + cartH * 0.4, cartX + cartW * 0.5, cartY + cartH);
      
      // Title Block Info
      pdf.setTextColor(30, 58, 138);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(5 * CALIBRATION_FACTOR);
      pdf.text("PROGETTO:", cartX + 2.5 * CALIBRATION_FACTOR, cartY + 4 * CALIBRATION_FACTOR);
      
      pdf.setFontSize(8 * CALIBRATION_FACTOR);
      const MAX_PROGETTO_LEN = 35;
      let pString = tavola.datiCartiglio?.progetto || "GECOLA CAD";
      if(pString.length > MAX_PROGETTO_LEN) pString = pString.substring(0, MAX_PROGETTO_LEN) + "...";
      pdf.text(pString, cartX + 2.5 * CALIBRATION_FACTOR, cartY + 10 * CALIBRATION_FACTOR);
      
      pdf.setFontSize(5 * CALIBRATION_FACTOR);
      pdf.text("TAVOLA:", cartX + 2.5 * CALIBRATION_FACTOR, cartY + cartH * 0.4 + 4 * CALIBRATION_FACTOR);
      
      pdf.setFontSize(8 * CALIBRATION_FACTOR);
      const MAX_TITOLO_LEN = 20;
      let tString = tavola.datiCartiglio?.titolo || tavola.name;
      if(tString.length > MAX_TITOLO_LEN) tString = tString.substring(0, MAX_TITOLO_LEN) + "...";
      pdf.text(tString, cartX + 2.5 * CALIBRATION_FACTOR, cartY + cartH * 0.4 + 10 * CALIBRATION_FACTOR);
      
      pdf.setFontSize(5 * CALIBRATION_FACTOR);
      pdf.text("SCALA:", cartX + cartW * 0.5 + 2.5 * CALIBRATION_FACTOR, cartY + cartH * 0.4 + 4 * CALIBRATION_FACTOR);
      
      pdf.setFontSize(8 * CALIBRATION_FACTOR);
      pdf.text(`1:${tavola.scale}`, cartX + cartW * 0.5 + 2.5 * CALIBRATION_FACTOR, cartY + cartH * 0.4 + 10 * CALIBRATION_FACTOR);
      
      pdf.setFontSize(5 * CALIBRATION_FACTOR);
      pdf.text("AUTORE:", cartX + 2.5 * CALIBRATION_FACTOR, cartY + cartH * 0.7 + 4 * CALIBRATION_FACTOR);
      
      pdf.setFontSize(8 * CALIBRATION_FACTOR);
      const MAX_AUTORE_LEN = 20;
      let aString = tavola.datiCartiglio?.autore || "Domenico Gimondo";
      if(aString.length > MAX_AUTORE_LEN) aString = aString.substring(0, MAX_AUTORE_LEN) + "...";
      pdf.text(aString, cartX + 2.5 * CALIBRATION_FACTOR, cartY + cartH * 0.7 + 10 * CALIBRATION_FACTOR);
      
      pdf.setFontSize(5 * CALIBRATION_FACTOR);
      pdf.text("DATA:", cartX + cartW * 0.5 + 2.5 * CALIBRATION_FACTOR, cartY + cartH * 0.7 + 4 * CALIBRATION_FACTOR);
      
      pdf.setFontSize(8 * CALIBRATION_FACTOR);
      const MAX_DATA_LEN = 15;
      let dString = tavola.datiCartiglio?.data || "";
      if(dString.length > MAX_DATA_LEN) dString = dString.substring(0, MAX_DATA_LEN) + "...";
      pdf.text(dString, cartX + cartW * 0.5 + 2.5 * CALIBRATION_FACTOR, cartY + cartH * 0.7 + 10 * CALIBRATION_FACTOR);

      // Warning note for user about printer scaling
      pdf.setFontSize(4 * CALIBRATION_FACTOR);
      pdf.setTextColor(150, 0, 0);
      if (CALIBRATION_FACTOR === 1.0) {
        pdf.text("STAMPARE AL 100% (DIMENSIONI EFFETTIVE).", cartX + 2.5 * CALIBRATION_FACTOR, cartY + cartH - 2 * CALIBRATION_FACTOR);
      } else {
        pdf.text(`CALIBRAZIONE ATTIVA (${(CALIBRATION_FACTOR*100).toFixed(1)}%). COMPENSATA DISCREPANZA MARGINI STAMPANTE.`, cartX + 2.5 * CALIBRATION_FACTOR, cartY + cartH - 2 * CALIBRATION_FACTOR);
      }
      
      // Verification line (10 * CALIBRATION_FACTOR mm)
      // This will ensure that when printed, it physically measures 10mm given the user's report
      pdf.setDrawColor(150, 0, 0);
      pdf.setLineWidth(0.3 * CALIBRATION_FACTOR);
      
      const vLineLength = 10 * CALIBRATION_FACTOR;
      pdf.line(cartX + cartW - 15 * CALIBRATION_FACTOR, cartY + cartH - 4.5 * CALIBRATION_FACTOR, cartX + cartW - 15 * CALIBRATION_FACTOR + vLineLength, cartY + cartH - 4.5 * CALIBRATION_FACTOR);
      pdf.text("VERIFICA 10mm", cartX + cartW - 15 * CALIBRATION_FACTOR + (vLineLength / 2), cartY + cartH - 2.5 * CALIBRATION_FACTOR, { align: 'center' });
  }

  if (action === 'bloburl') {
    let url: string = '';
    // Use output type arraybuffer to create a clean blob URL
    try {
        const out = pdf.output('blob');
        url = URL.createObjectURL(out);
    } catch(e) {
        // Fallback to datauristring or raw bloburl
        url = pdf.output('bloburl').toString();
    }
    return url;
  }

  const exportName = tavola ? `${tavola.name}.pdf` : 'disegno.pdf';
  pdf.save(exportName);
};

interface LocalPoint { x: number; y: number; }

function isPointInPolygon(p: LocalPoint, poly: LocalPoint[]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y))
        && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function getLinePolygonIntersections(p0: LocalPoint, v: LocalPoint, poly: LocalPoint[]): number[] {
  const ts: number[] = [];
  const n = poly.length;
  const len2 = v.x * v.x + v.y * v.y;
  if (len2 < 1e-9) return ts;

  for (let i = 0; i < n; i++) {
    const vi = poly[i];
    const vj = poly[(i + 1) % n];

    const dx = vj.x - vi.x;
    const dy = vj.y - vi.y;

    const det = -v.x * dy + v.y * dx;
    if (Math.abs(det) < 1e-9) continue;

    const rx = vi.x - p0.x;
    const ry = vi.y - p0.y;

    const t = (-rx * dy + ry * dx) / det;
    const u = (v.x * ry - v.y * rx) / det;

    if (u >= -1e-6 && u <= 1 + 1e-6) {
      ts.push(t);
    }
  }

  ts.sort((a, b) => a - b);
  const uniqueTs: number[] = [];
  for (let i = 0; i < ts.length; i++) {
    if (uniqueTs.length === 0 || ts[i] - uniqueTs[uniqueTs.length - 1] > 1e-5) {
      uniqueTs.push(ts[i]);
    }
  }
  return uniqueTs;
}

function drawPatternLine(
  pdf: any,
  p0: LocalPoint,
  v: LocalPoint,
  poly: LocalPoint[],
  tx: (x: number) => number,
  ty: (y: number) => number,
  dashed: boolean = false,
  dashPattern: number[] = [2, 2]
) {
  const ts = getLinePolygonIntersections(p0, v, poly);
  if (ts.length < 2) return;

  if (dashed) {
    pdf.setLineDashPattern(dashPattern, 0);
  } else {
    pdf.setLineDashPattern([], 0);
  }

  for (let i = 0; i < ts.length - 1; i += 2) {
    const tStart = ts[i];
    const tEnd = ts[i + 1];
    
    const midT = (tStart + tEnd) / 2;
    const midPt = { x: p0.x + midT * v.x, y: p0.y + midT * v.y };
    if (isPointInPolygon(midPt, poly)) {
      const startPt = { x: p0.x + tStart * v.x, y: p0.y + tStart * v.y };
      const endPt = { x: p0.x + tEnd * v.x, y: p0.y + tEnd * v.y };
      pdf.line(tx(startPt.x), ty(startPt.y), tx(endPt.x), ty(endPt.y));
    }
  }
}

function drawHatchInPDF(
  pdf: any,
  entity: any,
  tx: (x: number) => number,
  ty: (y: number) => number,
  ts: (val: number) => number,
  scale: number
) {
  const { pattern, scale: hScale, angle, color, points, sfumatura = 0 } = entity;
  if (!points || points.length < 3) return;

  // Set color
  let r = 59, g = 130, b = 246; // Default `#3b82f6`
  if (color && color.startsWith('#')) {
    const hex = color.replace('#', '');
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }
  } else if (color && color.startsWith('rgb')) {
    const match = color.match(/\d+/g);
    if (match && match.length >= 3) {
      r = parseInt(match[0]);
      g = parseInt(match[1]);
      b = parseInt(match[2]);
    }
  }

  const pat = (pattern || 'ansi31').toLowerCase();

  if (pat === 'solid') {
    pdf.setFillColor(r, g, b);
    const pdfPoints = points.map((pt: LocalPoint) => ({ x: tx(pt.x), y: ty(pt.y) }));
    pdf.polygon(pdfPoints, 'F');
    return;
  }

  // Find center and bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const diag = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2);
  const halfDiag = Math.max(50, diag / 2);

  const radAngle = ((angle || 0) * Math.PI) / 180;
  const step = Math.max(2, hScale || 14);

  // Set drawing attributes
  pdf.setDrawColor(r, g, b);
  pdf.setFillColor(r, g, b);
  pdf.setLineWidth(0.12);

  const getGlobalPos = (lx: number, ly: number, extraRad: number = 0) => {
    const theta = radAngle + extraRad;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    return {
      x: cx + lx * cosT - ly * sinT,
      y: cy + lx * sinT + ly * cosT,
    };
  };

  if (pat === 'ansi31') {
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      const pStart = getGlobalPos(x, -halfDiag, Math.PI / 4);
      const pEnd = getGlobalPos(x, halfDiag, Math.PI / 4);
      const v = { x: pEnd.x - pStart.x, y: pEnd.y - pStart.y };
      drawPatternLine(pdf, pStart, v, points, tx, ty);
    }
  } else if (pat === 'ansi32') {
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      const pStart1 = getGlobalPos(x, -halfDiag, Math.PI / 4);
      const pEnd1 = getGlobalPos(x, halfDiag, Math.PI / 4);
      drawPatternLine(pdf, pStart1, { x: pEnd1.x - pStart1.x, y: pEnd1.y - pStart1.y }, points, tx, ty);

      const pStart2 = getGlobalPos(x + step * 0.25, -halfDiag, Math.PI / 4);
      const pEnd2 = getGlobalPos(x + step * 0.25, halfDiag, Math.PI / 4);
      drawPatternLine(pdf, pStart2, { x: pEnd2.x - pStart2.x, y: pEnd2.y - pStart2.y }, points, tx, ty);
    }
  } else if (pat === 'ansi33') {
    let idx = 0;
    for (let x = -halfDiag; x <= halfDiag; x += step / 2) {
      const pStart = getGlobalPos(x, -halfDiag, Math.PI / 4);
      const pEnd = getGlobalPos(x, halfDiag, Math.PI / 4);
      const v = { x: pEnd.x - pStart.x, y: pEnd.y - pStart.y };
      const isDashed = idx % 2 !== 0;
      const dPat = [ts(Math.max(1, step * 0.15)), ts(Math.max(1, step * 0.15))];
      drawPatternLine(pdf, pStart, v, points, tx, ty, isDashed, dPat);
      idx++;
    }
  } else if (pat === 'ansi34') {
    const dPat = [ts(Math.max(1, step * 0.2)), ts(Math.max(1, step * 0.2))];
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      const pStart = getGlobalPos(x, -halfDiag, Math.PI / 4);
      const pEnd = getGlobalPos(x, halfDiag, Math.PI / 4);
      const v = { x: pEnd.x - pStart.x, y: pEnd.y - pStart.y };
      drawPatternLine(pdf, pStart, v, points, tx, ty, true, dPat);
    }
  } else if (pat === 'grid') {
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      const pStart = getGlobalPos(x, -halfDiag);
      const pEnd = getGlobalPos(x, halfDiag);
      drawPatternLine(pdf, pStart, { x: pEnd.x - pStart.x, y: pEnd.y - pStart.y }, points, tx, ty);
    }
    for (let y = -halfDiag; y <= halfDiag; y += step) {
      const pStart = getGlobalPos(-halfDiag, y);
      const pEnd = getGlobalPos(halfDiag, y);
      drawPatternLine(pdf, pStart, { x: pEnd.x - pStart.x, y: pEnd.y - pStart.y }, points, tx, ty);
    }
  } else if (pat === 'cross') {
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      const pStart = getGlobalPos(x, -halfDiag, Math.PI / 4);
      const pEnd = getGlobalPos(x, halfDiag, Math.PI / 4);
      drawPatternLine(pdf, pStart, { x: pEnd.x - pStart.x, y: pEnd.y - pStart.y }, points, tx, ty);
    }
    for (let y = -halfDiag; y <= halfDiag; y += step) {
      const pStart = getGlobalPos(-halfDiag, y, Math.PI / 4);
      const pEnd = getGlobalPos(halfDiag, y, Math.PI / 4);
      drawPatternLine(pdf, pStart, { x: pEnd.x - pStart.x, y: pEnd.y - pStart.y }, points, tx, ty);
    }
  } else if (pat === 'stripe') {
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      const pStart = getGlobalPos(x, -halfDiag);
      const pEnd = getGlobalPos(x, halfDiag);
      drawPatternLine(pdf, pStart, { x: pEnd.x - pStart.x, y: pEnd.y - pStart.y }, points, tx, ty);
    }
  } else if (pat === 'horizontal') {
    for (let y = -halfDiag; y <= halfDiag; y += step) {
      const pStart = getGlobalPos(-halfDiag, y);
      const pEnd = getGlobalPos(halfDiag, y);
      drawPatternLine(pdf, pStart, { x: pEnd.x - pStart.x, y: pEnd.y - pStart.y }, points, tx, ty);
    }
  } else if (pat === 'dots') {
    const rDot = Math.max(0.4, step / 14);
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      for (let y = -halfDiag; y <= halfDiag; y += step) {
        const glob = getGlobalPos(x, y);
        if (isPointInPolygon(glob, points)) {
          pdf.circle(tx(glob.x), ty(glob.y), ts(rDot), 'F');
        }
      }
    }
  } else if (pat === 'zigzag') {
    const wl = step * 0.9;
    for (let y = -halfDiag; y <= halfDiag; y += step) {
      let up = true;
      let prevPt = getGlobalPos(-halfDiag, y);
      for (let x = -halfDiag + wl; x <= halfDiag; x += wl) {
        const nextLocalY = up ? y + step * 0.25 : y - step * 0.25;
        const nextPt = getGlobalPos(x, nextLocalY);
        const v = { x: nextPt.x - prevPt.x, y: nextPt.y - prevPt.y };
        drawPatternLine(pdf, prevPt, v, points, tx, ty);
        prevPt = nextPt;
        up = !up;
      }
    }
  } else if (pat === 'waves') {
    const wl = step;
    for (let y = -halfDiag; y <= halfDiag; y += step) {
      let prevPt = getGlobalPos(-halfDiag, y + Math.sin(-halfDiag / (wl / 4.5)) * (step * 0.2));
      for (let x = -halfDiag + 3; x <= halfDiag; x += 3) {
        const nextLocalY = y + Math.sin(x / (wl / 4.5)) * (step * 0.2);
        const nextPt = getGlobalPos(x, nextLocalY);
        const v = { x: nextPt.x - prevPt.x, y: nextPt.y - prevPt.y };
        drawPatternLine(pdf, prevPt, v, points, tx, ty);
        prevPt = nextPt;
      }
    }
  } else if (pat === 'brick') {
    const bHeight = step;
    const bWidth = step * 2.2;
    for (let y = -halfDiag; y <= halfDiag; y += bHeight) {
      const pStart = getGlobalPos(-halfDiag, y);
      const pEnd = getGlobalPos(halfDiag, y);
      drawPatternLine(pdf, pStart, { x: pEnd.x - pStart.x, y: pEnd.y - pStart.y }, points, tx, ty);
    }
    let rowIndex = 0;
    for (let y = -halfDiag; y <= halfDiag; y += bHeight) {
      const offsetX = (rowIndex % 2 === 0) ? 0 : bWidth / 2;
      for (let x = -halfDiag + offsetX - bWidth; x <= halfDiag + bWidth; x += bWidth) {
        const pStart = getGlobalPos(x, y);
        const pEnd = getGlobalPos(x, y + bHeight);
        drawPatternLine(pdf, pStart, { x: pEnd.x - pStart.x, y: pEnd.y - pStart.y }, points, tx, ty);
      }
      rowIndex++;
    }
  } else if (pat === 'checker') {
    let i = 0;
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      let j = 0;
      for (let y = -halfDiag; y <= halfDiag; y += step) {
        if ((i + j) % 2 === 0) {
          const p1 = getGlobalPos(x, y);
          const p2 = getGlobalPos(x + step, y);
          const p3 = getGlobalPos(x + step, y + step);
          const p4 = getGlobalPos(x, y + step);
          
          const centerG = getGlobalPos(x + step/2, y + step/2);
          if (isPointInPolygon(centerG, points)) {
            pdf.polygon([
              { x: tx(p1.x), y: ty(p1.y) },
              { x: tx(p2.x), y: ty(p2.y) },
              { x: tx(p3.x), y: ty(p3.y) },
              { x: tx(p4.x), y: ty(p4.y) }
            ], 'F');
          }
        }
        j++;
      }
      i++;
    }
  } else if (pat === 'triangles') {
    const h = step * Math.sin(Math.PI / 3);
    for (let y = -halfDiag; y <= halfDiag; y += h) {
      for (let x = -halfDiag; x <= halfDiag; x += step) {
        const p1 = getGlobalPos(x, y);
        const p2 = getGlobalPos(x + step / 2, y + h);
        const p3 = getGlobalPos(x - step / 2, y + h);

        drawPatternLine(pdf, p1, { x: p2.x - p1.x, y: p2.y - p1.y }, points, tx, ty);
        drawPatternLine(pdf, p2, { x: p3.x - p2.x, y: p3.y - p2.y }, points, tx, ty);
        drawPatternLine(pdf, p3, { x: p1.x - p3.x, y: p1.y - p3.y }, points, tx, ty);
      }
    }
  } else if (pat === 'honey') {
    const rHex = step / 1.73;
    const h = rHex * Math.sin(Math.PI / 3);
    for (let y = -halfDiag - rHex; y <= halfDiag + rHex; y += h * 2) {
      let isAlt = false;
      for (let x = -halfDiag - rHex; x <= halfDiag + rHex; x += rHex * 1.5) {
        const startOffset = isAlt ? h : 0;
        let prevPt = getGlobalPos(x + rHex * Math.cos(0), y + startOffset + rHex * Math.sin(0));
        for (let side = 1; side <= 6; side++) {
          const rad = ((side % 6) * Math.PI) / 3;
          const nextPt = getGlobalPos(x + rHex * Math.cos(rad), y + startOffset + rHex * Math.sin(rad));
          drawPatternLine(pdf, prevPt, { x: nextPt.x - prevPt.x, y: nextPt.y - prevPt.y }, points, tx, ty);
          prevPt = nextPt;
        }
        isAlt = !isAlt;
      }
    }
  } else if (pat === 'gravel') {
    const size = step * 0.35;
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      for (let y = -halfDiag; y <= halfDiag; y += step) {
        const rx = x + (Math.sin(x * y) * step * 0.15);
        const ry = y + (Math.cos(x + y) * step * 0.15);
        
        const p1 = getGlobalPos(rx - size * 0.5, ry - size * 0.2);
        const p2 = getGlobalPos(rx + size * 0.1, ry - size * 0.5);
        const p3 = getGlobalPos(rx + size * 0.5, ry + size * 0.1);
        const p4 = getGlobalPos(rx - size * 0.1, ry + size * 0.4);

        drawPatternLine(pdf, p1, { x: p2.x - p1.x, y: p2.y - p1.y }, points, tx, ty);
        drawPatternLine(pdf, p2, { x: p3.x - p2.x, y: p3.y - p2.y }, points, tx, ty);
        drawPatternLine(pdf, p3, { x: p4.x - p3.x, y: p4.y - p3.y }, points, tx, ty);
        drawPatternLine(pdf, p4, { x: p1.x - p4.x, y: p1.y - p4.y }, points, tx, ty);
      }
    }
  } else if (pat === 'cobble') {
    const rC = step * 0.33;
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      for (let y = -halfDiag; y <= halfDiag; y += step) {
        const rx = x + (Math.sin(x * y) * step * 0.12);
        const ry = y + (Math.cos(x + y) * step * 0.12);
        const rot = Math.sin(x * y);

        const getEllipsePt = (angleRad: number) => {
          const ex = rx + rC * 1.15 * Math.cos(angleRad);
          const ey = ry + rC * 0.75 * Math.sin(angleRad);
          const s = Math.sin(rot);
          const c = Math.cos(rot);
          const dx = ex - rx;
          const dy = ey - ry;
          return getGlobalPos(rx + (dx * c - dy * s), ry + (dx * s + dy * c));
        };

        let prevPt = getEllipsePt(0);
        for (let i = 1; i <= 8; i++) {
          const ang = (i * Math.PI) / 4;
          const nextPt = getEllipsePt(ang);
          drawPatternLine(pdf, prevPt, { x: nextPt.x - prevPt.x, y: nextPt.y - prevPt.y }, points, tx, ty);
          prevPt = nextPt;
        }
      }
    }
  } else if (pat === 'plaid') {
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      const pStart1 = getGlobalPos(x, -halfDiag);
      const pEnd1 = getGlobalPos(x, halfDiag);
      drawPatternLine(pdf, pStart1, { x: pEnd1.x - pStart1.x, y: pEnd1.y - pStart1.y }, points, tx, ty);

      const pStart2 = getGlobalPos(x + step * 0.2, -halfDiag);
      const pEnd2 = getGlobalPos(x + step * 0.2, halfDiag);
      drawPatternLine(pdf, pStart2, { x: pEnd2.x - pStart2.x, y: pEnd2.y - pStart2.y }, points, tx, ty);
    }
    for (let y = -halfDiag; y <= halfDiag; y += step) {
      const pStart1 = getGlobalPos(-halfDiag, y);
      const pEnd1 = getGlobalPos(halfDiag, y);
      drawPatternLine(pdf, pStart1, { x: pEnd1.x - pStart1.x, y: pEnd1.y - pStart1.y }, points, tx, ty);

      const pStart2 = getGlobalPos(-halfDiag, y + step * 0.2);
      const pEnd2 = getGlobalPos(halfDiag, y + step * 0.2);
      drawPatternLine(pdf, pStart2, { x: pEnd2.x - pStart2.x, y: pEnd2.y - pStart2.y }, points, tx, ty);
    }
  } else if (pat === 'stars') {
    const rStar = step * 0.28;
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      for (let y = -halfDiag; y <= halfDiag; y += step) {
        const starLocalPts = [
          { x: 0, y: -rStar },
          { x: rStar * 0.2, y: -rStar * 0.2 },
          { x: rStar, y: 0 },
          { x: rStar * 0.2, y: rStar * 0.2 },
          { x: 0, y: rStar },
          { x: -rStar * 0.2, y: rStar * 0.2 },
          { x: -rStar, y: 0 },
          { x: -rStar * 0.2, y: -rStar * 0.2 }
        ];

        let prevPt = getGlobalPos(x + starLocalPts[0].x, y + starLocalPts[0].y);
        for (let i = 1; i <= 8; i++) {
          const pt = starLocalPts[i % 8];
          const nextPt = getGlobalPos(x + pt.x, y + pt.y);
          drawPatternLine(pdf, prevPt, { x: nextPt.x - prevPt.x, y: nextPt.y - prevPt.y }, points, tx, ty);
          prevPt = nextPt;
        }
      }
    }
  }

  pdf.setLineDashPattern([], 0);
}

