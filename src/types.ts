export type Point = { x: number; y: number };

export interface InkPoint {
  x: number;
  y: number;
  width: number;
  alpha: number;
}

export type BIMRenderingStyle = 'none' | 'calcestruzzo' | 'mattone_portante' | 'tramezzo' | 'solaio_pignatte' | 'ponteggio' | 'mantovana';

export interface BIMObject {
  guid: string;
  ifc_class: string;
  identity: {
    name: string;
    description: string;
  };
  geometry_parameters: Record<string, any>;
  properties: {
    dimensions: Record<string, any>;
    analytical: Record<string, any>;
    cost_5d: {
      prezzarioCodice?: string;
      prezzarioDescrizione?: string;
      prezzarioUnita?: string;
      prezzarioPrezzo?: number;
      incidenzaManodopera?: number;
      prezzarioNome?: string;
      [key: string]: any;
    };
    facility_7d: Record<string, any>;
  };
  relations: string[];
  renderingStyle?: BIMRenderingStyle;
}

export type EntityType = 'line' | 'circle' | 'rectangle' | 'dimension' | 'arc' | 'point' | 'text' | 'hatch' | 'image' | 'bim-csg' | 'camera';

export interface CADEntity {
  id: string;
  type: EntityType;
  color: string;
  lineWidth: number;
  layer: string;
  dashed?: boolean;
  lineType?: 'continuous' | 'dashed' | 'dotted' | 'dashdot' | 'dashdash';
  isFilo?: boolean;
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
  // BIM-specific
  bimData?: BIMObject;
  renderingStyle?: BIMRenderingStyle;
  isBIM?: boolean;
  isVisible?: boolean;  // BIM-specific visibility state
  isFrozen?: boolean;   // BIM-specific frozen state
  width?: number;
  height?: number;
  parentEntityId?: string;

  /** @deprecated Use bimData instead */
  bimType?: 'room' | 'door' | 'window' | 'wall' | 'electrical_symbol' | 'hydraulic_symbol' | 'functional_area' | 'bim_element' | 'element';
  /** @deprecated Use bimData instead */
  bimAreaType?: string;
  /** @deprecated Use bimData instead */
  bimFamily?: string;
  /** @deprecated Use bimData instead */
  bimSubFamily?: string;
  /** @deprecated Use bimData instead */
  bimName?: string;
  /** @deprecated Use bimData instead */
  bimHeight?: number;
  /** @deprecated Use bimData instead */
  bimWidth?: number;
  /** @deprecated Use bimData instead */
  bimWindowHeight?: number;
  /** @deprecated Use bimData instead */
  bimPoints?: Point[];
  /** @deprecated Use bimData instead */
  bimOffset?: number;
  /** @deprecated Use bimData instead */
  backgroundColor?: string;
  /** @deprecated Use bimData instead */
  bimHatchPattern?: string; 
  /** @deprecated Use bimData instead */
  bimRenderMode?: 'solid' | 'transparent' | 'parete_verticale' | 'parete_orizzontale';
  /** @deprecated Use bimData instead */
  bimDescription?: string;
  /** @deprecated Use bimData instead */
  bimMarmo?: string;
  /** @deprecated Use bimData instead */
  bimTrasmittanza?: number;
  /** @deprecated Use bimData instead */
  hideIn2D?: boolean;
  isLinear?: boolean;
  isFaceAligned?: boolean;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  hasMantovana?: boolean;
  mantovanaAngle?: number;
  mantovanaHeight?: number;
  teloLato?: 'none' | 'esterno' | 'interno' | 'entrambi';
  tavoleFermapiedeCount?: number;
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
  scale?: number;     // specific scale if overridden
  decimals?: number;  // custom decimal digits
  extAhead?: number;  // custom extension line ahead length (beyond dimension line)
  extBehind?: number; // custom extension line behind length (gap from snap points)
  includeInComputo?: boolean;
  prezzarioCodice?: string;
  prezzarioDescrizione?: string;
  prezzarioUnita?: string;
  prezzarioPrezzo?: number;
  moltiplicatore?: number;
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
  isLinear?: boolean;
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

export interface CameraEntity extends CADEntity {
  type: 'camera';
  point: Point;
  angle: number;
}

export type Entity = LineEntity | CircleEntity | RectEntity | DimensionEntity | ArcEntity | PointEntity | TextEntity | HatchEntity | ImageEntity | CSGMeshEntity | CameraEntity;

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
  gridType?: 'none' | '1cm' | '10cm' | '100cm';
  gridColor?: string;
}

export interface PrezzarioItem {
  codice: string;
  descrizione: string;
  unita: string;
  prezzo: number;
  categoria: string;
  incidenzaManodopera?: number;
  prezzario?: string;
  bimFamilyId?: string; // Links this item to a specific BIM Family's mini-listino
}

export interface Floor {
  id: string;
  name: string;
  elevation: number; // in centimeters (Z Base)
  type: 'fuori_terra' | 'interrato';
  visibleInPlan?: boolean;
}
