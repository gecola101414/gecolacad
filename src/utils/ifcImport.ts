import { Entity, Point } from '../types';

interface IFCLine {
  id: number;
  className: string;
  args: string[];
}

export function parseIFCContent(content: string): Entity[] {
  // 1. Preprocess: remove comments, replace newlines/tabs with space
  const noComments = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/[\r\n\t]+/g, ' ');
  
  // 2. Extract lines inside DATA section
  const dataMatch = /DATA;\s*([\s\S]*?)\s*ENDSEC;/i.exec(noComments);
  if (!dataMatch) {
    throw new Error("Sezione DATA non trovata nel file IFC.");
  }
  const dataSec = dataMatch[1];

  // 3. Split by semicolon to get STEP statements
  const statements = dataSec.split(';');
  const lineMap = new Map<number, IFCLine>();

  statements.forEach(stmt => {
    const trimmed = stmt.trim();
    if (!trimmed) return;

    // Format: #ID = CLASS (ARGS)
    const match = /^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\((.*)\)$/i.exec(trimmed);
    if (!match) return;

    const id = parseInt(match[1]);
    const className = match[2].toUpperCase();
    const argsStr = match[3];

    // Simple top-level comma splitter that respects nested parentheses/quotes
    const args: string[] = [];
    let current = '';
    let parenCount = 0;
    let inQuote = false;

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];
      if (char === "'") {
        inQuote = !inQuote;
        current += char;
      } else if (inQuote) {
        current += char;
      } else if (char === '(') {
        parenCount++;
        current += char;
      } else if (char === ')') {
        parenCount--;
        current += char;
      } else if (char === ',' && parenCount === 0) {
        args.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) {
      args.push(current.trim());
    }

    lineMap.set(id, { id, className, args });
  });

  // Determine scale factor to centimeters
  let lengthFactorToCm = 0.1; // Default to assuming millimeters (mm -> cm = *0.1)
  lineMap.forEach((line) => {
    if (line.className === 'IFCSIUNIT' && line.args[1] === '.LENGTHUNIT.') {
      // args[2] is the prefix. '.MILLI.' means mm, empty '$' means meters
      if (line.args[2] === '$') {
        lengthFactorToCm = 100; // meters to cm
      } else if (line.args[2] === '.CENTI.') {
        lengthFactorToCm = 1;
      } else if (line.args[2] === '.MILLI.') {
        lengthFactorToCm = 0.1;
      }
    }
  });

  // Helper functions for parsing STEP parameter formats
  const parseRef = (v: string): number | null => {
    if (!v || !v.trim().startsWith('#')) return null;
    return parseInt(v.trim().substring(1));
  };

  const parseRefList = (v: string): number[] => {
    if (!v) return [];
    // Format: (#12,#13,#14) -> [12, 13, 14]
    const match = /^\s*\((.*)\)\s*$/.exec(v);
    if (!match) return [];
    return match[1].split(',').map(s => parseRef(s.trim())).filter(Boolean) as number[];
  };

  const parseNumberList = (v: string): number[] => {
    if (!v) return [];
    // Format: (100.0,200.0,300.0) or (100.0,200.0) -> [100.0, 200.0, 300.0]
    const match = /^\s*\((.*)\)\s*$/.exec(v);
    if (!match) return [];
    return match[1].split(',').map(s => {
      // Strip trailing unit symbols/periods
      const numStr = s.trim().replace(/\.$/, '.0');
      return parseFloat(numStr);
    }).filter(n => !isNaN(n));
  };

  const parseString = (v: string): string => {
    if (!v) return '';
    // Strip surrounding single quotes e.g. 'Project' -> Project
    const match = /^\s*'(.*)'\s*$/.exec(v);
    return match ? match[1] : v;
  };

  // Trace geometric coordinates for an Extruded Area Solid profile loops
  const resolvePointsFromProfile = (profileId: number): Point[] => {
    const profile = lineMap.get(profileId);
    if (!profile) return [];

    if (profile.className === 'IFCARBITRARYCLOSEDPROFILEDEF') {
      const outerCurveId = parseRef(profile.args[2]);
      if (outerCurveId !== null) {
        return resolvePointsFromCurve(outerCurveId);
      }
    } else if (profile.className === 'IFCRECTANGLEPROFILEDEF') {
      const xDimVal = parseFloat(profile.args[3]) || 1;
      const yDimVal = parseFloat(profile.args[4]) || 1;
      const xCm = xDimVal * lengthFactorToCm;
      const yCm = yDimVal * lengthFactorToCm;
      return [
        { x: -xCm/2, y: -yCm/2 },
        { x: xCm/2, y: -yCm/2 },
        { x: xCm/2, y: yCm/2 },
        { x: -xCm/2, y: yCm/2 }
      ];
    } else if (profile.className === 'IFCISHAPEPROFILEDEF') {
      const xDimVal = parseFloat(profile.args[3]) || 0.2; // overall width
      const yDimVal = parseFloat(profile.args[4]) || 0.2; // overall depth
      const twVal = parseFloat(profile.args[5]) || 0.01; // web thickness
      const tfVal = parseFloat(profile.args[6]) || 0.015; // flange thickness
      
      const xCm = xDimVal * lengthFactorToCm;
      const yCm = yDimVal * lengthFactorToCm;
      const twCm = twVal * lengthFactorToCm;
      const tfCm = tfVal * lengthFactorToCm;
      
      return [
        { x: -xCm/2, y: -yCm/2 },
        { x: xCm/2, y: -yCm/2 },
        { x: xCm/2, y: -yCm/2 + tfCm },
        { x: twCm/2, y: -yCm/2 + tfCm },
        { x: twCm/2, y: yCm/2 - tfCm },
        { x: xCm/2, y: yCm/2 - tfCm },
        { x: xCm/2, y: yCm/2 },
        { x: -xCm/2, y: yCm/2 },
        { x: -xCm/2, y: yCm/2 - tfCm },
        { x: -twCm/2, y: yCm/2 - tfCm },
        { x: -twCm/2, y: -yCm/2 + tfCm },
        { x: -xCm/2, y: -yCm/2 + tfCm }
      ];
    }
    return [];
  };

  const resolvePointsFromCurve = (curveId: number): Point[] => {
    const curve = lineMap.get(curveId);
    if (!curve) return [];

    if (curve.className === 'IFCPOLYLINE') {
      const ptRefs = parseRefList(curve.args[0]);
      const pts: Point[] = [];
      ptRefs.forEach(refId => {
        const ptLine = lineMap.get(refId);
        if (ptLine && ptLine.className === 'IFCCARTESIANPOINT') {
          const coords = parseNumberList(ptLine.args[0]);
          if (coords.length >= 2) {
            // Map coordinates back: scale based on IFC unit factor, flip Y back to positive/negative y
            pts.push({
              x: (coords[0] || 0) * lengthFactorToCm,
              y: -(coords[1] || 0) * lengthFactorToCm
            });
          }
        }
      });
      return pts;
    } else if (curve.className === 'IFCCOMPOSITECURVE') {
      const segRefs = parseRefList(curve.args[0]);
      const pts: Point[] = [];
      segRefs.forEach(segRefId => {
        pts.push(...resolvePointsFromCurve(segRefId));
      });
      return pts;
    } else if (curve.className === 'IFCCOMPOSITECURVESEGMENT') {
      const subCurveId = parseRef(curve.args[2]);
      if (subCurveId !== null) {
        return resolvePointsFromCurve(subCurveId);
      }
    }
    return [];
  };

  // Helper to recursively compute the absolute position from IFCLOCALPLACEMENT
  const resolveAbsolutePlacement = (placementId: number): { x: number, y: number, z: number } => {
    let pos = { x: 0, y: 0, z: 0 };
    let currentId: number | null = placementId;
    
    while (currentId !== null) {
      const placement = lineMap.get(currentId);
      if (!placement) break;
      
      if (placement.className === 'IFCLOCALPLACEMENT') {
        const parentId = parseRef(placement.args[0]);
        const axisId = parseRef(placement.args[1]);
        
        if (axisId !== null) {
          const axis = lineMap.get(axisId);
          if (axis && axis.className === 'IFCAXIS2PLACEMENT3D') {
            const ptId = parseRef(axis.args[0]);
            if (ptId !== null) {
              const pt = lineMap.get(ptId);
              if (pt && pt.className === 'IFCCARTESIANPOINT') {
                const coords = parseNumberList(pt.args[0]);
                pos.x += (coords[0] || 0);
                pos.y += (coords[1] || 0);
                pos.z += (coords[2] || 0);
              }
            }
          }
        }
        currentId = parentId;
      } else {
        break;
      }
    }
    return pos;
  };

  // Build entities from parsed lines
  const importedEntities: Entity[] = [];

  // Iterate over all IFC physical elements:
  // e.g., IFCWALL, IFCDOOR, IFCWINDOW, IFCSLAB, etc.
  lineMap.forEach((line) => {
    const isBimElement = [
      'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCDOOR', 'IFCWINDOW', 'IFCSLAB', 
      'IFCBUILDINGELEMENTPROXY', 'IFCCOVERING', 'IFCCOLUMNS', 'IFCBEAMS', 'IFCFURNISHINGELEMENT', 'IFCSPACE',
      'IFCBEAM'
    ].includes(line.className);

    if (!isBimElement) return;

    // Parse entity components based on standard mapping
    // e.g., #26=IFCWALL('GUID',$,'Muro',$,$,#19,#25,$,$)
    const guid = parseString(line.args[0]) || `imported-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const name = parseString(line.args[2]) || 'BIM Element';
    const axisId = parseRef(line.args[5]);
    const shapeId = parseRef(line.args[6]);

    let heightCm = 270;
    let baseZElevationCm = 0;
    let baseZPlaneCm = 0;
    let points: Point[] = [];
    let absolutePos = { x: 0, y: 0, z: 0 };

    // Resolve base Z elevation & position from axis placement (IFCLOCALPLACEMENT)
    if (axisId !== null) {
      absolutePos = resolveAbsolutePlacement(axisId);
      baseZElevationCm = absolutePos.z * lengthFactorToCm;
    }

    // Helper to find IFCEXTRUDEDAREASOLID
    const findExtrudedSolidId = (startId: number): number | null => {
      const line = lineMap.get(startId);
      if (!line) return null;
      if (line.className === 'IFCEXTRUDEDAREASOLID') return startId;
      if (line.className === 'IFCBOUNDINGBOX') return startId;
      if (line.className === 'IFCBOOLEANCLIPPINGRESULT') {
        // usually arg[1] is the first operand (the solid to be clipped)
        const operandId = parseRef(line.args[1]);
        if (operandId !== null) return findExtrudedSolidId(operandId);
      }
      return null;
    };

    // Resolve profile geom and height from shape representation (IFCPRODUCTDEFINITIONSHAPE)
    if (shapeId !== null) {
      const shapeDef = lineMap.get(shapeId);
      if (shapeDef && shapeDef.className === 'IFCPRODUCTDEFINITIONSHAPE') {
        const repIdRefs = parseRefList(shapeDef.args[2]);
        repIdRefs.forEach(repId => {
          const repLine = lineMap.get(repId);
          if (repLine && repLine.className === 'IFCSHAPEREPRESENTATION') {
            const itemRefs = parseRefList(repLine.args[3]);
            itemRefs.forEach(itemId => {
              const targetSolidId = findExtrudedSolidId(itemId);
              if (targetSolidId !== null) {
                const itemLine = lineMap.get(targetSolidId);
                if (itemLine) {
                  if (itemLine.className === 'IFCEXTRUDEDAREASOLID') {
                    // Resolve shape height in cm
                    const heightVal = parseFloat(itemLine.args[3]);
                    if (!isNaN(heightVal)) {
                      heightCm = heightVal * lengthFactorToCm;
                    }
                    // Resolve extrusion profile
                    const profileRef = parseRef(itemLine.args[0]);
                    if (profileRef !== null) {
                      points = resolvePointsFromProfile(profileRef);
                      // Apply absolute placement transformation
                      points = points.map(p => ({
                        x: p.x + (absolutePos.x * lengthFactorToCm),
                        y: p.y - (absolutePos.y * lengthFactorToCm) // Y is flipped in 2D canvas
                      }));
                    }
                  } else if (itemLine.className === 'IFCBOUNDINGBOX') {
                    // Fallback for simple bounding boxes
                    const ptRef = parseRef(itemLine.args[0]);
                    let bx = 0, by = 0;
                    if (ptRef !== null) {
                      const ptLine = lineMap.get(ptRef);
                      if (ptLine && ptLine.className === 'IFCCARTESIANPOINT') {
                        const c = parseNumberList(ptLine.args[0]);
                        if (c.length >= 3) {
                          bx = (c[0] || 0) * lengthFactorToCm;
                          by = -(c[1] || 0) * lengthFactorToCm;
                          baseZElevationCm = (c[2] || 0) * lengthFactorToCm;
                        }
                      }
                    }
                    const xDim = parseFloat(itemLine.args[1]) * lengthFactorToCm || 100;
                    const yDim = parseFloat(itemLine.args[2]) * lengthFactorToCm || 100;
                    const zDim = parseFloat(itemLine.args[3]) * lengthFactorToCm || 270;
                    heightCm = zDim;

                    bx += (absolutePos.x * lengthFactorToCm);
                    by -= (absolutePos.y * lengthFactorToCm);

                    points = [
                      { x: bx - xDim/2, y: by - yDim/2 },
                      { x: bx + xDim/2, y: by - yDim/2 },
                      { x: bx + xDim/2, y: by + yDim/2 },
                      { x: bx - xDim/2, y: by + yDim/2 },
                    ];
                  }
                }
              }
            });
          }
        });
      }
    }

    // Determine the bim family/type based on className
    let bimType: 'wall' | 'door' | 'window' | 'element' = 'element';
    let layerName = 'BIM_Elementi';
    let defaultColor = '#3b82f6';
    let pattern: 'SOLID' | 'ANSI31' | 'CROSS' | 'NONE' = 'SOLID';

    if (line.className === 'IFCWALL' || line.className === 'IFCWALLSTANDARDCASE') {
      bimType = 'wall';
      layerName = 'BIM_Partizioni';
      defaultColor = '#94a3b8'; // slate color
      pattern = 'SOLID';
    } else if (line.className === 'IFCDOOR') {
      bimType = 'door';
      layerName = 'BIM_Infissi';
      defaultColor = '#a855f7'; // Purple
      pattern = 'NONE';
    } else if (line.className === 'IFCWINDOW') {
      bimType = 'window';
      layerName = 'BIM_Infissi';
      defaultColor = '#adfa1d'; // Lime Green
      pattern = 'NONE';
    } else if (line.className === 'IFCSPACE') {
      layerName = 'BIM_Vani';
      defaultColor = '#f59e0b';
      pattern = 'ANSI31';
    } else if (line.className === 'IFCBEAM' || line.className === 'IFCBEAMS') {
      layerName = 'BIM_Strutture';
      defaultColor = '#dc2626'; // Red for Beams
      pattern = 'SOLID';
    } else if (line.className === 'IFCSLAB') {
      layerName = 'BIM_Solai';
      defaultColor = '#0d9488'; // Teal for Slabs
      pattern = 'CROSS';
    }

    // Ensure the points loop doesn't contain a duplicate ending node in 2D array representation
    if (points.length >= 3) {
      const first = points[0];
      const last = points[points.length - 1];
      if (Math.abs(first.x - last.x) < 0.1 && Math.abs(first.y - last.y) < 0.1) {
        points.pop();
      }
    }

    // Construct entity
    const newId = `imported-${bimType}-${Math.random().toString(36).substring(2, 9)}`;
    const bimData = {
      guid: guid,
      ifc_class: line.className.charAt(0) + line.className.slice(1).toLowerCase(),
      identity: {
        name: name,
        description: 'Oggetto importato da file IFC'
      },
      geometry_parameters: {
        height: heightCm,
        width: 15,
        rotation: 0
      },
      properties: {
        dimensions: {
          thickness: 15,
          width: 80,
          height: heightCm
        },
        analytical: {},
        cost_5d: {},
        facility_7d: {}
      },
      relations: []
    };

    if (bimType === 'door' || bimType === 'window') {
      // Create a nice responsive Point entity / single placement representation
      let cx = 0, cy = 0;
      if (points.length > 0) {
        const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
        cx = sum.x / points.length;
        cy = sum.y / points.length;
      }
      
      const width = points.length >= 2 ? Math.round(Math.sqrt(Math.pow(points[0].x - points[1].x, 2) + Math.pow(points[0].y - points[1].y, 2)) * 10) / 10 : 80;

      importedEntities.push({
        id: newId,
        type: 'point',
        point: { x: cx, y: cy },
        color: defaultColor,
        strokeWidth: 2,
        layer: layerName,
        isBIM: true,
        bimType,
        bimName: name,
        backgroundColor: defaultColor,
        bimHeight: heightCm,
        height: heightCm,
        bimWidth: width || 80,
        bimZPlane: baseZPlaneCm,
        bimZElevation: baseZElevationCm,
        bimHatchPattern: 'NONE',
        bimData: bimData
      } as any);
    } else {
      // Create a beautiful Hatch / Polygon Entity representing the wall/covering
      if (points.length >= 3) {
        importedEntities.push({
          id: newId,
          type: 'hatch',
          points: points,
          layer: layerName,
          color: defaultColor,
          strokeWidth: 1,
          isBIM: true,
          bimType: bimType,
          bimFamily: line.className,
          bimName: name,
          backgroundColor: defaultColor,
          bimHatchPattern: pattern,
          pattern: pattern,
          height: heightCm,
          bimHeight: heightCm,
          bimZPlane: baseZPlaneCm,
          bimZElevation: baseZElevationCm,
          bimPoints: points,
          bimData: bimData
        } as any);
      }
    }
  });

  // Recenter imported entities to the origin
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasPoints = false;
  
  importedEntities.forEach(ent => {
    if ((ent as any).points) {
      (ent as any).points.forEach((p: any) => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
        hasPoints = true;
      });
    }
  });

  if (hasPoints) {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    importedEntities.forEach(ent => {
      if ((ent as any).points) {
        (ent as any).points = (ent as any).points.map((p: any) => ({
          x: p.x - cx,
          y: p.y - cy
        }));
      }
    });
  }

  return importedEntities;
}
