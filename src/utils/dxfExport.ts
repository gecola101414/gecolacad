import { Entity, Layer } from '../types';
import Drawing from 'dxf-writer';
import { saveAs } from 'file-saver';

export function exportDXF(entities: Entity[], layers: Layer[], filename: string = 'disegno.dxf') {
    const d = new Drawing();
    d.setUnits('Millimeters');

    // Create layers
    layers.forEach(l => {
        d.addLayer(l.name, Drawing.ACI.WHITE, l.name);
    });

    entities.forEach(ent => {
        const layerObj = layers.find(l => l.id === ent.layer);
        const layerName = layerObj ? layerObj.name : '0';
        d.setActiveLayer(layerName);

        if (ent.type === 'line') {
            d.drawLine(ent.start.x, -ent.start.y, ent.end.x, -ent.end.y);
        } else if (ent.type === 'circle') {
            d.drawCircle(ent.center.x, -ent.center.y, ent.radius);
        } else if (ent.type === 'rectangle') {
            const minX = Math.min(ent.p1.x, ent.p2.x);
            const maxX = Math.max(ent.p1.x, ent.p2.x);
            const minY = Math.min(ent.p1.y, ent.p2.y);
            const maxY = Math.max(ent.p1.y, ent.p2.y);
            d.drawLine(minX, -minY, maxX, -minY);
            d.drawLine(maxX, -minY, maxX, -maxY);
            d.drawLine(maxX, -maxY, minX, -maxY);
            d.drawLine(minX, -maxY, minX, -minY);
        } else if (ent.type === 'arc') {
            // Note: startAngle and endAngle might need conversion based on dxf-writer
            // dxf-writer takes angles in degrees in counter-clockwise from X axis
            // Our arc startAngle/endAngle are in degrees. 
            // the canvas y axis points down, so the direction in DXF (y points up) is reversed.
            d.drawArc(ent.center.x, -ent.center.y, ent.radius, 360 - ent.endAngle, 360 - ent.startAngle);
        } else if (ent.type === 'point') {
            d.drawPoint(ent.point.x, -ent.point.y);
        } else if (ent.type === 'dimension') {
            // Dimensions can be exported as lines and texts in DXF, 
            // since native dimensions are complex to build with simple dxf-writer
            const dx = ent.end.x - ent.start.x;
            const dy = ent.end.y - ent.start.y;
            const L = Math.sqrt(dx * dx + dy * dy);
            if (L === 0) return;
            const nx = -dy / L;
            const ny = dx / L;

            const p1 = { x: ent.start.x + nx * ent.offset, y: ent.start.y + ny * ent.offset };
            const p2 = { x: ent.end.x + nx * ent.offset, y: ent.end.y + ny * ent.offset };

            // main dim line
            d.drawLine(p1.x, -p1.y, p2.x, -p2.y);
            
            // Text
            const numValue = Math.round(L * 100) / 100;
            const valueStr = Number.isInteger(numValue) ? numValue.toString() : numValue.toFixed(2).replace('.', ',');
            const textStr = ent.customText || valueStr;
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;
            
            let angle = Math.atan2(dy, dx) * 180 / Math.PI;
            if (angle < 0) angle += 360;
            if (angle > 90 && angle <= 270) {
               angle += 180;
            }
            d.drawText(mx, -my + 5, 12, -angle, textStr);
        }
    });

    const dxfString = d.toDxfString();
    const blob = new Blob([dxfString], { type: 'application/dxf' });
    saveAs(blob, filename);
}
