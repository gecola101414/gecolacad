import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid, Stars, Float, Text, Html, ContactShadows, Environment, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Entity, Point, LineEntity, RectEntity } from '../types';
import { X, ZoomIn, ZoomOut, RotateCw, Box, Layers, Database, Maximize, Home, Compass, Eye, Info, Settings, MousePointer2, Move } from 'lucide-react';

interface BIM3DViewerProps {
  entities: Entity[];
  onClose: () => void;
}

const Wall = ({ points, height, width, color }: { points: Point[], height: number, width?: number, color: string }) => {
  const segments = useMemo(() => {
    const result = [];
    const h = height / 100; // Convert to meters
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
        position: [centerX / 100, h / 2, -centerY / 100] as [number, number, number],
        rotation: [0, -angle, 0] as [number, number, number],
        args: [length / 100, h, (width || 15) / 100] as [number, number, number],
      });
    }
    return result;
  }, [points, height, width]);

  return (
    <group>
      {segments.map((seg, i) => (
        <mesh key={i} position={seg.position} rotation={seg.rotation} castShadow receiveShadow>
          <boxGeometry args={seg.args} />
          <meshStandardMaterial 
            color={color} 
            metalness={0.15} 
            roughness={0.4} 
            envMapIntensity={1}
          />
          <Edges color="#1e293b" threshold={15} />
        </mesh>
      ))}
    </group>
  );
};

const Room = ({ points, height, color, name, areaType }: { points: Point[], height: number, color: string, name?: string, areaType?: string }) => {
  const h = height / 100; // Convert to meters
  const shape = useMemo(() => {
    if (!points || points.length < 3) return null;
    const s = new THREE.Shape();
    s.moveTo(points[0].x / 100, -points[0].y / 100);
    for (let i = 1; i < points.length; i++) {
      s.lineTo(points[i].x / 100, -points[i].y / 100);
    }
    s.closePath();
    return s;
  }, [points]);

  if (!shape) return null;

  const extrudeSettings = {
    steps: 1,
    depth: h,
    bevelEnabled: false
  };

  const center = useMemo(() => {
    let sx = 0, sy = 0;
    points.forEach(p => { sx += p.x; sy += p.y; });
    return [sx / (points.length * 100), h + 0.05, -sy / (points.length * 100)] as [number, number, number];
  }, [points, h]);

  const isWall = areaType === 'muro';

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshStandardMaterial 
          color={color} 
          transparent={!isWall} 
          opacity={isWall ? 0.95 : 0.25} 
          metalness={isWall ? 0.3 : 0.1}
          roughness={isWall ? 0.4 : 0.3}
          envMapIntensity={1.2}
        />
        <Edges color="#1e293b" threshold={15} />
      </mesh>
      
      {/* Floor Highlight */}
      {!isWall && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial color={color} transparent opacity={0.4} />
        </mesh>
      )}

      {name && (
        <Text
          position={center}
          fontSize={0.16}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#0f172a"
        >
          {name}
        </Text>
      )}
    </group>
  );
};

const BIMSymbol = ({ entity, onPointerOver, onPointerOut }: { entity: any, onPointerOver?: () => void, onPointerOut?: () => void }) => {
  const { bimType, points, point, bimHeight = 210, bimWidth = 90, bimWindowHeight = 120, isHovered } = entity;
  const p = point || (points && points[0]);
  if (!p) return null;

  const color = entity.color || (bimType === 'door' ? '#ef4444' : '#3b82f6');
  const h = (bimType === 'door' ? bimHeight : bimWindowHeight) / 100;
  const w = (bimWidth || 90) / 100;
  const zPos = bimType === 'door' ? h / 2 : 1.5;
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
        opacity={isHovered ? 0.9 : 0.6} 
        metalness={0.4} 
        roughness={0.3} 
        emissive={isHovered ? color : '#000000'}
        emissiveIntensity={isHovered ? 0.2 : 0}
      />
      <Edges color={isHovered ? "cyan" : "white"} />
    </mesh>
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
        box.expandByPoint(new THREE.Vector3(p.x / 100, 0, -p.y / 100));
        const entityHeight = ((entity as any).height || (entity as any).bimHeight || 270) / 100;
        box.expandByPoint(new THREE.Vector3(p.x / 100, entityHeight, -p.y / 100));
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
  }, [entities, camera, controls, resetTrigger]);

  return null;
};

export const BIM3DViewer: React.FC<BIM3DViewerProps> = ({ entities, onClose }) => {
  const [resetTrigger, setResetTrigger] = useState(0);
  const [viewMode, setViewMode] = useState<'PERSPECTIVE' | 'TOP'>('PERSPECTIVE');
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
        
        <div className="flex items-center px-5 gap-3 h-10 bg-slate-50/50 rounded-xl border border-slate-100">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
          <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] font-mono">BIM ENGINE LIVE</span>
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

              <button className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-100">
                Modifica Parametri
              </button>
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
      <div className="flex-1 cursor-crosshair">
        <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
          <Environment preset="city" />
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
          
          <ambientLight intensity={0.4} />
          <directionalLight 
            position={[10, 20, 15]} 
            intensity={1.2} 
            castShadow 
            shadow-mapSize={[2048, 2048]}
          />
          
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

              return (
                <group 
                  key={entity.id} 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(entity);
                  }}
                  onPointerOver={(e) => { e.stopPropagation(); setHoveredId(entity.id); }}
                  onPointerOut={(e) => { e.stopPropagation(); setHoveredId(null); }}
                >
                  {isMuro ? (
                    points.length >= 3 && (entity as any).type === 'hatch' ? (
                      <Room points={points} height={(entity as any).bimHeight || 270} color={color} areaType="muro" />
                    ) : (
                      <Wall points={points} height={(entity as any).bimHeight || 270} width={(entity as any).bimWidth} color={color} />
                    )
                  ) : entity.bimType === 'room' ? (
                    <Room 
                      points={points} 
                      height={(entity as any).bimHeight || 270} 
                      color={color} 
                      name={entity.bimName}
                    />
                  ) : entity.bimType === 'door' || entity.bimType === 'window' ? (
                    <BIMSymbol entity={{ ...entity, color, isHovered }} />
                  ) : null}
                  {isHovered && <Edges color="cyan" />}
                </group>
              );
            })}
          </group>
        </Canvas>
      </div>

      {/* Selection Glow Indicator */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="w-16 h-16 border border-slate-300/20 rounded-full flex items-center justify-center">
          <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-ping" />
        </div>
      </div>
    </div>
  );
};


