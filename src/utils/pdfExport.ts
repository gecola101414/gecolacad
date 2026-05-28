import { jsPDF } from 'jspdf';
import { Entity } from '../types';

export interface TavolaExport {
  id: string;
  name: string;
  format: 'A0' | 'A1' | 'A2' | 'A3' | 'A4';
  scale: number;
  unit: 'm' | 'cm' | 'mm';
  position: { x: number; y: number };
  visible: boolean;
}

export const exportNativePDF = (
  entities: Entity[], 
  format: string, 
  scaleDenom: number, 
  unit: string,
  tavola?: TavolaExport
) => {
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
        }
      });
  }

  if (minX === Infinity) return;

  const drawingWidth = maxX - minX;
  const drawingHeight = maxY - minY;

  const chosenFormat = tavola ? tavola.format : format;
  const chosenScaleDenom = tavola ? tavola.scale : scaleDenom;
  const chosenUnit = tavola ? tavola.unit : unit;

  const pdf = new jsPDF({
    orientation: drawingWidth > drawingHeight ? 'landscape' : 'portrait',
    unit: 'mm',
    format: chosenFormat.toLowerCase()
  });

  const unitToMm = {
      mm: 1,
      cm: 10,
      m: 1000
  };
  const multiplier = unitToMm[chosenUnit as keyof typeof unitToMm] || 1;
  const scale = multiplier / chosenScaleDenom;
  
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const scaledWidth = drawingWidth * scale;
  const scaledHeight = drawingHeight * scale;

  const offsetX = (pageWidth - scaledWidth) / 2 - minX * scale;
  const offsetY = (pageHeight - scaledHeight) / 2 - minY * scale;

  const tx = (x: number) => x * scale + offsetX;
  const ty = (y: number) => y * scale + offsetY;
  const ts = (val: number) => val * scale;

  entities.forEach(entity => {
      // All lines black
      pdf.setDrawColor(0, 0, 0); 
      
      let baseLw = entity.lineWidth && typeof entity.lineWidth === 'number' ? entity.lineWidth : 1;
      let lw = Math.max(0.1, baseLw * 0.2); // Rough mapping from screen units to mm for line width
      if (entity.type === 'dimension') lw = 0.1;
      pdf.setLineWidth(lw);

      if (entity.dashed) {
          pdf.setLineDashPattern([2, 2], 0);
      } else {
          pdf.setLineDashPattern([], 0);
      }

      if (entity.type === 'line') {
          if (entity.inkPoints && entity.inkPoints.length > 1) {
              let lastX = entity.start.x;
              let lastY = entity.start.y;
              for(let i=0; i<entity.inkPoints.length; i++) {
                  const pt = entity.inkPoints[i];
                  const t = i / (entity.inkPoints.length - 1);
                  const bx = entity.start.x + (entity.end.x - entity.start.x) * t;
                  const by = entity.start.y + (entity.end.y - entity.start.y) * t;
                  const px = entity.isFreehand ? pt.x : bx + pt.x;
                  const py = entity.isFreehand ? pt.y : by + pt.y;
                  
                  // Apply width and alpha from inkPoint
                  const lw = Math.max(0.05, pt.width * scale * 0.5);
                  pdf.setLineWidth(lw);
                  const gray = Math.round((1 - Math.min(1, pt.alpha)) * 255);
                  pdf.setDrawColor(gray, gray, gray);
                  
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
            
            // Dimension line
            pdf.line(tx(p1.x), ty(p1.y), tx(p2.x), ty(p2.y));

            // Extension lines (gampette)
            const p_gap = 2; // Fixed gap in drawing units
            const legBehind = 20; 
            const legAhead = 8;
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

            // Inclined intersection slashes
            const slashSize = 5;
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
            pdf.setFontSize(ts(12) * (72 / 25.4)); // Fixed 12 drawing units converted to PDF Points
            
            const numValue = Math.round(L * 100) / 100;
            const valueStr = Number.isInteger(numValue) ? numValue.toString() : numValue.toFixed(2).replace('.', ',');
            const textToPrint = entity.customText || valueStr;
            
            let angle = Math.atan2(dy, dx);
            if (angle >= Math.PI / 2 - 0.01) {
                angle -= Math.PI;
            } else if (angle < -Math.PI / 2 - 0.01) {
                angle += Math.PI;
            }
            
            // Translate the text 3 drawing units perpendicularly (upwards relative to text)
            const textX = (p1.x + p2.x) / 2 + 3 * Math.sin(angle);
            const textY = (p1.y + p2.y) / 2 - 3 * Math.cos(angle);
            
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
      
      // Draw Title Block background and borders
      const cartW = 120;
      const cartH = 40;
      const cartX = pSize.w - marginMm - cartW;
      const cartY = pSize.h - marginMm - cartH;
      
      pdf.setFillColor(255, 255, 255);
      pdf.rect(cartX, cartY, cartW, cartH, 'FD');
      
      // Secondary subdivision lines
      pdf.setLineWidth(0.2);
      pdf.line(cartX, cartY + cartH * 0.4, cartX + cartW, cartY + cartH * 0.4);
      pdf.line(cartX, cartY + cartH * 0.7, cartX + cartW, cartY + cartH * 0.7);
      pdf.line(cartX + cartW * 0.5, cartY + cartH * 0.4, cartX + cartW * 0.5, cartY + cartH);
      
      // Title Block Info
      pdf.setTextColor(30, 58, 138);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(5);
      pdf.text("PROGETTO:", cartX + 2.5, cartY + 4);
      
      pdf.setFontSize(8);
      const MAX_PROGETTO_LEN = 35;
      let pString = tavola.datiCartiglio?.progetto || "GECOLA CAD";
      if(pString.length > MAX_PROGETTO_LEN) pString = pString.substring(0, MAX_PROGETTO_LEN) + "...";
      pdf.text(pString, cartX + 2.5, cartY + 10);
      
      pdf.setFontSize(5);
      pdf.text("TAVOLA:", cartX + 2.5, cartY + cartH * 0.4 + 4);
      
      pdf.setFontSize(8);
      const MAX_TITOLO_LEN = 20;
      let tString = tavola.datiCartiglio?.titolo || tavola.name;
      if(tString.length > MAX_TITOLO_LEN) tString = tString.substring(0, MAX_TITOLO_LEN) + "...";
      pdf.text(tString, cartX + 2.5, cartY + cartH * 0.4 + 10);
      
      pdf.setFontSize(5);
      pdf.text("SCALA:", cartX + cartW * 0.5 + 2.5, cartY + cartH * 0.4 + 4);
      
      pdf.setFontSize(8);
      pdf.text(`1:${tavola.scale}`, cartX + cartW * 0.5 + 2.5, cartY + cartH * 0.4 + 10);
      
      pdf.setFontSize(5);
      pdf.text("AUTORE:", cartX + 2.5, cartY + cartH * 0.7 + 4);
      
      pdf.setFontSize(8);
      const MAX_AUTORE_LEN = 20;
      let aString = tavola.datiCartiglio?.autore || "Domenico Gimondo";
      if(aString.length > MAX_AUTORE_LEN) aString = aString.substring(0, MAX_AUTORE_LEN) + "...";
      pdf.text(aString, cartX + 2.5, cartY + cartH * 0.7 + 10);
      
      pdf.setFontSize(5);
      pdf.text("DATA:", cartX + cartW * 0.5 + 2.5, cartY + cartH * 0.7 + 4);
      
      pdf.setFontSize(8);
      const MAX_DATA_LEN = 15;
      let dString = tavola.datiCartiglio?.data || "";
      if(dString.length > MAX_DATA_LEN) dString = dString.substring(0, MAX_DATA_LEN) + "...";
      pdf.text(dString, cartX + cartW * 0.5 + 2.5, cartY + cartH * 0.7 + 10);
  }

  const exportName = tavola ? `${tavola.name}.pdf` : 'disegno.pdf';
  pdf.save(exportName);
};
