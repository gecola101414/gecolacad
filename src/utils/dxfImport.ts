import { Entity, Layer, Point } from '../types';

interface DxfRawEntity {
  type: string;
  layer?: string;
  color?: string;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  cx?: number;
  cy?: number;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  text?: string;
  fontSize?: number;
}

// Map AutoCAD Color Index (ACI) to Hex Colors
function aciToHex(aci: number): string {
  switch (aci) {
    case 1: return '#ef4444'; // Red
    case 2: return '#efeb00'; // Yellow
    case 3: return '#10b981'; // Green
    case 4: return '#06b6d4'; // Cyan
    case 5: return '#3b82f6'; // Blue
    case 6: return '#ec4899'; // Magenta
    case 7: return '#000000'; // Black/White
    case 8: return '#64748b'; // Gray
    case 9: return '#94a3b8'; // Light Gray
    default:
      if (aci >= 10 && aci <= 249) {
        // Standard CAD color approximation or cool dark slate
        return '#4f46e5';
      }
      return '#000000';
  }
}

export function parseDXF(
  dxfContent: string,
  activeLayerId: string,
  existingLayers: Layer[]
): { entities: Entity[]; newLayers: Layer[] } {
  const lines = dxfContent.split(/\r?\n/);
  const rawEntities: DxfRawEntity[] = [];
  const foundLayerNames = new Set<string>();

  let current: DxfRawEntity | null = null;
  
  // Read code/value pairs
  const pairs: { code: number; value: string }[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const codeStr = lines[i].trim();
    const valStr = lines[i + 1]?.trim() ?? '';
    
    const code = parseInt(codeStr, 10);
    if (!isNaN(code) && codeStr.length > 0 && /^\d+$/.test(codeStr)) {
      pairs.push({ code, value: valStr });
      i++; // Skip next line because it was consumed as value
    }
  }

  // Parse pairs into entities
  for (const { code, value } of pairs) {
    if (code === 0) {
      if (current) {
        rawEntities.push(current);
      }
      const typeUpper = value.toUpperCase();
      if (['LINE', 'CIRCLE', 'ARC', 'TEXT', 'POINT'].includes(typeUpper)) {
        current = { type: typeUpper };
      } else {
        current = null;
      }
    } else if (current) {
      const floatVal = parseFloat(value);
      switch (code) {
        case 8: // Layer
          current.layer = value;
          foundLayerNames.add(value);
          break;
        case 62: // Color Index
          current.color = aciToHex(parseInt(value, 10));
          break;
        case 10: // Start X / Center X
          current.x1 = floatVal;
          current.cx = floatVal;
          break;
        case 20: // Start Y / Center Y
          current.y1 = floatVal;
          current.cy = floatVal;
          break;
        case 11: // End X
          current.x2 = floatVal;
          break;
        case 21: // End Y
          current.y2 = floatVal;
          break;
        case 40: // Radius / Text height
          current.radius = floatVal;
          current.fontSize = floatVal;
          break;
        case 50: // Start angle (Arc) or rotation (Text)
          current.startAngle = floatVal;
          break;
        case 51: // End angle (Arc)
          current.endAngle = floatVal;
          break;
        case 1: // Text content
          current.text = value;
          break;
      }
    }
  }
  if (current) {
    rawEntities.push(current);
  }

  // Create new layers dynamically for any layers found in DXF that don't exist yet
  const newLayers: Layer[] = [];
  const layerNameToIdMap = new Map<string, string>();

  // Map existing layers
  existingLayers.forEach(l => {
    layerNameToIdMap.set(l.name.toLowerCase(), l.id);
  });

  foundLayerNames.forEach(name => {
    const lower = name.toLowerCase();
    if (!layerNameToIdMap.has(lower)) {
      const id = `layer_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const newLayer: Layer = {
        id,
        name,
        visible: true,
        frozen: false
      };
      newLayers.push(newLayer);
      layerNameToIdMap.set(lower, id);
    }
  });

  // Convert raw entities to CADEntity format
  const entities: Entity[] = [];

  for (const raw of rawEntities) {
    const layerId = raw.layer ? (layerNameToIdMap.get(raw.layer.toLowerCase()) || activeLayerId) : activeLayerId;
    const common = {
      id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      color: raw.color || '#000000',
      lineWidth: 1.5,
      layer: layerId,
      mode: 'pencil' as const,
    };

    if (raw.type === 'LINE') {
      const x1 = raw.x1 ?? 0;
      const y1 = raw.y1 ?? 0;
      const x2 = raw.x2 ?? 0;
      const y2 = raw.y2 ?? 0;

      entities.push({
        ...common,
        type: 'line',
        start: { x: x1, y: -y1 }, // Reverse Y-coordinate back to Canvas space
        end: { x: x2, y: -y2 },
      });
    } else if (raw.type === 'CIRCLE') {
      const cx = raw.cx ?? 0;
      const cy = raw.cy ?? 0;
      const radius = raw.radius ?? 10;

      entities.push({
        ...common,
        type: 'circle',
        center: { x: cx, y: -cy },
        radius,
      });
    } else if (raw.type === 'ARC') {
      const cx = raw.cx ?? 0;
      const cy = raw.cy ?? 0;
      const radius = raw.radius ?? 10;
      // Invert angles back since export was drawingArc coordinates flipped
      const rawStart = raw.startAngle ?? 0;
      const rawEnd = raw.endAngle ?? 0;
      
      const startAngle = (360 - rawEnd) % 360;
      const endAngle = (360 - rawStart) % 360;

      entities.push({
        ...common,
        type: 'arc',
        center: { x: cx, y: -cy },
        radius,
        startAngle: startAngle < 0 ? startAngle + 360 : startAngle,
        endAngle: endAngle < 0 ? endAngle + 360 : endAngle,
      });
    } else if (raw.type === 'POINT') {
      const cx = raw.cx ?? 0;
      const cy = raw.cy ?? 0;

      entities.push({
        ...common,
        type: 'point',
        point: { x: cx, y: -cy },
      });
    } else if (raw.type === 'TEXT') {
      const cx = raw.cx ?? 0;
      const cy = raw.cy ?? 0;
      const text = raw.text || 'Testo';
      const fontSize = raw.fontSize || 14;

      entities.push({
        ...common,
        type: 'text',
        point: { x: cx, y: -cy },
        text,
        fontFamily: 'sans-serif',
        fontSize,
        fontWeight: 'normal',
        textAlign: 'left',
      });
    }
  }

  return { entities, newLayers };
}
