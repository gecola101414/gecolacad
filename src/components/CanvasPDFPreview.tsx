import React, { useEffect, useRef } from 'react';
import { Entity } from '../types';

interface CanvasPDFPreviewProps {
  entities: Entity[];
  tavola: {
    id: string;
    name: string;
    format: 'A0' | 'A1' | 'A2' | 'A3' | 'A4';
    scale: number;
    unit: 'm' | 'cm' | 'mm';
    position: { x: number; y: number };
    datiCartiglio: {
      progetto?: string;
      titolo?: string;
      autore?: string;
      data?: string;
    };
  };
}

export const CanvasPDFPreview: React.FC<CanvasPDFPreviewProps> = ({ entities, tavola }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const getPaperSizeMm = (fmt: string) => {
    switch (fmt.toUpperCase()) {
      case 'A4': return { w: 297, h: 210 };
      case 'A3': return { w: 420, h: 297 };
      case 'A2': return { w: 594, h: 420 };
      case 'A1': return { w: 841, h: 594 };
      case 'A0': return { w: 1189, h: 841 };
      default: return { w: 297, h: 210 };
    }
  };

  const getRgbaFromColor = (colorStr: string, alpha: number) => {
    if (!colorStr) return `rgba(99, 102, 241, ${alpha})`;
    const str = colorStr.trim();
    if (str.startsWith('#')) {
      const hex = str.replace('#', '');
      let r = 0, g = 0, b = 0;
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
      } else {
        return str;
      }
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    } else if (str.startsWith('rgb')) {
      const match = str.match(/\d+/g);
      if (match && match.length >= 3) {
        const aVal = match.length >= 4 ? parseFloat(match[3]) * alpha : alpha;
        return `rgba(${match[0]}, ${match[1]}, ${match[2]}, ${aVal})`;
      }
    }
    return str;
  };

  const drawHatchPatternLocal = (ctx: CanvasRenderingContext2D, entity: any, totalScale: number) => {
    const { pattern, scale: hScale, angle, color, points, sfumatura = 0 } = entity;
    if (!points || points.length < 3) return;

    ctx.save();
    
    // Set clipping path to the closed shape boundary
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.clip();

    const drawColorStr = color || '#3b82f6';

    if (pattern?.toLowerCase() === 'solid') {
      if (sfumatura > 0) {
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
        const halfDiag = Math.max(10, diag / 2);

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, halfDiag);
        const startColor = getRgbaFromColor(drawColorStr, 1.0);
        const endOpacity = Math.max(0, 1 - (sfumatura / 100));
        const endColor = getRgbaFromColor(drawColorStr, endOpacity);
        grad.addColorStop(0, startColor);
        grad.addColorStop(1, endColor);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = drawColorStr;
      }
      ctx.fill();
      ctx.restore();
      return;
    }

    // Draw light technical paper hatch backdrop
    ctx.fillStyle = 'rgba(0, 0, 0, 0.015)';
    ctx.fill();

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

    ctx.translate(cx, cy);
    ctx.rotate((angle || 0) * Math.PI / 180);

    ctx.strokeStyle = drawColorStr;
    // Keep line sharp/visible
    ctx.lineWidth = Math.max(0.1, 0.25 / totalScale);
    ctx.fillStyle = drawColorStr;
    ctx.setLineDash([]);

    const step = Math.max(2, hScale || 14);
    const pat = (pattern || 'ansi31').toLowerCase();

    try {
      if (pat === 'ansi31') {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        for (let x = -halfDiag; x <= halfDiag; x += step) {
          ctx.moveTo(x, -halfDiag);
          ctx.lineTo(x, halfDiag);
        }
        ctx.stroke();
      } else if (pat === 'ansi32') {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        for (let x = -halfDiag; x <= halfDiag; x += step) {
          ctx.moveTo(x, -halfDiag);
          ctx.lineTo(x, halfDiag);
          ctx.moveTo(x + step * 0.25, -halfDiag);
          ctx.lineTo(x + step * 0.25, halfDiag);
        }
        ctx.stroke();
      } else if (pat === 'ansi33') {
        ctx.rotate(Math.PI / 4);
        for (let x = -halfDiag, idx = 0; x <= halfDiag; x += step / 2, idx++) {
          ctx.beginPath();
          if (idx % 2 === 0) {
            ctx.setLineDash([]);
          } else {
            ctx.setLineDash([Math.max(0.2, step * 0.15), Math.max(0.2, step * 0.15)]);
          }
          ctx.moveTo(x, -halfDiag);
          ctx.lineTo(x, halfDiag);
          ctx.stroke();
        }
      } else if (pat === 'ansi34') {
        ctx.rotate(Math.PI / 4);
        ctx.setLineDash([Math.max(0.2, step * 0.2), Math.max(0.2, step * 0.2)]);
        ctx.beginPath();
        for (let x = -halfDiag; x <= halfDiag; x += step) {
          ctx.moveTo(x, -halfDiag);
          ctx.lineTo(x, halfDiag);
        }
        ctx.stroke();
      } else if (pat === 'grid') {
        ctx.beginPath();
        for (let x = -halfDiag; x <= halfDiag; x += step) {
          ctx.moveTo(x, -halfDiag);
          ctx.lineTo(x, halfDiag);
        }
        for (let y = -halfDiag; y <= halfDiag; y += step) {
          ctx.moveTo(-halfDiag, y);
          ctx.lineTo(halfDiag, y);
        }
        ctx.stroke();
      } else if (pat === 'cross') {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        for (let x = -halfDiag; x <= halfDiag; x += step) {
          ctx.moveTo(x, -halfDiag);
          ctx.lineTo(x, halfDiag);
        }
        for (let y = -halfDiag; y <= halfDiag; y += step) {
          ctx.moveTo(-halfDiag, y);
          ctx.lineTo(halfDiag, y);
        }
        ctx.stroke();
      } else if (pat === 'dots') {
        const r = Math.max(0.1, step / 14);
        for (let x = -halfDiag; x <= halfDiag; x += step) {
          for (let y = -halfDiag; y <= halfDiag; y += step) {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (pat === 'stripe') {
        ctx.beginPath();
        for (let x = -halfDiag; x <= halfDiag; x += step) {
          ctx.moveTo(x, -halfDiag);
          ctx.lineTo(x, halfDiag);
        }
        ctx.stroke();
      } else if (pat === 'horizontal') {
        ctx.beginPath();
        for (let y = -halfDiag; y <= halfDiag; y += step) {
          ctx.moveTo(-halfDiag, y);
          ctx.lineTo(halfDiag, y);
        }
        ctx.stroke();
      } else if (pat === 'zigzag') {
        ctx.beginPath();
        const wl = step * 0.9;
        for (let y = -halfDiag; y <= halfDiag; y += step) {
          ctx.moveTo(-halfDiag, y);
          let up = true;
          for (let x = -halfDiag; x <= halfDiag; x += wl) {
            ctx.lineTo(x, up ? y + step * 0.25 : y - step * 0.25);
            up = !up;
          }
        }
        ctx.stroke();
      } else if (pat === 'waves') {
        ctx.beginPath();
        const wl = step;
        for (let y = -halfDiag; y <= halfDiag; y += step) {
          ctx.moveTo(-halfDiag, y);
          for (let x = -halfDiag; x <= halfDiag; x += 2) {
            const sineY = y + Math.sin(x / (wl / 4.5)) * (step * 0.2);
            ctx.lineTo(x, sineY);
          }
        }
        ctx.stroke();
      } else if (pat === 'brick') {
        const bHeight = step;
        const bWidth = step * 2.2;
        ctx.beginPath();
        for (let y = -halfDiag; y <= halfDiag; y += bHeight) {
          ctx.moveTo(-halfDiag, y);
          ctx.lineTo(halfDiag, y);
        }
        let rowIndex = 0;
        for (let y = -halfDiag; y <= halfDiag; y += bHeight) {
          const offsetX = (rowIndex % 2 === 0) ? 0 : bWidth / 2;
          for (let x = -halfDiag + offsetX - bWidth; x <= halfDiag + bWidth; x += bWidth) {
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + bHeight);
          }
          rowIndex++;
        }
        ctx.stroke();
      } else if (pat === 'checker') {
        for (let x = -halfDiag, i = 0; x <= halfDiag; x += step, i++) {
          for (let y = -halfDiag, j = 0; y <= halfDiag; y += step, j++) {
            if ((i + j) % 2 === 0) {
              ctx.fillRect(x, y, step, step);
            }
          }
        }
      } else if (pat === 'triangles') {
        const h = step * Math.sin(Math.PI / 3);
        for (let y = -halfDiag; y <= halfDiag; y += h) {
          for (let x = -halfDiag; x <= halfDiag; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + step / 2, y + h);
            ctx.lineTo(x - step / 2, y + h);
            ctx.closePath();
            ctx.stroke();
          }
        }
      } else if (pat === 'honey') {
        const r = step / 1.73;
        const h = r * Math.sin(Math.PI / 3);
        for (let y = -halfDiag - r; y <= halfDiag + r; y += h * 2) {
          let isAlt = false;
          for (let x = -halfDiag - r; x <= halfDiag + r; x += r * 1.5) {
            ctx.beginPath();
            const startOffset = isAlt ? h : 0;
            for (let side = 0; side < 6; side++) {
              const rad = (side * Math.PI) / 3;
              const px = x + r * Math.cos(rad);
              const py = y + startOffset + r * Math.sin(rad);
              if (side === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
            isAlt = !isAlt;
          }
        }
      } else if (pat === 'gravel') {
        const size = step * 0.35;
        for (let x = -halfDiag; x <= halfDiag; x += step) {
          for (let y = -halfDiag; y <= halfDiag; y += step) {
            const rx = x + (Math.sin(x * y) * step * 0.15);
            const ry = y + (Math.cos(x + y) * step * 0.15);
            ctx.beginPath();
            ctx.moveTo(rx - size * 0.5, ry - size * 0.2);
            ctx.lineTo(rx + size * 0.1, ry - size * 0.5);
            ctx.lineTo(rx + size * 0.5, ry + size * 0.1);
            ctx.lineTo(rx - size * 0.1, ry + size * 0.4);
            ctx.closePath();
            ctx.stroke();
          }
        }
      } else if (pat === 'cobble') {
        const r = step * 0.33;
        for (let x = -halfDiag; x <= halfDiag; x += step) {
          for (let y = -halfDiag; y <= halfDiag; y += step) {
            const rx = x + (Math.sin(x * y) * step * 0.12);
            const ry = y + (Math.cos(x + y) * step * 0.12);
            ctx.beginPath();
            ctx.ellipse(rx, ry, r * 1.15, r * 0.75, Math.sin(x * y), 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      } else if (pat === 'plaid') {
        ctx.beginPath();
        for (let x = -halfDiag; x <= halfDiag; x += step) {
          ctx.moveTo(x, -halfDiag); ctx.lineTo(x, halfDiag);
          ctx.moveTo(x + step * 0.2, -halfDiag); ctx.lineTo(x + step * 0.2, halfDiag);
        }
        for (let y = -halfDiag; y <= halfDiag; y += step) {
          ctx.moveTo(-halfDiag, y); ctx.lineTo(halfDiag, y);
          ctx.moveTo(-halfDiag, y + step * 0.2); ctx.lineTo(halfDiag, y + step * 0.2);
        }
        ctx.stroke();
      } else if (pat === 'stars') {
        const rStar = step * 0.28;
        for (let x = -halfDiag; x <= halfDiag; x += step) {
          for (let y = -halfDiag; y <= halfDiag; y += step) {
            ctx.beginPath();
            ctx.moveTo(x, y - rStar);
            ctx.lineTo(x + rStar * 0.2, y - rStar * 0.2);
            ctx.lineTo(x + rStar, y);
            ctx.lineTo(x + rStar * 0.2, y + rStar * 0.2);
            ctx.lineTo(x, y + rStar);
            ctx.lineTo(x - rStar * 0.2, y + rStar * 0.2);
            ctx.lineTo(x - rStar, y);
            ctx.lineTo(x - rStar * 0.2, y - rStar * 0.2);
            ctx.closePath();
            ctx.stroke();
          }
        }
      }
    } catch (e) {
      console.error("Hatch render error:", e);
    }

    ctx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Setup paper dimensions (in mm)
    const pSizeMm = getPaperSizeMm(tavola.format);

    // Set stable ultra-high resolution canvas width/height
    const TARGET_LARGE_DIMENSION = 1800; // Excellent crisp balance
    const pxPerMm = TARGET_LARGE_DIMENSION / pSizeMm.w;
    
    canvas.width = Math.round(pSizeMm.w * pxPerMm);
    canvas.height = Math.round(pSizeMm.h * pxPerMm);

    // 2. Clear canvas with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Scaling of ctx: now 1 unit inside context = 1 millimeter on paper
    ctx.scale(pxPerMm, pxPerMm);

    // 3. Draw outer paper sheet border line (soft shadow / gray line)
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 0.35;
    ctx.strokeRect(0, 0, pSizeMm.w, pSizeMm.h);

    // Draw standard print margin inner frame (5mm of inner margin)
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 0.45;
    ctx.strokeRect(5, 5, pSizeMm.w - 10, pSizeMm.h - 10);

    // 4. Draw Title Block (Cartiglio)
    const cartW = 120;
    const cartH = 40;
    const cartX = pSizeMm.w - 5 - cartW;
    const cartY = pSizeMm.h - 5 - cartH;

    // Outer Title Block frame filled with solid white
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 0.4;
    ctx.fillRect(cartX, cartY, cartW, cartH);
    ctx.strokeRect(cartX, cartY, cartW, cartH);

    // Interior partitions
    ctx.lineWidth = 0.2;
    ctx.beginPath();
    // Progetto line (40% height)
    ctx.moveTo(cartX, cartY + cartH * 0.4);
    ctx.lineTo(cartX + cartW, cartY + cartH * 0.4);
    // Centered vertical divider under Progetto
    ctx.moveTo(cartX + cartW * 0.5, cartY + cartH * 0.4);
    ctx.lineTo(cartX + cartW * 0.5, cartY + cartH);
    // Autore/Data divider line (70% height)
    ctx.moveTo(cartX, cartY + cartH * 0.7);
    ctx.lineTo(cartX + cartW, cartY + cartH * 0.7);
    ctx.stroke();

    // Draw Cartiglio texts and labels
    ctx.fillStyle = '#1e3a8a'; // Deep blue
    ctx.font = 'bold 1.8px sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    ctx.fillText("PROGETTO:", cartX + 2.5, cartY + 3);
    
    ctx.font = 'bold 2.8px sans-serif';
    let projText = tavola.datiCartiglio?.progetto || "GECOLA CAD";
    if (projText.length > 35) projText = projText.substring(0, 35) + "...";
    ctx.fillText(projText, cartX + 2.5, cartY + 7);

    ctx.font = 'bold 1.8px sans-serif';
    ctx.fillText("TAVOLA:", cartX + 2.5, cartY + cartH * 0.4 + 3);

    ctx.font = 'bold 2.8px sans-serif';
    let titlText = tavola.datiCartiglio?.titolo || tavola.name;
    if (titlText.length > 20) titlText = titlText.substring(0, 20) + "...";
    ctx.fillText(titlText, cartX + 2.5, cartY + cartH * 0.4 + 7);

    ctx.font = 'bold 1.8px sans-serif';
    ctx.fillText("SCALA:", cartX + cartW * 0.5 + 2.5, cartY + cartH * 0.4 + 3);

    ctx.font = 'bold 2.8px sans-serif';
    ctx.fillText(`1:${tavola.scale}`, cartX + cartW * 0.5 + 2.5, cartY + cartH * 0.4 + 7);

    ctx.font = 'bold 1.8px sans-serif';
    ctx.fillText("AUTORE:", cartX + 2.5, cartY + cartH * 0.7 + 3);

    ctx.font = 'bold 2.8px sans-serif';
    let autText = tavola.datiCartiglio?.autore || "Domenico Gimondo";
    if (autText.length > 20) autText = autText.substring(0, 20) + "...";
    ctx.fillText(autText, cartX + 2.5, cartY + cartH * 0.7 + 7);

    ctx.font = 'bold 1.8px sans-serif';
    ctx.fillText("DATA:", cartX + cartW * 0.5 + 2.5, cartY + cartH * 0.7 + 3);

    ctx.font = 'bold 2.8px sans-serif';
    let dataText = tavola.datiCartiglio?.data || "";
    if (dataText.length > 15) dataText = dataText.substring(0, 15) + "...";
    ctx.fillText(dataText, cartX + cartW * 0.5 + 2.5, cartY + cartH * 0.7 + 7);

    // Small informational warning texts and a 10mm verification widget
    ctx.fillStyle = '#960000'; // Dark red
    ctx.font = '1.3px monospace';
    ctx.fillText("STAMPARE AL 100% (DIMENSIONI EFFETTIVE). NO 'ADATTA ALLA PAGINA'.", cartX + 2.5, cartY + cartH - 4);

    ctx.strokeStyle = '#960000';
    ctx.lineWidth = 0.2;
    ctx.beginPath();
    ctx.moveTo(cartX + cartW - 15, cartY + cartH - 4.2);
    ctx.lineTo(cartX + cartW - 5, cartY + cartH - 4.2);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText("VERIFICA 10mm", cartX + cartW - 10, cartY + cartH - 2.8);

    // 5. DRAW COMPONENT VECTOR CAD ENTITIES
    ctx.save();
    // Position inner area offset representing 5mm print frame
    ctx.translate(5, 5);

    // Convert from CAD world coordinates to paper millimeters
    let unitScaleFactor = 1000;
    if (tavola.unit === 'cm') unitScaleFactor = 10;
    if (tavola.unit === 'mm') unitScaleFactor = 1;
    const cadToMm = unitScaleFactor / tavola.scale;

    ctx.scale(cadToMm, cadToMm);
    // Translate origin of world to the sheet template standard coordinate positioning
    ctx.translate(-tavola.position.x, -tavola.position.y);

    // Set basic rendering configurations
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    entities.forEach(ent => {
      ctx.save();

      // Configure draw stroke colors, width, styling
      const isBIMSymbol = ent.isBIM && (ent.bimType === 'electrical_symbol' || ent.bimType === 'hydraulic_symbol');
      ctx.strokeStyle = isBIMSymbol ? '#000000' : (ent.color || '#000000');
      ctx.fillStyle = isBIMSymbol ? '#000000' : (ent.color || '#000000');
      
      const baseLw = typeof ent.lineWidth === 'number' ? ent.lineWidth : 1.0;
      // Convert typical screen unit thickness to proper paper millimeters scale representation
      ctx.lineWidth = isBIMSymbol ? (0.08 / cadToMm) : (Math.max(0.1, baseLw * 0.2) / cadToMm);

      if (ent.dashed) {
        ctx.setLineDash([5 / cadToMm, 5 / cadToMm]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.globalAlpha = ent.opacity !== undefined ? ent.opacity : 1.0;

      // Draw depending on Type
      if (ent.type === 'line') {
        if (ent.inkPoints && ent.inkPoints.length > 1) {
          // Freehand/Ink spline points
          ctx.beginPath();
          ctx.moveTo(ent.start.x, ent.start.y);
          for (let i = 0; i < ent.inkPoints.length; i++) {
            const pt = ent.inkPoints[i];
            const t = i / (ent.inkPoints.length - 1);
            const bx = ent.start.x + (ent.end.x - ent.start.x) * t;
            const by = ent.start.y + (ent.end.y - ent.start.y) * t;
            const px = ent.isFreehand ? pt.x : bx + pt.x;
            const py = ent.isFreehand ? pt.y : by + pt.y;
            ctx.lineTo(px, py);
          }
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(ent.start.x, ent.start.y);
          ctx.lineTo(ent.end.x, ent.end.y);
          ctx.stroke();
        }
      } else if (ent.type === 'circle') {
        ctx.beginPath();
        ctx.arc(ent.center.x, ent.center.y, ent.radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (ent.type === 'rectangle') {
        const w = ent.p2.x - ent.p1.x;
        const h = ent.p2.y - ent.p1.y;
        ctx.strokeRect(ent.p1.x, ent.p1.y, w, h);
      } else if (ent.type === 'point') {
        const p = ent.point || (ent as any).position;
        if (p) {
          ctx.fillStyle = '#ff0000';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 0.4 / cadToMm, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (ent.type === 'arc') {
        ctx.beginPath();
        ctx.arc(ent.center.x, ent.center.y, ent.radius, ent.startAngle, ent.endAngle);
        ctx.stroke();
      } else if (ent.type === 'dimension') {
        const dx = ent.end.x - ent.start.x;
        const dy = ent.end.y - ent.start.y;
        const L = Math.sqrt(dx * dx + dy * dy);
        if (L > 0) {
          const nx = -dy / L;
          const ny = dx / L;

          const p1 = { x: ent.start.x + nx * ent.offset, y: ent.start.y + ny * ent.offset };
          const p2 = { x: ent.end.x + nx * ent.offset, y: ent.end.y + ny * ent.offset };
          const scaleFactor = 2.0;

          ctx.lineWidth = (0.12 * Math.max(1, scaleFactor * 0.5)) / cadToMm;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();

          // Extensions/legislative elements
          const legBehind = (20 * scaleFactor) / cadToMm;
          const legAhead = (8 * scaleFactor) / cadToMm;
          const offsetDir = ent.offset >= 0 ? 1 : -1;

          ctx.beginPath();
          ctx.moveTo(p1.x - nx * legBehind * offsetDir, p1.y - ny * legBehind * offsetDir);
          ctx.lineTo(p1.x + nx * legAhead * offsetDir, p1.y + ny * legAhead * offsetDir);
          ctx.moveTo(p2.x - nx * legBehind * offsetDir, p2.y - ny * legBehind * offsetDir);
          ctx.lineTo(p2.x + nx * legAhead * offsetDir, p2.y + ny * legAhead * offsetDir);
          ctx.stroke();

          // Slashes
          const slashSize = (5 * scaleFactor) / cadToMm;
          ctx.beginPath();
          ctx.moveTo(p1.x - nx * slashSize - ny * slashSize, p1.y - ny * slashSize + nx * slashSize);
          ctx.lineTo(p1.x + nx * slashSize + ny * slashSize, p1.y + ny * slashSize - nx * slashSize);
          ctx.moveTo(p2.x - nx * slashSize - ny * slashSize, p2.y - ny * slashSize + nx * slashSize);
          ctx.lineTo(p2.x + nx * slashSize + ny * slashSize, p2.y + ny * slashSize - nx * slashSize);
          ctx.stroke();

          // Dimension text
          ctx.fillStyle = '#000000';
          const size = (12 * scaleFactor) / cadToMm;
          ctx.font = `${size}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';

          const numValue = Math.round(L * 100) / 100;
          const valueStr = Number.isInteger(numValue) ? numValue.toString() : numValue.toFixed(2).replace('.', ',');
          const textToPrint = ent.customText || valueStr;

          let angle = Math.atan2(dy, dx);
          if (angle >= Math.PI / 2 - 0.01) angle -= Math.PI;
          else if (angle < -Math.PI / 2 - 0.01) angle += Math.PI;

          const textX = (p1.x + p2.x) / 2 + (3 * scaleFactor / cadToMm) * Math.sin(angle);
          const textY = (p1.y + p2.y) / 2 - (3 * scaleFactor / cadToMm) * Math.cos(angle);

          ctx.save();
          ctx.translate(textX, textY);
          ctx.rotate(angle);
          ctx.fillText(textToPrint, 0, 0);
          ctx.restore();
        }
      } else if (ent.type === 'text') {
        const textFontSize = (ent.fontSize || 14) / cadToMm;
        ctx.font = `${ent.fontWeight || 'normal'} ${textFontSize}px ${ent.fontFamily || 'sans-serif'}`;
        const isBIMSymbol = ent.isBIM && (ent.bimType === 'electrical_symbol' || ent.bimType === 'hydraulic_symbol');
        ctx.fillStyle = isBIMSymbol ? '#000000' : (ent.color || '#000000');
        ctx.textAlign = (ent.textAlign as CanvasTextAlign) || 'left';
        ctx.textBaseline = 'top';

        const lines = ent.text.split('\n');
        const lineHeight = textFontSize * 1.25;
        lines.forEach((line, idx) => {
          ctx.fillText(line, ent.point.x, ent.point.y + idx * lineHeight);
        });
      } else if (ent.type === 'hatch') {
        drawHatchPatternLocal(ctx, ent, cadToMm);
      }

      ctx.restore();
    });

    ctx.restore(); // Inner offset restore
    ctx.restore(); // Millimeter scaling restore

  }, [entities, tavola]);

  return (
    <div className="flex-1 flex items-center justify-center overflow-auto p-4 select-none">
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-[75vh] md:max-h-[80vh] aspect-square object-contain shadow-2xl bg-white border border-neutral-300 rounded"
        style={{ contentVisibility: 'auto' }}
      />
    </div>
  );
};
