import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, OrthographicCamera, Grid, Stars, Float, Text, Html, ContactShadows, Environment, Edges, GizmoHelper, GizmoViewcube, Line } from '@react-three/drei';

import * as THREE from 'three';
import { Entity, Point, LineEntity, RectEntity, Floor, CircleEntity, ArcEntity, TextEntity, DimensionEntity, PointEntity, HatchEntity, ImageEntity, BIMRenderingStyle } from '../types';
import { createBIMMaterialTexture } from '../utils/materialTextures';
import { motion, AnimatePresence } from 'motion/react';
import { X, ZoomIn, ZoomOut, RotateCw, Box, Layers, Database, Maximize, Home, Compass, Eye, EyeOff, Lightbulb, LightbulbOff, Info, Settings, MousePointer2, Move, Scissors, Play, Pause, RefreshCw, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Edit, Trash2, Wand2, Lock, Unlock, FolderTree, ChevronDown, ChevronRight, Sliders, Layers3, Camera, Sparkles, Zap, Activity, CheckCircle2, Target, Filter, Building, Link, Check } from 'lucide-react';
import { BIMElementDialog, PorteDialog, FinestreDialog } from './BIMDialogs';
import { BIMPropertyCardDialog } from './BIMPropertyCardDialog';
import { PREZZARIO_GECOLA } from '../data/prezzario';
import { BIM_FAMILIES } from '../data/bimFamilies';
import polygonClipping from 'polygon-clipping';


interface BIM3DViewerProps {
  entities: Entity[];
  onClose: () => void;
  setEntities: React.Dispatch<React.SetStateAction<Entity[]>> | ((updater: (prev: Entity[]) => Entity[]) => void);
  floors?: Floor[];
  isStratifiedView: boolean;
  setIsStratifiedView: (val: boolean) => void;
  isFaceSurveyMode?: boolean;
  onCreateFaceFinish?: (points: Point[], isLinear: boolean, zPlane: number, objectHeight: number, faceData?: any) => void;
  onShowToast?: (msg: string) => void;
  onSelectForRotation?: (id: string | null) => void;
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

const isCoatingElement = (e: any): boolean => {
  const nameLower = (e.bimName || e.name || '').toLowerCase();
  const familyLower = (e.bimFamily || e.bimAreaType || e.bimFamilyId || '').toLowerCase();
  return familyLower.includes('intonac') || 
         familyLower.includes('rivest') ||
         familyLower.includes('pittur') ||
         familyLower.includes('tinteg') ||
         familyLower.includes('isolam') ||
         familyLower.includes('cappott') ||
         familyLower.includes('finitur') ||
         familyLower.includes('plaster') ||
         nameLower.includes('intonac') ||
         nameLower.includes('rivest') ||
         nameLower.includes('pittur') ||
         nameLower.includes('tinteg') ||
         nameLower.includes('cappott') ||
         nameLower.includes('isolam');
};

const getCoincidentStackedOffset = (e: any, entities: any[]): { offsetZ: number, baseWallWidth: number } => {
  const isCoating = isCoatingElement(e);
  if (!isCoating) {
    return { offsetZ: 0, baseWallWidth: 0 };
  }

  if (e.isFaceAligned) {
    const thisThickness = (e.bimWidth || e.width || 2) / 100;
    const sideSign = e.sideSign !== undefined ? e.sideSign : 1;
    // For face-aligned elements (traced directly in 3D), the points are already at the outer face.
    // We only need to shift by half its own thickness plus a tiny gap (1.5mm) for Z-fighting in the normal direction.
    const offsetZ = (thisThickness / 2 + 0.0015) * sideSign;
    return { offsetZ, baseWallWidth: 0 };
  }

  const ePoints = e.bimPoints || e.points || [];
  if (ePoints.length < 2) return { offsetZ: 0, baseWallWidth: 0 };

  const firstPt = ePoints[0];
  const lastPt = ePoints[ePoints.length - 1];

  // Find the coincident base wall
  let baseWall: any = null;
  const tolerance = 10.0; // 10 cm tolerance for coincidence

  for (const w of entities) {
    if (w.id === e.id) continue;
    
    // A base wall is an element of type 'wall' or whose family/name contains wall/muro/parete, and is NOT a coating itself
    const isWallType = w.bimType === 'wall' || 
                       w.bimAreaType === 'muro' || 
                       (w.bimFamily || '').toLowerCase().includes('muro') || 
                       (w.bimFamily || '').toLowerCase().includes('parete');
                       
    if (!isWallType) continue;
    if (isCoatingElement(w)) continue;

    let wPoints = w.bimPoints || w.points || [];
    if (wPoints.length === 0 && w.type === 'line' && w.start && w.end) {
      wPoints = [w.start, w.end];
    }
    if (wPoints.length < 2) continue;

    const wFirst = wPoints[0];
    const wLast = wPoints[wPoints.length - 1];

    const d1 = Math.hypot(firstPt.x - wFirst.x, firstPt.y - wFirst.y);
    const d2 = Math.hypot(lastPt.x - wLast.x, lastPt.y - wLast.y);
    const d3 = Math.hypot(firstPt.x - wLast.x, firstPt.y - wLast.y);
    const d4 = Math.hypot(lastPt.x - wFirst.x, lastPt.y - wFirst.y);

    if ((d1 < tolerance && d2 < tolerance) || (d3 < tolerance && d4 < tolerance)) {
      baseWall = w;
      break;
    }
  }

  // Fallback: look for ANY non-coating wall extremely close
  if (!baseWall) {
    for (const w of entities) {
      if (w.id === e.id) continue;
      
      const isWallType = w.bimType === 'wall' || 
                         w.bimAreaType === 'muro' || 
                         (w.bimFamily || '').toLowerCase().includes('muro') || 
                         (w.bimFamily || '').toLowerCase().includes('parete');
                         
      if (!isWallType) continue;
      if (isCoatingElement(w)) continue;

      let wPoints = w.bimPoints || w.points || [];
      if (wPoints.length === 0 && w.type === 'line' && w.start && w.end) {
        wPoints = [w.start, w.end];
      }
      if (wPoints.length < 2) continue;

      const eMid = { x: (firstPt.x + lastPt.x) / 2, y: (firstPt.y + lastPt.y) / 2 };
      const wMid = { x: (wPoints[0].x + wPoints[wPoints.length - 1].x) / 2, y: (wPoints[0].y + wPoints[wPoints.length - 1].y) / 2 };
      const dist = Math.hypot(eMid.x - wMid.x, eMid.y - wMid.y);
      if (dist < 15.0) {
        baseWall = w;
        break;
      }
    }
  }

  const baseWallWidth = baseWall ? (baseWall.bimWidth || baseWall.width || 15) : 15;
  const sideSign = e.sideSign !== undefined ? e.sideSign : 1;

  // Find all OTHER coincident coatings on the SAME side
  const otherCoatings: any[] = [];
  for (const ent of entities) {
    if (ent.id === e.id) continue;
    if (!isCoatingElement(ent)) continue;

    let entPoints = ent.bimPoints || ent.points || [];
    if (entPoints.length === 0 && ent.type === 'line' && ent.start && ent.end) {
      entPoints = [ent.start, ent.end];
    }
    if (entPoints.length < 2) continue;

    const entFirst = entPoints[0];
    const entLast = entPoints[entPoints.length - 1];

    const d1 = Math.hypot(firstPt.x - entFirst.x, firstPt.y - entFirst.y);
    const d2 = Math.hypot(lastPt.x - entLast.x, lastPt.y - entLast.y);
    const d3 = Math.hypot(firstPt.x - entLast.x, firstPt.y - entLast.y);
    const d4 = Math.hypot(lastPt.x - entFirst.x, lastPt.y - entFirst.y);

    if ((d1 < tolerance && d2 < tolerance) || (d3 < tolerance && d4 < tolerance)) {
      const entSideSign = ent.sideSign !== undefined ? ent.sideSign : 1;
      if (entSideSign === sideSign) {
        otherCoatings.push(ent);
      }
    }
  }

  // Sort other coatings to determine which ones should be rendered under 'e'
  const getCoatingPriority = (ent: any): number => {
    const n = (ent.bimName || ent.name || '').toLowerCase();
    const f = (ent.bimFamily || ent.bimAreaType || ent.bimFamilyId || '').toLowerCase();
    
    if (f.includes('isolam') || f.includes('cappott') || n.includes('isolam') || n.includes('cappott')) {
      return 1;
    }
    if (f.includes('intonac') || n.includes('intonac') || f.includes('plaster')) {
      return 2;
    }
    if (f.includes('rivest') || n.includes('rivest')) {
      return 3;
    }
    if (f.includes('pittur') || n.includes('pittur') || f.includes('tinteg') || n.includes('tinteg')) {
      return 4;
    }
    return 5;
  };

  const currentPriority = getCoatingPriority(e);

  const innerCoatings = otherCoatings.filter(ent => {
    const entPriority = getCoatingPriority(ent);
    if (entPriority < currentPriority) return true;
    if (entPriority === currentPriority) {
      const t1 = ent.timestamp || 0;
      const t2 = e.timestamp || 0;
      return t1 < t2;
    }
    return false;
  });

  let previousThicknessSum = 0;
  for (const ent of innerCoatings) {
    const entThickness = (ent.bimWidth || ent.width || 2) / 100;
    previousThicknessSum += entThickness;
  }

  const thisThickness = (e.bimWidth || e.width || 2) / 100;
  const baseWallMeters = e.isFaceAligned ? 0 : (baseWallWidth / 100);

  const offsetZ = (baseWallMeters / 2 + previousThicknessSum + thisThickness / 2 + 0.002) * sideSign;

  return { offsetZ, baseWallWidth: e.isFaceAligned ? 0 : baseWallWidth };
};

const getCoincidentWallThickness = (e: any, entities: any[]): number => {
  const isPlaster = isCoatingElement(e);
  if (!isPlaster) return 0;

  const ePoints = e.bimPoints || e.points || [];
  if (ePoints.length < 2) return 0;

  const firstPt = ePoints[0];
  const lastPt = ePoints[ePoints.length - 1];

  for (const w of entities) {
    if (w.id === e.id) continue;
    const isWall = w.bimType === 'wall' || w.bimAreaType === 'muro' || (w.bimFamily || '').toLowerCase().includes('muro') || (w.bimFamily || '').toLowerCase().includes('parete');
    if (!isWall) continue;
    if (isCoatingElement(w)) continue; // skip other coatings

    let wPoints = w.bimPoints || w.points || [];
    if (wPoints.length === 0 && w.type === 'line' && w.start && w.end) {
      wPoints = [w.start, w.end];
    }
    if (wPoints.length < 2) continue;

    const wFirst = wPoints[0];
    const wLast = wPoints[wPoints.length - 1];

    // Check if they are substantially the same line/segment
    const d1 = Math.hypot(firstPt.x - wFirst.x, firstPt.y - wFirst.y);
    const d2 = Math.hypot(lastPt.x - wLast.x, lastPt.y - wLast.y);
    const d3 = Math.hypot(firstPt.x - wLast.x, firstPt.y - wLast.y);
    const d4 = Math.hypot(lastPt.x - wFirst.x, lastPt.y - wFirst.y);

    const tolerance = 10.0; // 10 cm tolerance
    if ((d1 < tolerance && d2 < tolerance) || (d3 < tolerance && d4 < tolerance)) {
      return w.bimWidth || w.width || 15;
    }
  }

  for (const w of entities) {
    if (w.id === e.id) continue;
    const isWall = w.bimType === 'wall' || w.bimAreaType === 'muro' || (w.bimFamily || '').toLowerCase().includes('muro') || (w.bimFamily || '').toLowerCase().includes('parete');
    if (!isWall) continue;
    if (isCoatingElement(w)) continue;

    let wPoints = w.bimPoints || w.points || [];
    if (wPoints.length === 0 && w.type === 'line' && w.start && w.end) {
      wPoints = [w.start, w.end];
    }
    if (wPoints.length < 2) continue;

    const eMid = { x: (firstPt.x + lastPt.x) / 2, y: (firstPt.y + lastPt.y) / 2 };
    const wMid = { x: (wPoints[0].x + wPoints[wPoints.length - 1].x) / 2, y: (wPoints[0].y + wPoints[wPoints.length - 1].y) / 2 };
    const dist = Math.hypot(eMid.x - wMid.x, eMid.y - wMid.y);
    if (dist < 15.0) {
      return w.bimWidth || w.width || 15;
    }
  }

  return 0;
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

const CameraViewIcon = ({ size = 20, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M15 2H9L7 5H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3l-2-3z" />
    <circle cx="12" cy="11" r="3" />
    <line x1="12" y1="14" x2="4" y2="22" />
    <line x1="12" y1="14" x2="20" y2="22" />
  </svg>
);


const SmartCappingWrapper = ({
  parentPivot = [0, 0, 0],
  parentRotation = [0, 0, 0],
  localCenterX,
  localCenterZ,
  localAngle = 0,
  slicingHeight,
  isCapTop = false,
  slicingMode,
  windowThickness,
  children
}: {
  parentPivot?: [number, number, number];
  parentRotation?: [number, number, number];
  localCenterX: number;
  localCenterZ: number;
  localAngle?: number;
  slicingHeight: number;
  isCapTop?: boolean;
  slicingMode: string;
  windowThickness: number;
  children: React.ReactNode;
}) => {
  const [px, py, pz] = parentPivot;
  const [rx, ry, rz] = parentRotation;

  const transform = useMemo(() => {
    // 1. Parent local-to-world transform
    const tPivot = new THREE.Matrix4().makeTranslation(px, py, pz);
    const rParent = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
    const tPivotInv = new THREE.Matrix4().makeTranslation(-px, -py, -pz);
    
    const localToWorld = new THREE.Matrix4()
      .multiply(tPivot)
      .multiply(rParent)
      .multiply(tPivotInv);

    // 2. Find target world height for this capping plane
    let hWorld = slicingHeight;
    if (slicingMode === 'WINDOW') {
      const half = windowThickness / 2;
      hWorld = isCapTop ? (slicingHeight + half - 0.001) : (slicingHeight - half + 0.001);
    } else {
      hWorld = isCapTop ? (slicingHeight + 0.001) : (slicingHeight - 0.001);
    }

    // 3. Find the vertical axis of the wall segment/mesh in local space
    // Any point is L(y) = [localCenterX, y, -localCenterZ]
    // In local space, the axis passes through V0 = [localCenterX, 0, -localCenterZ]
    const v0 = new THREE.Vector3(localCenterX, 0, -localCenterZ);
    // Expand the "effective" center to avoid edge-clipping issues
    const w0 = v0.clone().applyMatrix4(localToWorld);
    
    // Directed local vertical direction is [0, 1, 0]
    const uLocal = new THREE.Vector3(0, 1, 0);
    const uWorld = uLocal.clone().transformDirection(localToWorld); // Get directory vector in world space

    // Now solve for local height y: w0.y + y * uWorld.y = hWorld
    let y = 0;
    if (Math.abs(uWorld.y) > 0.001) {
      y = (hWorld - w0.y) / uWorld.y;
    } else {
      // Fallback if completely horizontal: assume local height is local center of entity
      y = py;
    }

    // World position of the cut center
    // We add a tiny epsilon to the world position and scale if needed to ensure 
    // the capping geometry completely covers the cut even if slightly rotated/tilted
    const wCut = w0.clone().add(uWorld.clone().multiplyScalar(y));
    // Ensure world height is exactly hWorld to avoid floating point errors
    wCut.y = hWorld;

    // 4. Find the horizontal direction of the wall segment in world space
    // Local wall direction is [cos(localAngle), 0, sin(localAngle)]
    const wallDirLocal = new THREE.Vector3(Math.cos(localAngle), 0, Math.sin(localAngle));
    const wallDirWorld = wallDirLocal.clone().transformDirection(localToWorld);
    
    // Project direction onto world horizontal plane (X, Z) and find angle
    const worldYaw = Math.atan2(-wallDirWorld.z, wallDirWorld.x);

    // 5. Build target world matrix of the capping mesh
    // World rotation: flat horizontal, with combined yaw
    const worldEuler = new THREE.Euler(-Math.PI / 2, 0, worldYaw, 'YXZ');
    const worldQuat = new THREE.Quaternion().setFromEuler(worldEuler);
    
    // Ensure covering - slightly scale up to ensure it covers even when tilted
    const targetWorldMatrix = new THREE.Matrix4().compose(
      wCut,
      worldQuat,
      new THREE.Vector3(1.2, 1.2, 1.2)
    );

    // 6. Map target world matrix back to local space of the parent group
    const worldToLocal = localToWorld.clone().invert();
    const resultingLocalMatrix = new THREE.Matrix4().multiplyMatrices(worldToLocal, targetWorldMatrix);

    // Decompose to get local position and rotation for our mesh
    const localPos = new THREE.Vector3();
    const localQuat = new THREE.Quaternion();
    const localScale = new THREE.Vector3();
    resultingLocalMatrix.decompose(localPos, localQuat, localScale);

    const localRot = new THREE.Euler().setFromQuaternion(localQuat);

    return {
      position: [localPos.x, localPos.y, localPos.z] as [number, number, number],
      rotation: [localRot.x, localRot.y, localRot.z] as [number, number, number],
      quaternion: localQuat.clone()
    };
  }, [px, py, pz, rx, ry, rz, localCenterX, localCenterZ, localAngle, slicingHeight, isCapTop, slicingMode, windowThickness]);

  // Clone children and inject the corrected position, rotation, and quaternion
  return React.cloneElement(children as React.ReactElement<{ position?: [number, number, number]; rotation?: [number, number, number]; quaternion?: THREE.Quaternion }>, {
    position: transform.position,
    rotation: transform.rotation,
    quaternion: transform.quaternion
  });
};


const HatchCappingPlaneMesh = ({
  position,
  rotation,
  quaternion,
  length,
  thickness,
  color,
  outlineColor = '#000000',
  sectionHatchMode = true,
  perimeterThickness = 5.5,
  hatchDensity = 4.0,
  hatchThickness = 2.0,
  hatchLineColor = '#000000',
  hatchBgColorMode = 'white',
  hatchBgColorCustom = '#ffffff',
  hatchPatternMode = 'diagonal'
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  quaternion?: [number, number, number, number] | THREE.Quaternion;
  length: number;
  thickness: number;
  color: string;
  outlineColor?: string;
  sectionHatchMode?: boolean;
  perimeterThickness?: number;
  hatchDensity?: number;
  hatchThickness?: number;
  hatchLineColor?: string;
  hatchBgColorMode?: 'white' | 'entity' | 'gray' | 'custom';
  hatchBgColorCustom?: string;
  hatchPatternMode?: 'diagonal' | 'horizontal' | 'vertical' | 'cross';
}) => {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  const computedBg = useMemo(() => {
    switch (hatchBgColorMode) {
      case 'entity':
        return color || '#334155';
      case 'gray':
        return '#f1f5f9';
      case 'custom':
        return hatchBgColorCustom || '#ffffff';
      case 'white':
      default:
        return '#ffffff';
    }
  }, [hatchBgColorMode, color, hatchBgColorCustom]);

  useEffect(() => {
    if (!sectionHatchMode) {
      setTexture(null);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = computedBg;
      ctx.fillRect(0, 0, 128, 128);
      
      ctx.strokeStyle = hatchLineColor;
      ctx.lineWidth = hatchThickness; 
      ctx.beginPath();
      const spacing = 16;
      if (hatchPatternMode === 'diagonal') {
        for (let i = -128; i < 256; i += spacing) {
          ctx.moveTo(i, 0);
          ctx.lineTo(i + 128, 128);
        }
      } else if (hatchPatternMode === 'horizontal') {
        for (let y = 0; y < 128; y += spacing) {
          ctx.moveTo(0, y);
          ctx.lineTo(128, y);
        }
      } else if (hatchPatternMode === 'vertical') {
        for (let x = 0; x < 128; x += spacing) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 128);
        }
      } else if (hatchPatternMode === 'cross') {
        for (let y = 0; y < 128; y += spacing) {
          ctx.moveTo(0, y);
          ctx.lineTo(128, y);
        }
        for (let x = 0; x < 128; x += spacing) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 128);
        }
      }
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(length * hatchDensity, thickness * hatchDensity);
    
    // Extreme sharp filter & high anisotropic filter configuration 
    tex.anisotropy = 16;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    
    tex.needsUpdate = true;
    setTexture(tex);

    return () => {
      tex.dispose();
    };
  }, [length, thickness, computedBg, hatchLineColor, sectionHatchMode, hatchDensity, hatchThickness, hatchPatternMode]);

  const borderPoints = useMemo(() => {
    const halfL = length / 2;
    const halfT = thickness / 2;
    return [
      [-halfL, -halfT, 0.002],
      [halfL, -halfT, 0.002],
      [halfL, halfT, 0.002],
      [-halfL, halfT, 0.002],
      [-halfL, -halfT, 0.002]
    ] as [number, number, number][];
  }, [length, thickness]);

  return (
    <group position={position} rotation={quaternion ? undefined : rotation} quaternion={quaternion}>
      <mesh>
        <planeGeometry args={[length, thickness]} />
        {sectionHatchMode && texture ? (
          <meshBasicMaterial key={texture.uuid} map={texture} side={THREE.DoubleSide} transparent={false} depthWrite={true} />
        ) : (
          <meshBasicMaterial key="solid" color={computedBg} side={THREE.DoubleSide} transparent={false} depthWrite={true} />
        )}
      </mesh>
      {/* Thick Bold Border outline */}
      <Line 
        points={borderPoints}
        color={outlineColor}
        lineWidth={perimeterThickness}
      />
    </group>
  );
};

const HatchCappingShapeMesh = ({
  position,
  rotation,
  quaternion,
  shape,
  color,
  outlineColor = '#000000',
  sectionHatchMode = true,
  perimeterThickness = 5.5,
  hatchDensity = 4.0,
  hatchThickness = 2.0,
  hatchLineColor = '#000000',
  hatchBgColorMode = 'white',
  hatchBgColorCustom = '#ffffff',
  hatchPatternMode = 'diagonal'
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  quaternion?: [number, number, number, number] | THREE.Quaternion;
  shape: THREE.Shape;
  color: string;
  outlineColor?: string;
  sectionHatchMode?: boolean;
  perimeterThickness?: number;
  hatchDensity?: number;
  hatchThickness?: number;
  hatchLineColor?: string;
  hatchBgColorMode?: 'white' | 'entity' | 'gray' | 'custom';
  hatchBgColorCustom?: string;
  hatchPatternMode?: 'diagonal' | 'horizontal' | 'vertical' | 'cross';
}) => {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  const { width, height } = useMemo(() => {
    const points = shape.getPoints();
    if (points.length === 0) return { width: 5, height: 5 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    return {
      width: Math.max(maxX - minX, 0.1),
      height: Math.max(maxY - minY, 0.1)
    };
  }, [shape]);

  const computedBg = useMemo(() => {
    switch (hatchBgColorMode) {
      case 'entity':
        return color || '#334155';
      case 'gray':
        return '#f1f5f9';
      case 'custom':
        return hatchBgColorCustom || '#ffffff';
      case 'white':
      default:
        return '#ffffff';
    }
  }, [hatchBgColorMode, color, hatchBgColorCustom]);

  useEffect(() => {
    if (!sectionHatchMode) {
      setTexture(null);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = computedBg;
      ctx.fillRect(0, 0, 128, 128);
      
      ctx.strokeStyle = hatchLineColor;
      ctx.lineWidth = hatchThickness; 
      ctx.beginPath();
      const spacing = 16;
      if (hatchPatternMode === 'diagonal') {
        for (let i = -128; i < 256; i += spacing) {
          ctx.moveTo(i, 0);
          ctx.lineTo(i + 128, 128);
        }
      } else if (hatchPatternMode === 'horizontal') {
        for (let y = 0; y < 128; y += spacing) {
          ctx.moveTo(0, y);
          ctx.lineTo(128, y);
        }
      } else if (hatchPatternMode === 'vertical') {
        for (let x = 0; x < 128; x += spacing) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 128);
        }
      } else if (hatchPatternMode === 'cross') {
        for (let y = 0; y < 128; y += spacing) {
          ctx.moveTo(0, y);
          ctx.lineTo(128, y);
        }
        for (let x = 0; x < 128; x += spacing) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 128);
        }
      }
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(width * hatchDensity, height * hatchDensity);
    
    // Extreme sharp filter & high anisotropic filter configuration 
    tex.anisotropy = 16;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    
    tex.needsUpdate = true;
    setTexture(tex);

    return () => {
      tex.dispose();
    };
  }, [width, height, computedBg, hatchLineColor, sectionHatchMode, hatchDensity, hatchThickness, hatchPatternMode]);

  const outerBorderPoints = useMemo(() => {
    const pts = shape.getPoints();
    if (pts.length === 0) return [];
    const res = pts.map(p => [p.x, p.y, 0.002] as [number, number, number]);
    res.push([pts[0].x, pts[0].y, 0.002]); // Close the boundary loop
    return res;
  }, [shape]);

  const holesBorderPoints = useMemo(() => {
    return (shape.holes || []).map(hole => {
      const pts = hole.getPoints();
      if (pts.length === 0) return [];
      const res = pts.map(p => [p.x, p.y, 0.002] as [number, number, number]);
      res.push([pts[0].x, pts[0].y, 0.002]); // Close the hole loop
      return res;
    });
  }, [shape]);

  return (
    <group position={position} rotation={quaternion ? undefined : rotation} quaternion={quaternion}>
      <mesh>
        <shapeGeometry args={[shape]} />
        {sectionHatchMode && texture ? (
          <meshBasicMaterial key={texture.uuid} map={texture} side={THREE.DoubleSide} transparent={false} depthWrite={true} />
        ) : (
          <meshBasicMaterial key="solid" color={computedBg} side={THREE.DoubleSide} transparent={false} depthWrite={true} />
        )}
      </mesh>
      {/* Thick Bold Outer Border */}
      {outerBorderPoints.length > 0 && (
        <Line 
          points={outerBorderPoints}
          color={outlineColor}
          lineWidth={perimeterThickness}
        />
      )}
      {/* Thick Bold Holes Borders */}
      {holesBorderPoints.map((hp, i) => hp.length > 0 && (
        <Line 
          key={`hole-${i}`}
          points={hp}
          color={outlineColor}
          lineWidth={perimeterThickness}
        />
      ))}
    </group>
  );
};

const WallSegmentMesh = React.memo(({
  seg, 
  realisticTextures, 
  color, 
  renderMode, 
  finalOpacity, 
  bimFamilyId, 
  clippingPlanes 
}: {
  seg: any,
  realisticTextures: any,
  color: string,
  renderMode: string,
  finalOpacity: number,
  bimFamilyId?: string,
  clippingPlanes: THREE.Plane[]
}) => {
  const materials = useMemo(() => {
    const matProps = {
      color: color,
      transparent: renderMode === 'transparent' || finalOpacity < 1,
      wireframe: renderMode === 'transparent',
      opacity: renderMode === 'transparent' ? 0.3 : finalOpacity,
      metalness: 0.1,
      roughness: 0.8,
      envMapIntensity: 0.5,
      clippingPlanes: clippingPlanes,
      clipShadows: true,
      side: THREE.DoubleSide
    };

    if (!realisticTextures) {
      return new THREE.MeshStandardMaterial({
        ...matProps,
        metalness: 0.15,
        roughness: 0.4,
        envMapIntensity: 1
      });
    }

    const sideTex = realisticTextures.side.clone();
    const topTex = realisticTextures.top.clone();
    const endTex = realisticTextures.side.clone();
    
    const wallWidthCm = Math.round(seg.args[2] * 100);

    // Side Scaling
    const sideScaleX = realisticTextures?.type === 'tiles' ? 1.0 : (bimFamilyId === 'tramezzature' ? 0.25 : 0.40);
    const sideScaleY = realisticTextures?.type === 'tiles' ? 1.0 : 0.25;
    const sideRepeatX = seg.args[0] / sideScaleX;
    const sideRepeatY = seg.args[1] / sideScaleY;
    sideTex.repeat.set(sideRepeatX, sideRepeatY);
    sideTex.needsUpdate = true;

    // End Scaling
    const endScaleX = realisticTextures?.type === 'tiles' ? 1.0 : 0.30;
    const endRepeatX = realisticTextures?.type === 'tiles' ? Math.max(1, seg.args[2] / endScaleX) : (wallWidthCm <= 42 ? 1 : (wallWidthCm <= 82 ? 2 : Math.max(1, seg.args[2] / endScaleX)));
    endTex.repeat.set(endRepeatX, sideRepeatY);
    endTex.needsUpdate = true;

    // Top Scaling (Brick holes)
    const topScaleX = realisticTextures?.type === 'tiles' ? 1.0 : 0.25;
    const topScaleY = realisticTextures?.type === 'tiles' ? 1.0 : 0.30;
    const topRepeatX = seg.args[0] / topScaleX;
    const topRepeatY = realisticTextures?.type === 'tiles' ? Math.max(1, seg.args[2] / topScaleY) : (wallWidthCm <= 42 ? 1 : (wallWidthCm <= 82 ? 2 : Math.max(1, seg.args[2] / topScaleY)));
    topTex.repeat.set(topRepeatX, topRepeatY);
    topTex.needsUpdate = true;

    return [
      new THREE.MeshStandardMaterial({ ...matProps, map: endTex }), // +X (END)
      new THREE.MeshStandardMaterial({ ...matProps, map: endTex }), // -X (END)
      new THREE.MeshStandardMaterial({ ...matProps, map: topTex }),  // +Y (TOP)
      new THREE.MeshStandardMaterial({ ...matProps, map: sideTex }), // -Y (BOTTOM)
      new THREE.MeshStandardMaterial({ ...matProps, map: sideTex }), // +Z (SIDE)
      new THREE.MeshStandardMaterial({ ...matProps, map: sideTex }), // -Z (SIDE)
    ];
  }, [seg.args, realisticTextures, color, renderMode, finalOpacity, bimFamilyId, clippingPlanes]);

  // Clean up materials and textures on unmount
  useEffect(() => {
    return () => {
      if (materials) {
        if (Array.isArray(materials)) {
          materials.forEach((mat) => {
            if (mat.map) mat.map.dispose();
            mat.dispose();
          });
        } else {
          materials.dispose();
        }
      }
    };
  }, [materials]);

  return (
    <mesh position={seg.position} rotation={seg.rotation} material={materials} castShadow receiveShadow>
      <boxGeometry args={seg.args} />
    </mesh>
  );
});

const RoomSegmentMesh = React.memo(({
  seg, 
  realisticTextures, 
  color, 
  renderMode, 
  finalOpacity, 
  clippingPlanes 
}: {
  seg: any,
  realisticTextures: any,
  color: string,
  renderMode: string,
  finalOpacity: number,
  clippingPlanes: THREE.Plane[]
}) => {
  const materials = useMemo(() => {
    const matProps = {
      color: realisticTextures ? '#ffffff' : color,
      transparent: finalOpacity < 1,
      opacity: finalOpacity,
      metalness: 0.1,
      roughness: 0.8,
      envMapIntensity: 0.5,
      clippingPlanes: clippingPlanes,
      clipShadows: true,
      side: THREE.DoubleSide
    };

    if (!realisticTextures) {
      return new THREE.MeshStandardMaterial({
        ...matProps,
        metalness: 0.15,
        roughness: 0.4,
        envMapIntensity: 1
      });
    }

    const type = realisticTextures.type;
    const sideTex = realisticTextures.side.clone();
    const topTex = realisticTextures.top.clone();
    const endTex = realisticTextures.side.clone();
    
    const wallWidthCm = Math.round(seg.args[2] * 100);

    // Side Scaling
    const sideScaleX = type === 'tiles' ? 1.0 : (type === 'partition' ? 0.25 : 0.40);
    const sideScaleY = type === 'tiles' ? 1.0 : 0.25;
    const sideRepeatX = seg.args[0] / sideScaleX;
    const sideRepeatY = seg.args[1] / sideScaleY;
    sideTex.repeat.set(sideRepeatX, sideRepeatY);
    sideTex.needsUpdate = true;

    // End Scaling
    const endScaleX = type === 'tiles' ? 1.0 : 0.30;
    const endRepeatX = type === 'tiles' ? Math.max(1, seg.args[2] / endScaleX) : (wallWidthCm <= 42 ? 1 : (wallWidthCm <= 82 ? 2 : Math.max(1, seg.args[2] / endScaleX)));
    endTex.repeat.set(endRepeatX, sideRepeatY);
    endTex.needsUpdate = true;

    // Top Scaling
    const topScaleX = type === 'tiles' ? 1.0 : 0.25;
    const topScaleY = type === 'tiles' ? 1.0 : 0.30;
    const topRepeatX = seg.args[0] / topScaleX;
    const topRepeatY = type === 'tiles' ? Math.max(1, seg.args[2] / topScaleY) : (wallWidthCm <= 42 ? 1 : (wallWidthCm <= 82 ? 2 : Math.max(1, seg.args[2] / topScaleY)));
    topTex.repeat.set(topRepeatX, topRepeatY);
    topTex.needsUpdate = true;

    return [
      new THREE.MeshStandardMaterial({ ...matProps, map: endTex }), // +X (END)
      new THREE.MeshStandardMaterial({ ...matProps, map: endTex }), // -X (END)
      new THREE.MeshStandardMaterial({ ...matProps, map: topTex }),  // +Y (TOP)
      new THREE.MeshStandardMaterial({ ...matProps, map: sideTex }), // -Y (BOTTOM)
      new THREE.MeshStandardMaterial({ ...matProps, map: sideTex }), // +Z (SIDE)
      new THREE.MeshStandardMaterial({ ...matProps, map: sideTex }), // -Z (SIDE)
    ];
  }, [seg.args, realisticTextures, color, finalOpacity, clippingPlanes]);

  // Clean up materials and textures on unmount
  useEffect(() => {
    return () => {
      if (materials) {
        if (Array.isArray(materials)) {
          materials.forEach((mat) => {
            if (mat.map) mat.map.dispose();
            mat.dispose();
          });
        } else {
          materials.dispose();
        }
      }
    };
  }, [materials]);

  return (
    <mesh position={seg.position} rotation={seg.rotation} material={materials} castShadow receiveShadow>
      <boxGeometry args={seg.args} />
    </mesh>
  );
});

export const Wall = ({ 
  points, 
  height, 
  width, 
  color, 
  baseZ, 
  bimFamilyId,
  clippingPlanes = [], 
  opacity = 1,
  globalOpacityMode = 'WORK',
  globalWallOpacityVal = 0.50,
  isSlicing = false,
  slicingHeight = 0,
  slicingMode = 'HIDE_ABOVE',
  windowThickness = 0.5,
  renderMode = 'solid',
  sectionHatchMode = true,
  perimeterThickness = 5.5,
  hatchDensity = 4.0,
  hatchThickness = 2.0,
  hatchLineColor = '#000000',
  hatchBgColorMode = 'white',
  hatchBgColorCustom = '#ffffff',
  hatchPatternMode = 'diagonal',
  parentPivot = [0, 0, 0],
  parentRotation = [0, 0, 0]
}: { 
  points: Point[], 
  height: number, 
  width?: number, 
  color: string, 
  baseZ: number, 
  bimFamilyId?: string,
  clippingPlanes?: THREE.Plane[], 
  opacity?: number,
  isSlicing?: boolean,
  slicingHeight?: number,
  slicingMode?: 'HIDE_ABOVE' | 'HIDE_BELOW' | 'WINDOW',
  windowThickness?: number,
  globalOpacityMode?: 'WORK' | 'SOLID',
  globalWallOpacityVal?: number,
  renderMode?: 'solid' | 'transparent',
  sectionHatchMode?: boolean,
  perimeterThickness?: number,
  hatchDensity?: number,
  hatchThickness?: number,
  hatchLineColor?: string,
  hatchBgColorMode?: 'white' | 'entity' | 'gray' | 'custom',
  hatchBgColorCustom?: string,
  hatchPatternMode?: 'diagonal' | 'horizontal' | 'vertical' | 'cross',
  parentPivot?: [number, number, number],
  parentRotation?: [number, number, number]
}) => {
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
        length: length / 100,
        thickness: (width || 15) / 100,
        centerX: centerX / 100,
        centerY: centerY / 100,
        angle: angle
      });
    }
    return result;
  }, [points, height, width, baseZ]);

  const realisticTextures = useMemo(() => {
    const id = (bimFamilyId || '').toLowerCase().trim();
    if (!id) return null;
    let type: 'concrete' | 'masonry' | 'partition' | 'plaster' | 'plaster_rustic' | 'insulation' | 'tiles' | null = null;
    if (id.includes('pilastri') || id.includes('fondazioni') || id.includes('solaio') || id.includes('c.a.') || id.includes('casseri')) {
      type = 'concrete';
    } else if (id.includes('murature') || id.includes('muro') || id.includes('portant') || id.includes('matton') || id.includes('svizzeri')) {
      type = 'masonry';
    } else if (id.includes('tramezz') || id.includes('divisori')) {
      type = 'partition';
    } else if (id.includes('rivest') || id.includes('piastrell') || id.includes('tiles') || id.includes('ceramica')) {
      type = 'tiles';
    } else if (id.includes('intonaco_rustico') || id.includes('plaster_rustic')) {
      type = 'plaster_rustic';
    } else if (id.includes('intonac') || id.includes('plaster') || id.includes('finitura')) {
      type = 'plaster';
    } else if (id.includes('isolam') || id.includes('cappott') || id.includes('coibent')) {
      type = 'insulation';
    }
    
    if (type) {
      return {
        side: createBIMMaterialTexture(type, 'side', color),
        top: createBIMMaterialTexture(type, 'top', color),
        type
      };
    }
    return null;
  }, [bimFamilyId, color]);

  const finalOpacity = globalOpacityMode === 'SOLID' 
    ? 1.0 
    : (opacity < 1 ? opacity * globalWallOpacityVal : globalWallOpacityVal);

  const [px, py, pz] = parentPivot;
  const [rx, ry, rz] = parentRotation;

  return (
    <group>
      {segments.map((seg, i) => {
        const isCappingEnabled = isSlicing && (renderMode !== 'transparent' || globalOpacityMode === 'SOLID');
        let segShowCapBottom = false;
        let segShowCapTop = false;

        if (isCappingEnabled) {
          const tPivot = new THREE.Matrix4().makeTranslation(px, py, pz);
          const rParent = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
          const tPivotInv = new THREE.Matrix4().makeTranslation(-px, -py, -pz);
          const parentLocalToWorld = new THREE.Matrix4().multiply(tPivot).multiply(rParent).multiply(tPivotInv);

          const tSeg = new THREE.Matrix4().makeTranslation(seg.position[0], seg.position[1], seg.position[2]);
          const rSeg = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(seg.rotation[0], seg.rotation[1], seg.rotation[2], 'XYZ'));
          const segLocalToParent = new THREE.Matrix4().multiply(tSeg).multiply(rSeg);

          const localToWorld = new THREE.Matrix4().multiplyMatrices(parentLocalToWorld, segLocalToParent);

          const halfL = seg.args[0] / 2;
          const halfH = seg.args[1] / 2;
          const halfT = seg.args[2] / 2;

          const localCorners = [
            new THREE.Vector3(-halfL, -halfH, -halfT),
            new THREE.Vector3(halfL, -halfH, -halfT),
            new THREE.Vector3(-halfL, halfH, -halfT),
            new THREE.Vector3(halfL, halfH, -halfT),
            new THREE.Vector3(-halfL, -halfH, halfT),
            new THREE.Vector3(halfL, -halfH, halfT),
            new THREE.Vector3(-halfL, halfH, halfT),
            new THREE.Vector3(halfL, halfH, halfT)
          ];

          let minY = Infinity;
          let maxY = -Infinity;
          for (const corner of localCorners) {
            const w = corner.clone().applyMatrix4(localToWorld);
            if (w.y < minY) minY = w.y;
            if (w.y > maxY) maxY = w.y;
          }

          if (slicingMode === 'HIDE_ABOVE') {
            segShowCapBottom = slicingHeight > minY && slicingHeight < maxY;
          } else if (slicingMode === 'HIDE_BELOW') {
            segShowCapTop = slicingHeight > minY && slicingHeight < maxY;
          } else if (slicingMode === 'WINDOW') {
            const half = windowThickness / 2;
            const tY = slicingHeight + half;
            const bY = slicingHeight - half;
            segShowCapTop = tY > minY && tY < maxY;
            segShowCapBottom = bY > minY && bY < maxY;
          }
        }

        return (
          <group key={i}>
            {/* Solid Clipped Part */}
            <WallSegmentMesh 
              seg={seg}
              realisticTextures={realisticTextures}
              color={color}
              renderMode={renderMode}
              finalOpacity={finalOpacity}
              bimFamilyId={bimFamilyId}
              clippingPlanes={clippingPlanes}
            />
            {/* Flat horizontal cap matching the cut exactly so there's no visual hollow space */}
            {segShowCapBottom && (
              <SmartCappingWrapper
                parentPivot={parentPivot}
                parentRotation={parentRotation}
                localCenterX={seg.centerX}
                localCenterZ={seg.centerY}
                localAngle={-seg.angle}
                slicingHeight={slicingHeight}
                isCapTop={false}
                slicingMode={slicingMode}
                windowThickness={windowThickness}
              >
                <HatchCappingPlaneMesh
                  position={[seg.centerX, 0, -seg.centerY]}
                  rotation={[-Math.PI / 2, 0, -seg.angle]}
                  length={seg.length}
                  thickness={seg.thickness}
                  color={color}
                  outlineColor="#000000"
                  sectionHatchMode={sectionHatchMode}
                  perimeterThickness={perimeterThickness}
                  hatchDensity={hatchDensity}
                  hatchThickness={hatchThickness}
                  hatchLineColor={hatchLineColor}
                  hatchBgColorMode={hatchBgColorMode}
                  hatchBgColorCustom={hatchBgColorCustom}
                  hatchPatternMode={hatchPatternMode}
                />
              </SmartCappingWrapper>
            )}
            {segShowCapTop && (
              <SmartCappingWrapper
                parentPivot={parentPivot}
                parentRotation={parentRotation}
                localCenterX={seg.centerX}
                localCenterZ={seg.centerY}
                localAngle={-seg.angle}
                slicingHeight={slicingHeight}
                isCapTop={true}
                slicingMode={slicingMode}
                windowThickness={windowThickness}
              >
                <HatchCappingPlaneMesh
                  position={[seg.centerX, 0, -seg.centerY]}
                  rotation={[-Math.PI / 2, 0, -seg.angle]}
                  length={seg.length}
                  thickness={seg.thickness}
                  color={color}
                  outlineColor="#000000"
                  sectionHatchMode={sectionHatchMode}
                  perimeterThickness={perimeterThickness}
                  hatchDensity={hatchDensity}
                  hatchThickness={hatchThickness}
                  hatchLineColor={hatchLineColor}
                  hatchBgColorMode={hatchBgColorMode}
                  hatchBgColorCustom={hatchBgColorCustom}
                  hatchPatternMode={hatchPatternMode}
                />
              </SmartCappingWrapper>
            )}
            {/* Wireframe Reference - Unclipped */}
            <mesh position={seg.position} rotation={seg.rotation}>
              <boxGeometry args={seg.args} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} color={color} />
              <Edges color="#cbd5e1" threshold={5} transparent opacity={globalOpacityMode === 'SOLID' ? 0.2 : 0.1} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

interface Scaffolding3DProps {
  points: Point[];
  height: number; // in cm
  baseZ: number;   // in cm
  color: string;   // scaffolding frame color
  clippingPlanes?: THREE.Plane[];
  isLinear?: boolean;
  hasMantovana?: boolean;
  mantovanaAngle?: number;
  mantovanaHeight?: number;
  lightweight?: boolean;
  teloLato?: 'none' | 'esterno' | 'interno' | 'entrambi';
  tavoleFermapiedeCount?: number;
}

export const Scaffolding3D = React.memo(({
  points,
  height,
  baseZ,
  color,
  clippingPlanes = [],
  isLinear = false,
  hasMantovana = true,
  mantovanaAngle = 45,
  mantovanaHeight = 4.5,
  lightweight = false,
  teloLato = 'esterno',
  tavoleFermapiedeCount = 1
}: Scaffolding3DProps) => {
  const h = height / 100;
  const zBase = baseZ / 100;
  const numLevels = Math.max(1, Math.round(h / 2.0));
  const uprightHeight = numLevels * 2.0;
  
  const segmentsData = useMemo(() => {
    let effectivePoints = points;
    let effectiveIsLinear = isLinear;
    
    if (!isLinear && points && points.length === 4) {
      const p = points;
      const d01 = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
      const d12 = Math.hypot(p[2].x - p[1].x, p[2].y - p[1].y);
      const d23 = Math.hypot(p[3].x - p[2].x, p[3].y - p[2].y);
      const d30 = Math.hypot(p[0].x - p[3].x, p[0].y - p[3].y);
      
      if ((d01 + d23) / 2 >= (d12 + d30) / 2) {
        effectivePoints = [
          { x: (p[0].x + p[3].x) / 2, y: (p[0].y + p[3].y) / 2 },
          { x: (p[1].x + p[2].x) / 2, y: (p[1].y + p[2].y) / 2 }
        ];
      } else {
        effectivePoints = [
          { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 },
          { x: (p[3].x + p[2].x) / 2, y: (p[3].y + p[2].y) / 2 }
        ];
      }
      effectiveIsLinear = true;
    }

    const list = [];
    if (!effectivePoints || effectivePoints.length < 2) return [];
    
    const count = effectiveIsLinear ? effectivePoints.length - 1 : effectivePoints.length;
    for (let i = 0; i < count; i++) {
      const p1 = effectivePoints[i];
      const p2 = effectivePoints[(i + 1) % effectivePoints.length];
      const dx = (p2.x - p1.x) / 100;
      const dy = (p2.y - p1.y) / 100;
      const len = Math.hypot(dx, dy);
      
      if (len > 0.1) {
        const uX = dx / len;
        const uZ = -dy / len;
        const nX = -uZ;
        const nZ = uX;
        const angle = Math.atan2(dy, dx);
        const numSpans = Math.max(1, Math.round(len / 1.8));
        const actualS = len / numSpans;

        const frames = [];
        for (let j = 0; j <= numSpans; j++) {
          const t = j / numSpans;
          const x = (p1.x / 100) + t * (p2.x / 100 - p1.x / 100);
          const z = -((p1.y / 100) + t * (p2.y / 100 - p1.y / 100));
          frames.push({ x_inner: x - nX * 0.5, z_inner: z - nZ * 0.5, x_outer: x + nX * 0.5, z_outer: z + nZ * 0.5, x, z });
        }
        list.push({ length: len, dx, dy, uX, uZ, nX, nZ, angle, numSpans, actualS, frames, p1, p2 });
      }
    }
    return list;
  }, [points, isLinear]);

  const instances = useMemo(() => {
    const standards: THREE.Matrix4[] = [];
    const transoms: THREE.Matrix4[] = [];
    const planks: THREE.Matrix4[] = [];
    const guardrails: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();

    segmentsData.forEach((seg) => {
      seg.frames.forEach((f) => {
        const showInner = !clippingPlanes.some(p => p.distanceToPoint(new THREE.Vector3(f.x_inner, zBase, f.z_inner)) < 0);
        const showOuter = !clippingPlanes.some(p => p.distanceToPoint(new THREE.Vector3(f.x_outer, zBase, f.z_outer)) < 0);
        if (showInner) {
          dummy.position.set(f.x_inner, zBase + uprightHeight / 2, f.z_inner);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          standards.push(dummy.matrix.clone());
        }
        if (showOuter) {
          dummy.position.set(f.x_outer, zBase + uprightHeight / 2, f.z_outer);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          standards.push(dummy.matrix.clone());
        }
        for (let l = 1; l <= numLevels; l++) {
          const y = zBase + l * 2.0;
          const x_mid = (f.x_inner + f.x_outer) / 2;
          const z_mid = (f.z_inner + f.z_outer) / 2;
          if (!clippingPlanes.some(p => p.distanceToPoint(new THREE.Vector3(x_mid, y, z_mid)) < 0)) {
            dummy.position.set(x_mid, y, z_mid);
            dummy.rotation.set(Math.PI / 2, 0, Math.atan2(seg.nX, seg.nZ));
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            transoms.push(dummy.matrix.clone());
          }
        }
      });
      for (let s = 0; s < seg.numSpans; s++) {
        const f1 = seg.frames[s];
        const f2 = seg.frames[s + 1];
        const x_mid = (f1.x + f2.x) / 2;
        const z_mid = (f1.z + f2.z) / 2;
        for (let l = 1; l <= numLevels; l++) {
          const y = zBase + l * 2.0;
          if (clippingPlanes.some(p => p.distanceToPoint(new THREE.Vector3(x_mid, y, z_mid)) < 0)) continue;
          const offsets = [-0.375, -0.125, 0.125, 0.375];
          offsets.forEach((off) => {
            dummy.position.set(x_mid + seg.nX * off, y - 0.025, z_mid + seg.nZ * off);
            dummy.rotation.set(0, -seg.angle, 0);
            dummy.scale.set(seg.actualS, 1, 1);
            dummy.updateMatrix();
            planks.push(dummy.matrix.clone());
          });
          [0.5, 1.0].forEach(goff => {
            dummy.position.set(x_mid + seg.nX * 0.5, y + goff, z_mid + seg.nZ * 0.5);
            dummy.rotation.set(Math.PI / 2, 0, -seg.angle);
            dummy.scale.set(1, seg.actualS, 1);
            dummy.updateMatrix();
            guardrails.push(dummy.matrix.clone());
          });
        }
      }
    });
    return { standards, transoms, planks, guardrails };
  }, [segmentsData, zBase, uprightHeight, numLevels, clippingPlanes]);

  // Helper to draw a cylinder (tube) between two 3D points
  const CylinderBetweenPoints = useCallback(({ p1, p2, radius, tubeColor }: {
    p1: { x: number; y: number; z: number };
    p2: { x: number; y: number; z: number };
    radius: number;
    tubeColor: string;
  }) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.01) return null;

    const midpoint = new THREE.Vector3(p1.x + dx / 2, p1.y + dy / 2, p1.z + dz / 2);
    if (clippingPlanes && clippingPlanes.length > 0) {
      if (clippingPlanes.some(plane => plane.distanceToPoint(midpoint) < 0)) {
        return null;
      }
    }

    const quat = (() => {
      const v = new THREE.Vector3(dx, dy, dz).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      return new THREE.Quaternion().setFromUnitVectors(up, v);
    })();

    return (
      <mesh position={midpoint} quaternion={quat} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, len, 6]} />
        <meshStandardMaterial 
          color={tubeColor} 
          metalness={0.8} 
          roughness={0.2} 
          clippingPlanes={clippingPlanes}
        />
      </mesh>
    );
  }, [clippingPlanes]);

  if (segmentsData.length === 0) return null;

  const frameColor = color && color !== '#3b82f6' ? color : '#ea580c';
  const galvanisedColor = '#cbd5e1';
  const woodenColor = '#d97706'; // wood ochre for planks and toe-boards
  const netColor = '#047857'; // safety green

  // Helper to draw a detailed base jack (basotto regolabile con vitone)
  const renderBaseJack = (x: number, z: number) => {
    if (clippingPlanes && clippingPlanes.length > 0) {
      if (clippingPlanes.some(plane => plane.distanceToPoint(new THREE.Vector3(x, zBase, z)) < 0)) {
        return null;
      }
    }
    return (
      <group position={[x, zBase, z]}>
        {/* Yellow safety anti-slip base plate */}
        <mesh position={[0, 0.01, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.18, 0.02, 0.18]} />
          <meshStandardMaterial color="#eab308" roughness={0.6} metalness={0.1} clippingPlanes={clippingPlanes} />
        </mesh>
        {/* Threaded screw stem (vitone) */}
        <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.018, 0.018, 0.32, 6]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.2} clippingPlanes={clippingPlanes} />
        </mesh>
        {/* Thread rings to simulate "vitone" threading */}
        {Array.from({ length: 8 }).map((_, rIdx) => (
          <mesh key={`thread-${rIdx}`} position={[0, 0.04 + rIdx * 0.03, 0]}>
            <cylinderGeometry args={[0.021, 0.021, 0.006, 6]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.1} clippingPlanes={clippingPlanes} />
          </mesh>
        ))}
        {/* Regulation Collar Nut (ghiera) */}
        <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.02, 6]} />
          <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.4} clippingPlanes={clippingPlanes} />
        </mesh>
        {/* Collar handles */}
        <mesh position={[0, 0.16, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <cylinderGeometry args={[0.006, 0.006, 0.08, 6]} />
          <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.4} clippingPlanes={clippingPlanes} />
        </mesh>
        {/* Red safety plastic joint cover (coprigiunto rosso con striscia gialla) */}
        <mesh position={[0, 0.11, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.18, 12]} />
          <meshStandardMaterial color="#ef4444" roughness={0.5} metalness={0.1} clippingPlanes={clippingPlanes} />
        </mesh>
        <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.036, 0.036, 0.03, 12]} />
          <meshStandardMaterial color="#eab308" roughness={0.4} metalness={0.1} clippingPlanes={clippingPlanes} />
        </mesh>
      </group>
    );
  };

  // 1. If lightweight, render optimized instanced geometry
  if (lightweight) {
    return (
      <group>
        <ScaffoldingInstances 
          instances={instances} 
          uprightHeight={uprightHeight} 
          frameColor={frameColor} 
          galvanisedColor={galvanisedColor} 
          clippingPlanes={clippingPlanes} 
        />
        {segmentsData.map((seg, idx) => {
          const x_net = (seg.p1.x / 100 + seg.p2.x / 100) / 2 + seg.nX * 0.52;
          const z_net = -(seg.p1.y / 100 + seg.p2.y / 100) / 2 + seg.nZ * 0.52;
          const y_net = zBase + uprightHeight / 2;
          if (clippingPlanes.some(p => p.distanceToPoint(new THREE.Vector3(x_net, y_net, z_net)) < 0)) return null;
          return (
            <mesh key={`scaffold-net-${idx}`} position={[x_net, y_net, z_net]} rotation={[0, -seg.angle, 0]}>
              <boxGeometry args={[seg.length, uprightHeight, 0.002]} />
              <meshStandardMaterial color={netColor} transparent opacity={0.3} side={THREE.DoubleSide} clippingPlanes={clippingPlanes} />
            </mesh>
          );
        })}
      </group>
    );
  }

  // 2. Otherwise, render FULL high-quality detailed scaffolding with boards, toe-boards and ladders!
  const tubeRadius = 0.024; // 48mm tube diameter
  const braceRadius = 0.015; // 30mm tube diameter

  return (
    <group>
      {/* Standards (vertical poles), transoms and ledgers */}
      {segmentsData.map((seg, segIdx) => {
        const frames = seg.frames;
        
        return (
          <group key={`seg-detailed-${segIdx}`}>
            {/* Render frames (vertical standards and transoms) */}
            {frames.map((f, fIdx) => {
              const showInner = !clippingPlanes.some(p => p.distanceToPoint(new THREE.Vector3(f.x_inner, zBase, f.z_inner)) < 0);
              const showOuter = !clippingPlanes.some(p => p.distanceToPoint(new THREE.Vector3(f.x_outer, zBase, f.z_outer)) < 0);
              
              return (
                <group key={`frame-${fIdx}`}>
                  {/* Base Jacks at standard bottoms (piedritti con le vitone classiche e piastra gialla) */}
                  {showInner && renderBaseJack(f.x_inner, f.z_inner)}
                  {showOuter && renderBaseJack(f.x_outer, f.z_outer)}

                  {/* Inner Standard */}
                  {showInner && (
                    <mesh position={[f.x_inner, zBase + uprightHeight / 2, f.z_inner]} castShadow receiveShadow>
                      <cylinderGeometry args={[tubeRadius, tubeRadius, uprightHeight, 6]} />
                      <meshStandardMaterial color={frameColor} metalness={0.7} roughness={0.3} clippingPlanes={clippingPlanes} />
                    </mesh>
                  )}
                  {/* Outer Standard */}
                  {showOuter && (
                    <group>
                      <mesh position={[f.x_outer, zBase + uprightHeight / 2, f.z_outer]} castShadow receiveShadow>
                        <cylinderGeometry args={[tubeRadius, tubeRadius, uprightHeight, 6]} />
                        <meshStandardMaterial color={frameColor} metalness={0.7} roughness={0.3} clippingPlanes={clippingPlanes} />
                      </mesh>

                      {/* Night warning lighting attached (luci notturne rosse fisse su montanti esterni) */}
                      {fIdx % 2 === 0 && (
                        <group position={[f.x_outer + seg.nX * 0.1, zBase + 2.0, f.z_outer + seg.nZ * 0.1]}>
                          {/* Clamp coupling to standard */}
                          <mesh position={[-seg.nX * 0.06, 0, -seg.nZ * 0.06]}>
                            <boxGeometry args={[0.03, 0.04, 0.06]} />
                            <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.2} clippingPlanes={clippingPlanes} />
                          </mesh>
                          {/* Red warning battery casing */}
                          <mesh position={[0, -0.08, 0]} castShadow receiveShadow>
                            <boxGeometry args={[0.08, 0.12, 0.08]} />
                            <meshStandardMaterial color="#b91c1c" roughness={0.4} metalness={0.1} clippingPlanes={clippingPlanes} />
                          </mesh>
                          {/* Glowing translucent light dome (Red) */}
                          <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
                            <sphereGeometry args={[0.04, 16, 16]} />
                            <meshStandardMaterial 
                              color="#ef4444" 
                              emissive="#ef4444" 
                              emissiveIntensity={3.5} 
                              roughness={0.1} 
                              metalness={0.1} 
                              clippingPlanes={clippingPlanes} 
                            />
                          </mesh>
                          {/* Real PointLight to cast warm red night glow */}
                          <pointLight color="#ef4444" intensity={0.6} distance={3.0} decay={2.0} />
                        </group>
                      )}
                    </group>
                  )}
                  
                  {/* Transoms (horizontal bearers at each level l, connecting inner & outer standards) */}
                  {Array.from({ length: numLevels }).map((_, lIdx) => {
                    const y_level = zBase + (lIdx + 1) * 2.0;
                    const x_mid = (f.x_inner + f.x_outer) / 2;
                    const z_mid = (f.z_inner + f.z_outer) / 2;
                    
                    if (clippingPlanes.some(p => p.distanceToPoint(new THREE.Vector3(x_mid, y_level, z_mid)) < 0)) return null;
                    
                    return (
                      <mesh key={`transom-${lIdx}`} position={[x_mid, y_level, z_mid]} rotation={[Math.PI / 2, 0, Math.atan2(seg.nX, seg.nZ)]} castShadow receiveShadow>
                        <cylinderGeometry args={[tubeRadius, tubeRadius, 1.0, 6]} />
                        <meshStandardMaterial color={frameColor} metalness={0.7} roughness={0.3} clippingPlanes={clippingPlanes} />
                      </mesh>
                    );
                  })}

                  {/* Small diagonal corner braces (supporti diagonali grandi di accoppiamento montante-traverso, lunghi il doppio, solo sotto il traverso) */}
                  {Array.from({ length: numLevels }).map((_, lIdx) => {
                    const y_level = zBase + (lIdx + 1) * 2.0;
                    
                    const p_transom_inner_r = { x: f.x_inner + seg.nX * 0.32, y: y_level, z: f.z_inner + seg.nZ * 0.32 };
                    const p_transom_outer_l = { x: f.x_outer - seg.nX * 0.32, y: y_level, z: f.z_outer - seg.nZ * 0.32 };

                    return (
                      <group key={`braces-${lIdx}`}>
                        {/* Inner corner brace (only at the upper part of each level, i.e. under the top transom) */}
                        {showInner && (
                          <CylinderBetweenPoints 
                            p1={p_transom_inner_r} 
                            p2={{ x: f.x_inner, y: y_level - 0.32, z: f.z_inner }} 
                            radius={0.012} 
                            tubeColor={frameColor} 
                          />
                        )}
                        {/* Outer corner brace (only at the upper part of each level, i.e. under the top transom) */}
                        {showOuter && (
                          <CylinderBetweenPoints 
                            p1={p_transom_outer_l} 
                            p2={{ x: f.x_outer, y: y_level - 0.32, z: f.z_outer }} 
                            radius={0.012} 
                            tubeColor={frameColor} 
                          />
                        )}
                      </group>
                    );
                  })}

                  {/* Wall ties (ancoraggi a parete, un supporto ogni 20 mq per la stabilità) */}
                  {Array.from({ length: numLevels }).map((_, lIdx) => {
                    const y_level = zBase + (lIdx + 1) * 2.0;
                    
                    // Wall tie spacing: every 3rd frame on odd levels, or middle of short runs
                    const isWallTie = (fIdx % 3 === 0 && lIdx % 2 === 1) || 
                                      (seg.numSpans <= 2 && fIdx === Math.floor(seg.numSpans / 2) && lIdx === Math.min(1, numLevels - 1));
                    
                    if (!isWallTie || !showInner) return null;
                    
                    const p_start = { x: f.x_inner, y: y_level, z: f.z_inner };
                    const p_end = { x: f.x_inner - seg.nX * 0.45, y: y_level, z: f.z_inner - seg.nZ * 0.45 };
                    
                    return (
                      <group key={`wall-tie-${lIdx}`}>
                        {/* Anchor horizontal tie rod */}
                        <CylinderBetweenPoints p1={p_start} p2={p_end} radius={0.02} tubeColor={galvanisedColor} />
                        
                        {/* Orthogonal double clamp coupler at standard pole */}
                        <mesh position={[f.x_inner, y_level, f.z_inner]} castShadow receiveShadow>
                          <boxGeometry args={[0.07, 0.07, 0.07]} />
                          <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} clippingPlanes={clippingPlanes} />
                        </mesh>
                        
                        {/* Wall anchor plug (tassello rosso d'ancoraggio e piastra) */}
                        <mesh position={[p_end.x, p_end.y, p_end.z]} rotation={[Math.PI / 2, 0, Math.atan2(seg.nX, seg.nZ)]} castShadow receiveShadow>
                          <cylinderGeometry args={[0.03, 0.03, 0.04, 6]} />
                          <meshStandardMaterial color="#ef4444" roughness={0.5} metalness={0.1} clippingPlanes={clippingPlanes} />
                        </mesh>
                        <mesh position={[p_end.x + seg.nX * 0.01, p_end.y, p_end.z + seg.nZ * 0.01]} rotation={[Math.PI / 2, 0, Math.atan2(seg.nX, seg.nZ)]} castShadow receiveShadow>
                          <cylinderGeometry args={[0.05, 0.05, 0.01, 6]} />
                          <meshStandardMaterial color="#94a3b8" roughness={0.3} metalness={0.8} clippingPlanes={clippingPlanes} />
                        </mesh>
                      </group>
                    );
                  })}
                </group>
              );
            })}

            {/* Render Spans (Ledgers, Braces, Planks, Guardrails, Toe-boards, and Ladders/Stairs) */}
            {Array.from({ length: seg.numSpans }).map((_, sIdx) => {
              const f1 = frames[sIdx];
              const f2 = frames[sIdx + 1];
              const x_mid_seg = (f1.x + f2.x) / 2;
              const z_mid_seg = (f1.z + f2.z) / 2;
              
              const isLadderSpan = sIdx === 0; // place a ladder/stair inside the first span of each level

              return (
                <group key={`span-${sIdx}`}>
                  {/* Safety net (Telo/Rete antipolvere di protezione) */}
                  {(teloLato === 'esterno' || teloLato === 'entrambi') && (
                    <mesh 
                      position={[
                        (f1.x_outer + f2.x_outer) / 2, 
                        zBase + uprightHeight / 2, 
                        (f1.z_outer + f2.z_outer) / 2
                      ]} 
                      rotation={[0, -seg.angle, 0]} 
                      castShadow 
                      receiveShadow
                    >
                      <planeGeometry args={[seg.actualS, uprightHeight]} />
                      <meshStandardMaterial 
                        color="#047857" 
                        transparent 
                        opacity={0.65} 
                        roughness={0.9}
                        metalness={0.1}
                        side={THREE.DoubleSide}
                        clippingPlanes={clippingPlanes} 
                      />
                    </mesh>
                  )}
                  {(teloLato === 'interno' || teloLato === 'entrambi') && (
                    <mesh 
                      position={[
                        (f1.x_inner + f2.x_inner) / 2, 
                        zBase + uprightHeight / 2, 
                        (f1.z_inner + f2.z_inner) / 2
                      ]} 
                      rotation={[0, -seg.angle, 0]} 
                      castShadow 
                      receiveShadow
                    >
                      <planeGeometry args={[seg.actualS, uprightHeight]} />
                      <meshStandardMaterial 
                        color="#047857" 
                        transparent 
                        opacity={0.65} 
                        roughness={0.9}
                        metalness={0.1}
                        side={THREE.DoubleSide}
                        clippingPlanes={clippingPlanes} 
                      />
                    </mesh>
                  )}

                  {Array.from({ length: numLevels }).map((_, lIdx) => {
                    const y_floor = zBase + (lIdx + 1) * 2.0;
                    const x_plat = x_mid_seg;
                    const z_plat = z_mid_seg;
                    const y_plat = y_floor - 0.025; // Sits just below the transom level
                    
                    const isClipped = clippingPlanes.some(p => p.distanceToPoint(new THREE.Vector3(x_plat, y_floor, z_plat)) < 0);
                    if (isClipped) return null;

                    // Ledgers: horizontal lengthwise poles connecting frame standards from frame sIdx to sIdx+1
                    const innerLedgerP1 = { x: f1.x_inner, y: y_floor, z: f1.z_inner };
                    const innerLedgerP2 = { x: f2.x_inner, y: y_floor, z: f2.z_inner };
                    const outerLedgerP1 = { x: f1.x_outer, y: y_floor, z: f1.z_outer };
                    const outerLedgerP2 = { x: f2.x_outer, y: y_floor, z: f2.z_outer };

                    // Diagonal bracing on the outer side for stability
                    const diagP1 = { x: f1.x_outer, y: y_floor - 2.0, z: f1.z_outer };
                    const diagP2 = { x: f2.x_outer, y: y_floor, z: f2.z_outer };
                    // Diagonal bracing on the inner side
                    const innerDiagP1 = { x: f1.x_inner, y: y_floor - 2.0, z: f1.z_inner };
                    const innerDiagP2 = { x: f2.x_inner, y: y_floor, z: f2.z_inner };

                    // Double guardrails on the outer side for safety
                    const outerGuardrailLowP1 = { x: f1.x_outer, y: y_floor + 0.5, z: f1.z_outer };
                    const outerGuardrailLowP2 = { x: f2.x_outer, y: y_floor + 0.5, z: f2.z_outer };
                    const outerGuardrailHighP1 = { x: f1.x_outer, y: y_floor + 1.0, z: f1.z_outer };
                    const outerGuardrailHighP2 = { x: f2.x_outer, y: y_floor + 1.0, z: f2.z_outer };

                    return (
                      <group key={`level-${lIdx}`}>
                        {/* Ledgers */}
                        <CylinderBetweenPoints p1={innerLedgerP1} p2={innerLedgerP2} radius={tubeRadius} tubeColor={galvanisedColor} />
                        <CylinderBetweenPoints p1={outerLedgerP1} p2={outerLedgerP2} radius={tubeRadius} tubeColor={galvanisedColor} />
                        
                        {/* Diagonal braces (alternate direction based on level index) - OUTER SIDE */}
                        {lIdx % 2 === 0 ? (
                          <CylinderBetweenPoints p1={diagP1} p2={diagP2} radius={braceRadius} tubeColor={galvanisedColor} />
                        ) : (
                          <CylinderBetweenPoints 
                            p1={{ x: f1.x_outer, y: y_floor, z: f1.z_outer }} 
                            p2={{ x: f2.x_outer, y: y_floor - 2.0, z: f2.z_outer }} 
                            radius={braceRadius} 
                            tubeColor={galvanisedColor} 
                          />
                        )}

                        {/* Diagonal braces (alternate direction based on level index) - INNER SIDE */}
                        {lIdx % 2 === 0 ? (
                          <CylinderBetweenPoints p1={innerDiagP1} p2={innerDiagP2} radius={braceRadius} tubeColor={galvanisedColor} />
                        ) : (
                          <CylinderBetweenPoints 
                            p1={{ x: f1.x_inner, y: y_floor, z: f1.z_inner }} 
                            p2={{ x: f2.x_inner, y: y_floor - 2.0, z: f2.z_inner }} 
                            radius={braceRadius} 
                            tubeColor={galvanisedColor} 
                          />
                        )}

                        {/* Outer Guardrails */}
                        <CylinderBetweenPoints p1={outerGuardrailLowP1} p2={outerGuardrailLowP2} radius={braceRadius} tubeColor={galvanisedColor} />
                        <CylinderBetweenPoints p1={outerGuardrailHighP1} p2={outerGuardrailHighP2} radius={braceRadius} tubeColor={galvanisedColor} />

                        {/* Planks, hatches, toe-boards and ladder are only present on levels BELOW the top protective level */}
                        {lIdx < numLevels - 1 && (
                          <group>
                            {/* Planks (Wooden boards, Tavole permapiede in abete con botola per scale) */}
                            {(() => {
                              const planksOffsets = [-0.375, -0.125, 0.125, 0.375];
                              const plankWidth = 0.24; 
                              const plankThickness = 0.05;
                              const gapHalfLen = Math.min(0.35, seg.actualS * 0.25);

                              return planksOffsets.map((off, pIdx) => {
                                // If this is a ladder span, the two inner planks (off === -0.125 and -0.375)
                                // have a cutout in the middle for the 90-degree rotated stairs!
                                if (isLadderSpan && (off === -0.125 || off === -0.375)) {
                                  const leftLen = seg.actualS / 2 - gapHalfLen;
                                  const leftOffset = -(seg.actualS / 2 + gapHalfLen) / 2;
                                  const rightLen = seg.actualS / 2 - gapHalfLen;
                                  const rightOffset = +(seg.actualS / 2 + gapHalfLen) / 2;

                                  return (
                                    <group key={`plank-cutout-${pIdx}`}>
                                      {/* Left Piece */}
                                      {leftLen > 0.05 && (
                                        <mesh position={[x_plat + seg.nX * off + seg.uX * leftOffset, y_plat, z_plat + seg.nZ * off + seg.uZ * leftOffset]} rotation={[0, -seg.angle, 0]} castShadow receiveShadow>
                                          <boxGeometry args={[leftLen, plankThickness, plankWidth]} />
                                          <meshStandardMaterial color={woodenColor} metalness={0.1} roughness={0.8} clippingPlanes={clippingPlanes} />
                                        </mesh>
                                      )}
                                      {/* Right Piece */}
                                      {rightLen > 0.05 && (
                                        <mesh position={[x_plat + seg.nX * off + seg.uX * rightOffset, y_plat, z_plat + seg.nZ * off + seg.uZ * rightOffset]} rotation={[0, -seg.angle, 0]} castShadow receiveShadow>
                                          <boxGeometry args={[rightLen, plankThickness, plankWidth]} />
                                          <meshStandardMaterial color={woodenColor} metalness={0.1} roughness={0.8} clippingPlanes={clippingPlanes} />
                                        </mesh>
                                      )}
                                    </group>
                                  );
                                }

                                // Otherwise, normal solid plank
                                return (
                                  <mesh key={`plank-${pIdx}`} position={[x_plat + seg.nX * off, y_plat, z_plat + seg.nZ * off]} rotation={[0, -seg.angle, 0]} castShadow receiveShadow>
                                    <boxGeometry args={[seg.actualS, plankThickness, plankWidth]} />
                                    <meshStandardMaterial color={woodenColor} metalness={0.1} roughness={0.8} clippingPlanes={clippingPlanes} />
                                  </mesh>
                                );
                              });
                            })()}

                            {/* Open Hatch Cover (la botola aperta che si apre verso l'alto) */}
                            {isLadderSpan && (() => {
                              const gapHalfLen = Math.min(0.35, seg.actualS * 0.25);
                              return (
                                <group position={[x_plat + seg.uX * gapHalfLen - seg.nX * 0.25, y_plat + 0.01, z_plat + seg.uZ * gapHalfLen - seg.nZ * 0.25]} rotation={[0, -seg.angle, 0]}>
                                  {/* Open rotation: 80 degrees upwards */}
                                  <group rotation={[0, 0, -1.35]}>
                                    <mesh position={[-gapHalfLen, 0.0075, 0]} castShadow receiveShadow>
                                      <boxGeometry args={[gapHalfLen * 2, 0.015, 0.48]} />
                                      <meshStandardMaterial color={woodenColor} metalness={0.1} roughness={0.8} clippingPlanes={clippingPlanes} />
                                    </mesh>
                                    {/* Small metal ring handle on the hatch */}
                                    <mesh position={[-gapHalfLen * 1.5, 0.015, 0]}>
                                      <torusGeometry args={[0.02, 0.004, 6, 12]} />
                                      <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.2} clippingPlanes={clippingPlanes} />
                                    </mesh>
                                  </group>
                                </group>
                              );
                            })()}

                            {/* Safety Toe-boards (Fermapiede in legno spessore 2.5cm altezza 15cm) */}
                            {Array.from({ length: tavoleFermapiedeCount }).map((_, boardIdx) => {
                              const y_offset = 0.075 + boardIdx * 0.15;
                              return (
                                <mesh 
                                  key={`toe-board-${boardIdx}`}
                                  position={[x_plat + seg.nX * 0.48, y_floor + y_offset, z_plat + seg.nZ * 0.48]} 
                                  rotation={[0, -seg.angle, 0]} 
                                  castShadow 
                                  receiveShadow
                                >
                                  <boxGeometry args={[seg.actualS, 0.15, 0.025]} />
                                  <meshStandardMaterial color={woodenColor} metalness={0.1} roughness={0.8} clippingPlanes={clippingPlanes} />
                                </mesh>
                              );
                            })}

                            {/* Ladder / Stairs (Scala metallica inclinata ruotata di 90 gradi con rami e pioli) */}
                            {isLadderSpan && (() => {
                              const stepsCount = 8;
                              const stairWidth = 0.32; // fits inside the open hatch cutout

                              // 90-degree rotated stairs slope along the length / span direction (uX, uZ)
                              // Bottom of ladder is shifted along -uX / -uZ, top is shifted along +uX / +uZ
                              const len_b = -seg.actualS * 0.35;
                              const len_t = seg.actualS * 0.15;

                              // Centers in depth (around -0.25 normal offset, matching the cutout planks)
                              const off_h = -0.25;

                              const x_b = x_plat + seg.uX * len_b + seg.nX * off_h;
                              const z_b = z_plat + seg.uZ * len_b + seg.nZ * off_h;
                              const y_b = y_floor - 2.0;

                              const x_t = x_plat + seg.uX * len_t + seg.nX * off_h;
                              const z_t = z_plat + seg.uZ * len_t + seg.nZ * off_h;
                              const y_t = y_floor - 0.1;

                              // Left and Right rails of the ladder (separated along the NORMAL direction nX, nZ)
                              const rail1_b = { x: x_b - seg.nX * (stairWidth / 2), y: y_b, z: z_b - seg.nZ * (stairWidth / 2) };
                              const rail1_t = { x: x_t - seg.nX * (stairWidth / 2), y: y_t, z: z_t - seg.nZ * (stairWidth / 2) };
                              const rail2_b = { x: x_b + seg.nX * (stairWidth / 2), y: y_b, z: z_b + seg.nZ * (stairWidth / 2) };
                              const rail2_t = { x: x_t + seg.nX * (stairWidth / 2), y: y_t, z: z_t + seg.nZ * (stairWidth / 2) };

                              return (
                                <group key="ladder-rotated-90">
                                  {/* Left Rail */}
                                  <CylinderBetweenPoints p1={rail1_b} p2={rail1_t} radius={0.015} tubeColor={galvanisedColor} />
                                  {/* Right Rail */}
                                  <CylinderBetweenPoints p1={rail2_b} p2={rail2_t} radius={0.015} tubeColor={galvanisedColor} />

                                  {/* Ladder Rungs (Pioli) */}
                                  {Array.from({ length: stepsCount }).map((_, stIdx) => {
                                    const ratio = (stIdx + 0.5) / stepsCount;
                                    const xs_mid = x_b + ratio * (x_t - x_b);
                                    const zs_mid = z_b + ratio * (z_t - z_b);
                                    const ys_mid = y_b + ratio * (y_t - y_b);

                                    // Steps connect left and right rails along the nX, nZ normal direction
                                    const stepP1 = { x: xs_mid - seg.nX * (stairWidth / 2), y: ys_mid, z: zs_mid - seg.nZ * (stairWidth / 2) };
                                    const stepP2 = { x: xs_mid + seg.nX * (stairWidth / 2), y: ys_mid, z: zs_mid + seg.nZ * (stairWidth / 2) };

                                    return (
                                      <CylinderBetweenPoints 
                                        key={`rung-${stIdx}`} 
                                        p1={stepP1} 
                                        p2={stepP2} 
                                        radius={0.008} 
                                        tubeColor={galvanisedColor} 
                                      />
                                    );
                                  })}
                                </group>
                              );
                            })()}
                          </group>
                        )}
                      </group>
                    );
                  })}
                </group>
              );
            })}
          </group>
        );
      })}

      {/* Safety green net wrapping the exterior ONLY (one side of scaffolding) */}
      {segmentsData.map((seg, idx) => {
        const x_net = (seg.p1.x / 100 + seg.p2.x / 100) / 2 + seg.nX * 0.52;
        const z_net = -(seg.p1.y / 100 + seg.p2.y / 100) / 2 + seg.nZ * 0.52;
        const y_net = zBase + uprightHeight / 2;
        if (clippingPlanes.some(p => p.distanceToPoint(new THREE.Vector3(x_net, y_net, z_net)) < 0)) return null;
        return (
          <mesh key={`scaffold-net-${idx}`} position={[x_net, y_net, z_net]} rotation={[0, -seg.angle, 0]}>
            <boxGeometry args={[seg.length, uprightHeight, 0.002]} />
            <meshStandardMaterial color={netColor} transparent opacity={0.3} side={THREE.DoubleSide} clippingPlanes={clippingPlanes} />
          </mesh>
        );
      })}
    </group>
  );
});

Scaffolding3D.displayName = 'Scaffolding3D';

// Optimization: Dedicated component for high-performance instanced meshes
const ScaffoldingInstances = React.memo(({ instances, uprightHeight, frameColor, galvanisedColor, clippingPlanes }: any) => {
  const stdRef = useRef<THREE.InstancedMesh>(null);
  const traRef = useRef<THREE.InstancedMesh>(null);
  const plaRef = useRef<THREE.InstancedMesh>(null);
  const guaRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (stdRef.current) {
      instances.standards.forEach((m: any, i: number) => stdRef.current!.setMatrixAt(i, m));
      stdRef.current.instanceMatrix.needsUpdate = true;
    }
    if (traRef.current) {
      instances.transoms.forEach((m: any, i: number) => traRef.current!.setMatrixAt(i, m));
      traRef.current.instanceMatrix.needsUpdate = true;
    }
    if (plaRef.current) {
      instances.planks.forEach((m: any, i: number) => plaRef.current!.setMatrixAt(i, m));
      plaRef.current.instanceMatrix.needsUpdate = true;
    }
    if (guaRef.current) {
      instances.guardrails.forEach((m: any, i: number) => guaRef.current!.setMatrixAt(i, m));
      guaRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [instances]);

  return (
    <group>
      <instancedMesh ref={stdRef} args={[null as any, null as any, instances.standards.length]} castShadow receiveShadow>
        <boxGeometry args={[0.048, uprightHeight, 0.048]} />
        <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.4} clippingPlanes={clippingPlanes} />
      </instancedMesh>
      <instancedMesh ref={traRef} args={[null as any, null as any, instances.transoms.length]} castShadow receiveShadow>
        <cylinderGeometry args={[0.024, 0.024, 1.0, 6]} />
        <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.4} clippingPlanes={clippingPlanes} />
      </instancedMesh>
      <instancedMesh ref={plaRef} args={[null as any, null as any, instances.planks.length]} castShadow receiveShadow>
        <boxGeometry args={[1, 0.05, 0.24]} />
        <meshStandardMaterial color={galvanisedColor} metalness={0.8} roughness={0.3} clippingPlanes={clippingPlanes} />
      </instancedMesh>
      <instancedMesh ref={guaRef} args={[null as any, null as any, instances.guardrails.length]} castShadow receiveShadow>
        <cylinderGeometry args={[0.015, 0.015, 1, 6]} />
        <meshStandardMaterial color={galvanisedColor} metalness={0.9} roughness={0.2} clippingPlanes={clippingPlanes} />
      </instancedMesh>
    </group>
  );
});
ScaffoldingInstances.displayName = 'ScaffoldingInstances';

interface Mantovana3DProps {
  points: Point[];
  height?: number; // custom cantilever projection length in cm
  baseZ: number;   // base height in cm
  color?: string;
  clippingPlanes?: THREE.Plane[];
  isLinear?: boolean;
  mantovanaAngle?: number;
  sideSign?: number;
}

export const Mantovana3D = React.memo(({
  points,
  height = 150, // default horizontal projection width in cm (1.20m or 1.50m)
  baseZ,
  color = '#eab308', // classic golden-yellow spruce wood color
  clippingPlanes = [],
  isLinear = true,
  mantovanaAngle = 45,
  sideSign = -1 // Default to -1 so it projects opposite to standard wall
}: Mantovana3DProps) => {
  const zBase = baseZ / 100;
  
  // Enforce regulatory minimum inclination of 30 degrees
  const angleDeg = Math.max(30, mantovanaAngle || 45);
  const angleRad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  // Regulatory horizontal projection in meters (default 1.50m for general safety)
  // We resolve the unit: if it's in cm (80 to 180), convert to meters. If in meters (0.8 to 1.8), use as-is.
  // If it's a default wall height (e.g., 270 or 300) or undefined, fallback to exactly 1.50m.
  let projWidthM = 1.50;
  if (height && height >= 80 && height <= 180) {
    projWidthM = height / 100;
  } else if (height && height >= 0.8 && height <= 1.8) {
    projWidthM = height;
  }

  // Calculate exact structural arm length (hypotenuse) to achieve the target horizontal projection
  const armLength = projWidthM / cosA;

  // Extract horizontal segments, and keep only the longest one representing the free outer side
  const segments = useMemo(() => {
    const list = [];
    if (!points || points.length < 2) return [];
    
    const count = isLinear ? points.length - 1 : points.length;
    for (let i = 0; i < count; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      
      const dx = (p2.x - p1.x) / 100;
      const dy = (p2.y - p1.y) / 100;
      const len = Math.hypot(dx, dy);
      
      if (len > 0.1) {
        list.push({
          p1: { x: p1.x / 100, y: p1.y / 100 },
          p2: { x: p2.x / 100, y: p2.y / 100 },
          length: len,
          dx,
          dy
        });
      }
    }

    if (list.length === 0) return [];
    // Keep only the single longest segment representing the free opposite facade
    let longest = list[0];
    for (let i = 1; i < list.length; i++) {
      if (list[i].length > longest.length) {
        longest = list[i];
      }
    }
    return [longest];
  }, [points, isLinear]);

  const CylinderBetweenPoints = useCallback(({ p1, p2, radius, tubeColor }: {
    p1: { x: number; y: number; z: number };
    p2: { x: number; y: number; z: number };
    radius: number;
    tubeColor: string;
  }) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.01) return null;

    const midpoint = new THREE.Vector3(p1.x + dx / 2, p1.y + dy / 2, p1.z + dz / 2);
    if (clippingPlanes && clippingPlanes.length > 0) {
      if (clippingPlanes.some(plane => plane.distanceToPoint(midpoint) < 0)) {
        return null;
      }
    }

    const quat = (() => {
      const v = new THREE.Vector3(dx, dy, dz).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      return new THREE.Quaternion().setFromUnitVectors(up, v);
    })();

    return (
      <mesh position={midpoint} quaternion={quat} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, len, 6]} />
        <meshStandardMaterial 
          color={tubeColor} 
          metalness={0.8} 
          roughness={0.2} 
          clippingPlanes={clippingPlanes} 
          clipShadows={true} 
        />
      </mesh>
    );
  }, [clippingPlanes]);

  if (segments.length === 0) return null;

  return (
    <group>
      {segments.map((seg, segIdx) => {
        const uX = seg.dx / seg.length;
        const uZ = -seg.dy / seg.length;
        
        const effSide = sideSign !== undefined ? sideSign : -1;
        const nX = -uZ * effSide;
        const nZ = uX * effSide;
        
        const angle = Math.atan2(seg.dy, seg.dx);
        const numSpans = Math.max(1, Math.round(seg.length / 1.8));
        const actualS = seg.length / numSpans;
        
        const frames = [];
        for (let j = 0; j <= numSpans; j++) {
          const t = j / numSpans;
          const x = seg.p1.x + t * (seg.p2.x - seg.p1.x);
          const z = -(seg.p1.y + t * (seg.p2.y - seg.p1.y));
          frames.push({ x, z });
        }

        // Orthonormal basis vectors to align the planks parallel and inclined along the brackets
        const dirX = new THREE.Vector3(uX, 0, uZ).normalize();
        const dirZ = new THREE.Vector3(nX * cosA, sinA, nZ * cosA).normalize();
        const dirY = new THREE.Vector3().crossVectors(dirZ, dirX).normalize();
        const matrix = new THREE.Matrix4().makeBasis(dirX, dirY, dirZ);
        const plankQuaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);

        return (
          <group key={`mantovana-seg-${segIdx}`}>
            {/* 1. Metal cantilever brackets & high oblique tie-rods */}
            {frames.map((f, fIdx) => {
              const startOffset = 0.5; // starts from the outer standards of the centered 1m scaffolding
              const x_start = f.x + nX * startOffset;
              const z_start = f.z + nZ * startOffset;
              const y_start = zBase;

              const x_end = x_start + nX * armLength * cosA;
              const z_end = z_start + nZ * armLength * cosA;
              const y_end = y_start + armLength * sinA;

              const isClippedBracket = clippingPlanes.some(p => p.distanceToPoint(new THREE.Vector3(x_start, y_start, z_start)) < 0);
              if (isClippedBracket) return null;

              return (
                <group key={`mantovana-bracket-${fIdx}`}>
                  {/* Cantilever principal support arm (metal tube) */}
                  <CylinderBetweenPoints 
                    p1={{ x: x_start, y: y_start, z: z_start }}
                    p2={{ x: x_end, y: y_end, z: z_end }}
                    radius={0.024}
                    tubeColor="#cbd5e1"
                  />
                  {/* High oblique structural tie rod / safety steel cable (Tirante obliquo di sospensione superiore) */}
                  <CylinderBetweenPoints 
                    p1={{ x: x_start, y: y_start + 1.6, z: z_start }}
                    p2={{ x: x_end, y: y_end, z: z_end }}
                    radius={0.014}
                    tubeColor="#475569"
                  />
                </group>
              );
            })}

            {/* 2. Regulatory Spruce Wood Planks (Tavolato continuo in abete spessore 45mm o lamiera) */}
            {frames.slice(0, -1).map((_, sIdx) => {
              const f1 = frames[sIdx];
              const f2 = frames[sIdx + 1];

              const startOffset = 0.5; // starts from the outer face of scaffolding

              // We render 4 separate wood boards laid parallel along the support arm
              const steps = [0.15, 0.40, 0.65, 0.90];
              const plankThickness = 0.045; // 45mm compliant wood thickness
              const plankWidth = armLength * 0.22;

              return (
                <group key={`mantovana-planks-${sIdx}`}>
                  {steps.map((stepVal, stepIdx) => {
                    const x_p1_mid = f1.x + nX * startOffset + nX * armLength * stepVal * cosA;
                    const z_p1_mid = f1.z + nZ * startOffset + nZ * armLength * stepVal * cosA;
                    const y_mid = zBase + armLength * stepVal * sinA;

                    const x_p2_mid = f2.x + nX * startOffset + nX * armLength * stepVal * cosA;
                    const z_p2_mid = f2.z + nZ * startOffset + nZ * armLength * stepVal * cosA;

                    const x_center = (x_p1_mid + x_p2_mid) / 2;
                    const z_center = (z_p1_mid + z_p2_mid) / 2;

                    const isClippedDeck = clippingPlanes.some(p => p.distanceToPoint(new THREE.Vector3(x_center, y_mid, z_center)) < 0);
                    if (isClippedDeck) return null;

                    return (
                      <mesh 
                        key={`plank-board-${stepIdx}`}
                        position={[x_center, y_mid, z_center]} 
                        quaternion={plankQuaternion}
                        castShadow 
                        receiveShadow
                      >
                        <boxGeometry args={[actualS, plankThickness, plankWidth]} />
                        <meshStandardMaterial 
                          color="#f59e0b" // beautiful golden safety spruce wood color
                          roughness={0.7} 
                          metalness={0.1} 
                          clippingPlanes={clippingPlanes}
                          clipShadows={true}
                        />
                      </mesh>
                    );
                  })}

                  {/* Safety toe board / barrier at the outer edge */}
                  {(() => {
                    const s_edge = 0.96;
                    const x_edge1 = f1.x + nX * startOffset + nX * armLength * s_edge * cosA;
                    const z_edge1 = f1.z + nZ * startOffset + nZ * armLength * s_edge * cosA;
                    const y_edge = zBase + armLength * s_edge * sinA;

                    const x_edge2 = f2.x + nX * startOffset + nX * armLength * s_edge * cosA;
                    const z_edge2 = f2.z + nZ * startOffset + nZ * armLength * s_edge * cosA;

                    const x_mid_edge = (x_edge1 + x_edge2) / 2;
                    const z_mid_edge = (z_edge1 + z_edge2) / 2;

                    // Sit exactly on top of the planks by shifting by half the toe-board height (0.12m) in the local Y-axis direction
                    const pos_x = x_mid_edge + dirY.x * 0.12;
                    const pos_y = y_edge + dirY.y * 0.12;
                    const pos_z = z_mid_edge + dirY.z * 0.12;

                    return (
                      <mesh 
                        position={[pos_x, pos_y, pos_z]} 
                        quaternion={plankQuaternion}
                        castShadow
                      >
                        <boxGeometry args={[actualS, 0.24, 0.03]} />
                        <meshStandardMaterial 
                          color="#ea580c" // Safety Orange
                          roughness={0.8} 
                          metalness={0.1}
                          clippingPlanes={clippingPlanes}
                        />
                      </mesh>
                    );
                  })()}
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
});
Mantovana3D.displayName = 'Mantovana3D';

export const Room = ({ 
  points, 
  holes, 
  height, 
  color, 
  width,
  name, 
  areaType, 
  baseZ, 
  bimFamilyId,
  renderMode,
  isLinear,
  clippingPlanes = [], 
  opacity = 1,
  globalOpacityMode = 'WORK',
  globalRoomOpacityVal = 0.25,
  globalWallOpacityVal = 0.50,
  isSlicing = false,
  slicingHeight = 0,
  slicingMode = 'HIDE_ABOVE',
  windowThickness = 0.5,
  sectionHatchMode = true,
  perimeterThickness = 5.5,
  hatchDensity = 4.0,
  hatchThickness = 2.0,
  hatchLineColor = '#000000',
  hatchBgColorMode = 'white',
  hatchBgColorCustom = '#ffffff',
  hatchPatternMode = 'diagonal',
  parentPivot = [0, 0, 0],
  parentRotation = [0, 0, 0],
  coincidentWallWidth,
  sideSign = 1,
  coincidentOffset,
  isFaceAligned = false,
  renderingStyle = 'none',
  hasMantovana = true,
  mantovanaAngle = 45,
  mantovanaHeight = 4.5,
  isScaffoldLightweight = false,
  teloLato = 'esterno',
  tavoleFermapiedeCount = 1
}: { 
  points: Point[], 
  holes?: Point[][], 
  height: number, 
  width?: number,
  color: string, 
  name?: string, 
  areaType?: string, 
  baseZ: number, 
  bimFamilyId?: string,
  renderMode?: 'solid' | 'transparent' | 'parete_verticale' | 'parete_orizzontale',
  isLinear?: boolean,
  clippingPlanes?: THREE.Plane[], 
  opacity?: number,
  globalOpacityMode?: 'WORK' | 'SOLID',
  globalRoomOpacityVal?: number,
  globalWallOpacityVal?: number,
  isSlicing?: boolean,
  slicingHeight?: number,
  slicingMode?: 'HIDE_ABOVE' | 'HIDE_BELOW' | 'WINDOW',
  windowThickness?: number,
  sectionHatchMode?: boolean,
  perimeterThickness?: number,
  hatchDensity?: number,
  hatchThickness?: number,
  hatchLineColor?: string,
  hatchBgColorMode?: 'white' | 'entity' | 'gray' | 'custom',
  hatchBgColorCustom?: string,
  hatchPatternMode?: 'diagonal' | 'horizontal' | 'vertical' | 'cross',
  parentPivot?: [number, number, number],
  parentRotation?: [number, number, number],
  coincidentWallWidth?: number,
  sideSign?: number,
  coincidentOffset?: number,
  isFaceAligned?: boolean,
  renderingStyle?: BIMRenderingStyle,
  hasMantovana?: boolean,
  mantovanaAngle?: number,
  mantovanaHeight?: number,
  isScaffoldLightweight?: boolean,
  teloLato?: 'none' | 'esterno' | 'interno' | 'entrambi',
  tavoleFermapiedeCount?: number
}) => {
  if (renderingStyle === 'ponteggio') {
    return (
      <Scaffolding3D 
        points={points}
        height={height}
        baseZ={baseZ}
        color={color}
        clippingPlanes={clippingPlanes}
        isLinear={isLinear}
        hasMantovana={hasMantovana}
        mantovanaAngle={mantovanaAngle}
        mantovanaHeight={mantovanaHeight}
        lightweight={isScaffoldLightweight}
        teloLato={teloLato}
        tavoleFermapiedeCount={tavoleFermapiedeCount}
      />
    );
  }

  if (renderingStyle === 'mantovana') {
    return (
      <Mantovana3D 
        points={points}
        height={height}
        baseZ={baseZ}
        color={color}
        clippingPlanes={clippingPlanes}
        isLinear={isLinear}
        mantovanaAngle={mantovanaAngle}
        sideSign={sideSign}
      />
    );
  }

  const h = renderMode === 'parete_orizzontale' ? (height ? height / 100 : 0.03) : height / 100;
  const zBase = baseZ / 100;

  const realisticTextures = useMemo(() => {
    const id = (bimFamilyId || '').toLowerCase().trim();
    if (!id && renderingStyle !== 'solaio_pignatte') return null;
    let type: 'concrete' | 'masonry' | 'partition' | 'plaster' | 'plaster_rustic' | 'stone' | 'insulation' | 'tiles' | 'casseri' | 'solaio_pignatte' | null = null;
    if (renderingStyle === 'solaio_pignatte') {
      type = 'solaio_pignatte';
    } else if (id.includes('pilastri') || id.includes('fondazioni') || id.includes('solaio') || id.includes('c.a.') || id.includes('casseri')) {
      type = 'concrete';
    } else if (id.includes('murature') || id.includes('muro') || id.includes('portant') || id.includes('matton') || id.includes('svizzeri')) {
      type = 'masonry';
    } else if (id.includes('tramezz') || id.includes('divisori')) {
      type = 'partition';
    } else if (id.includes('rivest') || id.includes('piastrell') || id.includes('tiles') || id.includes('ceramica')) {
      type = 'tiles';
    } else if (id.includes('intonaco_rustico') || id.includes('plaster_rustic')) {
      type = 'plaster_rustic';
    } else if (id.includes('intonac') || id.includes('plaster') || id.includes('finitura')) {
      type = 'plaster';
    } else if (id.includes('isolam') || id.includes('cappott') || id.includes('coibent')) {
      type = 'insulation';
    }
    
    if (type) {
      if (type === 'solaio_pignatte') {
        return {
          side: createBIMMaterialTexture('solaio_pignatte', 'side', color),
          top: createBIMMaterialTexture('concrete', 'top', color),
          concreteSide: createBIMMaterialTexture('concrete', 'side', color),
          type
        };
      }
      return {
        side: createBIMMaterialTexture(type, 'side', color),
        top: createBIMMaterialTexture(type, 'top', color),
        type
      };
    }
    return null;
  }, [bimFamilyId, color, renderingStyle]);

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

  const centroid = useMemo(() => {
    if (!points || points.length === 0) return { x: 0, y: 0 };
    let sx = 0, sy = 0;
    points.forEach(p => { sx += p.x; sy += p.y; });
    return { x: sx / (points.length * 100), y: sy / (points.length * 100) };
  }, [points]);

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

  const isPlaster = useMemo(() => {
    const familyLower = (bimFamilyId || '').toLowerCase();
    const nameLower = (name || '').toLowerCase();
    return familyLower.includes('intonac') || 
           familyLower.includes('rivest') ||
           familyLower.includes('pittur') ||
           familyLower.includes('tinteg') ||
           familyLower.includes('isolam') ||
           familyLower.includes('cappott') ||
           familyLower.includes('finitur') ||
           familyLower.includes('plaster') ||
           nameLower.includes('intonac') ||
           nameLower.includes('rivest') ||
           nameLower.includes('pittur') ||
           nameLower.includes('tinteg') ||
           nameLower.includes('cappott') ||
           nameLower.includes('isolam');
  }, [bimFamilyId, name]);

  const patternTexture = useMemo(() => {
    // The top surface of the slab (floor) is concrete, so we don't render pignatte there.
    // The pignatte are rendered on the underside (ceiling) of the slab mesh itself.
    return null;
  }, []);

  const shouldRenderAsVerticalWalls = renderMode === 'parete_verticale' || (isPlaster && renderMode !== 'parete_orizzontale');
  const isWall = areaType === 'muro' || shouldRenderAsVerticalWalls;
  
  let finalOpacity;
  let finalFloorOpacity;
  
  if (globalOpacityMode === 'SOLID') {
    finalOpacity = isWall ? 1.0 : 0.85;
    finalFloorOpacity = 0.9;
  } else {
    const baseOpacity = isWall ? globalWallOpacityVal : globalRoomOpacityVal;
    finalOpacity = opacity < 1 ? opacity * baseOpacity : baseOpacity;
    finalFloorOpacity = opacity < 1 ? Math.min(opacity * baseOpacity, 0.4) : Math.min(baseOpacity, 0.4);
  }

  const [px, py, pz] = parentPivot;
  const [rx, ry, rz] = parentRotation;

  const isCappingEnabled = isSlicing && (renderMode !== 'transparent' || globalOpacityMode === 'SOLID');
  
  let roomShowCapBottom = false;
  let roomShowCapTop = false;

  if (isCappingEnabled) {
    const tPivot = new THREE.Matrix4().makeTranslation(px, py, pz);
    const rParent = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
    const tPivotInv = new THREE.Matrix4().makeTranslation(-px, -py, -pz);
    const parentLocalToWorld = new THREE.Matrix4().multiply(tPivot).multiply(rParent).multiply(tPivotInv);

    const localCorners: THREE.Vector3[] = [];
    for (const p of points) {
      const lx = p.x / 100;
      const lz = -p.y / 100;
      localCorners.push(new THREE.Vector3(lx, zBase, lz));
      localCorners.push(new THREE.Vector3(lx, zBase + h, lz));
    }

    let minY = Infinity;
    let maxY = -Infinity;
    for (const corner of localCorners) {
      const w = corner.clone().applyMatrix4(parentLocalToWorld);
      if (w.y < minY) minY = w.y;
      if (w.y > maxY) maxY = w.y;
    }

    if (slicingMode === 'HIDE_ABOVE') {
      roomShowCapBottom = slicingHeight > minY && slicingHeight < maxY;
    } else if (slicingMode === 'HIDE_BELOW') {
      roomShowCapTop = slicingHeight > minY && slicingHeight < maxY;
    } else if (slicingMode === 'WINDOW') {
      const half = windowThickness / 2;
      const tY = slicingHeight + half;
      const bY = slicingHeight - half;
      roomShowCapTop = tY > minY && tY < maxY;
      roomShowCapBottom = bY > minY && bY < maxY;
    }
  }

  const verticalWallSegments = useMemo(() => {
    if (!shouldRenderAsVerticalWalls || !points || points.length < 2) return [];
    const result = [];
    const h = height / 100;
    const zBase = baseZ / 100;
    const symbolicThickness = (width || 4) / 100; // Use object width if provided, otherwise default to symbolic 4cm
    
    const plasterThickness = (width || 2) / 100;
    const wallThick = coincidentWallWidth ? (coincidentWallWidth / 100) : 0.15;
    
    // Offset is half of the wall thickness + half of plaster thickness + tiny gap (2mm) to avoid Z-fighting, multiplied by sideSign (direction)
    const finalSideSign = sideSign !== undefined ? sideSign : 1;
    let offsetZ = 0;
    if (coincidentOffset !== undefined) {
      offsetZ = coincidentOffset;
    } else if (isFaceAligned) {
      // If it's face aligned (traced from edge), offset it by half its own thickness
      offsetZ = (symbolicThickness / 2 + 0.001) * finalSideSign;
    } else {
      offsetZ = isPlaster ? (wallThick / 2 + plasterThickness / 2 + 0.002) * finalSideSign : 0; 
    }

    // Close the loop for perimeter walls only if not linear
    const len = points.length;
    const loopLimit = isLinear ? len - 1 : len;
    for (let i = 0; i < loopLimit; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % len];
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length < 0.01) continue; // Skip identical points
      
      const angle = Math.atan2(dy, dx);
      const centerX = (p1.x + p2.x) / 2;
      const centerY = (p1.y + p2.y) / 2;
      
      // Calculate normal for offset if it's a coating
      let ox = 0;
      let oy = 0;
      if (Math.abs(offsetZ) > 0) {
          // Normal is (-dy, dx)
          const nx = -dy / length;
          const ny = dx / length;
          ox = nx * offsetZ;
          oy = ny * offsetZ;
      }
      
      result.push({
        position: [centerX / 100 + ox, zBase + h / 2, -centerY / 100 - oy] as [number, number, number],
        rotation: [0, -angle, 0] as [number, number, number],
        args: [length / 100, h, symbolicThickness] as [number, number, number],
        length: length / 100,
        thickness: symbolicThickness,
        centerX: centerX / 100,
        centerY: centerY / 100,
        angle: angle
      });
    }
    return result;
  }, [points, height, baseZ, shouldRenderAsVerticalWalls, isLinear, width, isPlaster, coincidentWallWidth, sideSign, coincidentOffset]);

  if (shouldRenderAsVerticalWalls) {
    return (
      <group>
        {verticalWallSegments.map((seg, idx) => (
          <group key={idx}>
            {/* Solid Clipped part */}
            <RoomSegmentMesh 
              seg={seg}
              realisticTextures={realisticTextures}
              color={color}
              renderMode={renderMode}
              finalOpacity={finalOpacity}
              clippingPlanes={clippingPlanes}
            />

            {/* Wireframe Reference - Unclipped */}
            <mesh position={seg.position} rotation={seg.rotation}>
              <boxGeometry args={seg.args} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              <Edges color="#cbd5e1" threshold={5} transparent opacity={globalOpacityMode === 'SOLID' ? 0.2 : 0.1} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }

  if (!shape) return null;

  const isSolaioPignatte = renderingStyle === 'solaio_pignatte';
  const h_top = isSolaioPignatte ? Math.min(h, 0.05) : 0;
  const h_bottom = isSolaioPignatte ? Math.max(0.01, h - h_top) : h;

  return (
    <group>
      <group position={[0, zBase, 0]}>
        {/* Solid Clipped part */}
        {!isSolaioPignatte ? (
          <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <extrudeGeometry args={[shape, extrudeSettings]} />
            {realisticTextures ? (
              (() => {
                  const topTex = realisticTextures.top.clone();
                  const sideTex = realisticTextures.side.clone();
                  const repeatFactor = realisticTextures.type === 'tiles' ? 1.0 : 2.5;
                  topTex.repeat.set(repeatFactor, repeatFactor);
                  topTex.wrapS = topTex.wrapT = THREE.RepeatWrapping;
                  sideTex.repeat.set(repeatFactor, realisticTextures.type === 'tiles' ? 1.0 : 0.5);
                  sideTex.wrapS = sideTex.wrapT = THREE.RepeatWrapping;
                  
                  const matProps = {
                    color: '#ffffff',
                    transparent: renderMode === 'transparent' || finalOpacity < 1, 
                    opacity: renderMode === 'transparent' ? 0.3 : finalOpacity, 
                    metalness: 0.1,
                    roughness: 0.7,
                    envMapIntensity: 1.0,
                    clippingPlanes: clippingPlanes,
                    clipShadows: true,
                    side: THREE.DoubleSide
                  };

                  return [
                      <meshStandardMaterial key="top" attach="material-0" map={topTex} {...matProps} />,
                      <meshStandardMaterial key="side" attach="material-1" map={sideTex} {...matProps} />
                  ];
              })()
            ) : (
              <meshStandardMaterial 
                  color={color} 
                  transparent={renderMode === 'transparent' || finalOpacity < 1} 
                  wireframe={renderMode === 'transparent'}
                  opacity={renderMode === 'transparent' ? 0.3 : finalOpacity} 
                  metalness={isWall ? 0.35 : 0.15}
                  roughness={isWall ? 0.35 : 0.3}
                  envMapIntensity={1.5}
                  clippingPlanes={clippingPlanes}
                  clipShadows={true}
                  side={THREE.DoubleSide}
              />
            )}
          </mesh>
        ) : (
          <group>
            {/* Bottom Solaio Layer (Pignatte + Travetti visible from below) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
              <extrudeGeometry args={[shape, { steps: 1, depth: h_bottom, bevelEnabled: false }]} />
              {realisticTextures ? (
                (() => {
                    const pignatteTex = realisticTextures.side.clone();
                    pignatteTex.repeat.set(1.6667, 1.6667); // Exact 60cm repetition
                    pignatteTex.wrapS = pignatteTex.wrapT = THREE.RepeatWrapping;
                    
                    const sideTex = (realisticTextures.concreteSide || realisticTextures.top).clone();
                    sideTex.repeat.set(2.5, 0.5);
                    sideTex.wrapS = sideTex.wrapT = THREE.RepeatWrapping;
                    
                    const matProps = {
                      color: '#ffffff',
                      transparent: renderMode === 'transparent' || finalOpacity < 1, 
                      opacity: renderMode === 'transparent' ? 0.3 : finalOpacity, 
                      metalness: 0.1,
                      roughness: 0.7,
                      envMapIntensity: 1.0,
                      clippingPlanes: clippingPlanes,
                      clipShadows: true,
                      side: THREE.DoubleSide
                    };

                    return [
                        <meshStandardMaterial key="pignatte-cap" attach="material-0" map={pignatteTex} {...matProps} />,
                        <meshStandardMaterial key="pignatte-side" attach="material-1" map={sideTex} {...matProps} />
                    ];
                })()
              ) : (
                <meshStandardMaterial 
                    color="#D2B48C" // Brick terracotta color
                    transparent={renderMode === 'transparent' || finalOpacity < 1} 
                    opacity={renderMode === 'transparent' ? 0.3 : finalOpacity} 
                    metalness={0.15}
                    roughness={0.5}
                    clippingPlanes={clippingPlanes}
                    clipShadows={true}
                    side={THREE.DoubleSide}
                />
              )}
            </mesh>

            {/* Top Solaio Layer (Solid Concrete Cappa) */}
            {h_top > 0 && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, h_bottom, 0]} castShadow receiveShadow>
                <extrudeGeometry args={[shape, { steps: 1, depth: h_top, bevelEnabled: false }]} />
                {realisticTextures ? (
                  (() => {
                      const topTex = realisticTextures.top.clone();
                      topTex.repeat.set(2.5, 2.5);
                      topTex.wrapS = topTex.wrapT = THREE.RepeatWrapping;
                      
                      const sideTex = (realisticTextures.concreteSide || realisticTextures.top).clone();
                      sideTex.repeat.set(2.5, 0.5);
                      sideTex.wrapS = sideTex.wrapT = THREE.RepeatWrapping;
                      
                      const matProps = {
                        color: '#ffffff',
                        transparent: renderMode === 'transparent' || finalOpacity < 1, 
                        opacity: renderMode === 'transparent' ? 0.3 : finalOpacity, 
                        metalness: 0.1,
                        roughness: 0.7,
                        envMapIntensity: 1.0,
                        clippingPlanes: clippingPlanes,
                        clipShadows: true,
                        side: THREE.DoubleSide
                      };

                      return [
                          <meshStandardMaterial key="concrete-cap" attach="material-0" map={topTex} {...matProps} />,
                          <meshStandardMaterial key="concrete-side" attach="material-1" map={sideTex} {...matProps} />
                      ];
                  })()
                ) : (
                  <meshStandardMaterial 
                      color="#94a3b8" // Concrete gray color
                      transparent={renderMode === 'transparent' || finalOpacity < 1} 
                      opacity={renderMode === 'transparent' ? 0.3 : finalOpacity} 
                      metalness={0.15}
                      roughness={0.4}
                      clippingPlanes={clippingPlanes}
                      clipShadows={true}
                      side={THREE.DoubleSide}
                  />
                )}
              </mesh>
            )}
          </group>
        )}

        {/* Wireframe Reference - Unclipped */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <extrudeGeometry args={[shape, extrudeSettings]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          <Edges color="#cbd5e1" threshold={5} transparent opacity={globalOpacityMode === 'SOLID' ? 0.2 : 0.1} />
        </mesh>
        
        {/* Floor Highlight - Clipped */}
        {!isWall && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
            <shapeGeometry args={[shape]} />
            <meshStandardMaterial 
              color={patternTexture ? '#ffffff' : color}
              map={patternTexture || undefined}
              transparent 
              opacity={finalFloorOpacity} 
              clippingPlanes={clippingPlanes}
            />
          </mesh>
        )}


      </group>

      {/* Flat section cap matching the sliced segment perfectly */}
      {roomShowCapBottom && (
        <SmartCappingWrapper
          parentPivot={parentPivot}
          parentRotation={parentRotation}
          localCenterX={0}
          localCenterZ={0}
          localAngle={0}
          slicingHeight={slicingHeight}
          isCapTop={false}
          slicingMode={slicingMode}
          windowThickness={windowThickness}
        >
          <HatchCappingShapeMesh
            position={[0, 0, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            shape={shape}
            color={color}
            outlineColor="#000000"
            sectionHatchMode={sectionHatchMode}
            perimeterThickness={perimeterThickness}
            hatchDensity={hatchDensity}
            hatchThickness={hatchThickness}
            hatchLineColor={hatchLineColor}
            hatchBgColorMode={hatchBgColorMode}
            hatchBgColorCustom={hatchBgColorCustom}
            hatchPatternMode={hatchPatternMode}
          />
        </SmartCappingWrapper>
      )}
      {roomShowCapTop && (
        <SmartCappingWrapper
          parentPivot={parentPivot}
          parentRotation={parentRotation}
          localCenterX={0}
          localCenterZ={0}
          localAngle={0}
          slicingHeight={slicingHeight}
          isCapTop={true}
          slicingMode={slicingMode}
          windowThickness={windowThickness}
        >
          <HatchCappingShapeMesh
            position={[0, 0, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            shape={shape}
            color={color}
            outlineColor="#000000"
            sectionHatchMode={sectionHatchMode}
            perimeterThickness={perimeterThickness}
            hatchDensity={hatchDensity}
            hatchThickness={hatchThickness}
            hatchLineColor={hatchLineColor}
            hatchBgColorMode={hatchBgColorMode}
            hatchBgColorCustom={hatchBgColorCustom}
            hatchPatternMode={hatchPatternMode}
          />
        </SmartCappingWrapper>
      )}
    </group>
  );
};

export const BIMSymbol = ({ entity, onPointerOver, onPointerOut, clippingPlanes = [], opacity = 1 }: { entity: any, onPointerOver?: () => void, onPointerOut?: () => void, clippingPlanes?: THREE.Plane[], opacity?: number }) => {
  const { 
    bimType, 
    bimWindowType, 
    bimZPlane = 0, 
    bimZElevation = 0, 
    points, 
    point, 
    start, 
    end, 
    bimHeight = 210, 
    bimWidth = 90, 
    bimWindowHeight = 120, 
    isHovered,
    bimFlipLeft = false,
    bimFlipSide = false 
  } = entity;
  
  // Determine center point
  let p = point || (points && points[0]);
  let angle = (entity.angle || 0) * (Math.PI / 180);

  if (!p && start && end) {
      p = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      angle = -Math.atan2(end.y - start.y, end.x - start.x);
  }

  if (!p) return null;

  const color = entity.color || (bimType === 'door' ? '#ef4444' : '#3b82f6');
  const h = (bimType === 'door' ? bimHeight : bimWindowHeight) / 100;
  const w = (bimWidth || 90) / 100;
  const zBase = (bimZPlane + bimZElevation) / 100;
  const zPos = zBase + h / 2;
  const pos: [number, number, number] = [p.x / 100, zPos, -p.y / 100];
  
  const depth = 0.15; 
  if (bimType === 'door') {
    return (
      <group position={pos} rotation={[0, angle, 0]}>
        {/* Solid Clipped part */}
        <mesh 
          castShadow 
          onPointerOver={(e) => { e.stopPropagation(); onPointerOver?.(); }}
          onPointerOut={(e) => { e.stopPropagation(); onPointerOut?.(); }}
        >
          <boxGeometry args={[w, h, depth]} />
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
        </mesh>
        {/* Wireframe Reference - Unclipped */}
        <mesh>
          <boxGeometry args={[w, h, depth]} />
          <meshBasicMaterial transparent opacity={0.05} depthWrite={false} color={color} />
          <Edges color="#475569" transparent opacity={0.4} />
        </mesh>
      </group>
    );
  }

  // Window: render frame and glass
  const ft = 0.05; 
  const fw = 0.05; 
  
  const frameColor = '#8B5A2B'; 
  const glassColor = '#93c5fd'; 
  
  const drawGlass = (gw: number, gh: number, xOffset: number) => {
    if (gw <= 0 || gh <= 0) return null;
    return (
      <group position={[xOffset, 0, 0]}>
        {/* Main Glass Plane - Clipped */}
        <mesh castShadow>
          <boxGeometry args={[gw, gh, 0.015]} />
          <meshPhysicalMaterial 
            color={glassColor} 
            transparent 
            opacity={0.4} 
            roughness={0.1}
            metalness={0.1}
            transmission={0.8}
            ior={1.5}
            clippingPlanes={clippingPlanes.length > 0 ? clippingPlanes : undefined}
            clipShadows={true}
          />
        </mesh>
        {/* Wireframe Reference - Unclipped */}
        <mesh>
          <boxGeometry args={[gw, gh, 0.015]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} color={glassColor} />
          <Edges color="#94a3b8" transparent opacity={0.2} />
        </mesh>
      </group>
    );
  };

  const drawFramePart = (width: number, height: number, depth: number, x: number, y: number) => (
    <group position={[x, y, 0]}>
      {/* Solid Part */}
      <mesh castShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial 
          color={isHovered ? '#eab308' : frameColor}
          transparent={opacity < 1}
          opacity={opacity}
          clippingPlanes={clippingPlanes.length > 0 ? clippingPlanes : undefined}
          clipShadows={true}
        />
      </mesh>
      {/* Wireframe Reference */}
      <mesh>
        <boxGeometry args={[width, height, depth]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        <Edges color="#475569" transparent opacity={0.3} />
      </mesh>
    </group>
  );

  const innerH = h - ft * 2;
  const isRightHand = bimFlipLeft;
  const sideFactor = bimFlipSide ? -1 : 1; 

  const handleMaterial = <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.2} clippingPlanes={clippingPlanes.length > 0 ? clippingPlanes : undefined} />;
  const handleZ = (depth / 2 + 0.005) * sideFactor;

  const drawHandle = (x: number, y: number, flipLever: boolean) => (
    <group position={[x, y, 0]}>
      {/* Handle Base (Circular) */}
      <mesh position={[0, 0, handleZ]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.015, 16]} />
        {handleMaterial}
      </mesh>
      {/* Neck */}
      <mesh position={[0, 0, handleZ + (0.01 * sideFactor)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.02, 12]} />
        {handleMaterial}
      </mesh>
      {/* Handle Lever */}
      <mesh position={[flipLever ? -0.045 : 0.045, 0, handleZ + (0.02 * sideFactor)]}>
        <boxGeometry args={[0.09, 0.016, 0.01]} />
        {handleMaterial}
      </mesh>
    </group>
  );

  const drawHinge = (x: number, y: number) => (
    <mesh position={[x, y, (depth / 2 + 0.005) * sideFactor]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.008, 0.008, 0.04, 8]} />
      <meshStandardMaterial color="#4b5563" metalness={0.6} clippingPlanes={clippingPlanes.length > 0 ? clippingPlanes : undefined} />
    </mesh>
  );

  const drawRealisticFrame = (partW: number, partH: number, px: number, py: number) => (
    <group position={[px, py, 0]}>
      {drawFramePart(partW, partH, depth, 0, 0)}
      {/* Offset (Sfalsamento) */}
      {drawFramePart(partW, partH, depth * 0.4, 0, (depth * 0.2 + 0.005) * sideFactor)}
    </group>
  );

  return (
    <group 
      position={pos} 
      rotation={[0, angle, 0]}
      onPointerOver={(e) => { e.stopPropagation(); onPointerOver?.(); }}
      onPointerOut={(e) => { e.stopPropagation(); onPointerOut?.(); }}
    >
      {/* External Frame */}
      {drawRealisticFrame(w, ft, 0, h/2 - ft/2)}
      {drawRealisticFrame(w, ft, 0, -h/2 + ft/2)}
      {drawRealisticFrame(fw, innerH, -w/2 + fw/2, 0)}
      {drawRealisticFrame(fw, innerH, w/2 - fw/2, 0)}

      {/* Middle Frame logic */}
      {bimWindowType === 'doppia' ? (
        <>
          {/* Central Sash Mullion */}
          {drawFramePart(fw, innerH, depth * 0.8, 0, 0)}
          
          {/* Glass panes reaching the frames (W - 3*fw) / 2 */}
          {(() => {
            const sashW = (w - fw * 3) / 2;
            return (
              <>
                {drawGlass(sashW, innerH, -w/4 + fw/4)}
                {drawGlass(sashW, innerH, w/4 - fw/4)}
              </>
            );
          })()}
          
          {/* Hinges and Handle */}
          {drawHinge(-w/2 + fw, h/2 - ft - 0.2)}
          {drawHinge(-w/2 + fw, -h/2 + ft + 0.2)}
          {drawHinge(w/2 - fw, h/2 - ft - 0.2)}
          {drawHinge(w/2 - fw, -h/2 + ft + 0.2)}

          {/* SINGLE Handle on central Mullion face */}
          {drawHandle(0, 0, true)}
        </>
      ) : (
        <>
          {/* Full Glasspane */}
          {drawGlass(w - fw*2, innerH, 0)}
          
          {/* Handle and Hinges for single window */}
          {bimWindowType !== 'vetrata' && bimWindowType !== 'vasistas' && (
            <>
              {drawHandle(isRightHand ? (w/2 - fw - 0.025) : -(w/2 - fw - 0.025), 0, isRightHand)}
              {(() => {
                const hx = isRightHand ? -(w/2 - fw) : (w/2 - fw);
                return (
                  <>
                    {drawHinge(hx, h/2 - ft - 0.15)}
                    {drawHinge(hx, h/2 - ft - 0.45)}
                    {drawHinge(hx, -h/2 + ft + 0.45)}
                    {drawHinge(hx, -h/2 + ft + 0.15)}
                  </>
                );
              })()}
            </>
          )}
        </>
      )}
      {isHovered && (
         <mesh position={[0,0,0]}>
           <boxGeometry args={[w, h, depth * 1.1]} />
           <meshBasicMaterial color="#3b82f6" transparent opacity={0.1} wireframe={true} />
         </mesh>
      )}
    </group>
  );
};


const HatchMaterial = ({ color, clippingPlanes }: { color: string, clippingPlanes: THREE.Plane[] }) => {
  return (
    <meshNormalMaterial transparent opacity={0.5} clippingPlanes={clippingPlanes} />
  );
};

export const CSGMeshRender = ({ 
  entity, 
  color, 
  clippingPlanes = [], 
  opacity = 1,
  globalOpacityMode = 'WORK',
  globalWallOpacityVal = 0.50,
  isSlicing = false,
  slicingHeight = 0,
  slicingMode = 'HIDE_ABOVE',
  windowThickness = 0.5,
  renderMode = 'solid',
  sectionHatchMode = true,
  perimeterThickness = 5.5,
  hatchDensity = 4.0,
  hatchThickness = 2.0,
  hatchLineColor = '#000000',
  hatchBgColorMode = 'white',
  hatchBgColorCustom = '#ffffff',
  hatchPatternMode = 'diagonal',
  parentPivot = [0, 0, 0],
  parentRotation = [0, 0, 0],
  isStratifiedView = false
}: { 
  entity: any, 
  color: string, 
  clippingPlanes?: THREE.Plane[], 
  opacity?: number,
  globalOpacityMode?: 'WORK' | 'SOLID',
  globalWallOpacityVal?: number,
  isSlicing?: boolean,
  slicingHeight?: number,
  slicingMode?: 'HIDE_ABOVE' | 'HIDE_BELOW' | 'WINDOW',
  windowThickness?: number,
  renderMode?: 'solid' | 'transparent',
  sectionHatchMode?: boolean,
  perimeterThickness?: number,
  hatchDensity?: number,
  hatchThickness?: number,
  hatchLineColor?: string,
  hatchBgColorMode?: 'white' | 'entity' | 'gray' | 'custom',
  hatchBgColorCustom?: string,
  hatchPatternMode?: 'diagonal' | 'horizontal' | 'vertical' | 'cross',
  parentPivot?: [number, number, number],
  parentRotation?: [number, number, number],
  isStratifiedView?: boolean
}) => {
  const geom = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    if (!entity.geometryData?.positions) return geo;

    const positions = new Float32Array(entity.geometryData.positions);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const normals = entity.geometryData.normals ? new Float32Array(entity.geometryData.normals) : null;
    if (normals) {
      geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    }

    if (entity.geometryData.uvs && entity.geometryData.uvs.length > 0) {
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(entity.geometryData.uvs), 2));
    }

    const indicesAttr = entity.geometryData.indices;
    if (indicesAttr && indicesAttr.length > 0) {
      const indices = Array.from(indicesAttr) as number[];
      const sideIndices: number[] = [];
      const topIndices: number[] = [];
      const bottomIndices: number[] = [];

      for (let i = 0; i < indices.length; i += 3) {
        const idx1 = indices[i];
        const idx2 = indices[i + 1];
        const idx3 = indices[i + 2];

        let ny = 0;
        if (normals) {
          const n1y = normals[idx1 * 3 + 1];
          const n2y = normals[idx2 * 3 + 1];
          const n3y = normals[idx3 * 3 + 1];
          ny = (n1y + n2y + n3y) / 3;
        } else {
          const p1 = new THREE.Vector3(positions[idx1 * 3], positions[idx1 * 3 + 1], positions[idx1 * 3 + 2]);
          const p2 = new THREE.Vector3(positions[idx2 * 3], positions[idx2 * 3 + 1], positions[idx2 * 3 + 2]);
          const p3 = new THREE.Vector3(positions[idx3 * 3], positions[idx3 * 3 + 1], positions[idx3 * 3 + 2]);
          const cb = new THREE.Vector3().subVectors(p3, p2);
          const ab = new THREE.Vector3().subVectors(p1, p2);
          cb.cross(ab).normalize();
          ny = cb.y;
        }

        if (ny >= 0.7) {
          topIndices.push(idx1, idx2, idx3);
        } else if (ny <= -0.7) {
          bottomIndices.push(idx1, idx2, idx3);
        } else {
          sideIndices.push(idx1, idx2, idx3);
        }
      }

      const sortedIndices = [...sideIndices, ...topIndices, ...bottomIndices];
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(sortedIndices), 1));

      geo.clearGroups();
      let start = 0;
      if (sideIndices.length > 0) {
        geo.addGroup(start, sideIndices.length, 0); // Side (horizontal brick bonding)
        start += sideIndices.length;
      }
      if (topIndices.length > 0) {
        geo.addGroup(start, topIndices.length, 1); // Top (brick holes)
        start += topIndices.length;
      }
      if (bottomIndices.length > 0) {
        geo.addGroup(start, bottomIndices.length, 2); // Bottom (side)
        start += bottomIndices.length;
      }
    } else {
      geo.clearGroups();
      geo.addGroup(0, positions.length / 3, 0);
    }

    geo.computeBoundingSphere();
    return geo;
  }, [entity]);

  const finalOpacity = globalOpacityMode === 'SOLID' 
    ? 1.0 
    : (opacity < 1 ? opacity * globalWallOpacityVal : globalWallOpacityVal);

  const points = entity.points || [];
  const height = entity.bimHeight || entity.height || 270;
  const width = entity.bimWidth || entity.width || 15;
  const baseZ = (entity.bimZPlane || 0) + (entity.bimZElevation || 0);

  const h = height / 100;
  const zBase = baseZ / 100;

  const isWall = entity.bimType === 'wall' || entity.bimAreaType === 'muro' || entity.bimType === 'element' || entity.isLinear;
  const isCappingEnabled = isSlicing && (renderMode !== 'transparent' || globalOpacityMode === 'SOLID');

  const [px, py, pz] = parentPivot;
  const [rx, ry, rz] = parentRotation;

  // Segment generation for Wall capping
  const segments = useMemo(() => {
    if (!isWall || points.length < 2 || (points.length >= 3 && entity.type === 'hatch') || entity.bimAreaType === 'muro') return [];
    const result = [];
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
        length: length / 100,
        thickness: (width || 15) / 100,
        centerX: centerX / 100,
        centerY: centerY / 100,
        angle: angle
      });
    }
    return result;
  }, [isWall, points, width]);

  // Shape generation for Area/Room capping
  const roomShape = useMemo(() => {
    if (points.length < 3) return null;
    if (isWall && segments.length > 0) return null; // Already capped via segments
    const s = new THREE.Shape();
    s.moveTo(points[0].x / 100, points[0].y / 100);
    for (let i = 1; i < points.length; i++) {
        s.lineTo(points[i].x / 100, points[i].y / 100);
    }
    s.closePath();

    if (entity.holes && entity.holes.length > 0) {
      entity.holes.forEach((holePoints: any) => {
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
  }, [points, entity.holes, isWall, segments]);

  const centroid = useMemo(() => {
    if (!points || points.length === 0) return { x: 0, y: 0 };
    let sx = 0, sy = 0;
    points.forEach(p => { sx += p.x; sy += p.y; });
    return { x: sx / (points.length * 100), y: sy / (points.length * 100) };
  }, [points]);

  let roomShowCapBottom = false;
  let roomShowCapTop = false;

  if (isCappingEnabled && roomShape) {
    const tPivot = new THREE.Matrix4().makeTranslation(px, py, pz);
    const rParent = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
    const tPivotInv = new THREE.Matrix4().makeTranslation(-px, -py, -pz);
    const parentLocalToWorld = new THREE.Matrix4().multiply(tPivot).multiply(rParent).multiply(tPivotInv);

    const localCorners: THREE.Vector3[] = [];
    for (const p of points) {
      const lx = p.x / 100;
      const lz = -p.y / 100;
      localCorners.push(new THREE.Vector3(lx, zBase, lz));
      localCorners.push(new THREE.Vector3(lx, zBase + h, lz));
    }

    let minY = Infinity;
    let maxY = -Infinity;
    for (const corner of localCorners) {
      const w = corner.clone().applyMatrix4(parentLocalToWorld);
      if (w.y < minY) minY = w.y;
      if (w.y > maxY) maxY = w.y;
    }

    if (slicingMode === 'HIDE_ABOVE') {
      roomShowCapBottom = slicingHeight > minY && slicingHeight < maxY;
    } else if (slicingMode === 'HIDE_BELOW') {
      roomShowCapTop = slicingHeight > minY && slicingHeight < maxY;
    } else if (slicingMode === 'WINDOW') {
      const half = windowThickness / 2;
      const tY = slicingHeight + half;
      const bY = slicingHeight - half;
      roomShowCapTop = tY > minY && tY < maxY;
      roomShowCapBottom = bY > minY && bY < maxY;
    }
  }

  const realisticTextures = useMemo(() => {
    const bimFamilyId = (entity.bimFamilyId || entity.bimAreaType || '').toLowerCase().trim();
    if (!bimFamilyId) return null;
    let type: 'concrete' | 'masonry' | 'partition' | 'plaster' | 'plaster_rustic' | 'insulation' | 'tiles' | 'casseri' | null = null;
    if (bimFamilyId.includes('casseri')) {
      type = 'casseri';
    } else if (bimFamilyId.includes('pilastri') || bimFamilyId.includes('fondazioni') || bimFamilyId.includes('solaio') || bimFamilyId.includes('c.a.')) {
      type = 'concrete';
    } else if (bimFamilyId.includes('murature') || bimFamilyId.includes('muro') || bimFamilyId.includes('portant') || bimFamilyId.includes('matton') || bimFamilyId.includes('svizzeri')) {
      type = 'masonry';
    } else if (bimFamilyId.includes('tramezz') || bimFamilyId.includes('divisori')) {
      type = 'partition';
    } else if (bimFamilyId.includes('rivest') || bimFamilyId.includes('piastrell') || bimFamilyId.includes('tiles') || bimFamilyId.includes('ceramica') || bimFamilyId.includes('pavimenti_50x100')) {
      type = 'tiles';
    } else if (bimFamilyId.includes('intonaco_rustico') || bimFamilyId.includes('plaster_rustic')) {
      type = 'plaster_rustic';
    } else if (bimFamilyId.includes('intonac') || bimFamilyId.includes('plaster') || bimFamilyId.includes('finitura')) {
      type = 'plaster';
    } else if (bimFamilyId.includes('isolam') || bimFamilyId.includes('cappott') || bimFamilyId.includes('coibent')) {
      type = 'insulation';
    }
    
    if (type) {
      const topTex = createBIMMaterialTexture(type, 'top', color);
      const sideTex = createBIMMaterialTexture(type, 'side', color);
      
      // Improved scaling for generic CSG meshes based on object dimensions
      const totalLength = points.length > 1 ? points.reduce((acc, p, i) => {
        if (i === 0) return 0;
        const prev = points[i-1];
        return acc + Math.sqrt((p.x - prev.x)**2 + (p.y - prev.y)**2);
      }, 0) / 100 : 4;

      const repeatX = type === 'tiles' ? totalLength / 1.0 : Math.max(1, totalLength / (type === 'masonry' ? 0.30 : 0.50));
      const repeatY = type === 'tiles' ? h / 1.0 : Math.max(1, h / 0.25);
      
      let topRepeatY;
      if (type === 'tiles') {
        topRepeatY = Math.max(1, width / 100);
      } else if (width <= 42) {
        topRepeatY = 1;
      } else if (width <= 82) {
        topRepeatY = 2;
      } else {
        topRepeatY = Math.max(1, width / 25);
      }
      
      topTex.repeat.set(repeatX, topRepeatY); 
      sideTex.repeat.set(repeatX, repeatY);
      topTex.wrapS = topTex.wrapT = THREE.RepeatWrapping;
      sideTex.wrapS = sideTex.wrapT = THREE.RepeatWrapping;
      
      return { top: topTex, side: sideTex, type: type };
    }
    return null;
  }, [entity, color]);

  const materials = useMemo(() => {
    const isPlaster = realisticTextures?.type === 'plaster' || realisticTextures?.type === 'plaster_rustic';
    const matProps = {
      color: isPlaster ? '#d1d5db' : (realisticTextures ? '#ffffff' : color),
      transparent: finalOpacity < 1,
      opacity: finalOpacity,
      metalness: 0.05,
      roughness: isPlaster ? 0.3 : 0.9,
      envMapIntensity: isPlaster ? 0.05 : 0.3,
      clippingPlanes: clippingPlanes,
      clipShadows: true,
      side: THREE.DoubleSide,
      polygonOffset: !!entity.isOverlay,
      polygonOffsetFactor: entity.isOverlay ? -1 : 0,
      polygonOffsetUnits: entity.isOverlay ? -1 : 0
    };

    if (realisticTextures) {
      return [
        new THREE.MeshStandardMaterial({ ...matProps, map: realisticTextures.side }), // Index 0: Sides (usually most faces)
        new THREE.MeshStandardMaterial({ ...matProps, map: realisticTextures.top }),  // Index 1: Top
        new THREE.MeshStandardMaterial({ ...matProps, map: realisticTextures.side }), // Index 2: Bottom (use side texture)
      ];
    }
    return new THREE.MeshStandardMaterial({ ...matProps, metalness: 0.15, roughness: 0.4, envMapIntensity: 1 });
  }, [color, finalOpacity, clippingPlanes, realisticTextures]);

  return (
    <group position={isStratifiedView ? [0, 0, 0] : [0, 0, 0]}>
      {/* If stratified, create multiple meshes for each layer, slightly exploded. 
          Assuming for now we just show materials in a different way or move them slightly.
          Actually, simple explosion for layers would involve rendering each layer separately.
          For now, just visual cue.
      */}
      {isStratifiedView ? (
        <>
          {/* Base Layer - Wall */}
          <mesh 
            geometry={geom} 
            material={new THREE.MeshStandardMaterial({color: '#b91c1c', side: THREE.DoubleSide, clippingPlanes: clippingPlanes})} 
            castShadow 
            receiveShadow
            position={[0, 0, 0]}
          >
            <Edges color="#cbd5e1" threshold={5} transparent opacity={globalOpacityMode === 'SOLID' ? 0.2 : 0.1} />
          </mesh>
          {/* Middle Layer - Plaster */}
          <mesh 
            geometry={geom} 
            material={new THREE.MeshStandardMaterial({
                color: '#94a3b8', 
                side: THREE.DoubleSide, 
                clippingPlanes: clippingPlanes,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1
            })} 
            castShadow 
            receiveShadow
          >
            <Edges color="#cbd5e1" threshold={5} transparent opacity={globalOpacityMode === 'SOLID' ? 0.2 : 0.1} />
          </mesh>
          {/* Top Layer - Paint/Finish */}
          <mesh 
            geometry={geom} 
            material={new THREE.MeshStandardMaterial({
                color: '#60a5fa', 
                side: THREE.DoubleSide, 
                clippingPlanes: clippingPlanes,
                polygonOffset: true,
                polygonOffsetFactor: -2,
                polygonOffsetUnits: -2
            })} 
            castShadow 
            receiveShadow
          >
            <Edges color="#cbd5e1" threshold={5} transparent opacity={globalOpacityMode === 'SOLID' ? 0.2 : 0.1} />
          </mesh>
        </>
      ) : (
        <mesh 
          geometry={geom} 
          material={materials} 
          castShadow 
          receiveShadow
          position={[0, 0, 0]}
        >
          <Edges color="#cbd5e1" threshold={5} transparent opacity={globalOpacityMode === 'SOLID' ? 0.2 : 0.1} />
        </mesh>
      )}

      {/* Capping Plates for CSG wall segments */}
      {segments.map((seg, i) => {
        let segShowCapBottom = false;
        let segShowCapTop = false;

        if (isCappingEnabled) {
          const tPivot = new THREE.Matrix4().makeTranslation(px, py, pz);
          const rParent = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
          const tPivotInv = new THREE.Matrix4().makeTranslation(-px, -py, -pz);
          const parentLocalToWorld = new THREE.Matrix4().multiply(tPivot).multiply(rParent).multiply(tPivotInv);

          const tSeg = new THREE.Matrix4().makeTranslation(seg.centerX, zBase + h / 2, -seg.centerY);
          const rSeg = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, -seg.angle, 0, 'XYZ'));
          const segLocalToParent = new THREE.Matrix4().multiply(tSeg).multiply(rSeg);

          const localToWorld = new THREE.Matrix4().multiplyMatrices(parentLocalToWorld, segLocalToParent);

          const halfL = seg.length / 2;
          const halfH = h / 2;
          const halfT = seg.thickness / 2;

          const localCorners = [
            new THREE.Vector3(-halfL, -halfH, -halfT),
            new THREE.Vector3(halfL, -halfH, -halfT),
            new THREE.Vector3(-halfL, halfH, -halfT),
            new THREE.Vector3(halfL, halfH, -halfT),
            new THREE.Vector3(-halfL, -halfH, halfT),
            new THREE.Vector3(halfL, -halfH, halfT),
            new THREE.Vector3(-halfL, halfH, halfT),
            new THREE.Vector3(halfL, halfH, halfT)
          ];

          let minY = Infinity;
          let maxY = -Infinity;
          for (const corner of localCorners) {
            const w = corner.clone().applyMatrix4(localToWorld);
            if (w.y < minY) minY = w.y;
            if (w.y > maxY) maxY = w.y;
          }

          if (slicingMode === 'HIDE_ABOVE') {
            segShowCapBottom = slicingHeight > minY && slicingHeight < maxY;
          } else if (slicingMode === 'HIDE_BELOW') {
            segShowCapTop = slicingHeight > minY && slicingHeight < maxY;
          } else if (slicingMode === 'WINDOW') {
            const half = windowThickness / 2;
            const tY = slicingHeight + half;
            const bY = slicingHeight - half;
            segShowCapTop = tY > minY && tY < maxY;
            segShowCapBottom = bY > minY && bY < maxY;
          }
        }

        return (
          <group key={`cap-${i}`}>
            {segShowCapBottom && (
              <SmartCappingWrapper
                parentPivot={parentPivot}
                parentRotation={parentRotation}
                localCenterX={seg.centerX}
                localCenterZ={seg.centerY}
                localAngle={-seg.angle}
                slicingHeight={slicingHeight}
                isCapTop={false}
                slicingMode={slicingMode}
                windowThickness={windowThickness}
              >
                <HatchCappingPlaneMesh
                  position={[seg.centerX, 0, -seg.centerY]}
                  rotation={[-Math.PI / 2, 0, -seg.angle]}
                  length={seg.length}
                  thickness={seg.thickness}
                  color={color}
                  outlineColor="#000000"
                  sectionHatchMode={sectionHatchMode}
                  perimeterThickness={perimeterThickness}
                  hatchDensity={hatchDensity}
                  hatchThickness={hatchThickness}
                  hatchLineColor={hatchLineColor}
                  hatchBgColorMode={hatchBgColorMode}
                  hatchBgColorCustom={hatchBgColorCustom}
                  hatchPatternMode={hatchPatternMode}
                />
              </SmartCappingWrapper>
            )}
            {segShowCapTop && (
              <SmartCappingWrapper
                parentPivot={parentPivot}
                parentRotation={parentRotation}
                localCenterX={seg.centerX}
                localCenterZ={seg.centerY}
                localAngle={-seg.angle}
                slicingHeight={slicingHeight}
                isCapTop={true}
                slicingMode={slicingMode}
                windowThickness={windowThickness}
              >
                <HatchCappingPlaneMesh
                  position={[seg.centerX, 0, -seg.centerY]}
                  rotation={[-Math.PI / 2, 0, -seg.angle]}
                  length={seg.length}
                  thickness={seg.thickness}
                  color={color}
                  outlineColor="#000000"
                  sectionHatchMode={sectionHatchMode}
                  perimeterThickness={perimeterThickness}
                  hatchDensity={hatchDensity}
                  hatchThickness={hatchThickness}
                  hatchLineColor={hatchLineColor}
                  hatchBgColorMode={hatchBgColorMode}
                  hatchBgColorCustom={hatchBgColorCustom}
                  hatchPatternMode={hatchPatternMode}
                />
              </SmartCappingWrapper>
            )}
          </group>
        );
      })}
      {/* Capping Plate for Room/Area CSG */}
      {roomShape && (
        <group>
          {roomShowCapBottom && (
            <SmartCappingWrapper
              parentPivot={parentPivot}
              parentRotation={parentRotation}
              localCenterX={0}
              localCenterZ={0}
              localAngle={0}
              slicingHeight={slicingHeight}
              isCapTop={false}
              slicingMode={slicingMode}
              windowThickness={windowThickness}
            >
              <HatchCappingShapeMesh
                position={[0, 0, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                shape={roomShape}
                color={color}
                outlineColor="#000000"
                sectionHatchMode={sectionHatchMode}
                perimeterThickness={perimeterThickness}
                hatchDensity={hatchDensity}
                hatchThickness={hatchThickness}
                hatchLineColor={hatchLineColor}
                hatchBgColorMode={hatchBgColorMode}
                hatchBgColorCustom={hatchBgColorCustom}
                hatchPatternMode={hatchPatternMode}
              />
            </SmartCappingWrapper>
          )}
          {roomShowCapTop && (
            <SmartCappingWrapper
              parentPivot={parentPivot}
              parentRotation={parentRotation}
              localCenterX={0}
              localCenterZ={0}
              localAngle={0}
              slicingHeight={slicingHeight}
              isCapTop={true}
              slicingMode={slicingMode}
              windowThickness={windowThickness}
            >
              <HatchCappingShapeMesh
                position={[0, 0, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                shape={roomShape}
                color={color}
                outlineColor="#000000"
                sectionHatchMode={sectionHatchMode}
                perimeterThickness={perimeterThickness}
                hatchDensity={hatchDensity}
                hatchThickness={hatchThickness}
                hatchLineColor={hatchLineColor}
                hatchBgColorMode={hatchBgColorMode}
                hatchBgColorCustom={hatchBgColorCustom}
                hatchPatternMode={hatchPatternMode}
              />
            </SmartCappingWrapper>
          )}
        </group>
      )}
      {/* Wireframe Reference - Unclipped */}
      <mesh geometry={geom}>
        <meshBasicMaterial transparent opacity={0} depthWrite={false} color={color} />
        <Edges color="#475569" threshold={15} transparent opacity={0.4} />
      </mesh>
    </group>
  );
};

const renderLine = (entity: LineEntity) => {
  if (!entity.start || !entity.end) return null;
  const pts: [number, number, number][] = [
    [entity.start.x / 100, 0, -entity.start.y / 100],
    [entity.end.x / 100, 0, -entity.end.y / 100]
  ];
  return (
    <Line
      key={entity.id}
      points={pts}
      color={entity.color || '#475569'}
      lineWidth={(entity.lineWidth || 1) * 1.5}
      dashed={entity.lineType === 'dashed' || entity.dashed}
      opacity={entity.opacity !== undefined ? entity.opacity : 0.6}
      transparent
    />
  );
};

const renderRectangle = (entity: RectEntity) => {
  if (!entity.p1 || !entity.p2) return null;
  const p1 = entity.p1;
  const p2 = entity.p2;
  const pts: [number, number, number][] = [
    [p1.x / 100, 0, -p1.y / 100],
    [p2.x / 100, 0, -p1.y / 100],
    [p2.x / 100, 0, -p2.y / 100],
    [p1.x / 100, 0, -p2.y / 100],
    [p1.x / 100, 0, -p1.y / 100]
  ];
  return (
    <Line
      key={entity.id}
      points={pts}
      color={entity.color || '#475569'}
      lineWidth={(entity.lineWidth || 1) * 1.5}
      dashed={entity.lineType === 'dashed' || entity.dashed}
      opacity={entity.opacity !== undefined ? entity.opacity : 0.6}
      transparent
    />
  );
};

const renderCircle = (entity: CircleEntity) => {
  if (!entity.center || !entity.radius) return null;
  const pts: [number, number, number][] = [];
  const segments = 64;
  const cx = entity.center.x / 100;
  const cy = -entity.center.y / 100;
  const r = entity.radius / 100;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    pts.push([cx + Math.cos(theta) * r, 0, cy + Math.sin(theta) * r]);
  }
  return (
    <Line
      key={entity.id}
      points={pts}
      color={entity.color || '#475569'}
      lineWidth={(entity.lineWidth || 1) * 1.5}
      dashed={entity.lineType === 'dashed' || entity.dashed}
      opacity={entity.opacity !== undefined ? entity.opacity : 0.6}
      transparent
    />
  );
};

const renderArc = (entity: ArcEntity) => {
  if (!entity.center || !entity.radius) return null;
  const pts: [number, number, number][] = [];
  const segments = 32;
  const cx = entity.center.x / 100;
  const cy = -entity.center.y / 100;
  const r = entity.radius / 100;
  const startRad = ((entity.startAngle || 0) * Math.PI) / 180;
  const endRad = ((entity.endAngle || 360) * Math.PI) / 180;
  let delta = endRad - startRad;
  if (delta < 0) delta += Math.PI * 2;

  for (let i = 0; i <= segments; i++) {
    const theta = startRad + (i / segments) * delta;
    pts.push([cx + Math.cos(theta) * r, 0, cy + Math.sin(theta) * r]);
  }
  return (
    <Line
      key={entity.id}
      points={pts}
      color={entity.color || '#475569'}
      lineWidth={(entity.lineWidth || 1) * 1.5}
      dashed={entity.lineType === 'dashed' || entity.dashed}
      opacity={entity.opacity !== undefined ? entity.opacity : 0.6}
      transparent
    />
  );
};

const renderText = (entity: TextEntity) => {
  if (!entity.point || !entity.text) return null;
  return (
    <Text
      key={entity.id}
      position={[entity.point.x / 100, 0.005, -entity.point.y / 100]}
      rotation={[-Math.PI / 2, 0, 0]}
      fontSize={(entity.fontSize || 14) / 75}
      color={entity.color || '#000000'}
      anchorX={entity.textAlign === 'center' ? 'center' : (entity.textAlign === 'right' ? 'right' : 'left')}
      anchorY="middle"
      fillOpacity={entity.opacity !== undefined ? entity.opacity : 0.9}
    >
      {entity.text}
    </Text>
  );
};

const renderDimension = (entity: DimensionEntity) => {
  if (!entity.start || !entity.end) return null;
  const start = entity.start;
  const end = entity.end;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distCm = Math.sqrt(dx * dx + dy * dy);
  
  let valStr = entity.customText;
  if (!valStr) {
    valStr = `${(distCm / 100).toFixed(2)} m`;
  }

  const pts: [number, number, number][] = [
    [start.x / 100, 0.002, -start.y / 100],
    [end.x / 100, 0.002, -end.y / 100]
  ];

  const tickSize = 0.04;
  const angle = Math.atan2(dy, dx);
  const tickAngle1 = angle + Math.PI / 4;

  const t1s: [number, number, number] = [
    (start.x + Math.cos(tickAngle1) * tickSize * 100) / 100,
    0.002,
    -(start.y + Math.sin(tickAngle1) * tickSize * 100) / 100
  ];
  const t1e: [number, number, number] = [
    (start.x - Math.cos(tickAngle1) * tickSize * 100) / 100,
    0.002,
    -(start.y - Math.sin(tickAngle1) * tickSize * 100) / 100
  ];

  const t2s: [number, number, number] = [
    (end.x + Math.cos(tickAngle1) * tickSize * 100) / 100,
    0.002,
    -(end.y + Math.sin(tickAngle1) * tickSize * 100) / 100
  ];
  const t2e: [number, number, number] = [
    (end.x - Math.cos(tickAngle1) * tickSize * 100) / 100,
    0.002,
    -(end.y - Math.sin(tickAngle1) * tickSize * 100) / 100
  ];

  const midX = (start.x + end.x) / 2 / 100;
  const midY = -(start.y + end.y) / 2 / 100;

  return (
    <group key={entity.id}>
      <Line points={pts} color={entity.color || '#475569'} lineWidth={1} opacity={0.6} transparent />
      <Line points={[t1s, t1e]} color={entity.color || '#475569'} lineWidth={1.5} opacity={0.6} transparent />
      <Line points={[t2s, t2e]} color={entity.color || '#475569'} lineWidth={1.5} opacity={0.6} transparent />
      <Text
        position={[midX, 0.008, midY]}
        rotation={[-Math.PI / 2, 0, -angle]}
        fontSize={0.11}
        color={entity.color || '#475569'}
        anchorX="center"
        anchorY="middle"
        fillOpacity={0.8}
      >
        {valStr}
      </Text>
    </group>
  );
};

const renderPoint = (entity: PointEntity) => {
  const p = entity.point;
  if (!p) return null;
  const px = p.x / 100;
  const py = -p.y / 100;
  const crossSize = 0.03;
  return (
    <group key={entity.id}>
      <Line points={[[px - crossSize, 0.002, py], [px + crossSize, 0.002, py]]} color={entity.color || '#ef4444'} lineWidth={1.5} />
      <Line points={[[px, 0.002, py - crossSize], [px, 0.002, py + crossSize]]} color={entity.color || '#ef4444'} lineWidth={1.5} />
    </group>
  );
};

const CADHatch3D: React.FC<{ entity: HatchEntity }> = ({ entity }) => {
  const [textureObj, setTextureObj] = useState<{ tex: THREE.CanvasTexture } | null>(null);

  useEffect(() => {
    if (!entity.points || entity.points.length < 3) return;

    // Calculate bounding box in centimeters (CAD units)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of entity.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const widthCm = Math.max(10, maxX - minX);
    const heightCm = Math.max(10, maxY - minY);

    // We want a high resolution texture, say 2 pixels per cm
    // Capped at 2048 to prevent memory/performance issues
    const resolution = 2;
    const canvasWidth = Math.min(2048, Math.ceil(widthCm * resolution));
    const canvasHeight = Math.min(2048, Math.ceil(heightCm * resolution));

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scaleX = canvasWidth / widthCm;
    const scaleY = canvasHeight / heightCm;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo((entity.points[0].x - minX) * scaleX, (entity.points[0].y - minY) * scaleY);
    for (let i = 1; i < entity.points.length; i++) {
      ctx.lineTo((entity.points[i].x - minX) * scaleX, (entity.points[i].y - minY) * scaleY);
    }
    ctx.closePath();

    if (entity.holes) {
      entity.holes.forEach((hole: Point[]) => {
        if (hole.length < 3) return;
        ctx.moveTo((hole[0].x - minX) * scaleX, (hole[0].y - minY) * scaleY);
        for (let i = 1; i < hole.length; i++) {
          ctx.lineTo((hole[i].x - minX) * scaleX, (hole[i].y - minY) * scaleY);
        }
        ctx.closePath();
      });
    }

    ctx.clip('evenodd');

    // Draw background color if present
    if (entity.backgroundColor) {
      ctx.fillStyle = entity.backgroundColor;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.015)';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    const pat = (entity.pattern || 'ansi31').toLowerCase();
    if (pat !== 'none' && pat !== 'solid') {
      const cxLocal = canvasWidth / 2;
      const cyLocal = canvasHeight / 2;
      const diag = Math.sqrt(canvasWidth * canvasWidth + canvasHeight * canvasHeight);
      const halfDiag = diag / 2;

      ctx.save();
      ctx.translate(cxLocal, cyLocal);
      ctx.rotate((entity.angle || 0) * Math.PI / 180);

      ctx.strokeStyle = entity.color || '#3b82f6';
      ctx.lineWidth = Math.max(1, (entity.lineWidth || 1) * resolution * 0.75);
      ctx.fillStyle = entity.color || '#3b82f6';
      ctx.setLineDash([]);

      const step = Math.max(4, (entity.scale || 14) * resolution);

      try {
        if (pat === 'ansi31') {
          ctx.rotate(Math.PI / 4);
          ctx.beginPath();
          for (let x = -halfDiag; x <= halfDiag; x += step) {
            ctx.moveTo(x, -halfDiag);
            ctx.lineTo(x, halfDiag);
          }
          ctx.stroke();
        } else if (pat === 'ansi32') {
          ctx.rotate(Math.PI / 4);
          ctx.beginPath();
          for (let x = -halfDiag; x <= halfDiag; x += step) {
            ctx.moveTo(x, -halfDiag);
            ctx.lineTo(x, halfDiag);
            ctx.moveTo(x + step * 0.25, -halfDiag);
            ctx.lineTo(x + step * 0.25, halfDiag);
          }
          ctx.stroke();
        } else if (pat === 'ansi33') {
          ctx.rotate(Math.PI / 4);
          for (let x = -halfDiag, idx = 0; x <= halfDiag; x += step / 2, idx++) {
            ctx.beginPath();
            if (idx % 2 === 0) {
              ctx.setLineDash([]);
            } else {
              ctx.setLineDash([Math.max(1, step * 0.15), Math.max(1, step * 0.15)]);
            }
            ctx.moveTo(x, -halfDiag);
            ctx.lineTo(x, halfDiag);
            ctx.stroke();
          }
        } else if (pat === 'ansi34') {
          ctx.rotate(Math.PI / 4);
          ctx.setLineDash([Math.max(1, step * 0.2), Math.max(1, step * 0.2)]);
          ctx.beginPath();
          for (let x = -halfDiag; x <= halfDiag; x += step) {
            ctx.moveTo(x, -halfDiag);
            ctx.lineTo(x, halfDiag);
          }
          ctx.stroke();
        } else if (pat === 'grid') {
          ctx.beginPath();
          for (let x = -halfDiag; x <= halfDiag; x += step) {
            ctx.moveTo(x, -halfDiag);
            ctx.lineTo(x, halfDiag);
          }
          for (let y = -halfDiag; y <= halfDiag; y += step) {
            ctx.moveTo(-halfDiag, y);
            ctx.lineTo(halfDiag, y);
          }
          ctx.stroke();
        } else if (pat === 'cross') {
          ctx.rotate(Math.PI / 4);
          ctx.beginPath();
          for (let x = -halfDiag; x <= halfDiag; x += step) {
            ctx.moveTo(x, -halfDiag);
            ctx.lineTo(x, halfDiag);
          }
          for (let y = -halfDiag; y <= halfDiag; y += step) {
            ctx.moveTo(-halfDiag, y);
            ctx.lineTo(halfDiag, y);
          }
          ctx.stroke();
        } else if (pat === 'dots') {
          const r = Math.max(0.7, step / 14);
          for (let x = -halfDiag; x <= halfDiag; x += step) {
            for (let y = -halfDiag; y <= halfDiag; y += step) {
              ctx.beginPath();
              ctx.arc(x, y, r, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else if (pat === 'stripe') {
          ctx.beginPath();
          for (let x = -halfDiag; x <= halfDiag; x += step) {
            ctx.moveTo(x, -halfDiag);
            ctx.lineTo(x, halfDiag);
          }
          ctx.stroke();
        } else if (pat === 'horizontal') {
          ctx.beginPath();
          for (let y = -halfDiag; y <= halfDiag; y += step) {
            ctx.moveTo(-halfDiag, y);
            ctx.lineTo(halfDiag, y);
          }
          ctx.stroke();
        } else if (pat === 'zigzag') {
          ctx.beginPath();
          const wl = step * 0.9;
          for (let y = -halfDiag; y <= halfDiag; y += step) {
            ctx.moveTo(-halfDiag, y);
            let up = true;
            for (let x = -halfDiag; x <= halfDiag; x += wl) {
              ctx.lineTo(x, up ? y + step * 0.25 : y - step * 0.25);
              up = !up;
            }
          }
          ctx.stroke();
        } else if (pat === 'waves') {
          ctx.beginPath();
          const wl = step;
          for (let y = -halfDiag; y <= halfDiag; y += step) {
            ctx.moveTo(-halfDiag, y);
            for (let x = -halfDiag; x <= halfDiag; x += 4) {
              const sineY = y + Math.sin(x / (wl / 4.5)) * (step * 0.2);
              ctx.lineTo(x, sineY);
            }
          }
          ctx.stroke();
        } else if (pat === 'brick') {
          const bHeight = step;
          const bWidth = step * 2.2;
          ctx.beginPath();
          for (let y = -halfDiag; y <= halfDiag; y += bHeight) {
            ctx.moveTo(-halfDiag, y);
            ctx.lineTo(halfDiag, y);
          }
          let rowIndex = 0;
          for (let y = -halfDiag; y <= halfDiag; y += bHeight) {
            const offsetX = (rowIndex % 2 === 0) ? 0 : bWidth / 2;
            for (let x = -halfDiag + offsetX - bWidth; x <= halfDiag + bWidth; x += bWidth) {
              ctx.moveTo(x, y);
              ctx.lineTo(x, y + bHeight);
            }
            rowIndex++;
          }
          ctx.stroke();
        } else if (pat === 'checker') {
          for (let x = -halfDiag, i = 0; x <= halfDiag; x += step, i++) {
            for (let y = -halfDiag, j = 0; y <= halfDiag; y += step, j++) {
              if ((i + j) % 2 === 0) {
                ctx.fillRect(x, y, step, step);
              }
            }
          }
        } else if (pat === 'triangles') {
          const hTri = step * Math.sin(Math.PI / 3);
          for (let y = -halfDiag; y <= halfDiag; y += hTri) {
            for (let x = -halfDiag; x <= halfDiag; x += step) {
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x + step / 2, y + hTri);
              ctx.lineTo(x - step / 2, y + hTri);
              ctx.closePath();
              ctx.stroke();
            }
          }
        } else if (pat === 'honey' || pat === 'hexagon') {
          const rHex = step / 1.73;
          const hHex = rHex * Math.sin(Math.PI / 3);
          for (let y = -halfDiag - rHex; y <= halfDiag + rHex; y += hHex * 2) {
            let isAlt = false;
            for (let x = -halfDiag - rHex; x <= halfDiag + rHex; x += rHex * 1.5) {
              ctx.beginPath();
              const startOffset = isAlt ? hHex : 0;
              for (let side = 0; side < 6; side++) {
                const rad = (side * Math.PI) / 3;
                const px = x + rHex * Math.cos(rad);
                const py = y + startOffset + rHex * Math.sin(rad);
                if (side === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
              }
              ctx.closePath();
              ctx.stroke();
              isAlt = !isAlt;
            }
          }
        } else if (pat.startsWith('tile_')) {
          const dims = pat.split('_')[1].split('x');
          const tileW = (parseInt(dims[0]) || 50) * resolution;
          const tileH = (parseInt(dims[1]) || 40) * resolution;
          ctx.beginPath();
          for (let x = -halfDiag; x <= halfDiag; x += tileW) {
            ctx.moveTo(x, -halfDiag);
            ctx.lineTo(x, halfDiag);
          }
          for (let y = -halfDiag; y <= halfDiag; y += tileH) {
            ctx.moveTo(-halfDiag, y);
            ctx.lineTo(halfDiag, y);
          }
          ctx.stroke();
        } else if (pat === 'parquet_strip') {
          const stripW = step * 4;
          const stripH = step;
          ctx.beginPath();
          for (let y = -halfDiag; y <= halfDiag; y += stripH) {
            ctx.moveTo(-halfDiag, y);
            ctx.lineTo(halfDiag, y);
            const rowOffset = (Math.floor(y / stripH) % 3) * (stripW / 3);
            for (let x = -halfDiag + rowOffset - stripW; x <= halfDiag; x += stripW) {
              ctx.moveTo(x, y);
              ctx.lineTo(x, y + stripH);
            }
          }
          ctx.stroke();
        } else if (pat === 'parquet_herringbone') {
          const wP = step * 1.5;
          const hP = step * 4;
          for (let y = -halfDiag - hP; y <= halfDiag + hP; y += wP * 2) {
            for (let x = -halfDiag - hP; x <= halfDiag + hP; x += hP) {
              ctx.save();
              ctx.translate(x, y);
              ctx.rotate(Math.PI / 4);
              ctx.strokeRect(0, 0, wP, hP);
              ctx.restore();
              ctx.save();
              ctx.translate(x + hP/2, y + wP);
              ctx.rotate(-Math.PI / 4);
              ctx.strokeRect(0, 0, wP, hP);
              ctx.restore();
            }
          }
        } else if (pat === 'brick_stretcher' || pat === 'brick_bond') {
          const bW = step * 2.5;
          const bH = step;
          ctx.beginPath();
          for (let y = -halfDiag; y <= halfDiag; y += bH) {
            ctx.moveTo(-halfDiag, y);
            ctx.lineTo(halfDiag, y);
          }
          for (let y = -halfDiag; y <= halfDiag; y += bH) {
            const rowOffset = (Math.floor(y / bH) % 2 === 0) ? 0 : bW / 2;
            for (let x = -halfDiag + rowOffset - bW; x <= halfDiag; x += bW) {
              ctx.moveTo(x, y);
              ctx.lineTo(x, y + bH);
            }
          }
          ctx.stroke();
        }
      } catch (e) {
        console.warn("Error drawing hatch pattern in 3D: ", e);
      }

      ctx.restore();
    }

    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 16;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;

    setTextureObj({ tex });

    return () => {
      tex.dispose();
    };
  }, [entity.points, entity.holes, entity.pattern, entity.scale, entity.angle, entity.color, entity.backgroundColor, entity.lineWidth]);

  const shape = useMemo(() => {
    if (!entity.points || entity.points.length < 3) return null;
    try {
      const s = new THREE.Shape();
      s.moveTo(entity.points[0].x / 100, -entity.points[0].y / 100);
      for (let i = 1; i < entity.points.length; i++) {
        s.lineTo(entity.points[i].x / 100, -entity.points[i].y / 100);
      }
      s.closePath();

      if (entity.holes) {
        entity.holes.forEach((hole: Point[]) => {
          if (hole.length < 3) return;
          const path = new THREE.Path();
          path.moveTo(hole[0].x / 100, -hole[0].y / 100);
          for (let i = 1; i < hole.length; i++) {
            path.lineTo(hole[i].x / 100, -hole[i].y / 100);
          }
          path.closePath();
          s.holes.push(path);
        });
      }
      return s;
    } catch (err) {
      console.warn("Failed to create shape for Hatch in 3D: ", err);
      return null;
    }
  }, [entity.points, entity.holes]);

  const outlinePts = useMemo(() => {
    if (!entity.points || entity.points.length < 2) return null;
    const pts = entity.points.map(p => new THREE.Vector3(p.x / 100, 0.002, -p.y / 100));
    pts.push(new THREE.Vector3(entity.points[0].x / 100, 0.002, -entity.points[0].y / 100));
    return pts;
  }, [entity.points]);

  return (
    <group key={entity.id}>
      {shape && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
          <shapeGeometry args={[shape]} />
          {textureObj ? (
            <meshBasicMaterial
              map={textureObj.tex}
              color="#ffffff"
              transparent
              opacity={entity.opacity !== undefined ? entity.opacity : 1.0}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          ) : (
            <meshBasicMaterial
              color={entity.backgroundColor || entity.color || '#cbd5e1'}
              opacity={entity.opacity !== undefined ? entity.opacity * 0.35 : 0.3}
              transparent
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          )}
        </mesh>
      )}
      {outlinePts && (
        <Line
          points={outlinePts}
          color={entity.color || '#475569'}
          lineWidth={entity.lineWidth || 1}
          opacity={0.5}
          transparent
        />
      )}
    </group>
  );
};

const CADImage3D: React.FC<{ entity: ImageEntity }> = ({ entity }) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (entity.src) {
      const loader = new THREE.TextureLoader();
      loader.load(
        entity.src,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          setTexture(tex);
        },
        undefined,
        (err) => {
          console.error("Error loading texture in 3D: ", err);
        }
      );
    }
  }, [entity.src]);

  if (!texture) return null;

  const w = (entity.width || 100) / 100;
  const h = (entity.height || 100) / 100;
  const angle = (entity.angle || 0) * Math.PI / 180;

  const cx = (entity.point.x + entity.width / 2) / 100;
  const cy = -(entity.point.y + entity.height / 2) / 100;

  return (
    <mesh
      key={entity.id}
      position={[cx, 0.001, cy]}
      rotation={[-Math.PI / 2, 0, -angle]}
    >
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial 
        map={texture} 
        transparent 
        opacity={entity.opacity !== undefined ? entity.opacity : 0.8} 
        side={THREE.DoubleSide} 
        depthWrite={false}
      />
    </mesh>
  );
};

const ReferencePlan = ({ entities }: { entities: Entity[] }) => {
  const cadEntities = useMemo(() => {
    return entities.filter(e => !e.isBIM && e.isVisible !== false && e.isFrozen !== true);
  }, [entities]);

  if (cadEntities.length === 0) return null;

  return (
    <group position={[0, -0.01, 0]}>
      {cadEntities.map(entity => {
        switch (entity.type) {
          case 'line':
            return renderLine(entity as LineEntity);
          case 'rectangle':
            return renderRectangle(entity as RectEntity);
          case 'circle':
            return renderCircle(entity as CircleEntity);
          case 'arc':
            return renderArc(entity as ArcEntity);
          case 'text':
            return renderText(entity as TextEntity);
          case 'dimension':
            return renderDimension(entity as DimensionEntity);
          case 'point':
            return renderPoint(entity as PointEntity);
          case 'hatch':
            return <CADHatch3D key={entity.id} entity={entity as HatchEntity} />;
          case 'image':
            return <CADImage3D key={entity.id} entity={entity as ImageEntity} />;
          default:
            return null;
        }
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
  
  const lastResetRef = useRef(resetTrigger);
  const lastPresetRef = useRef(cameraPreset);
  const lastFocusRef = useRef(focusTrigger);
  const lastViewModeRef = useRef(cameraViewMode);
  
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

    // Set up vector orientation per preset to avoid lookAt lock/flip
    // Use a slight lerp or just cleaner snapping to avoid jerky behavior
    camera.up.set(0, 1, 0);
    if (preset === 'TOP') {
      camera.up.set(0, 0, -1);
      newPos.set(center.x, box.max.y + offset, center.z);
    } else if (preset === 'BOTTOM') {
      camera.up.set(0, 0, 1);
      newPos.set(center.x, box.min.y - offset, center.z);
    } else if (preset === 'FRONT') {
      newPos.set(center.x, center.y, box.max.z + offset);
    } else if (preset === 'BACK') {
      newPos.set(center.x, center.y, box.min.z - offset);
    } else if (preset === 'RIGHT') {
      newPos.set(box.max.x + offset, center.y, center.z);
    } else if (preset === 'LEFT') {
      newPos.set(box.min.x - offset, center.y, center.z);
    } else {
      newPos.set(center.x + offset * 0.8, center.y + offset * 0.8, center.z + offset * 0.8);
    }

    camera.position.copy(newPos);
    camera.lookAt(center);

    if (controls) {
      const orbit = controls as any;
      orbit.target.copy(center);
      orbit.update();
    }
  }, [camera, controls, entities, selectedEntity, viewportSize]);

  useEffect(() => {
    if (resetTrigger !== lastResetRef.current) {
      applyPreset(cameraViewMode, false);
      lastResetRef.current = resetTrigger;
    }
  }, [resetTrigger, cameraViewMode, applyPreset]);

  useEffect(() => {
    if (focusTrigger !== lastFocusRef.current && selectedEntity) {
      applyPreset(cameraViewMode, true);
      lastFocusRef.current = focusTrigger;
    }
  }, [focusTrigger, cameraViewMode, applyPreset, selectedEntity]);

  useEffect(() => {
    if (cameraPreset && cameraPreset !== lastPresetRef.current) {
      applyPreset(cameraPreset, false);
      lastPresetRef.current = cameraPreset;
      onPresetProcessed();
    }
  }, [cameraPreset, applyPreset, onPresetProcessed]);

  useEffect(() => {
    if (cameraViewMode !== lastViewModeRef.current) {
      applyPreset(cameraViewMode, false);
      lastViewModeRef.current = cameraViewMode;
    }
  }, [cameraViewMode, applyPreset]);

  return null;
};

const SectionPlaneHelper = ({ height, active, mode, entities }: { height: number, active: boolean, mode: string, entities: Entity[] }) => {
  const box = useMemo(() => {
    const b = new THREE.Box3();
    entities.forEach(entity => {
      let pts = (entity as any).points || (entity as any).bimPoints || [];
      if (entity.type === 'line') pts = [(entity as LineEntity).start, (entity as LineEntity).end];
      if (entity.type === 'rectangle') pts = [(entity as RectEntity).p1, (entity as RectEntity).p2];
      
      pts.forEach((p: Point) => {
        const e = entity as any;
        const bz = (e.bimZPlane || 0) + (e.bimZElevation || 0);
        const eh = (e.bimHeight || e.height || 270) / 100;
        b.expandByPoint(new THREE.Vector3(p.x / 100, bz / 100, -p.y / 100));
        b.expandByPoint(new THREE.Vector3(p.x / 100, (bz / 100) + eh, -p.y / 100));
      });
    });
    if (b.isEmpty()) b.set(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 3, 10));
    return b;
  }, [entities]);

  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  if (!active) return null;

  return (
    <group position={[center.x, height, center.z]}>
      {/* PROFESSIONAL SECTION PLANE - COMPLETELY TRANSPARENT (CLEAN VIEW) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} visible={false}>
        <planeGeometry args={[size.x + 10, size.z + 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      
      {/* PROFESSIONAL SECTION OUTLINE (THE BORDER) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size.x + 10.1, size.z + 10.1]} />
        <meshBasicMaterial color="#f8fafc" side={THREE.DoubleSide} transparent opacity={0} />
      </mesh>
      
      {/* PROFESSIONAL SECTION OUTLINE (THE BORDER) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size.x + 10.1, size.z + 10.1]} />
        <meshBasicMaterial color="#334155" wireframe={true} transparent opacity={0.3} />
      </mesh>

      {/* Height Label */}
      <Text
        position={[size.x/2 + 2, 0.1, size.z/2 + 2]}
        fontSize={0.2}
        color="#6366f1"
        anchorX="left"
        anchorY="bottom"
      >
        Piano di Sezione: {height.toFixed(2)}m
      </Text>
    </group>
  );
};

export const BIM3DViewer: React.FC<BIM3DViewerProps> = ({ entities, onClose, setEntities, floors = [], isStratifiedView, setIsStratifiedView, onCreateFaceFinish, onShowToast, isFaceSurveyMode, onSelectForRotation }) => {
  const [resetTrigger, setResetTrigger] = useState(0);
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [viewMode, setViewMode] = useState<'PERSPECTIVE' | 'TOP'>('PERSPECTIVE');
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [csgTargetEntity, setCSGTargetEntity] = useState<Entity | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isCSGOperating, setIsCSGOperating] = useState(false);
  const [isBimTreeOpen, setIsBimTreeOpen] = useState(false);
  const [expandedFamilies, setExpandedFamilies] = useState<{[key: string]: boolean}>({});
  const [showPropertyDialogId, setShowPropertyDialogId] = useState<string | null>(null);

  const bimTreeFamilies = useMemo(() => {
    const f: { [key: string]: Entity[] } = {};
    entities.forEach(e => {
      if (!e.isBIM) return;
      const fName = (e as any).bimFamily || (e as any).bimAreaType || 'Altri Elementi';
      if (!f[fName]) f[fName] = [];
      f[fName].push(e);
    });
    return f;
  }, [entities]);

  // Camera Presets
  const [cameraPreset, setCameraPreset] = useState<'FRONT' | 'BACK' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM' | 'ISO' | null>(null);
  const [cameraViewMode, setCameraViewMode] = useState<'FRONT' | 'BACK' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM' | 'ISO'>('ISO');
  const [flashingId, setFlashingId] = useState<string | null>(null);
  const controlsRef = useRef<any>(null);
  const [isZoomToggleEnabled, setIsZoomToggleEnabled] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [isMagicZoomActive, setIsMagicZoomActive] = useState(false);

  const effectiveMagicZoom = isMagicZoomActive || isZoomToggleEnabled;

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.zoomSpeed = effectiveMagicZoom ? 6.0 : 1.2;
    }
  }, [effectiveMagicZoom]);

  useEffect(() => {
    const getFriendlyKeyName = (key: string): string => {
      if (key === ' ') return 'BARRA SPAZIATRICE';
      if (key === 'Shift') return 'MAIUSC (SHIFT)';
      if (key === 'Control') return 'CTRL';
      if (key === 'Alt') return 'ALT';
      if (key === 'CapsLock') return 'BLOC MAIUSC (CAPS)';
      if (key === 'NumLock') return 'BLOC NUM';
      if (key === 'ScrollLock') return 'BLOC SCORR';
      return key.toUpperCase();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      // Evitiamo tasti di navigazione/sistema o cancellazione
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Delete', 'Backspace', 'Escape', 'Enter', 'Tab'].includes(e.key)) {
        return;
      }
      setIsMagicZoomActive(true);
      setActiveKey(getFriendlyKeyName(e.key));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      setIsMagicZoomActive(false);
      setActiveKey(null);
    };

    // Fallback on blur
    const handleBlur = () => {
      setIsMagicZoomActive(false);
      setActiveKey(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);
  
  const flashEntity = (id: string) => {
    setFlashingId(id);
    setTimeout(() => setFlashingId(null), 500); // Flash for 500ms
  };

  // Rotation Tools
  const [isRotationMode, setIsRotationMode] = useState(false);
  const [selectedPivotIndex, setSelectedPivotIndex] = useState(0);
  const [currentRotationVal, setCurrentRotationVal] = useState(0);
  const [originalPoints, setOriginalPoints] = useState<Point[] | null>(null);
  const [originalAngle, setOriginalAngle] = useState(0);
  
  // Dialog States
  const lastFaceConfirmedTime = useRef<number>(0);
  const [isAreaEditOpen, setIsAreaEditOpen] = useState(false);
  const [isDoorEditOpen, setIsDoorEditOpen] = useState(false);
  const [isWindowEditOpen, setIsWindowEditOpen] = useState(false);
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [isSectionMode, setIsSectionMode] = useState(false);
  const [showSectionConfig, setShowSectionConfig] = useState(false);
  const [isRealistic, setIsRealistic] = useState(true);
  const [isScaffoldLightweight, setIsScaffoldLightweight] = useState(false);
  const [globalOpacityMode, setGlobalOpacityMode] = useState<'WORK' | 'SOLID'>('SOLID');
  const [globalRoomOpacityVal, setGlobalRoomOpacityVal] = useState<number>(0.25);
  const [globalWallOpacityVal, setGlobalWallOpacityVal] = useState<number>(1.0);
  const [transparentEntities, setTransparentEntities] = useState<Set<string>>(new Set());
  const [stepCm, setStepCm] = useState(10);

  // BIM Survey (Rilievo) States
  const [isSurveyModeActive, setIsSurveyModeActive] = useState(false);
  const [surveyCategoryFilter, setSurveyCategoryFilter] = useState<string>('TUTTI');
  const [surveyFloorFilter, setSurveyFloorFilter] = useState<string>('TUTTI');
  const [activeSurveyWork, setActiveSurveyWork] = useState<any>(null);
  const [surveyHighlightId, setSurveyHighlightId] = useState<string | null>(null);
  const [isSurveyDialogOpen, setIsSurveyDialogOpen] = useState(false);
  const [surveyTargetEntity, setSurveyTargetEntity] = useState<Entity | null>(null);
  const [surveySelectedIds, setSurveySelectedIds] = useState<Set<string>>(new Set());
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['TUTTI']));

  // Technical section style settings (command of the section and saving in localStorage)
  const [sectionHatchMode, setSectionHatchMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('gecola_bim_section_hatch');
      return saved !== null ? saved === 'true' : true;
    } catch { return true; }
  });
  const [perimeterThickness, setPerimeterThickness] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('gecola_bim_perimeter_thickness');
      return saved !== null ? parseFloat(saved) : 5.5;
    } catch { return 5.5; }
  });
  const [hatchDensity, setHatchDensity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('gecola_bim_hatch_density');
      return saved !== null ? parseFloat(saved) : 4.0;
    } catch { return 4.0; }
  });
  const [hatchThickness, setHatchThickness] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('gecola_bim_hatch_thickness');
      return saved !== null ? parseFloat(saved) : 2.0;
    } catch { return 2.0; }
  });
  const [hatchLineColor, setHatchLineColor] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('gecola_bim_hatch_line_color');
      return saved !== null ? saved : '#000000';
    } catch { return '#000000'; }
  });
  const [hatchBgColorMode, setHatchBgColorMode] = useState<'white' | 'entity' | 'gray' | 'custom'>(() => {
    try {
      const saved = localStorage.getItem('gecola_bim_hatch_bg_color_mode');
      return (saved !== null && ['white', 'entity', 'gray', 'custom'].includes(saved)) ? saved as any : 'white';
    } catch { return 'white'; }
  });
  const [hatchBgColorCustom, setHatchBgColorCustom] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('gecola_bim_hatch_bg_color_custom');
      return saved !== null ? saved : '#ffffff';
    } catch { return '#ffffff'; }
  });
  const [hatchPatternMode, setHatchPatternMode] = useState<'diagonal' | 'horizontal' | 'vertical' | 'cross'>(() => {
    try {
      const saved = localStorage.getItem('gecola_bim_hatch_pattern_mode');
      return (saved !== null && ['diagonal', 'horizontal', 'vertical', 'cross'].includes(saved)) ? saved as any : 'diagonal';
    } catch { return 'diagonal'; }
  });

  // Effects to save the values in localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem('gecola_bim_hatch_pattern_mode', hatchPatternMode);
    } catch (e) {
      console.warn('LocalStorage save failed', e);
    }
  }, [hatchPatternMode]);
  useEffect(() => {
    try {
      localStorage.setItem('gecola_bim_section_hatch', sectionHatchMode.toString());
    } catch (e) {
      console.warn('LocalStorage save failed', e);
    }
  }, [sectionHatchMode]);

  useEffect(() => {
    try {
      localStorage.setItem('gecola_bim_perimeter_thickness', perimeterThickness.toString());
    } catch (e) {
      console.warn('LocalStorage save failed', e);
    }
  }, [perimeterThickness]);

  useEffect(() => {
    try {
      localStorage.setItem('gecola_bim_hatch_density', hatchDensity.toString());
    } catch (e) {
      console.warn('LocalStorage save failed', e);
    }
  }, [hatchDensity]);

  useEffect(() => {
    try {
      localStorage.setItem('gecola_bim_hatch_thickness', hatchThickness.toString());
    } catch (e) {
      console.warn('LocalStorage save failed', e);
    }
  }, [hatchThickness]);

  useEffect(() => {
    try {
      localStorage.setItem('gecola_bim_hatch_line_color', hatchLineColor);
    } catch (e) {
      console.warn('LocalStorage save failed', e);
    }
  }, [hatchLineColor]);

  useEffect(() => {
    try {
      localStorage.setItem('gecola_bim_hatch_bg_color_mode', hatchBgColorMode);
    } catch (e) {
      console.warn('LocalStorage save failed', e);
    }
  }, [hatchBgColorMode]);

  useEffect(() => {
    try {
      localStorage.setItem('gecola_bim_hatch_bg_color_custom', hatchBgColorCustom);
    } catch (e) {
      console.warn('LocalStorage save failed', e);
    }
  }, [hatchBgColorCustom]);

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
    
    // Also find and duplicate any connected finishes for direct 3D duplication!
    const isCoating = (e: any): boolean => {
      const nL = (e.bimName || e.name || '').toLowerCase();
      const fL = (e.bimFamily || e.bimAreaType || e.bimFamilyId || '').toLowerCase();
      const lL = (e.layer || '').toLowerCase();
      return fL.includes('intonac') || fL.includes('rivest') || fL.includes('pittur') || fL.includes('tinteg') || fL.includes('isolam') || fL.includes('cappott') || fL.includes('finitur') || fL.includes('plaster') ||
             nL.includes('intonac') || nL.includes('rivest') || nL.includes('pittur') || nL.includes('tinteg') || nL.includes('isolam') || nL.includes('cappott') || nL.includes('finitur') || nL.includes('plaster') ||
             lL.includes('finitur');
    };
    const distToSeg = (p: { x: number, y: number }, a: { x: number, y: number }, b: { x: number, y: number }): number => {
      const dxVal = b.x - a.x;
      const dyVal = b.y - a.y;
      if (dxVal === 0 && dyVal === 0) return Math.hypot(p.x - a.x, p.y - a.y);
      const t = ((p.x - a.x) * dxVal + (p.y - a.y) * dyVal) / (dxVal * dxVal + dyVal * dyVal);
      const clampedT = Math.max(0, Math.min(1, t));
      const projX = a.x + clampedT * dxVal;
      const projY = a.y + clampedT * dyVal;
      return Math.hypot(p.x - projX, p.y - projY);
    };

    const pts1 = rawEnt.bimPoints || rawEnt.points || [];
    let clonedFinishes: any[] = [];
    if (pts1.length > 0) {
      const connected = entities.filter(e => {
        if (e.id === rawEnt.id) return false;
        if (!isCoating(e)) return false;
        const eAny = e as any;
        const pts2 = eAny.bimPoints || eAny.points || [];
        if (pts2.length === 0) return false;

        // Check Z proximity
        const z1 = rawEnt.bimZPlane || rawEnt.zPlane || 0;
        const z2 = eAny.bimZPlane || eAny.zPlane || 0;
        if (Math.abs(z1 - z2) > 50) return false;

        // 2D proximity checking
        const tolerance = 25; // 25 cm tolerance
        let isClose = false;
        for (const p2 of pts2) {
          const closeToPoint = pts1.some((p1: any) => 
            Math.hypot(p2.x - p1.x, p2.y - p1.y) < tolerance
          );
          if (closeToPoint) {
            isClose = true;
            break;
          }
          for (let i = 0; i < pts1.length; i++) {
            const p1A = pts1[i];
            const p1B = pts1[(i + 1) % pts1.length];
            if (p1A && p1B) {
              if (distToSeg(p2, p1A, p1B) < tolerance) {
                isClose = true;
                break;
              }
            }
          }
          if (isClose) break;
        }
        return isClose;
      });

      clonedFinishes = connected.map((finish, idx) => {
        const clonedFinish = JSON.parse(JSON.stringify(finish));
        clonedFinish.id = `bim-elem-cloned-finish-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`;
        clonedFinish.timestamp = Date.now();
        return translateEntityPoints(clonedFinish, dx, dy, 0);
      });
    }
    
    setEntities(prev => [...prev, shifted, ...clonedFinishes]);
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

  const handleConfirmFaceCreation = (data: {
    familyId: string;
    subFamily: string;
    name: string;
    color: string;
    zPlane: number;
    zElevation: number;
    objectHeight: number;
    objectWidth?: number;
    hatch: 'SOLID' | 'ANSI31' | 'CROSS' | 'NONE';
    bimRenderMode?: 'solid' | 'transparent' | 'parete_verticale' | 'parete_orizzontale';
    sideSign?: number;
  }) => {
    if (!pendingFace) return;
    
    const defWidth = data.objectWidth !== undefined ? data.objectWidth : (data.familyId === 'pitture' ? 0.2 : (data.familyId === 'intonaco_completo' ? 1.0 : (data.familyId === 'intonaco_rustico' ? 1.5 : (data.familyId === 'rivestimenti' ? 2.0 : (data.familyId === 'isolamenti_termici' ? 10.0 : 15)))));
    const newEntity: any = {
      id: `bim-elem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      points: pendingFace.points,
      isLinear: pendingFace.isLinear,
      bimFamily: data.subFamily || BIM_FAMILIES.find(f => f.id === data.familyId)?.name || data.familyId,
      bimFamilyId: data.familyId,
      bimAreaType: data.subFamily || BIM_FAMILIES.find(f => f.id === data.familyId)?.name || data.familyId,
      bimSubFamily: data.subFamily || data.familyId,
      bimData: undefined,
      bimName: data.name,
      backgroundColor: data.color,
      color: data.color,
      bimHatchPattern: data.hatch,
      pattern: data.hatch === 'NONE' ? 'SOLID' : data.hatch,
      bimHeight: data.objectHeight,
      height: data.objectHeight,
      bimWidth: defWidth,
      width: defWidth,
      bimZPlane: data.zPlane,
      bimZElevation: data.zElevation,
      bimRenderMode: data.bimRenderMode || 'solid',
      sideSign: data.sideSign || 1,
      bimType: 'element',
      from3DFace: true,
      isFaceAligned: true,
      isBIM: true,
      timestamp: Date.now()
    };
    
    setEntities(prev => [...prev, newEntity]);
    setSelectedEntity(newEntity);
    setIsAreaEditOpen(false);
    setPendingFace(null);
    setIsPickFaceMode('OFF');
  };

  const handleConfirmAreaEdit = (data: {
    familyId: string;
    subFamily: string;
    name: string;
    color: string;
    zPlane: number;
    zElevation: number;
    objectHeight: number;
    objectWidth?: number;
    hatch: 'SOLID' | 'ANSI31' | 'CROSS' | 'NONE';
    bimRenderMode?: 'solid' | 'transparent' | 'parete_verticale' | 'parete_orizzontale';
    duplicate?: boolean;
    sideSign?: number;
    duplicateConnectedFinishes?: boolean;
  }) => {
    if (!editingEntityId) return;

    if (data.duplicate) {
      // DUPLICATE EXISTING
      setEntities((prev: Entity[]) => {
        const original = prev.find(e => e.id === editingEntityId);
        if (!original) return prev;
        const newElement: Entity = {
          ...original,
          id: `bim-elem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          bimFamily: data.subFamily || BIM_FAMILIES.find(f => f.id === data.familyId)?.name || data.familyId,
          bimFamilyId: data.familyId,
          bimAreaType: data.subFamily || BIM_FAMILIES.find(f => f.id === data.familyId)?.name || data.familyId,
          bimSubFamily: data.subFamily || data.familyId,
          bimData: undefined,
          bimName: data.name,
          backgroundColor: data.color,
          color: data.color,
          bimHatchPattern: data.hatch as any,
          pattern: data.hatch === 'NONE' ? 'SOLID' : data.hatch as any,
          bimHeight: data.objectHeight,
          height: data.objectHeight,
          bimWidth: data.objectWidth !== undefined ? data.objectWidth : (original as any).bimWidth || (original as any).width || 15,
          width: data.objectWidth !== undefined ? data.objectWidth : (original as any).bimWidth || (original as any).width || 15,
          bimZPlane: data.zPlane,
          bimZElevation: data.zElevation,
          bimRenderMode: data.bimRenderMode || 'solid',
          sideSign: data.sideSign !== undefined ? data.sideSign : (original as any).sideSign,
          timestamp: Date.now()
        } as any;
        
        let extraElements: any[] = [];
        if (data.duplicateConnectedFinishes) {
          const isCoating = (e: any): boolean => {
            const nL = (e.bimName || e.name || '').toLowerCase();
            const fL = (e.bimFamily || e.bimAreaType || e.bimFamilyId || '').toLowerCase();
            const lL = (e.layer || '').toLowerCase();
            return fL.includes('intonac') || fL.includes('rivest') || fL.includes('pittur') || fL.includes('tinteg') || fL.includes('isolam') || fL.includes('cappott') || fL.includes('finitur') || fL.includes('plaster') ||
                   nL.includes('intonac') || nL.includes('rivest') || nL.includes('pittur') || nL.includes('tinteg') || nL.includes('isolam') || nL.includes('cappott') || nL.includes('finitur') || nL.includes('plaster') ||
                   lL.includes('finitur');
          };
          const distToSeg = (p: { x: number, y: number }, a: { x: number, y: number }, b: { x: number, y: number }): number => {
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
            const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
            const clampedT = Math.max(0, Math.min(1, t));
            const projX = a.x + clampedT * dx;
            const projY = a.y + clampedT * dy;
            return Math.hypot(p.x - projX, p.y - projY);
          };
          const originalAny = original as any;
          const pts1 = originalAny.bimPoints || originalAny.points || [];
          if (pts1.length > 0) {
            const deltaZPlane = data.zPlane - (originalAny.bimZPlane || 0);
            const deltaZElevation = data.zElevation - (originalAny.bimZElevation || 0);
            const connected = prev.filter(e => {
              if (e.id === original.id) return false;
              if (!isCoating(e)) return false;
              const eAny = e as any;
              const pts2 = eAny.bimPoints || eAny.points || [];
              if (pts2.length === 0) return false;

              // Check Z proximity
              const z1 = originalAny.bimZPlane || originalAny.zPlane || 0;
              const z2 = eAny.bimZPlane || eAny.zPlane || 0;
              if (Math.abs(z1 - z2) > 50) return false;

              // 2D proximity checking
              const tolerance = 25; // 25 cm tolerance
              let isClose = false;
              for (const p2 of pts2) {
                const closeToPoint = pts1.some((p1: any) => 
                  Math.hypot(p2.x - p1.x, p2.y - p1.y) < tolerance
                );
                if (closeToPoint) {
                  isClose = true;
                  break;
                }
                for (let i = 0; i < pts1.length; i++) {
                  const p1A = pts1[i];
                  const p1B = pts1[(i + 1) % pts1.length];
                  if (p1A && p1B) {
                    if (distToSeg(p2, p1A, p1B) < tolerance) {
                      isClose = true;
                      break;
                    }
                  }
                }
                if (isClose) break;
              }
              return isClose;
            });
            extraElements = connected.map((finish, idx) => {
              const finishAny = finish as any;
              return {
                ...finish,
                id: `bim-elem-cloned-finish-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
                bimZPlane: (finishAny.bimZPlane || 0) + deltaZPlane,
                bimZElevation: (finishAny.bimZElevation || 0) + deltaZElevation,
                timestamp: Date.now()
              };
            });
          }
        }
        return [...prev, newElement, ...extraElements];
      });
      setSelectedEntity(null);
    } else {
      // UPDATE EXISTING
      setEntities((prev: Entity[]) => prev.map(e => {
        if (e.id === editingEntityId) {
          return {
            ...e,
            bimFamily: data.subFamily || BIM_FAMILIES.find(f => f.id === data.familyId)?.name || data.familyId,
            bimFamilyId: data.familyId,
            bimAreaType: data.subFamily || BIM_FAMILIES.find(f => f.id === data.familyId)?.name || data.familyId,
            bimSubFamily: data.subFamily || data.familyId,
            bimData: undefined,
            bimName: data.name,
            backgroundColor: data.color,
            color: data.color,
            bimHatchPattern: data.hatch as any,
            pattern: data.hatch === 'NONE' ? 'SOLID' : data.hatch as any,
            bimHeight: data.objectHeight,
            height: data.objectHeight,
            bimWidth: data.objectWidth !== undefined ? data.objectWidth : (e as any).bimWidth || (e as any).width || 15,
            width: data.objectWidth !== undefined ? data.objectWidth : (e as any).bimWidth || (e as any).width || 15,
            bimZPlane: data.zPlane,
            bimZElevation: data.zElevation,
            bimRenderMode: data.bimRenderMode || 'solid',
            sideSign: data.sideSign !== undefined ? data.sideSign : (e as any).sideSign
          };
        }
        return e;
      }));

      setSelectedEntity(prev => prev && prev.id === editingEntityId ? {
        ...prev,
        bimFamily: data.subFamily || BIM_FAMILIES.find(f => f.id === data.familyId)?.name || data.familyId,
        bimFamilyId: data.familyId,
        bimAreaType: data.subFamily || BIM_FAMILIES.find(f => f.id === data.familyId)?.name || data.familyId,
        bimSubFamily: data.subFamily || data.familyId,
        bimData: undefined,
        bimName: data.name,
        backgroundColor: data.color,
        color: data.color,
        bimHatchPattern: data.hatch as any,
        pattern: data.hatch === 'NONE' ? 'SOLID' : data.hatch as any,
        bimHeight: data.objectHeight,
        height: data.objectHeight,
        bimWidth: data.objectWidth !== undefined ? data.objectWidth : (prev as any).bimWidth || (prev as any).width || 15,
        width: data.objectWidth !== undefined ? data.objectWidth : (prev as any).bimWidth || (prev as any).width || 15,
        bimZPlane: data.zPlane,
        bimZElevation: data.zElevation,
        bimRenderMode: data.bimRenderMode || 'solid',
        sideSign: data.sideSign !== undefined ? data.sideSign : (prev as any).sideSign
      } as any : prev);
    }

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
          bimFamily: 'Porte',
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
      bimFamily: 'Porte',
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

  const handleConfirmWindowEdit = (width: number, height: number, type: string, trasmittanza: number, prezzario: string, zElevation: number, flipLeft: boolean, flipSide: boolean, rotation: number) => {
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
          bimFamily: 'Finestre',
          bimName: `Finestra ${width}x${height}`,
          bimWidth: width,
          bimWindowHeight: height,
          height: height,
          bimWindowType: type,
          end: nextEnd,
          bimTrasmittanza: trasmittanza,
          bimPrezzario: prezzario,
          bimZElevation: zElevation,
          bimFlip: flipLeft,
          bimFlipSide: flipSide,
          bimRotation: rotation
        };
      }
      return e;
    }));

    setSelectedEntity(prev => prev && prev.id === editingEntityId ? {
      ...prev,
      bimFamily: 'Finestre',
      bimName: `Finestra ${width}x${height}`,
      bimWidth: width,
      bimWindowHeight: height,
      height: height,
      bimWindowType: type,
      bimTrasmittanza: trasmittanza,
      bimPrezzario: prezzario,
      bimZElevation: zElevation,
      bimFlip: flipLeft,
      bimFlipSide: flipSide,
      bimRotation: rotation
    } : prev);

    setIsWindowEditOpen(false);
    setEditingEntityId(null);
  };
  
  useEffect(() => {
    resetCamera();
  }, []);

  // Slicing States
  const [isPickFaceMode, setIsPickFaceMode] = useState<'OFF' | 'PICKING' | 'PENDING'>('OFF');
  const [isEditBIMModeActive, setIsEditBIMModeActive] = useState(false);
  const [pendingFace, setPendingFace] = useState<any>(null);

  useEffect(() => {
    if (!isFaceSurveyMode) {
      setPendingFace(null);
    }
  }, [isFaceSurveyMode]);
  const [isSlicing, setIsSlicing] = useState(false);
  const maxModelHeight = useMemo(() => {
    let max = 0.5;
    entities.forEach(entity => {
      if (!entity.isBIM && entity.type !== 'bim-csg') return;
      const e = entity as any;
      const baseZ = (e.bimZPlane || 0) + (e.bimZElevation || 0);
      const h = (e.bimHeight || e.height || (e.bimType === 'door' ? 210 : (e.bimType === 'window' ? 120 : 270))) / 100;
      const totalH = (baseZ / 100) + h;
      if (totalH > max) max = totalH;
    });
    return max;
  }, [entities]);

  const [slicingHeight, setSlicingHeight] = useState(6.0);
  
  useEffect(() => {
    if (!isSlicing) {
      setSlicingHeight(maxModelHeight + 0.1);
    }
  }, [isSlicing, maxModelHeight]);

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
          const maxH = maxModelHeight + 0.5;
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

  // Combined effect to trigger solid view, activate slicing, and auto-set a beautiful floor cut slice when isSectionMode is enabled
  useEffect(() => {
    if (isSectionMode) {
      setGlobalOpacityMode('SOLID');
      setIsSlicing(true);
      // Automatically slice at a nice 1.35m height so that floor-plan layout is visible and hatched
      if (slicingHeight > maxModelHeight) {
        setSlicingHeight(1.35);
      }
    } else {
      setGlobalOpacityMode('WORK');
    }
  }, [isSectionMode, maxModelHeight]);

  const bimEntities = useMemo(() => {
    return entities.filter(e => e.isBIM && (e as any).isVisible !== false);
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
        
        <div className="flex items-center gap-1">
          <button className="p-1 rounded hover:bg-slate-100 text-slate-500" title="Muri"><Box size={16} /></button>
          <button className="p-1 rounded hover:bg-slate-100 text-slate-500" title="Porte"><Edit size={16} /></button>
          <button className="p-1 rounded hover:bg-slate-100 text-slate-500" title="Finestre"><Maximize size={16} /></button>
        </div>
        
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
            setIsEditBIMModeActive(false);
            if (isPickFaceMode === 'OFF') {
              setIsPickFaceMode('PICKING');
              setSelectedEntity(null);
              setIsRotationMode(false);
              onShowToast?.("Seleziona Faccia attiva: clicca su una superficie 3D per creare una finitura.");
            } else if (isPickFaceMode === 'PENDING' && pendingFace) {
              lastFaceConfirmedTime.current = Date.now();
              onCreateFaceFinish?.(pendingFace.points, pendingFace.isLinear, pendingFace.zPlane, pendingFace.objectHeight, pendingFace);
              setIsPickFaceMode('OFF');
            } else {
              setIsPickFaceMode('OFF');
              setPendingFace(null);
            }
          }}
          className={`p-3 rounded-xl transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border ${
            isPickFaceMode !== 'OFF' 
              ? 'bg-blue-500 border-blue-600 text-white shadow-lg shadow-blue-200 animate-pulse font-black text-xs px-4' 
              : 'hover:bg-slate-50 text-slate-400 border-neutral-200 bg-white shadow-sm hover:text-blue-500 px-4'
          }`}
          title="Seleziona Faccia per Finiture"
        >
          <Layers3 size={22} className={isPickFaceMode !== 'OFF' ? 'text-white' : 'text-blue-500'} />
          <span className="text-[10px] font-black uppercase tracking-wider">
            {isPickFaceMode === 'PENDING' ? 'CONFERMA FACCIA' : 'SELEZIONA FACCIA'}
          </span>
        </button>

        <button 
          onClick={() => {
            if (isEditBIMModeActive) {
              setIsEditBIMModeActive(false);
            } else {
              setIsEditBIMModeActive(true);
              setIsPickFaceMode('OFF');
              setPendingFace(null);
              setIsRotationMode(false);
              setIsSurveyModeActive(false);
              onShowToast?.("Modalità Modifica attiva: clicca su un elemento 3D per modificarlo o clonarlo.");
              if (selectedEntity) {
                handleOpenClickDialog(selectedEntity);
              }
            }
          }}
          className={`p-3 rounded-xl transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border ${
            isEditBIMModeActive 
              ? 'bg-emerald-500 border-emerald-600 text-white shadow-lg shadow-emerald-200 animate-pulse font-black text-xs px-4' 
              : 'hover:bg-slate-50 text-slate-400 border-neutral-200 bg-white shadow-sm hover:text-emerald-500 px-4'
          }`}
          title="Modifica Oggetto BIM"
        >
          <Edit size={22} className={isEditBIMModeActive ? "animate-bounce" : "text-emerald-600"} />
          <span className="text-[10px] font-black uppercase tracking-wider">MODIFICA ELEMENTO BIM</span>
        </button>

        <button 
          onClick={() => {
            setIsSurveyModeActive(!isSurveyModeActive);
            if (!isSurveyModeActive) {
              setIsEditBIMModeActive(false);
              setIsPickFaceMode('OFF');
              setIsRotationMode(false);
              onShowToast?.("Modalità Rilievo BIM attiva: seleziona una lavorazione e clicca gli elementi da rilevare.");
            }
          }}
          className={`p-3 rounded-xl transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border ${
            isSurveyModeActive 
              ? 'bg-indigo-600 border-indigo-700 text-white shadow-lg shadow-indigo-200 animate-pulse font-black text-xs px-4' 
              : 'hover:bg-slate-50 text-slate-400 border-neutral-200 bg-white shadow-sm hover:text-indigo-600 px-4'
          }`}
          title="Rilievo BIM e Computo Masivo"
        >
          <Activity size={22} className={isSurveyModeActive ? "animate-pulse" : "text-indigo-600"} />
          <span className="text-[10px] font-black uppercase tracking-wider">RILIEVO BIM</span>
        </button>

        <button 
          onClick={() => {
            setIsEditBIMModeActive(false);
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
            onClick={() => setIsSectionMode(!isSectionMode)}
            className={`p-2.5 rounded-lg transition-all ${isSectionMode ? 'bg-purple-500 text-white shadow-lg shadow-purple-200' : 'hover:bg-white text-slate-400'}`}
            title="Visuale Sezione (Solido)"
          >
            <Layers3 size={20} />
          </button>
          
          <div className="w-px h-6 bg-slate-200/50 mx-1" />

          <button 
            onClick={() => {
              const nextVal = !isSlicing;
              setIsSlicing(nextVal);
              if (nextVal) {
                setShowSectionConfig(true);
              } else {
                setShowSectionConfig(false);
              }
            }}
            className={`p-2.5 rounded-lg transition-all ${isSlicing ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-200' : 'hover:bg-white text-slate-400'}`}
            title="Slicing Engine (Section Mobile)"
          >
            <Scissors size={20} />
          </button>

          {isSlicing && (
            <button 
              onClick={() => setShowSectionConfig(!showSectionConfig)}
              className={`p-2.5 rounded-lg transition-all flex items-center gap-1.5 ${showSectionConfig ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'hover:bg-white text-slate-400'}`}
              title="Configura Stile Sezione / Tratteggio (Hatch)"
            >
              <Sliders size={18} />
              <span className="text-[9px] font-black uppercase tracking-wider hidden md:inline">Stile Sezione</span>
            </button>
          )}
          
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

        <button 
          onClick={() => setIsBimTreeOpen(!isBimTreeOpen)}
          className={`p-3 rounded-xl transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer border ${
            isBimTreeOpen 
              ? 'bg-indigo-600 border-indigo-700 text-white shadow-lg shadow-indigo-200 font-extrabold text-xs px-4' 
              : 'hover:bg-slate-50 hover:text-indigo-600 text-slate-500 border-transparent'
          }`}
          title="Albero Struttura ed Elementi BIM"
        >
          <FolderTree size={20} className={isBimTreeOpen ? "animate-pulse" : ""} />
          <span className="text-[10.5px] font-black uppercase tracking-wider">Albero BIM</span>
        </button>

        <div className="w-px h-8 bg-slate-200 mx-1" />
        
        <div className="flex items-center px-5 gap-3 h-10 bg-slate-50/50 rounded-xl border border-slate-100">
          <div className={`w-2.5 h-2.5 rounded-full ${isAutoSlicing ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500'} shadow-[0_0_8px_rgba(16,185,129,0.6)]`} />
          <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] font-mono">
            {isSlicing ? 'SECTION ACTIVE' : 'BIM ENGINE LIVE'}
          </span>
        </div>
      </div>

      {/* VERTICAL SECTION SLIDER (BIM STYLE) */}
      {isSlicing && (
        <div className="absolute right-8 top-1/2 -translate-y-1/2 z-[70] flex flex-col items-center gap-4 py-8 px-5 bg-white/80 backdrop-blur-3xl rounded-[3rem] border border-slate-200/50 shadow-2xl animate-in fade-in slide-in-from-right-8 duration-500">
           <div className="flex flex-col items-center gap-1 mb-2">
             <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
               <ArrowUp size={14} strokeWidth={3} />
             </div>
             <span className="text-[9px] font-black text-indigo-400 uppercase tracking-tighter">Section</span>
           </div>

           <div className="relative h-[40vh] w-12 flex items-center justify-center bg-slate-50/50 rounded-3xl border border-slate-100/50">
             <input 
               type="range" 
               min="0" 
               max={maxModelHeight + 0.5} 
               step="0.01" 
               value={slicingHeight}
               onChange={(e) => {
                 setSlicingHeight(parseFloat(e.target.value));
                 setIsAutoSlicing(false);
               }}
               style={{ 
                 writingMode: 'vertical-lr', 
                 WebkitAppearance: 'slider-vertical',
                 direction: 'rtl'
               } as any}
               className="h-[35vh] w-2.5 cursor-pointer accent-indigo-600 appearance-none bg-indigo-100/30 rounded-full"
             />
             
             {/* Height markings */}
             <div className="absolute right-1 h-[35vh] flex flex-col justify-between py-1 pointer-events-none">
               {[Math.ceil(maxModelHeight + 0.5), Math.ceil((maxModelHeight + 0.5) * 0.8), Math.ceil((maxModelHeight + 0.5) * 0.6), Math.ceil((maxModelHeight + 0.5) * 0.4), Math.ceil((maxModelHeight + 0.5) * 0.2), 0].map((h, idx) => (
                 <div key={`height-mark-${idx}`} className="flex items-center gap-1.5">
                   <div className="w-1.5 h-0.5 bg-slate-200 rounded-full" />
                   <span className="text-[8px] font-bold text-slate-300 font-mono">{h}m</span>
                 </div>
               ))}
             </div>
           </div>

           <div className="flex flex-col items-center gap-1 mt-2">
             <span className="text-[12px] font-black text-indigo-600 font-mono tracking-tighter">{slicingHeight.toFixed(2)}</span>
             <span className="text-[7px] font-black text-slate-400 uppercase">Meters</span>
             <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 mt-1">
               <ArrowDown size={14} strokeWidth={3} />
             </div>
           </div>
           
           <div className="w-8 h-px bg-slate-100 my-1" />
           
           <button 
             onClick={() => setIsAutoSlicing(!isAutoSlicing)}
             className={`p-3 rounded-full shadow-lg transition-all active:scale-90 ${isAutoSlicing ? 'bg-rose-500 text-white shadow-rose-200' : 'bg-emerald-500 text-white shadow-emerald-200'}`}
             title="Animazione"
           >
             {isAutoSlicing ? <Pause size={18} /> : <Play size={18} />}
           </button>
        </div>
      )}

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

        {/* MEASURE TOOL - Section - ADDED */}
        <button
          onClick={() => { setIsSectionMode(!isSectionMode); }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl text-[10.5px] font-black uppercase transition-all duration-300 active:scale-95 cursor-pointer ${
            isSectionMode
              ? 'bg-purple-50 text-purple-600 shadow-[0_4px_12px_rgba(168,85,247,0.15)] border border-purple-200'
              : 'hover:bg-slate-50 text-slate-600 border border-transparent'
          }`}
          title="Vista Sezione (Retino)"
        >
          <Layers3 size={16} />
          Sezione
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

      {/* Side BIM Tree Hierarchy Panel (Left-aligned, matching the aesthetic perfectly) */}
      <div 
        className={`absolute top-24 left-8 z-[60] w-88 bg-white/95 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] border border-slate-100 transition-all duration-300 pointer-events-auto flex flex-col max-h-[80vh] ${
          isBimTreeOpen ? 'opacity-100 translate-x-0 visible' : 'opacity-0 -translate-x-12 invisible pointer-events-none'
        }`}
      >
        <div className="p-8 flex flex-col h-full overflow-hidden max-h-[80vh]">
          {/* Header block */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 select-none">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100 animate-pulse">
                <FolderTree size={20} />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-lg tracking-tight leading-tight">Albero BIM</h3>
                <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider block font-mono">Struttura & Filtri</span>
              </div>
              <button
                onClick={() => {
                  const areAllVisible = entities.filter(e => e.isBIM).every(e => (e as any).isVisible !== false);
                  setEntities(prev => prev.map(e => e.isBIM ? { ...e, isVisible: !areAllVisible } as any : e));
                }}
                className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all ml-2"
                title="Attiva/Disattiva tutti gli elementi"
              >
                {entities.filter(e => e.isBIM).every(e => (e as any).isVisible !== false) ? <Lightbulb size={16} /> : <LightbulbOff size={16} />}
              </button>
            </div>
            <button 
              onClick={() => setIsBimTreeOpen(false)} 
              className="text-slate-300 hover:text-slate-600 transition-colors cursor-pointer p-1 hover:bg-slate-50 rounded-lg"
            >
              <X size={20} />
            </button>
          </div>

          {/* Tree hierarchy container */}
          <div className="overflow-y-auto pr-1 flex-1 max-h-[calc(80vh-10rem)] scrollbar-thin space-y-2.5 pb-2">
            {Object.keys(bimTreeFamilies).length === 0 ? (
              <div className="text-center py-10 px-4">
                <span className="block text-4xl mb-3">📁</span>
                <p className="text-slate-400 font-bold text-xs uppercase tracking-wide">Nessun elemento BIM caricato</p>
                <p className="text-slate-300 text-[10px] mt-1 pr-1 pl-1">Traccia o rileva elementi BIM in pianta 2D prima di accedere all'albero di controllo.</p>
              </div>
            ) : (
              (Object.entries(bimTreeFamilies) as [string, Entity[]][]).map(([familyName, familyMembers]) => {
                const isExpanded = expandedFamilies[familyName] !== false;
                const allVisible = familyMembers.every(m => (m as any).isVisible !== false);
                const allFrozen = familyMembers.every(m => (m as any).isFrozen === true);

                return (
                  <div key={familyName} className="bg-slate-50/50 rounded-2xl border border-slate-150/40 overflow-hidden">
                    {/* Family Header Row */}
                    <div className="p-3 flex items-center justify-between gap-2 hover:bg-slate-100/50 transition duration-200">
                      <div 
                        onClick={() => {
                          setExpandedFamilies(prev => ({
                            ...prev,
                            [familyName]: !isExpanded
                          }));
                        }}
                        className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                      >
                        <span className="text-slate-400 select-none shrink-0">
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                        <div className="min-w-0">
                          <span className="font-extrabold text-slate-800 text-[11.5px] truncate block" title={familyName}>
                            📁 {familyName}
                          </span>
                          <span className="text-[9px] text-slate-400 font-bold font-mono">({familyMembers.length} oggetti)</span>
                        </div>
                      </div>

                      {/* Action buttons (Family Level) */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Visibility toggle (Family Level) */}
                        <button
                          onClick={() => {
                            const nextVisible = !allVisible;
                            setEntities(prev => prev.map(ent => {
                              const isMem = ent.isBIM && (((ent as any).bimFamily === familyName) || ((ent as any).bimAreaType === familyName));
                              return isMem ? { ...ent, isVisible: nextVisible } as any : ent;
                            }));
                            if (selectedEntity && (((selectedEntity as any).bimFamily === familyName) || ((selectedEntity as any).bimAreaType === familyName))) {
                              setSelectedEntity(prev => prev ? { ...prev, isVisible: nextVisible } as any : null);
                            }
                          }}
                          className={`p-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
                            allVisible 
                              ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' 
                              : 'bg-slate-200/60 text-slate-400 hover:bg-slate-200'
                          }`}
                          title={allVisible ? "Spegni tutta la categoria" : "Accendi tutta la categoria"}
                        >
                          {allVisible ? <Lightbulb size={12.5} /> : <LightbulbOff size={12.5} />}
                        </button>

                        {/* Freeze toggle (Family Level) */}
                        <button
                          onClick={() => {
                            const nextFrozen = !allFrozen;
                            setEntities(prev => prev.map(ent => {
                              const isMem = ent.isBIM && (((ent as any).bimFamily === familyName) || ((ent as any).bimAreaType === familyName));
                              return isMem ? { ...ent, isFrozen: nextFrozen } as any : ent;
                            }));
                            if (selectedEntity && (((selectedEntity as any).bimFamily === familyName) || ((selectedEntity as any).bimAreaType === familyName))) {
                              setSelectedEntity(prev => prev ? { ...prev, isFrozen: nextFrozen } as any : null);
                            }
                          }}
                          className={`p-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
                            allFrozen 
                              ? 'bg-amber-500/15 text-amber-600 hover:bg-amber-500/25' 
                              : 'bg-slate-200/60 text-slate-400 hover:bg-slate-200'
                          }`}
                          title={allFrozen ? "Sblocca tutta la categoria" : "Congela/Blocca tutta la categoria"}
                        >
                          {allFrozen ? <Lock size={12.5} /> : <Unlock size={12.5} />}
                        </button>

                        {/* Delete entire Family */}
                        <button
                          onClick={() => {
                            if (confirm(`Sei sicuro di voler eliminare interamente la categoria "${familyName}" insieme a tutti i suoi ${familyMembers.length} oggetti?`)) {
                              setEntities(prev => prev.filter(ent => !(ent.isBIM && (((ent as any).bimFamily === familyName) || ((ent as any).bimAreaType === familyName)))));
                              if (selectedEntity && (((selectedEntity as any).bimFamily === familyName) || ((selectedEntity as any).bimAreaType === familyName))) {
                                setSelectedEntity(null);
                                setInspectorOpen(false);
                              }
                            }
                          }}
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-all duration-200 cursor-pointer"
                          title="Elimina intera categoria"
                        >
                          <Trash2 size={12.5} />
                        </button>
                      </div>
                    </div>

                    {/* Member Elements (Shown on Expansion) */}
                    {isExpanded && (
                      <div className="bg-white/40 border-t border-slate-150/40 divide-y divide-slate-100/60">
                        {familyMembers.map((member) => {
                          const isMemVisible = (member as any).isVisible !== false;
                          const isMemFrozen = (member as any).isFrozen === true;
                          const isMemSelected = selectedEntity?.id === member.id;

                          return (
                            <div 
                              key={member.id}
                              className={`pl-6 pr-3 py-2 flex items-center justify-between gap-2 hover:bg-indigo-50/20 transition duration-150 ${
                                isMemSelected ? 'bg-indigo-500/5' : ''
                              }`}
                            >
                              {/* Member Title / Selection Trigger */}
                              <div
                                onClick={() => {
                                  setSelectedEntity(member);
                                  setInspectorOpen(true);
                                  flashEntity(member.id);
                                }}
                                className="flex-1 min-w-0 cursor-pointer flex items-center gap-1.5"
                              >
                                <span className={`w-1.5 h-1.5 rounded-full`} style={{ backgroundColor: (member as any).backgroundColor || member.color || '#3b82f6' }} />
                                <span className={`text-[10.5px] truncate block ${
                                  isMemSelected ? 'font-black text-indigo-700' : 'text-slate-600 font-medium'
                                } ${!isMemVisible ? 'opacity-40 line-through' : ''}`}>
                                  {(member as any).bimName || 'Oggetto Senza Nome'}
                                </span>
                              </div>

                               {/* Action buttons (Individual Level) */}
                               <div className="flex items-center gap-0.5 shrink-0">
                                 {/* Visibility toggle */}
                                 <button
                                   onClick={() => {
                                     setEntities(prev => prev.map(ent => ent.id === member.id ? { ...ent, isVisible: !isMemVisible } as any : ent));
                                     if (selectedEntity && selectedEntity.id === member.id) {
                                       setSelectedEntity(prev => prev ? { ...prev, isVisible: !isMemVisible } as any : null);
                                     }
                                    }}
                                    className={`p-1 rounded-md transition duration-150 cursor-pointer ${
                                     isMemVisible ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-355 hover:bg-slate-100'
                                   }`}
                                   title={isMemVisible ? "Spegni lampadina elemento" : "Accendi lampadina elemento"}
                                 >
                                   {isMemVisible ? <Lightbulb size={11} /> : <LightbulbOff size={11} />}
                                 </button>

                                 {/* Freeze toggle */}
                                 <button
                                   onClick={() => {
                                     setEntities(prev => prev.map(ent => ent.id === member.id ? { ...ent, isFrozen: !isMemFrozen } as any : ent));
                                     if (selectedEntity && selectedEntity.id === member.id) {
                                       setSelectedEntity(prev => prev ? { ...prev, isFrozen: !isMemFrozen } as any : null);
                                     }
                                   }}
                                   className={`p-1 rounded-md transition duration-150 cursor-pointer ${
                                     isMemFrozen ? 'text-amber-600 hover:bg-amber-50' : 'text-slate-350 hover:bg-slate-100'
                                   }`}
                                   title={isMemFrozen ? "Sblocca elemento" : "Congela/Blocca elemento"}
                                 >
                                   {isMemFrozen ? <Lock size={11} /> : <Unlock size={11} />}
                                 </button>

                                 {/* Properties inspect */}
                                 <button
                                   onClick={() => {
                                     setSelectedEntity(member);
                                     setInspectorOpen(true);
                                     flashEntity(member.id);
                                     setShowPropertyDialogId(member.id);
                                   }}
                                   className={`p-1 rounded-md transition duration-150 cursor-pointer ${
                                     isMemSelected ? 'text-indigo-600 bg-indigo-50' : 'text-slate-350 hover:bg-slate-100 hover:text-slate-700'
                                   }`}
                                   title="Parametri e Proprietà"
                                 >
                                   <Sliders size={11} />
                                 </button>

                                 {/* Edit parameters dialog */}
                                 <button
                                   onClick={() => handleOpenClickDialog(member)}
                                   className="p-1 rounded-md text-slate-350 hover:bg-slate-100 hover:text-slate-700 transition duration-150 cursor-pointer"
                                   title="Modifica parametri dimensionali"
                                  >
                                    <Edit size={11} />
                                 </button>

                                 {/* Delete single element */}
                                 <button
                                   onClick={() => handleDeleteEntity(member.id)}
                                   className="p-1 rounded-md text-rose-450 hover:bg-rose-50 transition duration-150 cursor-pointer"
                                   title="Elimina elemento"
                                 >
                                   <Trash2 size={11} />
                                 </button>
                               </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Floating Section Style Configuration Panel - CAD Hatch & Outline parameters */}
      {showSectionConfig && (
        <div 
          className="absolute top-24 left-8 z-[60] w-80 bg-white/95 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] border border-slate-150 transition-all duration-300 pointer-events-auto flex flex-col p-6 animate-in fade-in slide-in-from-left-8 duration-300"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 select-none">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
                <Sliders size={20} />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-base tracking-tight leading-tight">Configura Sezione</h3>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Rendering & Hatch</span>
              </div>
            </div>
            <button onClick={() => setShowSectionConfig(false)} className="text-slate-350 hover:text-slate-600 transition-colors cursor-pointer">
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="space-y-4 font-sans">
            {/* Toggle Hatch / Solid */}
            <div>
              <label className="block text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1.5 font-mono italic">
                Tipo Riempimento Sezione
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-50 rounded-xl border border-slate-100">
                <button
                  type="button"
                  onClick={() => setSectionHatchMode(true)}
                  className={`py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    sectionHatchMode 
                      ? 'bg-indigo-600 text-white shadow-sm' 
                      : 'text-slate-600 hover:text-slate-850'
                  }`}
                >
                  Retino (Hatch)
                </button>
                <button
                  type="button"
                  onClick={() => setSectionHatchMode(false)}
                  className={`py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    !sectionHatchMode 
                      ? 'bg-indigo-600 text-white shadow-sm' 
                      : 'text-slate-600 hover:text-slate-850'
                  }`}
                >
                  Solido Full
                </button>
              </div>
            </div>

            {/* Pattern Mode Select */}
            {sectionHatchMode && (
              <div>
                <label className="block text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1.5 font-mono italic">
                  Motivo Linee Taglio (Pattern)
                </label>
                <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-50 rounded-xl border border-slate-100">
                  <button
                    type="button"
                    onClick={() => setHatchPatternMode('diagonal')}
                    className={`py-1 text-[9px] font-black rounded cursor-pointer transition-all ${
                      hatchPatternMode === 'diagonal' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Diag
                  </button>
                  <button
                    type="button"
                    onClick={() => setHatchPatternMode('horizontal')}
                    className={`py-1 text-[9px] font-black rounded cursor-pointer transition-all ${
                      hatchPatternMode === 'horizontal' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Oriz
                  </button>
                  <button
                    type="button"
                    onClick={() => setHatchPatternMode('vertical')}
                    className={`py-1 text-[9px] font-black rounded cursor-pointer transition-all ${
                      hatchPatternMode === 'vertical' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Vert
                  </button>
                  <button
                    type="button"
                    onClick={() => setHatchPatternMode('cross')}
                    className={`py-1 text-[9px] font-black rounded cursor-pointer transition-all ${
                      hatchPatternMode === 'cross' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Croce
                  </button>
                </div>
              </div>
            )}

            {/* Sliders */}
            <div className="space-y-3 pt-2">
              {/* Perimeter Thickness Input */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest font-mono">
                    Perimetro / Contorno
                  </label>
                  <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-mono">{perimeterThickness.toFixed(1)}px</span>
                </div>
                <input
                  type="range"
                  min="1.5"
                  max="12.0"
                  step="0.5"
                  value={perimeterThickness}
                  onChange={(e) => setPerimeterThickness(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              {sectionHatchMode && (
                <>
                  {/* Hatch Line Thickness */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest font-mono">
                        Spessore Linee Retino
                      </label>
                      <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-mono">{hatchThickness.toFixed(1)}px</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="4.5"
                      step="0.1"
                      value={hatchThickness}
                      onChange={(e) => setHatchThickness(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>

                  {/* Hatch Density */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[9px] text-slate-500 font-black uppercase tracking-widest font-mono">
                        Densità / Spaziatura
                      </label>
                      <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-mono">{hatchDensity.toFixed(1)}/m</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="10.0"
                      step="0.5"
                      value={hatchDensity}
                      onChange={(e) => setHatchDensity(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Architectural presets */}
            <div className="pt-3 border-t border-slate-100">
              <span className="block text-[8px] text-slate-400 font-black uppercase tracking-widest mb-2 font-mono">
                Preset Comandi Sezione
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setPerimeterThickness(5.5);
                    setHatchThickness(2.0);
                    setHatchDensity(4.0);
                    setSectionHatchMode(true);
                    setHatchLineColor('#000000');
                    setHatchBgColorMode('white');
                    setHatchPatternMode('diagonal');
                  }}
                  className="p-1 px-1.5 text-left bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-[9px] font-bold text-slate-600 transition-colors border border-slate-100 cursor-pointer"
                >
                  📐 Normativa ISO
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPerimeterThickness(9.5);
                    setHatchThickness(1.5);
                    setHatchDensity(5.0);
                    setSectionHatchMode(true);
                    setHatchLineColor('#1e293b');
                    setHatchBgColorMode('gray');
                    setHatchPatternMode('cross');
                  }}
                  className="p-1 px-1.5 text-left bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-[9px] font-bold text-slate-600 transition-colors border border-slate-100 cursor-pointer"
                >
                  🖋️ Contor. Forte
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPerimeterThickness(4.0);
                    setHatchThickness(1.0);
                    setHatchDensity(8.0);
                    setSectionHatchMode(true);
                    setHatchLineColor('#4f46e5');
                    setHatchBgColorMode('white');
                    setHatchPatternMode('vertical');
                  }}
                  className="p-1 px-1.5 text-left bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-[9px] font-bold text-slate-600 transition-colors border border-slate-100 cursor-pointer"
                >
                  🏁 Retino Denso
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPerimeterThickness(2.5);
                    setHatchThickness(2.5);
                    setHatchDensity(2.0);
                    setSectionHatchMode(true);
                    setHatchLineColor('#ef4444');
                    setHatchBgColorMode('custom');
                    setHatchBgColorCustom('#fee2e2');
                    setHatchPatternMode('horizontal');
                  }}
                  className="p-1 px-1.5 text-left bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-[9px] font-bold text-slate-600 transition-colors border border-slate-100 cursor-pointer"
                >
                  🪵 Retino Largo
                </button>
              </div>
            </div>

            {/* Controllo Colori Retino */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <span className="block text-[8px] text-slate-400 font-black uppercase tracking-widest font-mono">
                Colori Retto & Sfondo (Hatch & Background)
              </span>

              {/* Spessore/Colore delle Linee */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[9px] text-slate-550 font-bold uppercase tracking-wider font-mono">
                    Colore Linee Retino
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={hatchLineColor}
                      onChange={(e) => setHatchLineColor(e.target.value)}
                      className="w-5 h-5 rounded cursor-pointer border border-slate-200 p-0"
                    />
                    <span className="text-[9px] font-mono font-bold text-slate-500 uppercase">{hatchLineColor}</span>
                  </div>
                </div>
              </div>

              {/* Modalità dello sfondo del retino */}
              <div>
                <label className="block text-[9px] text-slate-550 font-bold uppercase tracking-wider font-mono mb-1">
                  Sfondo del Retino (Background)
                </label>
                <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-50 rounded-lg border border-slate-105">
                  <button
                    type="button"
                    onClick={() => setHatchBgColorMode('white')}
                    className={`py-1 text-[9px] font-bold rounded cursor-pointer transition-all ${
                      hatchBgColorMode === 'white' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                    title="Riempimento Sfondo Bianco"
                  >
                    Bianco
                  </button>
                  <button
                    type="button"
                    onClick={() => setHatchBgColorMode('entity')}
                    className={`py-1 text-[9px] font-bold rounded cursor-pointer transition-all ${
                      hatchBgColorMode === 'entity' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                    title="Sfondo con lo stesso colore dell'oggetto"
                  >
                    Oggetto
                  </button>
                  <button
                    type="button"
                    onClick={() => setHatchBgColorMode('gray')}
                    className={`py-1 text-[9px] font-bold rounded cursor-pointer transition-all ${
                      hatchBgColorMode === 'gray' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                    title="Riempimento Sfondo Grigio Chiaro"
                  >
                    Grigio
                  </button>
                  <button
                    type="button"
                    onClick={() => setHatchBgColorMode('custom')}
                    className={`py-1 text-[9px] font-bold rounded cursor-pointer transition-all ${
                      hatchBgColorMode === 'custom' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                    title="Usa un colore personalizzato"
                  >
                    Pers.
                  </button>
                </div>
              </div>

              {/* Color picker for custom background */}
              {hatchBgColorMode === 'custom' && (
                <div className="flex justify-between items-center bg-indigo-50/50 p-2 rounded-xl border border-indigo-100/60 animate-in fade-in duration-200">
                  <label className="text-[9px] text-slate-550 font-bold uppercase tracking-wider font-mono">
                    Colore Personalizzato Sfondo
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={hatchBgColorCustom}
                      onChange={(e) => setHatchBgColorCustom(e.target.value)}
                      className="w-5 h-5 rounded cursor-pointer border border-slate-200 p-0"
                    />
                    <span className="text-[9px] font-mono font-bold text-slate-500 uppercase">{hatchBgColorCustom}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Storage controls */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.setItem('gecola_bim_section_hatch', sectionHatchMode.toString());
                    localStorage.setItem('gecola_bim_perimeter_thickness', perimeterThickness.toString());
                    localStorage.setItem('gecola_bim_hatch_density', hatchDensity.toString());
                    localStorage.setItem('gecola_bim_hatch_thickness', hatchThickness.toString());
                    localStorage.setItem('gecola_bim_hatch_line_color', hatchLineColor);
                    localStorage.setItem('gecola_bim_hatch_bg_color_mode', hatchBgColorMode);
                    localStorage.setItem('gecola_bim_hatch_bg_color_custom', hatchBgColorCustom);
                    localStorage.setItem('gecola_bim_hatch_pattern_mode', hatchPatternMode);
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="flex-1 py-1.5 rounded-xl text-center bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-extrabold uppercase tracking-widest transition-colors cursor-pointer border border-emerald-100"
                title="Memorizza questa configurazione di tratteggio come preferito predefinito nel browser"
              >
                Salva Default
              </button>
              <button
                type="button"
                onClick={() => {
                  setSectionHatchMode(true);
                  setPerimeterThickness(5.5);
                  setHatchDensity(4.0);
                  setHatchThickness(2.0);
                  setHatchLineColor('#000000');
                  setHatchBgColorMode('white');
                  setHatchBgColorCustom('#ffffff');
                  setHatchPatternMode('diagonal');
                }}
                className="py-1.5 px-3 rounded-xl text-center bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-extrabold uppercase tracking-widest transition-colors cursor-pointer"
              >
                Ripristina
              </button>
            </div>
          </div>
        </div>
      )}

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
              {/* Modifica/Clona dedicated button */}
              <button
                onClick={() => handleOpenClickDialog(selectedEntity)}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-3xl shadow-lg shadow-emerald-500/25 active:scale-95 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 mb-2 cursor-pointer border-none shrink-0"
              >
                <Edit size={16} className="animate-bounce" />
                <span>MODIFICA / CLONA OGGETTO 🛠️</span>
              </button>

              {/* Advanced BIM Property card trigger */}
              <button
                onClick={() => setShowPropertyDialogId(selectedEntity.id)}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600 text-white font-black rounded-3xl shadow-lg shadow-amber-500/10 hover:shadow-indigo-500/20 active:scale-95 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 mb-1 cursor-pointer border-none shrink-0"
              >
                <Database size={15} />
                <span>SCHEDA BIM COMPLETA 🚀</span>
              </button>

              <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Nome Elemento</span>
                <div className="text-base font-black text-slate-800 break-words">
                  {(selectedEntity as any).prezzarioDescrizione || (selectedEntity as any).cost_5d?.prezzarioDescrizione || (selectedEntity as any).bimName || 'Elemento Non Nominato'}
                </div>
              </div>

              {/* Controlli Filtro Multi-Livello (Elemento + Categoria) */}
              {(() => {
                const familyName = (selectedEntity as any).bimFamily || (selectedEntity as any).bimAreaType || 'Altri Elementi';
                const familyMembers = entities.filter(e => e.isBIM && (((e as any).bimFamily === familyName) || ((e as any).bimAreaType === familyName)));
                
                const isElementVisible = (selectedEntity as any).isVisible !== false;
                const isElementFrozen = (selectedEntity as any).isFrozen === true;
                
                const isFamilyVisible = familyMembers.every(m => (m as any).isVisible !== false);
                const isFamilyFrozen = familyMembers.every(m => (m as any).isFrozen === true);

                const updateElementField = (field: string, val: any) => {
                  setEntities((prev: Entity[]) => prev.map(e => e.id === selectedEntity.id ? { ...e, [field]: val } as any : e));
                  setSelectedEntity((prev: any) => prev && prev.id === selectedEntity.id ? { ...prev, [field]: val } : prev);
                };

                const toggleFamilyVisibility = () => {
                  const nextVal = !isFamilyVisible;
                  setEntities((prev: Entity[]) => prev.map(e => {
                    const isMem = e.isBIM && (((e as any).bimFamily === familyName) || ((e as any).bimAreaType === familyName));
                    return isMem ? { ...e, isVisible: nextVal } as any : e;
                  }));
                };

                const toggleFamilyFrozen = () => {
                  const nextVal = !isFamilyFrozen;
                  setEntities((prev: Entity[]) => prev.map(e => {
                    const isMem = e.isBIM && (((e as any).bimFamily === familyName) || ((e as any).bimAreaType === familyName));
                    return isMem ? { ...e, isFrozen: nextVal } as any : e;
                  }));
                };

                const deleteFamily = () => {
                  if (confirm(`Sei sicuro di voler eliminare l'intera categoria di elementi "${familyName}" contenente ${familyMembers.length} oggetti?`)) {
                    setEntities((prev: Entity[]) => prev.filter(e => !(e.isBIM && (((e as any).bimFamily === familyName) || ((e as any).bimAreaType === familyName)))));
                    setSelectedEntity(null);
                    setInspectorOpen(false);
                  }
                };

                return (
                  <div className="bg-slate-50/80 border border-slate-200/60 p-4 rounded-3xl space-y-3 shadow-sm text-xs">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200/50 pb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1">🎛️ Filtri & Controllo Rapido</span>
                      <span className="text-[8px] bg-slate-900 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">Multi-Livello</span>
                    </div>

                    {/* Row 1: Selected Element Control */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 pr-1 flex-1">
                        <span className="block text-[8px] text-slate-400 uppercase tracking-wider font-extrabold">Singolo Elemento</span>
                        <span className="block font-black text-slate-700 truncate text-[11px]" title={(selectedEntity as any).prezzarioDescrizione || (selectedEntity as any).bimName || 'Elemento'}>
                          {(selectedEntity as any).prezzarioDescrizione || (selectedEntity as any).cost_5d?.prezzarioDescrizione || (selectedEntity as any).bimName || 'Senza Nome'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Visibility */}
                        <button
                          onClick={() => updateElementField('isVisible', !isElementVisible)}
                          className={`p-2 rounded-xl transition-all duration-300 ${!isElementVisible ? 'bg-slate-200 text-slate-400' : 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200'}`}
                          title={isElementVisible ? "Nascondi Elemento" : "Mostra Elemento"}
                        >
                          {!isElementVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        {/* Freeze / Lock */}
                        <button
                          onClick={() => updateElementField('isFrozen', !isElementFrozen)}
                          className={`p-2 rounded-xl transition-all duration-300 ${isElementFrozen ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                          title={isElementFrozen ? "Sblocca Elemento" : "Blocca/Congela Elemento"}
                        >
                          {isElementFrozen ? <Lock size={13} /> : <Unlock size={13} />}
                        </button>
                        {/* Delete */}
                        <button
                          onClick={() => handleDeleteEntity(selectedEntity.id)}
                          className="p-2 rounded-xl transition-all duration-300 bg-rose-50 text-rose-600 hover:bg-rose-100"
                          title="Elimina Elemento"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Row 2: Selected Family Control */}
                    <div className="flex items-center justify-between gap-3 border-t border-slate-200/50 pt-2.5">
                      <div className="min-w-0 pr-1 flex-1">
                        <span className="block text-[8px] text-slate-400 uppercase tracking-wider font-extrabold">Categoria di Appartenenza</span>
                        <span className="block font-black text-slate-800 truncate text-[11px]" title={familyName}>
                          📁 {familyName}
                        </span>
                        <span className="text-[9px] text-slate-500 font-bold">({familyMembers.length} elementi)</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Family Visibility */}
                        <button
                          onClick={toggleFamilyVisibility}
                          className={`p-2 rounded-xl transition-all duration-300 ${!isFamilyVisible ? 'bg-slate-200 text-slate-400' : 'bg-cyan-600/10 text-cyan-700 hover:bg-cyan-600/20'}`}
                          title={isFamilyVisible ? "Nascondi Intera Categoria" : "Mostra Intera Categoria"}
                        >
                          {!isFamilyVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        {/* Family Freezing */}
                        <button
                          onClick={toggleFamilyFrozen}
                          className={`p-2 rounded-xl transition-all duration-300 ${isFamilyFrozen ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                          title={isFamilyFrozen ? "Sblocca Intera Categoria" : "Congela Intera Categoria"}
                        >
                          {isFamilyFrozen ? <Lock size={13} /> : <Unlock size={13} />}
                        </button>
                        {/* Family Deletion */}
                        <button
                          onClick={deleteFamily}
                          className="p-2 rounded-xl transition-all duration-300 bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Elimina Intera Categoria di Elementi"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

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
                {((selectedEntity as any).bimType === 'room' || (selectedEntity as any).bimType === 'muro' || (selectedEntity as any).bimType === 'wall' || (selectedEntity as any).bimAreaType === 'muro' || selectedEntity.type === 'bim-csg' || (selectedEntity as any).bimType === 'door' || (selectedEntity as any).bimType === 'window') && (
                  <div className="mt-2 border-t border-slate-200/60 pt-4 space-y-3">
                    <span className="text-[10px] font-black text-cyan-800 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                      <Sliders size={13} className="text-cyan-600 animate-pulse" />
                      Misure Geometriche BIM Integrali
                    </span>
                    
                    {(() => {
                      const isRoomOrWall = (selectedEntity as any).bimType === 'room' || (selectedEntity as any).bimType === 'muro' || (selectedEntity as any).bimType === 'wall' || (selectedEntity as any).bimAreaType === 'muro' || selectedEntity.type === 'bim-csg';
                      const isOpening = (selectedEntity as any).bimType === 'door' || (selectedEntity as any).bimType === 'window';
                      
                      if (isRoomOrWall) {
                        const pts = (selectedEntity as any).bimPoints || (selectedEntity as any).points || [];
                        const isCsg = selectedEntity.type === 'bim-csg';
                        
                        // Safe unit handling for height (meters vs centimeters)
                        const rawHeight = (selectedEntity as any).bimHeight || (selectedEntity as any).height || 270;
                        const heightM = rawHeight > 10 ? rawHeight / 100 : rawHeight;

                        // Safe unit handling for thickness (cm vs meters)
                        const rawThickness = (selectedEntity as any).bimWidth || (selectedEntity as any).width || 15;
                        const thicknessM = rawThickness > 3 ? rawThickness / 100 : rawThickness;

                        const isWallLine = selectedEntity.type === 'line';
                        
                        let baseAreaMq = 0;
                        let perimeterM = 0;
                        let soffittoMq = 0;
                        let spondeMq = 0;
                        let volumeMc = 0;

                        if (isWallLine) {
                          const start = (selectedEntity as any).start || { x: 0, y: 0 };
                          const end = (selectedEntity as any).end || { x: 0, y: 0 };
                          const lengthCm = Math.hypot(end.x - start.x, end.y - start.y);
                          const lengthM = lengthCm / 100;
                          
                          baseAreaMq = lengthM * thicknessM;
                          perimeterM = lengthM;
                          soffittoMq = baseAreaMq;
                          spondeMq = 2 * lengthM * heightM; 
                          volumeMc = lengthM * thicknessM * heightM;
                        } else {
                          baseAreaMq = isCsg ? ((selectedEntity as any).bimArea || 0) : getRoomAreaMq(pts);
                          perimeterM = isCsg ? 0 : getRoomPerimeterM(pts);
                          soffittoMq = baseAreaMq; 
                          spondeMq = perimeterM * heightM; 
                          volumeMc = isCsg ? ((selectedEntity as any).bimVolume || 0) : (baseAreaMq * heightM);
                        }
                        const totalCasseri = baseAreaMq + spondeMq;
                        
                        return (
                          <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 border border-slate-200/50 p-3 rounded-2xl">
                            <div className="bg-white p-2 rounded-xl border border-slate-100/90 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                              <span className="block text-[8px] text-slate-450 font-extrabold uppercase tracking-wider">Pavimento (Base)</span>
                              <span className="font-mono font-black text-slate-800 text-xs">{baseAreaMq.toFixed(2)} mq</span>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-slate-100/90 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                              <span className="block text-[8px] text-slate-450 font-extrabold uppercase tracking-wider">Soffitto</span>
                              <span className="font-mono font-black text-slate-800 text-xs">{soffittoMq.toFixed(2)} mq</span>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-slate-100/90 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                              <span className="block text-[8px] text-slate-450 font-extrabold uppercase tracking-wider">Pareti/Spalle</span>
                              <span className="font-mono font-black text-slate-800 text-xs">{spondeMq.toFixed(2)} mq</span>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-slate-100/90 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                              <span className="block text-[8px] text-slate-450 font-extrabold uppercase tracking-wider">Volume Netto</span>
                              <span className="font-mono font-black text-cyan-700 text-xs">{volumeMc.toFixed(2)} mc</span>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-slate-100/90 shadow-[0_1px_2px_rgba(0,0,0,0.02)] col-span-2 flex justify-between items-center">
                              <span className="text-[8px] text-slate-450 font-extrabold uppercase tracking-wider">
                                {isWallLine ? "Sviluppo / Lunghezza Muro" : "Perimetro Sviluppo"}
                              </span>
                              <span className="font-mono font-black text-slate-800 text-xs">{perimeterM.toFixed(2)} m</span>
                            </div>
                            <div className="bg-amber-500/5 p-2 rounded-xl border border-amber-500/10 col-span-2 flex justify-between items-center">
                              <span className="text-[8px] text-amber-800 font-extrabold uppercase tracking-wider flex items-center gap-1">🏗️ Sviluppo Casseri / Tot.</span>
                              <span className="font-mono font-black text-amber-700 text-xs">{totalCasseri.toFixed(2)} mq</span>
                            </div>
                          </div>
                        );
                      } else if (isOpening) {
                        const widthCm = (selectedEntity as any).bimWidth || 80;
                        const heightCm = (selectedEntity as any).bimWindowHeight || (selectedEntity as any).bimHeight || ((selectedEntity as any).bimType === 'door' ? 210 : 140);
                        const thicknessCm = (selectedEntity as any).bimThickness || 0; 
                        
                        const baseAreaMq = (widthCm * thicknessCm) / 10000;
                        const soffittoMq = baseAreaMq;
                        const spondeMq = (heightCm * thicknessCm * 2) / 10000; 
                        const foroMq = (widthCm * heightCm) / 10000;
                        const volumeMc = (widthCm * heightCm * thicknessCm) / 1000000;
                        const totalSviluppo = baseAreaMq + soffittoMq + spondeMq;
                        
                        return (
                          <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 border border-slate-200/50 p-3 rounded-2xl">
                            <div className="bg-white p-2 rounded-xl border border-slate-100/90 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                              <span className="block text-[8px] text-slate-450 font-extrabold uppercase tracking-wider">Pavimento (Soglia)</span>
                              <span className="font-mono font-black text-slate-800 text-xs">{baseAreaMq.toFixed(3)} mq</span>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-slate-100/90 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                              <span className="block text-[8px] text-slate-450 font-extrabold uppercase tracking-wider">Soffitto (Mazzetta)</span>
                              <span className="font-mono font-black text-slate-800 text-xs">{soffittoMq.toFixed(3)} mq</span>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-slate-100/90 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                              <span className="block text-[8px] text-slate-450 font-extrabold uppercase tracking-wider">Superficie Foro</span>
                              <span className="font-mono font-black text-indigo-700 text-xs">{foroMq.toFixed(2)} mq</span>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-slate-100/90 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                              <span className="block text-[8px] text-slate-450 font-extrabold uppercase tracking-wider">Volume Serramento</span>
                              <span className="font-mono font-black text-cyan-700 text-xs">{volumeMc.toFixed(4)} mc</span>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-slate-100/90 shadow-[0_1px_2px_rgba(0,0,0,0.02)] col-span-2 flex justify-between items-center">
                              <span className="text-[8px] text-slate-450 font-extrabold uppercase tracking-wider">Spalle Laterali</span>
                              <span className="font-mono font-black text-slate-800 text-xs">{spondeMq.toFixed(3)} mq</span>
                            </div>
                            <div className="bg-slate-100 p-2 rounded-xl border border-slate-200/50 col-span-2 flex justify-between items-center">
                              <span className="text-[8px] text-slate-600 font-extrabold uppercase tracking-wider">Sviluppo Totale</span>
                              <span className="font-mono font-black text-slate-700 text-xs">{totalSviluppo.toFixed(3)} mq</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
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

      {/* CONTROLLI OPACITÀ E RENDERING VOLUME (CORPO DI FABBRICA REALE) */}
      <div className="absolute bottom-8 left-8 z-50 flex flex-col gap-3 bg-white/95 backdrop-blur-2xl p-4.5 rounded-[2rem] border border-slate-200/60 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.15)] pointer-events-auto w-80 animate-in fade-in slide-in-from-left-8 duration-500">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <Box size={18} className="text-indigo-600 animate-pulse" />
            <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider">CORPO DI FABBRICA EDIFICIO</span>
          </div>
          <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full uppercase">BIM</span>
        </div>

        {/* Modalità Selector Toggles */}
        <div className="grid grid-cols-2 gap-1.5 bg-slate-100/80 p-1 rounded-2xl">
          <button
            onClick={() => {
              setGlobalOpacityMode('WORK');
              setGlobalRoomOpacityVal(0.25);
              setGlobalWallOpacityVal(0.50);
            }}
            className={`py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 border-none ${
              globalOpacityMode === 'WORK'
                ? 'bg-white text-slate-800 shadow-sm font-extrabold'
                : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
            }`}
          >
            <Settings size={12} />
            <span>⚒️ Lavorazione</span>
          </button>
          
          <button
            onClick={() => {
              setGlobalOpacityMode('SOLID');
            }}
            className={`py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 border-none ${
              globalOpacityMode === 'SOLID'
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-200 font-extrabold'
                : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
            }`}
          >
            <Compass size={12} />
            <span>🏢 Corpo Reale</span>
          </button>
        </div>

        <div className="space-y-3">
          {globalOpacityMode === 'SOLID' ? (
            <div className="bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-2xl text-center">
              <p className="text-[10px] font-bold text-emerald-700 leading-normal">
                ✨ **Corpo di Fabbrica Reale Attivato**: Tutto il volume è stato renderizzato come solido pieno (Opacità 100%) per visualizzare l'ingombro architettonico reale.
              </p>
            </div>
          ) : (
            <>
              {/* Opacità Muri */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-600">
                  <span className="uppercase tracking-wider flex items-center gap-1">🧱 Muri e Strutture</span>
                  <span className="font-mono text-indigo-600">{Math.round(globalWallOpacityVal * 100)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={globalWallOpacityVal * 100}
                    onChange={(e) => setGlobalWallOpacityVal(parseFloat(e.target.value) / 100)}
                    className="flex-1 accent-indigo-600 h-1 bg-slate-100 rounded-lg cursor-pointer appearance-none"
                  />
                </div>
              </div>

              {/* Opacità Ambienti */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-600">
                  <span className="uppercase tracking-wider flex items-center gap-1">📐 Locali e Volumi</span>
                  <span className="font-mono text-indigo-600">{Math.round(globalRoomOpacityVal * 100)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={globalRoomOpacityVal * 100}
                    onChange={(e) => setGlobalRoomOpacityVal(parseFloat(e.target.value) / 100)}
                    className="flex-1 accent-indigo-600 h-1 bg-slate-100 rounded-lg cursor-pointer appearance-none"
                  />
                </div>
              </div>
              
              <p className="text-[9px] font-medium text-slate-400 leading-normal">
                💡 *In fase di lavorazione, una semitrasparenza (es. 50% Muri e 25% Stanze) rende visibili gli elementi interni.*
              </p>
            </>
          )}
        </div>

        {/* Realistic Rendering Toggle */}
        <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 mt-1">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className={isRealistic ? "text-amber-500 fill-amber-500/20" : "text-slate-400"} />
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Rendering Reale</span>
          </div>
          <button
            onClick={() => setIsRealistic(!isRealistic)}
            className={`w-10 h-5.5 rounded-full transition-all relative cursor-pointer outline-none border-none ${isRealistic ? 'bg-indigo-600 shadow-[0_0_10px_rgba(79,70,229,0.3)]' : 'bg-slate-200 shadow-inner'}`}
          >
            <div className={`absolute top-1 w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all duration-300 ${isRealistic ? 'left-5.5' : 'left-1'}`} />
          </button>
        </div>

        {/* Lightweight Scaffolding Toggle */}
        <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 mt-1">
          <div className="flex items-center gap-2">
            <Zap size={14} className={isScaffoldLightweight ? "text-emerald-500 fill-emerald-500/20 animate-pulse" : "text-slate-400"} />
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Ponteggio Leggero</span>
              <span className="text-[8px] text-emerald-600 font-bold tracking-tight uppercase">🚀 3D Ultra-Fluido</span>
            </div>
          </div>
          <button
            onClick={() => setIsScaffoldLightweight(!isScaffoldLightweight)}
            className={`w-10 h-5.5 rounded-full transition-all relative cursor-pointer outline-none border-none ${isScaffoldLightweight ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-slate-200 shadow-inner'}`}
          >
            <div className={`absolute top-1 w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all duration-300 ${isScaffoldLightweight ? 'left-5.5' : 'left-1'}`} />
          </button>
        </div>

        {/* Stratified View Toggle */}
        <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 mt-1">
          <div className="flex items-center gap-2">
            <Layers3 size={14} className={isStratifiedView ? "text-rose-500 fill-rose-500/20" : "text-slate-400"} />
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Visione Stratificata</span>
          </div>
          <button
            onClick={() => {
              console.log("Toggling stratified view. Current:", isStratifiedView);
              setIsStratifiedView(!isStratifiedView);
            }}
            className={`w-10 h-5.5 rounded-full transition-all relative cursor-pointer outline-none border-none ${isStratifiedView ? 'bg-rose-600 shadow-[0_0_10px_rgba(225,29,72,0.3)]' : 'bg-slate-200 shadow-inner'}`}
          >
            <div className={`absolute top-1 w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all duration-300 ${isStratifiedView ? 'left-5.5' : 'left-1'}`} />
          </button>
        </div>

        {/* Zoom 5x Toggle (Tasto Magico) */}
        <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 mt-1">
          <div className="flex items-center gap-2">
            <Zap size={14} className={effectiveMagicZoom ? "text-orange-500 fill-orange-500/20" : "text-slate-400"} />
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Super Zoom 5x</span>
              <span className="text-[8px] text-orange-600 font-bold tracking-tight uppercase">⚡ Rotellina Super Veloce</span>
            </div>
          </div>
          <button
            onClick={() => {
              setIsZoomToggleEnabled(!isZoomToggleEnabled);
            }}
            className={`w-10 h-5.5 rounded-full transition-all relative cursor-pointer outline-none border-none ${isZoomToggleEnabled ? 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.3)]' : 'bg-slate-200 shadow-inner'}`}
          >
            <div className={`absolute top-1 w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-all duration-300 ${isZoomToggleEnabled ? 'left-5.5' : 'left-1'}`} />
          </button>
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
        <div className="w-px h-4 bg-slate-200" />
        <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-500">
          <div className="bg-indigo-50 px-2 py-1 rounded border-b-2 border-indigo-200">CTRL</div> + Click FACCIA FINITURA
        </div>
        <div className="w-px h-4 bg-slate-200" />
        <div className={`flex items-center gap-2 text-[10px] font-bold transition-all duration-300 ${effectiveMagicZoom ? 'text-orange-500 scale-105' : 'text-slate-500'}`}>
          <div className={`px-2 py-1 rounded border-b-2 font-mono transition-all duration-300 ${effectiveMagicZoom ? 'bg-orange-500 text-white border-orange-600 shadow-[0_0_12px_rgba(249,115,22,0.5)] animate-pulse' : 'bg-slate-100 border-slate-300'}`}>
            {effectiveMagicZoom ? `ATTIVO (Tasto ${activeKey || 'Interruttore'})` : 'PREMI UN TASTO (es. SHIFT / SPAZIO / BLOC MAIUSC)'}
          </div>
          ZOOM VELOCE 5X
        </div>
      </div>

      {/* Tasto Magico Zoom 5x Floating Alert Banner */}
      <AnimatePresence>
        {effectiveMagicZoom && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%", scale: 0.9 }}
            animate={{ opacity: 1, y: 0, x: "-50%", scale: 1 }}
            exit={{ opacity: 0, y: -20, x: "-50%", scale: 0.9 }}
            className="absolute top-24 left-1/2 z-[100] flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white px-5 py-2.5 rounded-full shadow-lg border border-orange-400 font-bold text-xs tracking-wider uppercase pointer-events-none"
          >
            <Sparkles size={14} className="animate-spin text-white" style={{ animationDuration: '3s' }} />
            <span>Super Zoom 5x Attivo! {activeKey ? `(${activeKey})` : '(Interruttore Attivo)'} ⚡</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3D SCENE CANVAS */}
      <div className={`flex-1 cursor-crosshair transition-colors duration-1000 ${isRealistic ? 'bg-gradient-to-b from-sky-100 to-white' : 'bg-[#fdfdfd]'}`}>
        <Canvas shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true, localClippingEnabled: true }}>
          {isRealistic ? (
             <Environment preset="apartment" background blur={0.8} />
          ) : (
             <Environment preset="city" />
          )}

          {pendingFace && (
            <group 
              position={pendingFace.parentPivot || [0, 0, 0]} 
              rotation={pendingFace.parentRotation || [0, 0, 0]}
            >
              <group 
                position={pendingFace.parentPivot 
                  ? [-pendingFace.parentPivot[0], -pendingFace.parentPivot[1], -pendingFace.parentPivot[2]] 
                  : [0, 0, 0]}
              >
                {(() => {
                  const shiftX = (pendingFace.normalX || 0) * 0.003;
                  const shiftY = (pendingFace.normalY || 0) * 0.003;
                  const shiftZ = (pendingFace.normalZ || 0) * 0.003;

                  if (pendingFace.isLinear) {
                    // Vertical linear face/edge
                    const p1 = pendingFace.points[0];
                    const p2 = pendingFace.points[1];
                    if (!p1 || !p2) return null;

                    const p1x = p1.x / 100;
                    const p1z = -p1.y / 100;
                    const p2x = p2.x / 100;
                    const p2z = -p2.y / 100;

                    const length = Math.hypot(p2x - p1x, p2z - p1z);
                    const angle = Math.atan2(p2z - p1z, p2x - p1x);

                    const cx = (p1x + p2x) / 2;
                    const cz = (p1z + p2z) / 2;
                    const cy = (pendingFace.zPlane / 100) + (pendingFace.objectHeight / 200);
                    const height = pendingFace.objectHeight / 100;

                    const outlinePoints = [
                      [p1x + shiftX, (pendingFace.zPlane / 100) + shiftY, p1z + shiftZ],
                      [p2x + shiftX, (pendingFace.zPlane / 100) + shiftY, p2z + shiftZ],
                      [p2x + shiftX, ((pendingFace.zPlane + pendingFace.objectHeight) / 100) + shiftY, p2z + shiftZ],
                      [p1x + shiftX, ((pendingFace.zPlane + pendingFace.objectHeight) / 100) + shiftY, p1z + shiftZ],
                      [p1x + shiftX, (pendingFace.zPlane / 100) + shiftY, p1z + shiftZ]
                    ] as [number, number, number][];

                    return (
                      <group>
                        {/* Filled mesh in green with no Z-fighting */}
                        <mesh position={[cx + shiftX, cy + shiftY, cz + shiftZ]} rotation={[0, -angle, 0]}>
                          <planeGeometry args={[length, height]} />
                          <meshBasicMaterial color="#22c55e" transparent={true} opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
                        </mesh>
                        {/* Thick green outline */}
                        <Line 
                          points={outlinePoints}
                          color="#22c55e"
                          lineWidth={5}
                        />
                      </group>
                    );
                  } else {
                    // Horizontal or slanted flat polygon face
                    if (!pendingFace.points || pendingFace.points.length < 3) return null;

                    const shape = new THREE.Shape();
                    const p0 = pendingFace.points[0];
                    shape.moveTo(p0.x / 100, p0.y / 100);
                    for (let i = 1; i < pendingFace.points.length; i++) {
                      const p = pendingFace.points[i];
                      shape.lineTo(p.x / 100, p.y / 100);
                    }
                    shape.closePath();

                    const outlinePoints = [
                      ...pendingFace.points.map((p: any) => [
                        (p.x / 100) + shiftX,
                        (pendingFace.zPlane / 100) + shiftY,
                        (-p.y / 100) + shiftZ
                      ]),
                      [
                        (pendingFace.points[0].x / 100) + shiftX,
                        (pendingFace.zPlane / 100) + shiftY,
                        (-pendingFace.points[0].y / 100) + shiftZ
                      ]
                    ] as [number, number, number][];

                    return (
                      <group>
                        {/* Filled flat mesh in green with no Z-fighting */}
                        <mesh 
                          position={[shiftX, (pendingFace.zPlane / 100) + shiftY, shiftZ]} 
                          rotation={[-Math.PI / 2, 0, 0]}
                        >
                          <shapeGeometry args={[shape]} />
                          <meshBasicMaterial color="#22c55e" transparent={true} opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
                        </mesh>
                        {/* Thick green outline */}
                        <Line 
                          points={outlinePoints}
                          color="#22c55e"
                          lineWidth={5}
                        />
                      </group>
                    );
                  }
                })()}
              </group>
            </group>
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
            ref={controlsRef}
            enableDamping={false}
            rotateSpeed={1.0}
            zoomSpeed={effectiveMagicZoom ? 6.0 : 1.2}
            panSpeed={1.0}
            maxPolarAngle={Math.PI} 
            minPolarAngle={0}
            minDistance={0.01}
            maxDistance={2000}
            makeDefault
            mouseButtons={{
              LEFT: THREE.MOUSE.ROTATE,
              MIDDLE: THREE.MOUSE.PAN,
              RIGHT: THREE.MOUSE.DOLLY
            }}
          />
          
          <GizmoHelper
            alignment="top-right" 
            margin={[80, 80]}
          >
            <GizmoViewcube 
              font="bold 12px Inter, sans-serif"
              color="#f8fafc"
              hoverColor="#6366f1"
              strokeColor="#cbd5e1"
              textColor="#334155"
              opacity={0.9}
            />
          </GizmoHelper>
          
          <ambientLight intensity={isRealistic ? 0.4 : 0.4} />
          <directionalLight 
            position={[20, 30, 20]} 
            intensity={isRealistic ? 3.0 : 1.2} 
            castShadow 
            shadow-mapSize={[4096, 4096]}
            shadow-bias={-0.0001}
          />

          <SectionPlaneHelper 
            height={slicingHeight} 
            active={isSlicing} 
            mode={slicingMode} 
            entities={entities} 
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
              const e = entity as any;
              
              const isCatFiltered = surveyCategoryFilter === 'TUTTI' || 
                                (e.bimFamily || e.bimAreaType || 'Altri').toUpperCase().includes(surveyCategoryFilter.toUpperCase());
              
              const isFloorFiltered = surveyFloorFilter === 'TUTTI' ||
                                (e.layer || '').toUpperCase().includes(surveyFloorFilter.toUpperCase());

              const isFiltered = isCatFiltered && isFloorFiltered;

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
              const isElement = entity.bimType === 'element';
              const isSelected = selectedEntity?.id === entity.id;
              const isHovered = hoveredId === entity.id;
              const isFlashing = flashingId === entity.id;
              const isSurveyed = !!e.cost_5d?.prezzarioCodice;
              const isSurveySelected = surveySelectedIds.has(entity.id);

              let color = isFlashing ? '#22c55e' : (isSelected ? '#06b6d4' : (entity.color || (isMuro ? '#f8fafc' : '#3b82f6')));
              let entityOpacity = (entity as any).hideIn2D ? 0.08 : (transparentEntities.has(entity.id) ? 0.3 : 1);

              if (isSurveyModeActive) {
                if (isSurveySelected) {
                  color = '#f59e0b'; // Amber for selection
                  entityOpacity = 1;
                } else if (isFiltered) {
                  color = isSurveyed ? '#4f46e5' : (isMuro ? '#f8fafc' : '#3b82f6');
                  entityOpacity = isHovered ? 1 : 0.8;
                } else {
                  color = '#cbd5e1';
                  entityOpacity = 0.05;
                }
              } else if (isSurveyed) {
                color = '#4f46e5';
              }
              
              // Pivot calculation for dynamic 3D nested rotation (Front, Side or Top planes)
              let px = 0;
              let py = 0;
              let pz = 0;
              let rx = 0;
              let ry = 0;
              let rz = 0;

              const parentEntity = e.parentEntityId ? entities.find((ent: any) => ent.id === e.parentEntityId) : null;
              if (parentEntity) {
                const parentPoints = (parentEntity as any).points || (parentEntity as any).bimPoints || [];
                const isParentSelected = selectedEntity?.id === parentEntity.id;
                const parentPivotIdx = isParentSelected ? selectedPivotIndex : 0;
                const parentPCAD = parentPoints[parentPivotIdx] || (parentEntity as any).point || { x: 0, y: 0 };
                const parentBaseElevation = ((parentEntity as any).bimZPlane || 0) + ((parentEntity as any).bimZElevation || 0);

                px = parentPCAD.x / 100;
                py = parentBaseElevation / 100;
                pz = -parentPCAD.y / 100;

                rx = ((parentEntity as any).rotationX || 0) * Math.PI / 180;
                ry = ((parentEntity as any).rotationY || 0) * Math.PI / 180;
                rz = ((parentEntity as any).rotationZ || 0) * Math.PI / 180;
              } else {
                const pivotIdx = isSelected ? selectedPivotIndex : 0;
                const pCAD = points[pivotIdx] || e.point || { x: 0, y: 0 };
                const baseElevation = (e.bimZPlane || 0) + (e.bimZElevation || 0);

                px = pCAD.x / 100;
                py = baseElevation / 100;
                pz = -pCAD.y / 100;

                rx = (e.rotationX || 0) * Math.PI / 180;
                ry = (e.rotationY || 0) * Math.PI / 180;
                rz = (e.rotationZ || 0) * Math.PI / 180;
              }

              return (
                <group 
                  key={entity.id} 
                  onClick={(e) => {
                    e.stopPropagation();

                    if (isSurveyModeActive) {
                      const ent = entity as any;
                      const cat = (ent.bimFamily || ent.bimAreaType || 'Altri');
                      const floor = floors.find(f => f.name === ent.layer);
                      
                      if (floor) {
                        setExpandedNodes(prev => {
                          const next = new Set(prev);
                          next.add(floor.id);
                          next.add(`${floor.id}-${cat}`);
                          return next;
                        });
                      }
                      
                      setSurveySelectedIds(prev => {
                        const next = new Set(prev);
                        if (next.has(entity.id)) next.delete(entity.id);
                        else next.add(entity.id);
                        return next;
                      });
                      setSurveyTargetEntity(entity);
                      return;
                    }

                    const isBlocOrModifier = !isEditBIMModeActive && (
                        isPickFaceMode !== 'OFF' || 
                        e.ctrlKey || 
                        e.altKey || 
                        e.shiftKey ||
                        (e.nativeEvent && e.nativeEvent.getModifierState && (
                          e.nativeEvent.getModifierState('CapsLock') ||
                          e.nativeEvent.getModifierState('NumLock') ||
                          e.nativeEvent.getModifierState('ScrollLock') ||
                          e.nativeEvent.getModifierState('FnLock')
                        ))
                      );
                      
                      if (isBlocOrModifier) {
                        if (!e.object || !e.face || !onCreateFaceFinish) {
                           onShowToast?.("Errore: impossibile rilevare la faccia.");
                           return;
                        }
                        
                        const mesh = e.object as THREE.Mesh;
                        if (!mesh.geometry || !mesh.geometry.attributes.position) {
                           onShowToast?.("Errore: la geometria non è compatibile.");
                           return;
                        }
                        
                        // Helper functions to unrotate world coordinates back to geometric element's unrotated CAD coordinate system
                        const unrotateVertex = (v: THREE.Vector3) => {
                            const pivot = new THREE.Vector3(px, py, pz);
                            const relative = v.clone().sub(pivot);
                            const matrix = new THREE.Matrix4();
                            matrix.makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
                            const invMatrix = matrix.clone().invert();
                            relative.applyMatrix4(invMatrix);
                            return relative.add(pivot);
                        };

                        const unrotateNormal = (n: THREE.Vector3) => {
                            const matrix = new THREE.Matrix4();
                            matrix.makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
                            const invMatrix = matrix.clone().invert();
                            return n.clone().applyMatrix4(invMatrix).normalize();
                        };
                        
                        const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
                        const clickedNormalWorld = e.face.normal.clone().applyMatrix3(normalMatrix).normalize();
                        const unrotatedNormal = unrotateNormal(clickedNormalWorld);
                        
                        const isHorizontal = Math.abs(unrotatedNormal.y) >= 0.5;
                        const isVertical = !isHorizontal;
                        
                        const geom = mesh.geometry as THREE.BufferGeometry;
                        const pos = geom.attributes.position;
                        const idx = geom.index;
                        
                        const targetPointWorld = new THREE.Vector3().fromBufferAttribute(pos, e.face.a).applyMatrix4(mesh.matrixWorld);
                        const targetPointUnrotated = unrotateVertex(targetPointWorld);
                        const unrotatedVertices: THREE.Vector3[] = [];
                        
                        // 1. Collect all candidate coplanar triangles in the mesh
                        interface CandidateTri {
                            triIdx: number;
                            vA: THREE.Vector3;
                            vB: THREE.Vector3;
                            vC: THREE.Vector3;
                        }
                        
                        const candidates: CandidateTri[] = [];
                        let startCandidateIdx = -1;
                        
                        const checkTriangle = (a: number, b: number, c: number, triIdx: number) => {
                            const vAWorld = new THREE.Vector3().fromBufferAttribute(pos, a).applyMatrix4(mesh.matrixWorld);
                            const vBWorld = new THREE.Vector3().fromBufferAttribute(pos, b).applyMatrix4(mesh.matrixWorld);
                            const vCWorld = new THREE.Vector3().fromBufferAttribute(pos, c).applyMatrix4(mesh.matrixWorld);
                            
                            const vA = unrotateVertex(vAWorld);
                            const vB = unrotateVertex(vBWorld);
                            const vC = unrotateVertex(vCWorld);
                            
                            const edge1 = new THREE.Vector3().subVectors(vB, vA);
                            const edge2 = new THREE.Vector3().subVectors(vC, vA);
                            const triNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
                            
                            if (triNormal.dot(unrotatedNormal) > 0.99) {
                                const dist = Math.abs(unrotatedNormal.dot(new THREE.Vector3().subVectors(vA, targetPointUnrotated)));
                                if (dist < 0.05) {
                                    candidates.push({ triIdx, vA, vB, vC });
                                    if (triIdx === e.faceIndex) {
                                        startCandidateIdx = candidates.length - 1;
                                    }
                                }
                            }
                        };
                        
                        if (idx) {
                            for (let i = 0; i < idx.count; i += 3) {
                                checkTriangle(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2), i / 3);
                            }
                        } else {
                            for (let i = 0; i < pos.count; i += 3) {
                                checkTriangle(i, i + 1, i + 2, i / 3);
                            }
                        }
                        
                        // Fallback start candidate using proximity if faceIndex mismatch
                        if (startCandidateIdx === -1 && candidates.length > 0) {
                            const clickPointUnrotated = unrotateVertex(e.point);
                            let minDist = Infinity;
                            for (let i = 0; i < candidates.length; i++) {
                                const cand = candidates[i];
                                const centroid = new THREE.Vector3().addVectors(cand.vA, cand.vB).add(cand.vC).multiplyScalar(1 / 3);
                                const d = clickPointUnrotated.distanceTo(centroid);
                                if (d < minDist) {
                                    minDist = d;
                                    startCandidateIdx = i;
                                }
                            }
                        }
                        
                        // 2. BFS to find the connected component of candidates (island)
                        const connectedCandidates: CandidateTri[] = [];
                        if (startCandidateIdx !== -1) {
                            const visited = new Set<number>();
                            const queue: number[] = [startCandidateIdx];
                            visited.add(startCandidateIdx);
                            
                            const shareVertex = (t1: CandidateTri, t2: CandidateTri) => {
                                const pts1 = [t1.vA, t1.vB, t1.vC];
                                const pts2 = [t2.vA, t2.vB, t2.vC];
                                for (const p1 of pts1) {
                                    for (const p2 of pts2) {
                                        if (p1.distanceTo(p2) < 0.01) { // 1 cm tolerance for vertex sharing
                                            return true;
                                        }
                                    }
                                }
                                return false;
                            };
                            
                            while (queue.length > 0) {
                                const currIdx = queue.shift()!;
                                const curr = candidates[currIdx];
                                connectedCandidates.push(curr);
                                
                                for (let i = 0; i < candidates.length; i++) {
                                    if (!visited.has(i)) {
                                        if (shareVertex(curr, candidates[i])) {
                                            visited.add(i);
                                            queue.push(i);
                                        }
                                    }
                                }
                            }
                        }
                        
                        // 3. Populate unrotatedVertices with only the connected component
                        for (const cand of connectedCandidates) {
                            unrotatedVertices.push(cand.vA, cand.vB, cand.vC);
                        }
                        
                        if (unrotatedVertices.length === 0) {
                            onShowToast?.("Nessun vertice complanare trovato.");
                            return;
                        }

                        const handleDetectedFace = (data: any) => {
                          const enrichedData = {
                            ...data,
                            rotationX: entity.rotationX || 0,
                            rotationY: entity.rotationY || 0,
                            rotationZ: entity.rotationZ || 0,
                            parentPivot: [px, py, pz],
                            parentRotation: [rx, ry, rz],
                            parentEntityId: entity.id,
                            parentBimName: (entity as any).bimName || (entity as any).bimFamily || 'Elemento',
                            normalX: unrotatedNormal.x,
                            normalY: unrotatedNormal.y,
                            normalZ: unrotatedNormal.z,
                            isHorizontal,
                            isVertical
                          };
                          
                          if (isPickFaceMode === 'PICKING') {
                            setPendingFace(enrichedData);
                            setIsPickFaceMode('PENDING');
                            onShowToast?.("Contorno rilevato. Clicca di nuovo per confermare.");
                          } else if (isPickFaceMode === 'PENDING') {
                             lastFaceConfirmedTime.current = Date.now();
                             setPendingFace(enrichedData); // Keep the highlighted face!
                             onCreateFaceFinish?.(pendingFace?.points || enrichedData.points, pendingFace?.isLinear !== undefined ? pendingFace.isLinear : enrichedData.isLinear, pendingFace?.zPlane !== undefined ? pendingFace.zPlane : enrichedData.zPlane, pendingFace?.objectHeight !== undefined ? pendingFace.objectHeight : enrichedData.objectHeight, pendingFace || enrichedData);
                             setIsPickFaceMode('OFF');
                          } else {
                            // Direct call (Shift/Ctrl/Alt keys or CapsLock/NumLock/ScrollLock)
                            lastFaceConfirmedTime.current = Date.now();
                            setPendingFace(enrichedData); // Highlight immediately in green!
                            if (onCreateFaceFinish) {
                              onCreateFaceFinish(enrichedData.points, enrichedData.isLinear, enrichedData.zPlane, enrichedData.objectHeight, enrichedData);
                            }
                          }
                        };
                        
                        if (isVertical) {
                            let minZ = Infinity, maxZ = -Infinity;
                            
                            for (const v of unrotatedVertices) {
                                if (v.y < minZ) minZ = v.y;
                                if (v.y > maxZ) maxZ = v.y;
                            }
                            
                            if (e.shiftKey) {
                                // "Bloc FN" behavior: select entire contour
                                let minXY = unrotatedVertices[0], maxXY = unrotatedVertices[0];
                                let maxDistSq = 0;
                                for (let i = 0; i < unrotatedVertices.length; i++) {
                                    for (let j = i + 1; j < unrotatedVertices.length; j++) {
                                        const distSq = Math.pow(unrotatedVertices[i].x - unrotatedVertices[j].x, 2) + Math.pow(unrotatedVertices[i].z - unrotatedVertices[j].z, 2);
                                        if (distSq > maxDistSq) {
                                            maxDistSq = distSq;
                                            minXY = unrotatedVertices[i];
                                            maxXY = unrotatedVertices[j];
                                        }
                                    }
                                }
                                let p1 = { x: minXY.x * 100, y: -minXY.z * 100 };
                                let p2 = { x: maxXY.x * 100, y: -maxXY.z * 100 };
                                
                                const dx = p2.x - p1.x;
                                const dy = p2.y - p1.y;
                                const dot = (-dy) * unrotatedNormal.x + (dx) * (-unrotatedNormal.z);
                                if (dot < 0) {
                                    const temp = p1;
                                    p1 = p2;
                                    p2 = temp;
                                }
                                
                                handleDetectedFace({ points: [p1, p2], isLinear: true, zPlane: minZ * 100, objectHeight: (maxZ - minZ) * 100 });
                            } else {
                                // Default: merge contiguous edges on the base and find the one clicked
                                type Edge = { p1: THREE.Vector3, p2: THREE.Vector3 };
                                const edges: Edge[] = [];
                                for (let i = 0; i < unrotatedVertices.length; i += 3) {
                                    const vA = unrotatedVertices[i];
                                    const vB = unrotatedVertices[i+1];
                                    const vC = unrotatedVertices[i+2];
                                    edges.push({ p1: vA, p2: vB }, { p1: vB, p2: vC }, { p1: vC, p2: vA });
                                }

                                const uniqueEdges: Edge[] = [];
                                const edgeKeys = new Set<string>();
                                for (const edge of edges) {
                                    const p1 = edge.p1.x < edge.p2.x || (edge.p1.x === edge.p2.x && edge.p1.z < edge.p2.z) ? edge.p1 : edge.p2;
                                    const p2 = p1 === edge.p1 ? edge.p2 : edge.p1;
                                    const key = `${p1.x.toFixed(2)},${p1.z.toFixed(2)}-${p2.x.toFixed(2)},${p2.z.toFixed(2)}`;
                                    if (!edgeKeys.has(key)) {
                                        edgeKeys.add(key);
                                        uniqueEdges.push({ p1: p1, p2: p2 });
                                    }
                                }

                                // Filter to base edges only
                                const baseEdges = uniqueEdges.filter(edge =>
                                    Math.abs(edge.p1.y - minZ) < 0.1 && Math.abs(edge.p2.y - minZ) < 0.1
                                );
                                const edgesToSearch = baseEdges.length > 0 ? baseEdges : uniqueEdges;

                                let minDistance = Infinity;
                                let closestSegment = edgesToSearch[0];

                                const distToSegment = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => {
                                    const pa = new THREE.Vector3().subVectors(p, a);
                                    const ba = new THREE.Vector3().subVectors(b, a);
                                    if (ba.lengthSq() === 0) return p.distanceTo(a);
                                    const t = Math.max(0, Math.min(1, pa.dot(ba) / ba.lengthSq()));
                                    const closest = new THREE.Vector3().addVectors(a, ba.multiplyScalar(t));
                                    return p.distanceTo(closest);
                                };

                                const clickPointUnrotated = unrotateVertex(e.point);
                                for (const seg of edgesToSearch) {
                                    const d = distToSegment(clickPointUnrotated, seg.p1, seg.p2);
                                    if (d < minDistance) {
                                        minDistance = d;
                                        closestSegment = seg;
                                    }
                                }

                                let p1 = { x: closestSegment.p1.x * 100, y: -closestSegment.p1.z * 100 };
                                let p2 = { x: closestSegment.p2.x * 100, y: -closestSegment.p2.z * 100 };
                                
                                const dx = p2.x - p1.x;
                                const dy = p2.y - p1.y;
                                const dot = (-dy) * unrotatedNormal.x + (dx) * (-unrotatedNormal.z);
                                if (dot < 0) {
                                    const temp = p1;
                                    p1 = p2;
                                    p2 = temp;
                                }
                                
                                handleDetectedFace({ points: [p1, p2], isLinear: true, zPlane: minZ * 100, objectHeight: (maxZ - minZ) * 100 });
                            }
                        } else {
                            const pts = unrotatedVertices.map(v => ({ x: v.x * 100, y: -v.z * 100 }));
                            
                            let unique: {x: number, y: number}[] = [];
                            let holes: {x: number, y: number}[][] = [];
                            
                            // 1. Try to union all triangles to extract the clean outer boundary of the face, avoiding holes
                            const polyTriangles: any[] = [];
                            for (let i = 0; i < pts.length; i += 3) {
                                if (i + 2 >= pts.length) break;
                                const pA = pts[i];
                                const pB = pts[i+1];
                                const pC = pts[i+2];
                                const area = Math.abs((pB.x - pA.x) * (pC.y - pA.y) - (pC.x - pA.x) * (pB.y - pA.y));
                                if (area > 0.001) {
                                    polyTriangles.push([
                                        [ [pA.x, pA.y], [pB.x, pB.y], [pC.x, pC.y], [pA.x, pA.y] ]
                                    ]);
                                }
                            }

                            if (polyTriangles.length > 0) {
                                try {
                                    const unionResult = polygonClipping.union(polyTriangles as any);
                                    let maxArea = -1;
                                    let bestOuterRing: [number, number][] = [];
                                    let bestPolygonIndex = -1;
                                    
                                    for (let pIdx = 0; pIdx < unionResult.length; pIdx++) {
                                        const polygon = unionResult[pIdx];
                                        // The first ring of each polygon is the outer ring
                                        const outerRing = polygon[0];
                                        if (outerRing && outerRing.length >= 3) {
                                            let area = 0;
                                            const n = outerRing.length;
                                            for (let j = 0; j < n; j++) {
                                                const curr = outerRing[j];
                                                const next = outerRing[(j + 1) % n];
                                                area += curr[0] * next[1] - next[0] * curr[1];
                                            }
                                            area = Math.abs(area) / 2;
                                            if (area > maxArea) {
                                                maxArea = area;
                                                bestOuterRing = outerRing;
                                                bestPolygonIndex = pIdx;
                                            }
                                        }
                                    }
                                    
                                    if (bestOuterRing.length >= 3) {
                                        unique = bestOuterRing.map(pt => ({ x: pt[0], y: pt[1] }));
                                        if (unique.length > 1) {
                                            const pStart = unique[0];
                                            const pEnd = unique[unique.length - 1];
                                            const dSq = Math.pow(pStart.x - pEnd.x, 2) + Math.pow(pStart.y - pEnd.y, 2);
                                            if (dSq < 0.01) {
                                                unique.pop();
                                            }
                                        }
                                    }

                                    // Extract holes if any are present in the best polygon
                                    if (bestPolygonIndex !== -1) {
                                        const bestPoly = unionResult[bestPolygonIndex];
                                        for (let rIdx = 1; rIdx < bestPoly.length; rIdx++) {
                                            const holeRing = bestPoly[rIdx];
                                            if (holeRing && holeRing.length >= 3) {
                                                const holePts = holeRing.map(pt => ({ x: pt[0], y: pt[1] }));
                                                if (holePts.length > 1) {
                                                    const pStart = holePts[0];
                                                    const pEnd = holePts[holePts.length - 1];
                                                    const dSq = Math.pow(pStart.x - pEnd.x, 2) + Math.pow(pStart.y - pEnd.y, 2);
                                                    if (dSq < 0.01) {
                                                        holePts.pop();
                                                    }
                                                }
                                                holes.push(holePts);
                                            }
                                        }
                                    }
                                } catch (err) {
                                    console.error("Error in polygonClipping union:", err);
                                }
                            }

                            // 2. Fallback 1: Identify outer boundary edges and chain them
                            if (unique.length < 3) {
                                unique.length = 0;
                                const edgeCounts = new Map<string, number>();
                                const edgeMap = new Map<string, { p1: {x: number, y: number}, p2: {x: number, y: number} }>();

                                const getEdgeKey = (p1: {x: number, y: number}, p2: {x: number, y: number}) => {
                                    const k1 = `${Math.round(p1.x * 100)},${Math.round(p1.y * 100)}`;
                                    const k2 = `${Math.round(p2.x * 100)},${Math.round(p2.y * 100)}`;
                                    return k1 < k2 ? `${k1}_${k2}` : `${k2}_${k1}`;
                                };

                                for (let i = 0; i < pts.length; i += 3) {
                                    if (i + 2 >= pts.length) break;
                                    const pA = pts[i];
                                    const pB = pts[i+1];
                                    const pC = pts[i+2];

                                    const edges = [
                                        { p1: pA, p2: pB },
                                        { p1: pB, p2: pC },
                                        { p1: pC, p2: pA }
                                    ];

                                    for (const edge of edges) {
                                        const key = getEdgeKey(edge.p1, edge.p2);
                                        edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
                                        edgeMap.set(key, edge);
                                    }
                                }

                                const boundaryEdges: { p1: {x: number, y: number}, p2: {x: number, y: number} }[] = [];
                                for (const [key, count] of edgeCounts.entries()) {
                                    if (count === 1) {
                                        boundaryEdges.push(edgeMap.get(key)!);
                                    }
                                }

                                if (boundaryEdges.length >= 3) {
                                    const getDistSq = (pa: {x: number, y: number}, pb: {x: number, y: number}) => {
                                        return Math.pow(pa.x - pb.x, 2) + Math.pow(pa.y - pb.y, 2);
                                    };

                                    const loops: {x: number, y: number}[][] = [];
                                    const usedEdges = new Set<number>();
                                    
                                    while (usedEdges.size < boundaryEdges.length) {
                                        let startEdgeIdx = -1;
                                        for (let i = 0; i < boundaryEdges.length; i++) {
                                            if (!usedEdges.has(i)) {
                                                startEdgeIdx = i;
                                                break;
                                            }
                                        }
                                        if (startEdgeIdx === -1) break;
                                        
                                        const currentLoop: {x: number, y: number}[] = [];
                                        let currentPt = boundaryEdges[startEdgeIdx].p1;
                                        currentLoop.push(currentPt);
                                        usedEdges.add(startEdgeIdx);
                                        
                                        currentPt = boundaryEdges[startEdgeIdx].p2;
                                        currentLoop.push(currentPt);
                                        
                                        let foundNext = true;
                                        while (foundNext) {
                                            foundNext = false;
                                            for (let i = 0; i < boundaryEdges.length; i++) {
                                                if (usedEdges.has(i)) continue;
                                                const edge = boundaryEdges[i];
                                                const d1 = getDistSq(edge.p1, currentPt);
                                                const d2 = getDistSq(edge.p2, currentPt);
                                                
                                                if (d1 < 0.2) {
                                                    currentPt = edge.p2;
                                                    currentLoop.push(currentPt);
                                                    usedEdges.add(i);
                                                    foundNext = true;
                                                    break;
                                                } else if (d2 < 0.2) {
                                                    currentPt = edge.p1;
                                                    currentLoop.push(currentPt);
                                                    usedEdges.add(i);
                                                    foundNext = true;
                                                    break;
                                                }
                                            }
                                        }
                                        
                                        if (currentLoop.length > 2) {
                                            if (getDistSq(currentLoop[0], currentLoop[currentLoop.length - 1]) < 0.2) {
                                                currentLoop.pop();
                                            }
                                            if (currentLoop.length >= 3) {
                                                loops.push(currentLoop);
                                            }
                                        } else {
                                            break;
                                        }
                                    }

                                    const getPolygonArea = (poly: {x: number, y: number}[]) => {
                                        let area = 0;
                                        const n = poly.length;
                                        for (let i = 0; i < n; i++) {
                                            const j = (i + 1) % n;
                                            area += poly[i].x * poly[j].y;
                                            area -= poly[j].x * poly[i].y;
                                        }
                                        return Math.abs(area) / 2;
                                    };

                                    if (loops.length > 0) {
                                        let maxArea = -1;
                                        let bestLoop = loops[0];
                                        for (const loop of loops) {
                                            const area = getPolygonArea(loop);
                                            if (area > maxArea) {
                                                maxArea = area;
                                                bestLoop = loop;
                                            }
                                        }
                                        unique.push(...bestLoop);
                                    }
                                }
                            }

                            // 3. Fallback 2: polar-sorting if chaining didn't form a valid polygon
                            if (unique.length < 3) {
                                unique.length = 0;
                                const fallbackUnique: {x: number, y: number}[] = [];
                                const seen = new Set<string>();
                                for (const p of pts) {
                                    const k = `${Math.round(p.x/5)},${Math.round(p.y/5)}`;
                                    if (!seen.has(k)) {
                                        seen.add(k);
                                        fallbackUnique.push(p);
                                    }
                                }
                                const center = fallbackUnique.reduce((acc, p) => ({x: acc.x + p.x/fallbackUnique.length, y: acc.y + p.y/fallbackUnique.length}), {x:0, y:0});
                                fallbackUnique.sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
                                unique.push(...fallbackUnique);
                            }

                            handleDetectedFace({ points: unique, holes: holes.length > 0 ? holes : undefined, isLinear: false, zPlane: targetPointUnrotated.y * 100, objectHeight: 5 });
                        }
                      } else if (e.shiftKey) {
                        handleSelectSecondary(entity);
                      } else {
                        if (Date.now() - lastFaceConfirmedTime.current < 600) {
                          return;
                        }
                        handleSelect(entity);
                        if (isEditBIMModeActive) {
                          handleOpenClickDialog(entity);
                          setIsEditBIMModeActive(false);
                        } else if (isRotationMode) {
                          onSelectForRotation?.(entity.id);
                        }
                      }
                    }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    const isBlocOrModifier = !isEditBIMModeActive && (
                      isPickFaceMode !== 'OFF' || 
                      e.ctrlKey || 
                      e.altKey || 
                      e.shiftKey ||
                      (e.nativeEvent && e.nativeEvent.getModifierState && (
                        e.nativeEvent.getModifierState('CapsLock') ||
                        e.nativeEvent.getModifierState('NumLock') ||
                        e.nativeEvent.getModifierState('ScrollLock') ||
                        e.nativeEvent.getModifierState('FnLock')
                      ))
                    );
                    if (isBlocOrModifier) return;
                    if (Date.now() - lastFaceConfirmedTime.current < 600) {
                      return;
                    }
                    handleSelect(entity);
                    handleOpenClickDialog(entity);
                  }}
                >
                  <group position={[px, py, pz]} rotation={[rx, ry, rz]}>
                    <group position={[-px, -py, -pz]}>
                      {(() => {
                        const baseZ = (e.bimZPlane || 0) + (e.bimZElevation || 0);
                        const heightValue = e.bimHeight || e.height || 270;
                        const stackedOffsetInfo = getCoincidentStackedOffset(entity, entities);
                        
                        if (entity.type === 'bim-csg') {
                          return (
                            <CSGMeshRender 
                              entity={entity} 
                              color={color} 
                              clippingPlanes={clippingPlanes} 
                              opacity={entityOpacity} 
                              globalOpacityMode={globalOpacityMode}
                              globalWallOpacityVal={globalWallOpacityVal}
                              isSlicing={isSlicing}
                              slicingHeight={slicingHeight}
                              slicingMode={slicingMode}
                              windowThickness={windowThickness}
                              renderMode={e.bimRenderMode || 'solid'}
                              sectionHatchMode={sectionHatchMode}
                              perimeterThickness={perimeterThickness}
                              hatchDensity={hatchDensity}
                              hatchThickness={hatchThickness}
                              hatchLineColor={hatchLineColor}
                              hatchBgColorMode={hatchBgColorMode}
                              hatchBgColorCustom={hatchBgColorCustom}
                              hatchPatternMode={hatchPatternMode}
                              parentPivot={[px, py, pz]}
                              parentRotation={[rx, ry, rz]}
                              isStratifiedView={isStratifiedView}
                            />
                          );
                        } else if (isMuro) {
                          return (points.length >= 3 || e.isLinear) && e.type === 'hatch' ? (
                            <Room 
                              renderMode={e.bimRenderMode}
                              isLinear={e.isLinear}
                              points={points} 
                              holes={e.holes} 
                              height={heightValue} 
                              width={e.bimWidth || e.width}
                              color={color} 
                              name={e.bimName}
                              areaType={e.bimAreaType || "muro"} 
                              baseZ={baseZ} 
                              bimFamilyId={e.bimFamilyId || e.bimAreaType || e.bimFamily}
                              clippingPlanes={clippingPlanes} 
                              opacity={entityOpacity} 
                              globalOpacityMode={globalOpacityMode}
                              globalRoomOpacityVal={globalRoomOpacityVal}
                              globalWallOpacityVal={globalWallOpacityVal}
                              isSlicing={isSlicing}
                              slicingHeight={slicingHeight}
                              slicingMode={slicingMode}
                              windowThickness={windowThickness}
                              sectionHatchMode={sectionHatchMode}
                              perimeterThickness={perimeterThickness}
                              hatchDensity={hatchDensity}
                              hatchThickness={hatchThickness}
                              hatchLineColor={hatchLineColor}
                              hatchBgColorMode={hatchBgColorMode}
                              hatchBgColorCustom={hatchBgColorCustom}
                              hatchPatternMode={hatchPatternMode}
                              parentPivot={[px, py, pz]}
                              parentRotation={[rx, ry, rz]}
                              coincidentWallWidth={stackedOffsetInfo.baseWallWidth}
                              coincidentOffset={stackedOffsetInfo.offsetZ}
                              sideSign={(e as any).sideSign}
                              isFaceAligned={(e as any).isFaceAligned}
                              hasMantovana={e.hasMantovana}
                              mantovanaAngle={e.mantovanaAngle}
                              mantovanaHeight={e.mantovanaHeight}
                              isScaffoldLightweight={isScaffoldLightweight}
                              teloLato={(e as any).teloLato}
                              tavoleFermapiedeCount={(e as any).tavoleFermapiedeCount}
                            />
                          ) : (
                            <Wall 
                              points={points} 
                              height={heightValue} 
                              width={e.bimWidth} 
                              color={color} 
                              baseZ={baseZ} 
                              bimFamilyId={e.bimFamilyId || e.bimAreaType || e.bimFamily || e.bimName || ''}
                              clippingPlanes={clippingPlanes} 
                              opacity={entityOpacity} 
                              globalOpacityMode={globalOpacityMode}
                              globalWallOpacityVal={globalWallOpacityVal}
                              isSlicing={isSlicing}
                              slicingHeight={slicingHeight}
                              slicingMode={slicingMode}
                              windowThickness={windowThickness}
                              renderMode={e.bimRenderMode}
                              sectionHatchMode={sectionHatchMode}
                              perimeterThickness={perimeterThickness}
                              hatchDensity={hatchDensity}
                              hatchThickness={hatchThickness}
                              hatchLineColor={hatchLineColor}
                              hatchBgColorMode={hatchBgColorMode}
                              hatchBgColorCustom={hatchBgColorCustom}
                              hatchPatternMode={hatchPatternMode}
                              parentPivot={[px, py, pz]}
                              parentRotation={[rx, ry, rz]}
                            />
                          );
                        } else if (e.bimType === 'room' || e.bimType === 'element') {
                          return (
                            <Room 
                              renderMode={e.bimRenderMode}
                              isLinear={e.isLinear}
                              points={points} 
                              holes={e.holes}
                              height={heightValue} 
                              width={e.bimWidth || e.width}
                              color={color} 
                              name={e.bimName}
                              baseZ={baseZ}
                              bimFamilyId={e.bimFamilyId || e.bimAreaType || e.bimFamily || e.bimName || ''}
                              renderingStyle={e.renderingStyle || e.bimData?.renderingStyle}
                              clippingPlanes={clippingPlanes}
                              opacity={entityOpacity}
                              globalOpacityMode={globalOpacityMode}
                              globalRoomOpacityVal={globalRoomOpacityVal}
                              globalWallOpacityVal={globalWallOpacityVal}
                              isSlicing={isSlicing}
                              slicingHeight={slicingHeight}
                              slicingMode={slicingMode}
                              windowThickness={windowThickness}
                              sectionHatchMode={sectionHatchMode}
                              perimeterThickness={perimeterThickness}
                              hatchDensity={hatchDensity}
                              hatchThickness={hatchThickness}
                              hatchLineColor={hatchLineColor}
                              hatchBgColorMode={hatchBgColorMode}
                              hatchBgColorCustom={hatchBgColorCustom}
                              hatchPatternMode={hatchPatternMode}
                              parentPivot={[px, py, pz]}
                              parentRotation={[rx, ry, rz]}
                              coincidentWallWidth={stackedOffsetInfo.baseWallWidth}
                              coincidentOffset={stackedOffsetInfo.offsetZ}
                              sideSign={(e as any).sideSign}
                              isFaceAligned={(e as any).isFaceAligned}
                              hasMantovana={e.hasMantovana}
                              mantovanaAngle={e.mantovanaAngle}
                              mantovanaHeight={e.mantovanaHeight}
                              isScaffoldLightweight={isScaffoldLightweight}
                              teloLato={(e as any).teloLato}
                              tavoleFermapiedeCount={(e as any).tavoleFermapiedeCount}
                            />
                          );
                        } else if (entity.bimType === 'door' || entity.bimType === 'window') {
                          return <BIMSymbol entity={{ ...entity, color, isHovered }} clippingPlanes={clippingPlanes} opacity={entityOpacity} />;
                        }
                        return null;
                      })()}
                    </group>
                  </group>
                  {/* isHovered && <Edges color="cyan" /> */}
                </group>
              );
            })}
          </group>
        </Canvas>
      </div>

      {/* Survey Sidebar */}
      <AnimatePresence>
        {isSurveyModeActive && (
          <motion.div
            initial={{ x: -400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -400, opacity: 0 }}
            className="absolute top-24 left-8 z-[70] w-72 bg-white/95 backdrop-blur-2xl rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.2)] border border-slate-100 flex flex-col max-h-[75vh]"
          >
            <div className="p-5 flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-100">
                    <Activity size={18} />
                  </div>
                  <h3 className="font-black text-slate-800 text-base tracking-tight">Rilievo BIM</h3>
                </div>
                <button onClick={() => setIsSurveyModeActive(false)} className="text-slate-300 hover:text-slate-600 transition-colors cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              {/* Selection Summary Badge */}
              {surveySelectedIds.size > 0 ? (
                <div className="mb-4 p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-100 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-indigo-100 uppercase tracking-widest">Selezionati</span>
                    <span className="text-sm font-black text-white">{surveySelectedIds.size} Elementi</span>
                  </div>
                  <button 
                    onClick={() => {
                      const firstId = Array.from(surveySelectedIds)[0];
                      const target = entities.find(e => e.id === firstId);
                      if (target) {
                        setSurveyTargetEntity(target);
                        setIsSurveyDialogOpen(true);
                      }
                    }}
                    className="bg-white text-indigo-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase hover:bg-indigo-50 transition-all active:scale-95 flex items-center gap-1.5"
                  >
                    <Link size={12} />
                    Associa Voce
                  </button>
                </div>
              ) : (
                <div className="mb-4 p-3 bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-1">
                   <Target size={16} className="text-slate-300" />
                   <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Clicca un elemento 3D</span>
                </div>
              )}

              <div className="space-y-4 flex-1 overflow-y-auto pr-1 scrollbar-thin">
              {/* Advanced BIM Tree (Albero BIM) */}
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-1 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Albero Progetto</span>
                    <span className="bg-indigo-100 text-indigo-600 text-[9px] px-2 py-0.5 rounded-full font-black">
                      {entities.filter(e => e.isBIM).length}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => {
                        const allBimIds = entities.filter(e => e.isBIM).map(e => e.id);
                        setSurveySelectedIds(new Set(allBimIds));
                      }}
                      className="text-[9px] font-black text-indigo-600 uppercase hover:underline"
                    >
                      Tutti
                    </button>
                    <button 
                      onClick={() => setSurveySelectedIds(new Set())}
                      className="text-[9px] font-black text-rose-500 uppercase hover:underline"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin space-y-2 pb-4">
                  {floors.map(floor => {
                    const floorEntities = entities.filter(ent => ent.isBIM && (ent as any).layer === floor.name);
                    const isExpanded = expandedNodes.has(floor.id);
                    const selectedInFloor = floorEntities.filter(ent => surveySelectedIds.has(ent.id)).length;
                    const allInFloorSelected = floorEntities.length > 0 && selectedInFloor === floorEntities.length;
                    
                    return (
                      <div key={floor.id} className="bg-slate-50/50 rounded-2xl border border-slate-100 overflow-hidden">
                        <div className="flex items-center px-3 py-2.5 hover:bg-slate-100 transition-colors group">
                          <button 
                            onClick={() => {
                              setExpandedNodes(prev => {
                                const next = new Set(prev);
                                if (next.has(floor.id)) next.delete(floor.id);
                                else next.add(floor.id);
                                return next;
                              });
                            }}
                            className="flex items-center gap-2 flex-1"
                          >
                            {isExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                            <Building size={14} className="text-amber-500" />
                            <span className="text-[11px] font-black text-slate-700">{floor.name.toUpperCase()}</span>
                          </button>
                          <div className="flex items-center gap-3">
                            {selectedInFloor > 0 && (
                              <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                                {selectedInFloor}
                              </span>
                            )}
                            <input 
                              type="checkbox"
                              checked={allInFloorSelected}
                              onChange={(e) => {
                                setSurveySelectedIds(prev => {
                                  const next = new Set(prev);
                                  floorEntities.forEach(ent => {
                                    if (e.target.checked) next.add(ent.id);
                                    else next.delete(ent.id);
                                  });
                                  return next;
                                });
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          </div>
                        </div>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }} 
                              animate={{ height: 'auto', opacity: 1 }} 
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden bg-white/50 border-t border-slate-100/50"
                            >
                              <div className="py-1 px-4 space-y-1">
                                {Array.from(new Set(floorEntities.map(ent => (ent as any).bimFamily || (ent as any).bimAreaType || 'Altri'))).sort().map(cat => {
                                  const catEntities = floorEntities.filter(ent => ((ent as any).bimFamily || (ent as any).bimAreaType || 'Altri') === cat);
                                  const displayCat = BIM_FAMILIES.find(f => f.id === cat)?.name || cat;
                                  
                                  const isCatExpanded = expandedNodes.has(`${floor.id}-${cat}`);
                                  const selectedInCat = catEntities.filter(ent => surveySelectedIds.has(ent.id)).length;
                                  const allInCatSelected = catEntities.length > 0 && selectedInCat === catEntities.length;
                                  
                                  return (
                                    <div key={cat} className="space-y-0.5">
                                      <div className="flex items-center px-2 py-1.5 hover:bg-indigo-50/50 rounded-xl transition-colors">
                                        <button 
                                          onClick={() => {
                                            setExpandedNodes(prev => {
                                              const next = new Set(prev);
                                              const key = `${floor.id}-${cat}`;
                                              if (next.has(key)) next.delete(key);
                                              else next.add(key);
                                              return next;
                                            });
                                          }}
                                          className="flex items-center gap-2 flex-1"
                                        >
                                          {isCatExpanded ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
                                          <FolderTree size={12} className="text-indigo-400" />
                                          <span className="text-[10px] font-bold text-slate-600">{displayCat}</span>
                                        </button>
                                        <input 
                                          type="checkbox"
                                          checked={allInCatSelected}
                                          onChange={(e) => {
                                            setSurveySelectedIds(prev => {
                                              const next = new Set(prev);
                                              catEntities.forEach(ent => {
                                                if (e.target.checked) next.add(ent.id);
                                                else next.delete(ent.id);
                                              });
                                              return next;
                                            });
                                          }}
                                          className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 cursor-pointer"
                                        />
                                      </div>
                                      
                                      <AnimatePresence>
                                        {isCatExpanded && (
                                          <motion.div 
                                            initial={{ height: 0 }} 
                                            animate={{ height: 'auto' }} 
                                            exit={{ height: 0 }}
                                            className="overflow-hidden pl-6 space-y-0.5"
                                          >
                                            {catEntities.map(ent => (
                                              <div 
                                                key={ent.id} 
                                                className={`flex items-center justify-between p-1.5 rounded-lg border transition-all cursor-pointer ${
                                                  surveySelectedIds.has(ent.id) 
                                                    ? 'bg-indigo-50 border-indigo-100 shadow-sm' 
                                                    : 'bg-white border-transparent hover:border-slate-100'
                                                }`}
                                                onClick={() => {
                                                  setSurveySelectedIds(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(ent.id)) next.delete(ent.id);
                                                    else next.add(ent.id);
                                                    return next;
                                                  });
                                                }}
                                                onMouseEnter={() => setHoveredId(ent.id)}
                                                onMouseLeave={() => setHoveredId(null)}
                                              >
                                                <div className="flex items-center gap-2 truncate">
                                                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${!!(ent as any).cost_5d?.prezzarioCodice ? 'bg-green-500' : 'bg-slate-300'}`} />
                                                  <span className="text-[10px] font-medium text-slate-500 truncate">{(ent as any).bimName || 'Elemento'}</span>
                                                </div>
                                                <div className={`w-3 h-3 rounded border flex items-center justify-center transition-colors ${
                                                  surveySelectedIds.has(ent.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 bg-white'
                                                }`}>
                                                  {surveySelectedIds.has(ent.id) && <Check size={8} />}
                                                </div>
                                              </div>
                                            ))}
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Area */}
              <div className="mt-auto pt-4 border-t border-slate-100">
                {surveySelectedIds.size > 0 ? (
                  <button 
                    onClick={() => {
                      const firstId = Array.from(surveySelectedIds)[0];
                      const target = entities.find(e => e.id === firstId);
                      if (target) {
                        setSurveyTargetEntity(target);
                        setIsSurveyDialogOpen(true);
                      }
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl shadow-xl shadow-indigo-200 transition-all active:scale-[0.98] flex items-center justify-center gap-3 group"
                  >
                    <div className="flex flex-col items-start">
                      <span className="text-[8px] font-black text-indigo-200 uppercase tracking-[0.2em]">Associa Lavorazione</span>
                      <span className="text-xs font-black uppercase tracking-tight">{surveySelectedIds.size} Elementi Selezionati</span>
                    </div>
                    <Link size={18} className="group-hover:rotate-45 transition-transform duration-300" />
                  </button>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-relaxed">
                      Seleziona gli elementi dall'albero o clicca il 3D per iniziare il rilievo
                    </p>
                  </div>
                )}
              </div>

              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* BIM Survey Dialog */}
      <AnimatePresence>
        {isSurveyDialogOpen && surveyTargetEntity && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 pb-4 border-b border-slate-50">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100">
                      <Target size={24} />
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-slate-800 tracking-tight">Rilievo Elemento</h2>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Configura Voce di Computo</p>
                    </div>
                  </div>
                  <button onClick={() => setIsSurveyDialogOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-3xl border border-slate-100 mb-6">
                  <div>
                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Nome</span>
                    <span className="block text-xs font-black text-slate-700">{(surveyTargetEntity as any).bimName || 'N/D'}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Gruppo</span>
                    <span className="block text-xs font-black text-slate-700">{(surveyTargetEntity as any).bimFamily || (surveyTargetEntity as any).bimAreaType || 'N/D'}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Piano</span>
                    <span className="block text-xs font-black text-slate-700">{(surveyTargetEntity as any).layer || 'N/D'}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Superficie/Volume</span>
                    <span className="block text-xs font-black text-slate-700">{(surveyTargetEntity as any).area?.toFixed(2) || '0.00'} {(surveyTargetEntity as any).bimAreaType === 'Solaio' ? 'mq' : 'mc'}</span>
                  </div>
                </div>

                <div className="space-y-3 overflow-y-auto max-h-[40vh] pr-2 scrollbar-thin">
                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block px-1">Seleziona Voce Prezzario</label>
                  {PREZZARIO_GECOLA.map(item => (
                    <button
                      key={item.codice}
                      onClick={() => {
                        setEntities((prev: Entity[]) => prev.map(ent => {
                          if (surveySelectedIds.has(ent.id)) {
                            const updated = { ...ent } as any;
                            // Aggiorna metadati per riflettere il "Gruppo" (Categoria) e il nome nell'albero BIM
                            // Use code as default name if it doesn't have a meaningful one
                            if (!updated.bimName || updated.bimName.length > 50) {
                              updated.bimName = item.codice;
                            }
                            // Use category as group, fallback to current family name if no category
                            updated.bimFamily = item.categoria || updated.bimFamily;
                            updated.bimAreaType = item.categoria || updated.bimAreaType;
                            updated.bimSubFamily = item.codice;
                            
                            updated.cost_5d = {
                              ...updated.cost_5d,
                              prezzarioCodice: item.codice,
                              prezzarioDescrizione: item.descrizione,
                              prezzarioUnita: item.unita,
                              prezzarioPrezzo: item.prezzo,
                              incidenzaManodopera: item.incidenzaManodopera,
                              prezzarioNome: item.prezzario || 'GECOLA'
                            };
                            return updated;
                          }
                          return ent;
                        }));
                        onShowToast?.(`Voce ${item.codice} caricata su ${surveySelectedIds.size} elementi.`);
                        setIsSurveyDialogOpen(false);
                        setSurveySelectedIds(new Set());
                      }}
                      className="w-full text-left p-4 rounded-3xl border border-slate-100 bg-white hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-50 transition-all flex flex-col gap-1 group"
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-black text-indigo-600 font-mono group-hover:scale-110 transition-transform">{item.codice}</span>
                        <span className="text-xs font-black text-slate-800">{item.prezzo.toFixed(2)} €/{item.unita}</span>
                      </div>
                      <div className="text-sm font-bold text-slate-700 leading-tight">{item.descrizione}</div>
                      <div className="text-[10px] text-slate-400 font-medium italic mt-1">{item.categoria}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-8 bg-slate-50 flex items-center justify-between">
                <button 
                  onClick={() => setIsSurveyDialogOpen(false)}
                  className="px-6 py-3 font-black text-slate-400 hover:text-slate-600 transition-colors text-xs uppercase tracking-widest"
                >
                  Annulla
                </button>
                <div className="flex items-center gap-2 text-indigo-600">
                  <CheckCircle2 size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Pronto per il Rilievo</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Parameter Editing Dialogs */}
      {isAreaEditOpen && selectedEntity && (
        <BIMElementDialog
          isOpen={isAreaEditOpen}
          onClose={() => {
            setIsAreaEditOpen(false);
            setEditingEntityId(null);
          }}
          onConfirm={handleConfirmAreaEdit}
          isFaceSurveyMode={false}
          initialData={{
            familyId: (selectedEntity as any).bimFamilyId || (selectedEntity as any).bimAreaType || 'Fondazioni',
            subFamily: (selectedEntity as any).bimFamily || (selectedEntity as any).bimSubFamily || '',
            name: (selectedEntity as any).bimName || '',
            color: (selectedEntity as any).backgroundColor || selectedEntity.color || '#3b82f6',
            zPlane: (selectedEntity as any).bimZPlane || 0,
            zElevation: (selectedEntity as any).bimZElevation || 0,
            objectHeight: (selectedEntity as any).bimHeight || (selectedEntity as any).height || 270,
            objectWidth: (selectedEntity as any).bimWidth || (selectedEntity as any).width,
            hatch: (selectedEntity as any).bimHatchPattern || 'SOLID',
            bimRenderMode: (selectedEntity as any).bimRenderMode || 'solid',
            sideSign: (selectedEntity as any).sideSign
          }}
          onDelete={() => handleDeleteEntity(selectedEntity.id)}
          floors={floors}
          entities={entities}
          editingEntityId={selectedEntity?.id}
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
          lastWindowZElevation={(selectedEntity as any).bimZElevation ?? 100}
          lastWindowType={(selectedEntity as any).bimWindowType || 'singola'}
          lastWindowFlipLeft={!!(selectedEntity as any).bimFlip}
          lastWindowFlipSide={!!(selectedEntity as any).bimFlipSide}
          lastWindowRotation={(selectedEntity as any).bimRotation || 0}
          onConfirmWindow={handleConfirmWindowEdit}
          onDelete={() => handleDeleteEntity(selectedEntity.id)}
        />
      )}

      {showPropertyDialogId && (() => {
        const ent = entities.find(item => item.id === showPropertyDialogId);
        if (!ent) return null;
        return (
          <BIMPropertyCardDialog 
            key={ent.id}
            entity={ent}
            entities={entities}
            onClose={() => setShowPropertyDialogId(null)}
            onUpdateField={(id, field, value) => {
              setEntities((prevUps: Entity[]) => prevUps.map(x => x.id === id ? { ...x, [field]: value } as any : x));
              // Also update selectedEntity if it's currently selected
              if (selectedEntity && selectedEntity.id === id) {
                setSelectedEntity(prev => prev ? { ...prev, [field]: value } as any : null);
              }
            }}
          />
        );
      })()}

      {/* Selection Glow Indicator */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="w-16 h-16 border border-slate-300/20 rounded-full flex items-center justify-center">
          <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-ping" />
        </div>
      </div>

    </div>
  );
};


