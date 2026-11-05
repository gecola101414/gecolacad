
import * as THREE from 'three';

/**
 * Procedural texture generator for realistic BIM materials
 */
export const createBIMMaterialTexture = (
  type: 'concrete' | 'masonry' | 'partition' | 'plaster' | 'plaster_rustic' | 'stone' | 'insulation' | 'tiles' | 'casseri' | 'solaio_pignatte',
  variant: 'side' | 'top' = 'side',
  color?: string,
  orientation: 'horizontal' | 'vertical' = 'horizontal'
): THREE.CanvasTexture => {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  if (type === 'solaio_pignatte') {
    if (variant === 'top') {
        // Concrete look (top of the slab)
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(0, 0, size, size);
        
        // Add some concrete grain/noise
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        for (let i = 0; i < 2000; i++) {
          const rx = Math.random() * size;
          const ry = Math.random() * size;
          const rsize = 1 + Math.random() * 2;
          ctx.fillRect(rx, ry, rsize, rsize);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        for (let i = 0; i < 2000; i++) {
          const rx = Math.random() * size;
          const ry = Math.random() * size;
          const rsize = 1 + Math.random() * 2;
          ctx.fillRect(rx, ry, rsize, rsize);
        }
    } else {
        // Brick/Pignatte look - Represents exactly 60cm x 60cm block
        // Terracotta brick background
        ctx.fillStyle = '#D2B48C'; // Warm brick color
        ctx.fillRect(0, 0, size, size);

        // Add terracotta texture/noise
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        for (let i = 0; i < 1000; i++) {
          const rx = Math.random() * size;
          const ry = Math.random() * size;
          ctx.fillRect(rx, ry, 1, 1);
        }

        // Draw the concrete beam (travetto) on the left side
        // width of beam is 12cm, which is 12/60 * 512 = ~102 pixels
        const beamWidth = 102;
        ctx.fillStyle = '#9ca3af'; // Grey concrete
        ctx.fillRect(0, 0, beamWidth, size);

        // Concrete texture/grain for beam
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        for (let i = 0; i < 300; i++) {
          const rx = Math.random() * beamWidth;
          const ry = Math.random() * size;
          ctx.fillRect(rx, ry, 1, 1);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        for (let i = 0; i < 300; i++) {
          const rx = Math.random() * beamWidth;
          const ry = Math.random() * size;
          ctx.fillRect(rx, ry, 1, 1);
        }

        // Dark separation border between beam and brick
        ctx.strokeStyle = '#4b5563';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(beamWidth, 0);
        ctx.lineTo(beamWidth, size);
        ctx.stroke();

        // Brick horizontal joint lines (every 25 cm, which is 25/60 * 512 = ~213 pixels)
        ctx.strokeStyle = '#854d0e'; // Dark brown for brick lines
        ctx.lineWidth = 3;
        const brickHeight = 213;
        for (let y = brickHeight; y < size; y += brickHeight) {
            ctx.beginPath();
            ctx.moveTo(beamWidth, y);
            ctx.lineTo(size, y);
            ctx.stroke();
        }

        // Internal brick stripes (pignatte have vertical ribs)
        ctx.strokeStyle = 'rgba(133, 77, 14, 0.35)';
        ctx.lineWidth = 1.5;
        // Draw 3 internal ribs inside the brick area
        const brickAreaWidth = size - beamWidth;
        const ribSpacing = brickAreaWidth / 4;
        for (let x = beamWidth + ribSpacing; x < size; x += ribSpacing) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, size);
            ctx.stroke();
        }
    }
  }
  else if (type === 'concrete') {
    // Base color: Concrete Grey
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, 0, size, size);

    // Subtle grain noise for concrete
    for (let i = 0; i < 20000; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const grey = Math.random() * 40 - 20;
        ctx.fillStyle = `rgba(${100 + grey}, ${100 + grey}, ${100 + grey}, 0.15)`;
        ctx.fillRect(x, y, 1, 1);
    }

    if (variant === 'side') {
      // Formwork board marks (orme delle tavole) - 50cm spacing
      const boardSize = 85; 
      const numBoards = Math.ceil(size / boardSize);
      
      for (let i = 0; i <= numBoards; i++) {
        const pos = i * boardSize;
        
        // Board joints (Subtle gray for marks on concrete)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'; 
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        if (orientation === 'horizontal') {
          ctx.moveTo(0, pos);
          ctx.lineTo(size, pos);
          ctx.stroke();
          
          // Subtle wood grain impressions
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
          ctx.lineWidth = 1;
          for (let j = 0; j < 3; j++) {
            const gy = pos + Math.random() * boardSize;
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.bezierCurveTo(size/3, gy + 5, size*2/3, gy - 5, size, gy);
            ctx.stroke();
          }
        } else {
          ctx.moveTo(pos, 0);
          ctx.lineTo(pos, size);
          ctx.stroke();
          
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
          ctx.lineWidth = 1;
          for (let j = 0; j < 3; j++) {
            const gx = pos + Math.random() * boardSize;
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.bezierCurveTo(gx + 5, size/3, gx - 5, size*2/3, gx, size);
            ctx.stroke();
          }
        }
      }
    } else {
        // Top view: rough concrete look
        for (let i = 0; i < 400; i++) {
          const x = Math.random() * size;
          const y = Math.random() * size;
          const r = Math.random() * 2 + 0.5;
          ctx.fillStyle = `rgba(80, 80, 80, 0.2)`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
    }
  } 
  else if (type === 'casseri') {
    // Base color: Bright Yellow/Orange for formwork boards (casseri)
    ctx.fillStyle = '#eab308'; // yellow-600
    ctx.fillRect(0, 0, size, size);

    // Wood grain for boards
    for (let i = 0; i < 15000; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const noise = Math.random() * 30 - 15;
        ctx.fillStyle = `rgba(${234 + noise}, ${179 + noise}, ${8 + noise}, 0.2)`;
        ctx.fillRect(x, y, 1, 1);
    }

    const boardSize = 85; 
    const numBoards = Math.ceil(size / boardSize);
    
    for (let i = 0; i <= numBoards; i++) {
      const pos = i * boardSize;
      
      // Board joints (Defined yellow-orange)
      ctx.strokeStyle = 'rgba(180, 83, 9, 0.8)'; // amber-700
      ctx.lineWidth = 4;
      ctx.beginPath();
      
      if (orientation === 'horizontal') {
        ctx.moveTo(0, pos);
        ctx.lineTo(size, pos);
        ctx.stroke();
        
        ctx.strokeStyle = 'rgba(180, 83, 9, 0.3)';
        ctx.lineWidth = 1.5;
        for (let j = 0; j < 8; j++) {
          const gy = pos + Math.random() * boardSize;
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.bezierCurveTo(size/3, gy + 12, size*2/3, gy - 12, size, gy);
          ctx.stroke();
        }
      } else {
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, size);
        ctx.stroke();
        
        ctx.strokeStyle = 'rgba(180, 83, 9, 0.3)';
        ctx.lineWidth = 1.5;
        for (let j = 0; j < 8; j++) {
          const gx = pos + Math.random() * boardSize;
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.bezierCurveTo(gx + 12, size/3, gx - 12, size*2/3, gx, size);
          ctx.stroke();
        }
      }
    }
  }
  else if (type === 'plaster') {
    // Plaster (Intonaco): Off-white/light gray with fine mineral grain
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, size, size);

    // Fine mineral grain
    for (let i = 0; i < 30000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const noise = Math.random() * 20 - 10;
      const alpha = Math.random() * 0.15;
      ctx.fillStyle = `rgba(${240 + noise}, ${240 + noise}, ${240 + noise}, ${alpha})`;
      ctx.fillRect(x, y, 1, 1);
    }

    // Subtle trowel marks
    ctx.strokeStyle = 'rgba(0,0,0,0.02)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      const startX = Math.random() * size;
      const startY = Math.random() * size;
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(startX + 50, startY + 50, startX + 100, startY);
      ctx.stroke();
    }
  }
  else if (type === 'plaster_rustic') {
    // Plaster Rustic (Intonaco Rustico): rough, sandy base with pronounced trowel marks
    ctx.fillStyle = color || '#a8a29e'; 
    ctx.fillRect(0, 0, size, size);

    // Large trowel marks / Spatolate to give it a wavy, highly textured look
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      const x = Math.random() * size;
      const y = Math.random() * size;
      const w = 40 + Math.random() * 60;
      const h = 20 + Math.random() * 40;
      const angle = Math.random() * Math.PI;
      
      ctx.translate(x, y);
      ctx.rotate(angle);
      
      // Shadow of the trowel mark
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(5, 5, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Highlight of the trowel mark
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.ellipse(-2, -2, w, h, 0, 0, Math.PI * 2);
      ctx.fill();

      // Base of the trowel mark
      ctx.fillStyle = 'rgba(150, 140, 130, 0.1)';
      ctx.beginPath();
      ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(-angle);
      ctx.translate(-x, -y);
    }

    // Heavy grain and stones
    for (let i = 0; i < 20000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const isStone = Math.random() > 0.98;
      if (isStone) {
        // Small stones/gravel exposed
        const r = 1 + Math.random() * 3;
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(50,40,30,0.4)' : 'rgba(220,210,200,0.4)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI*2);
        ctx.fill();
      } else {
        // Sand / gritty noise
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  else if (type === 'masonry' || type === 'partition') {
    const isPartition = type === 'partition';
    
    if (variant === 'top') {
      // Top view of Swiss Bricks (Poroton/Laterizio): Grid of holes with thick defined edges
      // Use a more natural "Poroton" orange-red color
      const baseColor = isPartition ? '#e27b58' : '#cd5c3a'; 
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, size, size);

      const holesX = isPartition ? 6 : 8;
      const holesY = isPartition ? 10 : 12;
      const padding = size * 0.04;
      const holeW = (size - padding * 2) / holesX;
      const holeH = (size - padding * 2) / holesY;
      const holeGap = isPartition ? 6 : 10; // Wider gaps for thicker walls between holes as requested

      for (let i = 0; i < holesX; i++) {
        for (let j = 0; j < holesY; j++) {
          const hx = padding + i * holeW + holeGap/2;
          const hy = padding + j * holeH + holeGap/2;
          const hw = holeW - holeGap;
          const hh = holeH - holeGap;
          
          // Outer defined edge of the hole (thick contour - highly requested)
          ctx.strokeStyle = 'rgba(40,10,0,0.6)';
          ctx.lineWidth = 3.5; 
          
          // Deep dark hole
          ctx.fillStyle = 'rgba(10,2,0,1.0)';
          
          const radius = 1.0;
          const drawRect = (x: number, y: number, w: number, h: number) => {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + w - radius, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
            ctx.lineTo(x + w, y + h - radius);
            ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
            ctx.lineTo(x + radius, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
          };

          drawRect(hx, hy, hw, hh);
          ctx.fill();
          ctx.stroke();

          // Internal wall highlight (gives three-dimensionality to the hollow brick)
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(hx + 0.5, hy + 0.5);
          ctx.lineTo(hx + hw - 0.5, hy + 0.5);
          ctx.stroke();
        }
      }
      
      // Surface grain/clay imperfections
      for (let i = 0; i < 3000; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = Math.random() * 20 - 10;
        ctx.fillStyle = `rgba(0,0,0,0.1)`;
        ctx.fillRect(x, y, 1, 1);
      }
    } else {
      // Side view: Vertical scoring and brick bonding
      ctx.fillStyle = '#cbd5e1'; // Mortar color (Cementitious)
      ctx.fillRect(0, 0, size, size);

      const rows = isPartition ? 10 : 7;
      const cols = isPartition ? 3 : 2;
      const h = size / rows;
      const w = size / cols;
      const mortar = isPartition ? 5 : 8;

      for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * (w / 2);
        for (let c = -1; c < cols + 1; c++) {
          const x = c * w + offset + mortar/2;
          const y = r * h + mortar/2;
          const bw = w - mortar;
          const bh = h - mortar;

          const hueVar = Math.random() * 8 - 4;
          const lightVar = Math.random() * 10 - 5;
          
          if (isPartition) {
              ctx.fillStyle = `hsl(${22 + hueVar}, ${60}%, ${65 + lightVar}%)`;
          } else {
              ctx.fillStyle = `hsl(${20 + hueVar}, ${65}%, ${55 + lightVar}%)`;
          }
          
          ctx.fillRect(x, y, bw, bh);

          // Highly visible vertical scoring (typical of laterizio)
          ctx.strokeStyle = 'rgba(0,0,0,0.22)';
          ctx.lineWidth = 1.2;
          const lines = isPartition ? 10 : 16;
          for (let i = 1; i < lines; i++) {
            const lx = x + bw * (i/lines);
            ctx.beginPath();
            ctx.moveTo(lx, y);
            ctx.lineTo(lx, y + bh);
            ctx.stroke();
          }

          // Ambient occlusion/Shadows for depth
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(x, y + bh - 2.5, bw, 2.5); 
          ctx.fillRect(x + bw - 2.5, y, 2.5, bh); 
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(x, y, bw, 2); 
        }
      }
    }
  }
  else if (type === 'insulation') {
    // Soft pastel mint green / light insulation blue-green characteristic of EPS/XPS thermal boards
    ctx.fillStyle = '#e0f2fe'; // Sky/water light blue or pastel insulation foam color
    ctx.fillRect(0, 0, size, size);

    // Fine cell/bubbly insulation noise (Styrofoam texture)
    for (let i = 0; i < 25000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const noise = Math.random() * 30 - 15;
      const alpha = Math.random() * 0.12;
      ctx.fillStyle = `rgba(${56 + noise}, ${189 + noise}, ${248 + noise}, ${alpha})`; // light cyan spots
      ctx.fillRect(x, y, 1, 1);
    }

    // Classic wave/squiggle pattern representing thermal insulation/cappotto
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.45)'; // sky blue strokes
    ctx.lineWidth = 3.5;
    
    // Draw repeating wavy lines (squiggly sine wave insulation pattern)
    const waveCount = 10;
    const waveLength = size / waveCount;
    for (let j = 0; j < waveCount; j++) {
      const xOffset = j * waveLength;
      ctx.beginPath();
      for (let y = 0; y <= size; y += 4) {
        // Sine wave squiggle
        const x = xOffset + waveLength/2 + Math.sin(y * 0.05) * (waveLength / 3);
        if (y === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  }
  else if (type === 'tiles') {
    // Modern rectangular tiles (e.g. 50x80 cm)
    // Use the color parameter if provided, otherwise default to a light grey
    const baseColor = color || (variant === 'top' ? '#f1f5f9' : '#e2e8f0');
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);

    // Subtle noise for stoneware texture
    for (let i = 0; i < 20000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const noise = Math.random() * 20 - 10;
      const alpha = Math.random() * 0.05;
      ctx.fillStyle = `rgba(${150 + noise}, ${150 + noise}, ${150 + noise}, ${alpha})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Draw tile joints (fughe) - rectangular format 50x100
    // Width = 50cm, Height = 100cm. The texture represents a 100x100cm area.
    const tileWidth = size / 2; // 50cm
    const tileHeight = size; // 100cm
    
    const jointColor = 'rgba(255, 255, 255, 1)'; // bright white joints (fughe bianche)
    const shadowColor = 'rgba(0, 0, 0, 0.15)';

    ctx.lineWidth = 4; // thicker grout lines
    
    // Draw tiles with alternating/staggered grid pattern (sfalsato)
    for (let y = 0; y <= size; y += tileHeight) {
      const rowOffset = (y / tileHeight) % 2 === 0 ? 0 : tileWidth / 2;
      for (let x = -tileWidth; x <= size; x += tileWidth) {
        const drawX = x + rowOffset;
        
        // Tile background subtle gradient
        const grad = ctx.createLinearGradient(drawX, y, drawX + tileWidth, y + tileHeight);
        grad.addColorStop(0, 'rgba(255,255,255,0.15)');
        grad.addColorStop(1, 'rgba(0,0,0,0.08)');
        ctx.fillStyle = grad;
        ctx.fillRect(drawX, y, tileWidth, tileHeight);

        // Tile joints
        ctx.strokeStyle = jointColor;
        ctx.strokeRect(drawX, y, tileWidth, tileHeight);

        // Subtle shadow/bevel
        ctx.strokeStyle = shadowColor;
        ctx.beginPath();
        ctx.moveTo(drawX + tileWidth - 2, y + 2);
        ctx.lineTo(drawX + tileWidth - 2, y + tileHeight - 2);
        ctx.lineTo(drawX + 2, y + tileHeight - 2);
        ctx.stroke();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 16;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
};
