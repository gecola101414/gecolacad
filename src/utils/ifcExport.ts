import { Entity, Point, RectEntity } from '../types';
import { mapLegacyDataToBIMObject } from './ifcMapper';
import { saveAs } from 'file-saver';

export function exportEntitiesToIFC(entities: Entity[]) {
  const exportItems = entities.map(entity => {
    const bimData = mapLegacyDataToBIMObject(entity);
    if (!bimData) return null;
    return {
      entity,
      bimData
    };
  }).filter(Boolean) as { entity: Entity; bimData: any }[];
  
  if (exportItems.length === 0) {
    alert("Nessun elemento BIM trovato da esportare.");
    return;
  }

  const ifcContent = generateIFCContent(exportItems);
  const blob = new Blob([ifcContent], { type: 'text/plain;charset=utf-8' });
  saveAs(blob, 'export.ifc');
}

function getPolyPoints(entity: Entity): Point[] {
  let points: Point[] = [];
  
  if (entity.type === 'line') {
    const start = entity.start;
    const end = entity.end;
    const w = (entity as any).bimWidth || (entity as any).width || 15; // default thickness in cm
    
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    
    if (len > 0) {
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy; // Normal vector
      const ny = ux;
      
      const p1 = { x: start.x - nx * w/2, y: start.y - ny * w/2 };
      const p2 = { x: start.x + nx * w/2, y: start.y + ny * w/2 };
      const p3 = { x: end.x + nx * w/2, y: end.y + ny * w/2 };
      const p4 = { x: end.x - nx * w/2, y: end.y - ny * w/2 };
      
      points = [p1, p2, p3, p4];
    } else {
      points = [start];
    }
  } else if (entity.type === 'rectangle') {
    const r = entity as RectEntity;
    points = [
      r.p1,
      { x: r.p2.x, y: r.p1.y },
      r.p2,
      { x: r.p1.x, y: r.p2.y }
    ];
  } else if (entity.type === 'point' || (entity as any).bimType === 'door' || (entity as any).bimType === 'window') {
    const cx = (entity as any).point?.x || 0;
    const cy = (entity as any).point?.y || 0;
    const w = (entity as any).bimWidth || (entity as any).width || 80;
    const d = 15; // default depth in cm
    const angle = ((entity as any).rotation || 0) * Math.PI / 180;
    
    const localPts = [
      { x: -w/2, y: -d/2 },
      { x: w/2, y: -d/2 },
      { x: w/2, y: d/2 },
      { x: -w/2, y: d/2 }
    ];
    
    points = localPts.map(p => ({
      x: cx + p.x * Math.cos(angle) - p.y * Math.sin(angle),
      y: cy + p.x * Math.sin(angle) + p.y * Math.cos(angle)
    }));
  } else {
    points = (entity as any).points || (entity as any).bimPoints || [];
  }
  
  // Scale from centimeters to millimeters (IFC standard lengths are millimeters when using Millimetre prefix), map Y to -Y
  let outputPoints = points.map(pt => ({
    x: pt.x * 10,
    y: -pt.y * 10
  }));
  
  // Clean up coordinate precision to 1 decimal place
  outputPoints = outputPoints.map(pt => ({
    x: Math.round(pt.x * 10) / 10,
    y: Math.round(pt.y * 10) / 10
  }));
  
  // Ensure the polyline forms a closed loop for IFCARBITRARYCLOSEDPROFILEDEF
  if (outputPoints.length >= 2) {
    const first = outputPoints[0];
    const last = outputPoints[outputPoints.length - 1];
    if (first.x !== last.x || first.y !== last.y) {
      outputPoints.push({ x: first.x, y: first.y });
    }
  }
  
  return outputPoints;
}

function generateIFCContent(exportItems: { entity: Entity; bimData: any }[]): string {
  const now = new Date().toISOString();
  
  // Header
  let content = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('export.ifc','${now}',('Author'),('Organization'),'PreProcessorVersion','OriginatingSystem','Authorization');
FILE_SCHEMA(('IFC2X3'));
ENDSEC;
DATA;
/* --- Structure --- */
#1=IFCPROJECT('0yL_123456789',$,'Progetto BIM',$,$,$,$,(#8),#11);
#2=IFCSITE('0sL_123456789',$,'Sito',$,$,$,$,$,.ELEMENT.,$,$,$,$,$);
#3=IFCBUILDING('0bL_123456789',$,'Edificio',$,$,$,$,$,.ELEMENT.,$,$,$);
#4=IFCBUILDINGSTOREY('0tL_123456789',$,'Piano Terra',$,$,$,$,$,.ELEMENT.,0.);
#5=IFCRELAGGREGATES('0r1_123456789',$,$,$,#1,(#2));
#6=IFCRELAGGREGATES('0r2_123456789',$,$,$,#2,(#3));
#7=IFCRELAGGREGATES('0r3_123456789',$,$,$,#3,(#4));
#8=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,*,*);
#9=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#10=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);
#11=IFCUNITASSIGNMENT((#9,#10));

/* --- Elements --- */
`;

  let elementCounter = 12;
  const elementIDs: number[] = [];

  // Generate Element Entities with high-fidelity extrusion geometries
  exportItems.forEach(({ entity, bimData }) => {
    const polyPoints = getPolyPoints(entity);
    if (polyPoints.length < 3) {
      // Skip coordinates with insufficient vertices to form a 2D profile
      return;
    }

    const baseElevation = ((entity as any).bimZPlane || 0) + ((entity as any).bimZElevation || 0);
    const elevationInMm = baseElevation * 10;
    const heightInMm = ((entity as any).bimHeight || (entity as any).height || 270) * 10;

    // 1. Generate Cartesian Points for the footprint polyline
    const polyPtIds: number[] = [];
    polyPoints.forEach((pt) => {
      const ptId = elementCounter++;
      content += `#${ptId}=IFCCARTESIANPOINT((${pt.x.toFixed(1)},${pt.y.toFixed(1)}));\n`;
      polyPtIds.push(ptId);
    });

    // 2. Closed IfcPolyline loops for boundary
    const polylineId = elementCounter++;
    content += `#${polylineId}=IFCPOLYLINE((${polyPtIds.map(id => `#${id}`).join(',')}));\n`;

    // 3. Arbitrary Closed Profile Def
    const profileId = elementCounter++;
    content += `#${profileId}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#${polylineId});\n`;

    // 4. Element Elevation Z placement
    const cartPtElevationId = elementCounter++;
    content += `#${cartPtElevationId}=IFCCARTESIANPOINT((0.,0.,${elevationInMm.toFixed(1)}));\n`;
    
    const axisPlacementId = elementCounter++;
    content += `#${axisPlacementId}=IFCAXIS2PLACEMENT3D(#${cartPtElevationId},$,$);\n`;

    // 5. Solid swept area internal 3D relative placement (0, 0, 0)
    const cartPtZeroId = elementCounter++;
    content += `#${cartPtZeroId}=IFCCARTESIANPOINT((0.,0.,0.));\n`;
    
    const solidPlacementId = elementCounter++;
    content += `#${solidPlacementId}=IFCAXIS2PLACEMENT3D(#${cartPtZeroId},$,$);\n`;

    // 6. Extruded direction vector (0, 0, 1) - Z axis extrusion
    const directionId = elementCounter++;
    content += `#${directionId}=IFCDIRECTION((0.,0.,1.));\n`;

    // 7. Extruded Area Solid
    const solidId = elementCounter++;
    content += `#${solidId}=IFCEXTRUDEDAREASOLID(#${profileId},#${solidPlacementId},#${directionId},${heightInMm.toFixed(1)});\n`;

    // 8. Shape Representation ('SweptSolid' body)
    const shapeRepId = elementCounter++;
    content += `#${shapeRepId}=IFCSHAPEREPRESENTATION(#8,'Body','SweptSolid',(#${solidId}));\n`;

    // 9. Product Definition Shape containing the representation
    const prodShapeId = elementCounter++;
    content += `#${prodShapeId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRepId}));\n`;

    // 10. The main IFC Element
    const elId = elementCounter++;
    content += `#${elId}=${bimData.ifc_class.toUpperCase()}('${bimData.guid}',$,'${bimData.identity.name}',$,$,#${axisPlacementId},#${prodShapeId},$,$);\n`;

    elementIDs.push(elId);
  });

  if (elementIDs.length > 0) {
    // Generate Containment Relationship (Elements aggregated to Storey)
    const relId = elementCounter++;
    const elementsRef = elementIDs.map(id => `#${id}`).join(',');
    content += `#${relId}=IFCRELCONTAINEDINSPATIALSTRUCTURE('0r4_123456789',$,$,$,(${elementsRef}),#4);\n`;
  }

  content += `ENDSEC;
END-ISO-10303-21;`;

  return content;
}
