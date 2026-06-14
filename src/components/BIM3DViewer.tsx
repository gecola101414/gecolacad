import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, OrthographicCamera, Grid, Stars, Float, Text, Html, ContactShadows, Environment, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Entity, Point, LineEntity, RectEntity } from '../types';
import { X, ZoomIn, ZoomOut, RotateCw, Box, Layers, Database, Maximize, Home, Compass, Eye, EyeOff, Info, Settings, MousePointer2, Move, Scissors, Play, Pause, RefreshCw, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Edit, Trash2, Wand2 } from 'lucide-react';
import { AreaFunzionaleDialog, PorteDialog, FinestreDialog } from './BIMDialogs';

interface BIM3DViewerProps {
  entities: Entity[];
  onClose: () => void;
  setEntities: React.Dispatch<React.SetStateAction<Entity[]>> | ((updater: (prev: Entity[]) => Entity[]) => void);
}

const getRoomAreaMq = (roomPoints: Point[]): number => {
  if (!roomPoints || roomPoints.length < 3) return 0;
  let area = 0;
  const len = roomPoints.length;
  for (let i = 0; i < len; i++) {
    const p1 = roomPoints[i];
    const p2 = roomPoints[(i + 1) % len];
    area += (p1.x * p2.y) - (p2.x * p1.y);
  }
  return Math.abs(area) / 2 / 10000;
};

const getRoomPerimeterM = (roomPoints: Point[]): number => {
  if (!roomPoints || roomPoints.length < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < roomPoints.length; i++) {
    const p1 = roomPoints[i];
    const p2 = roomPoints[(i + 1) % roomPoints.length];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    perimeter += Math.sqrt(dx*dx + dy*dy);
  }
  return perimeter / 100;
};

const translateEntityPoints = (ent: any, dx: number, dy: number, dz: number = 0): any => {
  const updated = { ...ent };
  
  if (ent.type === 'line' || ent.type === 'dimension') {
    if (updated.start) updated.start = { x: updated.start.x + dx, y: updated.start.y + dy };
    if (updated.end) updated.end = { x: updated.end.x + dx, y: updated.end.y + dy };
  } else if (ent.type === 'circle' || ent.type === 'arc') {
    if (updated.center) updated.center = { x: updated.center.x + dx, y: updated.center.y + dy };
  } else if (ent.type === 'rectangle') {
    if (updated.p1) updated.p1 = { x: updated.p1.x + dx, y: updated.p1.y + dy };
    if (updated.p2) updated.p2 = { x: updated.p2.x + dx, y: updated.p2.y + dy };
  } else if (ent.type === 'point' || ent.type === 'text' || ent.type === 'image') {
    if (updated.point) updated.point = { x: updated.point.x + dx, y: updated.point.y + dy };
  }
  
  if (updated.points) {
    updated.points = updated.points.map((p: Point) => ({ x: p.x + dx, y: p.y + dy }));
  }
  if (updated.bimPoints) {
    updated.bimPoints = updated.bimPoints.map((p: Point) => ({ x: p.x + dx, y: p.y + dy }));
  }
  if (updated.holes) {
    updated.holes = updated.holes.map((hole: Point[]) => hole.map((p: Point) => ({ x: p.x + dx, y: p.y + dy })));
  }
  
  if (dz !== 0) {
    updated.bimZElevation = (updated.bimZElevation || 0) + dz;
  }
  
  return updated;
};

const CADCubeIcon = ({ 
  highlightFace, 
  isActive 
}: { 
  highlightFace: 'top' | 'bottom' | 'front' | 'back' | 'right' | 'left' | 'all';
  isActive: boolean;
}) => {
  const faceStyle = (face: 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom') => {
    let isFaceHighlighted = highlightFace === face || highlightFace === 'all';
    
    let faceColor = 'bg-slate-100/60 border-slate-300 text-slate-400';
    if (isActive && isFaceHighlighted) {
      if (face === 'top') faceColor = 'bg-rose-500 border-rose-600 shadow-[0_0_8px_rgba(244,63,94,0.7)] text-white';
      else if (face === 'bottom') faceColor = 'bg-amber-500 border-amber-600 shadow-[0_0_8px_rgba(245,158,11,0.7)] text-white';
      else if (face === 'front') faceColor = 'bg-blue-500 border-blue-600 shadow-[0_0_8px_rgba(59,130,246,0.7)] text-white';
      else if (face === 'back') faceColor = 'bg-orange-500 border-orange-600 shadow-[0_0_8px_rgba(249,115,22,0.7)] text-white';
      else if (face === 'right') faceColor = 'bg-emerald-500 border-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.7)] text-white';
      else if (face === 'left') faceColor = 'bg-purple-500 border-purple-600 shadow-[0_0_8px_rgba(168,85,247,0.7)] text-white';
    } else if (isFaceHighlighted) {
      if (face === 'top') faceColor = 'bg-rose-100 border-rose-300 text-rose-600 font-bold';
      else if (face === 'bottom') faceColor = 'bg-amber-100 border-amber-300 text-amber-600 font-bold';
      else if (face === 'front') faceColor = 'bg-blue-100 border-blue-300 text-blue-600 font-bold';
      else if (face === 'back') faceColor = 'bg-orange-100 border-orange-300 text-orange-600 font-bold';
      else if (face === 'right') faceColor = 'bg-emerald-100 border-emerald-300 text-emerald-600 font-bold';
      else if (face === 'left') faceColor = 'bg-purple-100 border-purple-300 text-purple-600 font-bold';
    }
    
    return `absolute w-5 h-5 border rounded-[3px] text-[7px] font-black flex items-center justify-center transition-all duration-300 select-none ${faceColor}`;
  };

  return (
    <div className="w-8 h-8 flex items-center justify-center relative select-none" style={{ perspective: '120px' }}>
      <div 
        className="w-5 h-5 relative transition-transform duration-500 ease-out"
        style={{ 
          transformStyle: 'preserve-3d', 
          transform: 'rotateX(-24deg) rotateY(38deg)' 
        }}
      >
        {/* FRONT */}
        <div style={{ transform: 'rotateY(0deg) translateZ(10px)', transformStyle: 'preserve-3d' }} className={faceStyle('front')}>F</div>
        {/* BACK */}
        <div style={{ transform: 'rotateY(180deg) translateZ(10px)', transformStyle: 'preserve-3d' }} className={faceStyle('back')}>B</div>
        {/* RIGHT */}
        <div style={{ transform: 'rotateY(90deg) translateZ(10px)', transformStyle: 'preserve-3d' }} className={faceStyle('right')}>R</div>
        {/* LEFT */}
        <div style={{ transform: 'rotateY(-90deg) translateZ(10px)', transformStyle: 'preserve-3d' }} className={faceStyle('left')}>L</div>
        {/* TOP */}
        <div style={{ transform: 'rotateX(90deg) translateZ(10px)', transformStyle: 'preserve-3d' }} className={faceStyle('top')}>T</div>
        {/* BOTTOM */}
        <div style={{ transform: 'rotateX(-90deg) translateZ(10px)', transformStyle: 'preserve-3d' }} className={faceStyle('bottom')}>D</div>
      </div>
    </div>
  );
};

const Wall = ({ points, height, width, color, baseZ, clippingPlanes = [], opacity = 1 }: { points: Point[], height: number, width?: number, color: string, baseZ: number, clippingPlanes?: THREE.Plane[], opacity?: number }) => {
  const segments = useMemo(() => {
    const result = [];
    const h = height / 100; // Convert to meters
    const zBase = baseZ / 100;
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i+1];
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx*dx + dy*dy);
      const angle = Math.atan2(dy, dx);
      
      const centerX = (p1.x + p2.x) / 2;
      const centerY = (p1.y + p2.y) / 2;
      
      result.push({
        position: [centerX / 100, zBase + h / 2, -centerY / 100] as [number, number, number],
        rotation: [0, -angle, 0] as [number, number, number],
        args: [length / 100, h, (width || 15) / 100] as [number, number, number],
      });
    }
    return result;
  }, [points, height, width, baseZ]);

  return (
    <group>
      {segments.map((seg, i) => (
        <mesh key={i} position={seg.position} rotation={seg.rotation} castShadow receiveShadow>
          <boxGeometry args={seg.args} />
          <meshStandardMaterial 
            color={color} 
            transparent={opacity < 1}
            opacity={opacity}
            metalness={0.15} 
            roughness={0.4} 
            envMapIntensity={1}
            clippingPlanes={clippingPlanes}
            clipShadows={true}
          />
          <Edges color="#1e293b" threshold={15} />
        </mesh>
      ))}
    </group>
  );
};

const Room = ({ points, holes, height, color, name, areaType, baseZ, clippingPlanes = [], opacity = 1 }: { points: Point[], holes?: Point[][], height: number, color: string, name?: string, areaType?: string, baseZ: number, clippingPlanes?: THREE.Plane[], opacity?: number }) => {
  const h = height / 100; // Convert to meters
  const zBase = baseZ / 100;
  const shape = useMemo(() => {
    if (!points || points.length < 3) return null;
    const s = new THREE.Shape();
    s.moveTo(points[0].x / 100, points[0].y / 100);
    for (let i = 1; i < points.length; i++) {
        s.lineTo(points[i].x / 100, points[i].y / 100);
    }
    s.closePath();

    if (holes && holes.length > 0) {
      holes.forEach(holePoints => {
        if (holePoints.length < 3) return;
        const holePath = new THREE.Path();
        holePath.moveTo(holePoints[0].x / 100, holePoints[0].y / 100);
        for (let i = 1; i < holePoints.length; i++) {
          holePath.lineTo(holePoints[i].x / 100, holePoints[i].y / 100);
        }
        holePath.closePath();
        s.holes.push(holePath);
      });
    }

    return s;
  }, [points, holes]);

  if (!shape) return null;

  const extrudeSettings = {
    steps: 1,
    depth: h,
    bevelEnabled: false
  };

  const center = useMemo(() => {
    let sx = 0, sy = 0;
    points.forEach(p => { sx += p.x; sy += p.y; });
    return [sx / (points.length * 100), zBase + h + 0.05, -sy / (points.length * 100)] as [number, number, number];
  }, [points, h, zBase]);

  const isWall = areaType === 'muro';
  const finalOpacity = opacity < 1 ? opacity : (isWall ? 0.95 : 0.25);
  const finalFloorOpacity = opacity < 1 ? Math.min(opacity, 0.4) : 0.4;

  return (
    <group position={[0, zBase, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshStandardMaterial 
          color={color} 
          transparent={!isWall || opacity < 1} 
          opacity={finalOpacity} 
          metalness={isWall ? 0.3 : 0.1}
          roughness={isWall ? 0.4 : 0.3}
          envMapIntensity={1.2}
          clippingPlanes={clippingPlanes}
          clipShadows={true}
        />
        <Edges color="#1e293b" threshold={15} />
      </mesh>
      
      {/* Floor Highlight */}
      {!isWall && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial 
            color={color} 
            transparent 
            opacity={finalFloorOpacity} 
            clippingPlanes={clippingPlanes}
          />
        </mesh>
      )}

      {name && (
        <Text
          position={center as [number, number, number]}
          fontSize={0.16}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#0f172a"
          visible={clippingPlanes.length === 0 || clippingPlanes.every(p => p.distanceToPoint(new THREE.Vector3(...(center as [number, number, number]))) >= 0)}
        >
          {name}
        </Text>
      )}
    </group>
  );
};

const BIMSymbol = ({ entity, onPointerOver, onPointerOut, clippingPlanes = [], opacity = 1 }: { entity: any, onPointerOver?: () => void, onPointerOut?: () => void, clippingPlanes?: THREE.Plane[], opacity?: number }) => {
  const { bimType, bimZPlane = 0, bimZElevation = 0, points, point, bimHeight = 210, bimWidth = 90, bimWindowHeight = 120, isHovered } = entity;
  const p = point || (points && points[0]);
  if (!p) return null;

  const color = entity.color || (bimType === 'door' ? '#ef4444' : '#3b82f6');
  const h = (bimType === 'door' ? bimHeight : bimWindowHeight) / 100;
  const w = (bimWidth || 90) / 100;
  const zBase = (bimZPlane + bimZElevation) / 100;
  const zPos = zBase + h / 2;
  const pos: [number, number, number] = [p.x / 100, zPos, -p.y / 100];
  
  return (
    <mesh 
      position={pos} 
      castShadow 
      onPointerOver={(e) => { e.stopPropagation(); onPointerOver?.(); }}
      onPointerOut={(e) => { e.stopPropagation(); onPointerOut?.(); }}
    >
      <boxGeometry args={[w, h, 0.1]} />
      <meshStandardMaterial 
        color={color} 
        transparent 
        opacity={(isHovered ? 0.9 : 0.6) * opacity} 
        metalness={0.4} 
        roughness={0.3} 
        emissive={isHovered ? color : '#000000'}
        emissiveIntensity={isHovered ? 0.2 : 0}
        clippingPlanes={clippingPlanes}
        clipShadows={true}
      />
      <Edges color={isHovered ? "cyan" : "white"} />
    </mesh>
  );
};


const CSGMeshRender = ({ entity, color, clippingPlanes = [], opacity = 1 }: { entity: any, color: string, clippingPlanes?: THREE.Plane[], opacity?: number }) => {
  const geom = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    if (entity.geometryData?.positions) {
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(entity.geometryData.positions), 3));
    }
    if (entity.geometryData?.normals) {
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(entity.geometryData.normals), 3));
    }
    if (entity.geometryData?.uvs && entity.geometryData.uvs.length > 0) {
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(entity.geometryData.uvs), 2));
    }
    if (entity.geometryData?.indices && entity.geometryData.indices.length > 0) {
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(entity.geometryData.indices), 1));
    }
    geo.computeBoundingSphere();
    return geo;
  }, [entity]);

  return (
    <mesh geometry={geom} castShadow receiveShadow>
      <meshStandardMaterial 
        color={color} 
        transparent={opacity < 1}
        opacity={opacity}
        metalness={0.15} 
        roughness={0.4} 
        envMapIntensity={1}
        clippingPlanes={clippingPlanes}
        clipShadows={true}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

const ReferencePlan = ({ entities }: { entities: Entity[] }) => {
  const lineEntities = entities.filter(e => !e.isBIM && (e.type === 'line' || e.type === 'rectangle'));
  
  if (lineEntities.length === 0) return null;

  return (
    <group position={[0, -0.01, 0]}>
      {lineEntities.map(entity => {
        let points: Point[] = [];
        if (entity.type === 'line') {
          points = [(entity as LineEntity).start, (entity as LineEntity).end];
        } else if (entity.type === 'rectangle') {
          const r = entity as RectEntity;
          points = [
            r.p1,
            { x: r.p2.x, y: r.p1.y },
            r.p2,
            { x: r.p1.x, y: r.p2.y },
            r.p1
          ];
        }

        if (points.length < 2) return null;

        const pts = points.map(p => new THREE.Vector3(p.x / 100, 0, -p.y / 100));
        const geometry = new THREE.BufferGeometry().setFromPoints(pts);

        return (
          <line key={entity.id}>
            <primitive object={geometry} attach="geometry" />
            <lineBasicMaterial attach="material" color={entity.color || '#94a3b8'} opacity={0.4} transparent linewidth={1} />
          </line>
        );
      })}
    </group>
  );
};

const RotationPivotHelpers = ({ 
  entity, 
  pivotIndex, 
  onSelectPivot 
}: { 
  entity: any, 
  pivotIndex: number, 
  onSelectPivot: (idx: number) => void 
}) => {
  const points = entity.points || entity.bimPoints || [];
  const baseZ = ((entity.bimZPlane || 0) + (entity.bimZElevation || 0)) / 100;
  
  if (points.length === 0) return null;
  
  return (
    <group>
      {points.map((p: Point, idx: number) => {
        const isPivot = pivotIndex === idx;
        const color = isPivot ? '#f59e0b' : '#06b6d4'; // Amber for selected, cyan for others
        const size = isPivot ? 0.18 : 0.10;
        
        return (
          <mesh 
            key={idx} 
            position={[p.x / 100, baseZ + 0.05, -p.y / 100]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectPivot(idx);
            }}
          >
            <sphereGeometry args={[size, 24, 24]} />
            <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.9} />
            {isPivot && (
              <group rotation={[-Math.PI / 2, 0, 0]}>
                <mesh position={[0, 0, -0.01]}>
                  <ringGeometry args={[0.35, 0.38, 32]} />
                  <meshBasicMaterial color="#f59e0b" transparent opacity={0.8} />
                </mesh>
                <mesh position={[0, 0, -0.01]}>
                  <ringGeometry args={[0, 0.32, 32]} />
                  <meshBasicMaterial color="#f59e0b" transparent opacity={0.2} />
                </mesh>
              </group>
            )}
          </mesh>
        );
      })}
    </group>
  );
};

const SceneCameraController = ({ 
  entities, 
  resetTrigger, 
  cameraPreset, 
  cameraViewMode,
  onPresetProcessed,
  selectedEntity = null,
  focusTrigger = 0
}: { 
  entities: Entity[], 
  resetTrigger: number, 
  cameraPreset: 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM' | 'ISO' | null, 
  cameraViewMode: 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM' | 'ISO',
  onPresetProcessed: () => void,
  selectedEntity?: Entity | null,
  focusTrigger?: number
}) => {
  const { camera, controls, size: viewportSize } = useThree();
  
  const applyPreset = useCallback((preset: 'FRONT' | 'BACK' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM' | 'ISO', onlySelected = false) => {
    const box = new THREE.Box3();
    let hasValidBounds = false;

    const targetEntities = (onlySelected && selectedEntity) ? [selectedEntity] : entities;

    if (targetEntities && targetEntities.length > 0) {
      targetEntities.forEach(entity => {
        if (entity.type === 'bim-csg') {
          const positions = (entity as any).geometryData?.positions;
          if (positions && positions.length > 0) {
            for (let i = 0; i < positions.length; i += 3) {
              box.expandByPoint(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
              hasValidBounds = true;
            }
          }
        } else {
          let points: Point[] = [];
          if (entity.type === 'line') {
            points = [(entity as LineEntity).start, (entity as LineEntity).end];
          } else if (entity.type === 'rectangle') {
            points = [(entity as RectEntity).p1, (entity as RectEntity).p2];
          } else if ((entity as any).points || (entity as any).bimPoints) {
            points = (entity as any).points || (entity as any).bimPoints;
          } else if ((entity as any).point) {
            points = [(entity as any).point];
          }

          points.forEach(p => {
            const e = entity as any;
            const baseZ = (e.bimZPlane || 0) + (e.bimZElevation || 0);
            const entityHeight = (e.bimHeight || e.height || 270) / 100;
            
            box.expandByPoint(new THREE.Vector3(p.x / 100, baseZ / 100, -p.y / 100));
            box.expandByPoint(new THREE.Vector3(p.x / 100, (baseZ / 100) + entityHeight, -p.y / 100));
            hasValidBounds = true;
          });
        }
      });
    }

    if (!hasValidBounds) {
      // Default fallback size centered at 0,0,0 to support preset orientations even in blank projects!
      box.set(new THREE.Vector3(-1.5, 0, -1.5), new THREE.Vector3(1.5, 2.7, 1.5));
    }

    const center = new THREE.Vector3();
    box.getCenter(center);
    
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const cameraFOV = (camera as THREE.PerspectiveCamera).fov || 50;
    const distance = maxDim / (2 * Math.tan((Math.PI * cameraFOV) / 360)) || 5;
    const offset = Math.max(distance * 1.6, 5);

    let newPos = new THREE.Vector3();

    switch (preset) {
      case 'TOP':
        newPos.set(center.x, center.y + offset, center.z);
        break;
      case 'BOTTOM':
        newPos.set(center.x, center.y - offset, center.z);
        break;
      case 'FRONT':
        newPos.set(center.x, center.y, center.z + offset);
        break;
      case 'BACK':
        newPos.set(center.x, center.y, center.z - offset);
        break;
      case 'RIGHT':
        newPos.set(center.x + offset, center.y, center.z);
        break;
      case 'LEFT':
        newPos.set(center.x - offset, center.y, center.z);
        break;
      case 'ISO':
      default:
        newPos.set(center.x + offset * 0.8, center.y + offset * 0.8, center.z + offset * 0.8);
        break;
    }

    // Set up vector orientation per preset to avoid lookAt lock/flip
    camera.up.set(0, 1, 0);
    if (preset === 'TOP') {
      camera.up.set(0, 0, -1);
    } else if (preset === 'BOTTOM') {
      camera.up.set(0, 0, 1);
    }

    camera.position.copy(newPos);
    camera.lookAt(center);

    if (controls) {
      (controls as any).target.copy(center);
    }

    // Set zoom dynamically for Orthographic projections to fit model boundaries
    if ((camera as any).isOrthographicCamera) {
      const ortho = camera as THREE.OrthographicCamera;
      const margin = 1.35;
      const zoomFactor = Math.min(viewportSize.width, viewportSize.height) / (maxDim * margin || 1);
      ortho.zoom = Math.max(5, Math.min(600, zoomFactor));
      ortho.updateProjectionMatrix();
    }

    if (controls) {
      (controls as any).update();
    }
  }, [camera, controls, entities, selectedEntity, viewportSize]);

  useEffect(() => {
    applyPreset(cameraViewMode, false);
  }, [resetTrigger, camera, cameraViewMode, applyPreset]);

  useEffect(() => {
    if (focusTrigger > 0 && selectedEntity) {
      applyPreset(cameraViewMode, true);
    }
  }, [focusTrigger, camera, cameraViewMode, applyPreset, selectedEntity]);

  useEffect(() => {
    if (cameraPreset) {
      applyPreset(cameraPreset, false);
      onPresetProcessed();
    }
  }, [cameraPreset, camera, applyPreset, onPresetProcessed]);

  return null;
};

export const BIM3DViewer: React.FC<BIM3DViewerProps> = ({ entities, onClose, setEntities }) => {
  const [resetTrigger, setResetTrigger] = useState(0);
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [viewMode, setViewMode] = useState<'PERSPECTIVE' | 'TOP'>('PERSPECTIVE');
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [csgTargetEntity, setCSGTargetEntity] = useState<Entity | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isCSGOperating, setIsCSGOperating] = useState(false);

  // Camera Presets
  const [cameraPreset, setCameraPreset] = useState<'FRONT' | 'BACK' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM' | 'ISO' | null>(null);
  const [cameraViewMode, setCameraViewMode] = useState<'FRONT' | 'BACK' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM' | 'ISO'>('ISO');

  // Rotation Tools
  const [isRotationMode, setIsRotationMode] = useState(false);
  const [selectedPivotIndex, setSelectedPivotIndex] = useState(0);
  const [currentRotationVal, setCurrentRotationVal] = useState(0);
  const [originalPoints, setOriginalPoints] = useState<Point[] | null>(null);
  const [originalAngle, setOriginalAngle] = useState(0);
  
  // Dialog States
  const [isAreaEditOpen, setIsAreaEditOpen] = useState(false);
  const [isDoorEditOpen, setIsDoorEditOpen] = useState(false);
  const [isWindowEditOpen, setIsWindowEditOpen] = useState(false);
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [isRealistic, setIsRealistic] = useState(false);
  const [transparentEntities, setTransparentEntities] = useState<Set<string>>(new Set());
  const [stepCm, setStepCm] = useState(10);

  // Positioning & dragging states for Properties Panel
  const [panelPos, setPanelPos] = useState({ x: 0, y: 0 });

  const getRotationExplanation = () => {
    switch (cameraViewMode) {
      case 'FRONT':
      case 'BACK':
        return {
          title: "Prospetto Frontale (Piano Verticale X-Y)",
          desc: "Rotazione sul piano verticale della vista. Un pilastro verticale diventa una trave orizzontale se ruotato di 90°!"
        };
      case 'LEFT':
      case 'RIGHT':
        return {
          title: "Prospetto Laterale (Piano Verticale Z-Y)",
          desc: "Rotazione sul piano della sezione laterale. Il pilastro ruota trasformandosi in una trave ortogonale!"
        };
      case 'TOP':
      case 'BOTTOM':
      default:
        return {
          title: "Piano Orizzontale (Mappa / Pianta)",
          desc: "Rotazione planimetrica classica attorno all'asse verticale (angolo azimutale sul piano della pavimentazione)."
        };
    }
  };

  useEffect(() => {
    if (selectedEntity) {
      const e = selectedEntity as any;
      if (cameraViewMode === 'FRONT' || cameraViewMode === 'BACK') {
        setCurrentRotationVal(e.rotationZ || 0);
      } else if (cameraViewMode === 'LEFT' || cameraViewMode === 'RIGHT') {
        setCurrentRotationVal(e.rotationX || 0);
      } else {
        setCurrentRotationVal(e.angle || 0);
      }
    }
  }, [cameraViewMode, selectedEntity]);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('a')) return;
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - panelPos.x,
      y: e.clientY - panelPos.y
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setPanelPos({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Rotate selectedEntity points or angle
  const handleRotate = (angleDegrees: number) => {
    if (!selectedEntity) return;
    
    setCurrentRotationVal(angleDegrees);
    
    const e = selectedEntity as any;
    
    if (cameraViewMode === 'FRONT' || cameraViewMode === 'BACK') {
      // Rotate in Vertical Front Plane (around Z axis)
      // Restore original 2D points so they are not warped, and update rotationZ
      setEntities((prev: any[]) => prev.map(item => {
        if (item.id === selectedEntity.id) {
          const updated = { ...item };
          if (originalPoints) {
            if (updated.points) updated.points = [...originalPoints];
            if (updated.bimPoints) updated.bimPoints = [...originalPoints];
          }
          updated.rotationZ = angleDegrees;
          return updated;
        }
        return item;
      }));
      setSelectedEntity(prev => {
        if (!prev) return null;
        const updated = { ...prev };
        if (originalPoints) {
          if ((updated as any).points) (updated as any).points = [...originalPoints];
          if ((updated as any).bimPoints) (updated as any).bimPoints = [...originalPoints];
        }
        (updated as any).rotationZ = angleDegrees;
        return updated;
      });
    } else if (cameraViewMode === 'LEFT' || cameraViewMode === 'RIGHT') {
      // Rotate in Vertical Side Plane (around X axis)
      // Restore original 2D points so they are not warped, and update rotationX
      setEntities((prev: any[]) => prev.map(item => {
        if (item.id === selectedEntity.id) {
          const updated = { ...item };
          if (originalPoints) {
            if (updated.points) updated.points = [...originalPoints];
            if (updated.bimPoints) updated.bimPoints = [...originalPoints];
          }
          updated.rotationX = angleDegrees;
          return updated;
        }
        return item;
      }));
      setSelectedEntity(prev => {
        if (!prev) return null;
        const updated = { ...prev };
        if (originalPoints) {
          if ((updated as any).points) (updated as any).points = [...originalPoints];
          if ((updated as any).bimPoints) (updated as any).bimPoints = [...originalPoints];
        }
        (updated as any).rotationX = angleDegrees;
        return updated;
      });
    } else {
      // Standard Horizontal View (TOP, BOTTOM, ISO)
      // Reset any vertical rotations to 0 on this entity so it lies flat on the horizontal view
      const isSinglePoint = e.bimType === 'door' || e.bimType === 'window' || e.type === 'point';
      
      if (isSinglePoint) {
        setEntities((prev: any[]) => prev.map(item => {
          if (item.id === selectedEntity.id) {
            return { 
              ...item, 
              angle: angleDegrees,
              rotationX: 0,
              rotationZ: 0
            };
          }
          return item;
        }));
        setSelectedEntity(prev => prev ? { 
          ...prev, 
          angle: angleDegrees,
          rotationX: 0,
          rotationZ: 0
        } as any : null);
      } else {
        let pts = originalPoints || e.points || e.bimPoints;
        if (!pts || pts.length === 0) {
          if (e.type === 'line') {
            pts = [e.start, e.end];
          } else if (e.type === 'rectangle') {
            pts = [
              e.p1, 
              { x: e.p2.x, y: e.p1.y }, 
              e.p2, 
              { x: e.p1.x, y: e.p2.y }
            ];
          }
        }
        if (!pts || pts.length === 0) return;
        
        const pivot = pts[selectedPivotIndex] || pts[0];
        if (!pivot) return;
        
        const angleRad = (angleDegrees * Math.PI) / 180;
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);
        
        const rotatedPts = pts.map((p: Point) => {
          const dx = p.x - pivot.x;
          const dy = p.y - pivot.y;
          return {
            x: pivot.x + dx * cos - dy * sin,
            y: pivot.y + dx * sin + dy * cos
          };
        });
        
        setEntities((prev: any[]) => prev.map(item => {
          if (item.id === selectedEntity.id) {
            const updated = { ...item };
            if (item.type === 'line') {
              updated.start = rotatedPts[0];
              updated.end = rotatedPts[1];
            } else if (item.type === 'rectangle') {
              updated.p1 = rotatedPts[0];
              updated.p2 = rotatedPts[2];
            } else {
              if ((updated as any).points) (updated as any).points = rotatedPts;
              if ((updated as any).bimPoints) (updated as any).bimPoints = rotatedPts;
            }
            updated.rotationX = 0;
            updated.rotationZ = 0;
            return updated;
          }
          return item;
        }));
        setSelectedEntity(prev => {
          if (!prev) return null;
          const updated = { ...prev };
          if (prev.type === 'line') {
            (updated as any).start = rotatedPts[0];
            (updated as any).end = rotatedPts[1];
          } else if (prev.type === 'rectangle') {
            (updated as any).p1 = rotatedPts[0];
            (updated as any).p2 = rotatedPts[2];
          } else {
            if ((updated as any).points) (updated as any).points = rotatedPts;
            if ((updated as any).bimPoints) (updated as any).bimPoints = rotatedPts;
          }
          (updated as any).rotationX = 0;
          (updated as any).rotationZ = 0;
          return updated;
        });
      }
    }
  };

  const handleRotateAll = (angleDegrees: number) => {
    // 1. Calculate centroid across all entity vertices
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    
    entities.forEach((entity: any) => {
      let pts = entity.points || entity.bimPoints;
      if (entity.type === 'line') {
        pts = [(entity as LineEntity).start, (entity as LineEntity).end];
      } else if (entity.type === 'rectangle') {
        const r = entity as RectEntity;
        pts = [r.p1, r.p2];
      }
      
      if (pts && pts.length > 0) {
        pts.forEach((p: Point) => {
          sumX += p.x;
          sumY += p.y;
          count++;
        });
      } else if (entity.point) {
        sumX += entity.point.x;
        sumY += entity.point.y;
        count++;
      }
    });
    
    if (count === 0) return;
    const centerX = sumX / count;
    const centerY = sumY / count;
    
    // 2. Rotate all points or angles around the global center
    const angleRad = (angleDegrees * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    
    const rotatePoint = (p: Point) => {
      const dx = p.x - centerX;
      const dy = p.y - centerY;
      return {
        x: centerX + dx * cos - dy * sin,
        y: centerY + dx * sin + dy * cos
      };
    };
    
    setEntities((prev: any[]) => prev.map(item => {
      const updated = { ...item };
      
      if (item.angle !== undefined) {
        updated.angle = ((item.angle || 0) + angleDegrees) % 360;
      }
      
      if (item.point) {
        updated.point = rotatePoint(item.point);
      }
      
      if (item.points) {
        updated.points = item.points.map(rotatePoint);
      }
      if (item.bimPoints) {
        updated.bimPoints = item.bimPoints.map(rotatePoint);
      }
      if (item.start && item.end) {
        updated.start = rotatePoint(item.start);
        updated.end = rotatePoint(item.end);
      }
      if (item.p1 && item.p2) {
        updated.p1 = rotatePoint(item.p1);
        updated.p2 = rotatePoint(item.p2);
      }
      
      return updated;
    }));
  };

  const handleSelectPivot = (index: number) => {
    setSelectedPivotIndex(index);
    if (selectedEntity) {
      const e = selectedEntity as any;
      const currentPts = e.points || e.bimPoints || null;
      setOriginalPoints(currentPts ? [...currentPts] : null);
      setCurrentRotationVal(0);
    }
  };

  useEffect(() => {
    if (selectedEntity) {
      const e = selectedEntity as any;
      const pts = e.points || e.bimPoints || null;
      setOriginalPoints(pts ? [...pts] : null);
      setOriginalAngle(e.angle || 0);
      setCurrentRotationVal(e.angle || 0);
      setSelectedPivotIndex(0);
    } else {
      setOriginalPoints(null);
      setOriginalAngle(0);
      setCurrentRotationVal(0);
      setSelectedPivotIndex(0);
      setIsRotationMode(false);
    }
  }, [selectedEntity?.id]);

  const toggleTransparency = (id: string) => {
    setTransparentEntities(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteEntity = (id: string) => {
    setEntities(prev => prev.filter(e => e.id !== id));
    setSelectedEntity(null);
    setInspectorOpen(false);
    setIsAreaEditOpen(false);
    setIsDoorEditOpen(false);
    setIsWindowEditOpen(false);
    setEditingEntityId(null);
  };

  const handleDuplicateEntity = (entity: Entity) => {
    const rawEnt = entity as any;
    const newId = `${rawEnt.type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const cloned = JSON.parse(JSON.stringify(rawEnt)) as Entity;
    cloned.id = newId;
    
    let dx = 0;
    let dy = 0;
    if (cameraViewMode === 'FRONT' || cameraViewMode === 'BACK') {
      dx = 50; 
    } else if (cameraViewMode === 'LEFT' || cameraViewMode === 'RIGHT') {
      dy = 50; 
    } else {
      dx = 50;
      dy = 50;
    }
    
    const shifted = translateEntityPoints(cloned, dx, dy, 0);
    
    setEntities(prev => [...prev, shifted]);
    setSelectedEntity(shifted);
  };

  const handleMoveEntity = (entity: Entity, dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', stepVal: number) => {
    let dx = 0;
    let dy = 0;
    let dz = 0;
    
    if (cameraViewMode === 'TOP' || cameraViewMode === 'BOTTOM' || cameraViewMode === 'ISO') {
      if (dir === 'UP') dy = -stepVal;
      if (dir === 'DOWN') dy = stepVal;
      if (dir === 'LEFT') dx = -stepVal;
      if (dir === 'RIGHT') dx = stepVal;
    } else if (cameraViewMode === 'FRONT' || cameraViewMode === 'BACK') {
      const factor = cameraViewMode === 'BACK' ? -1 : 1;
      if (dir === 'UP') dz = stepVal;
      if (dir === 'DOWN') dz = -stepVal;
      if (dir === 'LEFT') dx = -stepVal * factor;
      if (dir === 'RIGHT') dx = stepVal * factor;
    } else if (cameraViewMode === 'LEFT' || cameraViewMode === 'RIGHT') {
      const factor = cameraViewMode === 'LEFT' ? -1 : 1;
      if (dir === 'UP') dz = stepVal;
      if (dir === 'DOWN') dz = -stepVal;
      if (dir === 'LEFT') dy = -stepVal * factor;
      if (dir === 'RIGHT') dy = stepVal * factor;
    }
    
    const rawEnt = entity as any;
    const moved = translateEntityPoints(rawEnt, dx, dy, dz);
    
    setSelectedEntity(moved);
    
    setEntities((prev: any[]) => prev.map(item => {
      if (item.id === entity.id) {
        return moved;
      }
      return item;
    }));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      
      if (!selectedEntity) return;
      
      const key = e.key.toLowerCase();
      
      if (key === 'c' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleDuplicateEntity(selectedEntity);
        return;
      }
      if (key === 'c') {
        e.preventDefault();
        handleDuplicateEntity(selectedEntity);
        return;
      }
      
      if (e.key === 'Delete' || e.key === 'Backspace' || key === 'canc' || key === 'x') {
        e.preventDefault();
        handleDeleteEntity(selectedEntity.id);
        return;
      }
      
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleMoveEntity(selectedEntity, 'UP', stepCm);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleMoveEntity(selectedEntity, 'DOWN', stepCm);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleMoveEntity(selectedEntity, 'LEFT', stepCm);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleMoveEntity(selectedEntity, 'RIGHT', stepCm);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedEntity, cameraViewMode, stepCm]);

  const handleOpenClickDialog = (entity: Entity) => {
    const e = entity as any;
    setEditingEntityId(entity.id);
    if (e.bimType === 'door') {
      setIsDoorEditOpen(true);
    } else if (e.bimType === 'window') {
      setIsWindowEditOpen(true);
    } else {
      setIsAreaEditOpen(true);
    }
  };

  const handleConfirmAreaEdit = (areaData: {
    type: string;
    name: string;
    color: string;
    zPlane: number;
    zElevation: number;
    objectHeight: number;
    hatch: 'SOLID' | 'ANSI31' | 'CROSS' | 'NONE';
  }) => {
    if (!editingEntityId) return;
    setEntities(prev => prev.map(e => {
      if (e.id === editingEntityId) {
        return {
          ...e,
          bimAreaType: areaData.type as any,
          bimName: areaData.name,
          backgroundColor: areaData.color,
          color: areaData.color,
          bimHatchPattern: areaData.hatch,
          pattern: areaData.hatch === 'NONE' ? 'SOLID' : areaData.hatch,
          bimHeight: areaData.objectHeight,
          height: areaData.objectHeight,
          bimZPlane: areaData.zPlane,
          bimZElevation: areaData.zElevation
        };
      }
      return e;
    }));

    setSelectedEntity(prev => prev && prev.id === editingEntityId ? {
      ...prev,
      bimAreaType: areaData.type as any,
      bimName: areaData.name,
      backgroundColor: areaData.color,
      color: areaData.color,
      bimHatchPattern: areaData.hatch,
      pattern: areaData.hatch === 'NONE' ? 'SOLID' : areaData.hatch,
      bimHeight: areaData.objectHeight,
      height: areaData.objectHeight,
      bimZPlane: areaData.zPlane,
      bimZElevation: areaData.zElevation
    } : prev);

    setIsAreaEditOpen(false);
    setEditingEntityId(null);
  };

  const handleConfirmDoorEdit = (width: number, height: number, type: string, flip: boolean) => {
    if (!editingEntityId) return;
    setEntities(prev => prev.map(e => {
      if (e.id === editingEntityId) {
        const ent = e as any;
        let nextEnd = ent.end;
        if (ent.start && ent.end) {
          const dx = ent.end.x - ent.start.x;
          const dy = ent.end.y - ent.start.y;
          const len = Math.sqrt(dx*dx + dy*dy);
          if (len > 0) {
            nextEnd = {
              x: ent.start.x + (dx / len) * width,
              y: ent.start.y + (dy / len) * width
            };
          }
        }

        return {
          ...e,
          bimName: `Porta ${width}`,
          bimWidth: width,
          bimHeight: height,
          height: height,
          bimDoorType: type,
          end: nextEnd,
          bimFlip: flip
        };
      }
      return e;
    }));

    setSelectedEntity(prev => prev && prev.id === editingEntityId ? {
      ...prev,
      bimName: `Porta ${width}`,
      bimWidth: width,
      bimHeight: height,
      height: height,
      bimDoorType: type,
      bimFlip: flip
    } : prev);

    setIsDoorEditOpen(false);
    setEditingEntityId(null);
  };

  const handleConfirmWindowEdit = (width: number, height: number, type: string, trasmittanza: number, prezzario: string) => {
    if (!editingEntityId) return;
    setEntities(prev => prev.map(e => {
      if (e.id === editingEntityId) {
        const ent = e as any;
        let nextEnd = ent.end;
        if (ent.start && ent.end) {
          const dx = ent.end.x - ent.start.x;
          const dy = ent.end.y - ent.start.y;
          const len = Math.sqrt(dx*dx + dy*dy);
          if (len > 0) {
            nextEnd = {
              x: ent.start.x + (dx / len) * width,
              y: ent.start.y + (dy / len) * width
            };
          }
        }

        return {
          ...e,
          bimName: `Finestra ${width}x${height}`,
          bimWidth: width,
          bimWindowHeight: height,
          height: height,
          bimWindowType: type,
          end: nextEnd,
          bimTrasmittanza: trasmittanza,
          bimPrezzario: prezzario
        };
      }
      return e;
    }));

    setSelectedEntity(prev => prev && prev.id === editingEntityId ? {
      ...prev,
      bimName: `Finestra ${width}x${height}`,
      bimWidth: width,
      bimWindowHeight: height,
      height: height,
      bimWindowType: type,
      bimTrasmittanza: trasmittanza,
      bimPrezzario: prezzario
    } : prev);

    setIsWindowEditOpen(false);
    setEditingEntityId(null);
  };
  
  useEffect(() => {
    resetCamera();
  }, []);

  // Slicing States
  const [isSlicing, setIsSlicing] = useState(false);
  const [slicingHeight, setSlicingHeight] = useState(3.0); // Default max height
  const [slicingMode, setSlicingMode] = useState<'HIDE_ABOVE' | 'HIDE_BELOW' | 'WINDOW'>('HIDE_ABOVE');
  const [slicingDirection, setSlicingDirection] = useState<'UP' | 'DOWN'>('UP');
  const [isAutoSlicing, setIsAutoSlicing] = useState(false);
  const [windowThickness, setWindowThickness] = useState(0.5);

  const clippingPlanes = useMemo(() => {
    if (!isSlicing) return [];
    
    if (slicingMode === 'HIDE_ABOVE') {
      // Normal [0, -1, 0] clips everything ABOVE height
      return [new THREE.Plane(new THREE.Vector3(0, -1, 0), slicingHeight)];
    } else if (slicingMode === 'HIDE_BELOW') {
      // Normal [0, 1, 0] clips everything BELOW height
      return [new THREE.Plane(new THREE.Vector3(0, 1, 0), -slicingHeight)];
    } else if (slicingMode === 'WINDOW') {
      // Window of thickess around slicingHeight
      const half = windowThickness / 2;
      return [
        new THREE.Plane(new THREE.Vector3(0, -1, 0), slicingHeight + half),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -(slicingHeight - half))
      ];
    }
    return [];
  }, [isSlicing, slicingHeight, slicingMode, windowThickness]);

  // Auto-slicing logic
  useEffect(() => {
    let interval: any;
    if (isAutoSlicing) {
      interval = setInterval(() => {
        setSlicingHeight(prev => {
          const step = 0.015;
          const maxH = 4.0;
          if (slicingDirection === 'UP') {
            if (prev >= maxH) {
              setSlicingDirection('DOWN');
              return prev;
            }
            return prev + step;
          } else {
            if (prev <= 0) {
              setSlicingDirection('UP');
              return prev;
            }
            return prev - step;
          }
        });
      }, 16);
    }
    return () => clearInterval(interval);
  }, [isAutoSlicing, slicingDirection]);

  const bimEntities = useMemo(() => {
    return entities.filter(e => e.isBIM);
  }, [entities]);

  const resetCamera = () => setResetTrigger(prev => prev + 1);

  const handleSelect = (entity: Entity) => {
    setSelectedEntity(entity);
    setCSGTargetEntity(null);
    setInspectorOpen(true);
  };

  const handleSelectSecondary = (entity: Entity) => {
    setCSGTargetEntity({ ...entity });
  };

  const executeCSG = async (operation: 'union' | 'subtract') => {
    if (!selectedEntity || !csgTargetEntity) return;

    try {
      const { performCSG } = await import('../utils/csgUtils');
      const result = performCSG(selectedEntity, csgTargetEntity, operation);
      if (result) {
        setEntities(prev => [...prev.filter(e => e.id !== selectedEntity.id && e.id !== csgTargetEntity.id), result]);
        setSelectedEntity(result);
        setCSGTargetEntity(null);
        setIsCSGOperating(false);
      }
    } catch (e) {
      console.error('CSG Operation failed', e);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-[#fdfdfd] flex flex-col overflow-hidden select-none">
      {/* DALUX STYLE OVERLAY */}
      
      {/* Top Professional Navigation Bar */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 p-2 bg-white/70 backdrop-blur-2xl rounded-2xl shadow-[0_15px_40px_-10px_rgba(0,0,0,0.1)] border border-slate-200/50 pointer-events-auto">
        <button 
          onClick={onClose}
          className="p-3 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-red-500 transition-all active:scale-95"
          title="Esci"
        >
          <X size={22} />
        </button>
        <div className="w-px h-8 bg-slate-200 mx-1" />
        
        <button 
          onClick={resetCamera}
          className="p-3 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-cyan-600 transition-all active:scale-95"
          title="Home"
        >
          <Home size={22} />
        </button>
        
        <button 
          onClick={() => setViewMode(viewMode === 'PERSPECTIVE' ? 'TOP' : 'PERSPECTIVE')}
          className={`p-3 rounded-xl transition-all active:scale-95 ${viewMode === 'TOP' ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-200' : 'hover:bg-slate-100 text-slate-400'}`}
          title="Vista 2D/3D"
        >
          <Compass size={22} />
        </button>
        
        <button 
          onClick={() => {
            if (!selectedEntity) {
              setInspectorOpen(true);
              setIsRotationMode(true);
            } else {
              setIsRotationMode(!isRotationMode);
              if (!isRotationMode) {
                const e = selectedEntity as any;
                const pts = e.points || e.bimPoints || null;
                setOriginalPoints(pts ? [...pts] : null);
                setOriginalAngle(e.angle || 0);
                setCurrentRotationVal(e.angle || 0);
                setSelectedPivotIndex(0);
              }
            }
          }}
          className={`p-3 rounded-xl transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border ${
            isRotationMode 
              ? 'bg-amber-500 border-amber-600 text-white shadow-lg shadow-amber-200 animate-pulse font-black text-xs px-4' 
              : 'hover:bg-slate-50 text-slate-400 border-transparent hover:text-amber-500'
          }`}
          title="Strumento Rotazione (Muri, Porte, Finestre)"
        >
          <RotateCw size={22} className={isRotationMode ? "animate-spin" : ""} />
          {isRotationMode && <span className="text-[10px] font-black uppercase tracking-wider hidden sm:inline">Rotazione</span>}
        </button>

        <div className="w-px h-8 bg-slate-200 mx-1" />
        
        {/* REALISTIC AND SLICING CONTROLS */}
        <div className="flex items-center gap-1.5 bg-slate-50/50 p-1 rounded-xl border border-slate-200/50">
          <button 
            onClick={() => setIsRealistic(!isRealistic)}
            className={`p-2.5 rounded-lg transition-all ${isRealistic ? 'bg-amber-500 text-white shadow-lg shadow-amber-200' : 'hover:bg-white text-slate-400'}`}
            title="Render Realistico"
          >
            <Wand2 size={20} />
          </button>
          
          <div className="w-px h-6 bg-slate-200/50 mx-1" />

          <button 
            onClick={() => setIsSlicing(!isSlicing)}
            className={`p-2.5 rounded-lg transition-all ${isSlicing ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-200' : 'hover:bg-white text-slate-400'}`}
            title="Slicing Engine (Section Mobile)"
          >
            <Scissors size={20} />
          </button>
          
          {isSlicing && (
            <>
              <div className="w-px h-6 bg-slate-200 mx-1" />
              
              <div className="flex bg-white rounded-lg p-0.5 shadow-sm border border-slate-100">
                <button 
                  onClick={() => setSlicingMode('HIDE_ABOVE')}
                  className={`p-2 rounded-md transition-all ${slicingMode === 'HIDE_ABOVE' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                  title="Taglia Sopra (Keep Bottom)"
                >
                  <ArrowDown size={16} />
                </button>
                <button 
                  onClick={() => setSlicingMode('HIDE_BELOW')}
                  className={`p-2 rounded-md transition-all ${slicingMode === 'HIDE_BELOW' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                  title="Taglia Sotto (Keep Top)"
                >
                  <ArrowUp size={16} />
                </button>
                <button 
                  onClick={() => setSlicingMode('WINDOW')}
                  className={`p-2 rounded-md transition-all ${slicingMode === 'WINDOW' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                  title="Sezione Mobile (Window)"
                >
                  <Maximize size={16} className="rotate-45" />
                </button>
              </div>

              <div className="w-px h-6 bg-slate-200 mx-1" />

              <button 
                onClick={() => setIsAutoSlicing(!isAutoSlicing)}
                className={`p-2.5 rounded-lg transition-all ${isAutoSlicing ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' : 'hover:bg-white text-emerald-600'}`}
                title={isAutoSlicing ? "Sospendi Animazione" : "Avvia Animazione 3D Printer"}
              >
                {isAutoSlicing ? <Pause size={18} /> : <Play size={18} />}
              </button>
              
              <div className="flex flex-col px-3 justify-center">
                <input 
                  type="range" 
                  min="0" 
                  max="4" 
                  step="0.01" 
                  value={slicingHeight}
                  onChange={(e) => {
                    setSlicingHeight(parseFloat(e.target.value));
                    setIsAutoSlicing(false);
                  }}
                  className="w-24 h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <span className="text-[8px] font-black text-indigo-400 uppercase mt-0.5 text-center">Posizione: {slicingHeight.toFixed(2)}m</span>
              </div>

              {slicingMode === 'WINDOW' && (
                <div className="flex flex-col px-3 justify-center border-l border-slate-100">
                  <input 
                    type="range" 
                    min="0.1" 
                    max="2" 
                    step="0.1" 
                    value={windowThickness}
                    onChange={(e) => setWindowThickness(parseFloat(e.target.value))}
                    className="w-16 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600"
                  />
                  <span className="text-[7px] font-black text-slate-400 uppercase mt-0.5 text-center">Spessore: {windowThickness}m</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="w-px h-8 bg-slate-200 mx-1" />
        
        <div className="flex items-center px-5 gap-3 h-10 bg-slate-50/50 rounded-xl border border-slate-100">
          <div className={`w-2.5 h-2.5 rounded-full ${isAutoSlicing ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500'} shadow-[0_0_8px_rgba(16,185,129,0.6)]`} />
          <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] font-mono">
            {isSlicing ? 'SLICING ACTIVE' : 'BIM ENGINE LIVE'}
          </span>
        </div>
      </div>

      {/* 3D PERSPECTIVE PRESETS TOOLBAR (VISTE ORTOGONALI - CUBETTI COLLORATI) */}
      <div className="absolute top-28 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur-3xl px-5 py-2.5 rounded-[2rem] border border-slate-200/50 shadow-[0_20px_45px_-10px_rgba(0,0,0,0.12)] pointer-events-auto flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-2 ml-1">Vista CAD:</span>
        
        {/* TOP VIEW */}
        <button
          onClick={() => { setViewMode('TOP'); setCameraViewMode('TOP'); setCameraPreset('TOP'); }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl text-[10.5px] font-black uppercase transition-all duration-300 active:scale-95 cursor-pointer ${
            cameraViewMode === 'TOP'
              ? 'bg-rose-50 text-rose-600 shadow-[0_4px_12px_rgba(244,63,94,0.15)] border border-rose-200'
              : 'hover:bg-slate-50 text-slate-600 border border-transparent'
          }`}
          title="Vista dall'alto (Sopra)"
        >
          <CADCubeIcon highlightFace="top" isActive={cameraViewMode === 'TOP'} />
          Sopra
        </button>

        {/* BOTTOM VIEW */}
        <button
          onClick={() => { setViewMode('TOP'); setCameraViewMode('BOTTOM'); setCameraPreset('BOTTOM'); }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl text-[10.5px] font-black uppercase transition-all duration-300 active:scale-95 cursor-pointer ${
            cameraViewMode === 'BOTTOM'
              ? 'bg-amber-50 text-amber-600 shadow-[0_4px_12px_rgba(245,158,11,0.15)] border border-amber-200'
              : 'hover:bg-slate-50 text-slate-600 border border-transparent'
          }`}
          title="Vista dal basso (Sotto)"
        >
          <CADCubeIcon highlightFace="bottom" isActive={cameraViewMode === 'BOTTOM'} />
          Sotto
        </button>

        <div className="w-px h-5 bg-slate-200/60 mx-1" />

        {/* FRONT VIEW */}
        <button
          onClick={() => { setViewMode('PERSPECTIVE'); setCameraViewMode('FRONT'); setCameraPreset('FRONT'); }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl text-[10.5px] font-black uppercase transition-all duration-300 active:scale-95 cursor-pointer ${
            cameraViewMode === 'FRONT'
              ? 'bg-blue-50 text-blue-600 shadow-[0_4px_12px_rgba(59,130,246,0.15)] border border-blue-200'
              : 'hover:bg-slate-50 text-slate-600 border border-transparent'
          }`}
          title="Vista Frontale"
        >
          <CADCubeIcon highlightFace="front" isActive={cameraViewMode === 'FRONT'} />
          Fronte
        </button>

        {/* BACK VIEW */}
        <button
          onClick={() => { setViewMode('PERSPECTIVE'); setCameraViewMode('BACK'); setCameraPreset('BACK'); }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl text-[10.5px] font-black uppercase transition-all duration-300 active:scale-95 cursor-pointer ${
            cameraViewMode === 'BACK'
              ? 'bg-orange-50 text-orange-600 shadow-[0_4px_12px_rgba(249,115,22,0.15)] border border-orange-200'
              : 'hover:bg-slate-50 text-slate-600 border border-transparent'
          }`}
          title="Vista Posteriore (Retro)"
        >
          <CADCubeIcon highlightFace="back" isActive={cameraViewMode === 'BACK'} />
          Retro
        </button>

        <div className="w-px h-5 bg-slate-200/60 mx-1" />

        {/* RIGHT VIEW */}
        <button
          onClick={() => { setViewMode('PERSPECTIVE'); setCameraViewMode('RIGHT'); setCameraPreset('RIGHT'); }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl text-[10.5px] font-black uppercase transition-all duration-300 active:scale-95 cursor-pointer ${
            cameraViewMode === 'RIGHT'
              ? 'bg-emerald-50 text-emerald-600 shadow-[0_4px_12px_rgba(16,185,129,0.15)] border border-emerald-200'
              : 'hover:bg-slate-50 text-slate-600 border border-transparent'
          }`}
          title="Vista Laterale Destra"
        >
          <CADCubeIcon highlightFace="right" isActive={cameraViewMode === 'RIGHT'} />
          Destra
        </button>

        {/* LEFT VIEW */}
        <button
          onClick={() => { setViewMode('PERSPECTIVE'); setCameraViewMode('LEFT'); setCameraPreset('LEFT'); }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl text-[10.5px] font-black uppercase transition-all duration-300 active:scale-95 cursor-pointer ${
            cameraViewMode === 'LEFT'
              ? 'bg-purple-50 text-purple-600 shadow-[0_4px_12px_rgba(168,85,247,0.15)] border border-purple-200'
              : 'hover:bg-slate-50 text-slate-600 border border-transparent'
          }`}
          title="Vista Laterale Sinistra"
        >
          <CADCubeIcon highlightFace="left" isActive={cameraViewMode === 'LEFT'} />
          Sinistra
        </button>

        <div className="w-px h-5 bg-slate-200/60 mx-1" />

        {/* ISO VIEW */}
        <button
          onClick={() => { setViewMode('PERSPECTIVE'); setCameraViewMode('ISO'); setCameraPreset('ISO'); }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl text-[10.5px] font-black uppercase transition-all duration-300 active:scale-95 cursor-pointer ${
            cameraViewMode === 'ISO'
              ? 'bg-slate-900 text-white shadow-[0_6px_15px_rgba(15,23,42,0.25)] border border-slate-950'
              : 'hover:bg-slate-50 text-slate-600 border border-transparent'
          }`}
          title="Vista Isometrica 3D"
        >
          <CADCubeIcon highlightFace="all" isActive={cameraViewMode === 'ISO'} />
          Assonometria
        </button>
      </div>

      {/* Side Properties Inspector (Dalux Inspired) - Dragging and Scrollable */}
      <div 
        style={{
          transform: `translate(${panelPos.x}px, ${panelPos.y}px)`
        }}
        className={`absolute top-24 right-8 z-[60] w-80 bg-white/95 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] border border-slate-100 transition-shadow duration-300 pointer-events-auto flex flex-col max-h-[80vh] ${inspectorOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
      >
        <div className="p-8 flex flex-col h-full overflow-hidden max-h-[80vh]">
          {/* Header block (Draggable onMouseDown) */}
          <div 
            onMouseDown={handleMouseDown} 
            className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 select-none cursor-grab active:cursor-grabbing"
            title="Trascina la testata per spostare la scheda"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-cyan-500 rounded-2xl text-white shadow-lg shadow-cyan-100">
                <Info size={20} />
              </div>
              <h3 className="font-black text-slate-800 text-lg tracking-tight">Proprietà</h3>
            </div>
            <button onClick={() => setInspectorOpen(false)} className="text-slate-300 hover:text-slate-600 transition-colors cursor-pointer">
              <X size={20} />
            </button>
          </div>

          {!selectedEntity ? (
            isRotationMode ? (
              <div className="space-y-6 overflow-y-auto pr-1 flex-1 max-h-[calc(80vh-10rem)] scrollbar-thin">
                <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-5 rounded-3xl border border-amber-200/40">
                  <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest block mb-1">Rotazione Globale</span>
                  <div className="text-sm font-black text-slate-800 leading-tight mb-2">Ruota l'intero modello 3D</div>
                  <p className="text-[10px] text-slate-500 font-medium leading-relaxed mb-4">
                    Clicca un pulsante per ruotare contemporaneamente tutte le entità (muri, aree, infissi) rispetto al centro comune del disegno.
                  </p>
                  
                  <div className="grid grid-cols-4 gap-1.5">
                    {[-90, -45, 45, 90].map((angle) => (
                      <button
                        key={angle}
                        onClick={() => handleRotateAll(angle)}
                        className="py-2.5 bg-white border border-slate-200 hover:border-amber-400 hover:text-amber-600 active:scale-95 text-slate-700 rounded-xl font-bold text-xs transition-all shadow-sm cursor-pointer"
                      >
                        {angle > 0 ? `+${angle}` : angle}°
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-5 border border-dashed border-slate-200 rounded-3xl bg-slate-50 flex flex-col items-center justify-center text-center gap-2">
                  <MousePointer2 size={24} className="text-slate-400 animate-bounce" />
                  <p className="text-[11px] font-bold text-slate-500 leading-tight">Oppure seleziona un oggetto specifico nel viewer 3D per attivare la rotazione pivot singola</p>
                </div>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-center gap-3 opacity-30 px-4">
                <MousePointer2 size={48} className="text-slate-400" />
                <p className="text-sm font-bold text-slate-500 leading-tight">Seleziona un oggetto nel modello per visualizzare i parametri</p>
              </div>
            )
          ) : (
            <div className="space-y-6 overflow-y-auto pr-1 flex-1 max-h-[calc(80vh-10rem)] scrollbar-thin">
              <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Nome Elemento</span>
                <div className="text-base font-black text-slate-800 break-words">
                  {(selectedEntity as any).bimName || 'Elemento Non Nominato'}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="flex justify-between items-center px-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID Sistema</span>
                  <span className="text-[13px] font-mono font-bold text-slate-600">{selectedEntity.id.slice(-6)}</span>
                </div>
                <div className="flex justify-between items-center px-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo</span>
                  <span className="text-[11px] font-black text-cyan-600 bg-cyan-50 px-3 py-1 rounded-full uppercase">{(selectedEntity as any).bimType || selectedEntity.type}</span>
                </div>
                {(selectedEntity as any).bimWidth && (
                  <div className="flex justify-between items-center px-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Spessore</span>
                    <span className="text-[13px] font-black text-slate-700">{(selectedEntity as any).bimWidth} cm</span>
                  </div>
                )}
                <div className="flex justify-between items-center px-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Altezza</span>
                  <span className="text-[13px] font-black text-slate-700">{(selectedEntity as any).bimHeight || (selectedEntity as any).height || 270} cm</span>
                </div>
                {((selectedEntity as any).bimType === 'room' || (selectedEntity as any).bimType === 'muro' || (selectedEntity as any).bimAreaType === 'muro' || selectedEntity.type === 'bim-csg') && (
                  <>
                    <div className="flex justify-between items-center px-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Superficie</span>
                      <span className="text-[13px] font-black text-slate-700">
                        {selectedEntity.type === 'bim-csg' ? ((selectedEntity as any).bimArea || 0).toFixed(2) : getRoomAreaMq((selectedEntity as any).bimPoints || (selectedEntity as any).points).toFixed(2)} mq
                      </span>
                    </div>
                    {selectedEntity.type !== 'bim-csg' && (
                      <div className="flex justify-between items-center px-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Perimetro</span>
                        <span className="text-[13px] font-black text-slate-700">{getRoomPerimeterM((selectedEntity as any).bimPoints || (selectedEntity as any).points).toFixed(2)} m</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center px-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Volume</span>
                      <span className="text-[13px] font-black text-slate-700">
                        {selectedEntity.type === 'bim-csg' ? ((selectedEntity as any).bimVolume || 0).toFixed(2) : (getRoomAreaMq((selectedEntity as any).bimPoints || (selectedEntity as any).points) * (((selectedEntity as any).bimHeight || (selectedEntity as any).height || 270) / 100)).toFixed(2)} mc
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => handleOpenClickDialog(selectedEntity)}
                  className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-100 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Edit size={14} /> Modifica Parametri
                </button>
                <button 
                  onClick={() => toggleTransparency(selectedEntity.id)}
                  className={`px-4 py-4 rounded-2xl font-black transition-all flex items-center justify-center cursor-pointer border ${
                    transparentEntities.has(selectedEntity.id) 
                    ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border-indigo-100' 
                    : 'bg-white hover:bg-slate-50 text-slate-400 border-slate-200 shadow-sm'
                  }`}
                  title="Trasparente"
                >
                  {transparentEntities.has(selectedEntity.id) ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button 
                  onClick={() => handleDeleteEntity(selectedEntity.id)}
                  className="px-4 py-4 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-2xl font-black transition-all flex items-center justify-center cursor-pointer border border-rose-100"
                  title="Elimina Oggetto"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* DUPLICA & SPOSTA 3D CONTROL CARD */}
              <div className="bg-slate-50/70 p-4 border border-slate-100 rounded-3xl flex flex-col gap-3 mt-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200/50">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Duplica & Sposta 3D</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono text-slate-400 font-bold">PASSO:</span>
                    <div className="flex items-center gap-1">
                      <input 
                        type="number"
                        value={stepCm} 
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setStepCm(isNaN(val) ? 0 : val);
                        }}
                        className="w-16 text-[10px] font-black bg-white rounded-lg border border-slate-200 px-1.5 py-0.5 outline-none text-slate-700 font-mono text-center focus:border-cyan-500 transition-colors"
                        min="0"
                        step="any"
                        placeholder="Passo"
                      />
                      <span className="text-[9px] font-bold text-slate-400">cm</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-1.5">
                  {/* UP BUTTON */}
                  <button 
                    onClick={() => handleMoveEntity(selectedEntity, 'UP', stepCm)}
                    className="p-2.5 bg-white hover:bg-slate-100 active:scale-95 text-slate-600 hover:text-cyan-500 transition-all rounded-xl border border-slate-200 shadow-sm cursor-pointer"
                    title="Sposta Su (↑)"
                  >
                    <ArrowUp size={16} />
                  </button>
                  
                  <div className="flex gap-2 items-center">
                    {/* LEFT BUTTON */}
                    <button 
                      onClick={() => handleMoveEntity(selectedEntity, 'LEFT', stepCm)}
                      className="p-2.5 bg-white hover:bg-slate-100 active:scale-95 text-slate-600 hover:text-cyan-500 transition-all rounded-xl border border-slate-200 shadow-sm cursor-pointer"
                      title="Sposta Sinistra (←)"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    
                    {/* DUPLICATE BUTTON */}
                    <button 
                      onClick={() => handleDuplicateEntity(selectedEntity)}
                      className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 font-black text-[10px] text-white rounded-xl shadow-md cursor-pointer transition-all active:scale-95 uppercase tracking-wider"
                      title="Duplica Oggetto Selezionato (C)"
                    >
                      Duplica
                    </button>
                    
                    {/* RIGHT BUTTON */}
                    <button 
                      onClick={() => handleMoveEntity(selectedEntity, 'RIGHT', stepCm)}
                      className="p-2.5 bg-white hover:bg-slate-100 active:scale-95 text-slate-600 hover:text-cyan-500 transition-all rounded-xl border border-slate-200 shadow-sm cursor-pointer"
                      title="Sposta Destra (→)"
                    >
                      <ArrowRight size={16} />
                    </button>
                  </div>

                  {/* DOWN BUTTON */}
                  <button 
                    onClick={() => handleMoveEntity(selectedEntity, 'DOWN', stepCm)}
                    className="p-2.5 bg-white hover:bg-slate-100 active:scale-95 text-slate-600 hover:text-cyan-500 transition-all rounded-xl border border-slate-200 shadow-sm cursor-pointer"
                    title="Sposta Giù (↓)"
                  >
                    <ArrowDown size={16} />
                  </button>
                </div>
                
                <p className="text-[8px] text-slate-400 text-center uppercase tracking-wider font-extrabold leading-tight">
                  Usa anche le Frecce della tastiera per muovere, e il tasto 'C' per duplicare!
                </p>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => {
                     setEntities(prev => prev.map(e => {
                        if (e.id === selectedEntity.id) {
                           return { ...e, hideIn2D: !(e as any).hideIn2D };
                        }
                        return e;
                     }));
                     setSelectedEntity({ ...selectedEntity, hideIn2D: !(selectedEntity as any).hideIn2D } as any);
                  }}
                  className={`w-full py-3 px-4 rounded-2xl font-black text-[11px] transition-all flex items-center justify-center gap-2 border cursor-pointer uppercase tracking-widest ${
                    (selectedEntity as any).hideIn2D 
                    ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border-rose-100 shadow-sm' 
                    : 'bg-white hover:bg-slate-50 text-slate-400 border-slate-200'
                  }`}
                >
                  {(selectedEntity as any).hideIn2D ? '🚫 Oggetto non visibile in 2D' : '👁️ Nascondi in Pianta 2D'}
                </button>
              </div>

              {/* STRUMENTI DI ROTAZIONE E TRASLAZIONE VERTICALE */}
              <div className="pt-4 mt-2 border-t border-slate-100 space-y-3">
                <button
                  onClick={() => {
                    setIsRotationMode(!isRotationMode);
                    if (!isRotationMode && selectedEntity) {
                      const e = selectedEntity as any;
                      const pts = e.points || e.bimPoints || null;
                      setOriginalPoints(pts ? [...pts] : null);
                      setOriginalAngle(e.angle || 0);
                      setCurrentRotationVal(e.angle || 0);
                      setSelectedPivotIndex(0);
                    }
                  }}
                  className={`w-full py-3.5 px-4 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 border cursor-pointer uppercase tracking-widest ${
                    isRotationMode 
                    ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-lg shadow-amber-200' 
                    : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200 shadow-sm'
                  }`}
                >
                  <RotateCw size={14} className={isRotationMode ? "animate-spin" : ""} />
                  {isRotationMode ? "Spegni Rotazione" : "Attiva Rotazione"}
                </button>
                
                {isRotationMode && (
                  <div className="p-4 border border-amber-100 bg-amber-50/20 rounded-2xl space-y-4">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                        1. Scegli il Punto Pivot
                      </span>
                      {(() => {
                        const e = selectedEntity as any;
                        const pts = originalPoints || e.points || e.bimPoints;
                        const isSinglePoint = e.bimType === 'door' || e.bimType === 'window' || e.type === 'point';
                        
                        if (isSinglePoint) {
                          return (
                            <div className="text-[10px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200 font-mono">
                              Singolo punto base: X {(e.point?.x || 0).toFixed(0)}, Y {(e.point?.y || 0).toFixed(0)} (Porta/Finestra ruota su se stessa)
                            </div>
                          );
                        }
                        
                        if (!pts || pts.length === 0) {
                          return <div className="text-[10px] text-slate-400">Nessun vertice disponibile.</div>;
                        }
                        
                        return (
                          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                            {pts.map((p: Point, i: number) => (
                              <button
                                key={i}
                                onClick={() => handleSelectPivot(i)}
                                className={`px-2 py-1 rounded-lg text-[9px] font-mono font-bold transition-all ${
                                  selectedPivotIndex === i
                                  ? 'bg-amber-500 text-white shadow-md shadow-amber-100'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                }`}
                              >
                                P{i+1}: ({p.x.toFixed(0)}, {p.y.toFixed(0)})
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>

                    <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3 mb-1">
                      <div className="text-[10px] font-black text-amber-800 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                        {getRotationExplanation().title}
                      </div>
                      <p className="text-[9.5px] text-slate-500 font-medium leading-relaxed">
                        {getRotationExplanation().desc}
                      </p>
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                        <span>2. Angolo di Rotazione</span>
                        <span className="text-amber-600 font-mono text-xs">{currentRotationVal}°</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="360" 
                        step="1" 
                        value={currentRotationVal}
                        onChange={(e) => handleRotate(parseInt(e.target.value, 10))}
                        className="w-full h-1.5 bg-amber-100 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                      <div className="grid grid-cols-4 gap-1 mt-2">
                        {[0, 90, 180, 270].map((angl) => (
                          <button
                            key={angl}
                            onClick={() => handleRotate(angl)}
                            className={`py-1 rounded-md text-[9px] font-black transition-all ${
                              currentRotationVal === angl
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-500'
                            }`}
                          >
                            {angl}°
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-4 gap-1 mt-1">
                        {[-90, -45, 45, 90].map((offset) => (
                          <button
                            key={offset}
                            onClick={() => {
                              let newVal = (currentRotationVal + offset) % 360;
                              if (newVal < 0) newVal += 360;
                              handleRotate(newVal);
                            }}
                            className="py-1 rounded-md text-[9px] font-black bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200/50"
                          >
                            {offset > 0 ? `+${offset}` : offset}°
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                        <span>3. Altezza Verticale (Z)</span>
                        <span className="text-cyan-600 font-mono text-xs">{(selectedEntity as any).bimZElevation || 0} cm</span>
                      </div>
                      <input 
                        type="range" 
                        min="-200" 
                        max="400" 
                        step="5" 
                        value={(selectedEntity as any).bimZElevation || 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setEntities((prev: any[]) => prev.map(item => {
                            if (item.id === selectedEntity.id) {
                              return { ...item, bimZElevation: val };
                            }
                            return item;
                          }));
                          setSelectedEntity(prev => prev ? { ...prev, bimZElevation: val } as any : null);
                        }}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      />
                      <div className="grid grid-cols-5 gap-1 mt-2">
                        {[-50, 0, 50, 100, 200].map((hgt) => (
                          <button
                            key={hgt}
                            onClick={() => {
                              setEntities((prev: any[]) => prev.map(item => {
                                if (item.id === selectedEntity.id) {
                                  return { ...item, bimZElevation: hgt };
                                }
                                return item;
                              }));
                              setSelectedEntity(prev => prev ? { ...prev, bimZElevation: hgt } as any : null);
                            }}
                            className={`py-1 rounded-md text-[9px] font-mono font-bold transition-all ${
                              ((selectedEntity as any).bimZElevation || 0) === hgt
                              ? 'bg-cyan-100 text-cyan-700'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-500'
                            }`}
                          >
                            {hgt > 0 ? `+${hgt}` : hgt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 mt-2 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                    <Layers size={12} /> Operazioni Solidi (CSG)
                  </span>
                </div>
                <div className="p-3 border border-indigo-100 bg-indigo-50/30 rounded-xl space-y-3 transition-all">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">A: {(selectedEntity as any).bimName || selectedEntity.type}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      B: {csgTargetEntity ? <span className="text-cyan-700">{(csgTargetEntity as any).bimName || csgTargetEntity.type}</span> : <span className="text-indigo-400 animate-pulse">Shift+Clic per selezionare l'oggetto B</span>}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button 
                      disabled={!csgTargetEntity} 
                      onClick={() => executeCSG('union')} 
                      className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-transform ${csgTargetEntity ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white shadow-md shadow-indigo-200 cursor-pointer active:scale-95' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                    >
                      Unione (+)
                    </button>
                    <button 
                      disabled={!csgTargetEntity} 
                      onClick={() => executeCSG('subtract')} 
                      className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-transform ${csgTargetEntity ? 'bg-gradient-to-br from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white shadow-md shadow-rose-200 cursor-pointer active:scale-95' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                    >
                      Sottrai (-)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Model Stats Panel */}
      <div className="absolute top-24 left-8 z-50 p-6 bg-white/90 backdrop-blur-xl rounded-[2rem] shadow-xl border border-slate-100 w-64 pointer-events-auto">
        <div className="flex items-center gap-3 mb-5 pb-3 border-b border-slate-50">
          <div className="p-2 bg-slate-100 rounded-lg text-slate-500">
            <Layers size={16} />
          </div>
          <span className="text-xs font-black text-slate-800 tracking-tight uppercase">Statistiche BIM</span>
        </div>
        
        <div className="space-y-4">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Oggetti Totali</span>
            <span className="text-lg font-black text-slate-800">{bimEntities.length}</span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Muri / Volume</span>
            <span className="text-lg font-black text-cyan-500">{bimEntities.filter(e => e.bimType === 'wall').length}</span>
          </div>
        </div>
      </div>

      {/* Navigation Help */}
      <div className="absolute bottom-8 right-8 z-50 flex items-center gap-4 bg-white/80 backdrop-blur-xl p-3 px-6 rounded-full border border-slate-200 shadow-lg pointer-events-auto">
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
          <div className="bg-slate-100 px-2 py-1 rounded border-b-2 border-slate-300">Click</div> SELEZIONA
        </div>
        <div className="w-px h-4 bg-slate-200" />
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
          <div className="bg-slate-100 px-2 py-1 rounded border-b-2 border-slate-300">Destro</div> PAN
        </div>
      </div>

      {/* 3D SCENE CANVAS */}
      <div className={`flex-1 cursor-crosshair transition-colors duration-1000 ${isRealistic ? 'bg-gradient-to-b from-sky-100 to-white' : 'bg-[#fdfdfd]'}`}>
        <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, alpha: true, localClippingEnabled: true }}>
          {isRealistic ? (
             <Environment preset="apartment" background blur={0.8} />
          ) : (
             <Environment preset="city" />
          )}
          {cameraViewMode === 'ISO' ? (
            <PerspectiveCamera 
              key="perspective-cam"
              makeDefault 
              position={[10, 10, 10]} 
              fov={45} 
              near={0.01} 
              far={2000} 
            />
          ) : (
            <OrthographicCamera
              key="ortho-cam"
              makeDefault
              position={[0, 0, 100]}
              zoom={50}
              near={0.01}
              far={2000}
            />
          )}
          <OrbitControls 
            enableDamping 
            dampingFactor={0.06} 
            maxPolarAngle={viewMode === 'TOP' ? 0 : Math.PI / 1.8} 
            minDistance={0.1}
            maxDistance={500}
            makeDefault
          />
          
          <ambientLight intensity={isRealistic ? 0.6 : 0.4} />
          <directionalLight 
            position={[10, 20, 15]} 
            intensity={isRealistic ? 2.0 : 1.2} 
            castShadow 
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0001}
          />

          {isSlicing && (
            <group position={[0, slicingHeight, 0]}>
              {slicingMode === 'WINDOW' && (
                <>
                  <mesh position={[0, windowThickness/2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[100, 100]} />
                    <meshStandardMaterial color="#6366f1" transparent opacity={0.03} depthWrite={false} />
                  </mesh>
                  <mesh position={[0, -windowThickness/2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[100, 100]} />
                    <meshStandardMaterial color="#6366f1" transparent opacity={0.03} depthWrite={false} />
                  </mesh>
                </>
              )}
              
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[100, 100]} />
                <meshStandardMaterial 
                  color="#6366f1" 
                  transparent 
                  opacity={0.08} 
                  depthWrite={false}
                  emissive="#818cf8"
                  emissiveIntensity={0.5}
                />
              </mesh>
              <Grid 
                infiniteGrid 
                cellSize={0.2} 
                sectionSize={1} 
                sectionColor={slicingMode === 'WINDOW' ? "#f59e0b" : "#a5b4fc"} 
                cellColor="#818cf8" 
                sectionThickness={1.5}
                fadeDistance={40}
              />
              {/* Scan Line Detail */}
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0, 50, 4]} />
                <meshStandardMaterial color={slicingMode === 'WINDOW' ? "#f59e0b" : "#4f46e1"} transparent opacity={0.1} />
              </mesh>
            </group>
          )}
          
          <ContactShadows 
            position={[0, 0, 0]} 
            opacity={0.4} 
            scale={40} 
            blur={2} 
            far={4} 
            color="#0f172a" 
          />
          
          <Grid 
            infiniteGrid 
            fadeDistance={50} 
            fadeStrength={3} 
            cellSize={1} 
            sectionSize={5} 
            sectionColor="#cbd5e1" 
            cellColor="#f1f5f9" 
            sectionThickness={1.2}
          />
          
          <group>
            <ReferencePlan entities={entities} />
            <SceneCameraController 
              entities={bimEntities} 
              resetTrigger={resetTrigger} 
              cameraPreset={cameraPreset} 
              cameraViewMode={cameraViewMode}
              onPresetProcessed={() => {
                if (cameraPreset) {
                  setCameraViewMode(cameraPreset);
                  setCameraPreset(null);
                }
              }}
            />
            {isRotationMode && selectedEntity && (
              <RotationPivotHelpers 
                entity={selectedEntity} 
                pivotIndex={selectedPivotIndex} 
                onSelectPivot={handleSelectPivot} 
              />
            )}
            {bimEntities.map((entity) => {
              let points: Point[] = [];
              if (entity.type === 'line') {
                points = [(entity as LineEntity).start, (entity as LineEntity).end];
              } else if (entity.type === 'rectangle') {
                const r = entity as RectEntity;
                points = [
                  r.p1, 
                  { x: r.p2.x, y: r.p1.y }, 
                  r.p2, 
                  { x: r.p1.x, y: r.p2.y },
                  r.p1
                ];
              } else {
                points = (entity as any).points || (entity as any).bimPoints || [];
              }

              if (points.length < 2 && entity.type !== 'point' && entity.type !== 'bim-csg') return null;

              const isMuro = entity.bimType === 'wall' || (entity as any).bimAreaType === 'muro';
              const isSelected = selectedEntity?.id === entity.id;
              const isHovered = hoveredId === entity.id;
              const color = isSelected ? '#06b6d4' : (entity.color || (isMuro ? '#f8fafc' : '#3b82f6'));
              const entityOpacity = (entity as any).hideIn2D ? 0.08 : (transparentEntities.has(entity.id) ? 0.3 : 1);

              const e = entity as any;
              
              // Pivot calculation for dynamic 3D nested rotation (Front, Side or Top planes)
              const pivotIdx = isSelected ? selectedPivotIndex : 0;
              const pCAD = points[pivotIdx] || e.point || { x: 0, y: 0 };
              const baseElevation = (e.bimZPlane || 0) + (e.bimZElevation || 0);
              
              const px = pCAD.x / 100;
              const py = baseElevation / 100;
              const pz = -pCAD.y / 100;

              const rx = (e.rotationX || 0) * Math.PI / 180;
              const ry = (e.rotationY || 0) * Math.PI / 180;
              const rz = (e.rotationZ || 0) * Math.PI / 180;

              return (
                <group 
                  key={entity.id} 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey) {
                      handleSelectSecondary(entity);
                    } else {
                      handleSelect(entity);
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handleSelect(entity);
                    handleOpenClickDialog(entity);
                  }}
                  onPointerOver={(e) => { e.stopPropagation(); setHoveredId(entity.id); }}
                  onPointerOut={(e) => { e.stopPropagation(); setHoveredId(null); }}
                >
                  <group position={[px, py, pz]} rotation={[rx, ry, rz]}>
                    <group position={[-px, -py, -pz]}>
                      {(() => {
                        const baseZ = (e.bimZPlane || 0) + (e.bimZElevation || 0);
                        const heightValue = e.bimHeight || e.height || 270;
                        
                        if (entity.type === 'bim-csg') {
                          return <CSGMeshRender entity={entity} color={color} clippingPlanes={clippingPlanes} opacity={entityOpacity} />;
                        } else if (isMuro) {
                          return points.length >= 3 && (entity as any).type === 'hatch' ? (
                            <Room points={points} holes={e.holes} height={heightValue} color={color} areaType="muro" baseZ={baseZ} clippingPlanes={clippingPlanes} opacity={entityOpacity} />
                          ) : (
                            <Wall points={points} height={heightValue} width={e.bimWidth} color={color} baseZ={baseZ} clippingPlanes={clippingPlanes} opacity={entityOpacity} />
                          );
                        } else if (entity.bimType === 'room') {
                          return (
                            <Room 
                              points={points} 
                              holes={e.holes}
                              height={heightValue} 
                              color={color} 
                              name={e.bimName}
                              baseZ={baseZ}
                              clippingPlanes={clippingPlanes}
                              opacity={entityOpacity}
                            />
                          );
                        } else if (entity.bimType === 'door' || entity.bimType === 'window') {
                          return <BIMSymbol entity={{ ...entity, color, isHovered }} clippingPlanes={clippingPlanes} opacity={entityOpacity} />;
                        }
                        return null;
                      })()}
                    </group>
                  </group>
                  {isHovered && <Edges color="cyan" />}
                </group>
              );
            })}
          </group>
        </Canvas>
      </div>

      {/* Parameter Editing Dialogs */}
      {isAreaEditOpen && selectedEntity && (
        <AreaFunzionaleDialog
          isOpen={isAreaEditOpen}
          onClose={() => {
            setIsAreaEditOpen(false);
            setEditingEntityId(null);
          }}
          onConfirm={handleConfirmAreaEdit}
          points={((selectedEntity as any).bimPoints || (selectedEntity as any).points || [])}
          initialData={{
            type: (selectedEntity as any).bimAreaType || 'stanza',
            name: (selectedEntity as any).bimName || '',
            color: (selectedEntity as any).backgroundColor || selectedEntity.color || '#3b82f6',
            zPlane: (selectedEntity as any).bimZPlane || 0,
            zElevation: (selectedEntity as any).bimZElevation || 0,
            objectHeight: (selectedEntity as any).bimHeight || (selectedEntity as any).height || 270,
            hatch: (selectedEntity as any).bimHatchPattern || 'SOLID'
          }}
          onDelete={() => handleDeleteEntity(selectedEntity.id)}
        />
      )}

      {isDoorEditOpen && selectedEntity && (
        <PorteDialog
          isOpen={isDoorEditOpen}
          onClose={() => {
            setIsDoorEditOpen(false);
            setEditingEntityId(null);
          }}
          lastDoorWidth={(selectedEntity as any).bimWidth || 80}
          lastDoorHeight={(selectedEntity as any).bimHeight || (selectedEntity as any).height || 210}
          onConfirmDoor={handleConfirmDoorEdit}
          onDelete={() => handleDeleteEntity(selectedEntity.id)}
        />
      )}

      {isWindowEditOpen && selectedEntity && (
        <FinestreDialog
          isOpen={isWindowEditOpen}
          onClose={() => {
            setIsWindowEditOpen(false);
            setEditingEntityId(null);
          }}
          lastWindowWidth={(selectedEntity as any).bimWidth || 120}
          lastWindowHeight={(selectedEntity as any).bimWindowHeight || (selectedEntity as any).height || 140}
          onConfirmWindow={handleConfirmWindowEdit}
          onDelete={() => handleDeleteEntity(selectedEntity.id)}
        />
      )}

      {/* Selection Glow Indicator */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="w-16 h-16 border border-slate-300/20 rounded-full flex items-center justify-center">
          <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-ping" />
        </div>
      </div>
    </div>
  );
};


