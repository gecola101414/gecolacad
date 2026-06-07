import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid, Stars, Float, Text, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Entity, Point } from '../types';
import { X, ZoomIn, ZoomOut, RotateCw, Box, Layers, Database } from 'lucide-react';

interface BIM3DViewerProps {
  entities: Entity[];
  onClose: () => void;
}

const Wall = ({ points, height, color, bimName }: { points: Point[], height: number, color: string, bimName?: string }) => {
  if (points.length < 2) return null;

  const segments = useMemo(() => {
    const result = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i+1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const centerX = (p1.x + p2.x) / 2;
      const centerY = (p1.y + p2.y) / 2;
      
      result.push({
        position: [centerX, height / 2, -centerY] as [number, number, number],
        rotation: [0, -angle, 0] as [number, number, number],
        args: [length, height, 0.15] as [number, number, number], // 15cm wall thickness
      });
    }
    return result;
  }, [points, height]);

  return (
    <group>
      {segments.map((seg, i) => (
        <mesh key={i} position={seg.position} rotation={seg.rotation}>
          <boxGeometry args={seg.args} />
          <meshStandardMaterial color={color} transparent opacity={0.8} metalness={0.2} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
};

const Room = ({ points, height, color, name, areaType }: { points: Point[], height: number, color: string, name?: string, areaType?: string }) => {
  const shape = useMemo(() => {
    if (!points || points.length < 3) return null;
    const s = new THREE.Shape();
    s.moveTo(points[0].x, -points[0].y);
    for (let i = 1; i < points.length; i++) {
      s.lineTo(points[i].x, -points[i].y);
    }
    s.closePath();
    return s;
  }, [points]);

  if (!shape) return null;

  const extrudeSettings = {
    steps: 1,
    depth: height,
    bevelEnabled: false
  };

  // Center for text label
  const center = useMemo(() => {
    let sx = 0, sy = 0;
    points.forEach(p => { sx += p.x; sy += p.y; });
    return [sx / points.length, height + 0.5, -sy / points.length] as [number, number, number];
  }, [points, height]);

  const isWall = areaType === 'muro';

  return (
    <group>
      {/* Extruded Volume */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshStandardMaterial 
          color={color} 
          transparent={!isWall} 
          opacity={isWall ? 1.0 : 0.25} 
          metalness={isWall ? 0.3 : 0}
          roughness={0.7}
        />
      </mesh>
      
      {/* Floor Highlight */}
      {!isWall && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial color={color} transparent opacity={0.4} />
        </mesh>
      )}

      {/* Label */}
      {name && (
        <Text
          position={center}
          fontSize={0.4}
          color="white"
          anchorX="center"
          anchorY="middle"
          rotation={[0, 0, 0]}
          outlineWidth={0.05}
          outlineColor="#334155"
        >
          {name}
        </Text>
      )}
    </group>
  );
};

const BIMSymbol = ({ entity }: { entity: any }) => {
  const { bimType, points, point, bimHeight = 2.1, bimWidth = 0.9, bimWindowHeight = 1.2 } = entity;
  const p = point || (points && points[0]);
  if (!p) return null;

  const color = bimType === 'door' ? '#8b4513' : '#add8e6';
  const pos: [number, number, number] = [p.x, bimType === 'door' ? bimHeight / 2 : 1.5, -p.y];
  
  return (
    <mesh position={pos}>
      <boxGeometry args={[bimWidth, bimType === 'door' ? bimHeight : bimWindowHeight, 0.2]} />
      <meshStandardMaterial color={color} transparent opacity={0.7} />
    </mesh>
  );
};

export const BIM3DViewer: React.FC<BIM3DViewerProps> = ({ entities, onClose }) => {
  const bimEntities = useMemo(() => {
    return entities.filter(e => e.isBIM);
  }, [entities]);

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950 flex flex-col">
      {/* HUD Header */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-10 pointer-events-none">
        <div className="flex flex-col gap-1 pointer-events-auto">
          <div className="flex items-center gap-3">
             <div className="bg-cyan-500 p-2 rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.5)]">
               <Box className="text-slate-950" size={24} />
             </div>
             <div>
               <h2 className="text-xl font-black text-white tracking-widest uppercase font-mono">BIM 3D ENGINE</h2>
               <div className="flex items-center gap-2 text-[10px] text-cyan-400 font-bold uppercase tracking-tighter">
                 <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                 REAL-TIME MODEL PERSPECTIVE
               </div>
             </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="flex items-center bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-xl p-1 shadow-2xl">
            <button className="p-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all" title="Reset Camera">
              <RotateCw size={18} />
            </button>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button className="p-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">
              <ZoomIn size={18} />
            </button>
            <button className="p-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">
              <ZoomOut size={18} />
            </button>
          </div>

          <button 
            onClick={onClose}
            className="bg-red-500/10 hover:bg-red-500 border border-red-500/50 text-red-500 hover:text-white p-3 rounded-xl transition-all shadow-xl"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* BIM Stats Mini-Panel */}
      <div className="absolute bottom-6 left-6 z-10 pointer-events-auto">
        <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 p-5 rounded-2xl shadow-2xl min-w-[200px]">
          <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
            <Database size={14} className="text-cyan-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Model Metadata</span>
          </div>
          <div className="space-y-3">
             <div className="flex justify-between items-center text-xs">
               <span className="text-slate-500 font-medium">BIM Objects:</span>
               <span className="text-white font-mono font-bold">{bimEntities.length}</span>
             </div>
             <div className="flex justify-between items-center text-xs">
               <span className="text-slate-500 font-medium">Wall Volume:</span>
               <span className="text-cyan-400 font-mono font-bold">~{bimEntities.filter(e => (e as any).bimAreaType === 'muro').length * 2.7} m³</span>
             </div>
             <div className="flex justify-between items-center text-xs">
               <span className="text-slate-500 font-medium">Render Quality:</span>
               <span className="text-emerald-400 font-bold uppercase text-[9px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Optimized</span>
             </div>
          </div>
        </div>
      </div>

      {/* 3D Scene */}
      <div className="flex-1 cursor-move">
        <Canvas shadows dpr={[1, 2]}>
          <PerspectiveCamera makeDefault position={[10, 10, 10]} fov={50} />
          <OrbitControls 
            enableDamping 
            dampingFactor={0.05} 
            maxPolarAngle={Math.PI / 2.1} 
            minDistance={2}
            maxDistance={50}
          />
          
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1} castShadow />
          <directionalLight position={[-10, 20, 10]} intensity={0.5} />
          
          {/* Ground Grid */}
          <Grid 
            args={[100, 100]} 
            sectionColor="#1e293b" 
            cellColor="#334155" 
            sectionSize={5} 
            sectionThickness={1.5}
            cellSize={1}
            cellThickness={0.5}
            infiniteGrid
            fadeDistance={50}
          />

          {/* Model Entities */}
          <group>
            {bimEntities.map((entity) => {
              const points = entity.points || (entity as any).bimPoints || [];
              if (points.length < 2) return null;

              if (entity.bimType === 'wall' || (entity as any).bimAreaType === 'muro') {
                // If it's a closed area (muro functional area), render as extruded volume
                if (points.length >= 3 && (entity as any).type === 'hatch') {
                   return (
                    <Room 
                      key={entity.id} 
                      points={points} 
                      height={(entity as any).height || entity.bimHeight || 2.7}
                      color={entity.color || '#64748b'}
                      name={entity.bimName}
                      areaType="muro"
                    />
                  );
                }
                // If it's just a line (polyline walls), render as segments
                return (
                  <Wall 
                    key={entity.id} 
                    points={points} 
                    height={(entity as any).height || entity.bimHeight || 2.7}
                    color={entity.color || '#64748b'}
                    bimName={entity.bimName}
                  />
                );
              }
              if (entity.bimType === 'room' || (entity as any).bimAreaType === 'stanza') {
                return (
                  <Room 
                    key={entity.id} 
                    points={entity.points || (entity as any).bimPoints || []} 
                    height={(entity as any).height || entity.bimHeight || 2.7}
                    color={(entity as any).backgroundColor || '#3b82f6'}
                    name={entity.bimName}
                    areaType={(entity as any).bimAreaType}
                  />
                );
              }
              if (entity.bimType === 'door' || entity.bimType === 'window') {
                return <BIMSymbol key={entity.id} entity={entity} />;
              }
              return null;
            })}
          </group>
          
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        </Canvas>
      </div>

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="w-12 h-12 border border-white/5 rounded-full flex items-center justify-center opacity-20">
          <div className="w-1 h-1 bg-white rounded-full" />
        </div>
      </div>
    </div>
  );
};
