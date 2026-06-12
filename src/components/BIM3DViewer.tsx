import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid, Stars, Float, Text, Html, ContactShadows, Environment, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Entity, Point, LineEntity, RectEntity } from '../types';
import { X, ZoomIn, ZoomOut, RotateCw, Box, Layers, Database, Maximize, Home, Compass, Eye, EyeOff, Info, Settings, MousePointer2, Move, Scissors, Play, Pause, RefreshCw, ArrowDown, ArrowUp, Edit, Trash2, Wand2 } from 'lucide-react';
import { AreaFunzionaleDialog, PorteDialog, FinestreDialog } from './BIMDialogs';

interface BIM3DViewerProps {
  entities: Entity[];
  onClose: () => void;
  setEntities: React.Dispatch<React.SetStateAction<Entity[]>> | ((updater: (prev: Entity[]) => Entity[]) => void);
}

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

const SceneAutoFit = ({ entities, resetTrigger }: { entities: Entity[], resetTrigger: number }) => {
  const { camera, controls } = useThree();

  useEffect(() => {
    if (!entities || entities.length === 0) return;

    const box = new THREE.Box3();
    let hasValidBounds = false;

    entities.forEach(entity => {
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
    });

    if (!hasValidBounds) return;

    const center = new THREE.Vector3();
    box.getCenter(center);
    
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const cameraFOV = (camera as THREE.PerspectiveCamera).fov || 50;
    const distance = maxDim / (2 * Math.tan((Math.PI * cameraFOV) / 360)) || 5;
    
    const offset = Math.max(distance * 1.5, 4);
    
    camera.position.set(center.x + offset, center.y + offset * 0.8, center.z + offset);
    camera.lookAt(center);

    if (controls) {
      (controls as any).target.set(center.x, center.y, center.z);
      (controls as any).update();
    }
  }, [camera, controls, resetTrigger]);

  return null;
};

export const BIM3DViewer: React.FC<BIM3DViewerProps> = ({ entities, onClose, setEntities }) => {
  const [resetTrigger, setResetTrigger] = useState(0);
  const [viewMode, setViewMode] = useState<'PERSPECTIVE' | 'TOP'>('PERSPECTIVE');
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  
  // Dialog States
  const [isAreaEditOpen, setIsAreaEditOpen] = useState(false);
  const [isDoorEditOpen, setIsDoorEditOpen] = useState(false);
  const [isWindowEditOpen, setIsWindowEditOpen] = useState(false);
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [isRealistic, setIsRealistic] = useState(false);
  const [transparentEntities, setTransparentEntities] = useState<Set<string>>(new Set());

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
    setInspectorOpen(true);
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

      {/* Side Properties Inspector (Dalux Inspired) */}
      <div className={`absolute top-24 right-8 z-[60] w-80 bg-white/95 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] border border-slate-100 transition-all duration-500 transform pointer-events-auto ${inspectorOpen ? 'translate-x-0 opacity-100' : 'translate-x-[120%] opacity-0'}`}>
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-cyan-500 rounded-2xl text-white shadow-lg shadow-cyan-100">
                <Info size={20} />
              </div>
              <h3 className="font-black text-slate-800 text-lg tracking-tight">Proprietà</h3>
            </div>
            <button onClick={() => setInspectorOpen(false)} className="text-slate-300 hover:text-slate-600 transition-colors">
              <X size={20} />
            </button>
          </div>

          {!selectedEntity ? (
            <div className="h-64 flex flex-col items-center justify-center text-center gap-3 opacity-30 px-4">
              <MousePointer2 size={48} className="text-slate-400" />
              <p className="text-sm font-bold text-slate-500 leading-tight">Seleziona un oggetto nel modello per visualizzare i parametri</p>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
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
          <PerspectiveCamera 
            makeDefault 
            position={[10, 10, 10]} 
            fov={45} 
            near={0.01} 
            far={2000} 
          />
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
            <SceneAutoFit entities={bimEntities} resetTrigger={resetTrigger} />
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

              if (points.length < 2 && entity.type !== 'point') return null;

              const isMuro = entity.bimType === 'wall' || (entity as any).bimAreaType === 'muro';
              const isSelected = selectedEntity?.id === entity.id;
              const isHovered = hoveredId === entity.id;
              const color = isSelected ? '#06b6d4' : (entity.color || (isMuro ? '#f8fafc' : '#3b82f6'));
              const entityOpacity = transparentEntities.has(entity.id) ? 0.3 : ((entity as any).cadVisible === false ? 0.05 : 1);

              return (
                <group 
                  key={entity.id} 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(entity);
                    handleOpenClickDialog(entity);
                  }}
                  onPointerOver={(e) => { e.stopPropagation(); setHoveredId(entity.id); }}
                  onPointerOut={(e) => { e.stopPropagation(); setHoveredId(null); }}
                >
                  {(() => {
                    const e = entity as any;
                    const baseZ = (e.bimZPlane || 0) + (e.bimZElevation || 0);
                    const heightValue = e.bimHeight || e.height || 270;
                    
                    if (isMuro) {
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


