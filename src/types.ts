export type Point = { x: number; y: number };

export type EntityType = 'line' | 'circle' | 'rectangle';

export interface CADEntity {
  id: string;
  type: EntityType;
  color: string;
  lineWidth: number;
  layer: string;
  dashed?: boolean;
}

export interface LineEntity extends CADEntity {
  type: 'line';
  start: Point;
  end: Point;
}

export interface CircleEntity extends CADEntity {
  type: 'circle';
  center: Point;
  radius: number;
}

export interface RectEntity extends CADEntity {
  type: 'rectangle';
  p1: Point;
  p2: Point;
}

export type Entity = LineEntity | CircleEntity | RectEntity;
