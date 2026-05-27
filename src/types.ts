export type Point = { x: number; y: number };

export interface InkPoint {
  x: number;
  y: number;
  width: number;
  alpha: number;
}

export type EntityType = 'line' | 'circle' | 'rectangle' | 'dimension' | 'arc' | 'point';

export interface CADEntity {
  id: string;
  type: EntityType;
  color: string;
  lineWidth: number;
  layer: string;
  dashed?: boolean;
  mode: 'ink' | 'pencil';
  groupId?: string;
}

export interface LineEntity extends CADEntity {
  type: 'line';
  start: Point;
  end: Point;
  inkPoints?: InkPoint[];
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

export type Entity = LineEntity | CircleEntity | RectEntity | DimensionEntity | ArcEntity | PointEntity;

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
