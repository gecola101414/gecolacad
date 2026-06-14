export type Point = { x: number; y: number };

export interface InkPoint {
  x: number;
  y: number;
  width: number;
  alpha: number;
}

export type EntityType = 'line' | 'circle' | 'rectangle' | 'dimension' | 'arc' | 'point' | 'text' | 'hatch' | 'image' | 'bim-csg';

export interface CADEntity {
  id: string;
  type: EntityType;
  color: string;
  lineWidth: number;
  layer: string;
  dashed?: boolean;
  mode?: 'ink' | 'pencil' | 'CAD';
  groupId?: string;
  templateId?: string;
  parentLineId?: string;
  opacity?: number;
  raccordoMetadata?: {
    id1: string;
    id2: string;
    originalLine1: any;
    originalLine2: any;
    clickPt1: { x: number; y: number };
    clickPt2: { x: number; y: number };
    config: { type: 'curvo' | 'rettilineo' | 'taglia'; value: number };
  };
  isBIM?: boolean;
  bimType?: 'room' | 'door' | 'window' | 'wall' | 'electrical_symbol' | 'hydraulic_symbol' | 'functional_area';
  bimAreaType?: 'stanza' | 'muro' | 'tramezzo' | 'giardino' | 'tetto' | 'altro';
  bimName?: string;
  bimHeight?: number; // e.g. 2.70
  bimWidth?: number;  // e.g. 80, 90, 120
  bimWindowHeight?: number; // e.g. 140
  bimPoints?: Point[]; // Polygon corners For rooms/areas
  bimOffset?: number; // Offset for positioning
  backgroundColor?: string; // Fill color for functional areas
  bimHatchPattern?: 'SOLID' | 'ANSI31' | 'CROSS' | 'NONE'; 
  bimDescription?: string;
  bimMarmo?: string;
  bimTrasmittanza?: number;
  hideIn2D?: boolean;
}

export interface LineEntity extends CADEntity {
  type: 'line';
  start: Point;
  end: Point;
  inkPoints?: InkPoint[];
  isFreehand?: boolean;
}

export interface CircleEntity extends CADEntity {
  type: 'circle';
  center: Point;
  radius: number;
}

export interface ArcEntity extends CADEntity {
  type: 'arc';
  center: Point;
  radius: number;
  startAngle: number;
  endAngle: number;
}

export interface PointEntity extends CADEntity {
  type: 'point';
  point: Point;
}

export interface RectEntity extends CADEntity {
  type: 'rectangle';
  p1: Point;
  p2: Point;
}

export interface DimensionEntity extends CADEntity {
  type: 'dimension';
  start: Point;
  end: Point;
  offset: number;
  style: number;
  customText?: string;
  rotation?: number; // In degrees
}

export interface TextEntity extends CADEntity {
  type: 'text';
  point: Point;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  textAlign: 'left' | 'center' | 'right' | 'justify';
}

export interface HatchEntity extends CADEntity {
  type: 'hatch';
  pattern: string;
  scale: number;
  angle: number; // in degrees
  points: Point[]; // Polygon boundary
  holes?: Point[][]; // Inner boundaries (holes)
  backgroundColor?: string;
  sfumatura?: number;
}

export interface ImageEntity extends CADEntity {
  type: 'image';
  point: Point;
  width: number;
  height: number;
  src: string;
  mediaType?: 'image' | 'video' | 'audio' | 'pdf';
  name?: string;
  angle?: number;
  aspectRatio?: number;
  opacity?: number;
  brightness?: number; // percentage (default 100)
  contrast?: number; // percentage (default 100)
  blendMode?: 'normal' | 'multiply'; // multiply is great for making white background transparent
  crop?: { top?: number, right?: number, bottom?: number, left?: number }; // Cropping support (percentages 0-100)
  traceResolution?: number; // max resolution for tracing
  traceSimplify?: number; // simplification tolerance
  traceSmooth?: boolean; // smooth contours vs sharp
}

export interface CSGMeshEntity extends CADEntity {
  type: 'bim-csg';
  geometryData: {
    positions: Float32Array | number[];
    normals: Float32Array | number[];
    uvs?: Float32Array | number[];
    indices?: Uint32Array | Uint16Array | number[];
  };
}

export type Entity = LineEntity | CircleEntity | RectEntity | DimensionEntity | ArcEntity | PointEntity | TextEntity | HatchEntity | ImageEntity | CSGMeshEntity;

export interface Measurement {
  id: string;
  entityId: string;
  value: number;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  frozen: boolean;
}

export interface TavolaData {
  progetto: string;
  titolo: string;
  autore: string;
  data: string;
}

export interface Tavola {
  id: string;
  name: string;
  format: 'A0' | 'A1' | 'A2' | 'A3' | 'A4';
  scale: number;
  unit: 'm' | 'cm' | 'mm';
  position: { x: number; y: number };
  visible: boolean;
  datiCartiglio: TavolaData;
  measuredCalibrationMm?: number;
}
