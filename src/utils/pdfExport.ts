import { jsPDF } from 'jspdf';
import { Entity } from '../types';

export const exportNativePDF = (entities: Entity[], format: string, scaleDenom: number, unit: string) => {
  if (entities.length === 0) return;

  // Find bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

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

  if (minX === Infinity) return;

  const drawingWidth = maxX - minX;
  const drawingHeight = maxY - minY;

  const pdf = new jsPDF({
    orientation: drawingWidth > drawingHeight ? 'landscape' : 'portrait',
    unit: 'mm',
    format: format.toLowerCase()
  });

  const unitToMm = {
      mm: 1,
      cm: 10,
      m: 1000
  };
  const multiplier = unitToMm[unit as keyof typeof unitToMm] || 1;
  const scale = multiplier / scaleDenom;
  
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
          pdf.line(tx(entity.start.x), ty(entity.start.y), tx(entity.end.x), ty(entity.end.y));
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

  pdf.save('disegno.pdf');
};
