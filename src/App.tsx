/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Document, Page, pdfjs } from 'react-pdf';
import { CADCanvas, getPaperSizeMm } from "./components/CADCanvas";
import { CanvasPDFPreview } from "./components/CanvasPDFPreview";
import { GecoAssistant } from "./components/GecoAssistant";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

import { RaccordoDialog } from "./components/RaccordoDialog";
import { DXFTextReaderDialog } from "./components/DXFTextReaderDialog";
import { LineEditorDialog } from "./components/LineEditorDialog";
import { LineEntity } from "./types";
import { TemplatePreview } from "./components/TemplatePreview";
import { BIMElementDialog, FinestreDialog, FloorManagerDialog } from "./components/BIMDialogs";
import { PriceListImporter } from "./components/PriceListImporter";
import { BIMDataAnalyzerDialog } from "./components/BIMDataAnalyzerDialog";
import { BIMTopBarControls } from "./components/BIMTopBarControls";
import { BIM3DViewer } from "./components/BIM3DViewer";
import { ParameterInputOverlay } from "./components/ParameterInputOverlay";
import { GecolaPrezzarioPanel } from "./components/GecolaPrezzarioPanel";
import { BIMWorkspacePanel } from "./components/BIMWorkspacePanel";
import { WorkspaceModeModal, WorkspaceMode } from "./components/WorkspaceModeModal";
import { TecnigrafoContextMenu } from "./components/TecnigrafoContextMenu";
import { TecnigrafoToolbar } from "./components/TecnigrafoToolbar";
import { TEMPLATES } from './data/templates';
import { GUIDE_DATABASE, GuideItem } from './data/guides';
import { PREZZARIO_GECOLA } from './data/prezzario';
import { Entity, Point, Layer, Measurement, Tavola, Floor, PrezzarioItem, BIMRenderingStyle } from "./types";
import { mergeAllSegments, splitLinesAtIntersections } from "./utils/entityUtils";
import { trimEntities } from "./utils/entityUtils";
import { parseScriptToEntities, updateScriptVariables } from "./utils/parametricParser";
import { contours } from "d3-contour";
import { simplifyPoints } from "./utils/simplify";
import polygonClipping from "polygon-clipping";
import {
  Bot,
  Minus,
  Circle,
  Square,
  MousePointer2,
  Eraser,
  Sparkles,
  MoveHorizontal,
  Scissors,
  Camera,
  Ruler,
  Move,
  DraftingCompass,
  History,
  Dot,
  Undo,
  Redo,
  Printer,
  Crosshair,
  Trash2,
  Link,
  Copy,
  Layers,
  Pen,
  PenTool,
  Pencil,
  Lightbulb,
  LightbulbOff,
  Snowflake,
  Plus,
  Check,
  Save,
  FolderOpen,
  Type,
  FileUp,
  Code,
  BookOpen,
  Grid,
  ExternalLink,
  X,
  Upload,
  FileSearch,
  Building,
  Lock,
  Home,
  Maximize2,
  Droplet,
  Zap,
  ChevronDown,
  ArrowDown,
  Clipboard,
  Target,
  Settings2,
  Maximize,
  RefreshCw,
  Sliders,
  Monitor,
  Compass
} from "lucide-react";

const RotateScaleIcon = ({ size = 16 }: { size?: number }) => (
  <div className="relative" style={{ width: size, height: size }}>
    <RefreshCw size={size} className="absolute inset-0" />
    <Maximize size={size * 0.6} className="absolute -top-1 -right-1 bg-white rounded-full p-0.5" />
  </div>
);

const ParallelIcon = ({ size = 16 }: { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M5 20L15 4" />
    <path d="M9 20L19 4" />
  </svg>
);

const MirrorIcon = ({ size = 16 }: { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M10 5L3 12L10 19V5Z" />
    <line x1="12" y1="2" x2="12" y2="22" strokeDasharray="3 3" />
    <path d="M14 5L21 12L14 19V5Z" strokeDasharray="2 2" />
  </svg>
);

const LiveMirrorIcon = ({ size = 16 }: { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M12 2v20" strokeDasharray="3 3" />
    <path d="M4 8h5a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4z" fill="currentColor" fillOpacity="0.15" />
    <path d="M20 8h-5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h5z" />
    <path d="M7 12h2" />
    <path d="M15 12h2" />
  </svg>
);

const FiloIcon = ({ size = 16 }: { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <line x1="3" y1="12" x2="21" y2="12" />
    <circle cx="3" cy="12" r="3" fill="currentColor" />
    <circle cx="21" cy="12" r="3" fill="currentColor" />
  </svg>
);

const RaccordoIcon = ({ size = 16 }: { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M4 20V12A8 8 0 0 1 12 4H20" />
    <circle cx="4" cy="20" r="1" fill="currentColor" />
    <circle cx="20" cy="4" r="1" fill="currentColor" />
  </svg>
);

const AllungaIcon = ({ size = 16 }: { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <line x1="4" y1="12" x2="14" y2="12" />
    <path d="M14 12h6" strokeDasharray="2 2" />
    <path d="M17 9l3 3-3 3" />
    <line x1="20" y1="6" x2="20" y2="18" stroke="currentColor" strokeWidth="1" />
  </svg>
);

const OrthoIcon = ({ size = 16 }: { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M5 5V19H19" />
    <circle cx="5" cy="5" r="1" fill="currentColor" />
    <circle cx="19" cy="19" r="1" fill="currentColor" />
    <path d="M5 19h5v-5H5" strokeWidth="1" strokeDasharray="2,2" />
  </svg>
);

const PolylineIcon = ({ size = 16, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="3,17 9,7 16,13 21,5" />
    <circle cx="3" cy="17" r="2.5" fill="currentColor" stroke="none" />
    <circle cx="9" cy="7" r="2.5" fill="currentColor" stroke="none" />
    <circle cx="16" cy="13" r="2.5" fill="currentColor" stroke="none" />
    <circle cx="21" cy="5" r="2.5" fill="currentColor" stroke="none" />
  </svg>
);

const rotatePoint = (point: { x: number; y: number }, center: { x: number; y: number }, angleDeg: number) => {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: center.y + dx * Math.sin(rad) + dy * Math.cos(rad)
  };
};

// Helper function to find a collective center for multiple IDs
const getSelectionCenter = (ids: string[], allEntities: Entity[]) => {
  const selection = allEntities.filter(e => ids.includes(e.id) && !e.parentEntityId);
  const finalSelection = selection.length > 0 ? selection : allEntities.filter(e => ids.includes(e.id));
  if (finalSelection.length === 0) return { x: 0, y: 0 };
  if (finalSelection.length === 1) return getEntityCenter(finalSelection[0]);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let hasGeometry = false;

  finalSelection.forEach(e => {
    const pts: Point[] = [];
    const entAsAny = e as any;
    if (entAsAny.start) pts.push(entAsAny.start, entAsAny.end);
    if (entAsAny.points) pts.push(...entAsAny.points);
    if (entAsAny.freehandPoints) pts.push(...entAsAny.freehandPoints);
    if (entAsAny.x !== undefined && entAsAny.y !== undefined) {
        pts.push({ x: entAsAny.x, y: entAsAny.y });
        if (entAsAny.width && entAsAny.height) {
            pts.push({ x: entAsAny.x + entAsAny.width, y: entAsAny.y + entAsAny.height });
        }
    }
    if (entAsAny.center) {
        const r = entAsAny.radius || 5;
        pts.push({ x: entAsAny.center.x - r, y: entAsAny.center.y - r });
        pts.push({ x: entAsAny.center.x + r, y: entAsAny.center.y + r });
    }
    if (entAsAny.point) pts.push(entAsAny.point);

    pts.forEach(p => {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        hasGeometry = true;
    });
  });

  return hasGeometry ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } : { x: 0, y: 0 };
};

// Helper to get the absolute bounding box center of any entity
const getEntityCenter = (e: any) => {
  if (e.start && e.end) return { x: (e.start.x + e.end.x) / 2, y: (e.start.y + e.end.y) / 2 };
  if (e.points && e.points.length > 0) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    e.points.forEach((p: any) => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  }
  if (e.freehandPoints && e.freehandPoints.length > 0) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    e.freehandPoints.forEach((p: any) => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  }
  if (e.x !== undefined && e.y !== undefined) {
    if (e.width !== undefined && e.height !== undefined) {
        return { x: e.x + e.width / 2, y: e.y + e.height / 2 };
    }
    return { x: e.x, y: e.y };
  }
  if (e.center) return e.center;
  if (e.point) return e.point;
  return { x: 0, y: 0 };
};

const rotateEntityFixed = (e: any, deltaAngle: number, center?: { x: number; y: number }) => {
  const rotationCenter = center || getEntityCenter(e);
  const nextAngle = (e.angle || 0) + deltaAngle;
  
  const rotated: any = { ...e, angle: nextAngle };
  
  if (e.start) rotated.start = rotatePoint(e.start, rotationCenter, deltaAngle);
  if (e.end) rotated.end = rotatePoint(e.end, rotationCenter, deltaAngle);
  if (e.points) rotated.points = e.points.map((p: any) => rotatePoint(p, rotationCenter, deltaAngle));
  if (e.freehandPoints) rotated.freehandPoints = e.freehandPoints.map((p: any) => rotatePoint(p, rotationCenter, deltaAngle));
  if (e.center) rotated.center = rotatePoint(e.center, rotationCenter, deltaAngle);
  if (e.point) rotated.point = rotatePoint(e.point, rotationCenter, deltaAngle);
  
  // Rectangles (x, y) rotate their top-left around center
  if (e.x !== undefined && e.y !== undefined && !e.start) {
      const p = rotatePoint({ x: e.x, y: e.y }, rotationCenter, deltaAngle);
      rotated.x = p.x;
      rotated.y = p.y;
  }

  // Specific BIM handling to ensure width doesn't skew
  if (e.isBIM && e.bimWidth && e.start && e.end && !center) {
    const rad = (nextAngle * Math.PI) / 180;
    const selfCenter = getEntityCenter(e);
    const hDx = Math.cos(rad) * (e.bimWidth / 2);
    const hDy = Math.sin(rad) * (e.bimWidth / 2);
    rotated.start = { x: selfCenter.x - hDx, y: selfCenter.y - hDy };
    rotated.end = { x: selfCenter.x + hDx, y: selfCenter.y + hDy };
  }
  
  return rotated;
};

const scaleEntity = (e: any, factor: number, nextScale: number, center?: { x: number; y: number }) => {
  const scalingCenter = center || getEntityCenter(e);
  const scaled: any = { ...e, scale: nextScale };
  
  const scalePoint = (p: { x: number; y: number }) => ({
    x: scalingCenter.x + (p.x - scalingCenter.x) * factor,
    y: scalingCenter.y + (p.y - scalingCenter.y) * factor
  });

  if (e.start) scaled.start = scalePoint(e.start);
  if (e.end) scaled.end = scalePoint(e.end);
  if (e.points) scaled.points = e.points.map((p: any) => scalePoint(p));
  if (e.freehandPoints) scaled.freehandPoints = e.freehandPoints.map((p: any) => scalePoint(p));
  if (e.center) scaled.center = scalePoint(e.center);
  if (e.point) scaled.point = scalePoint(e.point);
  
  if (e.x !== undefined && e.y !== undefined && !e.start) {
      const p = scalePoint({ x: e.x, y: e.y });
      scaled.x = p.x;
      scaled.y = p.y;
      if (e.width) scaled.width = e.width * factor;
      if (e.height) scaled.height = e.height * factor;
  }

  if (e.radius) scaled.radius = e.radius * factor;
  if (e.bimWidth) scaled.bimWidth = e.bimWidth * factor;
  
  return scaled;
};

export default function App() {
  const [selectedTool, setSelectedTool] = useState<string | null>(() => localStorage.getItem('selectedTool') || 'Select');
  const [previousTool, setPreviousTool] = useState<string | null>(null);
  const [quickActions, setQuickActions] = useState<{ ids: string[], pos: Point } | null>(null);
  const [capturedSelectionIds, setCapturedSelectionIds] = useState<string[]>([]);
  const [initialSelectedIds, setInitialSelectedIds] = useState<string[]>([]);
  useEffect(() => {
    if (selectedTool !== 'Select' && capturedSelectionIds.length > 0) {
      setInitialSelectedIds(capturedSelectionIds);
      setQuickActions(null);
    }
  }, [selectedTool]);

  useEffect(() => {
    if (selectedTool === 'Select' && !quickActions) {
      setCapturedSelectionIds([]);
    }
  }, [selectedTool, quickActions]);

  useEffect(() => {
    if (initialSelectedIds.length > 0) {
      const timer = setTimeout(() => setInitialSelectedIds([]), 100);
      return () => clearTimeout(timer);
    }
  }, [initialSelectedIds]);

  const [rotationEntityId, setRotationEntityId] = useState<string | null>(null);
  const [transformSelection, setTransformSelection] = useState<string[]>([]);
  const initialBaseEntitiesRef = useRef<Entity[] | null>(null);
  const [isRotateScaleOpen, setIsRotateScaleOpen] = useState(false);
  const [rotateFinishes, setRotateFinishes] = useState(true);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [savedLiveMirrorAxes, setSavedLiveMirrorAxes] = useState<{ start: Point; end: Point }[]>(() => {
    try {
      const saved = localStorage.getItem('gecola_live_mirror_axes');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [liveMirrorAxis, setLiveMirrorAxis] = useState<{ start: Point; end: Point } | null>(null);

  const handleUpdateLiveMirrorAxis = (axis: { start: Point; end: Point } | null) => {
    setLiveMirrorAxis(axis);
    if (axis) {
      setSavedLiveMirrorAxes(prev => {
        const exists = prev.some(a => 
          Math.hypot(a.start.x - axis.start.x, a.start.y - axis.start.y) < 5 &&
          Math.hypot(a.end.x - axis.end.x, a.end.y - axis.end.y) < 5
        );
        const updated = exists ? prev : [axis, ...prev].slice(0, 10);
        try {
          localStorage.setItem('gecola_live_mirror_axes', JSON.stringify(updated));
        } catch {}
        return updated;
      });
    }
  };

  useEffect(() => {
    if (rotationEntityId) {
      let baseIds: string[] = [];
      if (capturedSelectionIds.includes(rotationEntityId)) {
          baseIds = [...capturedSelectionIds];
      } else {
          const entity = entities.find(e => e.id === rotationEntityId);
          if (entity && (entity as any).groupId) {
              const groupIds = entities.filter(e => (e as any).groupId === (entity as any).groupId).map(e => e.id);
              baseIds = groupIds;
          } else {
              baseIds = [rotationEntityId];
          }
      }
      // Find all connected finishes that have parentEntityId referencing any of the selected items
      const connectedFinishes = entities.filter(e => e.parentEntityId && baseIds.includes(e.parentEntityId)).map(e => e.id);
      setTransformSelection([...baseIds, ...connectedFinishes]);
      initialBaseEntitiesRef.current = entities;
    } else {
      setTransformSelection([]);
      initialBaseEntitiesRef.current = null;
    }
  }, [rotationEntityId]);
  const appEntitiesRef = useRef<Entity[]>(entities);
  useEffect(() => {
    appEntitiesRef.current = entities;
  }, [entities]);
  const [layers, setLayers] = useState<Layer[]>(() => {
    const saved = localStorage.getItem('layers');
    return saved ? JSON.parse(saved) : [
      { id: "0", name: "0", visible: true, frozen: false },
      { id: "p1", name: "p1", visible: true, frozen: false },
      { id: "p2", name: "p2", visible: true, frozen: false },
      { id: "p4", name: "p4", visible: true, frozen: false },
      { id: "Maschere", name: "Maschere", visible: true, frozen: false },
      { id: "Misure", name: "Misure", visible: true, frozen: false },
      { id: "Spessori", name: "Spessori", visible: true, frozen: false },
      { id: "Hatch", name: "Hatch", visible: true, frozen: false },
    ];
  });
  const [activeLayerId, setActiveLayerId] = useState<string>(() => localStorage.getItem('activeLayerId') || "0");
  const [defaultLineStyle, setDefaultLineStyle] = useState<{
    color: string;
    lineWidth: number;
    dashed: boolean;
    lineType?: 'continuous' | 'dashed' | 'dotted' | 'dashdot' | 'dashdash';
    mode: 'ink' | 'pencil' | 'CAD';
  }>(() => {
    const saved = localStorage.getItem('defaultLineStyle');
    const parsed = saved ? JSON.parse(saved) : {};
    const initialMode = (parsed.mode === 'ink' || parsed.mode === 'pencil' || parsed.mode === 'CAD') 
      ? parsed.mode 
      : 'pencil';
    return {
      color: parsed.color || "#444444",
      lineWidth: parsed.lineWidth || 2,
      dashed: parsed.dashed || false,
      lineType: parsed.lineType || "continuous",
      mode: initialMode,
    };
  });

  const [defaultFiloColor, setDefaultFiloColor] = useState<string>(() => {
    return localStorage.getItem('defaultFiloColor') || '#ff5500';
  });
  const [defaultHatchStyle, setDefaultHatchStyle] = useState(() => {
    const saved = localStorage.getItem('defaultHatchStyle');
    return saved ? JSON.parse(saved) : {
      pattern: 'ANSI31',
      scale: 30,
      angle: 0,
      color: '#000000',
      sfumatura: 0,
    };
  });
  const [defaultTextStyle, setDefaultTextStyle] = useState(() => {
    const saved = localStorage.getItem('defaultTextStyle');
    return saved ? JSON.parse(saved) : {
      fontFamily: 'sans-serif',
      fontSize: 14,
      fontWeight: 'normal',
      textAlign: 'left' as 'left' | 'center' | 'right' | 'justify',
    };
  });
  const [eraserRadius, setEraserRadius] = useState(() => Number(localStorage.getItem('eraserRadius')) || 4);
  const [eraserType, setEraserType] = useState<'miracolo' | 'pencil' | 'all' | 'lametta'>(() => (localStorage.getItem('eraserType') as any) || 'miracolo');
  const [eraserIntensity, setEraserIntensity] = useState(() => Number(localStorage.getItem('eraserIntensity')) || 55);
  const [favoritePanels, setFavoritePanels] = useState<Array<{ id: string; tools: string[]; x: number; y: number; isDocked: 'left' | 'right' | 'top' | null }>>(() => {
    const saved = localStorage.getItem('favoritePanels');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.some((p: any) => p.id === 'fav-left' || p.id === 'fav-right' || p.id === 'fav-top')) {
          return parsed;
        }
      } catch (e) {
        // ignore
      }
    }
    return [
      { id: "fav-left", tools: ["Orto", "Tecnigrafo", "Polilinea"], x: 10, y: 150, isDocked: 'left' },
      { id: "fav-right", tools: ["SNAP", "Line", "Trim", "Eraser", "Cancella", "Move", "Copy", "Join"], x: 1200, y: 150, isDocked: 'right' },
      { id: "fav-top", tools: ["Specchio", "Hatch", "Raccordo"], x: 450, y: 80, isDocked: 'top' }
    ];
  });
  const [activeDraggingId, setActiveDraggingId] = useState<string | null>(null);
  const favoritesDragRef = useRef<{ isDragging: boolean; panelId: string; startX: number; startY: number; posX: number; posY: number } | null>(null);
  const [draggingToolName, setDraggingToolName] = useState<string | null>(null);
  const [draggingSource, setDraggingSource] = useState<string | null>(null);
  const [dragOverTool, setDragOverTool] = useState<{ panelId: string; toolName: string; position: 'before' | 'after' } | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
   const [isRaccordoDialogOpen, setIsRaccordoDialogOpen] = useState(false);
  const [isLineEditorOpen, setIsLineEditorOpen] = useState(false);
  const [selectedLine, setSelectedLine] = useState<LineEntity | null>(null);
  const [selectedLineClickPoint, setSelectedLineClickPoint] = useState<Point | null>(null);
  const [originalLine, setOriginalLine] = useState<LineEntity | null>(null);
  const [referenceLine, setReferenceLine] = useState<LineEntity | null>(null);
  const [isDXFTextReaderOpen, setIsDXFTextReaderOpen] = useState(false);
  const [selectedBIMSymbolType, setSelectedBIMSymbolType] = useState<string | null>(null);
  const [dimensionScale, setDimensionScale] = useState(() => parseFloat(localStorage.getItem('dimensionScale') || '1.0'));
  const [dimensionDecimals, setDimensionDecimals] = useState<number>(() => parseInt(localStorage.getItem('dimensionDecimals') || '2'));
  const [dimensionMode, setDimensionMode] = useState<'two-points' | 'chain'>(() => (localStorage.getItem('dimensionMode') as 'two-points' | 'chain') || 'two-points');
  const [dimensionStyle, setDimensionStyle] = useState<'linear' | 'aligned' | 'horizontal' | 'vertical' | 'auto-ortho'>(() => (localStorage.getItem('dimensionStyle') as any) || 'linear');
  const [selectionMode, setSelectionMode] = useState<'manual' | 'object'>(() => (localStorage.getItem('selectionMode') as 'manual' | 'object') || 'manual');

  useEffect(() => {
    localStorage.setItem('dimensionScale', dimensionScale.toString());
    localStorage.setItem('dimensionDecimals', dimensionDecimals.toString());
    localStorage.setItem('dimensionMode', dimensionMode);
    localStorage.setItem('dimensionStyle', dimensionStyle);
    localStorage.setItem('selectionMode', selectionMode);
    if (selectedTool !== 'RotateScale') {
        setRotationEntityId(null);
        setIsRotateScaleOpen(false);
    }
  }, [dimensionScale, dimensionDecimals, dimensionMode, dimensionStyle, selectionMode, selectedTool]);

  // BIM dedicated dialog states
  const [isBIMPorteOpen, setIsBIMPorteOpen] = useState(false);
  const [isBIMFinestreOpen, setIsBIMFinestreOpen] = useState(false);
  const [isBIMArrediOpen, setIsBIMArrediOpen] = useState(false);
  const [isBIMSanitariOpen, setIsBIMSanitariOpen] = useState(false);
  const [isBIMElettricoOpen, setIsBIMElettricoOpen] = useState(false);
  const [isBIMIdraulicoOpen, setIsBIMIdraulicoOpen] = useState(false);
  const [isBIMFinitureOpen, setIsBIMFinitureOpen] = useState(false);
  const [isRotateToolbarOpen, setIsRotateToolbarOpen] = useState(false);

  // BIM top bar reactive parameters
  const [bimWallThickness, setBimWallThickness] = useState<number | ''>(() => parseFloat(localStorage.getItem('lastWallThickness') || '15') || 15);
  const [bimWallHeight, setBimWallHeight] = useState<number | ''>(() => parseFloat(localStorage.getItem('lastWallHeight') || '270') || 270);
  const [bimWallRenderMode, setBimWallRenderMode] = useState<'solid' | 'transparent'>(() => (localStorage.getItem('lastWallRenderMode') as 'solid' | 'transparent') || 'solid');
  const [bimWallType, setBimWallType] = useState<string>(() => localStorage.getItem('lastWallType') || "Forati (Laterizio)");
  
const MASONRY_TYPES = [
  "Forati (Laterizio)", "Mattoni Pieni", "Blocchi di Cemento", "Calcestruzzo Cellulare",
  "Gasbeton", "Cartongesso", "Pietra Locale", "Blocchi Argilla Espansa",
  "Forati Alveolati", "Blocchi Insonorizzati", "Blocchi Sismici", "Pannelli Sandwich",
  "Blocchi Termici", "Blocchi Portanti", "Blocchi Faccia a Vista", "Blocchi Isolanti Grafite",
  "Blocchi Isolanti Sughero", "Blocchi Isolanti Lana Roccia", "Blocchi Isolanti Perlite", "Laterizio Porizzato"
];
  const [bimDoorWidth, setBimDoorWidth] = useState<number | ''>(() => parseFloat(localStorage.getItem('lastDoorWidth') || '80') || 80);
  const [bimDoorHeight, setBimDoorHeight] = useState<number | ''>(() => parseFloat(localStorage.getItem('lastDoorHeight') || '210') || 210);
  const [bimWindowWidth, setBimWindowWidth] = useState<number | ''>(() => parseFloat(localStorage.getItem('lastWindowWidth') || '120') || 120);
  const [bimWindowHeight, setBimWindowHeight] = useState<number | ''>(() => parseFloat(localStorage.getItem('lastWindowHeight') || '140') || 140);
  const [bimSymbolScale, setBimSymbolScale] = useState<number | ''>(() => parseFloat(localStorage.getItem('lastBIMSymbolScale') || '1') || 1);

  const [editingRaccordo, setEditingRaccordo] = useState<Entity | null>(null);
  const [raccordoConfig, setRaccordoConfig] = useState<{ type: 'curvo' | 'rettilineo' | 'taglia'; value: number }>({
    type: 'curvo',
    value: 10,
  });
  /* const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    isOpen: boolean;
  } | null>(null); */
  const [shortcutToast, setShortcutToast] = useState<string | null>(null);
  const [tavole, setTavole] = useState<Tavola[]>([
    { id: "tav1", name: "Tavola n. 1", format: "A4", scale: 100, unit: "cm", position: { x: -30, y: -20 }, visible: true, datiCartiglio: { progetto: "GECOLA BIM", titolo: "Tavola n. 1", autore: "Ing. Domenico Gimondo", data: "2026" } },
    { id: "tav2", name: "Tavola n. 2", format: "A3", scale: 100, unit: "cm", position: { x: 30, y: -20 }, visible: false, datiCartiglio: { progetto: "GECOLA BIM", titolo: "Tavola n. 2", autore: "Ing. Domenico Gimondo", data: "2026" } },
    { id: "tav3", name: "Tavola n. 3", format: "A2", scale: 200, unit: "cm", position: { x: -40, y: 30 }, visible: false, datiCartiglio: { progetto: "GECOLA BIM", titolo: "Tavola n. 3", autore: "Ing. Domenico Gimondo", data: "2026" } },
    { id: "tav4", name: "Tavola n. 4", format: "A1", scale: 500, unit: "cm", position: { x: 40, y: 30 }, visible: false, datiCartiglio: { progetto: "GECOLA BIM", titolo: "Tavola n. 4", autore: "Ing. Domenico Gimondo", data: "2026" } },
    { id: "tav5", name: "Tavola n. 5", format: "A0", scale: 1000, unit: "cm", position: { x: 0, y: 0 }, visible: false, datiCartiglio: { progetto: "GECOLA BIM", titolo: "Tavola n. 5", autore: "Ing. Domenico Gimondo", data: "2026" } },
  ]);

  const [floors, setFloors] = useState<Floor[]>(() => {
    const saved = localStorage.getItem("bim_floors");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Error parsing saved floors", e);
      }
    }
    return [
      { id: 'piano_4', name: 'Piano 4', elevation: 1200, type: 'fuori_terra' },
      { id: 'piano_3', name: 'Piano 3', elevation: 900, type: 'fuori_terra' },
      { id: 'piano_2', name: 'Piano 2', elevation: 600, type: 'fuori_terra' },
      { id: 'piano_1', name: 'Piano 1', elevation: 300, type: 'fuori_terra' },
      { id: 'piano_0', name: 'Piano 0', elevation: 0, type: 'fuori_terra' },
      { id: 'piano_-1', name: 'Piano -1', elevation: -300, type: 'interrato' },
      { id: 'piano_-2', name: 'Piano -2', elevation: -600, type: 'interrato' },
    ];
  });

  const [isFloorManagerOpen, setIsFloorManagerOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("bim_floors", JSON.stringify(floors));
  }, [floors]);

  const [activeSidebarTab, setActiveSidebarTab] = useState<'penne' | 'tavole' | 'layers' | 'maschere' | 'testo' | 'manuale' | 'bim'>(() => (localStorage.getItem('activeSidebarTab') as any) || 'penne');
  const [isBIMElementDialogOpen, setIsBIMElementDialogOpen] = useState(false);
  const [isFaceSurveyMode, setIsFaceSurveyMode] = useState(false);
  const [isMultiAreaMode, setIsMultiAreaMode] = useState(false);
  const [is3DViewOpen, setIs3DViewOpen] = useState(false);
  const [isStratifiedView, setIsStratifiedView] = useState(false);

  useEffect(() => {
    console.log("App: isStratifiedView changed to:", isStratifiedView);
  }, [isStratifiedView]);
  const [detectedAreaPoints, setDetectedAreaPoints] = useState<any>(null);
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [hoveredGuide, setHoveredGuide] = useState<GuideItem | null>(null);
  const [guideLockedBy, setGuideLockedBy] = useState<string | null>(null);
  const [showFloatingManual, setShowFloatingManual] = useState(false);
  
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingCartiglioTavolaId, setEditingCartiglioTavolaId] = useState<string | null>(null);
  const [doubleClickedTavolaId, setDoubleClickedTavolaId] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [activePreviewTavolaId, setActivePreviewTavolaId] = useState<string | null>(null);
  const [rulerStyle, setRulerStyle] = useState<"tecnigrafo" | "crosshair">(() => (localStorage.getItem('rulerStyle') as any) || "crosshair");
  const [orthoMode, setOrthoMode] = useState(() => localStorage.getItem('orthoMode') === 'true');
  const [isSnapActive, setIsSnapActive] = useState(() => localStorage.getItem('isSnapActive') !== 'false'); // Default to true
  const [isTecnigrafoActive, setIsTecnigrafoActive] = useState(false);
  const [isContinuousMode, setIsContinuousMode] = useState(false);
  const [isShiftOrFDown, setIsShiftOrFDown] = useState(false);
  const [isSnapOverrideDown, setIsSnapOverrideDown] = useState(false);
  const isJollyOrMagicKeyHeldRef = useRef(false);
  // SE TENGO PREMUTO BLOC FN RIMANE ATTIVO ORTO: ensure it stays active if either the button or the key is active
  const effectiveOrthoMode = orthoMode || isShiftOrFDown;
  const effectiveSnapActive = isSnapActive && !isSnapOverrideDown;
  
  // 3 Ambienti di Lavoro Principali: 'tecnigrafo' | 'bim' | 'computo'
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() => {
    return (localStorage.getItem('gecola_workspace_mode') as WorkspaceMode) || 'tecnigrafo';
  });
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(() => {
    return localStorage.getItem('gecola_hide_workspace_modal') !== 'true';
  });
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  const handleSelectWorkspaceMode = (mode: WorkspaceMode) => {
    setWorkspaceMode(mode);
    localStorage.setItem('gecola_workspace_mode', mode);
    if (mode === 'tecnigrafo') {
      setSelectedCategory('Disegno');
      setSelectedTool('Line');
      setIsPrezzarioOpen(false);
      setShowProperties(false);
      setIs3DViewOpen(false);
      setShortcutToast("📐 Modalità TECNIGRAFO attiva: solo 4 funzioni essenziali, massima velocità");
    } else if (mode === 'bim') {
      setSelectedCategory('BIM');
      setSelectedTool('Muro');
      setActiveSidebarTab('bim');
      setShowProperties(true);
      setShortcutToast("🏢 Modalità BIM ARCHITETTURA & 3D attiva");
    } else if (mode === 'computo') {
      setIsPrezzarioOpen(true);
      setShortcutToast("📊 Modalità COMPUTO METRICO ESTIMATIVO attiva");
    }
    setTimeout(() => setShortcutToast(null), 2500);
  };

  const [cancelTrigger, setCancelTrigger] = useState(0);
  const [parallelTrigger, setParallelTrigger] = useState(0);
  const [isOffsetAidActive, setIsOffsetAidActive] = useState(false);
  const [showProperties, setShowProperties] = useState(() => localStorage.getItem('showProperties') === 'true');
  const [selectedCategory, setSelectedCategory] = useState(() => {
    const saved = localStorage.getItem('selectedCategory');
    const mode = localStorage.getItem('gecola_workspace_mode') || 'tecnigrafo';
    if (mode === 'tecnigrafo') return 'Disegno';
    if (mode === 'bim') return 'BIM';
    return saved || 'Disegno';
  });
  const [isGecoOpen, setIsGecoOpen] = useState(false);
  const [isPrezzarioOpen, setIsPrezzarioOpen] = useState(() => {
    return localStorage.getItem('gecola_workspace_mode') === 'computo';
  });
  const [priceListImporterTargetFamily, setPriceListImporterTargetFamily] = useState<string | null>(null);
  const [justImportedItem, setJustImportedItem] = useState<PrezzarioItem | null>(null);
  const [isAnalyzerOpen, setIsAnalyzerOpen] = useState(false);
  const [lastInsertedParameter, setLastInsertedParameter] = useState<{ type: 'radius' | 'length' | 'thickness' | 'offset'; value: number; isLocked?: boolean; userSetAt?: number } | null>(() => {
    try {
      const saved = localStorage.getItem('lastInsertedParameter');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return { type: 'length', value: 1.0, isLocked: false };
  });

  const [insertedParameterHistory, setInsertedParameterHistory] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('insertedParameterHistory');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return [1.0, 2.0, 3.0, 5.0, 10.0];
  });

  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);

  const addToParameterHistory = (val: number) => {
    if (isNaN(val) || val <= 0) return;
    setInsertedParameterHistory(prev => {
      const filtered = prev.filter(v => Math.abs(v - val) > 0.001);
      const next = [val, ...filtered].slice(0, 25);
      try { localStorage.setItem('insertedParameterHistory', JSON.stringify(next)); } catch(e) {}
      return next;
    });
  };

  const handleSetLastInsertedParameter = (
    param: { type: 'radius' | 'length' | 'thickness' | 'offset'; value: number; isLocked?: boolean; userSetAt?: number; isAutoFromDrawing?: boolean } | null | ((prev: any) => any),
    isExplicitUserAction: boolean = true
  ) => {
    setLastInsertedParameter(prev => {
      const rawNext = typeof param === 'function' ? param(prev) : param;
      if (rawNext && rawNext.isAutoFromDrawing) {
          isExplicitUserAction = false;
      }
      if (rawNext) {
        if (prev?.isLocked && rawNext.isLocked === undefined) {
          return prev;
        }
        addToParameterHistory(rawNext.value);
        const userSetAt = (isExplicitUserAction && !rawNext.isAutoFromDrawing)
          ? Date.now() + Math.random()
          : (prev?.userSetAt || Date.now());
        const next = { ...rawNext, userSetAt };
        try { localStorage.setItem('lastInsertedParameter', JSON.stringify(next)); } catch(e) {}
        return next;
      }
      return rawNext;
    });
  };
  const [isParameterInputOpen, setIsParameterInputOpen] = useState(false);
  const [parameterInputPos, setParameterInputPos] = useState<{x: number, y: number}>(() => ({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 - 80 : 200,
    y: 140
  }));

  const updateEntityParameter = (id: string, type: 'length' | 'radius' | 'offset', value: number) => {
    setEntities(prev => prev.map(ent => {
        if (ent.id === id) {
            if (ent.type === 'line' && type === 'length') {
                const line = ent as any;
                const dx = line.end.x - line.start.x;
                const dy = line.end.y - line.start.y;
                const currentLen = Math.sqrt(dx*dx + dy*dy);
                if (currentLen === 0) return ent;
                const nx = dx / currentLen;
                const ny = dy / currentLen;
                return {
                    ...line,
                    end: {
                        x: line.start.x + nx * value * 100, // * 100 because user inputs meters, canvas is cm
                        y: line.start.y + ny * value * 100
                    }
                };
            } else if (ent.type === 'circle' && type === 'radius') {
                return {
                    ...ent,
                    radius: value * 100
                };
            } else if (ent.type === 'line' && type === 'offset' && referenceLine) {
                const line = ent as any;
                const refStart = referenceLine.start;
                const refEnd = referenceLine.end;
                const refDx = refEnd.x - refStart.x;
                const refDy = refEnd.y - refStart.y;
                const refLen = Math.sqrt(refDx * refDx + refDy * refDy);
                if (refLen === 0) return ent;
                
                // Normal vector to the reference line
                const nx = -refDy / refLen;
                const ny = refDx / refLen;
                
                // Distance of current line from reference line
                // Project (line.start - refStart) onto normal vector
                const v = { x: line.start.x - refStart.x, y: line.start.y - refStart.y };
                const currentDist = v.x * nx + v.y * ny;
                
                // Translation vector to reach desired distance
                const targetDist = value * 100; // * 100 for cm
                const distDiff = targetDist - currentDist;
                
                return {
                    ...line,
                    start: { x: line.start.x + nx * distDiff, y: line.start.y + ny * distDiff },
                    end: { x: line.end.x + nx * distDiff, y: line.end.y + ny * distDiff }
                };
            }
        }
        return ent;
    }));
  }

  const [dynamicPrezzario, setDynamicPrezzario] = useState<PrezzarioItem[]>(() => {
    const saved = localStorage.getItem('bim_custom_prezzario');
    const custom = saved ? JSON.parse(saved) : [];
    return [...PREZZARIO_GECOLA, ...custom];
  });

  const handleImportPriceList = (newItems: PrezzarioItem[]) => {
    const saved = localStorage.getItem('bim_custom_prezzario');
    const existingCustom = saved ? JSON.parse(saved) : [];
    const updatedCustom = [...existingCustom, ...newItems];
    localStorage.setItem('bim_custom_prezzario', JSON.stringify(updatedCustom));
    setDynamicPrezzario([...PREZZARIO_GECOLA, ...updatedCustom]);
    
    // Auto-assign as default for the target family
    newItems.forEach(it => {
      if (it.bimFamilyId && it.bimFamilyId !== 'GLOBAL' && it.bimFamilyId !== 'ESTRANEO') {
        const costObj = {
          prezzarioCodice: it.codice,
          prezzarioDescrizione: it.descrizione,
          prezzarioUnita: it.unita,
          prezzarioPrezzo: it.prezzo,
          incidenzaManodopera: it.incidenzaManodopera || 0,
          prezzarioNome: it.prezzario || 'Esterno',
        };
        localStorage.setItem('last_bim_cost_' + it.bimFamilyId, JSON.stringify(costObj));
      }
    });

    // Dispatch an event so BIMDialogs can update immediately if it's open on that family
    window.dispatchEvent(new Event('bim_cost_updated'));

    if (newItems.length > 0) {
      setJustImportedItem(newItems[0]);
    }

    setShortcutToast(`Importate ${newItems.length} voci nel catalogo! 📖`);
    setTimeout(() => setShortcutToast(null), 3000);
  };

  // File System State
  const [fileHandle, setFileHandle] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showDwgModal, setShowDwgModal] = useState(false);
  const [dwgFileName, setDwgFileName] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  const saveToHandle = async (handle: any) => {
    setIsSaving(true);
    try {
      const writable = await handle.createWritable();
      const stateToSave = {
        entities,
        layers,
        tavole,
        measurements,
        defaultLineStyle
      };
      await writable.write(JSON.stringify(stateToSave));
      await writable.close();
    } catch (err) {
      console.error("Failed to save to file:", err);
    } finally {
      // Short delay so the green dot is visible
      setTimeout(() => setIsSaving(false), 500); 
    }
  };

  useEffect(() => {
    if (!fileHandle) return;
    const timeoutId = setTimeout(() => {
      saveToHandle(fileHandle);
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [entities, fileHandle, layers, tavole, measurements]);

  // UI Persistence Effects
  useEffect(() => {
    localStorage.setItem('selectedTool', selectedTool || '');
    if (selectedTool === 'Dimension') {
      setShowProperties(true);
    }
  }, [selectedTool]);

  useEffect(() => {
    localStorage.setItem('layers', JSON.stringify(layers));
  }, [layers]);

  useEffect(() => {
    localStorage.setItem('activeLayerId', activeLayerId);
  }, [activeLayerId]);

  useEffect(() => {
    localStorage.setItem('defaultLineStyle', JSON.stringify(defaultLineStyle));
  }, [defaultLineStyle]);

  useEffect(() => {
    localStorage.setItem('defaultFiloColor', defaultFiloColor);
  }, [defaultFiloColor]);

  useEffect(() => {
    localStorage.setItem('defaultHatchStyle', JSON.stringify(defaultHatchStyle));
  }, [defaultHatchStyle]);

  useEffect(() => {
    localStorage.setItem('defaultTextStyle', JSON.stringify(defaultTextStyle));
  }, [defaultTextStyle]);

  useEffect(() => {
    localStorage.setItem('eraserRadius', eraserRadius.toString());
  }, [eraserRadius]);

  useEffect(() => {
    localStorage.setItem('eraserType', eraserType);
  }, [eraserType]);

  useEffect(() => {
    localStorage.setItem('eraserIntensity', eraserIntensity.toString());
  }, [eraserIntensity]);

  useEffect(() => {
    localStorage.setItem('favoritePanels', JSON.stringify(favoritePanels));
  }, [favoritePanels]);

  useEffect(() => {
    localStorage.setItem('activeSidebarTab', activeSidebarTab);
  }, [activeSidebarTab]);

  useEffect(() => {
    if (selectedTool === 'Line' || selectedTool === 'Circle' || selectedTool === 'Filo') {
      setActiveSidebarTab('penne');
      setShowProperties(true);
    }
  }, [selectedTool]);

  useEffect(() => {
    const requiredLayers = [
      { id: "0", name: "0", visible: true, frozen: false },
      { id: "Matita", name: "Matita / Disegni a matita", visible: true, frozen: false },
      { id: "p1", name: "p1", visible: true, frozen: false },
      { id: "p2", name: "p2", visible: true, frozen: false },
      { id: "p4", name: "p4", visible: true, frozen: false },
      { id: "Fili", name: "Fili di Riferimento / Lenza", visible: true, frozen: false },
      { id: "Maschere", name: "Maschere", visible: true, frozen: false },
      { id: "Misure", name: "Misure", visible: true, frozen: false },
      { id: "Spessori", name: "Spessori", visible: true, frozen: false },
      { id: "Hatch", name: "Hatch", visible: true, frozen: false },
      { id: "BIM_Muri", name: "BIM_Muri", visible: true, frozen: false },
      { id: "BIM_Porte", name: "BIM_Porte", visible: true, frozen: false },
      { id: "BIM_Finestre", name: "BIM_Finestre", visible: true, frozen: false },
      { id: "BIM_Arredi", name: "BIM_Arredi", visible: true, frozen: false },
      { id: "BIM_Sanitari", name: "BIM_Sanitari", visible: true, frozen: false },
      { id: "BIM_Impianti_Elettrici", name: "BIM_Impianti_Elettrici", visible: true, frozen: false },
      { id: "BIM_Impianti_Idraulici", name: "BIM_Impianti_Idraulici", visible: true, frozen: false },
      { id: "BIM_Finiture", name: "BIM_Finiture", visible: true, frozen: false },
      { id: "BIM_Legenda", name: "BIM_Legenda", visible: true, frozen: false },
    ];
    setLayers(prev => {
      const updated = [...prev];
      let changed = false;
      requiredLayers.forEach(rl => {
        if (!updated.some(l => l.id === rl.id || l.name === rl.name)) {
          updated.push(rl);
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, []);

  useEffect(() => {
    localStorage.setItem('rulerStyle', rulerStyle);
  }, [rulerStyle]);

  useEffect(() => {
    localStorage.setItem('orthoMode', orthoMode.toString());
  }, [orthoMode]);

  useEffect(() => {
    localStorage.setItem('isSnapActive', isSnapActive.toString());
  }, [isSnapActive]);

  useEffect(() => {
    localStorage.setItem('showProperties', showProperties.toString());
  }, [showProperties]);

  useEffect(() => {
    localStorage.setItem('selectedCategory', selectedCategory);
  }, [selectedCategory]);

  const handleOpenFile = async () => {
    try {
      if (!('showOpenFilePicker' in window)) {
        alert("Salvataggio in locale non supportato da questo browser.");
        return;
      }
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'File GECOLA CAD', accept: {'application/json': ['.gcad']} }],
      });
      const file = await handle.getFile();
      const contents = await file.text();
      const data = JSON.parse(contents);
      
      if (data.entities) setEntities(data.entities);
      if (data.layers) setLayers(data.layers);
      if (data.tavole) setTavole(data.tavole);
      if (data.measurements) setMeasurements(data.measurements);
      if (data.defaultLineStyle) setDefaultLineStyle(data.defaultLineStyle);
      
      setFileHandle(handle);
      setShortcutToast("File caricato!");
      setTimeout(() => setShortcutToast(null), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveAsFile = async () => {
    try {
      if (!('showSaveFilePicker' in window)) {
        alert("Salvataggio in locale non supportato da questo browser.");
        return;
      }
      const handle = await (window as any).showSaveFilePicker({
        types: [{ description: 'File GECOLA CAD', accept: {'application/json': ['.gcad']} }],
        suggestedName: 'progetto_gecolacad.gcad'
      });
      setFileHandle(handle);
      await saveToHandle(handle);
      setShortcutToast("Salvato con nome!");
      setTimeout(() => setShortcutToast(null), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleBIMElementDetected = (result: { points: Point[], holes?: Point[][], isLinear?: boolean, isJollyActive?: boolean }) => {
    if ((result.isJollyActive || isMultiAreaMode) && detectedAreaPoints) {
      let currentArr = [];
      if (Array.isArray(detectedAreaPoints)) {
          if (detectedAreaPoints.length > 0 && !('points' in detectedAreaPoints[0])) {
             // It's a Point[] (from legacy or single area)
             currentArr = [{ points: detectedAreaPoints }];
          } else {
             currentArr = [...detectedAreaPoints];
          }
      } else {
          currentArr = [detectedAreaPoints];
      }
      
      const getCenter = (pts: Point[]) => {
          if (!pts || pts.length === 0) return { x: 0, y: 0 };
          let cx = 0, cy = 0;
          pts.forEach(p => { cx += p.x; cy += p.y; });
          return { x: cx / pts.length, y: cy / pts.length };
      };
      const resCenter = getCenter(result.points);
      
      const existingIdx = currentArr.findIndex(a => {
         const ac = getCenter(a.points);
         return Math.sqrt((ac.x - resCenter.x)**2 + (ac.y - resCenter.y)**2) < 20;
      });
      
      if (existingIdx >= 0) {
          // Toggle off
          currentArr.splice(existingIdx, 1);
          setDetectedAreaPoints(currentArr.length > 0 ? currentArr : null);
          if (currentArr.length === 0) {
              setIsBIMElementDialogOpen(false);
          }
          setShortcutToast("Area rimossa dalla selezione! ➖");
      } else {
          // Toggle on
          currentArr.push(result);
          setDetectedAreaPoints(currentArr);
          setShortcutToast("Area aggiunta alla selezione! ➕");
      }
      setTimeout(() => setShortcutToast(null), 2000);
    } else {
      setDetectedAreaPoints([result]);
      setEditingEntityId(null);
      setIsFaceSurveyMode(false);
      setIsBIMElementDialogOpen(true);
    }
  };

  const handleEditBIMElement = (id: string) => {
    const ent = entities.find(e => e.id === id);
    if (!ent) return;
    
    setSelectedId(id);
    if ((ent as any).bimType === 'door') {
      setIsBIMPorteOpen(true);
    } else if ((ent as any).bimType === 'window') {
      setIsBIMFinestreOpen(true);
    } else {
      setDetectedAreaPoints({
        points: (ent as any).bimPoints || (ent as any).points || [],
        holes: (ent as any).holes,
        isLinear: (ent as any).isLinear
      });
      setEditingEntityId(id);
      setIsFaceSurveyMode(false);
      setIsBIMElementDialogOpen(true);
    }
  };

  const shiftPointsSuccessive = (original: any, otherEntities: any[], originalWidth: number): any => {
    let pts: { x: number; y: number }[] = [];
    let isRect = false;
    let isLine = false;
    
    if (original.type === 'rectangle') {
      isRect = true;
      pts = [
        original.p1,
        { x: original.p2.x, y: original.p1.y },
        original.p2,
        { x: original.p1.x, y: original.p2.y }
      ];
    } else if (original.type === 'line') {
      isLine = true;
      pts = [original.start, original.end];
    } else {
      pts = original.points || original.bimPoints || [];
    }

    if (pts.length < 2) return {};

    const pA = pts[0];
    const pB = pts[1];
    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    const L = Math.sqrt(dx * dx + dy * dy) || 1;
    
    const n1 = { x: -dy / L, y: dx / L };
    const n2 = { x: dy / L, y: -dx / L };
    
    const mid = { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 };
    const testDist = originalWidth + 15;
    const cand1 = { x: mid.x + n1.x * testDist, y: mid.y + n1.y * testDist };
    const cand2 = { x: mid.x + n2.x * testDist, y: mid.y + n2.y * testDist };
    
    let minDist1 = Infinity;
    let minDist2 = Infinity;
    
    for (const ent of otherEntities) {
      if (ent.id === original.id) continue;
      if (!ent.isBIM) continue;
      
      let entPts: { x: number; y: number }[] = [];
      if (ent.type === 'rectangle') {
        entPts = [ent.p1, ent.p2];
      } else if (ent.type === 'line') {
        entPts = [ent.start, ent.end];
      } else {
        entPts = ent.points || ent.bimPoints || [];
      }
      
      for (const pt of entPts) {
        const d1 = Math.sqrt((cand1.x - pt.x) ** 2 + (cand1.y - pt.y) ** 2);
        const d2 = Math.sqrt((cand2.x - pt.x) ** 2 + (cand2.y - pt.y) ** 2);
        if (d1 < minDist1) minDist1 = d1;
        if (d2 < minDist2) minDist2 = d2;
      }
    }
    
    const chosenNormal = (minDist1 >= minDist2) ? n1 : n2;
    const shiftAmount = (originalWidth / 2) + 0.5;
    const shiftX = chosenNormal.x * shiftAmount;
    const shiftY = chosenNormal.y * shiftAmount;
    
    if (isRect) {
      return {
        p1: { x: original.p1.x + shiftX, y: original.p1.y + shiftY },
        p2: { x: original.p2.x + shiftX, y: original.p2.y + shiftY }
      };
    } else if (isLine) {
      return {
        start: { x: original.start.x + shiftX, y: original.start.y + shiftY },
        end: { x: original.end.x + shiftX, y: original.end.y + shiftY }
      };
    } else {
      const shiftedPoints = pts.map(pt => ({
        x: pt.x + shiftX,
        y: pt.y + shiftY
      }));
      return {
        points: shiftedPoints,
        bimPoints: shiftedPoints
      };
    }
  };

  const handleConfirmBIMElement = (data: { 
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
    renderingStyle?: BIMRenderingStyle;
    duplicate?: boolean;
    overlay?: boolean;
    sideSign?: number;
    duplicateConnectedFinishes?: boolean;
    cost_5d?: any;
  }) => {
    if (!detectedAreaPoints) return;

    if (editingEntityId && !data.duplicate && !data.overlay) {
      // UPDATE EXISTING
      updateEntitiesWithHistory(prev => {
        const updated = prev.map(e => {
          if (e.id === editingEntityId) {
            return {
              ...e,
              bimFamily: data.subFamily || data.familyId,
              bimFamilyId: data.familyId,
              bimAreaType: data.familyId,
              bimSubFamily: data.subFamily || data.familyId,
              bimData: {
                ...((e as any).bimData || {}),
                renderingStyle: data.renderingStyle
              },
              renderingStyle: data.renderingStyle,
              bimName: data.cost_5d?.prezzarioDescrizione || data.name,
              backgroundColor: data.color,
              color: data.color,
              bimHatchPattern: data.hatch as any,
              pattern: data.hatch === 'NONE' ? 'SOLID' : data.hatch as any,
              bimHeight: data.objectHeight,
              height: data.objectHeight,
              bimWidth: data.objectWidth !== undefined ? data.objectWidth : e.bimWidth || e.width || 15,
              width: data.objectWidth !== undefined ? data.objectWidth : e.bimWidth || e.width || 15,
              bimZPlane: data.zPlane,
              bimZElevation: data.zElevation,
              bimRenderMode: data.bimRenderMode || 'solid',
              sideSign: data.sideSign !== undefined ? data.sideSign : (e as any).sideSign,
              cost_5d: data.cost_5d, // Save cost data
              prezzarioCodice: data.cost_5d?.prezzarioCodice,
              prezzarioDescrizione: data.cost_5d?.prezzarioDescrizione,
              prezzarioUnita: data.cost_5d?.prezzarioUnita,
              prezzarioPrezzo: data.cost_5d?.prezzarioPrezzo
            };
          }
          return e;
        });

        const parentEntity = updated.find(e => e.id === editingEntityId);
        if (parentEntity) {
          const parentZ = (parentEntity as any).bimZPlane || (parentEntity as any).zPlane || 0;
          const parentZElev = (parentEntity as any).bimZElevation || (parentEntity as any).zElevation || 0;
          const parentH = (parentEntity as any).bimHeight || (parentEntity as any).height || 0;

          return updated.map(e => {
            if ((e as any).parentEntityId === editingEntityId) {
              const isHorizontal = !!(e as any).isHorizontal;
              const normalY = (e as any).normalY ?? 0;
              const isTopFace = isHorizontal && normalY > 0.5;

              const calcZElev = isTopFace ? (parentZElev + parentH) : parentZElev;
              const calcHeight = isHorizontal ? (e.height || (e as any).bimHeight || 2) : parentH;

              return {
                ...e,
                bimZPlane: parentZ,
                zPlane: parentZ,
                bimZElevation: calcZElev,
                zElevation: calcZElev,
                bimHeight: calcHeight,
                height: calcHeight
              };
            }
            return e;
          });
        }
        return updated;
      });
      setShortcutToast(`Elemento ${data.name} e finiture collegate aggiornati ✅`);
    } else if (editingEntityId && (data.duplicate || data.overlay)) {
      // DUPLICATE/OVERLAY EXISTING
      updateEntitiesWithHistory(prev => {
        const original = prev.find(e => e.id === editingEntityId);
        if (!original) return prev;
        
        const originalWidth = data.objectWidth || original.bimWidth || original.width || 15;
        const finalWidth = data.overlay ? 1 : (originalWidth <= 60 ? Math.max(10, Math.round(originalWidth / 10) * 10) : originalWidth);

        const newElement: Entity = {
          ...original,
          id: `bim-elem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          bimFamily: data.subFamily || data.familyId,
          bimFamilyId: data.familyId,
          bimAreaType: data.familyId,
          bimSubFamily: data.subFamily || data.familyId,
          bimData: undefined,
          bimName: data.cost_5d?.prezzarioDescrizione || data.name,
          backgroundColor: data.color,
          color: data.color,
          bimHatchPattern: data.hatch as any,
          pattern: data.hatch === 'NONE' ? 'SOLID' : data.hatch as any,
          bimHeight: data.objectHeight,
          height: data.objectHeight,
          bimWidth: finalWidth,
          width: finalWidth,
          bimZPlane: data.zPlane,
          bimZElevation: data.zElevation + (data.overlay ? 0.1 : 0),
          bimRenderMode: data.bimRenderMode || 'solid',
          sideSign: data.sideSign !== undefined ? data.sideSign : (original as any).sideSign,
          cost_5d: data.cost_5d, // Save cost data
          prezzarioCodice: data.cost_5d?.prezzarioCodice,
          prezzarioDescrizione: data.cost_5d?.prezzarioDescrizione,
          prezzarioUnita: data.cost_5d?.prezzarioUnita,
          prezzarioPrezzo: data.cost_5d?.prezzarioPrezzo,
          timestamp: Date.now(),
          isOverlay: data.overlay,
          // Shift to imply "successive" position
          ...(data.overlay ? shiftPointsSuccessive(original, prev, originalWidth) : {})
        } as any;
        console.log("New element created, original:", original.id, "newElement:", newElement.id, "Overlay:", data.overlay);
        
        let extraElements: any[] = [];
        if (data.duplicate && data.duplicateConnectedFinishes) {
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
      setSelectedId(null);
      setShortcutToast(data.overlay ? `Elemento ${data.name} successiva 🎨` : `Elemento ${data.name} duplicato ⎘`);
    } else {
      // CREATE NEW
      let polys: any[] = [];
      if (Array.isArray(detectedAreaPoints)) {
          if (detectedAreaPoints.length > 0 && !('points' in detectedAreaPoints[0])) {
              polys = [{ points: detectedAreaPoints }];
          } else {
              polys = detectedAreaPoints;
          }
      } else {
          polys = [detectedAreaPoints];
      }

      const newElements = polys.map((poly, idx) => ({
        id: `bim-elem-${Date.now()}-${idx}`,
        type: 'hatch', 
        points: poly.points,
        holes: poly.holes,
        isLinear: !!poly.isLinear,
        color: data.color || 'rgba(0,0,0,0.5)',
        strokeWidth: 1,
        layer: 'BIM_Elementi',
        isBIM: true,
        bimType: 'element',
        bimFamily: data.subFamily || data.familyId,
        bimFamilyId: data.familyId,
        bimAreaType: data.familyId,
        bimSubFamily: data.subFamily || data.familyId,
        bimName: data.cost_5d?.prezzarioDescrizione || 
                 (poly.parentBimName ? `${data.name} su ${poly.parentBimName}` : (polys.length > 1 ? `${data.name} ${idx + 1}` : data.name)),
        backgroundColor: data.color,
        bimHatchPattern: data.hatch as any,
        pattern: data.hatch === 'NONE' ? 'SOLID' : data.hatch as any,
        bimHeight: data.objectHeight,
        height: data.objectHeight,
        bimWidth: data.objectWidth !== undefined ? data.objectWidth : 15,
        width: data.objectWidth !== undefined ? data.objectWidth : 15,
        bimZPlane: data.zPlane,
        bimZElevation: data.zElevation,
        bimRenderMode: data.bimRenderMode || 'solid',
        renderingStyle: data.renderingStyle || 'none',
        sideSign: data.sideSign !== undefined ? data.sideSign : (poly.sideSign !== undefined ? poly.sideSign : 1),
        cost_5d: data.cost_5d, // Save cost data
        prezzarioCodice: data.cost_5d?.prezzarioCodice,
        prezzarioDescrizione: data.cost_5d?.prezzarioDescrizione,
        prezzarioUnita: data.cost_5d?.prezzarioUnita,
        prezzarioPrezzo: data.cost_5d?.prezzarioPrezzo,
        isFaceAligned: poly.isFaceAligned,
        rotationX: poly.rotationX !== undefined ? poly.rotationX : 0,
        rotationY: poly.rotationY !== undefined ? poly.rotationY : 0,
        rotationZ: poly.rotationZ !== undefined ? poly.rotationZ : 0,
        parentEntityId: poly.parentEntityId,
        timestamp: Date.now(),
        isVisible: true,
        isFrozen: false
      })) as any[];

      updateEntitiesWithHistory(prev => [...prev, ...newElements]);
      setShortcutToast(polys.length > 1 ? `${polys.length} Aree rilevate! ✅` : `Rilevato ${data.name} (${data.familyId}) ✅`);
    }
    
    setTimeout(() => setShortcutToast(null), 4000);
    setIsBIMElementDialogOpen(false);
    setIsFaceSurveyMode(false);
    setDetectedAreaPoints(null);
    setEditingEntityId(null);
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (extension === 'dxf') {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        try {
          const { parseDXF } = await import("./utils/dxfImport");
          const { entities: importedEntities, newLayers } = parseDXF(text, activeLayerId, layers);
          
          if (importedEntities.length === 0) {
            alert("Nessun elemento DXF supportato trovato nel file o formato non riconosciuto.");
            return;
          }

          if (newLayers.length > 0) {
            setLayers(prev => [...prev, ...newLayers]);
          }

          updateEntitiesWithHistory(prev => [...prev, ...importedEntities]);
          setShortcutToast(`Importati ${importedEntities.length} elementi CAD!`);
          setTimeout(() => setShortcutToast(null), 3000);
        } catch (err) {
          console.error(err);
          alert("Errore nel parsing del file DXF.");
        }
      };
      reader.readAsText(file);
    } else if (extension === 'dwg') {
      setDwgFileName(file.name);
      setShowDwgModal(true);
    } else if (
      file.type.startsWith('image/') || 
      file.type.startsWith('video/') || 
      file.type.startsWith('audio/') || 
      file.type === 'application/pdf' ||
      ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'ogg', 'mp3', 'wav', 'pdf'].includes(extension || '')
    ) {
      let mediaType: 'image' | 'video' | 'audio' | 'pdf' = 'image';
      if (file.type.startsWith('video/') || ['mp4', 'webm'].includes(extension || '')) mediaType = 'video';
      else if (file.type.startsWith('audio/') || ['mp3', 'wav', 'ogg'].includes(extension || '')) mediaType = 'audio';
      else if (file.type === 'application/pdf' || extension === 'pdf') mediaType = 'pdf';

      if (mediaType === 'pdf') {
         // Use pdf To image parser
         import("./utils/pdfToImage").then(async ({ renderPdfToImage }) => {
            const result = await renderPdfToImage(file);
            if (result && result.isSinglePage) {
               // Treat single page PDF as Image
               mediaType = 'image';
               const img = new Image();
               img.onload = () => {
                 const newEntity: any = {
                   id: Date.now().toString(),
                   type: 'image',
                   point: { x: 0, y: 0 },
                   width: img.width,
                   height: img.height,
                   src: result.src,
                   mediaType,
                   name: file.name,
                   layer: activeLayerId,
                   color: '#000000',
                   lineWidth: 1,
                   dashed: false,
                   mode: 'CAD'
                 };
                 const maxD = 600;
                 if (img.width > maxD || img.height > maxD) {
                    const scale = maxD / Math.max(img.width, img.height);
                    newEntity.width = img.width * scale;
                    newEntity.height = img.height * scale;
                 }
                 updateEntitiesWithHistory(prev => [...prev, newEntity]);
                 setShortcutToast(`${file.name} (1 pagina) importato come immagine!`);
                 setTimeout(() => setShortcutToast(null), 3000);
               };
               img.src = result.src;
            } else {
               // Multipage or failed to render: fallback to PDF reader or use DataURL
               const reader = new FileReader();
               reader.onload = (e) => {
                 const src = e.target?.result as string;
                 const newEntity: any = {
                   id: Date.now().toString(),
                   type: 'image',
                   point: { x: 0, y: 0 },
                   width: 500,
                   height: 700,
                   src,
                   mediaType: 'pdf',
                   name: file.name,
                   layer: activeLayerId,
                   color: '#000000',
                   lineWidth: 1,
                   dashed: false,
                   mode: 'CAD'
                 };
                 updateEntitiesWithHistory(prev => [...prev, newEntity]);
                 setShortcutToast(`${file.name} importato!`);
                 setTimeout(() => setShortcutToast(null), 3000);
               };
               reader.readAsDataURL(file);
            }
         }).catch(err => {
            console.error("Failed to load pdfToImage utility", err);
         });
         event.target.value = '';
         return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        
        let width = 200;
        let height = 200;
        
        if (mediaType === 'image') {
           const img = new Image();
           img.onload = () => {
             const newEntity: any = {
               id: Date.now().toString(),
               type: 'image',
               point: { x: 0, y: 0 },
               width: img.width,
               height: img.height,
               src,
               mediaType,
               name: file.name,
               layer: activeLayerId,
               color: '#000000',
               lineWidth: 1,
               dashed: false,
               mode: 'CAD'
             };
             // Calculate a reasonable scaled size
             const maxD = 600;
             if (img.width > maxD || img.height > maxD) {
                const scale = maxD / Math.max(img.width, img.height);
                newEntity.width = img.width * scale;
                newEntity.height = img.height * scale;
             }
             updateEntitiesWithHistory(prev => [...prev, newEntity]);
             setShortcutToast(`${file.name} importato!`);
             setTimeout(() => setShortcutToast(null), 3000);
           };
           img.src = src;
        } else {
           // For PDF, Video, Audio
           if (mediaType === 'pdf') { width = 500; height = 700; }
           else if (mediaType === 'video') { width = 640; height = 360; }
           else if (mediaType === 'audio') { width = 300; height = 50; }
           
           const newEntity: any = {
             id: Date.now().toString(),
             type: 'image',
             point: { x: 0, y: 0 },
             width,
             height,
             src,
             mediaType,
             name: file.name,
             layer: activeLayerId,
             color: '#000000',
             lineWidth: 1,
             dashed: false,
             mode: 'CAD'
           };
           updateEntitiesWithHistory(prev => [...prev, newEntity]);
           setShortcutToast(`${file.name} importato!`);
           setTimeout(() => setShortcutToast(null), 3000);
        }
      };
      reader.readAsDataURL(file);
    } else {
      alert("Formato non supportato. Selezionare .dxf, .dwg, Immagini, Video, Audio o PDF.");
    }
    
    // reset input so the same file can be imported again
    event.target.value = '';
  };


  const cadCanvasRef = useRef<any>(null);

  // Automatic Layer Selection based on style/pen
  // Pencil -> Matita layer
  // Ink, CAD -> p1, p2, p4
  useEffect(() => {
    let targetLayer: string | null = null;
    if (defaultLineStyle.mode === 'pencil') {
      targetLayer = "Matita";
    } else if (defaultLineStyle.mode === 'ink' || defaultLineStyle.mode === 'CAD') {
      if (defaultLineStyle.lineWidth === 0.25) targetLayer = "p1";
      else if (defaultLineStyle.lineWidth === 0.35) targetLayer = "p2";
      else if (defaultLineStyle.lineWidth >= 0.5) targetLayer = "p4";
    }

    if (targetLayer) {
      setActiveLayerId(targetLayer);
      
      // Ensure the activated layer is visible and unfrozen so the user's strokes don't vanish!
      setLayers(prev => {
        const idx = prev.findIndex(l => l.id === targetLayer);
        if (idx !== -1) {
          const l = prev[idx];
          if (!l.visible || l.frozen) {
            const updated = [...prev];
            updated[idx] = { ...l, visible: true, frozen: false };
            return updated;
          }
        }
        return prev;
      });
    }
  }, [defaultLineStyle.mode, defaultLineStyle.lineWidth, defaultLineStyle.color]);

  // Automatic "Fili" Layer activation when Filo tool is chosen
  useEffect(() => {
    if (selectedTool === 'Filo') {
      setActiveLayerId("Fili");
      setLayers(prev => {
        const idx = prev.findIndex(l => l.id === "Fili");
        if (idx !== -1) {
          const l = prev[idx];
          if (!l.visible || l.frozen) {
            const updated = [...prev];
            updated[idx] = { ...l, visible: true, frozen: false };
            return updated;
          }
        }
        return prev;
      });
    }
  }, [selectedTool]);

  // Gestione Appunti (Copy & Paste) per oggetti CAD, immagini e testi (Gecolacad 7.1)
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // Se l'utente sta scrivendo in un campo di testo o area, lascia fare al browser
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      e.preventDefault();
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      // 1. Controlla se ci sono files negli appunti (es. immagini copiate o screenshot)
      const files = clipboardData.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const src = event.target?.result as string;
              if (src) {
                const point = cadCanvasRef.current?.getCurrentMousePosition() || { x: 100, y: 100 };
                
                const img = new Image();
                img.onload = () => {
                  const ar = img.naturalWidth / img.naturalHeight || 1;
                  const defaultWidth = 300; // larghezza predefinita per inserimento CAD
                  const defaultHeight = defaultWidth / ar;

                  const newImageEntity: Entity = {
                    id: `img-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    type: 'image',
                    color: '#000000',
                    lineWidth: 1,
                    layer: activeLayerId,
                    point: { x: point.x - defaultWidth / 2, y: point.y - defaultHeight / 2 },
                    width: defaultWidth,
                    height: defaultHeight,
                    src: src,
                    name: file.name || 'Immagine Incollata',
                    angle: 0,
                    aspectRatio: ar,
                    opacity: 1
                  } as any;

                  setEntities(prev => {
                    commitToHistory(prev);
                    return [...prev, newImageEntity];
                  });

                  setShortcutToast("Immagine incollata nell'area di lavoro!");
                  setTimeout(() => setShortcutToast(null), 3000);
                };
                img.src = src;
              }
            };
            reader.readAsDataURL(file);
          }
        }
        return;
      }

      // 2. Controlla se c'è testo negli appunti (testo semplice o JSON serializzato del CAD)
      const text = clipboardData.getData('text');
      if (text) {
        try {
          if (text.startsWith('{"source":"gecolacad"') || (text.includes('"type":') && text.includes('"id":'))) {
            const data = JSON.parse(text);
            const entitiesToPaste: Entity[] = [];
            
            if (data.entities && Array.isArray(data.entities)) {
              entitiesToPaste.push(...data.entities);
            } else if (data.type && data.id) {
              entitiesToPaste.push(data);
            }

            if (entitiesToPaste.length > 0) {
              const point = cadCanvasRef.current?.getCurrentMousePosition() || { x: 100, y: 100 };
              
              // Calcola il rettangolo circoscritto (bounding box) per centrare il paste
              let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
              entitiesToPaste.forEach((ent: any) => {
                if (ent.type === 'line' || ent.type === 'dimension') {
                  if (ent.start && ent.end) {
                    minX = Math.min(minX, ent.start.x, ent.end.x);
                    maxX = Math.max(maxX, ent.start.x, ent.end.x);
                    minY = Math.min(minY, ent.start.y, ent.end.y);
                    maxY = Math.max(maxY, ent.start.y, ent.end.y);
                  }
                } else if (ent.type === 'circle' || ent.type === 'arc') {
                  if (ent.center) {
                    minX = Math.min(minX, ent.center.x - (ent.radius || 0));
                    maxX = Math.max(maxX, ent.center.x + (ent.radius || 0));
                    minY = Math.min(minY, ent.center.y - (ent.radius || 0));
                    maxY = Math.max(maxY, ent.center.y + (ent.radius || 0));
                  }
                } else if (ent.type === 'rectangle') {
                  if (ent.p1 && ent.p2) {
                    minX = Math.min(minX, ent.p1.x, ent.p2.x);
                    maxX = Math.max(maxX, ent.p1.x, ent.p2.x);
                    minY = Math.min(minY, ent.p1.y, ent.p2.y);
                    maxY = Math.max(maxY, ent.p1.y, ent.p2.y);
                  }
                } else if (ent.type === 'text' || ent.type === 'image') {
                  if (ent.point) {
                    const w = ent.width || 100;
                    const h = ent.height || 40;
                    minX = Math.min(minX, ent.point.x);
                    maxX = Math.max(maxX, ent.point.x + w);
                    minY = Math.min(minY, ent.point.y);
                    maxY = Math.max(maxY, ent.point.y + h);
                  }
                } else if (ent.type === 'hatch') {
                  if (ent.points && ent.points.length > 0) {
                    ent.points.forEach((p: Point) => {
                      minX = Math.min(minX, p.x);
                      maxX = Math.max(maxX, p.x);
                      minY = Math.min(minY, p.y);
                      maxY = Math.max(maxY, p.y);
                    });
                  }
                }
              });

              const center = (minX !== Infinity) ? {
                x: (minX + maxX) / 2,
                y: (minY + maxY) / 2
              } : { x: 100, y: 100 };

              const dx = point.x - center.x;
              const dy = point.y - center.y;

              const preparedEntities = entitiesToPaste.map((ent: any) => {
                const newId = `${ent.type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                let updated = { ...ent, id: newId, layer: activeLayerId };
                
                if (ent.point) {
                  updated.point = { x: ent.point.x + dx, y: ent.point.y + dy };
                }
                if (ent.center) {
                  updated.center = { x: ent.center.x + dx, y: ent.center.y + dy };
                }
                if (ent.start && ent.end) {
                  updated.start = { x: ent.start.x + dx, y: ent.start.y + dy };
                  updated.end = { x: ent.end.x + dx, y: ent.end.y + dy };
                }
                if (ent.p1 && ent.p2) {
                  updated.p1 = { x: ent.p1.x + dx, y: ent.p1.y + dy };
                  updated.p2 = { x: ent.p2.x + dx, y: ent.p2.y + dy };
                }
                if (ent.points) {
                  updated.points = ent.points.map((p: any) => ({ x: p.x + dx, y: p.y + dy }));
                }
                if (ent.bimPoints) {
                  updated.bimPoints = ent.bimPoints.map((p: any) => ({ x: p.x + dx, y: p.y + dy }));
                }
                if (ent.holes) {
                  updated.holes = ent.holes.map((hole: any[]) => hole.map((p: any) => ({ x: p.x + dx, y: p.y + dy })));
                }
                return updated;
              });

              setEntities(prev => {
                commitToHistory(prev);
                return [...prev, ...preparedEntities];
              });

              setShortcutToast(`Incollati ${preparedEntities.length} oggetti CAD nel disegno!`);
              setTimeout(() => setShortcutToast(null), 3000);
              return;
            }
          }
        } catch (err) {
          // Fallback a disegno del testo standard
        }

        // Se non è un oggetto CAD formattato, incolla come testo normale sul foglio
        const point = cadCanvasRef.current?.getCurrentMousePosition() || { x: 100, y: 100 };
        const newTextEntity: Entity = {
          id: `txt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          type: 'text',
          color: defaultLineStyle.color,
          lineWidth: 1,
          layer: activeLayerId,
          point: { ...point },
          text: text,
          fontFamily: defaultTextStyle.fontFamily,
          fontSize: defaultTextStyle.fontSize,
          fontWeight: defaultTextStyle.fontWeight,
          textAlign: defaultTextStyle.textAlign,
        };

        setEntities(prev => {
          commitToHistory(prev);
          return [...prev, newTextEntity];
        });

        setSelectedId(newTextEntity.id);
        setActiveSidebarTab('testo');
        
        setShortcutToast("Testo incollato nel disegno!");
        setTimeout(() => setShortcutToast(null), 3000);
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      if (!selectedId) return;
      const selectedEnt = entities.find(el => el.id === selectedId);
      if (selectedEnt) {
        e.preventDefault();
        const data = {
          source: "gecolacad",
          entities: [selectedEnt]
        };
        e.clipboardData?.setData('text/plain', JSON.stringify(data));
        setShortcutToast("Oggetto CAD copiato negli appunti!");
        setTimeout(() => setShortcutToast(null), 3000);
      }
    };

    window.addEventListener('paste', handlePaste);
    window.addEventListener('copy', handleCopy);
    return () => {
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('copy', handleCopy);
    };
  }, [entities, selectedId, activeLayerId, defaultLineStyle, defaultTextStyle]);

  const [toolboxPos, setToolboxPos] = useState(() => {
    const saved = localStorage.getItem('toolboxPos');
    return saved ? JSON.parse(saved) : { top: 16, right: 16 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, startTop: 0, startRight: 0 });

  const startDragging = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTop: toolboxPos.top,
      startRight: toolboxPos.right,
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = e.clientY - dragRef.current.startY;
      setToolboxPos({
        top: dragRef.current.startTop + deltaY,
        right: dragRef.current.startRight - deltaX,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      localStorage.setItem('toolboxPos', JSON.stringify(toolboxPos));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, toolboxPos]);

  const handleRightClickShortcut = (e: React.MouseEvent) => {
    // Se c'è il dialogo del raccordo aperto, il tasto destro applica
    if (isRaccordoDialogOpen) {
        const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
        window.dispatchEvent(ev);
        e.preventDefault();
        return;
    }

    // Se si sta usando la maschera/template, ruota al tasto destro
    if (selectedTool === 'Template') {
        const rotated = cadCanvasRef.current?.rotateMaskAtPoint(e);
        if (rotated) {
            e.preventDefault();
            return;
        }
    }

    // Mostra SEMPRE il menu rapido contestuale del Tecnigrafo al puntatore del mouse
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  const handleToolClick = (tool: string) => {
    const guide = GUIDE_DATABASE[tool];
    // Only show the floating help if the manual sidebar tab is ACTIVE or was already showing
    if (guide && (activeSidebarTab === 'manuale' || showFloatingManual)) {
      setHoveredGuide(guide);
      setGuideLockedBy(tool);
      setShowFloatingManual(true);
    } else {
      setShowFloatingManual(false);
      setHoveredGuide(null);
      setGuideLockedBy(null);
    }

           if (tool === "Raccordo") {
             setIsOffsetAidActive(false);
             setSelectedTool("Raccordo");
             // Non forzare l'apertura del dialog se è già aperto o se l'utente vuole solo usare il tool
             // Lo apriamo solo la prima volta o se cliccano di nuovo
             if (!isRaccordoDialogOpen) {
                 setIsRaccordoDialogOpen(true);
             }
             setShowProperties(false);
           } else if (tool === "Parallel") {
      if (isOffsetAidActive && selectedTool === "Parallel") {
        setIsOffsetAidActive(false);
        setSelectedTool("Line");
        setCancelTrigger(prev => prev + 1);
        setShortcutToast("Aiuto Offset: Disattivato");
        setTimeout(() => setShortcutToast(null), 1500);
      } else {
        setIsOffsetAidActive(true);
        setSelectedTool("Parallel");
        setCancelTrigger(prev => prev + 1);
        setParallelTrigger(prev => prev + 1);
        setShortcutToast("Offset & Aiuto Offset: Attivo 📐");
        setTimeout(() => setShortcutToast(null), 1500);
      }
      setShowProperties(false);
      setIsRaccordoDialogOpen(false);
    } else if (tool === "Penne") {
      setActiveSidebarTab('penne');
      setShowProperties(true);
      if (selectedTool === 'Hatch' || selectedTool === 'Specchio' || selectedTool === 'Dimension') {
        setSelectedTool('Select');
      }
    } else if (tool === "Maschere") {
      setIsOffsetAidActive(false);
      setActiveSidebarTab('maschere');
      setShowProperties(true);
      if (selectedTool === 'Template') {
        setSelectedTool('Select');
      }
    } else if (tool === "Orto") {
      setOrthoMode(prev => !prev);
    } else if (tool === "SNAP") {
      const next = !isSnapActive;
      setIsSnapActive(next);
      setShortcutToast(next ? "SNAP: Attivato 🟢" : "SNAP: Disattivato 🔴");
      setTimeout(() => setShortcutToast(null), 2000);
    } else if (tool === "Tecnigrafo") {
      const next = !isTecnigrafoActive;
      setIsTecnigrafoActive(next);
      if (next) {
        const event = new KeyboardEvent('keydown', { key: 'q', bubbles: true });
        document.dispatchEvent(event);
      } else {
        const event = new KeyboardEvent('keyup', { key: 'q', bubbles: true });
        document.dispatchEvent(event);
      }
    } else if (tool === "Polilinea") {
      const next = !isContinuousMode;
      setIsContinuousMode(next);
      if (next) {
        setOrthoMode(true);
        setSelectedTool('Line');
      }
      setCancelTrigger(prev => prev + 1);
    } else {
      setIsOffsetAidActive(tool === "Move" || tool === "Copy");
      setSelectedTool(tool);
      if (['Line', 'Muro', 'Filo', 'Rectangle'].includes(tool)) {
        handleSetLastInsertedParameter(prev => prev ? { ...prev, type: 'length' } : { type: 'length', value: 1.0 });
      } else if (tool === 'Circle') {
        handleSetLastInsertedParameter(prev => prev ? { ...prev, type: 'radius' } : { type: 'radius', value: 0.5 });
      }
      // Ensure the correct sidebar tab opens for specific tools as requested
      if (tool === 'Hatch' || tool === 'Line' || tool === 'Circle' || tool === 'Muro' || tool === 'Gomma') {
        setActiveSidebarTab('penne');
        setShowProperties(true);
      } else if (tool === 'Testo') {
        setActiveSidebarTab('testo');
        setShowProperties(true);
      } else if (tool === 'Dimension' || tool === 'Specchio') {
        setActiveSidebarTab('penne');
        setShowProperties(true);
      } else {
        // Close other function menus to free screen space
        setShowProperties(false);
        setIsRaccordoDialogOpen(false);
      }
    }
  };

  const handleGuideHover = (key: string) => {
    // Disable automatic popup on hover as requested
    // if (GUIDE_DATABASE[key]) {
    //   setHoveredGuide(GUIDE_DATABASE[key]);
    //   setGuideLockedBy(key);
    // }
  };

  const handleGuideClick = (key: string) => {
    if (guideLockedBy === key) {
      setHoveredGuide(null);
      setGuideLockedBy(null);
    }
  };

  const selectedEntity = entities.find((e) => e.id === selectedId);

  const updateEntity = (id: string, updates: Partial<Entity>) => {
    setEntities((prev) =>
      prev.map((e) => (e.id === id ? ({ ...e, ...updates } as Entity) : e)),
    );
  };

  const categories = [
    {
      name: "Seleziona",
      icon: MousePointer2,
      tools: [{ name: "Select", icon: MousePointer2 }],
    },
    {
      name: "Disegno",
      icon: DraftingCompass,
      tools: [
        { name: "SNAP", icon: Target },
        { name: "Line", icon: Minus },
        { name: "Filo", icon: FiloIcon },
        { name: "Muro", icon: Building },
        { name: "Circle", icon: Circle },
        { name: "Arc", icon: History },
        { name: "Hatch", icon: Grid },
        { name: "Specchio", icon: MirrorIcon },
        { name: "LiveMirror", icon: LiveMirrorIcon },
        { name: "Testo", icon: Type },
        { name: "Trim", icon: Scissors },
        { name: "Allunga", icon: AllungaIcon },
        { name: "Gomma", icon: Sparkles },
        { name: "Parallel", icon: ParallelIcon },
        { name: "RotateScale", icon: RotateScaleIcon },
        { name: "CopiaVideo", icon: Monitor },
        { name: "Join", icon: Link },
        { name: "Camera", icon: Camera },
        { name: "Raccordo", icon: RaccordoIcon },
        { name: "Move", icon: Move },
        { name: "Copy", icon: Copy },
        { name: "Dimension", icon: Ruler },
        { name: "Penne", icon: Pen },
        { name: "Maschere", icon: Square },
        { name: "Cancella", icon: Trash2 },
        { name: "Orto", icon: OrthoIcon },
        { name: "Tecnigrafo", icon: DraftingCompass },
        { name: "Polilinea", icon: PolylineIcon },
      ],
    },
  ];

  const handleFavoritesMouseDown = (e: React.MouseEvent, panelId: string) => {
    if ((e.target as HTMLElement).closest('button')) return;
    
    e.preventDefault();
    const panel = favoritePanels.find(p => p.id === panelId);
    if (!panel) return;

    setActiveDraggingId(panelId);

    // Bring this panel to top layer
    setFavoritePanels(prev => {
      const targetPanel = prev.find(p => p.id === panelId);
      if (!targetPanel) return prev;
      return [...prev.filter(p => p.id !== panelId), targetPanel];
    });

    favoritesDragRef.current = {
      isDragging: true,
      panelId: panelId,
      startX: e.clientX,
      startY: e.clientY,
      posX: panel.x,
      posY: panel.y
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!favoritesDragRef.current?.isDragging) return;
      const refData = favoritesDragRef.current;
      if (refData.panelId !== panelId) return;

      const dx = moveEvent.clientX - refData.startX;
      const dy = moveEvent.clientY - refData.startY;
      
      // We apply a very subtle damping factor to mouse moves to make dragging feel smooth and premium (rallentato/ammortizzato)
      const targetX = refData.posX + dx;
      const targetY = refData.posY + dy;

      let isDocked: 'left' | 'right' | 'top' | null = null;

      // Docking thresholds based on screen borders
      if (targetX < 45) {
        isDocked = 'left';
      } else if (window.innerWidth - moveEvent.clientX < 240) {
        isDocked = 'right';
      } else if (moveEvent.clientY < 180) {
        isDocked = 'top';
      }

      setFavoritePanels(prev => prev.map(p => {
        if (p.id === panelId) {
          return {
            ...p,
            x: isDocked === 'left' ? 0 : (isDocked === 'right' ? window.innerWidth - 65 : Math.max(10, Math.min(window.innerWidth - 100, targetX))),
            y: isDocked ? p.y : Math.max(50, Math.min(window.innerHeight - 200, targetY)),
            isDocked
          };
        }
        return p;
      }));
    };

    const handleMouseUp = () => {
      if (favoritesDragRef.current) {
        favoritesDragRef.current.isDragging = false;
      }
      setActiveDraggingId(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const getToolIcon = (name: string) => {
    for (const cat of categories) {
      const found = cat.tools.find(t => t.name === name);
      if (found) return found.icon;
    }
    return null;
  };

  // Undo/Redo
  const [history, setHistory] = useState<Entity[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const historyIndexRef = useRef(historyIndex);
  const historyRef = useRef(history);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const historyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const areEntitiesEqual = (list1: Entity[], list2: Entity[]) => {
    if (list1 === list2) return true;
    if (!list1 || !list2) return list1 === list2;
    if (list1.length !== list2.length) return false;
    for (let i = 0; i < list1.length; i++) {
      if (list1[i] !== list2[i]) {
        if (JSON.stringify(list1[i]) !== JSON.stringify(list2[i])) {
          return false;
        }
      }
    }
    return true;
  };

  const undo = () => {
    if (historyTimeoutRef.current) {
        clearTimeout(historyTimeoutRef.current);
        historyTimeoutRef.current = null;
    }
    
    let currentIdx = historyIndexRef.current;
    let currentHistory = historyRef.current;

    // Check if there are active uncommitted changes on the canvas
    if (!areEntitiesEqual(appEntitiesRef.current, currentHistory[currentIdx])) {
        // Push the uncommitted changes so Redo can bring them back
        const newHistory = currentHistory.slice(0, currentIdx + 1);
        newHistory.push(appEntitiesRef.current);
        historyRef.current = newHistory;
        setHistory(newHistory);
        
        // Now our history has the uncommitted state at currentIdx + 1.
        // A normal undo would step back to currentIdx.
        appEntitiesRef.current = currentHistory[currentIdx]; // Sync ref immediately
        setHistoryIndex(currentIdx);
        setEntities(currentHistory[currentIdx]);
        return;
    }

    if (currentIdx > 0) {
      const nextIdx = currentIdx - 1;
      historyIndexRef.current = nextIdx; // Update ref synchronously to prevent rapid click issues
      appEntitiesRef.current = currentHistory[nextIdx]; // Sync ref immediately
      setHistoryIndex(nextIdx);
      setEntities(currentHistory[nextIdx]);
    }
  };

  const redo = () => {
    if (historyTimeoutRef.current) {
        clearTimeout(historyTimeoutRef.current);
        historyTimeoutRef.current = null;
    }
    const currentIdx = historyIndexRef.current;
    const currentHistory = historyRef.current;
    if (currentIdx < currentHistory.length - 1) {
      const nextIdx = currentIdx + 1;
      historyIndexRef.current = nextIdx; // Update ref synchronously
      appEntitiesRef.current = currentHistory[nextIdx]; // Sync ref immediately
      setHistoryIndex(nextIdx);
      setEntities(currentHistory[nextIdx]);
    }
  };

  const updateEntitiesSilent = (
    newEntities: React.SetStateAction<Entity[]>,
  ) => {
    if (historyTimeoutRef.current) {
        clearTimeout(historyTimeoutRef.current);
        historyTimeoutRef.current = null;
    }
    setEntities((prev) => {
        const rawNext = typeof newEntities === "function" ? (newEntities as Function)(prev) : newEntities;
        return rawNext;
    });
  };

  const commitToHistory = (snapshotToSave?: Entity[]) => {
    if (historyTimeoutRef.current) {
        clearTimeout(historyTimeoutRef.current);
        historyTimeoutRef.current = null;
    }
    const targetSnapshot = snapshotToSave || entities;
    const currentIdx = historyIndexRef.current;
    const currentHistory = historyRef.current;
    const lastState = currentHistory[currentIdx];

    if (lastState && areEntitiesEqual(lastState, targetSnapshot)) {
      return; // Do not commit duplicates
    }

    setHistory((prevHistory) => {
      const newHistory = prevHistory.slice(0, currentIdx + 1);
      newHistory.push(targetSnapshot);
      historyRef.current = newHistory;
      return newHistory;
    });
    historyIndexRef.current = currentIdx + 1;
    setHistoryIndex((prevIndex) => prevIndex + 1);
  };

  const updateEntitiesWithHistory = (
    newEntities: React.SetStateAction<Entity[]>,
  ) => {
    if (historyTimeoutRef.current) {
        clearTimeout(historyTimeoutRef.current);
    }
    setEntities((prev) => {
      const rawNext =
        typeof newEntities === "function" ? (newEntities as Function)(prev) : newEntities;
      const next = rawNext;
      
      historyTimeoutRef.current = setTimeout(() => {
        const currentIdx = historyIndexRef.current;
        const currentHistory = historyRef.current;
        const lastState = currentHistory[currentIdx];

        if (lastState && areEntitiesEqual(lastState, next)) {
          historyTimeoutRef.current = null;
          return; // Do not commit duplicates
        }

        setHistory((prevHistory) => {
          const newHistory = prevHistory.slice(0, currentIdx + 1);
          newHistory.push(next);
          historyRef.current = newHistory;
          return newHistory;
        });
        historyIndexRef.current = currentIdx + 1;
        setHistoryIndex((prevIndex) => prevIndex + 1);
        historyTimeoutRef.current = null;
      }, 50);

      return next;
    });
  };

  // Auto-show properties when entity selected
  useEffect(() => {
    if (selectedId) setShowProperties(true);
  }, [selectedId]);

  const selectedCategoryTools =
    categories.find((c) => c.name === selectedCategory)?.tools || [];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shortcuts only if not in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();
      
      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        undo();
        return;
      } else if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      // Escape to reset
      if (e.key === 'Escape') {
        setIsOffsetAidActive(false);
        setSelectedTool('Select');
        setSelectedId(null);
        setCancelTrigger(prev => prev + 1);
        return;
      }

      // F8 to toggle ortho Mode
      if (e.key === 'F8') {
        e.preventDefault();
        setOrthoMode(prev => !prev);
        return;
      }

      // Tecnigrafo Core Tool Shortcuts
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (key === 'l') {
          e.preventDefault();
          setIsOffsetAidActive(false);
          setSelectedTool("Line");
          setShortcutToast("Strumento: Linea (Pennino) 📏");
          setTimeout(() => setShortcutToast(null), 1200);
        } else if (key === 'c') {
          e.preventDefault();
          setIsOffsetAidActive(false);
          setSelectedTool("Circle");
          setShortcutToast("Strumento: Cerchio ⭕ (C)");
          setTimeout(() => setShortcutToast(null), 1200);
        } else if (key === 'o') {
          e.preventDefault();
          setIsOffsetAidActive(true);
          setSelectedTool("Parallel");
          setParallelTrigger(prev => prev + 1);
          setShortcutToast("Strumento: Offset / Parallela 📐 (O)");
          setTimeout(() => setShortcutToast(null), 1200);
        } else if (key === 'd') {
          e.preventDefault();
          setIsOffsetAidActive(false);
          setSelectedTool("Dimension");
          setShortcutToast("Strumento: Misure / Quota 📏 (D)");
          setTimeout(() => setShortcutToast(null), 1200);
        } else if (key === 'r' || key === 'h') {
          e.preventDefault();
          setIsOffsetAidActive(false);
          setSelectedTool("Hatch");
          setShortcutToast("Strumento: Retini / Riempimento ▦ (R)");
          setTimeout(() => setShortcutToast(null), 1200);
        } else if (key === 'm') {
          e.preventDefault();
          setIsOffsetAidActive(true);
          setSelectedTool("Move");
          setShortcutToast("Strumento: Sposta Tutto ✋ (M)");
          setTimeout(() => setShortcutToast(null), 1200);
        } else if (key === 't') {
          e.preventDefault();
          setIsOffsetAidActive(false);
          setSelectedTool("Trim");
          setShortcutToast("Strumento: Forbice / Taglia ✂️ (T)");
          setTimeout(() => setShortcutToast(null), 1200);
        } else if (key === 'g') {
          e.preventDefault();
          setIsOffsetAidActive(false);
          setSelectedTool("Gomma");
          setShortcutToast("Strumento: Gomma / Cancella ✨ (G)");
          setTimeout(() => setShortcutToast(null), 1200);
        }
      }

      // Backslash or Pipe to activate Line tool
      if (e.key === '\\' || e.key === '|') {
        e.preventDefault();
        setIsOffsetAidActive(false);
        setSelectedCategory("Disegno");
        handleToolClick("Line");
        setSelectedTool("Line");
        setShortcutToast("Strumento: Linea (Pennino) 📏");
        setTimeout(() => setShortcutToast(null), 1200);
      }

      // BLOC FN (Shift / CapsLock / Bloc Maiusc / Fn / F):
      // - Se premuto mentre si tiene premuto Sposta Tutto (< >) o Copia Magica (Z), attiva il vincolo Orto
      // - Se premuto da solo (es. anche dalla modalità Forbice / Trim), va SEMPRE in modalità Linea oltre ad attivare Orto e Snap essenziali!
      const isBlocFnKey =
        e.key === 'Shift' ||
        e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight' ||
        e.key === 'CapsLock' ||
        e.code === 'CapsLock' ||
        e.keyCode === 20 ||
        (e as any).which === 20 ||
        e.key === 'Fn' ||
        e.code === 'Fn' ||
        e.key === 'FnLock' ||
        e.code === 'FnLock' ||
        e.key === 'ShiftLock' ||
        key === 'f';

      if (e.key === '<' || e.key === '>' || e.code === 'IntlBackslash' || e.key === 'Tab' || (key === 'z' && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        isJollyOrMagicKeyHeldRef.current = true;
        setIsOffsetAidActive(true);
      }

      if (isBlocFnKey) {
        setIsShiftOrFDown(true);
        if (!isJollyOrMagicKeyHeldRef.current && selectedTool !== "Line") {
          setSelectedCategory("Disegno");
          setSelectedTool("Line");
          setIsRaccordoDialogOpen(false);
          setShortcutToast("Strumento: Pennino (Linea) 📏");
          setTimeout(() => setShortcutToast(null), 1200);
        }
      }

      // Control to immediately activate Trim (Forbice) and stay active
      if (e.key === 'Control' && !e.repeat) {
        setIsOffsetAidActive(false);
        setSelectedTool('Trim');
        setShortcutToast("Strumento: Forbice (Taglia) ✂️");
        setTimeout(() => setShortcutToast(null), 1200);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = (e.key || '').toLowerCase();
      if (e.key === '<' || e.key === '>' || e.code === 'IntlBackslash' || e.key === 'Tab' || key === 'z') {
        isJollyOrMagicKeyHeldRef.current = false;
      }
      const isBlocFnKey =
        e.key === 'Shift' ||
        e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight' ||
        e.key === 'CapsLock' ||
        e.code === 'CapsLock' ||
        e.keyCode === 20 ||
        (e as any).which === 20 ||
        e.key === 'Fn' ||
        e.code === 'Fn' ||
        e.key === 'FnLock' ||
        e.code === 'FnLock' ||
        e.key === 'ShiftLock' ||
        key === 'f';
      if (isBlocFnKey) {
        setIsShiftOrFDown(false);
        if (!isJollyOrMagicKeyHeldRef.current && selectedTool !== "Line") {
          setSelectedCategory("Disegno");
          setSelectedTool("Line");
          setIsRaccordoDialogOpen(false);
          setShortcutToast("Strumento: Pennino (Linea) 📏");
          setTimeout(() => setShortcutToast(null), 1200);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [historyIndex, history, entities, selectedTool]); // Dependencies for shortcuts

  return (
    <div className="flex flex-col h-screen bg-neutral-100 text-neutral-900">
      {/* Ribbon */}
      <header className="h-14 border-b border-neutral-300 bg-white flex items-center justify-between px-2 select-none">
        
        {/* Brand & Mode Hub Opener */}
        <div className="flex items-center">
          <div 
            onClick={() => setIsWorkspaceModalOpen(true)}
            className="flex items-center px-3 py-1.5 rounded-lg bg-neutral-900 text-white cursor-pointer hover:bg-neutral-800 transition mr-2 shadow-xs group"
            title="Clicca per cambiare ambiente di lavoro"
          >
            <div className="flex items-center gap-2">
              {workspaceMode === 'tecnigrafo' ? (
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                  <Compass size={18} />
                </div>
              ) : workspaceMode === 'bim' ? (
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                  <Building size={18} />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                  <Clipboard size={18} />
                </div>
              )}
              <div className="flex flex-col">
                <span className="font-sans font-black tracking-wider text-xs whitespace-nowrap">
                  GECOLA <span className={workspaceMode === 'tecnigrafo' ? "text-amber-400" : workspaceMode === 'bim' ? "text-cyan-400" : "text-emerald-400"}>
                    {workspaceMode === 'tecnigrafo' ? "TECNIGRAFO" : workspaceMode === 'bim' ? "BIM 3D" : "COMPUTO"}
                  </span>
                </span>
                <span className="text-[9px] text-neutral-400 font-mono -mt-0.5">
                  {workspaceMode === 'tecnigrafo' ? "CAD Leggero & Essenziale" : workspaceMode === 'bim' ? "Modellazione Edile" : "Prezzario & Quadro Economico"}
                </span>
              </div>
            </div>
            {fileHandle && (
              <div className="ml-2 w-2 h-2 rounded-full bg-emerald-500" title="Auto-save attivo" />
            )}
          </div>

          {/* I 3 PULSANTI PRINCIPALI RICHIESTI: TECNIGRAFO, BIM & 3D, COMPUTO METRICO */}
          <div className="flex items-center bg-neutral-900 p-1 rounded-xl border border-neutral-700/80 shadow-inner">
            <button
              onClick={() => handleSelectWorkspaceMode('tecnigrafo')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                workspaceMode === 'tecnigrafo'
                  ? "bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/20 ring-1 ring-amber-400"
                  : "text-neutral-300 hover:text-white hover:bg-neutral-800"
              }`}
              title="1. Tecnigrafo: Disegno leggero, 4 funzioni essenziali, menu rapido tasto destro"
            >
              <Compass size={14} className={workspaceMode === 'tecnigrafo' ? "text-neutral-950" : "text-amber-400"} />
              <span>1. Tecnigrafo</span>
            </button>

            <button
              onClick={() => handleSelectWorkspaceMode('bim')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                workspaceMode === 'bim'
                  ? "bg-cyan-500 text-neutral-950 shadow-md shadow-cyan-500/20 ring-1 ring-cyan-400"
                  : "text-neutral-300 hover:text-white hover:bg-neutral-800"
              }`}
              title="2. BIM Completa: Muri parametrici, finestre, porte, solai e 3D Viewer"
            >
              <Building size={14} className={workspaceMode === 'bim' ? "text-neutral-950" : "text-cyan-400"} />
              <span>2. BIM & 3D</span>
            </button>

            <button
              onClick={() => handleSelectWorkspaceMode('computo')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                workspaceMode === 'computo'
                  ? "bg-emerald-500 text-neutral-950 shadow-md shadow-emerald-500/20 ring-1 ring-emerald-400"
                  : "text-neutral-300 hover:text-white hover:bg-neutral-800"
              }`}
              title="3. Computo Metrico: Prezzario Gecola, estrazione quantità e quadro economico"
            >
              <Clipboard size={14} className={workspaceMode === 'computo' ? "text-neutral-950" : "text-emerald-400"} />
              <span>3. Computo Metrico</span>
            </button>

            <button
              onClick={() => setIsWorkspaceModalOpen(true)}
              className="p-1.5 ml-1 text-neutral-400 hover:text-amber-300 hover:bg-neutral-800 rounded-lg transition"
              title="Apri Hub Ambienti (Selettore Completo)"
            >
              <Settings2 size={13} />
            </button>
          </div>
        </div>

        {/* Center / Mode-Specific Toolbar Elements */}
        <div className="flex items-center gap-1">
          {workspaceMode === 'bim' && (
            <>
              <button
                onClick={() => setIsFloorManagerOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-neutral-100 rounded text-neutral-700 text-xs font-semibold border border-neutral-200 transition"
                title="Gestione dei piani/livelli di progetto"
              >
                <Building size={15} className="text-indigo-600" />
                <span>Gestione Piani</span>
              </button>

              <button
                onClick={() => setIs3DViewOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-bold shadow-xs transition"
                title="Apri Visualizzatore 3D (Three.js & IFC)"
              >
                <Maximize2 size={14} />
                <span>Visualizzatore 3D</span>
              </button>
            </>
          )}

          {workspaceMode === 'computo' && (
            <button
              onClick={() => setIsPrezzarioOpen(!isPrezzarioOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition ${
                isPrezzarioOpen 
                  ? "bg-emerald-600 text-white shadow-xs" 
                  : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300"
              }`}
            >
              <Clipboard size={14} />
              <span>{isPrezzarioOpen ? "Computo Aperto" : "Apri Computo & Prezzario"}</span>
            </button>
          )}

          {/* Undo / Redo */}
          <div className="flex items-center px-1 gap-1 border-l border-neutral-300 ml-1">
            <button
              onClick={() => { handleGuideClick('Annulla'); undo(); }}
              onMouseEnter={() => handleGuideHover('Annulla')}
              title="Annulla (Ctrl+Z)"
              className="p-1.5 hover:bg-neutral-100 rounded text-neutral-600 hover:text-indigo-600 transition"
            >
              <Undo size={15} />
            </button>
            <button
              onClick={() => { handleGuideClick('Ripristina'); redo(); }}
              onMouseEnter={() => handleGuideHover('Ripristina')}
              title="Ripristina (Ctrl+Y)"
              className="p-1.5 hover:bg-neutral-100 rounded text-neutral-600 hover:text-indigo-600 transition"
            >
              <Redo size={15} />
            </button>
          </div>

          {/* Penne and Layers */}
          <button
            onClick={() => {
              handleGuideClick('Penne');
              if (activeSidebarTab === 'penne' && showProperties) {
                setShowProperties(false);
              } else {
                setActiveSidebarTab('penne');
                setShowProperties(true);
              }
            }}
            title="Impostazioni Penne & Spessori"
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs transition ${
              showProperties && activeSidebarTab === 'penne' ? "bg-indigo-50 text-indigo-700 font-bold" : "hover:bg-neutral-100 text-neutral-700"
            }`}
          >
            <Pen size={14} />
            <span>Penne</span>
          </button>

          {workspaceMode !== 'tecnigrafo' && (
            <button
              onClick={() => {
                handleGuideClick('Layers');
                if (activeSidebarTab === 'layers' && showProperties) {
                  setShowProperties(false);
                } else {
                  setActiveSidebarTab('layers');
                  setShowProperties(true);
                }
              }}
              title="Gestione Layer"
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs transition ${
                showProperties && activeSidebarTab === 'layers' ? "bg-indigo-50 text-indigo-700 font-bold" : "hover:bg-neutral-100 text-neutral-700"
              }`}
            >
              <Layers size={14} />
              <span>Layer</span>
            </button>
          )}

          {workspaceMode !== 'tecnigrafo' && (
            <button
              onClick={() => {
                handleGuideClick('Tavole CAD');
                if (activeSidebarTab === 'tavole' && showProperties) {
                  setShowProperties(false);
                } else {
                  setActiveSidebarTab('tavole');
                  setShowProperties(true);
                }
              }}
              title="Tavole da stampa (A0-A4)"
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs transition ${
                showProperties && activeSidebarTab === 'tavole' ? "bg-indigo-50 text-indigo-700 font-bold" : "hover:bg-neutral-100 text-neutral-700"
              }`}
            >
              <Layers size={14} />
              <span>Tavole</span>
            </button>
          )}
        </div>

        {/* Right side: File IO, Manual, Geco AI */}
        <div className="flex items-center gap-1.5">
          <button 
            onClick={() => { handleGuideClick('Apri'); handleOpenFile(); }}
            title="Apri file .gecola"
            className="flex items-center gap-1 px-2 py-1.5 hover:bg-neutral-100 rounded text-neutral-700 text-xs transition"
          >
            <FolderOpen size={14} />
            <span>Apri</span>
          </button>
          <button 
            onClick={() => { handleGuideClick('Salva'); handleSaveAsFile(); }}
            title="Salva file di lavoro"
            className="flex items-center gap-1 px-2 py-1.5 hover:bg-neutral-100 rounded text-neutral-700 text-xs transition"
          >
            <Save size={14} />
            <span>Salva</span>
          </button>
          <button
            onClick={async () => {
              handleGuideClick('Salva');
              const { exportDXF } = await import("./utils/dxfExport");
              exportDXF(entities, layers, "disegno.dxf");
            }}
            title="Esporta file DXF compatibile con AutoCAD/CAD"
            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded text-xs font-bold border border-blue-200 transition"
          >
            <span className="font-mono text-xs">DXF</span>
          </button>
          
          <button
            onClick={() => {
              if (activeSidebarTab === 'manuale' && showProperties) {
                setShowProperties(false);
                setShowFloatingManual(false);
              } else {
                setActiveSidebarTab('manuale');
                setShowProperties(true);
                setShowFloatingManual(true);
              }
            }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs transition ${
              showProperties && activeSidebarTab === 'manuale' ? "bg-emerald-50 text-emerald-800 font-bold" : "hover:bg-neutral-100 text-neutral-700"
            }`}
            title="Guida rapida e manuale operativo"
          >
            <BookOpen size={14} className={showProperties && activeSidebarTab === 'manuale' ? "text-emerald-600" : "text-neutral-500"} />
            <span>Manuale</span>
          </button>

          <button
            onClick={() => setIsGecoOpen(!isGecoOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold transition ${
              isGecoOpen ? "bg-emerald-100 text-emerald-800" : "hover:bg-neutral-100 text-emerald-700"
            }`}
            title="Assistente Geco AI"
          >
            <Bot size={15} className={isGecoOpen ? "text-emerald-600 animate-pulse" : "text-emerald-500"} />
            <span>Geco AI</span>
          </button>
        </div>

      </header>

      {/* Sub-toolbar (Adaptive depending on Workspace Mode) */}
      <div className={`h-11 border-b flex items-center px-4 gap-2 transition-colors ${
        workspaceMode === 'tecnigrafo' 
          ? 'bg-neutral-900 border-neutral-800 text-neutral-100' 
          : 'bg-white border-neutral-300'
      }`}>
        {workspaceMode === 'tecnigrafo' ? (
          <TecnigrafoToolbar
            selectedTool={selectedTool}
            onSelectTool={(tool) => handleToolClick(tool)}
            isOffsetAidActive={isOffsetAidActive}
            isSnapActive={effectiveSnapActive}
            onToggleSnap={() => setIsSnapActive(!isSnapActive)}
            orthoMode={effectiveOrthoMode}
            onToggleOrtho={() => setOrthoMode(!orthoMode)}
            onUndo={undo}
            onRedo={redo}
            onZoomFit={() => cadCanvasRef.current?.zoomFit?.()}
            defaultLineStyle={defaultLineStyle}
            onChangeLineStyle={(newStyle) => {
              setDefaultLineStyle(prev => ({ ...prev, ...newStyle }));
              if (selectedTool !== 'Line' && selectedTool !== 'Circle' && selectedTool !== 'Rectangle' && selectedTool !== 'Arc') {
                handleToolClick('Line');
              }
            }}
            onOpenPenne={() => {
              setActiveSidebarTab('penne');
              setShowProperties(true);
            }}
          />
        ) : workspaceMode === 'bim' || selectedCategory === "BIM" ? (
          <BIMTopBarControls
            selectedTool={selectedTool}
            setSelectedTool={setSelectedTool}
            selectedTemplateId={selectedTemplateId}
            setSelectedTemplateId={setSelectedTemplateId}
            selectedBIMSymbolType={selectedBIMSymbolType}
            setSelectedBIMSymbolType={setSelectedBIMSymbolType}
            cadCanvasRef={cadCanvasRef}
            defaultHatchStyle={defaultHatchStyle}
            setDefaultHatchStyle={setDefaultHatchStyle}
            bimWallThickness={bimWallThickness}
            setBimWallThickness={setBimWallThickness}
            bimWallHeight={bimWallHeight}
            setBimWallHeight={setBimWallHeight}
            bimDoorWidth={bimDoorWidth}
            setBimDoorWidth={setBimDoorWidth}
            bimDoorHeight={bimDoorHeight}
            setBimDoorHeight={setBimDoorHeight}
            bimWindowWidth={bimWindowWidth}
            setBimWindowWidth={setBimWindowWidth}
            bimWindowHeight={bimWindowHeight}
            setBimWindowHeight={setBimWindowHeight}
            bimSymbolScale={bimSymbolScale}
            setBimSymbolScale={(val) => {
              setBimSymbolScale(val);
              localStorage.setItem('lastBIMSymbolScale', val.toString());
            }}
            setIsBIMFinestreOpen={setIsBIMFinestreOpen}
            onOpen3DView={() => setIs3DViewOpen(true)}
            entities={entities}
            setEntities={updateEntitiesWithHistory}
            isStratifiedView={isStratifiedView}
            setIsStratifiedView={setIsStratifiedView}
          />
        ) : workspaceMode === 'computo' ? (
          <div className="flex items-center justify-between w-full text-xs">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                <Clipboard size={14} />
                Ambiente Computo Metrico & Prezzario Attivo
              </span>
              <span className="text-neutral-500">
                Disegna muri, finestre e quote per calcolare automaticamente il computo estimativo in tempo reale.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsAnalyzerOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded border border-indigo-200 font-semibold"
              >
                <FileSearch size={13} />
                <span>Carica Listino / Dati</span>
              </button>
              <button
                onClick={() => setIsPrezzarioOpen(true)}
                className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold shadow-xs"
              >
                <span>Visualizza Computo</span>
              </button>
            </div>
          </div>
        ) : (
          selectedCategoryTools.map((tool) => (
            <button
              key={tool.name}
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", tool.name);
                e.dataTransfer.setData("source", "toolbar");
                setDraggingToolName(tool.name);
                setDraggingSource("toolbar");
              }}
              onDragEnd={() => {
                setDraggingToolName(null);
                setDraggingSource(null);
                setDragOverTool(null);
              }}
              onMouseEnter={() => handleGuideHover(tool.name)}
              onClick={() => handleToolClick(tool.name)}
              className={`px-2 py-0.5 rounded flex items-center gap-1 text-xs cursor-grab active:cursor-grabbing border border-transparent transition-all hover:border-neutral-300 ${
                selectedTool === tool.name 
                  ? "bg-indigo-100 text-indigo-900 border border-indigo-300 font-bold shadow-xs" 
                  : "hover:bg-neutral-200"
              }`}
            >
              <tool.icon size={12} />
              {tool.name}
            </button>
          ))
        )}
        {selectedCategory === "Seleziona" && (
          <>
            <div className="h-4 w-[1px] bg-neutral-300 mx-1" />
            <span className="text-[11px] text-neutral-500 font-medium">
              Menu Righelli:
            </span>
            <button
              onClick={() => {
                handleGuideClick("Classico (Tecnigrafo)");
                setRulerStyle("tecnigrafo");
              }}
              onMouseEnter={() => handleGuideHover("Classico (Tecnigrafo)")}
              className={`px-2 py-0.5 rounded flex items-center gap-1 text-xs transition ${rulerStyle === "tecnigrafo" ? "bg-amber-100 text-amber-950 border border-amber-300 font-medium" : "hover:bg-neutral-200"}`}
            >
              <DraftingCompass size={12} />
              Classico (Tecnigrafo)
            </button>
            <button
              onClick={() => {
                handleGuideClick("Incrocio CAD");
                setRulerStyle("crosshair");
              }}
              onMouseEnter={() => handleGuideHover("Incrocio CAD")}
              className={`px-2 py-0.5 rounded flex items-center gap-1 text-xs transition ${rulerStyle === "crosshair" ? "bg-amber-100 text-amber-950 border border-amber-300 font-medium" : "hover:bg-neutral-200"}`}
            >
              <Crosshair size={12} />
              Incrocio CAD
            </button>
            <div className="h-4 w-[1px] bg-neutral-300 mx-1" />
            <span className="text-[11px] text-neutral-500 font-medium">
              Clipboard (Appunti):
            </span>
            <button
              onClick={async () => {
                if (selectedId) {
                  const selectedEnt = entities.find(el => el.id === selectedId);
                  if (selectedEnt) {
                    try {
                      const data = {
                        source: "gecolacad",
                        entities: [selectedEnt]
                      };
                      await navigator.clipboard.writeText(JSON.stringify(data));
                      setShortcutToast("Oggetto CAD copiato negli appunti!");
                      setTimeout(() => setShortcutToast(null), 3000);
                    } catch (err) {
                      setShortcutToast("Impossibile copiare. Usa Ctrl+C sul foglio!");
                      setTimeout(() => setShortcutToast(null), 3000);
                    }
                  }
                } else {
                  setShortcutToast("Seleziona prima un oggetto da copiare!");
                  setTimeout(() => setShortcutToast(null), 3000);
                }
              }}
              className="px-2 py-0.5 rounded flex items-center gap-1 text-xs transition bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-800"
              title="Copia l'oggetto CAD selezionato negli appunti (Ctrl+C)"
            >
              <Copy size={12} />
              Copia Oggetto
            </button>
            <button
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (text) {
                    const pasteEvent = new ClipboardEvent('paste', {
                      clipboardData: new DataTransfer()
                    });
                    pasteEvent.clipboardData?.setData('text', text);
                    window.dispatchEvent(pasteEvent);
                  } else {
                    setShortcutToast("Gli appunti sono vuoti!");
                    setTimeout(() => setShortcutToast(null), 3000);
                  }
                } catch (err) {
                  setShortcutToast("Premi Ctrl+V sul foglio per incollare testi, immagini o oggetti!");
                  setTimeout(() => setShortcutToast(null), 4000);
                }
              }}
              className="px-2 py-0.5 rounded flex items-center gap-1 text-xs transition bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-800"
              title="Incolla testi, immagini o oggetti CAD dagli appunti (Ctrl+V)"
            >
              <Clipboard size={12} />
              Incolla (Ctrl+V)
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => {
              const next = !isSnapActive;
              setIsSnapActive(next);
              setShortcutToast(next ? "SNAP: Attivato 🟢" : "SNAP: Disattivato 🔴");
              setTimeout(() => setShortcutToast(null), 2000);
            }}
            onMouseEnter={() => handleGuideHover("SNAP")}
            className={`px-2 py-0.5 rounded flex items-center gap-1 text-xs transition ${
              effectiveSnapActive 
                ? "bg-blue-600 text-white font-bold shadow" 
                : isSnapActive && isSnapOverrideDown
                ? "bg-amber-500 text-white font-bold shadow animate-pulse"
                : "hover:bg-neutral-200"
            }`}
            title="Attiva/Disattiva Snap Intelligente (Tieni premuto tasto < > per disattivare temporaneamente)"
          >
            <Target size={12} className={effectiveSnapActive ? "text-white" : "text-neutral-600"} />
            <span>Snap{isSnapOverrideDown ? " [Sospeso]" : ""}</span>
          </button>
          <button
            onClick={() => {
              handleGuideClick("Modo Orto");
              setOrthoMode(!orthoMode); // explicitly toggle the stored state, not the effective one
            }}
            onMouseEnter={() => handleGuideHover("Modo Orto")}
            className={`px-2 py-0.5 rounded flex items-center gap-1 text-xs transition ${
              effectiveOrthoMode 
                ? "bg-indigo-100 text-indigo-900 border border-indigo-300" 
                : "hover:bg-neutral-200"
            }`}
          >
            <OrthoIcon size={12} />
            <span>Ortho</span>
          </button>
          <button
            onClick={() => {
              const next = !isTecnigrafoActive;
              setIsTecnigrafoActive(next);
              if (next) {
                const event = new KeyboardEvent('keydown', { key: 'q', bubbles: true });
                document.dispatchEvent(event);
              } else {
                const event = new KeyboardEvent('keyup', { key: 'q', bubbles: true });
                document.dispatchEvent(event);
              }
            }}
            className={`px-2 py-0.5 rounded flex items-center gap-1 text-xs transition ${
              isTecnigrafoActive 
                ? "bg-amber-100 text-amber-900 border border-amber-300" 
                : "hover:bg-neutral-200"
            }`}
          >
            <DraftingCompass size={12} />
            <span>Tecnigrafo</span>
          </button>
          
          <button
            onClick={() => {
              const next = !isContinuousMode;
              setIsContinuousMode(next);
              // SE CLICCO SU BLOC FN DEVE SEMPRE ATTIVARSI LA LINEA
              if (next) {
                setOrthoMode(true);
              }
              setSelectedTool('Line');
              setSelectedCategory("Disegno");
              handleToolClick("Line");
              setCancelTrigger(prev => prev + 1);
            }}
            className={`px-2 py-0.5 rounded flex items-center gap-1 text-xs transition-all ${
              isContinuousMode 
                ? "bg-amber-100 text-amber-950 border border-amber-300 font-bold shadow-[0_0_8px_rgba(245,158,11,0.2)]" 
                : "hover:bg-neutral-200"
            }`}
            title="BLOC FN: Attiva modalità Polilinea e Orto"
          >
            <PolylineIcon size={12} className={isContinuousMode ? "text-amber-600" : ""} />
            <span className="font-bold">BLOC FN</span>
            <span className="text-[9px] opacity-60">Polilinea</span>
          </button>
          <div className="flex gap-1 rounded bg-neutral-200 p-0.5 items-center">
            <div className="flex items-center gap-1 border-r border-neutral-300 pr-2 mr-1">
                <span className="text-[9px] font-bold text-neutral-400">Quick:</span>
                <input
                    type="number"
                    className="w-16 h-6 rounded text-[10px] font-bold text-center border border-neutral-300 focus:outline-none focus:border-indigo-500"
                    placeholder="Val"
                    value={lastInsertedParameter?.value || ''}
                    onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && lastInsertedParameter) {
                            handleSetLastInsertedParameter({...lastInsertedParameter, value: val, isLocked: true});
                            if (selectedId) {
                                updateEntityParameter(selectedId, lastInsertedParameter.type as any, val);
                            }
                        }
                    }}
                />
                <span className="text-[9px] font-bold text-neutral-400">{lastInsertedParameter?.type || '-'}</span>
                
                <div className="relative inline-block text-left">
                  <button
                    type="button"
                    onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
                    className="bg-neutral-300 hover:bg-neutral-400 text-neutral-800 px-2 py-1 rounded text-[9px] font-bold flex items-center gap-1 transition-colors"
                    title="Elenco a cascata misure memorizzate"
                  >
                    <span>Misure ▾</span>
                  </button>
                  {showHistoryDropdown && (
                    <div className="absolute left-0 top-full mt-1 w-36 bg-white border border-neutral-300 rounded-lg shadow-xl py-1 z-[99999] max-h-48 overflow-y-auto">
                      <div className="px-2 py-1 text-[9px] font-bold text-neutral-400 border-b border-neutral-200">
                        Cronologia Misure
                      </div>
                      {insertedParameterHistory.map((histVal, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            handleSetLastInsertedParameter({
                              type: lastInsertedParameter?.type || 'length',
                              value: histVal,
                              isLocked: true
                            });
                            setShowHistoryDropdown(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-indigo-600 hover:text-white transition-colors flex items-center justify-between ${
                            lastInsertedParameter && Math.abs(lastInsertedParameter.value - histVal) < 0.001 ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-neutral-700'
                          }`}
                        >
                          <span>{histVal}</span>
                          <span className="text-[8px] opacity-60">cm</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (lastInsertedParameter) {
                      handleSetLastInsertedParameter({
                        ...lastInsertedParameter,
                        isLocked: !lastInsertedParameter.isLocked
                      });
                    }
                  }}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5 transition-colors ${
                    lastInsertedParameter?.isLocked 
                      ? 'bg-amber-500 text-slate-950 shadow-sm' 
                      : 'bg-neutral-300 text-neutral-600 hover:bg-neutral-400'
                  }`}
                  title={lastInsertedParameter?.isLocked ? "Snap uguali bloccato (clicca per sbloccare)" : "Snap uguali automatico (clicca per bloccare)"}
                >
                  {lastInsertedParameter?.isLocked ? '🔒 Bloccato' : '🔓 Libero'}
                </button>
            </div>
            <button
              onClick={() => {
                handleGuideClick("Penne");
                setDefaultLineStyle({ mode: 'CAD', color: '#000000', lineWidth: 1, dashed: false });
                setActiveSidebarTab('penne');
                setShowProperties(true);
                handleToolClick("Line");
              }}
              onMouseEnter={() => handleGuideHover("Penne")}
              className={`px-3 py-1 rounded text-[10px] font-bold ${defaultLineStyle.mode === 'CAD' ? 'bg-white shadow-sm font-extrabold text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}
            >
              CAD
            </button>
            <div className="flex items-center gap-1 border-l border-neutral-300 pl-2 ml-1">
              <span className="text-[9px] font-bold text-neutral-400 mr-1">Kina:</span>
              {[0.25, 0.5, 1, 2].map(w => (
                <button
                  key={w}
                  onClick={() => {
                    handleGuideClick("Penne");
                    setDefaultLineStyle({ mode: 'ink', color: '#000000', lineWidth: w, dashed: false });
                    setActiveSidebarTab('penne');
                    setShowProperties(true);
                    handleToolClick("Line");
                  }}
                  className={`w-7 h-6 rounded flex items-center justify-center text-[9px] font-black transition-all ${defaultLineStyle.mode === 'ink' && defaultLineStyle.lineWidth === w ? 'bg-indigo-600 text-white shadow-md scale-110' : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300'}`}
                >
                  {w}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 border-l border-neutral-300 pl-2 ml-1">
              <span className="text-[9px] font-bold text-neutral-400 mr-1">Matita:</span>
              {['2H', 'HB', '2B'].map(m => (
                <button
                  key={m}
                  onClick={() => {
                    handleGuideClick("Penne");
                    const color = m === '2H' ? '#bbbbbb' : (m === 'HB' ? '#444444' : '#111111');
                    const width = m === '2H' ? 1 : (m === 'HB' ? 2 : 3);
                    setDefaultLineStyle({ mode: 'pencil', color, lineWidth: width, dashed: false });
                    setActiveSidebarTab('penne');
                    setShowProperties(true);
                    handleToolClick("Line");
                  }}
                  className={`px-1.5 h-6 rounded flex items-center justify-center text-[9px] font-black transition-all ${defaultLineStyle.mode === 'pencil' && (m === '2H' ? defaultLineStyle.color === '#bbbbbb' : (m === 'HB' ? defaultLineStyle.color === '#444444' : defaultLineStyle.color === '#111111')) ? 'bg-amber-500 text-white shadow-md scale-110' : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden relative">
        <main
          className="flex-1 overflow-hidden relative"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const toolName = e.dataTransfer.getData("text/plain");
            const source = e.dataTransfer.getData("source");
            
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            if (toolName) {
              let isDocked: 'left' | 'right' | 'top' | null = null;
              let finalX = x;

              if (x < 50) {
                isDocked = 'left';
                finalX = 0;
              } else if (window.innerWidth - e.clientX < 240) {
                isDocked = 'right';
                finalX = window.innerWidth - 60;
              } else if (e.clientY < 185) {
                isDocked = 'top';
              }

              const newPanelId = `fav-${Date.now()}`;
              const newPanel = {
                id: newPanelId,
                tools: [toolName],
                x: isDocked === 'left' ? 0 : (isDocked === 'right' ? window.innerWidth - 65 : Math.max(10, x - 24)),
                y: Math.max(50, y - 24),
                isDocked
              };

              if (source && source.startsWith("favorites-")) {
                const sourcePanelId = source.replace("favorites-", "");
                setFavoritePanels(prev => {
                  const filtered = prev.map(p => {
                    if (p.id === sourcePanelId) {
                      return { ...p, tools: p.tools.filter(t => t !== toolName) };
                    }
                    return p;
                  }).filter(p => p.tools.length > 0);
                  return [...filtered, newPanel];
                });
              } else if (source === "toolbar") {
                setFavoritePanels(prev => [...prev, newPanel]);
              }
            }
          }}
        >
          {liveMirrorAxis && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-neutral-900/90 backdrop-blur-md border border-emerald-500/50 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></div>
              <div className="flex flex-col">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400">Simmetria Live Attiva</span>
                <span className="text-[10px] text-neutral-300">Disegno simmetrico in tempo reale attivo.</span>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => {
                    setSelectedTool('LiveMirror');
                    handleUpdateLiveMirrorAxis(null);
                  }}
                  className="px-2.5 py-1 text-[10px] font-bold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg border border-neutral-700 transition-all cursor-pointer"
                >
                  Cambia Asse
                </button>
                <button
                  onClick={() => handleUpdateLiveMirrorAxis(null)}
                  className="px-2.5 py-1 text-[10px] font-bold bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg border border-red-500/30 transition-all cursor-pointer"
                >
                  Disattiva
                </button>
              </div>
            </div>
          )}
           <div className="relative w-full h-full">
              {isParameterInputOpen && lastInsertedParameter && parameterInputPos && (
                 <ParameterInputOverlay 
                    type={lastInsertedParameter.type} 
                    value={lastInsertedParameter.value}
                    position={parameterInputPos}
                    onValueChange={(val) => {
                        if (selectedId) updateEntityParameter(selectedId, lastInsertedParameter.type as any, val);
                        handleSetLastInsertedParameter({ ...lastInsertedParameter, value: val, isLocked: true });
                    }}
                    onClose={() => setIsParameterInputOpen(false)}
                 />
              )}
              <CADCanvas
                ref={cadCanvasRef}
                entities={entities}
                activeTool={selectedTool}
                setActiveTool={setSelectedTool}
                setEntities={updateEntitiesWithHistory}
                setEntitiesSilent={updateEntitiesSilent}
                liveMirrorAxis={liveMirrorAxis}
                onUpdateLiveMirrorAxis={handleUpdateLiveMirrorAxis}
                selectedLine={selectedLine}
                selectedLineClickPoint={selectedLineClickPoint}
                referenceLine={referenceLine}
                defaultTextStyle={defaultTextStyle}
                setDefaultTextStyle={setDefaultTextStyle}
                onCommitHistory={commitToHistory}
                onOpenPenneSidebar={() => {
                  setActiveSidebarTab('penne');
                  setShowProperties(true);
                }}
             onContextMenu={handleRightClickShortcut}
                   lastInsertedParameter={lastInsertedParameter}
                onLastParameterChange={(param) => {
                  handleSetLastInsertedParameter(param);
                }}
                onSelect={(id, entity, clickPoint) => {
                  setSelectedId(id);
                  if (id) {
                    const ent = entity || entities.find(e => e.id === id);
                    if (ent) {
                        console.log("Entity found:", ent.id, ent.type);
                        if (ent.type === 'line') {
                            const line = ent as any; 
                            const len = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y) / 100;
                            handleSetLastInsertedParameter({ type: 'length', value: parseFloat(len.toFixed(2)) });
                        } else if (ent.type === 'circle') {
                            const circ = ent as any;
                            handleSetLastInsertedParameter({ type: 'radius', value: parseFloat((circ.radius / 100).toFixed(2)) });
                        }
                        if (clickPoint) {
                            setParameterInputPos({ x: clickPoint.x, y: clickPoint.y });
                        } else {
                            let pos: Point | null = null;
                            if (ent.type === 'line') {
                                const line = ent as any;
                                pos = line.start;
                            } else if (ent.type === 'circle') {
                                const circ = ent as any;
                                pos = { x: circ.x, y: circ.y };
                            }
                            if (pos) {
                                setParameterInputPos({ x: pos.x, y: pos.y });
                            }
                        }
                    }
                  }
                }}
            activeLayerId={activeLayerId}
            layers={layers}
            defaultLineStyle={defaultLineStyle}
            setDefaultLineStyle={setDefaultLineStyle}
            defaultFiloColor={defaultFiloColor}
            eraserRadius={eraserRadius}
            setEraserRadius={setEraserRadius}
            dimensionScale={dimensionScale}
            dimensionDecimals={dimensionDecimals}
            dimensionMode={dimensionMode}
            dimensionStyle={dimensionStyle}
            selectionMode={selectionMode}
            selectedEntityIds={capturedSelectionIds}
            onSelectionComplete={(ids, pos) => {
              if (ids.length === 0) {
                setQuickActions(null);
                setCapturedSelectionIds([]);
                return;
              }
              setQuickActions({ ids, pos });
              setCapturedSelectionIds(ids);
              // Also auto-select the first one for the sidebar
              if (ids.length > 0) setSelectedId(ids[0]);
            }}
            initialSelectedIds={initialSelectedIds}
            onDoubleClickDimension={(dim) => {
              setSelectedId(dim.id);
              setShowProperties(true);
              setActiveSidebarTab('penne');
            }}
            onDoubleClickBIMElement={(entity) => {
              setSelectedId(entity.id);
              setShowProperties(true);
              handleEditBIMElement(entity.id);
            }}
            eraserType={eraserType}
            setEraserType={setEraserType}
            eraserIntensity={eraserIntensity}
            setEraserIntensity={setEraserIntensity}
            rulerStyle={rulerStyle}
            orthoMode={effectiveOrthoMode}
            snapEnabled={effectiveSnapActive}
            setOrthoMode={setOrthoMode}
            isContinuousMode={isContinuousMode}
            cancelTrigger={cancelTrigger}
            parallelTrigger={parallelTrigger}
            isOffsetAidActive={isOffsetAidActive}
            tavole={tavole}
            onUpdateTavole={setTavole}
            onDoubleClickTavola={setDoubleClickedTavolaId}
            selectedTemplateId={selectedTemplateId}
            selectedEntityId={selectedId}
            selectedBIMSymbolType={selectedBIMSymbolType}
            setSelectedBIMSymbolType={setSelectedBIMSymbolType}
            bimSymbolScale={typeof bimSymbolScale === 'number' ? bimSymbolScale : 0}
            defaultHatchStyle={defaultHatchStyle}
            bimWallHeight={typeof bimWallHeight === 'number' ? bimWallHeight : 0}
            bimDoorHeight={typeof bimDoorHeight === 'number' ? bimDoorHeight : 0}
            bimWindowHeight={typeof bimWindowHeight === 'number' ? bimWindowHeight : 0}
            bimWallThickness={typeof bimWallThickness === 'number' ? bimWallThickness : 0}
            bimWallType={bimWallType}
            bimWallRenderMode={bimWallRenderMode}
            onActionStart={() => {
              setHoveredGuide(null);
              setGuideLockedBy(null);
            }}
            raccordoConfig={raccordoConfig}
            onEditRaccordo={(raccordoEntity) => {
              setEditingRaccordo(raccordoEntity);
              setIsRaccordoDialogOpen(true);
            }}
            onAreaDetected={handleBIMElementDetected}
            highlightedPoints={detectedAreaPoints}
            rotationEntityId={rotationEntityId}
            onSelectForRotation={(id) => {
                setRotationEntityId(id);
                setIsRotateScaleOpen(true);
            }}
          />
           </div>

          {(() => {
            const rotationTargetEntity = entities.find(e => e.id === rotationEntityId);
            const isBIMRotationTarget = rotationTargetEntity && (rotationTargetEntity.isBIM || (rotationTargetEntity as any).bimType || (rotationTargetEntity as any).bimFamily);
            const connectedFinishesCount = rotationEntityId ? entities.filter(e => e.parentEntityId === rotationEntityId).length : 0;
            
            const activeTransformIds = (() => {
              if (!rotationEntityId) return [];
              const baseIds = [rotationEntityId];
              const entity = entities.find(e => e.id === rotationEntityId);
              if (entity && (entity as any).groupId) {
                const groupIds = entities.filter(e => (e as any).groupId === (entity as any).groupId).map(e => e.id);
                baseIds.push(...groupIds);
              }
              const uniqueBaseIds = Array.from(new Set(baseIds));
              if (rotateFinishes) {
                const connectedFinishes = entities.filter(e => e.parentEntityId && uniqueBaseIds.includes(e.parentEntityId)).map(e => e.id);
                return [...uniqueBaseIds, ...connectedFinishes];
              }
              return uniqueBaseIds;
            })();

            if (isRotateScaleOpen && isBIMRotationTarget) {
              return (
                <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-200">
                  <div className="bg-white rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] border border-neutral-100 max-w-md w-full p-6 relative flex flex-col gap-5 animate-in zoom-in-95 duration-200">
                    
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-amber-100 p-2.5 rounded-xl text-amber-600">
                          <RefreshCw size={20} className="animate-spin-slow" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-neutral-800 tracking-tight">
                            Rotazione Oggetto BIM
                          </h3>
                          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
                            {rotationTargetEntity?.bimName || "Oggetto senza nome"}
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={() => { 
                          if (initialBaseEntitiesRef.current) {
                            setEntities(initialBaseEntitiesRef.current);
                          }
                          setIsRotateScaleOpen(false); 
                          setRotationEntityId(null); 
                        }} 
                        className="text-neutral-400 hover:text-neutral-600 transition-colors p-1.5 hover:bg-neutral-100 rounded-lg"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Info and finishes detection */}
                    <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200/60 space-y-2">
                      <div className="flex justify-between text-xs font-medium text-neutral-600">
                        <span>Tipo Oggetto:</span>
                        <span className="font-bold text-neutral-800 uppercase text-[11px] bg-neutral-200/60 px-2 py-0.5 rounded">
                          {(rotationTargetEntity as any)?.bimFamilyId || (rotationTargetEntity as any)?.bimFamily || "Elemento"}
                        </span>
                      </div>
                      
                      {connectedFinishesCount > 0 ? (
                        <div className="pt-2 border-t border-neutral-200/60 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-bold">
                              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                              Finiture Collegate:
                            </div>
                            <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                              {connectedFinishesCount} {connectedFinishesCount === 1 ? 'Faccia / Intonaco' : 'Facce / Intonaci'}
                            </span>
                          </div>
                          
                          <label className="flex items-center gap-2 cursor-pointer mt-1.5 select-none bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-100/60 hover:bg-indigo-50 transition-colors">
                            <input 
                              type="checkbox"
                              checked={rotateFinishes}
                              onChange={(e) => setRotateFinishes(e.target.checked)}
                              className="w-4 h-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className="text-[11px] font-bold text-indigo-800">
                              Ruota anche le finiture collegate ad esso
                            </span>
                          </label>
                        </div>
                      ) : (
                        <div className="text-[10px] text-neutral-400 italic pt-2 border-t border-neutral-200/60">
                          Nessuna finitura o intonaco collegato rilevato per questo oggetto.
                        </div>
                      )}
                    </div>

                    {/* Preset angles */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">
                        Angoli Rapidi
                      </span>
                      <div className="grid grid-cols-4 gap-2">
                        {[-90, 90, 180, 270].map(angle => (
                          <button
                            key={angle}
                            onClick={() => {
                              if (!initialBaseEntitiesRef.current) return;
                              
                              const baseEntity = initialBaseEntitiesRef.current.find(be => be.id === rotationEntityId);
                              const currentBaseAngle = (baseEntity as any)?.angle || 0;
                              const delta = angle - currentBaseAngle;
                              
                              const baseCenter = getSelectionCenter(activeTransformIds, initialBaseEntitiesRef.current);
                              
                              updateEntitiesWithHistory(prev => prev.map(ent => {
                                if (activeTransformIds.includes(ent.id)) {
                                  const bEnt = initialBaseEntitiesRef.current!.find(be => be.id === ent.id);
                                  return rotateEntityFixed(bEnt || ent, delta, baseCenter);
                                }
                                return ent;
                              }));
                            }}
                            className="py-2.5 bg-neutral-50 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-all rounded-xl text-xs font-extrabold border border-neutral-200 text-neutral-600 shadow-sm"
                          >
                            {angle > 0 ? `+${angle}` : angle}°
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Manual Rotation Slider / Exact Input */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                          Rotazione Manuale
                        </span>
                        <div className="flex items-center gap-1.5">
                          <input 
                            type="number"
                            value={Math.round((entities.find(e => e.id === rotationEntityId) as any)?.angle || 0)}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              if (!initialBaseEntitiesRef.current) return;
                              
                              const baseEntity = initialBaseEntitiesRef.current.find(be => be.id === rotationEntityId);
                              const currentBaseAngle = (baseEntity as any)?.angle || 0;
                              const delta = val - currentBaseAngle;
                              
                              const baseCenter = getSelectionCenter(activeTransformIds, initialBaseEntitiesRef.current);
                              updateEntitiesSilent(prev => prev.map(ent => {
                                if (activeTransformIds.includes(ent.id)) {
                                  const bEnt = initialBaseEntitiesRef.current!.find(be => be.id === ent.id);
                                  return rotateEntityFixed(bEnt || ent, delta, baseCenter);
                                }
                                return ent;
                              }));
                            }}
                            className="w-16 text-center font-mono font-bold text-xs border border-neutral-200 rounded-lg py-1 px-1.5 text-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <span className="text-xs font-black text-neutral-400">°</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <input 
                          type="range"
                          min="-180"
                          max="180"
                          step="1"
                          value={Math.round((entities.find(e => e.id === rotationEntityId) as any)?.angle || 0)}
                          onChange={(e) => {
                            const nextAngle = parseInt(e.target.value);
                            if (!initialBaseEntitiesRef.current) return;
                            
                            const baseEntity = initialBaseEntitiesRef.current.find(be => be.id === rotationEntityId);
                            const currentBaseAngle = (baseEntity as any)?.angle || 0;
                            const delta = nextAngle - currentBaseAngle;
                            
                            const baseCenter = getSelectionCenter(activeTransformIds, initialBaseEntitiesRef.current);
                            updateEntitiesSilent(prev => prev.map(ent => {
                              if (activeTransformIds.includes(ent.id)) {
                                const bEnt = initialBaseEntitiesRef.current!.find(be => be.id === ent.id);
                                return rotateEntityFixed(bEnt || ent, delta, baseCenter);
                              }
                              return ent;
                            }));
                          }}
                          onMouseUp={() => commitToHistory()}
                          className="w-full h-1.5 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-indigo-600 border border-neutral-200"
                        />
                        <div className="flex justify-between text-[9px] text-neutral-400 font-bold px-0.5">
                          <span>-180°</span>
                          <span>0°</span>
                          <span>180°</span>
                        </div>
                      </div>
                    </div>

                    {/* Footer Buttons */}
                    <div className="flex gap-2 border-t border-neutral-100 pt-4 mt-1">
                      <button
                        onClick={() => {
                          if (initialBaseEntitiesRef.current) {
                            setEntities(initialBaseEntitiesRef.current);
                          }
                          setIsRotateScaleOpen(false);
                          setRotationEntityId(null);
                        }}
                        className="flex-1 py-2.5 border border-neutral-200 text-neutral-600 font-bold text-xs rounded-xl hover:bg-neutral-50 transition-colors"
                      >
                        Annulla
                      </button>
                      <button
                        onClick={() => {
                          commitToHistory();
                          setIsRotateScaleOpen(false);
                          setRotationEntityId(null);
                          setShortcutToast("Rotazione applicata con successo! ✅");
                          setTimeout(() => setShortcutToast(null), 3000);
                        }}
                        className="flex-1 py-2.5 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-100 hover:shadow-indigo-200 transition-all active:scale-95"
                      >
                        Conferma
                      </button>
                    </div>
                    
                  </div>
                </div>
              );
            }

            if (isRotateScaleOpen) {
              return (
                <div className="absolute top-24 right-4 bg-white rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-neutral-200 p-4 z-50 flex flex-col gap-4 w-72 animate-in fade-in slide-in-from-right-4 duration-200">
                    <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                        <div className="flex items-center gap-2">
                            <div className="bg-indigo-50 p-2 rounded-lg">
                                <RotateScaleIcon size={18} />
                            </div>
                            <h3 className="text-[13px] font-bold text-neutral-800 tracking-tight">
                                Trasforma Oggetto
                            </h3>
                        </div>
                        <button onClick={() => { setIsRotateScaleOpen(false); setSelectedTool('Select'); }} className="text-neutral-400 hover:text-neutral-600 transition-colors p-1 hover:bg-neutral-100 rounded-md">✕</button>
                    </div>

                    {!rotationEntityId ? (
                        <div className="py-8 text-center px-4 bg-neutral-50 rounded-lg border border-dashed border-neutral-200">
                            <RefreshCw size={24} className="text-neutral-300 mx-auto mb-2 animate-spin-slow" />
                            <p className="text-[11px] text-neutral-500 font-medium leading-relaxed">Seleziona un elemento nel disegno per visualizzare le opzioni di rotazione e scala</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* ROTAZIONE */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <RefreshCw size={10} /> Rotazione
                                </label>
                                
                                <div className="grid grid-cols-4 gap-1.5">
                                    {[0, 90, 180, 270].map(angle => (
                                        <button
                                            key={angle}
                                            onClick={() => {
                                                if (!initialBaseEntitiesRef.current) return;
                                                const baseCenter = getSelectionCenter(transformSelection, initialBaseEntitiesRef.current);
                                                
                                                updateEntitiesWithHistory(prev => {
                                                    const currentEntities = [...prev];
                                                    return currentEntities.map(e => {
                                                        if (transformSelection.includes(e.id)) {
                                                            const baseEntity = initialBaseEntitiesRef.current!.find(be => be.id === e.id);
                                                            const currentEntAngle = (baseEntity as any)?.angle || 0;
                                                            const delta = angle - currentEntAngle;
                                                            return rotateEntityFixed(baseEntity || e, delta, baseCenter);
                                                        }
                                                        return e;
                                                    });
                                                });
                                            }}
                                            className="py-2 bg-white hover:bg-indigo-50 hover:border-indigo-200 transition-all rounded-md text-[10px] font-bold border border-neutral-200 text-neutral-600 hover:text-indigo-600 shadow-sm"
                                        >
                                            {angle}°
                                        </button>
                                    ))}
                                </div>

                                <div className="pt-1">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] font-medium text-neutral-500 italic">Angolo Libero</span>
                                        <span className="text-[11px] font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                            {(entities.find(e => e.id === rotationEntityId) as any)?.angle || 0}°
                                        </span>
                                    </div>
                                    <input 
                                        type="range"
                                        min="-180"
                                        max="180"
                                        step="1"
                                        value={(entities.find(e => e.id === rotationEntityId) as any)?.angle || 0}
                                        onChange={(e) => {
                                            const nextAngle = parseInt(e.target.value);
                                            if (!initialBaseEntitiesRef.current) return;
                                            const baseCenter = getSelectionCenter(transformSelection, initialBaseEntitiesRef.current);

                                            updateEntitiesSilent(prev => prev.map(ent => {
                                                if (transformSelection.includes(ent.id)) {
                                                    const baseEntity = initialBaseEntitiesRef.current!.find(be => be.id === ent.id);
                                                    const entity = baseEntity || ent;
                                                    const currentAngle = (entity as any).angle || 0;
                                                    const delta = nextAngle - currentAngle;
                                                    return rotateEntityFixed(entity, delta, baseCenter);
                                                }
                                                return ent;
                                            }));
                                        }}
                                        onMouseUp={() => commitToHistory()}
                                        className="w-full h-1.5 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-indigo-600 border border-neutral-200"
                                    />
                                </div>
                            </div>

                            {/* SCALA / INGRANDIMENTO */}
                            <div className="space-y-3 pt-2 border-t border-neutral-100">
                                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <Maximize size={10} /> Ingrandimento
                                </label>

                                <div className="space-y-1">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] font-medium text-neutral-500 italic">Fattore di Scala</span>
                                        <span className="text-[11px] font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                            x{((entities.find(e => e.id === rotationEntityId) as any)?.scale || 1).toFixed(2)}
                                        </span>
                                    </div>
                                    <input 
                                        type="range"
                                        min="0.1"
                                        max="5"
                                        step="0.05"
                                        value={(entities.find(e => e.id === rotationEntityId) as any)?.scale || 1}
                                        onChange={(e) => {
                                            const nextScale = parseFloat(e.target.value);
                                            if (!initialBaseEntitiesRef.current) return;
                                            const baseCenter = getSelectionCenter(transformSelection, initialBaseEntitiesRef.current);

                                            updateEntitiesSilent(prev => prev.map(ent => {
                                                if (transformSelection.includes(ent.id)) {
                                                    const baseEntity = initialBaseEntitiesRef.current!.find(be => be.id === ent.id);
                                                    const entity = baseEntity || ent;
                                                    const currentBaseScale = (entity as any).scale || 1;
                                                    const factor = nextScale / currentBaseScale;
                                                    return scaleEntity(entity, factor, nextScale, baseCenter);
                                                }
                                                return ent;
                                            }));
                                        }}
                                        onMouseUp={() => commitToHistory()}
                                        className="w-full h-1.5 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-emerald-500 border border-neutral-200"
                                    />
                                    <div className="flex justify-between text-[8px] text-neutral-300 font-bold px-0.5 pt-1 uppercase">
                                        <span>Ridotto</span>
                                        <span>Normale (x1)</span>
                                        <span>Ingrandito</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
              );
            }
            return null;
          })()}

          {isBIMElementDialogOpen && (
            <BIMElementDialog
              isOpen={isBIMElementDialogOpen}
              onClose={() => {
                setIsBIMElementDialogOpen(false);
                setIsFaceSurveyMode(false);
                setDetectedAreaPoints(null);
                setEditingEntityId(null);
                setIsMultiAreaMode(false); // Reset this on close
              }}
              onConfirm={handleConfirmBIMElement}
              points={detectedAreaPoints || undefined}
              isFaceSurveyMode={isFaceSurveyMode}
              initialData={editingEntityId ? (() => {
                const e = entities.find(ent => ent.id === editingEntityId);
                if (!e) return undefined;
                return {
                  familyId: (e as any).bimAreaType || 'Fondazioni',
                  subFamily: (e as any).bimFamily || (e as any).bimSubFamily || '',
                  name: (e as any).bimName || '',
                  color: (e as any).backgroundColor || e.color,
                  zPlane: (e as any).bimZPlane || (e as any).zPlane || 0,
                  zElevation: (e as any).bimZElevation || (e as any).zElevation || 0,
                  objectHeight: (e as any).bimHeight || (e as any).height || 270,
                  objectWidth: (e as any).bimWidth || (e as any).width,
                  hatch: (e as any).bimHatchPattern || 'SOLID',
                  bimRenderMode: (e as any).bimRenderMode || 'solid',
                  renderingStyle: (e as any).renderingStyle || 'none',
                  sideSign: (e as any).sideSign,
                  parentEntityId: (e as any).parentEntityId,
                  normalY: (e as any).normalY,
                  isHorizontal: (e as any).isHorizontal,
                  cost_5d: (e as any).cost_5d || {
                    prezzarioCodice: (e as any).prezzarioCodice,
                    prezzarioDescrizione: (e as any).prezzarioDescrizione,
                    prezzarioUnita: (e as any).prezzarioUnita,
                    prezzarioPrezzo: (e as any).prezzarioPrezzo,
                    incidenzaManodopera: (e as any).incidenzaManodopera || 0,
                    prezzarioNome: (e as any).prezzarioNome
                  }
                };
              })() : (detectedAreaPoints?.from3DFace ? (() => {
                const parentId = detectedAreaPoints.parentEntityId;
                const parent = parentId ? entities.find(ent => ent.id === parentId) : null;
                
                const parentZ = parent ? ((parent as any).bimZPlane || (parent as any).zPlane || 0) : 0;
                const parentZElev = parent ? ((parent as any).bimZElevation || (parent as any).zElevation || 0) : 0;
                const parentH = parent ? ((parent as any).bimHeight || (parent as any).height || 270) : 270;
                
                const isHorizontal = !!detectedAreaPoints.isHorizontal;
                const normalY = detectedAreaPoints.normalY ?? 0;
                const isTopFace = isHorizontal && normalY > 0.5;
                
                const calcZElev = isTopFace ? (parentZElev + parentH) : parentZElev;
                const calcHeight = isHorizontal ? 2 : parentH;

                const matchedFloor = floors.find(f => f.elevation === parentZ) || floors[0];
                const floorPrefix = matchedFloor ? (() => {
                  const m = matchedFloor.name.match(/Piano\s+(-?\d+)/i);
                  return m ? `P${m[1]}` : matchedFloor.name;
                })() : 'P0';
                
                const parentName = parent ? ((parent as any).bimName || (parent as any).name || 'Elemento BIM') : 'Elemento BIM';
                const cleanParentName = parentName.replace(/^P-?\d+\s*-\s*/, '');
                const finishTypeName = isHorizontal ? (isTopFace ? 'Finitura Superiore' : 'Finitura Inferiore') : 'Finitura Verticale';
                const autoFinishName = `${floorPrefix} - ${finishTypeName} ${cleanParentName}`;
                
                return {
                  familyId: 'intonaco_completo',
                  subFamily: 'Intonaco',
                  name: autoFinishName,
                  color: '#e5e7eb',
                  zPlane: parentZ,
                  zElevation: calcZElev,
                  objectHeight: calcHeight,
                  objectWidth: detectedAreaPoints.isLinear ? 5 : undefined,
                  hatch: 'SOLID',
                  bimRenderMode: isHorizontal ? 'parete_orizzontale' : 'solid',
                  parentEntityId: parentId,
                  normalY: normalY,
                  isHorizontal: isHorizontal,
                  isFromFaceSurvey: true
                };
              })() : undefined)}
              floors={floors}
              isMultiAreaMode={isMultiAreaMode}
              onToggleMultiAreaMode={setIsMultiAreaMode}
              entities={entities}
              editingEntityId={editingEntityId}
              prezzarioItems={dynamicPrezzario}
              onOpenImporter={(familyId) => setPriceListImporterTargetFamily(familyId || 'ESTRANEO')}
              justImportedItem={justImportedItem}
              onConsumedImportedItem={() => setJustImportedItem(null)}
            />
          )}

          {isFloorManagerOpen && (
            <FloorManagerDialog
              isOpen={isFloorManagerOpen}
              onClose={() => setIsFloorManagerOpen(false)}
              floors={floors}
              onUpdateFloors={setFloors}
              onToggleVisibility={(floorId) => {
                setFloors(prev => {
                  const newFloors = [...prev];
                  const idx = newFloors.findIndex(f => f.id === floorId);
                  if (idx >= 0) {
                    const newVisible = newFloors[idx].visibleInPlan === false ? true : false;
                    newFloors[idx] = { ...newFloors[idx], visibleInPlan: newVisible };
                    
                    // Update entities visibility dynamically
                    updateEntitiesWithHistory(ents => ents.map(e => {
                      // Check if the entity belongs to this floor
                      // Also handle entities that have legacy properties like bimZPlane
                      if ((e as any).bimZPlane === newFloors[idx].elevation || (e.bimData?.properties?.dimensions?.zPlane === newFloors[idx].elevation)) {
                        return { ...e, isVisible: newVisible } as any;
                      }
                      return e;
                    }));
                  }
                  return newFloors;
                });
              }}
            />
          )}
          <FinestreDialog
            isOpen={isBIMFinestreOpen}
            onClose={() => {
              setIsBIMFinestreOpen(false);
              setSelectedId(null);
            }}
            lastWindowWidth={(() => {
              const e = entities.find(ent => ent.id === selectedId);
              return (e as any)?.bimWidth || bimWindowWidth;
            })()}
            lastWindowHeight={(() => {
              const e = entities.find(ent => ent.id === selectedId);
              return (e as any)?.bimWindowHeight || bimWindowHeight;
            })()}
            lastWindowZElevation={(() => {
              const e = entities.find(ent => ent.id === selectedId);
              return (e as any)?.bimZElevation !== undefined ? (e as any).bimZElevation : parseFloat(localStorage.getItem('lastWindowZElevation') || '100');
            })()}
            lastWindowType={(() => {
              const e = entities.find(ent => ent.id === selectedId);
              return (e as any)?.bimWindowType || localStorage.getItem('lastWindowType') || 'singola';
            })()}
            lastWindowFlipLeft={(() => {
              const e = entities.find(ent => ent.id === selectedId);
              return (e as any)?.bimFlipLeft !== undefined ? (e as any).bimFlipLeft : (localStorage.getItem('lastWindowFlip') === 'true');
            })()}
            lastWindowFlipSide={(() => {
              const e = entities.find(ent => ent.id === selectedId);
              return (e as any)?.bimFlipSide !== undefined ? (e as any).bimFlipSide : (localStorage.getItem('lastWindowFlipSide') === 'true');
            })()}
            lastWindowRotation={(() => {
              const e = entities.find(ent => ent.id === selectedId);
              return (e as any)?.angle !== undefined ? (e as any).angle : parseFloat(localStorage.getItem('lastWindowRotation') || '0');
            })()}
            onConfirmWindow={(width, height, type, trasmittanza, prezzario, zElevation, flipLeft, flipSide, rotation) => {
              if (selectedId) {
                // Update existing
                updateEntitiesWithHistory(prev => prev.map(e => {
                  if (e.id === selectedId) {
                    const entAsAny = e as any;
                    let nextElem = {
                      ...e,
                      bimWidth: width,
                      bimWindowHeight: height,
                      bimWindowType: type,
                      bimZElevation: zElevation,
                      bimFlipLeft: flipLeft,
                      bimFlipSide: flipSide,
                      angle: rotation,
                      prezzario,
                      trasmittanza
                    };

                    // Update geometry if rotation or width changed
                    if (entAsAny.start && entAsAny.end) {
                      const cx = (entAsAny.start.x + entAsAny.end.x) / 2;
                      const cy = (entAsAny.start.y + entAsAny.end.y) / 2;
                      const rad = (rotation * Math.PI) / 180;
                      const hDx = Math.cos(rad) * (width / 2);
                      const hDy = Math.sin(rad) * (width / 2);
                      
                      (nextElem as any).start = { x: cx - hDx, y: cy - hDy };
                      (nextElem as any).end = { x: cx + hDx, y: cy + hDy };
                    }
                    
                    return nextElem;
                  }
                  return e;
                }));
                setShortcutToast("Infisso aggiornato ✅");
              } else {
                // Set defaults for new
                setBimWindowWidth(width);
                setBimWindowHeight(height);
                localStorage.setItem('lastWindowZElevation', zElevation.toString());
                localStorage.setItem('lastWindowFlip', flipLeft.toString());
                localStorage.setItem('lastWindowFlipSide', flipSide.toString());
                localStorage.setItem('lastWindowRotation', rotation.toString());
                cadCanvasRef.current?.setBIMDefaults(width, height, 'window', zElevation, type, flipLeft, flipSide, rotation);
                setSelectedBIMSymbolType('window');
                setShortcutToast("Seleziona un punto sul muro per inserire la finestra");
              }
              setIsBIMFinestreOpen(false);
              setSelectedId(null);
            }}
          />

          {is3DViewOpen && (
            <BIM3DViewer 
              entities={entities} 
              onClose={() => setIs3DViewOpen(false)} 
              setEntities={updateEntitiesWithHistory}
              floors={floors}
              isStratifiedView={isStratifiedView}
              setIsStratifiedView={setIsStratifiedView}
              isFaceSurveyMode={isFaceSurveyMode}
              onCreateFaceFinish={(points, isLinear, zPlane, objectHeight, faceData) => {
                setEditingEntityId(null);
                setIsFaceSurveyMode(true);
                setDetectedAreaPoints({ 
                  points, 
                  holes: faceData?.holes,
                  isLinear, 
                  zPlane, 
                  objectHeight, 
                  from3DFace: true, 
                  isFaceAligned: true,
                  isHorizontal: faceData?.isHorizontal,
                  isVertical: faceData?.isVertical,
                  rotationX: faceData?.rotationX,
                  rotationY: faceData?.rotationY,
                  rotationZ: faceData?.rotationZ,
                  normalX: faceData?.normalX,
                  normalY: faceData?.normalY,
                  normalZ: faceData?.normalZ,
                  parentEntityId: faceData?.parentEntityId,
                  parentBimName: faceData?.parentBimName
                });
                setIsBIMElementDialogOpen(true);
              }}
              onShowToast={(msg) => {
                setShortcutToast(msg);
                setTimeout(() => setShortcutToast(null), 3000);
              }}
              onSelectForRotation={(id) => {
                setRotationEntityId(id);
                setIsRotateScaleOpen(true);
              }}
            />
          )}

          <BIMDataAnalyzerDialog 
            isOpen={isAnalyzerOpen}
            onClose={() => setIsAnalyzerOpen(false)}
            onAnalyzeResult={(data) => {
              // Extract articles from Gecola format or generic array
              let articlesToImport: PrezzarioItem[] = [];
              if (data.gecolaData && data.gecolaData.articles) {
                articlesToImport = data.gecolaData.articles.map((art: any) => ({
                  codice: art.code || art.codice,
                  descrizione: art.description || art.descrizione,
                  unita: art.unit || art.unita,
                  prezzo: art.unitPrice || art.prezzo,
                  categoria: art.categoryCode || art.categoria || "Importato",
                  original: art
                }));
              } else if (Array.isArray(data)) {
                articlesToImport = data.map((art: any) => ({
                  codice: art.code || art.codice || "GENERIC",
                  descrizione: art.description || art.descrizione || art.label,
                  unita: art.unit || art.unita || "u",
                  prezzo: art.unitPrice || art.prezzo || 0,
                  categoria: art.category || "Importato",
                  original: art
                }));
              }

              if (articlesToImport.length > 0) {
                setDynamicPrezzario(prev => {
                  const combined = [...prev, ...articlesToImport];
                  // Basic deduplication by code
                  const unique = Array.from(new Map(combined.map(item => [item.codice + item.descrizione, item])).values());
                  localStorage.setItem('bim_custom_prezzario', JSON.stringify(unique));
                  return unique;
                });
                setShortcutToast(`${articlesToImport.length} voci caricate nel prezzario! 🚀`);
                setTimeout(() => setShortcutToast(null), 3000);
              }
            }}
          />
          
          {doubleClickedTavolaId && !pdfPreviewUrl && (
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center p-4 z-50 pointer-events-auto">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
                {(() => {
                  const tav = tavole.find(t => t.id === doubleClickedTavolaId);
                  if (!tav) return null;
                  return (
                    <>
                      <div className="px-4 border-b border-neutral-100 flex items-center justify-between py-3">
                        <h3 className="font-bold text-neutral-800 text-sm">Parametri Tavola - {tav.name}</h3>
                        <button onClick={() => setDoubleClickedTavolaId(null)} className="text-neutral-400 hover:text-neutral-600">✕</button>
                      </div>
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-1">Foglio</label>
                            <select
                              value={tav.format}
                              onChange={(e) => setTavole(tavole.map(t => t.id === tav.id ? { ...t, format: e.target.value as any } : t))}
                              className="w-full bg-neutral-50 border border-neutral-300 text-sm rounded p-1.5 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            >
                              <option value="A4">A4</option>
                              <option value="A3">A3</option>
                              <option value="A2">A2</option>
                              <option value="A1">A1</option>
                              <option value="A0">A0</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-1">Scala 1:</label>
                            <input
                              type="number"
                              min="1"
                              value={tav.scale}
                              onChange={(e) => {
                                const val = Math.max(1, Number(e.target.value));
                                setTavole(tavole.map(t => t.id === tav.id ? { ...t, scale: val } : t));
                              }}
                              className="w-full bg-neutral-50 border border-neutral-300 text-sm rounded p-1.5 text-center font-bold focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-1">Unità</label>
                            <select
                              value={tav.unit}
                              onChange={(e) => setTavole(tavole.map(t => t.id === tav.id ? { ...t, unit: e.target.value as any } : t))}
                              className="w-full bg-neutral-50 border border-neutral-300 text-sm rounded p-1.5 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            >
                              <option value="m">Metri</option>
                              <option value="cm">Cm</option>
                              <option value="mm">Mm</option>
                            </select>
                          </div>
                        </div>

                        <div className="space-y-2 mt-4 pt-4 border-t border-neutral-100">
                          <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Cartiglio</h4>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-semibold text-neutral-600">Progetto</label>
                            <input 
                              type="text"
                              className="border border-neutral-300 rounded p-1.5 text-sm w-full bg-neutral-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                              value={tav.datiCartiglio.progetto}
                              onChange={(e) => setTavole(tavole.map(t => t.id === tav.id ? {...t, datiCartiglio: {...t.datiCartiglio, progetto: e.target.value}} : t))}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-semibold text-neutral-600">Titolo</label>
                            <input 
                              type="text"
                              className="border border-neutral-300 rounded p-1.5 text-sm w-full bg-neutral-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                              value={tav.datiCartiglio.titolo}
                              onChange={(e) => setTavole(tavole.map(t => t.id === tav.id ? {...t, datiCartiglio: {...t.datiCartiglio, titolo: e.target.value}} : t))}
                            />
                          </div>
                          <div className="flex gap-2">
                            <div className="flex flex-col gap-1 flex-1">
                              <label className="text-[10px] font-semibold text-neutral-600">Autore</label>
                              <input 
                                type="text"
                                className="border border-neutral-300 rounded p-1.5 text-sm w-full bg-neutral-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                value={tav.datiCartiglio.autore}
                                onChange={(e) => setTavole(tavole.map(t => t.id === tav.id ? {...t, datiCartiglio: {...t.datiCartiglio, autore: e.target.value}} : t))}
                              />
                            </div>
                            <div className="flex flex-col gap-1 w-1/3">
                              <label className="text-[10px] font-semibold text-neutral-600">Data</label>
                              <input 
                                type="text"
                                className="border border-neutral-300 rounded p-1.5 text-sm w-full bg-neutral-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                value={tav.datiCartiglio.data}
                                onChange={(e) => setTavole(tavole.map(t => t.id === tav.id ? {...t, datiCartiglio: {...t.datiCartiglio, data: e.target.value}} : t))}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2 mt-4 pt-4 border-t border-neutral-100 bg-red-50/30 p-2 rounded">
                          <h4 className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                            Calibrazione Righello (Stampante)
                          </h4>
                          <p className="text-[10px] text-neutral-500 leading-tight">
                            Se stampando al 100% la "verifica 10mm" sul foglio misura diversamente (es. 9mm), inserisci qui la misura esatta letta col righello. Il CAD compenserà l'errore della stampante.
                          </p>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-semibold text-neutral-600">Misura reale linea di verifica (in mm)</label>
                            <input 
                              type="number"
                              step="0.1"
                              placeholder="10"
                              className="border border-neutral-300 rounded p-1.5 text-sm w-full bg-neutral-50 focus:bg-white focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none transition-all font-mono"
                              value={tav.measuredCalibrationMm || 10}
                              onChange={(e) => setTavole(tavole.map(t => t.id === tav.id ? {...t, measuredCalibrationMm: parseFloat(e.target.value) || 10} : t))}
                            />
                          </div>
                        </div>

                      </div>
                      <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-2">
                        <button
                          onClick={async () => {
                            const { exportNativePDF } = await import("./utils/pdfExport");
                            const url = exportNativePDF(entities, tav.format, tav.scale, tav.unit, tav, 'bloburl');
                            if (url) {
                              setPdfPreviewUrl(url);
                              setActivePreviewTavolaId(tav.id);
                            }
                          }}
                          className="px-4 py-2 bg-indigo-100 text-indigo-700 hover:text-indigo-800 rounded text-sm font-bold shadow-sm hover:bg-indigo-200 transition-colors flex items-center justify-center gap-1"
                        >
                          Anteprima di Stampa
                        </button>
                        <button
                          onClick={() => setDoubleClickedTavolaId(null)}
                          className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-bold shadow-sm hover:bg-indigo-700 transition-colors"
                        >
                          Chiudi
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {pdfPreviewUrl && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-6 z-[60] pointer-events-auto">
              <div className="bg-white rounded-lg shadow-2xl w-full h-full max-w-5xl flex flex-col overflow-hidden">
                <div className="px-4 py-3 border-b flex items-center justify-between bg-neutral-50 shrink-0 border-neutral-200">
                  <h3 className="font-bold text-neutral-800 flex items-center gap-2">
                    <Printer size={18} className="text-indigo-600" />
                    Anteprima di Stampa PDF
                  </h3>
                  <div className="flex items-center gap-2">
                    <a 
                      href={pdfPreviewUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded font-bold text-sm transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <ExternalLink size={14} />
                      Apri / Stampa a pagina intera
                    </a>
                    <button 
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = pdfPreviewUrl;
                        a.download = "anteprima.pdf";
                        a.click();
                      }}
                      className="px-3 py-1.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 rounded font-bold text-sm transition-colors"
                    >
                      Scarica File
                    </button>
                    <button 
                      onClick={() => {
                        setPdfPreviewUrl(null);
                        setActivePreviewTavolaId(null);
                      }} 
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold text-sm transition-colors"
                    >
                      Chiudi Anteprima
                    </button>
                  </div>
                </div>
                <div id="pdf-scroll-container" className="flex-1 bg-neutral-100 p-4 flex flex-col h-full overflow-hidden justify-center items-center">
                  {(() => {
                    const previewTav = tavole.find(t => t.id === activePreviewTavolaId);
                    if (previewTav) {
                      return <CanvasPDFPreview entities={entities} tavola={previewTav} />;
                    }
                    return (
                      <iframe 
                        src={pdfPreviewUrl} 
                        className="w-full h-full border-none rounded bg-white shadow-inner flex-1" 
                        title="Anteprima PDF"
                      />
                    );
                  })()}
                  <div className="mt-2 text-center text-xs text-neutral-500 font-medium pb-1 shrink-0">
                    💡 Per stampare o salvare in PDF vettoriale reale con retini perfetti, clicca su <span className="font-bold text-orange-700">"Apri / Stampa a pagina intera"</span> o <span className="font-bold text-indigo-700">"Scarica File"</span>.
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* Dynamic Floating/Docked Favorites Toolbars / Menu Speciali Preferiti */}
          {(() => {
            const leftDockedPanels = favoritePanels.filter(p => p.isDocked === 'left');
            const rightDockedPanels = favoritePanels.filter(p => p.isDocked === 'right');
            const topDockedPanels = favoritePanels.filter(p => p.isDocked === 'top');

            return favoritePanels.map((panel) => {
              const isDocked = panel.isDocked;
              const leftIndex = leftDockedPanels.findIndex(p => p.id === panel.id);
              const rightIndex = rightDockedPanels.findIndex(p => p.id === panel.id);
              const topIndex = topDockedPanels.findIndex(p => p.id === panel.id);
              const isDraggingThis = activeDraggingId === panel.id;
              
              // Dynamic placement coordinates with dampening transitions for satisfying dragging glide effect
              let placementStyle: React.CSSProperties = {
                left: panel.x,
                top: panel.y,
                transition: isDraggingThis
                  ? 'left 0.12s cubic-bezier(0.12, 0.85, 0.2, 1), top 0.12s cubic-bezier(0.12, 0.85, 0.2, 1)'
                  : 'left 0.3s cubic-bezier(0.16, 1, 0.3, 1), top 0.3s cubic-bezier(0.16, 1, 0.3, 1), right 0.3s, width 0.2s, height 0.2s',
              };

              if (isDocked === 'left' && !isDraggingThis) {
                placementStyle = {
                  left: leftIndex * 72,
                  top: '15%',
                  height: '70%',
                  maxHeight: '520px',
                  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                };
              } else if (isDocked === 'right' && !isDraggingThis) {
                placementStyle = {
                  right: rightIndex * 72,
                  top: '15%',
                  height: '70%',
                  maxHeight: '520px',
                  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                };
              } else if (isDocked === 'top' && !isDraggingThis) {
                placementStyle = {
                  left: `calc(50% - ${110 + topIndex * 76}px)`,
                  top: topIndex * 76 + 64,
                  height: '72px',
                  width: `${panel.tools.length * 64 + 58}px`,
                  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                };
              }

              return (
                <div
                  key={panel.id}
                  style={placementStyle}
                  className={`absolute z-30 select-none bg-white/80 backdrop-blur-md border border-neutral-200/80 shadow-[0_12px_40px_rgba(0,0,0,0.06)] overflow-hidden flex pointer-events-auto ${
                    isDocked === 'top' ? 'flex-row items-center max-h-[72px]' : 'flex-col'
                  } ${
                    isDraggingThis
                      ? "ring-2 ring-indigo-500/30 shadow-indigo-500/10 scale-[1.01] z-40" 
                      : ""
                  } ${
                    isDocked === 'left' 
                      ? 'rounded-r-xl border-l-0' 
                      : isDocked === 'right' 
                        ? 'rounded-l-xl border-r-0' 
                        : isDocked === 'top'
                          ? 'rounded-b-xl border-t-0 max-w-none'
                          : 'rounded-xl max-w-[85px]'
                  }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const toolName = e.dataTransfer.getData("text/plain") || draggingToolName;
                  const source = e.dataTransfer.getData("source") || draggingSource;

                  if (toolName) {
                    setDragOverTool(null);
                    setDraggingToolName(null);
                    setDraggingSource(null);

                    setFavoritePanels(prev => {
                      // 1. Remove the dragging tool from its source panel
                      let updatedPanels = [...prev];
                      if (source && source.startsWith("favorites-")) {
                        const sourcePanelId = source.replace("favorites-", "");
                        updatedPanels = updatedPanels.map(p => {
                          if (p.id === sourcePanelId) {
                            return { ...p, tools: p.tools.filter(t => t !== toolName) };
                          }
                          return p;
                        }).filter(p => p.tools.length > 0);
                      } else {
                        // If from toolbar, remove first from this panel to prevent duplicates
                        updatedPanels = updatedPanels.map(p => {
                          if (p.id === panel.id) {
                            return { ...p, tools: p.tools.filter(t => t !== toolName) };
                          }
                          return p;
                        });
                      }

                      // 2. Append to the end of the panel
                      return updatedPanels.map(p => {
                        if (p.id === panel.id) {
                          if (p.tools.includes(toolName)) return p;
                          return { ...p, tools: [...p.tools, toolName] };
                        }
                        return p;
                      });
                    });
                  }
                }}
              >
                {/* Horizontal or vertical discrete drag handle at top or side */}
                <div
                  onMouseDown={(e) => handleFavoritesMouseDown(e, panel.id)}
                  className={`px-2 text-neutral-600 flex items-center justify-between cursor-move text-[9px] uppercase font-mono font-bold tracking-wider ${
                    isDocked === 'top' 
                      ? 'flex-col py-1 border-r border-neutral-200/60 h-full justify-center gap-1.5 min-w-[42px]' 
                      : `py-1.5 border-b border-neutral-200/60 ${isDocked ? 'flex-col gap-1' : ''}`
                  }`}
                  title="Trascina per spostare o sganciare"
                >
                  <div className="flex flex-col items-center gap-0.5 pointer-events-none">
                    <div className="flex gap-0.5">
                      <div className="w-1 h-1 bg-neutral-400 rounded-full" />
                      <div className="w-1 h-1 bg-neutral-400 rounded-full" />
                      <div className="w-1 h-1 bg-neutral-400 rounded-full" />
                    </div>
                  </div>

                  <span className="text-[8px] font-bold text-neutral-500 tracking-tighter block text-center truncate w-full scale-95 origin-center">
                    {isDocked ? 'Snodato' : '★ Menu'}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      setFavoritePanels(prev => prev.filter(p => p.id !== panel.id));
                    }}
                    title="Chiudi pannello"
                    className="text-neutral-400 hover:text-red-500 transition-colors p-0.5"
                  >
                    ✕
                  </button>
                </div>

                {/* Horizontal or Vertical list of tools */}
                <div className={`p-1.5 flex bg-white items-center justify-start ${
                  isDocked === 'top' 
                    ? 'flex-row gap-1.5 h-full overflow-x-auto px-2' 
                    : `flex-col gap-1.5 min-w-[72px] overflow-y-auto ${isDocked ? 'h-full' : 'max-h-[360px]'}`
                }`}>
                  {panel.tools.length === 0 ? (
                    <div className="text-[8px] text-neutral-400 text-center w-full p-2">
                       Vuoto
                    </div>
                  ) : (
                    panel.tools.map((toolName) => {
                      const IconComp = getToolIcon(toolName);
                      const isToolActive = 
                        selectedTool === toolName ||
                        (toolName === "Orto" && effectiveOrthoMode) ||
                        (toolName === "SNAP" && isSnapActive) ||
                        (toolName === "Tecnigrafo" && isTecnigrafoActive) ||
                        (toolName === "Polilinea" && isContinuousMode);

                      const isThisOver = dragOverTool && dragOverTool.panelId === panel.id && dragOverTool.toolName === toolName;

                      return (
                        <div
                          key={toolName}
                          draggable={true}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", toolName);
                            e.dataTransfer.setData("source", `favorites-${panel.id}`);
                            setDraggingToolName(toolName);
                            setDraggingSource(`favorites-${panel.id}`);
                          }}
                          onDragEnd={() => {
                            setDraggingToolName(null);
                            setDraggingSource(null);
                            setDragOverTool(null);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            let position: 'before' | 'after' = 'before';
                            if (isDocked === 'top') {
                              const mouseX = e.clientX - rect.left;
                              if (mouseX > rect.width / 2) {
                                position = 'after';
                              }
                            } else {
                              const mouseY = e.clientY - rect.top;
                              if (mouseY > rect.height / 2) {
                                position = 'after';
                              }
                            }
                            setDragOverTool({
                              panelId: panel.id,
                              toolName: toolName,
                              position: position
                            });
                          }}
                          onDragLeave={() => {
                            setDragOverTool(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const dragName = e.dataTransfer.getData("text/plain") || draggingToolName;
                            const dragSource = e.dataTransfer.getData("source") || draggingSource;

                            if (dragName) {
                              setDragOverTool(null);
                              setDraggingToolName(null);
                              setDraggingSource(null);

                              setFavoritePanels(prev => {
                                // 1. Remove the dragging tool from its source panel
                                let updatedPanels = [...prev];
                                if (dragSource && dragSource.startsWith("favorites-")) {
                                  const sourcePanelId = dragSource.replace("favorites-", "");
                                  updatedPanels = updatedPanels.map(p => {
                                    if (p.id === sourcePanelId) {
                                      return { ...p, tools: p.tools.filter(t => t !== dragName) };
                                    }
                                    return p;
                                  }).filter(p => p.tools.length > 0);
                                } else {
                                  // If from toolbar, remove first to prevent duplicates/reorder
                                  updatedPanels = updatedPanels.map(p => {
                                    if (p.id === panel.id) {
                                      return { ...p, tools: p.tools.filter(t => t !== dragName) };
                                    }
                                    return p;
                                  });
                                }

                                // 2. Insert into the target panel at the correct position
                                return updatedPanels.map(p => {
                                  if (p.id === panel.id) {
                                    const targetIndex = p.tools.indexOf(toolName);
                                    if (targetIndex === -1) {
                                      return { ...p, tools: [...p.tools, dragName] };
                                    }
                                    
                                    const isAfter = dragOverTool && dragOverTool.panelId === panel.id && dragOverTool.toolName === toolName && dragOverTool.position === 'after';
                                    const insertIndex = isAfter ? targetIndex + 1 : targetIndex;
                                    
                                    const nextTools = [...p.tools];
                                    nextTools.splice(insertIndex, 0, dragName);
                                    return { ...p, tools: nextTools };
                                  }
                                  return p;
                                });
                              });
                            }
                          }}
                          className="group relative"
                        >
                          {isThisOver && (
                            <div 
                              className={`absolute z-10 bg-indigo-500 shadow-[0_0_8px_rgba(78,70,229,0.8)] animate-pulse pointer-events-none rounded-full ${
                                isDocked === 'top'
                                  ? `top-0 bottom-0 w-1 ${dragOverTool.position === 'before' ? 'left-0' : 'right-0'}`
                                  : `left-0 right-0 h-1 ${dragOverTool.position === 'before' ? 'top-0' : 'bottom-0'}`
                              }`}
                            />
                          )}
                          <button
                            onClick={() => handleToolClick(toolName)}
                            className={`p-1 rounded-lg transition-all flex flex-col items-center justify-center gap-0.5 w-[58px] h-[58px] cursor-grab active:cursor-grabbing hover:scale-105 ${
                              isToolActive 
                                ? "bg-indigo-600 border-2 border-indigo-500 text-white font-bold shadow-[0_0_15px_rgba(79,70,229,0.6)] scale-[1.03]" 
                                : "bg-neutral-50 border border-neutral-200/50 text-neutral-700 hover:bg-indigo-50/70 hover:text-indigo-950 hover:border-indigo-400/50"
                            }`}
                            title={`${toolName} - Trascina per spostare o rimuovere`}
                          >
                            {IconComp ? <IconComp size={20} className={`${isToolActive ? "text-white" : "text-neutral-600 group-hover:text-indigo-600"} transition-colors`} /> : null}
                            <span className={`text-[8.5px] font-sans font-semibold truncate w-full text-center tracking-tight leading-none ${isToolActive ? "text-white font-black" : "text-neutral-500"}`}>
                              {toolName}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFavoritePanels(prev => {
                                return prev.map(p => {
                                  if (p.id === panel.id) {
                                    return { ...p, tools: p.tools.filter(t => t !== toolName) };
                                  }
                                  return p;
                                }).filter(p => p.tools.length > 0);
                              });
                            }}
                            className="absolute -top-1 -right-1 hidden group-hover:flex w-3.5 h-3.5 bg-red-500 hover:bg-red-600 text-white rounded-full items-center justify-center text-[7px] border border-white font-black"
                            title="Rimuovi"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          });
        })()}



          {/* Minimalist centered transparent watermark */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center pointer-events-none select-none text-center z-10 opacity-100 transition-opacity duration-300">
            <span className="text-[10px] font-sans tracking-wider text-black font-thin">
              Copyright © 2026 Domenico Gimondo
            </span>
            <span className="text-[9px] font-mono tracking-[0.3em] text-black/80 font-normal mt-0.5 uppercase">
              AETERNA
            </span>
          </div>
        </main>

        {shortcutToast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-neutral-800 text-white px-4 py-2 rounded-md shadow-lg pointer-events-none z-50 text-sm animate-pulse">
            {shortcutToast}
          </div>
        )}

        {/* Properties Panel (Drawer) */}
        {showProperties && (
          <div className={`w-80 border-l transition-all overflow-y-auto overflow-x-hidden flex flex-col h-full p-4 ${
            selectedTool === 'Dimension' 
              ? 'bg-slate-950 border-slate-800 text-slate-100 shadow-[2px_0_24px_rgba(0,0,0,0.5)]' 
              : 'bg-white border-neutral-300 text-neutral-800'
          }`}>
            <h3 className={`font-bold mb-4 flex justify-between items-center border-b pb-2 ${
              selectedTool === 'Dimension' 
                ? 'text-slate-200 border-slate-800' 
                : 'text-neutral-800 border-neutral-100'
            }`}>
              <span className="text-xs font-black uppercase tracking-wider font-mono flex items-center gap-2">
                {selectedTool === 'Dimension' ? (
                  <>
                    <Settings2 className="w-4 h-4 text-emerald-400 animate-pulse" />
                    <span>Configurazione Misura</span>
                  </>
                ) : (
                  <span>
                    {activeSidebarTab === "tavole" ? "Gestione Tavole" 
                      : activeSidebarTab === "layers" ? "Gestione Layers" 
                      : activeSidebarTab === "maschere" ? "Archivio Maschere" 
                      : activeSidebarTab === "testo" ? "Impostazioni Testo"
                      : activeSidebarTab === "bim" ? "Tecnologia BIM"
                      : "Mazzo Penne & Stili"}
                  </span>
                )}
              </span>
              <button 
                onClick={() => {
                  if (selectedTool === 'Dimension') setSelectedTool('Select');
                  setShowProperties(false);
                }} 
                className={`font-bold font-mono text-sm p-1 transition-colors ${
                  selectedTool === 'Dimension' 
                    ? 'text-slate-500 hover:text-slate-300' 
                    : 'text-neutral-400 hover:text-neutral-600'
                }`}
              >
                ✕
              </button>
            </h3>

            <div className="space-y-4 flex-1">
              {selectedTool === 'Dimension' ? (
                <div className="space-y-6">
                  <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
                    <p className="text-[11px] text-slate-300 leading-normal font-sans">
                      <span className="font-bold text-emerald-400">📊 STRUMENTO MISURE:</span> Configura i parametri di quotatura. Seleziona un metodo di immissione e clicca sul disegno.
                    </p>
                  </div>

                  <div className="space-y-5">
                    {/* SELEZIONE MODE: MANUAL VS OBJECT */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                        <Target className="w-3.5 h-3.5 text-emerald-400" />
                        Metodo Selezione
                      </label>
                      <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                        <button
                          onClick={() => setSelectionMode('manual')}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                            selectionMode === 'manual'
                              ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                          }`}
                        >
                          <Ruler className="w-3.5 h-3.5" />
                          2p / Manuale
                        </button>
                        <button
                          onClick={() => setSelectionMode('object')}
                          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 relative ${
                            selectionMode === 'object'
                              ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                          }`}
                        >
                          <Target className="w-3.5 h-3.5" />
                          Ad Oggetto
                        </button>
                      </div>
                    </div>

                    {/* SCALE FACTOR */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                          <Settings2 className="w-3.5 h-3.5 text-emerald-400" />
                          Scala Dimensioni
                        </label>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-emerald-400 text-xs font-black bg-slate-900/80 border border-slate-800 px-2 py-0.5 rounded">
                            {dimensionScale.toFixed(2)}x
                          </span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="5.0"
                        step="0.1"
                        value={dimensionScale}
                        onChange={(e) => setDimensionScale(parseFloat(e.target.value))}
                        className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    {/* SELECTS ROW */}
                    <div className="grid grid-cols-2 gap-3.5">
                      {/* DIMENSION MODE */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">
                          Modalità
                        </label>
                        <select
                          value={dimensionMode}
                          onChange={(e) => setDimensionMode(e.target.value as 'two-points' | 'chain')}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs font-bold text-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                        >
                          <option value="two-points" className="bg-slate-950 text-slate-200">2 Punti</option>
                          <option value="chain" className="bg-slate-950 text-slate-200">Catena</option>
                        </select>
                      </div>

                      {/* DIMENSION STYLE */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">
                          Tipo Stile
                        </label>
                        <select
                          value={dimensionStyle}
                          onChange={(e) => setDimensionStyle(e.target.value as any)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs font-bold text-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                        >
                          <option value="linear" className="bg-slate-950 text-slate-200">Lineare (Auto)</option>
                          <option value="aligned" className="bg-slate-950 text-slate-200">Allineata</option>
                          <option value="horizontal" className="bg-slate-950 text-slate-200">Orto Orizzontale</option>
                          <option value="vertical" className="bg-slate-950 text-slate-200">Orto Verticale</option>
                          <option value="auto-ortho" className="bg-slate-950 text-slate-200">Auto Orto</option>
                        </select>
                      </div>
                    </div>

                    {/* DECIMAL PRECISION FIELD */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">
                        Approssimazione Decimale Globale
                      </label>
                      <select
                        value={dimensionDecimals}
                        onChange={(e) => setDimensionDecimals(parseInt(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs font-bold text-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                      >
                        <option value="0" className="bg-slate-950 text-slate-200">Nessun Decimale (es: 100)</option>
                        <option value="1" className="bg-slate-950 text-slate-200">1 Decimale (es: 100,5)</option>
                        <option value="2" className="bg-slate-950 text-slate-200">2 Decimali (es: 100,54)</option>
                        <option value="3" className="bg-slate-950 text-slate-200">3 Decimali (es: 100,538)</option>
                        <option value="4" className="bg-slate-950 text-slate-200">4 Decimali (es: 100,5378)</option>
                      </select>
                    </div>
                  </div>

                  {/* INFO FEEDBACK ACCORDING TO SELECTION MODE */}
                  <div className="p-3 bg-emerald-950/20 border border-emerald-900/30 rounded-xl space-y-1.5 text-xs">
                    <span className="font-bold text-emerald-400 block tracking-wide uppercase text-[10px]">
                      {selectionMode === 'manual' ? "📌 GUIDA 2 PUNTI" : "🎯 GUIDA AD OGGETTO"}
                    </span>
                    <p className="text-slate-400 leading-relaxed text-[11px]">
                      {selectionMode === 'manual' 
                        ? (dimensionMode === 'chain' 
                           ? "Clicca il primo punto, poi il secondo per tracciare la prima misura. Successivamente clicca altri punti per posizionare le altre misure in catena adiacente."
                           : "Traccia la linea di misura facendo clic sul primo punto e poi sul secondo. Sposta il cursore per regolare l'altezza dell'allineamento e fai clic per fissarla.")
                        : "Sposta il mouse e fai clic su un segmento/linea o sul lato di un rettangolo. Il segmento selezionato lampeggerà in verde, poi potrai muovere il mouse per posizionare la misura."
                      }
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedTool('Select');
                      setShowProperties(false);
                    }}
                    className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 hover:text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95"
                  >
                    Chiudi Configurazione
                  </button>
                </div>
              ) : activeSidebarTab === "bim" ? (
                <BIMWorkspacePanel
                  entities={entities}
                  selectedTool={selectedTool}
                  setSelectedTool={setSelectedTool}
                  setEntities={setEntities}
                  onCommitHistory={commitToHistory}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  cadCanvasRef={cadCanvasRef}
                  selectedTemplateId={selectedTemplateId}
                  setSelectedTemplateId={setSelectedTemplateId}
                  onOpenPorte={() => setIsBIMPorteOpen(true)}
                  onOpenFinestre={() => setIsBIMFinestreOpen(true)}
                  onOpenArredi={() => setIsBIMArrediOpen(true)}
                  onOpenSanitari={() => setIsBIMSanitariOpen(true)}
                  onOpenElettrico={() => setIsBIMElettricoOpen(true)}
                  onOpenIdraulico={() => setIsBIMIdraulicoOpen(true)}
                  onOpenFiniture={() => setIsBIMFinitureOpen(true)}
                  onEditArea={handleEditBIMElement}
                  onOpen3DView={() => setIs3DViewOpen(true)}
                  onOpenAnalyzer={() => setIsAnalyzerOpen(true)}
                />
              ) : selectedTool === 'Muro' ? (
                <div className="space-y-4">
                  <div className="bg-cyan-50 border border-cyan-200 p-3 rounded-lg shadow-sm">
                    <p className="text-[11px] text-cyan-900 leading-normal font-sans">
                      <span className="font-bold">🧱 IMPOSTAZIONI MURO:</span> Definisci la tipologia e le dimensioni.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block font-mono">Spessore (cm)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={bimWallThickness}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBimWallThickness(val === '' ? '' : (parseInt(val) || 0));
                          localStorage.setItem('lastWallThickness', val);
                        }}
                        className="w-full bg-neutral-50 border border-neutral-300 rounded p-2 text-xs font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block font-mono">Altezza (cm)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={bimWallHeight}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBimWallHeight(val === '' ? '' : (parseInt(val) || 0));
                          localStorage.setItem('lastWallHeight', val);
                        }}
                        className="w-full bg-neutral-50 border border-neutral-300 rounded p-2 text-xs font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block font-mono">Render 3D</label>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => {
                          setBimWallRenderMode('solid');
                          localStorage.setItem('lastWallRenderMode', 'solid');
                          localStorage.setItem('bimWallRenderMode', 'solid');
                        }} className={`flex-1 text-[9px] font-bold py-1.5 rounded border ${bimWallRenderMode === 'solid' ? 'bg-cyan-500/20 border-cyan-500' : 'bg-neutral-100 border-neutral-300'}`}>Solido</button>
                        <button type="button" onClick={() => {
                          setBimWallRenderMode('transparent');
                          localStorage.setItem('lastWallRenderMode', 'transparent');
                          localStorage.setItem('bimWallRenderMode', 'transparent');
                        }} className={`flex-1 text-[9px] font-bold py-1.5 rounded border ${bimWallRenderMode === 'transparent' ? 'bg-cyan-500/20 border-cyan-500' : 'bg-neutral-100 border-neutral-300'}`}>Parete</button>
                      </div>
                  </div>
                  <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block font-mono">Tipo Muratura</label>
                      <select
                        value={bimWallType}
                        onChange={(e) => {
                          setBimWallType(e.target.value);
                          localStorage.setItem('lastWallType', e.target.value);
                        }}
                        className="w-full bg-neutral-50 border border-neutral-300 rounded p-2 text-xs font-mono"
                      >
                        {MASONRY_TYPES.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                  </div>
                </div>
              ) : activeSidebarTab === "testo" ? (
                <div className="space-y-6">
                  {selectedEntity && selectedEntity.type === 'text' ? (
                     <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 p-3 rounded-lg shadow-sm">
                       <p className="text-[10px] leading-tight font-mono font-bold">
                         MODIFICA TESTO SELEZIONATO
                       </p>
                     </div>
                  ) : (
                     <div className="bg-neutral-800 text-neutral-100 p-3 rounded-lg shadow-lg border border-neutral-700">
                       <p className="text-[10px] leading-tight font-mono opacity-80">
                         <span className="text-amber-400 font-bold">INSERIMENTO TESTO:</span><br/>
                         Seleziona lo strumento Testo e clicca nell'area di lavoro.
                       </p>
                     </div>
                  )}
                  
                  <div className="space-y-4">
                    {selectedEntity && selectedEntity.type === 'text' && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-2">Contenuto Testo</label>
                          <textarea 
                            className="w-full bg-white border border-neutral-300 text-xs rounded p-2 focus:ring-2 focus:ring-indigo-500"
                            rows={3}
                            value={(selectedEntity as import('./types').TextEntity).text}
                            onChange={(e) => updateEntity(selectedEntity.id, { text: e.target.value })}
                          />
                        </div>
                    )}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-2">Famiglia Carattere</label>
                      <select 
                        className="w-full bg-white border border-neutral-300 text-xs rounded p-2 font-semibold"
                        value={selectedEntity && selectedEntity.type === 'text' ? (selectedEntity as import('./types').TextEntity).fontFamily : defaultTextStyle.fontFamily}
                        onChange={(e) => {
                            if (selectedEntity && selectedEntity.type === 'text') updateEntity(selectedEntity.id, { fontFamily: e.target.value });
                            else setDefaultTextStyle(prev => ({ ...prev, fontFamily: e.target.value }));
                        }}
                      >
                        <option value="sans-serif">Sans Serif</option>
                        <option value="serif">Serif</option>
                        <option value="monospace">Monospace</option>
                        <option value="Arial">Arial</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Courier New">Courier New</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-2">Grandezza Testo</label>
                       <input 
                         type="number"
                         min="8"
                         max="144"
                         className="w-full bg-white border border-neutral-300 text-xs rounded p-2 font-semibold text-center"
                         value={selectedEntity && selectedEntity.type === 'text' ? (selectedEntity as import('./types').TextEntity).fontSize : defaultTextStyle.fontSize}
                         onChange={(e) => {
                             if (selectedEntity && selectedEntity.type === 'text') updateEntity(selectedEntity.id, { fontSize: Number(e.target.value) });
                             else setDefaultTextStyle(prev => ({ ...prev, fontSize: Number(e.target.value) }));
                         }}
                       />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-2">Stile (Grassetto)</label>
                      <div className="flex gap-2">
                         <button 
                           onClick={() => {
                               if (selectedEntity && selectedEntity.type === 'text') updateEntity(selectedEntity.id, { fontWeight: 'normal' });
                               else setDefaultTextStyle(prev => ({ ...prev, fontWeight: 'normal' }));
                           }}
                           className={`flex-1 p-2 border rounded text-xs transition-all ${(selectedEntity && selectedEntity.type === 'text' ? (selectedEntity as import('./types').TextEntity).fontWeight : defaultTextStyle.fontWeight) === 'normal' ? 'bg-indigo-600 text-white font-bold' : 'bg-neutral-50 hover:bg-neutral-100'}`}
                         >Normale</button>
                         <button 
                           onClick={() => {
                               if (selectedEntity && selectedEntity.type === 'text') updateEntity(selectedEntity.id, { fontWeight: 'bold' });
                               else setDefaultTextStyle(prev => ({ ...prev, fontWeight: 'bold' }));
                           }}
                           className={`flex-1 p-2 border rounded text-xs transition-all ${(selectedEntity && selectedEntity.type === 'text' ? (selectedEntity as import('./types').TextEntity).fontWeight : defaultTextStyle.fontWeight) === 'bold' ? 'bg-indigo-600 text-white font-bold' : 'bg-neutral-50 hover:bg-neutral-100 font-bold'}`}
                         >Grassetto</button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-2">Allineamento</label>
                      <div className="flex gap-2">
                         {['left', 'center', 'right', 'justify'].map((align) => (
                           <button 
                             key={align}
                             onClick={() => {
                                 if (selectedEntity && selectedEntity.type === 'text') updateEntity(selectedEntity.id, { textAlign: align as any });
                                 else setDefaultTextStyle(prev => ({ ...prev, textAlign: align as any }));
                             }}
                             className={`flex-1 p-2 border rounded text-xs transition-all flex justify-center items-center ${(selectedEntity && selectedEntity.type === 'text' ? (selectedEntity as import('./types').TextEntity).textAlign : defaultTextStyle.textAlign) === align ? 'bg-indigo-600 text-white' : 'bg-neutral-50 hover:bg-neutral-100'}`}
                           >
                              {align === 'left' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="17" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="17" y1="18" x2="3" y2="18"></line></svg>}
                              {align === 'center' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="10" x2="6" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="18" y1="18" x2="6" y2="18"></line></svg>}
                              {align === 'right' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="21" y1="10" x2="7" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="7" y2="18"></line></svg>}
                              {align === 'justify' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="21" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="3" y2="18"></line></svg>}
                           </button>
                         ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-2">Colore Testo</label>
                       <div className="grid grid-cols-5 gap-2">
                         {['#000000', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#64748b'].map((c) => {
                             const isSelected = selectedEntity && selectedEntity.type === 'text' ? (selectedEntity as import('./types').TextEntity).color === c : defaultLineStyle.color === c;
                             return (
                               <button
                                 key={c}
                                 onClick={() => {
                                     if (selectedEntity && selectedEntity.type === 'text') updateEntity(selectedEntity.id, { color: c });
                                     else setDefaultLineStyle(prev => ({ ...prev, color: c }));
                                 }}
                                 className={`w-full aspect-square rounded-full flex items-center justify-center transition-transform ${isSelected ? "ring-2 ring-offset-2 ring-indigo-500 scale-110 shadow-md" : "hover:scale-105 border border-black/10"}`}
                                 style={{ backgroundColor: c }}
                               >
                                 {isSelected && <Check size={10} className="text-white drop-shadow-md" />}
                               </button>
                             );
                         })}
                       </div>
                    </div>
                  </div>
                </div>
              ) : activeSidebarTab === "penne" ? (
                <div className="space-y-6">
                  {selectedEntity ? (
                    selectedEntity.type === "hatch" ? (
                    <div className="space-y-4 font-sans">
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3 rounded-lg shadow-sm">
                        <p className="text-[10px] leading-tight font-mono font-bold uppercase">
                          ⚙️ MODIFICA RIEMPIMENTO (HATCH)
                        </p>
                      </div>
                      
                      {/* Pattern Selector */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block">Stile Retino (Pattern)</label>
                        <select
                          className="w-full bg-white border border-neutral-300 text-xs rounded p-2 font-semibold capitalize focus:ring-2 focus:ring-indigo-500"
                          value={(selectedEntity as any).pattern || 'ANSI31'}
                          onChange={(e) => updateEntity(selectedEntity.id, { pattern: e.target.value })}
                        >
                          <option value="Solid">Pieno (Solid)</option>
                          <option value="ANSI31">ANSI31 (Obliquo Semplice)</option>
                          <option value="ANSI32">ANSI32 (Obliquo Doppio)</option>
                          <option value="ANSI33">ANSI33 (Dashed/Solid Obliquo)</option>
                          <option value="ANSI34">ANSI34 (Obliquo Tratteggiato)</option>
                          <option value="Grid">Griglia (Quadrettato)</option>
                          <option value="Cross">Incrocio (Griglia 45°)</option>
                          <option value="Stripe">Strisce Verticali</option>
                          <option value="Horizontal">Strisce Orizzontali</option>
                          <option value="Zigzag">Zig-Zag</option>
                          <option value="Waves">Onde</option>
                          <option value="Brick">Mattoni CAD</option>
                          <option value="Checker">Scacchiera (Checker)</option>
                          <option value="Triangles">Triangoli</option>
                          <option value="Honey">Nido d'ape (Honey)</option>
                          <option value="Gravel">Ghiaia (Pebbles)</option>
                          <option value="Cobble">Ciottolato (Cobble)</option>
                          <option value="Plaid">Tartan (Plaid)</option>
                          <option value="Stars">Stelle</option>
                          <option value="Basket">Basket Weave</option>
                        </select>
                      </div>
                      
                      {/* Scale Slider / Input */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block">Dimensione / Scala</label>
                          <span className="text-[10px] font-mono font-bold text-neutral-600">{(selectedEntity as any).scale || 15}</span>
                        </div>
                        <input
                          type="range"
                          min="4"
                          max="180"
                          step="1"
                          className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          value={(selectedEntity as any).scale || 15}
                          onChange={(e) => updateEntity(selectedEntity.id, { scale: Number(e.target.value) })}
                        />
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="2"
                            max="500"
                            className="w-full bg-white border border-neutral-300 text-xs rounded p-1.5 text-center font-mono font-semibold"
                            value={(selectedEntity as any).scale || 15}
                            onChange={(e) => updateEntity(selectedEntity.id, { scale: Math.max(2, Number(e.target.value)) })}
                          />
                        </div>
                      </div>

                      {/* Angle Slider / Input */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block font-sans">Inclinazione Retino (°)</label>
                          <span className="text-[10px] font-mono font-bold text-neutral-600">{(selectedEntity as any).angle || 0}°</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          step="1"
                          className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          value={(selectedEntity as any).angle || 0}
                          onChange={(e) => updateEntity(selectedEntity.id, { angle: Number(e.target.value) })}
                        />
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="360"
                            className="w-full bg-white border border-neutral-300 text-xs rounded p-1.5 text-center font-mono font-semibold"
                            value={(selectedEntity as any).angle || 0}
                            onChange={(e) => updateEntity(selectedEntity.id, { angle: Number(e.target.value) % 360 })}
                          />
                        </div>
                      </div>

                      {/* Color selection */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block font-sans">Colore del Retino</label>
                        <div className="grid grid-cols-5 gap-2 mt-2">
                          {['#000000', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#64748b'].map((c) => (
                            <button
                              key={c}
                              onClick={() => updateEntity(selectedEntity.id, { color: c })}
                              className={`w-full aspect-square rounded-full flex items-center justify-center transition-transform ${selectedEntity.color === c ? "ring-2 ring-offset-2 ring-indigo-500 scale-110 shadow-md" : "hover:scale-105 border border-black/10"}`}
                              style={{ backgroundColor: c }}
                            >
                              {selectedEntity.color === c && <Check size={10} className="text-white drop-shadow-md" />}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Sfumatura (Radial Gradient) Slider */}
                      <div className="space-y-1.5 pt-2 border-t border-neutral-100">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block font-sans">Sfumatura (Gradiente)</label>
                          <span className="text-[10px] font-mono font-bold text-neutral-600">{(selectedEntity as any).sfumatura || 0}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          value={(selectedEntity as any).sfumatura || 0}
                          onChange={(e) => updateEntity(selectedEntity.id, { sfumatura: Number(e.target.value) })}
                        />
                        <p className="text-[9px] text-neutral-400 leading-tight">Crea una sfumatura radiale dal centro (ideale per riempimenti solidi)</p>
                      </div>
                    </div>
                  ) : selectedEntity.type === "image" ? (
                    <div className="space-y-4 font-sans">
                      <div className="bg-blue-50 border border-blue-200 text-blue-900 p-3 rounded-lg shadow-sm">
                        <p className="text-[10px] leading-tight font-mono font-bold uppercase">
                          🖼️ MODIFICA IMMAGINE
                        </p>
                      </div>
                      
                      {/* Scale / Width Slider */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block">Larghezza</label>
                          <span className="text-[10px] font-mono font-bold text-neutral-600">{Math.round((selectedEntity as any).width || 100)}</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="2000"
                          step="10"
                          className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          value={(selectedEntity as any).width || 100}
                          onChange={(e) => {
                            const newW = Number(e.target.value);
                            const ar = (selectedEntity as any).aspectRatio || 1;
                            updateEntity(selectedEntity.id, { width: newW, height: newW / ar });
                          }}
                        />
                      </div>

                      {/* Angle Slider */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block font-sans">Rotazione (°)</label>
                          <span className="text-[10px] font-mono font-bold text-neutral-600">{(selectedEntity as any).angle || 0}°</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          step="1"
                          className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          value={(selectedEntity as any).angle || 0}
                          onChange={(e) => updateEntity(selectedEntity.id, { angle: Number(e.target.value) })}
                        />
                      </div>

                      {/* Opacity Slider */}
                      <div className="space-y-1.5 pt-2 border-t border-neutral-100">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block font-sans">Opacità (%)</label>
                          <span className="text-[10px] font-mono font-bold text-neutral-600">{Math.round(((selectedEntity as any).opacity ?? 1) * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          step="1"
                          className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          value={Math.round(((selectedEntity as any).opacity ?? 1) * 100)}
                          onChange={(e) => updateEntity(selectedEntity.id, { opacity: Number(e.target.value) / 100 })}
                        />
                        <p className="text-[9px] text-neutral-400 leading-tight">Regola la trasparenza per ricalcare o posizionare sfondi</p>
                      </div>

                      {/* Brightness / Contrast */}
                      <div className="space-y-1.5 pt-2 border-t border-neutral-100">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block font-sans">Luminosità</label>
                          <span className="text-[10px] font-mono font-bold text-neutral-600">{(selectedEntity as any).brightness ?? 100}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="200"
                          step="5"
                          className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                          value={(selectedEntity as any).brightness ?? 100}
                          onChange={(e) => updateEntity(selectedEntity.id, { brightness: Number(e.target.value) })}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block font-sans">Contrasto</label>
                          <span className="text-[10px] font-mono font-bold text-neutral-600">{(selectedEntity as any).contrast ?? 100}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="200"
                          step="5"
                          className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                          value={(selectedEntity as any).contrast ?? 100}
                          onChange={(e) => updateEntity(selectedEntity.id, { contrast: Number(e.target.value) })}
                        />
                      </div>

                      {/* Ritaglio (Crop) */}
                      <div className="space-y-1.5 pt-2 border-t border-neutral-100">
                        <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block font-sans mb-1">Ritaglia Immagine (%)</label>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex justify-between items-center bg-neutral-50 px-2 py-1 border border-neutral-200 rounded">
                            <span className="text-[9px] text-neutral-500 uppercase tracking-wide">← Sinistra</span>
                            <input
                              type="number" min="0" max="90" step="1"
                              className="w-10 text-right text-[10px] bg-transparent outline-none font-mono"
                              value={(selectedEntity as any).crop?.left || 0}
                              onChange={(e) => updateEntity(selectedEntity.id, { crop: { ...(selectedEntity as any).crop, left: Math.min(90, Math.max(0, Number(e.target.value))) } })}
                            />
                          </div>
                          <div className="flex justify-between items-center bg-neutral-50 px-2 py-1 border border-neutral-200 rounded">
                            <span className="text-[9px] text-neutral-500 uppercase tracking-wide">Destra →</span>
                            <input
                              type="number" min="0" max="90" step="1"
                              className="w-10 text-right text-[10px] bg-transparent outline-none font-mono"
                              value={(selectedEntity as any).crop?.right || 0}
                              onChange={(e) => updateEntity(selectedEntity.id, { crop: { ...(selectedEntity as any).crop, right: Math.min(90, Math.max(0, Number(e.target.value))) } })}
                            />
                          </div>
                          <div className="flex justify-between items-center bg-neutral-50 px-2 py-1 border border-neutral-200 rounded">
                            <span className="text-[9px] text-neutral-500 uppercase tracking-wide">↑ Sopra</span>
                            <input
                              type="number" min="0" max="90" step="1"
                              className="w-10 text-right text-[10px] bg-transparent outline-none font-mono"
                              value={(selectedEntity as any).crop?.top || 0}
                              onChange={(e) => updateEntity(selectedEntity.id, { crop: { ...(selectedEntity as any).crop, top: Math.min(90, Math.max(0, Number(e.target.value))) } })}
                            />
                          </div>
                          <div className="flex justify-between items-center bg-neutral-50 px-2 py-1 border border-neutral-200 rounded">
                            <span className="text-[9px] text-neutral-500 uppercase tracking-wide">Sotto ↓</span>
                            <input
                              type="number" min="0" max="90" step="1"
                              className="w-10 text-right text-[10px] bg-transparent outline-none font-mono"
                              value={(selectedEntity as any).crop?.bottom || 0}
                              onChange={(e) => updateEntity(selectedEntity.id, { crop: { ...(selectedEntity as any).crop, bottom: Math.min(90, Math.max(0, Number(e.target.value))) } })}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Blend Mode Toggle */}
                      <div className="pt-2 border-t border-neutral-100">
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <div className="relative flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={(selectedEntity as any).blendMode === 'multiply'}
                              onChange={(e) => updateEntity(selectedEntity.id, { blendMode: e.target.checked ? 'multiply' : 'normal' })}
                              className="peer sr-only"
                            />
                            <div className="w-8 h-4 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                          </div>
                          <div>
                            <span className="text-xs font-bold text-neutral-700 block transition-colors group-hover:text-blue-700">Rendi Sfondo Trasparente</span>
                            <span className="text-[9px] text-neutral-400 block leading-tight mt-0.5">Applica fusione Moltiplica (il bianco scompare)</span>
                          </div>
                        </label>
                      </div>

                      {/* Convert to CAD Vectors */}
                      <div className="pt-3 border-t border-neutral-100 space-y-3">
                        <div className="bg-orange-50 border border-orange-200 p-2 rounded-lg space-y-2">
                          <p className="text-[10px] uppercase font-bold text-orange-800 tracking-wider flex items-center gap-1"><Sparkles size={12}/> Vettorializzazione Avanzata</p>
                          
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <label className="text-[9px] font-bold text-orange-900 block font-sans">Risoluzione Tracciato</label>
                              <span className="text-[9px] font-mono text-orange-800">{(selectedEntity as any).traceResolution || 1500}px</span>
                            </div>
                            <input
                              type="range" min="500" max="2500" step="100"
                              className="w-full h-1 bg-orange-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
                              value={(selectedEntity as any).traceResolution || 1500}
                              onChange={(e) => updateEntity(selectedEntity.id, { traceResolution: Number(e.target.value) })}
                            />
                          </div>

                          <div className="space-y-1 pt-1">
                            <div className="flex justify-between items-center">
                              <label className="text-[9px] font-bold text-orange-900 block font-sans">Semplificazione Linee</label>
                              <span className="text-[9px] font-mono text-orange-800">{(selectedEntity as any).traceSimplify ?? 0.5}</span>
                            </div>
                            <input
                              type="range" min="0.1" max="5.0" step="0.1"
                              className="w-full h-1 bg-orange-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
                              value={(selectedEntity as any).traceSimplify ?? 0.5}
                              onChange={(e) => updateEntity(selectedEntity.id, { traceSimplify: Number(e.target.value) })}
                            />
                            <p className="text-[8px] text-orange-700 leading-tight">Meno semplificazione (sinistra) = più dettagli e angoli esatti.</p>
                          </div>

                          <div className="pt-1">
                            <label className="flex items-center gap-2 cursor-pointer group">
                              <div className="relative flex items-center justify-center">
                                <input
                                  type="checkbox"
                                  checked={(selectedEntity as any).traceSmooth ?? false}
                                  onChange={(e) => updateEntity(selectedEntity.id, { traceSmooth: e.target.checked })}
                                  className="peer sr-only"
                                />
                                <div className="w-8 h-4 bg-orange-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-orange-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-600"></div>
                              </div>
                              <div>
                                <span className="text-[9px] font-bold text-orange-900 block font-sans transition-colors group-hover:text-orange-700">Ammorbidisci Contorni (Smooth)</span>
                                <span className="text-[8px] text-orange-700 block leading-tight mt-0.5">Disabilitalo per piante architettoniche con angoli retti.</span>
                              </div>
                            </label>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            const img = selectedEntity as any;
                            const imgElement = document.createElement('img');
                            imgElement.crossOrigin = 'anonymous';
                            imgElement.src = img.src;
                            imgElement.onload = () => {
                              const maxDim = img.traceResolution || 1500; // max resolution for tracing
                              const w = imgElement.naturalWidth;
                              const h = imgElement.naturalHeight;
                              const scaleToFit = Math.min(1, maxDim / Math.max(w, h));
                              
                              const traceW = Math.max(1, Math.floor(w * scaleToFit));
                              const traceH = Math.max(1, Math.floor(h * scaleToFit));
                              
                              const cvs = document.createElement('canvas');
                              cvs.width = traceW;
                              cvs.height = traceH;
                              const cx = cvs.getContext('2d');
                              if (!cx) return;
                              
                              // Handle cropping
                              const left = (img.crop?.left || 0) / 100;
                              const top = (img.crop?.top || 0) / 100;
                              const right = (img.crop?.right || 0) / 100;
                              const bottom = (img.crop?.bottom || 0) / 100;
                              
                              const sx = left * w;
                              const sy = top * h;
                              const sw = w * (1 - left - right);
                              const sh = h * (1 - top - bottom);
                              
                              if (sw <= 0 || sh <= 0) return;

                              // Apply Brightness / Contrast during drawing so it affects trace
                              let filters = [];
                              if (img.brightness !== undefined) filters.push(`brightness(${img.brightness}%)`);
                              if (img.contrast !== undefined) filters.push(`contrast(${img.contrast}%)`);
                              if (filters.length > 0) {
                                cx.filter = filters.join(' ');
                              }
                              
                              cx.drawImage(imgElement, sx, sy, sw, sh, 0, 0, traceW, traceH);
                              const idata = cx.getImageData(0, 0, traceW, traceH);
                              const data = idata.data;
                              
                              const values = new Float32Array(traceW * traceH);
                              for (let i = 0; i < traceW * traceH; i++) {
                                const r = data[i*4];
                                const g = data[i*4 + 1];
                                const b = data[i*4 + 2];
                                const a = data[i*4 + 3];

                                if (img.blendMode === 'multiply') {
                                  // Trasparenza in bianco (moltiplica). Il disegno è dove i pixel sono scuri.
                                  const brightness = (r + g + b) / 3;
                                  values[i] = 1 - (brightness / 255);
                                } else {
                                  // Se non usa la moltiplica, guardiamo l'alpha o il pixel non bianco
                                  if (a < 50) {
                                    values[i] = 0;
                                  } else {
                                    const brightness = (r + g + b) / 3;
                                    values[i] = 1 - (brightness / 255);
                                  }
                                }
                              }
                              
                              // We use 0.5 threshold to find boundaries
                              const isSmooth = img.traceSmooth ?? false;
                              const geoms = contours().size([traceW, traceH]).smooth(isSmooth).thresholds([0.5])(values);
                              
                              const newEntities: Entity[] = [];
                              const baseId = `cad-svg-${Date.now()}`;
                              const imgRenderW = img.width * (1 - left - right);
                              const imgRenderH = img.height * (1 - top - bottom);

                              const entScaleX = imgRenderW / traceW;
                              const entScaleY = imgRenderH / traceH;
                              
                              const angleRad = (img.angle || 0) * Math.PI / 180;
                              const cosA = Math.cos(angleRad);
                              const sinA = Math.sin(angleRad);
                              
                              // Center of original image placement
                              // The image is rendered from -img.width/2 to img.width/2 in its local space.
                              // Wait, the CADCanvas rendering logic:
                              // cx = img.point.x + img.width / 2;
                              // cy = img.point.y + img.height / 2;
                              // dx = -img.width / 2 + img.width * left;
                              // dy = -img.height / 2 + img.height * top;
                              
                              const centerX = img.point.x + img.width / 2;
                              const centerY = img.point.y + img.height / 2;
                              const offsetX = -img.width / 2 + img.width * left;
                              const offsetY = -img.height / 2 + img.height * top;

                              let eCount = 0;
                              
                              for (const contour of geoms) {
                                  if (!contour.coordinates || contour.coordinates.length === 0) continue;
                                  for (const polygon of contour.coordinates) {
                                      for (const ring of polygon) {
                                          if (ring.length < 3) continue;

                                          // Convert ring coordinates into full CAD point coords
                                          const pts = ring.map(pt => {
                                              let p1x = pt[0] * entScaleX;
                                              let p1y = pt[1] * entScaleY;

                                              // add offset
                                              let relX = p1x + offsetX;
                                              let relY = p1y + offsetY;
                                              
                                              // rotation
                                              let rotX = relX * cosA - relY * sinA;
                                              let rotY = relX * sinA + relY * cosA;
                                              
                                              return { x: centerX + rotX, y: centerY + rotY };
                                          });

                                          // Simplify
                                          const simplified = simplifyPoints(pts, img.traceSimplify ?? 0.5);
                                          if (simplified.length < 2) continue;

                                          for (let i = 0; i < simplified.length - 1; i++) {
                                              newEntities.push({
                                                  type: 'line',
                                                  id: `${baseId}-${eCount++}`,
                                                  color: img.color || '#000000',
                                                  lineWidth: 1,
                                                  layer: img.layer || '0',
                                                  start: simplified[i],
                                                  end: simplified[i+1]
                                              });
                                          }
                                      }
                                  }
                              }

                              if (newEntities.length > 0) {
                                  setEntities(prev => {
                                      const next = prev.filter(e => e.id !== img.id).concat(newEntities);
                                      commitToHistory(next);
                                      return next;
                                  });
                                  setSelectedId(null);
                                  setShortcutToast(`Successo! Immagine convertita in ${newEntities.length} linee vettoriali!`);
                                  setTimeout(() => setShortcutToast(null), 4000);
                              } else {
                                  setShortcutToast(`Nessun tratto rilevato nell'immagine.`);
                                  setTimeout(() => setShortcutToast(null), 3000);
                              }
                            };
                          }}
                          className="w-full relative overflow-hidden group py-2 px-3 rounded-lg flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-sm transition-all focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:outline-none"
                        >
                          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] bg-[length:250%_250%] opacity-0 group-hover:opacity-100 group-hover:animate-[shimmer_2s_infinite]"></div>
                          <Sparkles size={14} className="group-hover:rotate-12 transition-transform" />
                          <span className="text-xs font-bold tracking-wide">Vettorializza in Linee CAD</span>
                        </button>
                        <p className="text-[9px] text-neutral-400 leading-tight mt-1.5 text-center">Trasforma l'immagine in tracce CAD in modo da poter usare la gomma o agganciare i punti.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <label className="block text-sm">
                        Tipo Strumento:
                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={() =>
                              updateEntity(selectedEntity.id, { mode: "pencil" })
                            }
                            className={`p-2 rounded flex-1 text-xs font-bold transition-all ${selectedEntity.mode === "pencil" ? "bg-amber-600 text-white" : "bg-neutral-200"}`}
                          >
                            Matita
                          </button>
                          <button
                            onClick={() =>
                              updateEntity(selectedEntity.id, { mode: "ink" })
                            }
                            className={`p-2 rounded flex-1 text-xs font-bold transition-all ${selectedEntity.mode === "ink" ? "bg-indigo-600 text-white" : "bg-neutral-200"}`}
                          >
                            Kina
                          </button>
                          <button
                            onClick={() =>
                              updateEntity(selectedEntity.id, { mode: "CAD" })
                            }
                            className={`p-2 rounded flex-1 text-xs font-bold transition-all ${selectedEntity.mode === "CAD" ? "bg-emerald-600 text-white" : "bg-neutral-200"}`}
                          >
                            CAD
                          </button>
                        </div>
                      </label>
                      <label className="block text-sm">
                        Pennino:
                        <div className="flex gap-2 mt-1">
                          {[1, 2.5, 4].map((w) => (
                            <button
                              key={w}
                              onClick={() =>
                                updateEntity(selectedEntity.id, { lineWidth: w })
                              }
                              className={`p-2 rounded flex-1 text-xs font-bold ${selectedEntity.lineWidth === w ? "bg-indigo-600 text-white" : "bg-neutral-200 text-neutral-900 border border-neutral-400"}`}
                            >
                              p{w === 1 ? '1' : w === 2.5 ? '2' : '4'} ({w} mm)
                            </button>
                          ))}
                        </div>
                      </label>
                      <label className="block text-sm mt-4">
                        Colore:
                        <div className="grid grid-cols-5 gap-2 mt-2">
                          {['#000000', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#64748b'].map((c) => (
                            <button
                              key={c}
                              onClick={() => updateEntity(selectedEntity.id, { color: c })}
                              className={`w-full aspect-square rounded-full flex items-center justify-center transition-transform ${selectedEntity.color === c ? "ring-2 ring-offset-2 ring-indigo-500 scale-110 shadow-md" : "hover:scale-105 border border-black/10"}`}
                              style={{ backgroundColor: c }}
                            >
                              {selectedEntity.color === c && <Check size={10} className="text-white drop-shadow-md" />}
                            </button>
                          ))}
                        </div>
                      </label>

                      {/* MISURE GEOMETRICHE CAD DEDICATE */}
                      {selectedEntity && ['line', 'rectangle', 'circle', 'arc', 'hatch'].includes(selectedEntity.type) && (
                        <div className="mt-4 border-t border-neutral-100 pt-3.5 space-y-2 font-sans text-neutral-800">
                          <span className="text-[10px] font-black text-indigo-800 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                            <Sliders size={12} className="text-indigo-600 animate-pulse" />
                            Misure Geometriche Elemento
                          </span>
                          {(() => {
                            const type = selectedEntity.type as string;
                            if (type === 'line') {
                              const line = selectedEntity as any;
                              const start = line.start || { x: 0, y: 0 };
                              const end = line.end || { x: 0, y: 0 };
                              const lengthCm = Math.hypot(end.x - start.x, end.y - start.y);
                              const lengthM = lengthCm / 100;
                              
                              return (
                                <div className="space-y-1.5 bg-indigo-50/50 border border-indigo-100/50 p-2.5 rounded-xl">
                                  <div className="flex justify-between items-center text-[10.5px]">
                                    <span className="text-neutral-500 font-semibold">Lunghezza Reale:</span>
                                    <span className="font-mono font-black text-indigo-950 text-[11px] bg-white border border-indigo-100 px-2 py-0.5 rounded">
                                      {lengthCm.toFixed(1)} cm / {lengthM.toFixed(3)} m
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-indigo-50/50 text-[9px]">
                                    <div className="flex justify-between">
                                      <span className="text-neutral-400 font-mono">X1: {start.x.toFixed(0)}</span>
                                      <span className="text-neutral-400 font-mono">Y1: {start.y.toFixed(0)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-neutral-400 font-mono">X2: {end.x.toFixed(0)}</span>
                                      <span className="text-neutral-400 font-mono">Y2: {end.y.toFixed(0)}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            if (type === 'rectangle') {
                              const rect = selectedEntity as any;
                              const p1 = rect.p1 || { x: 0, y: 0 };
                              const p2 = rect.p2 || { x: 0, y: 0 };
                              const w = Math.abs(p2.x - p1.x);
                              const h = Math.abs(p2.y - p1.y);
                              
                              const areaSqCm = w * h;
                              const areaSqM = areaSqCm / 10000;
                              const perimeterCm = 2 * (w + h);
                              const perimeterM = perimeterCm / 100;
                              
                              return (
                                <div className="grid grid-cols-2 gap-1.5 text-[10px] bg-slate-50 border border-neutral-200/50 p-2.5 rounded-xl">
                                  <div className="bg-white p-2 rounded-lg border border-neutral-100">
                                    <span className="block text-[7.5px] text-neutral-400 font-extrabold uppercase tracking-wider">Superficie Base</span>
                                    <span className="font-mono font-black text-neutral-800 text-[10.5px]">{areaSqM.toFixed(3)} mq</span>
                                  </div>
                                  <div className="bg-white p-2 rounded-lg border border-neutral-100">
                                    <span className="block text-[7.5px] text-neutral-400 font-extrabold uppercase tracking-wider">Perimetro</span>
                                    <span className="font-mono font-black text-neutral-800 text-[10.5px]">{perimeterM.toFixed(2)} m</span>
                                  </div>
                                  <div className="bg-white p-2 rounded-lg border border-neutral-100 col-span-2 flex justify-between items-center px-2 py-1.5 align-middle">
                                    <span className="text-[7.5px] text-neutral-400 font-extrabold uppercase tracking-wider">Dimensioni Lati</span>
                                    <span className="font-mono font-black text-indigo-700 text-[10.5px]">{w.toFixed(1)} × {h.toFixed(1)} cm</span>
                                  </div>
                                </div>
                              );
                            }
                            if (type === 'circle') {
                              const circle = selectedEntity as any;
                              const r = circle.radius || 0;
                              const d = 2 * r;
                              const circCm = 2 * Math.PI * r;
                              const circM = circCm / 100;
                              const areaSqCm = Math.PI * r * r;
                              const areaSqM = areaSqCm / 10000;
                              
                              return (
                                <div className="grid grid-cols-2 gap-1.5 text-[10px] bg-slate-50 border border-neutral-200/50 p-2.5 rounded-xl">
                                  <div className="bg-white p-2 rounded-lg border border-neutral-100">
                                    <span className="block text-[7.5px] text-neutral-400 font-extrabold uppercase tracking-wider">Superficie Area</span>
                                    <span className="font-mono font-black text-neutral-800 text-[10.5px]">{areaSqM.toFixed(3)} mq</span>
                                  </div>
                                  <div className="bg-white p-2 rounded-lg border border-neutral-100">
                                    <span className="block text-[7.5px] text-neutral-400 font-extrabold uppercase tracking-wider">Circonferenza</span>
                                    <span className="font-mono font-black text-neutral-800 text-[10.5px]">{circM.toFixed(2)} m</span>
                                  </div>
                                  <div className="bg-white p-2 rounded-lg border border-neutral-100 flex justify-between items-center col-span-2 px-2 py-1">
                                    <span className="text-[7.5px] text-neutral-400 font-extrabold uppercase tracking-wider">Raggio</span>
                                    <span className="font-mono font-black text-indigo-700 text-[10.5px]">{r.toFixed(1)} cm</span>
                                  </div>
                                  <div className="bg-white p-2 rounded-lg border border-neutral-100 flex justify-between items-center col-span-2 px-2 py-1">
                                    <span className="text-[7.5px] text-neutral-400 font-extrabold uppercase tracking-wider">Diametro</span>
                                    <span className="font-mono font-black text-indigo-700 text-[10.5px]">{d.toFixed(1)} cm</span>
                                  </div>
                                </div>
                              );
                            }
                            if (type === 'arc') {
                              const arc = selectedEntity as any;
                              const r = arc.radius || 0;
                              const spanAng = Math.abs(arc.endAngle - arc.startAngle) || 0;
                              const arcLenCm = r * spanAng * Math.PI / 180;
                              const arcLenM = arcLenCm / 100;
                              
                              return (
                                <div className="grid grid-cols-2 gap-1.5 text-[10px] bg-slate-50 border border-neutral-200/50 p-2.5 rounded-xl">
                                  <div className="bg-white p-2 rounded-lg border border-neutral-100">
                                    <span className="block text-[7.5px] text-neutral-400 font-extrabold uppercase tracking-wider font-sans">Sviluppo Arco</span>
                                    <span className="font-mono font-black text-indigo-750 text-[10.5px]">{arcLenM.toFixed(3)} m</span>
                                  </div>
                                  <div className="bg-white p-2 rounded-lg border border-neutral-100">
                                    <span className="block text-[7.5px] text-neutral-400 font-extrabold uppercase tracking-wider font-sans">Apertura Angolo</span>
                                    <span className="font-mono font-black text-neutral-800 text-[10.5px]">{spanAng.toFixed(1)}°</span>
                                  </div>
                                  <div className="bg-white p-2 rounded-lg border border-neutral-100 flex justify-between items-center col-span-2 px-2 py-1">
                                    <span className="text-[7.5px] text-neutral-400 font-extrabold uppercase tracking-wider">Raggio dell'Arco</span>
                                    <span className="font-mono font-black text-indigo-700 text-[10.5px]">{r.toFixed(1)} cm</span>
                                  </div>
                                </div>
                              );
                            }
                            if (type === 'hatch') {
                              const hatch = selectedEntity as any;
                              const pts = hatch.points || [];
                              
                              let area = 0;
                              const len = pts.length;
                              for (let i = 0; i < len; i++) {
                                const p1 = pts[i];
                                const p2 = pts[(i + 1) % len];
                                area += p1.x * p2.y - p2.x * p1.y;
                              }
                              const areaSqM = Math.abs(area) / 20000;
                              
                              let perimeter = 0;
                              for (let i = 0; i < len; i++) {
                                const p = pts[i];
                                const nextP = pts[(i + 1) % len];
                                perimeter += Math.sqrt((nextP.x - p.x)**2 + (nextP.y - p.y)**2);
                              }
                              const perimeterM = perimeter / 100;
                              
                              return (
                                <div className="grid grid-cols-2 gap-1.5 text-[10px] bg-slate-50 border border-neutral-200/50 p-2.5 rounded-xl">
                                  <div className="bg-white p-2 rounded-lg border border-neutral-100">
                                    <span className="block text-[7.5px] text-neutral-400 font-extrabold uppercase tracking-wider">Superficie Campitura</span>
                                    <span className="font-mono font-black text-neutral-800 text-[10.5px]">{areaSqM.toFixed(3)} mq</span>
                                  </div>
                                  <div className="bg-white p-2 rounded-lg border border-neutral-100">
                                    <span className="block text-[7.5px] text-neutral-400 font-extrabold uppercase tracking-wider">Perimetro</span>
                                    <span className="font-mono font-black text-neutral-800 text-[10.5px]">{perimeterM.toFixed(2)} m</span>
                                  </div>
                                  <div className="bg-white p-2 rounded-lg border border-neutral-100 flex justify-between items-center col-span-2 px-2 py-1">
                                    <span className="text-[7.5px] text-neutral-400 font-extrabold uppercase tracking-wider">Numero Vertici</span>
                                    <span className="font-mono font-black text-indigo-700 text-[10.5px]">{len} punti</span>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      )}

                      {selectedEntity.type === "dimension" && (
                        <div className="space-y-4 pt-2 border-t border-neutral-100 font-sans">
                          {/* Testo Personalizzato */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-neutral-500 tracking-widest block">
                              Testo Personalizzato
                            </label>
                            <input
                              type="text"
                              value={(selectedEntity as any).customText || ""}
                              placeholder="Default (Misurato)"
                              onChange={(e) =>
                                updateEntity(selectedEntity.id, {
                                  customText: e.target.value,
                                })
                              }
                              className="w-full bg-neutral-100 border border-neutral-200 text-xs rounded p-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none font-semibold text-neutral-800"
                            />
                          </div>

                          {/* Scala Locale */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-black uppercase text-neutral-500 tracking-widest">
                                Scala Quota Locale
                              </label>
                              <span className="font-mono text-indigo-600 font-bold text-xs bg-indigo-50 px-1.5 py-0.5 rounded">
                                {((selectedEntity as any).scale ?? 1.0).toFixed(2)}x
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0.1"
                              max="5.0"
                              step="0.1"
                              value={(selectedEntity as any).scale ?? 1.0}
                              onChange={(e) =>
                                updateEntity(selectedEntity.id, {
                                  scale: parseFloat(e.target.value),
                                })
                              }
                              className="w-full h-1 accent-indigo-600 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>

                          {/* Decimali Locale */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-neutral-500 tracking-widest block">
                              Precisione Decimali
                            </label>
                            <select
                              value={(selectedEntity as any).decimals ?? ""}
                              onChange={(e) =>
                                updateEntity(selectedEntity.id, {
                                  decimals: e.target.value === "" ? undefined : parseInt(e.target.value),
                                })
                              }
                              className="w-full bg-white border border-neutral-200 text-xs rounded p-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none font-bold text-neutral-700"
                            >
                              <option value="">Eredita Globale</option>
                              <option value="0">0 (Nessun Decimale)</option>
                              <option value="1">1 Decimale</option>
                              <option value="2">2 Decimali</option>
                              <option value="3">3 Decimali</option>
                              <option value="4">4 Decimali</option>
                            </select>
                          </div>

                          {/* Tipo Orientamento Quota */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-neutral-500 tracking-widest block">
                              Orientamento Quota
                            </label>
                            <select
                              value={(selectedEntity as any).style ?? 1}
                              onChange={(e) =>
                                updateEntity(selectedEntity.id, {
                                  style: parseInt(e.target.value),
                                })
                              }
                              className="w-full bg-white border border-neutral-200 text-xs rounded p-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none font-bold text-neutral-700"
                            >
                              <option value={1}>Lineare (Auto)</option>
                              <option value={2}>Allineata</option>
                              <option value={3}>Verticale Constrained</option>
                              <option value={4}>Orizzontale Constrained</option>
                              <option value={5}>Auto Orto</option>
                            </select>
                          </div>

                          {/* COMPUTO METRICO GECOLA INTEGRATION */}
                          <div 
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "copy";
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              try {
                                const raw = e.dataTransfer.getData("text/plain");
                                const item = JSON.parse(raw);
                                if (item && item.codice) {
                                  updateEntity(selectedEntity.id, {
                                    prezzarioCodice: item.codice,
                                    prezzarioDescrizione: item.descrizione,
                                    prezzarioUnita: item.unita || "m",
                                    prezzarioPrezzo: item.prezzo || 0,
                                    includeInComputo: true,
                                  });
                                  setShortcutToast("Voce associata a questa misura! 📋");
                                  setTimeout(() => setShortcutToast(null), 2500);
                                }
                              } catch(err){}
                            }}
                            className="bg-amber-50/70 border-2 border-dashed border-amber-300 rounded-xl p-3 space-y-3 mt-4 text-neutral-800"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-black text-amber-900 uppercase tracking-wider flex items-center gap-1">
                                📋 Computo Gecola
                              </span>
                              <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-amber-950">
                                <input
                                  type="checkbox"
                                  checked={!!(selectedEntity as any).includeInComputo}
                                  onChange={(e) => updateEntity(selectedEntity.id, { includeInComputo: e.target.checked })}
                                  className="accent-amber-600 rounded"
                                />
                                Computa
                              </label>
                            </div>

                            {/* DRAG FEEDBACK AREA */}
                            {!(selectedEntity as any).prezzarioCodice && (
                              <div className="bg-white/80 border border-amber-200 rounded-lg p-2.5 text-center text-[10px] text-amber-800 font-bold animate-pulse">
                                📑 Trascina qui una voce dal Prezzario per caricarla automaticamente!
                              </div>
                            )}

                            {/* CODICE PREZZARIO */}
                            <div className="space-y-1">
                              <label className="text-[9px] font-extrabold uppercase text-amber-900 tracking-widest block">
                                Codice Voce
                              </label>
                              <input
                                type="text"
                                placeholder="es: NP.OP08.015b"
                                value={(selectedEntity as any).prezzarioCodice || ""}
                                onChange={(e) => updateEntity(selectedEntity.id, { prezzarioCodice: e.target.value })}
                                className="w-full bg-white border border-amber-200 text-xs rounded p-2 focus:ring-1 focus:ring-amber-500 focus:outline-none font-semibold"
                              />
                            </div>

                            {/* DESCRIZIONE */}
                            <div className="space-y-1">
                              <label className="text-[9px] font-extrabold uppercase text-amber-900 tracking-widest block">
                                Descrizione Voce
                              </label>
                              <textarea
                                rows={2}
                                placeholder="Trascina la voce qui o scrivi una descrizione..."
                                value={(selectedEntity as any).prezzarioDescrizione || ""}
                                onChange={(e) => updateEntity(selectedEntity.id, { prezzarioDescrizione: e.target.value })}
                                className="w-full bg-white border border-amber-200 text-xs rounded p-2 focus:ring-1 focus:ring-amber-500 focus:outline-none font-semibold leading-relaxed resize-none"
                              />
                            </div>

                            {/* ROW: UNITA & PREZZO */}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-[9px] font-extrabold uppercase text-amber-900 tracking-widest block">
                                  Unità Misura
                                  </label>
                                <input
                                  type="text"
                                  placeholder="es: m, mq, cad"
                                  value={(selectedEntity as any).prezzarioUnita || ""}
                                  onChange={(e) => updateEntity(selectedEntity.id, { prezzarioUnita: e.target.value })}
                                  className="w-full bg-white border border-amber-200 text-xs rounded p-2 focus:ring-1 focus:ring-amber-500 focus:outline-none font-semibold text-center"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-extrabold uppercase text-amber-900 tracking-widest block">
                                  Prezzo (€)
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={(selectedEntity as any).prezzarioPrezzo ?? ""}
                                  onChange={(e) => updateEntity(selectedEntity.id, { prezzarioPrezzo: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
                                  className="w-full bg-white border border-amber-200 text-xs rounded p-2 focus:ring-1 focus:ring-amber-500 focus:outline-none font-semibold text-center"
                                />
                              </div>
                            </div>

                            {/* MOLTIPLICATORE */}
                            <div className="space-y-1">
                              <label className="text-[9px] font-extrabold uppercase text-amber-900 tracking-widest flex justify-between items-center">
                                <span>Fattore / Moltiplicatore (es: Altezza)</span>
                                <span className="font-mono text-amber-850">{(selectedEntity as any).moltiplicatore ?? 1.0}x</span>
                              </label>
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={(selectedEntity as any).moltiplicatore ?? 1.0}
                                onChange={(e) => updateEntity(selectedEntity.id, { moltiplicatore: e.target.value === "" ? 1.0 : parseFloat(e.target.value) })}
                                className="w-full bg-white border border-amber-200 text-xs rounded p-2 focus:ring-1 focus:ring-amber-500 focus:outline-none font-semibold"
                              />
                            </div>

                            {/* CALCOLO DELLE MISURE ESTIMATIVE */}
                            {(() => {
                              const dx = selectedEntity.end.x - selectedEntity.start.x;
                              const dy = selectedEntity.end.y - selectedEntity.start.y;
                              const lengthM = Math.hypot(dx, dy) / 100;
                              const mult = (selectedEntity as any).moltiplicatore ?? 1.0;
                              const qty = lengthM * mult;
                              const price = (selectedEntity as any).prezzarioPrezzo ?? 0.0;
                              const tot = qty * price;
                              const um = (selectedEntity as any).prezzarioUnita || "m";

                              return (
                                <div className="bg-amber-950/10 border border-amber-200 p-2 rounded-lg space-y-1 font-sans text-[10.5px]">
                                  <div className="flex justify-between">
                                    <span className="text-amber-900 font-bold">Lunghezza Rilevata:</span>
                                    <span className="font-mono font-black">{lengthM.toFixed(2)} m</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-amber-900 font-bold">Quantità Computata:</span>
                                    <span className="font-mono font-black">{qty.toFixed(2)} {um}</span>
                                  </div>
                                  <div className="flex justify-between border-t border-amber-200/50 pt-1 mt-1 text-[11px]">
                                    <span className="text-amber-950 font-black">Importo Estimato:</span>
                                    <span className="font-mono font-black text-amber-950 bg-amber-200/50 px-1.5 py-0.5 rounded">€ {tot.toFixed(2)}</span>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </>
                  )) : (
                    <>
                      {selectedTool === 'Hatch' ? (
                      <div className="space-y-4">
                        <div className="bg-emerald-950 border border-emerald-800 text-emerald-100 p-4 rounded-xl shadow-lg">
                          <p className="text-xs leading-normal font-sans">
                            <span className="text-emerald-400 font-extrabold block mb-2 text-[10px] font-mono tracking-widest uppercase">✨ RIEMPIMENTO (HATCH):</span>
                            Clicca in un qualsiasi punto interno a un'area chiusa per riempirla automaticamente con un retino geometrico (Hatch).
                          </p>
                          <div className="mt-3 text-[10px] text-emerald-300 font-medium space-y-2 pr-1">
                            <div>• I contorni esterni devono intersecarsi o toccarsi completamente.</div>
                          </div>
                        </div>

                        {/* Default Hatch Settings */}
                        <div className="space-y-4 pt-2 border-t border-neutral-100">
                          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Impostazioni Predefinite</p>
                          
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block">Stile Retino (Pattern)</label>
                            <select
                              className="w-full bg-white border border-neutral-300 text-xs rounded p-2 font-semibold capitalize"
                              value={defaultHatchStyle.pattern}
                              onChange={(e) => setDefaultHatchStyle(prev => ({ ...prev, pattern: e.target.value }))}
                            >
                              <option value="Solid">Pieno (Solid)</option>
                              <option value="ANSI31">ANSI31 (Obliquo Semplice)</option>
                              <option value="ANSI32">ANSI32 (Obliquo Doppio)</option>
                              <option value="ANSI33">ANSI33 (Dashed/Solid Obliquo)</option>
                              <option value="ANSI34">ANSI34 (Obliquo Tratteggiato)</option>
                              <option value="Grid">Griglia (Quadrettato)</option>
                              <option value="Cross">Incrocio (Griglia 45°)</option>
                              <option value="Stripe">Strisce Verticali</option>
                              <option value="Horizontal">Strisce Orizzontali</option>
                              <option value="Zigzag">Zig-Zag</option>
                              <option value="Brick">Mattoni CAD</option>
                              <option value="Checker">Scacchiera (Checker)</option>
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block">Scala Retino</label>
                              <span className="text-[10px] font-mono font-bold text-neutral-600">{defaultHatchStyle.scale}</span>
                            </div>
                            <input
                              type="range"
                              min="4"
                              max="180"
                              step="1"
                              className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                              value={defaultHatchStyle.scale}
                              onChange={(e) => setDefaultHatchStyle(prev => ({ ...prev, scale: Number(e.target.value) }))}
                            />
                          </div>

                          <div className="space-y-1.5">
                              <div className="flex justify-between items-center">
                                <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block">Inclinazione (°)</label>
                                <span className="text-[10px] font-mono font-bold text-neutral-600">{defaultHatchStyle.angle}°</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="360"
                                step="1"
                                className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                value={defaultHatchStyle.angle}
                                onChange={(e) => setDefaultHatchStyle(prev => ({ ...prev, angle: Number(e.target.value) }))}
                              />
                            </div>

                            <div className="space-y-1.5 pt-2 border-t border-neutral-100">
                              <div className="flex justify-between items-center">
                                <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block font-sans">Sfumatura Predefinita</label>
                                <span className="text-[10px] font-mono font-bold text-neutral-600">{(defaultHatchStyle as any).sfumatura || 0}%</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                value={(defaultHatchStyle as any).sfumatura || 0}
                                onChange={(e) => setDefaultHatchStyle(prev => ({ ...prev, sfumatura: Number(e.target.value) }))}
                              />
                              <p className="text-[9px] text-neutral-400 leading-tight">I nuovi riempimenti solidi useranno questa sfumatura</p>
                            </div>
                          </div>
                        </div>
                    ) : selectedTool === 'Specchio' ? (
                      <div className="bg-indigo-950 border border-indigo-800 text-indigo-100 p-4 rounded-xl shadow-lg">
                        <p className="text-xs leading-normal font-sans">
                          <span className="text-indigo-400 font-extrabold block mb-2 text-[10px] font-mono tracking-widest uppercase">✨ SPECCHIO (MIRROR):</span>
                          Crea un asse di simmetria come un normale segmento... poi seleziona gli oggetti.
                        </p>
                      </div>
                    ) : selectedTool === 'LiveMirror' ? (
                      <div className="bg-emerald-950 border border-emerald-800 text-emerald-100 p-4 rounded-xl shadow-lg space-y-3">
                        <p className="text-xs leading-normal font-sans">
                          <span className="text-emerald-400 font-extrabold block mb-2 text-[10px] font-mono tracking-widest uppercase">✨ SIMMETRIA LIVE:</span>
                          Traccia un asse di simmetria (cliccando due punti o selezionando una linea esistente). Qualsiasi disegno, modifica, taglio (forbici) o cancellazione verrà specchiato in tempo reale!
                        </p>
                        
                        {liveMirrorAxis ? (
                          <div className="bg-emerald-900/60 p-2.5 rounded-lg border border-emerald-700/50 flex items-center justify-between text-xs">
                            <span className="text-emerald-200 font-medium">Asse Attivo in Memoria</span>
                            <button
                              onClick={() => handleUpdateLiveMirrorAxis(null)}
                              className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-[10px] font-bold transition-all cursor-pointer"
                            >
                              Rimuovi Asse
                            </button>
                          </div>
                        ) : (
                          <div className="text-[11px] text-emerald-300 font-medium italic">
                            Nessun asse attivo. Tracciane uno o selezionalo dalla memoria sotto.
                          </div>
                        )}

                        {savedLiveMirrorAxes.length > 0 && (
                          <div className="pt-2 border-t border-emerald-800/80 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Assi Salvati in Memoria ({savedLiveMirrorAxes.length})</span>
                              <button
                                onClick={() => {
                                  setSavedLiveMirrorAxes([]);
                                  try { localStorage.removeItem('gecola_live_mirror_axes'); } catch {}
                                }}
                                className="text-[9px] text-neutral-400 hover:text-red-300 transition-colors cursor-pointer"
                              >
                                Pulisci Memoria
                              </button>
                            </div>
                            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                              {savedLiveMirrorAxes.map((axis, idx) => (
                                <div 
                                  key={idx}
                                  onClick={() => handleUpdateLiveMirrorAxis(axis)}
                                  className={`p-2 rounded-lg border text-[10px] transition-all cursor-pointer flex items-center justify-between ${liveMirrorAxis && Math.hypot(liveMirrorAxis.start.x - axis.start.x, liveMirrorAxis.start.y - axis.start.y) < 2 ? 'bg-emerald-600/30 border-emerald-400 text-white' : 'bg-emerald-900/30 border-emerald-800 text-emerald-200 hover:bg-emerald-900/60'}`}
                                >
                                  <div className="font-mono">
                                    P1({Math.round(axis.start.x)},{Math.round(axis.start.y)}) → P2({Math.round(axis.end.x)},{Math.round(axis.end.y)})
                                  </div>
                                  <span className="text-[9px] px-1.5 py-0.5 bg-emerald-700/50 rounded font-bold">Usa</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : selectedTool === 'Eraser' ? (
                      <div className="space-y-4">
                        <div className="bg-neutral-900 border border-neutral-800 text-white p-3.5 rounded-xl shadow-xs">
                          <p className="text-xs leading-normal font-sans mb-3">
                            <span className="text-amber-400 font-extrabold block mb-2 text-[10px] font-mono tracking-widest uppercase">✨ GOMME DI PRECISIONE:</span>
                            Entrambe le gomme hanno una punta sagomata ideale per cancellature di precisione assoluta.
                          </p>
                          <div className="bg-neutral-800/80 p-2.5 rounded-lg border border-neutral-700 space-y-1 text-[10px] text-neutral-300">
                            <div className="flex items-center gap-1.5 font-bold text-amber-300">
                              <MousePointer2 size={10} /> CLIC DESTRO SUL FOGLIO
                            </div>
                            <p className="font-sans leading-relaxed text-[9px]">Clicca col tasto destro del mouse sulla tavola da disegno per scambiare al volo le due gomme!</p>
                          </div>
                        </div>

                        {/* Switch Eraser Type Options in UI */}
                        <div className="space-y-4 pt-2 border-t border-neutral-100">
                          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Tipo di Gomma Attiva</p>
                          <div className="space-y-2">
                            <button
                              onClick={() => setEraserType('miracolo')}
                              className={`w-full p-2.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col gap-1 ${eraserType === 'miracolo' ? 'bg-white/10 border-indigo-400 ring-2 ring-indigo-100' : 'bg-white border-neutral-200 hover:bg-neutral-50 shadow-xs'}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-white border border-neutral-300 shadow-md flex items-center justify-center">
                                  <Sparkles size={12} className="text-indigo-500" />
                                </span>
                                <span className={`text-[10px] font-black uppercase tracking-wider ${eraserType === 'miracolo' ? 'text-indigo-800' : 'text-neutral-500'}`}>Pulisci Eccedenze</span>
                              </div>
                              <span className="text-[9px] text-neutral-400 leading-normal">Elimina automaticamente i segmenti che eccedono rispetto alle intersezioni.</span>
                            </button>

                            <button
                              onClick={() => setEraserType('pencil')}
                              className={`w-full p-2.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col gap-1 ${eraserType === 'pencil' ? 'bg-neutral-100 border-neutral-400 ring-2 ring-neutral-200' : 'bg-white border-neutral-200 hover:bg-neutral-50 shadow-xs'}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded bg-neutral-200 border border-neutral-400 shadow-xs inline-block"></span>
                                <span className={`text-[10px] font-black uppercase tracking-wider ${eraserType === 'pencil' ? 'text-neutral-800' : 'text-neutral-500'}`}>Matita (Bianca-Grigia)</span>
                              </div>
                              <span className="text-[9px] text-neutral-400 leading-normal">Cancella solo linee a matita dura/media/morbida. Non tocca la china.</span>
                            </button>

                            <button
                              onClick={() => setEraserType('all')}
                              className={`w-full p-2.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col gap-1 ${eraserType === 'all' ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-100' : 'bg-white border-neutral-200 hover:bg-neutral-50 shadow-xs'}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded bg-amber-400 border border-amber-600 shadow-xs inline-block"></span>
                                <span className={`text-[10px] font-black uppercase tracking-wider ${eraserType === 'all' ? 'text-amber-800' : 'text-neutral-500'}`}>China/Tutto (Gialla)</span>
                              </div>
                              <span className="text-[9px] text-neutral-400 leading-normal">Cancella china, matita, testi, retini, quote e tutto il resto.</span>
                            </button>

                            <button
                              onClick={() => setEraserType('lametta')}
                              className={`w-full p-2.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col gap-1 ${eraserType === 'lametta' ? 'bg-slate-100 border-slate-400 ring-2 ring-slate-200' : 'bg-white border-neutral-200 hover:bg-neutral-50 shadow-xs'}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-4 h-2.5 bg-slate-300 border border-slate-500 rounded-xs inline-block relative"></span>
                                <span className={`text-[10px] font-black uppercase tracking-wider ${eraserType === 'lametta' ? 'text-slate-800' : 'text-neutral-500'}`}>Lametta Gillette (China e altro)</span>
                              </div>
                              <span className="text-[9px] text-neutral-400 leading-normal">La mitica lametta. Cancella all'istante solo sotto la punta sottile dello spigolo.</span>
                            </button>
                          </div>

                          {/* Eraser controls based on chosen type */}
                          {eraserType === 'lametta' ? (
                            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1">
                              <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1">
                                <span className="inline-block w-2 h-2 rounded-full bg-slate-400 animate-pulse"></span>
                                Caratteristiche Lametta
                              </p>
                              <p className="text-[9px] text-slate-500 leading-relaxed">
                                La lametta Gillette rimuove istantaneamente ogni genere di tratto sul punto esatto dello spigolo inclinato. <strong>Spessore (2.5px) e intensità di raschiatura sono costanti e preimpostati</strong> per un lavoro di sbarbatura d'epoca perfetto.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-4 pt-2 border-t border-neutral-100">
                              {/* Eraser radius slider */}
                              <div className="space-y-1.5">
                                <div className="flex justify-between items-center">
                                  <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block font-sans">Spessore Punta Gomma</label>
                                  <span className="text-[10px] font-mono font-bold text-neutral-600">{eraserRadius} mm (px)</span>
                                </div>
                                <input
                                  type="range"
                                  min="5"
                                  max="100"
                                  step="5"
                                  value={eraserRadius}
                                  onChange={(e) => setEraserRadius(Number(e.target.value))}
                                  className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 font-bold"
                                />
                                <p className="text-[9px] text-neutral-400 leading-tight">Larghezza dell'area di azione della gomma.</p>
                              </div>

                              {/* Eraser intensity slider */}
                              <div className="space-y-1.5 pt-2 border-t border-neutral-100/50">
                                <div className="flex justify-between items-center">
                                  <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block font-sans">Intensità Cancellazione (%)</label>
                                  <span className="text-[10px] font-mono font-bold text-neutral-600">{eraserIntensity}%</span>
                                </div>
                                <input
                                  type="range"
                                  min="10"
                                  max="100"
                                  step="5"
                                  value={eraserIntensity}
                                  onChange={(e) => setEraserIntensity(Number(e.target.value))}
                                  className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 font-bold"
                                />
                                <p className="text-[9px] text-neutral-400 leading-tight">Opacità rimossa a ogni passaggio (sfumatura o cancellazione drastica).</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-neutral-800 text-neutral-100 p-3 rounded-lg shadow-lg border border-neutral-700">
                          <p className="text-[10px] leading-tight font-mono opacity-80">
                            <span className="text-amber-400 font-bold">PENNE TECNICHE:</span><br/>
                            Scegli lo spessore del pennino. Il layer viene aggiornato automaticamente in base alla selezione.
                          </p>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-2">
                               <Sparkles size={10} /> Stile Tecnico CAD
                            </label>
                            <div className="grid grid-cols-4 gap-2">
                              {[0.25, 0.5, 1, 2].map(w => (
                                <button
                                  key={w}
                                  onClick={() => {
                                    setDefaultLineStyle({ mode: "CAD", color: '#000000', lineWidth: w, dashed: false });
                                    handleToolClick("Line");
                                  }}
                                  className={`p-2 rounded-lg border transition-all flex flex-col items-center justify-center gap-1 ${defaultLineStyle.mode === "CAD" && defaultLineStyle.lineWidth === w ? "bg-emerald-900 border-emerald-700 ring-4 ring-emerald-200 shadow-md transform -translate-y-0.5" : "bg-neutral-50 border-neutral-200 hover:bg-white"}`}
                                >
                                  <span className={`text-[10px] font-black ${defaultLineStyle.mode === "CAD" && defaultLineStyle.lineWidth === w ? "text-white" : "text-neutral-500"}`}>
                                    {w}
                                  </span>
                                  <span className="text-[8px] text-neutral-400">mm</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-2">
                               <PenTool size={10} /> Pennini Kina
                            </label>
                            <div className="grid grid-cols-4 gap-2">
                              {[0.25, 0.5, 1, 2].map(w => (
                                <button
                                  key={w}
                                  onClick={() => {
                                    setDefaultLineStyle({ mode: "ink", color: '#000000', lineWidth: w, dashed: false });
                                    handleToolClick("Line");
                                  }}
                                  className={`p-2 rounded-lg border transition-all flex flex-col items-center justify-center gap-1 ${defaultLineStyle.mode === "ink" && defaultLineStyle.lineWidth === w ? "bg-indigo-900 border-neutral-700 ring-4 ring-neutral-200 shadow-md transform -translate-y-0.5" : "bg-neutral-50 border-neutral-200 hover:bg-white"}`}
                                >
                                  <span className={`text-[10px] font-black ${defaultLineStyle.mode === "ink" && defaultLineStyle.lineWidth === w ? "text-white" : "text-neutral-500"}`}>
                                    {w}
                                  </span>
                                  <span className="text-[8px] text-neutral-400">mm</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-2">
                               <Pencil size={10} /> Matite di Grafite
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                              {['2H', 'HB', '2B'].map(m => {
                                const color = m === '2H' ? '#bbbbbb' : (m === 'HB' ? '#444444' : '#111111');
                                const width = m === '2H' ? 1 : (m === 'HB' ? 2 : 3);
                                const isSelected = defaultLineStyle.mode === 'pencil' && defaultLineStyle.color === color;
                                return (
                                  <button
                                    key={m}
                                    onClick={() => {
                                      setDefaultLineStyle({ mode: "pencil", color, lineWidth: width, dashed: false });
                                      handleToolClick("Line");
                                    }}
                                    className={`p-2.5 rounded-lg border transition-all flex flex-col items-center justify-center gap-1 ${isSelected ? "bg-amber-50 border-amber-300 ring-4 ring-amber-100 shadow-md transform -translate-y-0.5" : "bg-neutral-50 border-neutral-200 hover:bg-white"}`}
                                  >
                                    <span className={`text-[10px] font-black ${isSelected ? "text-amber-800" : "text-neutral-500"}`}>{m}</span>
                                    <span className="text-[8px] text-neutral-400">{m === '2H' ? 'Dura' : (m === 'HB' ? 'Media' : 'Morb.')}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="space-y-2 mt-4">
                            <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-2">
                               <Crosshair size={10} /> Colore Matita
                            </label>
                            <div className="grid grid-cols-5 gap-2">
                              {['#000000', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#64748b'].map((c) => (
                                <button
                                  key={c}
                                  onClick={() => {
                                    setDefaultLineStyle(prev => ({ ...prev, color: c }));
                                    handleToolClick("Line");
                                  }}
                                  className={`w-full aspect-square rounded-full flex items-center justify-center transition-transform ${defaultLineStyle.color === c ? "ring-2 ring-offset-2 ring-indigo-500 scale-110 shadow-md" : "hover:scale-105 border border-black/10"}`}
                                  style={{ backgroundColor: c }}
                                >
                                  {defaultLineStyle.color === c && <Check size={10} className="text-white drop-shadow-md" />}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* 5 Line Style Choices */}
                          <div className="space-y-2 mt-4 pt-4 border-t border-neutral-700">
                            <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-2">
                               <Sliders size={10} /> Tratto Linea (5 Tipi)
                            </label>
                            <div className="grid grid-cols-1 gap-2">
                              {[
                                { type: 'continuous', label: 'Continuo (Solid)', borderClass: 'border-solid' },
                                { type: 'dashed', label: 'Tratteggiato (Dashed)', borderClass: 'border-dashed' },
                                { type: 'dotted', label: 'Puntinato (Dotted)', borderClass: 'border-dotted' },
                                { type: 'dashdot', label: 'Tratto-Punto (Dash-Dot)', borderClass: 'border-dashed' },
                                { type: 'dashdash', label: 'Tratto-Tratto (Dash-Dash)', borderClass: 'border-dashed' }
                              ].map(lt => {
                                const isSelected = defaultLineStyle.lineType === lt.type;
                                return (
                                  <button
                                    key={lt.type}
                                    onClick={() => {
                                      setDefaultLineStyle(prev => ({ 
                                        ...prev, 
                                        lineType: lt.type as any,
                                        dashed: lt.type !== 'continuous'
                                      }));
                                    }}
                                    className={`px-3 py-2 rounded-lg border transition-all flex items-center justify-between gap-2 ${isSelected ? "bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200" : "bg-neutral-50 border-neutral-200 hover:bg-white text-neutral-800"}`}
                                  >
                                    <span className={`text-[10px] font-bold ${isSelected ? "text-indigo-800" : "text-neutral-600"}`}>
                                      {lt.label}
                                    </span>
                                    <div className="w-20 flex items-center">
                                      <div className={`w-full border-b-2 border-neutral-800 ${lt.borderClass}`} style={{
                                        borderStyle: lt.type === 'dashdot' ? 'dashed' : (lt.type === 'dotted' ? 'dotted' : (lt.type === 'continuous' ? 'solid' : 'dashed'))
                                      }} />
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Strumento Filo & Lenza Panel */}
                          <div className="space-y-2 mt-4 pt-4 border-t border-neutral-700">
                            <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-2">
                               <Droplet size={10} /> Strumento Filo & Lenza
                            </label>
                            <div className="bg-orange-50 text-orange-950 p-2.5 rounded-lg border border-orange-200 text-[10px] space-y-1">
                              <p className="font-bold flex items-center gap-1 text-orange-800">
                                <Sparkles size={11} /> Filo di Allineamento (Lenza)
                              </p>
                              <p className="opacity-90 leading-tight">
                                Simula il classico filo teso da cantiere. Si ancora con due picchetti a croce ad alta visibilità e si posiziona automaticamente nel layer dedicato <strong className="underline">"Fili"</strong>.
                              </p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => handleToolClick("Filo")}
                                className={`p-2.5 rounded-lg border transition-all flex flex-col items-center justify-center gap-1 ${selectedTool === "Filo" ? "bg-orange-600 border-orange-700 text-white shadow-md transform -translate-y-0.5" : "bg-neutral-50 border-neutral-200 hover:bg-white text-neutral-800"}`}
                              >
                                <FiloIcon size={16} />
                                <span className="text-[10px] font-bold">Attiva Lenza</span>
                              </button>
                              
                              <div className="flex flex-col justify-between">
                                <span className="text-[9px] font-bold text-neutral-400">Colore Filo:</span>
                                <div className="grid grid-cols-4 gap-1.5 mt-1">
                                  {['#ff5500', '#f59e0b', '#10b981', '#3b82f6'].map(c => (
                                    <button
                                      key={c}
                                      onClick={() => setDefaultFiloColor(c)}
                                      className={`w-6 h-6 rounded-full flex items-center justify-center border border-black/10 transition-transform ${defaultFiloColor === c ? 'ring-2 ring-offset-2 ring-orange-500 scale-110' : 'hover:scale-105'}`}
                                      style={{ backgroundColor: c }}
                                    >
                                      {defaultFiloColor === c && <Check size={10} className="text-white drop-shadow-md" />}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>

                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : activeSidebarTab === "layers" ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-neutral-200">
                        <h4 className="text-[10px] font-black text-neutral-800 uppercase tracking-wider font-mono">
                          Gestione Layers
                        </h4>
                        <button 
                          onClick={() => {
                             const newId = `Layer ${layers.length}`;
                             setLayers([...layers, { id: newId, name: newId, visible: true, frozen: false }]);
                             setActiveLayerId(newId);
                          }}
                          className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-md transition-colors"
                          title="Nuovo Layer"
                        >
                          <Plus size={14} />
                        </button>
                    </div>
                    <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                        {layers.map((l) => (
                          <div
                            key={l.id}
                            className={`flex items-center gap-1 p-1.5 rounded-lg border transition-all ${activeLayerId === l.id ? "bg-white border-indigo-300 shadow-sm ring-1 ring-indigo-100" : "bg-neutral-50/50 border-neutral-200/60 hover:bg-white hover:border-neutral-300"}`}
                          >
                            <div className="flex-1 px-2 py-1 flex items-center min-w-0">
                              {editingLayerId === l.id ? (
                                <input
                                  autoFocus
                                  type="text"
                                  className="w-full text-xs border border-indigo-300 rounded px-1 outline-none font-bold text-indigo-700"
                                  value={l.name}
                                  onChange={(e) => setLayers(layers.map((layer) => layer.id === l.id ? { ...layer, name: e.target.value } : layer))}
                                  onBlur={() => setEditingLayerId(null)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') setEditingLayerId(null); }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <button 
                                  onClick={() => setActiveLayerId(l.id)}
                                  className={`flex-1 text-left truncate focus:outline-none flex flex-col items-start ${activeLayerId === l.id ? "text-indigo-700 font-bold" : "text-neutral-600 font-semibold"}`}
                                  title="Imposta come corrente. Doppio click per rinominare."
                                  onDoubleClick={() => setEditingLayerId(l.id)}
                                >
                                  <span className="truncate w-full">{l.name}</span>
                                  {activeLayerId === l.id && <span className="block text-[8px] uppercase tracking-wider text-indigo-400 mt-0.5">Corrente</span>}
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 px-1">
                                <button
                                  onClick={() =>
                                    setLayers(
                                      layers.map((layer) =>
                                        layer.id === l.id
                                          ? { ...layer, visible: !layer.visible }
                                          : layer,
                                      ),
                                    )
                                  }
                                  title={l.visible ? "Spegni (Nascondi)" : "Accendi (Mostra)"}
                                  className={`p-1.5 rounded-md transition-colors ${l.visible ? "text-amber-500 hover:bg-amber-50" : "text-neutral-300 hover:bg-neutral-100"}`}
                                >
                                  {l.visible ? <Lightbulb size={14} /> : <LightbulbOff size={14} />}
                                </button>
                                <button
                                  onClick={() =>
                                    setLayers(
                                      layers.map((layer) =>
                                        layer.id === l.id
                                          ? { ...layer, frozen: !layer.frozen }
                                          : layer,
                                      ),
                                    )
                                  }
                                  title={l.frozen ? "Scongela (Sblocca)" : "Congela (Blocca)"}
                                  className={`p-1.5 rounded-md transition-colors ${l.frozen ? "text-blue-500 bg-blue-50 hover:bg-blue-100 border border-blue-200" : "text-neutral-300 hover:bg-neutral-100 border border-transparent"}`}
                                >
                                  <Snowflake size={14} />
                                </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : activeSidebarTab === 'tavole' ? (
                <>
                  <p className="text-xs text-neutral-500 mb-4 font-normal leading-relaxed">
                    Trascina i riquadri blu (tavola n. 1..5) sul foglio per selezionare l'area di stampa reale da esportare in PDF.
                  </p>

                  <div className="space-y-4">
                    {tavole.map((tav) => (
                      <div key={tav.id} className="border border-neutral-200 rounded-lg p-3 bg-neutral-50/50 hover:bg-neutral-50 transition-all shadow-xs">
                        {/* Title and Visibility */}
                        <div className="flex items-center justify-between mb-2 pb-1 border-b border-neutral-200/50">
                          <span className="text-xs font-black text-neutral-800 font-mono tracking-tight">{tav.name}</span>
                          <div className="flex gap-1 items-center">
                            <button
                              onClick={() => {
                                setEditingCartiglioTavolaId(editingCartiglioTavolaId === tav.id ? null : tav.id);
                              }}
                              className={`p-1 rounded text-xs transition-all ${editingCartiglioTavolaId === tav.id ? "bg-indigo-100 text-indigo-700" : "text-neutral-500 hover:bg-neutral-200"}`}
                              title="Modifica Cartiglio"
                            >
                              <Pen size={12} />
                            </button>
                            <button
                              onClick={() => {
                                setTavole(tavole.map(t => t.id === tav.id ? { ...t, visible: !t.visible } : t));
                              }}
                              className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${tav.visible ? "bg-indigo-600 text-white shadow-xs" : "bg-neutral-200 text-neutral-600"}`}
                            >
                              {tav.visible ? "Visibile" : "Nascosto"}
                            </button>
                          </div>
                        </div>

                        {editingCartiglioTavolaId === tav.id && (
                          <div className="mb-3 space-y-1.5 p-2 bg-white border border-neutral-200 rounded text-xs">
                            <div className="flex flex-col gap-0.5">
                              <label className="text-[8px] font-bold text-neutral-500 uppercase">Progetto</label>
                              <input 
                                type="text"
                                className="border border-neutral-300 rounded px-1.5 py-0.5 w-full bg-neutral-50 focus:bg-white"
                                value={tav.datiCartiglio.progetto}
                                onChange={(e) => setTavole(tavole.map(t => t.id === tav.id ? {...t, datiCartiglio: {...t.datiCartiglio, progetto: e.target.value}} : t))}
                              />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <label className="text-[8px] font-bold text-neutral-500 uppercase">Titolo</label>
                              <input 
                                type="text"
                                className="border border-neutral-300 rounded px-1.5 py-0.5 w-full bg-neutral-50 focus:bg-white"
                                value={tav.datiCartiglio.titolo}
                                onChange={(e) => setTavole(tavole.map(t => t.id === tav.id ? {...t, datiCartiglio: {...t.datiCartiglio, titolo: e.target.value}} : t))}
                              />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <label className="text-[8px] font-bold text-neutral-500 uppercase">Autore</label>
                              <input 
                                type="text"
                                className="border border-neutral-300 rounded px-1.5 py-0.5 w-full bg-neutral-50 focus:bg-white"
                                value={tav.datiCartiglio.autore}
                                onChange={(e) => setTavole(tavole.map(t => t.id === tav.id ? {...t, datiCartiglio: {...t.datiCartiglio, autore: e.target.value}} : t))}
                              />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <label className="text-[8px] font-bold text-neutral-500 uppercase">Data</label>
                              <input 
                                type="text"
                                className="border border-neutral-300 rounded px-1.5 py-0.5 w-full bg-neutral-50 focus:bg-white"
                                value={tav.datiCartiglio.data}
                                onChange={(e) => setTavole(tavole.map(t => t.id === tav.id ? {...t, datiCartiglio: {...t.datiCartiglio, data: e.target.value}} : t))}
                              />
                            </div>
                          </div>
                        )}

                        {/* Controls (Format / Scale / Unit) Grid */}
                        <div className="grid grid-cols-3 gap-1.5 mt-2">
                          {/* Paper format selector */}
                          <div>
                            <label className="block text-[8px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">Foglio</label>
                            <select
                              value={tav.format}
                              onChange={(e) => {
                                setTavole(tavole.map(t => t.id === tav.id ? { ...t, format: e.target.value as any } : t));
                              }}
                              className="w-full bg-white border border-neutral-300 text-xs rounded p-1 font-semibold"
                            >
                              <option value="A4">A4</option>
                              <option value="A3">A3</option>
                              <option value="A2">A2</option>
                              <option value="A1">A1</option>
                              <option value="A0">A0</option>
                            </select>
                          </div>

                          {/* Scale selector */}
                          <div>
                            <label className="block text-[8px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">Scala 1:</label>
                            <input
                              type="number"
                              min="1"
                              value={tav.scale}
                              onChange={(e) => {
                                const val = Math.max(1, Number(e.target.value));
                                setTavole(tavole.map(t => t.id === tav.id ? { ...t, scale: val } : t));
                              }}
                              className="w-full bg-white border border-neutral-300 text-xs rounded p-1 text-center font-black"
                            />
                          </div>

                          {/* Unit selector */}
                          <div>
                            <label className="block text-[8px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">Unità</label>
                            <select
                              value={tav.unit}
                              onChange={(e) => {
                                setTavole(tavole.map(t => t.id === tav.id ? { ...t, unit: e.target.value as any } : t));
                              }}
                              className="w-full bg-white border border-neutral-300 text-xs rounded p-1 font-semibold"
                            >
                              <option value="m">Metri (m)</option>
                              <option value="cm">Cm (cm)</option>
                              <option value="mm">Mm (mm)</option>
                            </select>
                          </div>
                        </div>

                        {/* Opzioni Retino / Griglia di Supporto */}
                        <div className="mt-3 border-t border-neutral-200/60 pt-2.5 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="block text-[9px] font-black text-indigo-700 uppercase tracking-widest font-mono">
                              📏 RETINO DI SUPPORTO (GRIGLIA)
                            </span>
                            
                            {/* Attiva/Disattiva Toggle Switch */}
                            <button
                              type="button"
                              onClick={() => {
                                const isGridActive = tav.gridType && tav.gridType !== "none";
                                const nextGrid = isGridActive ? "none" : (localStorage.getItem('lastGridType') as any || "10cm");
                                setTavole(tavole.map(t => t.id === tav.id ? { ...t, gridType: nextGrid } : t));
                              }}
                              className={`px-2 py-0.5 rounded text-[8.5px] font-black uppercase transition-all flex items-center gap-1 cursor-pointer ${
                                tav.gridType && tav.gridType !== "none"
                                  ? "bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400"
                                  : "bg-neutral-200 text-neutral-650 hover:bg-neutral-300"
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${tav.gridType && tav.gridType !== "none" ? "bg-white animate-ping" : "bg-neutral-450"}`}></span>
                              {tav.gridType && tav.gridType !== "none" ? "Retino Attivo" : "Retino Disattivato"}
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[8px] text-neutral-500 font-bold uppercase mb-1">Passo Retino</label>
                              <select
                                value={tav.gridType || "none"}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val !== "none") {
                                    localStorage.setItem('lastGridType', val);
                                  }
                                  setTavole(tavole.map(t => t.id === tav.id ? { ...t, gridType: val as any } : t));
                                }}
                                className="w-full bg-white border border-neutral-300 text-[10px] rounded p-1 font-semibold"
                              >
                                <option value="none">Nessun Retino (Spento)</option>
                                <option value="1cm">Ogni 1 cm</option>
                                <option value="10cm">Ogni 10 cm</option>
                                <option value="100cm">Ogni 100 cm (1m)</option>
                              </select>
                            </div>
                            
                            <div>
                              <label className="block text-[8px] text-neutral-500 font-bold uppercase mb-1">Colore Retino</label>
                              <select
                                value={tav.gridColor || "rgba(99, 102, 241, 0.15)"}
                                onChange={(e) => {
                                  setTavole(tavole.map(t => t.id === tav.id ? { ...t, gridColor: e.target.value } : t));
                                }}
                                className="w-full bg-white border border-neutral-300 text-[10px] rounded p-1 font-semibold"
                              >
                                <option value="rgba(99, 102, 241, 0.15)">🔵 Viola Cobalto</option>
                                <option value="rgba(6, 182, 212, 0.18)">🌐 Cyan Grigio</option>
                                <option value="rgba(249, 115, 22, 0.15)">🟠 Arancione</option>
                                <option value="rgba(0, 0, 0, 0.1)">⚫ Grigio Trasparente</option>
                                <option value="rgba(239, 68, 68, 0.15)">🔴 Rosso Snapping</option>
                              </select>
                            </div>
                          </div>
                          
                          {tav.gridType && tav.gridType !== "none" && (
                            <button
                              type="button"
                              onClick={() => {
                                const paper = getPaperSizeMm(tav.format);
                                let factor = 1000;
                                if (tav.unit === 'cm') factor = 10;
                                if (tav.unit === 'mm') factor = 1;
                                const scale = tav.scale || 100;
                                const w = paper.w * (scale / factor);
                                const h = paper.h * (scale / factor);
                                
                                let spacingVal = 10;
                                if (tav.gridType === '1cm') {
                                  if (tav.unit === 'm') spacingVal = 0.01;
                                  else if (tav.unit === 'cm') spacingVal = 1;
                                  else if (tav.unit === 'mm') spacingVal = 10;
                                } else if (tav.gridType === '10cm') {
                                  if (tav.unit === 'm') spacingVal = 0.1;
                                  else if (tav.unit === 'cm') spacingVal = 10;
                                  else if (tav.unit === 'mm') spacingVal = 100;
                                } else if (tav.gridType === '100cm') {
                                  if (tav.unit === 'm') spacingVal = 1.0;
                                  else if (tav.unit === 'cm') spacingVal = 100;
                                  else if (tav.unit === 'mm') spacingVal = 1000;
                                }
                                
                                const startX = Math.floor(tav.position.x / spacingVal) * spacingVal;
                                const endX = Math.ceil((tav.position.x + w) / spacingVal) * spacingVal;
                                const startY = Math.floor(tav.position.y / spacingVal) * spacingVal;
                                const endY = Math.ceil((tav.position.y + h) / spacingVal) * spacingVal;
                                
                                const newEntities: any[] = [];
                                const timestamp = Date.now();
                                
                                // Vertical lines
                                for (let x = startX; x <= endX; x += spacingVal) {
                                  if (x >= tav.position.x && x <= tav.position.x + w) {
                                    newEntities.push({
                                      id: `grid-v-${x}-${timestamp}-${Math.random()}`,
                                      type: 'line',
                                      start: { x: x, y: tav.position.y },
                                      end: { x: x, y: tav.position.y + h },
                                      color: '#94a3b8',
                                      lineWidth: 1,
                                      layer: 'Hatch',
                                      dashed: true
                                    });
                                  }
                                }
                                // Horizontal lines
                                for (let y = startY; y <= endY; y += spacingVal) {
                                  if (y >= tav.position.y && y <= tav.position.y + h) {
                                    newEntities.push({
                                      id: `grid-h-${y}-${timestamp}-${Math.random()}`,
                                      type: 'line',
                                      start: { x: tav.position.x, y: y },
                                      end: { x: tav.position.x + w, y: y },
                                      color: '#94a3b8',
                                      lineWidth: 1,
                                      layer: 'Hatch',
                                      dashed: true
                                    });
                                  }
                                }
                                
                                setEntities(prev => [...prev, ...newEntities]);
                              }}
                              className="w-full bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 text-neutral-800 font-extrabold py-1 px-2 rounded border border-neutral-300 text-[9px] transition-all flex items-center justify-center gap-1 uppercase tracking-wide cursor-pointer"
                            >
                              <Plus size={10} />
                              Disegna Griglia sul Foglio (CAD Hatch)
                            </button>
                          )}
                        </div>

                        {/* Action buttons (printable preview) */}
                        <div className="flex gap-2 mt-3 pt-2">
                          <button
                            onClick={async () => {
                            const { exportNativePDF } = await import("./utils/pdfExport");
                            const url = exportNativePDF(entities, tav.format, tav.scale, tav.unit, tav, 'bloburl');
                            if (url) {
                              setPdfPreviewUrl(url);
                              setActivePreviewTavolaId(tav.id);
                            }
                            }}
                            className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-bold py-1.5 px-2 rounded-md text-[10px] transition-colors flex items-center justify-center gap-1 shadow-sm uppercase tracking-wider"
                          >
                            Anteprima
                          </button>
                          <button
                            onClick={async () => {
                              const { exportNativePDF } = await import("./utils/pdfExport");
                              exportNativePDF(entities, tav.format, tav.scale, tav.unit, tav);
                            }}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold py-1.5 px-2 rounded-md text-[10px] transition-colors flex items-center justify-center gap-1 shadow-sm uppercase tracking-wider"
                          >
                            <Printer size={10} className="stroke-white" />
                            <span>Salva PDF</span>
                          </button>
                        </div>
                        <div className="mt-2 text-[9px] text-amber-700 bg-amber-50 p-1.5 rounded border border-amber-200">
                           <span className="font-bold">⚠️ SCALA DI STAMPA:</span><br/>
                           Per mantenere la scala reale (es. 400cm = 4cm su carta), imposta <span className="font-bold underline italic">"Scala: 100%"</span> o <span className="font-bold underline italic">"Dimensioni Effettive"</span> nel pannello di stampa. Evita "Adatta alla pagina".
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : activeSidebarTab === 'manuale' ? (
                <div className="space-y-4 font-sans text-neutral-700">
                  <div className="border-b border-neutral-200 pb-2">
                    <h4 className="text-xs font-black text-neutral-800 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      <BookOpen size={13} className="text-emerald-600" />
                      🇮🇹 MANUALE IN LINEA GECOLA
                    </h4>
                    <p className="text-[10px] text-neutral-400 mt-1">
                      Fai clic su qualsiasi elemento o passa il mouse sopra un pulsante per aprirne la spiegazione.
                    </p>
                  </div>

                  {/* Active Selected/Hovered Tool Detail */}
                  <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-3.5 space-y-2">
                    <span className="text-[9px] font-black tracking-widest text-emerald-700 font-mono block uppercase">
                      Pannello Dettaglio Attivo:
                    </span>
                    {hoveredGuide ? (
                      <div>
                        <div className="flex items-center gap-1.5 justify-between">
                          <h5 className="text-xs font-black text-emerald-950 font-sans">{hoveredGuide.title}</h5>
                          {hoveredGuide.hotkey && (
                            <span className="text-[8px] bg-emerald-200 text-emerald-950 px-1 font-mono rounded">
                              {hoveredGuide.hotkey}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-neutral-600 mt-1 leading-relaxed">
                          {hoveredGuide.description}
                        </p>
                        {hoveredGuide.tip && (
                          <div className="mt-2 text-[10px] leading-relaxed text-indigo-700 bg-white border border-indigo-100 p-2 rounded">
                            <span className="font-extrabold text-amber-500">💡 Suggerimento:</span> {hoveredGuide.tip}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-2 text-center text-[11px] text-neutral-400 italic">
                        Passa il puntatore del mouse sopra un pulsante qualsiasi della barra superiore o seleziona un comando dall'indice per visualizzarne la scheda tecnica qui in tempo reale.
                      </div>
                    )}
                  </div>

                  {/* General Index Section */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black tracking-widest text-neutral-400 font-mono block uppercase">
                      Indice dei comandi disponibili:
                    </span>
                    <div className="space-y-1 max-h-[380px] overflow-y-auto pr-1">
                      {Object.entries(GUIDE_DATABASE).map(([key, guide]) => (
                        <button
                          key={key}
                          onClick={() => {
                            setHoveredGuide(guide);
                            setGuideLockedBy(key);
                          }}
                          className={`w-full text-left p-2 rounded-lg border text-xs transition-all flex flex-col gap-0.5 ${guideLockedBy === key ? "bg-white border-emerald-500 ring-2 ring-emerald-100 shadow-xs" : "bg-neutral-50 border-neutral-100 hover:bg-white hover:border-neutral-200"}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-neutral-800">{key}</span>
                            <span className="text-[9px] text-neutral-400 font-mono">{guide.hotkey}</span>
                          </div>
                          <span className="text-[10px] text-neutral-500 line-clamp-1">{guide.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Command Bar */}
      <footer className="h-8 border-t border-slate-800 bg-slate-900 px-4 flex items-center text-sm">
        <span className="text-slate-500 mr-2 uppercase tracking-wide font-mono text-xs">
          Command:
        </span>
        <input
          type="text"
          className="bg-transparent flex-1 outline-none font-mono text-xs text-white"
          placeholder="Type a command (f.ex. L, C, R)..."
        />
      </footer>

      {/* Hidden file input for DXF/DWG/Images/Video/Audio/PDF uploader */}
      <input
        ref={importInputRef}
        type="file"
        accept=".dxf,.dwg,image/*,video/*,audio/*,.pdf"
        onChange={handleImportFile}
        className="hidden"
        style={{ display: 'none' }}
      />

      {/* DWG Proprietary File Instructions Modal */}
      {showDwgModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 select-none animate-fade-in" onClick={() => setShowDwgModal(false)}>
          <div className="bg-slate-950 border border-slate-800 p-6 rounded-xl shadow-2xl max-w-sm w-full relative" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-xs font-black uppercase text-red-400 tracking-wider font-mono flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-red-900/55 border border-red-700 rounded text-[9px] text-red-300">Formato DWG</span>
                Notifica Informativa
              </h3>
              <button onClick={() => setShowDwgModal(false)} className="text-slate-500 hover:text-white font-mono text-xs font-bold leading-none">
                ✕
              </button>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Hai caricato il file <span className="font-semibold text-yellow-400 font-mono">"{dwgFileName}"</span>.
              <br/><br/>
              Il formato <span className="font-bold text-white">DWG</span> di AutoCAD è un formato file binario compresso e con copyright proprietario non leggibile nativamente dai moderni browser web.
            </p>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 mb-4">
              <span className="text-[10px] font-black text-indigo-400 font-mono block uppercase mb-1.5">Come procedere per il disegno:</span>
              <ul className="text-[10.5px] text-slate-400 list-decimal pl-4 space-y-2 leading-relaxed">
                <li>
                  Converti il file DWG in formato <span className="text-indigo-300 font-semibold font-mono">DXF Vettoriale</span> (es. R12 o AutoCAD 2000 per compatibilità ottimale).
                </li>
                <li>
                  Puoi usare convertitori gratuiti come <span className="text-indigo-300 underline font-semibold">ODA File Converter</span>, convertitori online o esportarlo direttamente da AutoCAD.
                </li>
                <li>
                  Importa il file convertito <span className="text-emerald-400 font-bold font-mono">.dxf</span> qui per rigenerare all'istante l'intero disegno vettoriale sul foglio!
                </li>
              </ul>
            </div>

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold tracking-wide font-sans transition-colors shadow-md"
                onClick={() => setShowDwgModal(false)}
              >
                Ho capito, Chiudi
              </button>
            </div>
          </div>
        </div>
      )}


      <RaccordoDialog
        key={editingRaccordo ? `edit-${editingRaccordo.id}` : 'new-raccordo'}
        isOpen={isRaccordoDialogOpen}
        onClose={() => {
          if (editingRaccordo?.raccordoMetadata) {
            // Restore to the original config saved in metadata
            const meta = editingRaccordo.raccordoMetadata;
            cadCanvasRef.current?.editRaccordo(
              meta.id1,
              meta.id2,
              meta.clickPt1,
              meta.clickPt2,
              editingRaccordo.id,
              meta.config,
              meta.originalLine1,
              meta.originalLine2
            );
          }
          setIsRaccordoDialogOpen(false);
          setEditingRaccordo(null);
        }}
        initialConfig={editingRaccordo?.raccordoMetadata ? editingRaccordo.raccordoMetadata.config : raccordoConfig}
        onChange={(config) => {
          if (editingRaccordo?.raccordoMetadata) {
            const meta = editingRaccordo.raccordoMetadata;
            cadCanvasRef.current?.editRaccordo(
              meta.id1,
              meta.id2,
              meta.clickPt1,
              meta.clickPt2,
              editingRaccordo.id,
              config,
              meta.originalLine1,
              meta.originalLine2
            );
          } else {
            setRaccordoConfig(config);
          }
        }}
        onSave={(config) => {
          if (editingRaccordo?.raccordoMetadata) {
            const meta = editingRaccordo.raccordoMetadata;
            const rId = editingRaccordo.id;
            
            // Clear editingRaccordo so onClose does not trigger restoration revert
            setEditingRaccordo(null);
            setIsRaccordoDialogOpen(false);

            // Apply final configuration and commit to history
            cadCanvasRef.current?.editRaccordo(
              meta.id1,
              meta.id2,
              meta.clickPt1,
              meta.clickPt2,
              rId,
              config,
              meta.originalLine1,
              meta.originalLine2
            );
            
            setShortcutToast(`Raccordo modificato: ${config.type === 'curvo' ? 'Curvo r=' : 'Rettilineo d='}${config.value} cm`);
            setTimeout(() => setShortcutToast(null), 4000);
          } else {
            setRaccordoConfig(config);
            setSelectedTool("Raccordo");
            setIsRaccordoDialogOpen(false);
            setShortcutToast(`Raccordo pronto: ${config.type === 'curvo' ? 'Curvo r=' : 'Rettilineo d='}${config.value} cm`);
            setTimeout(() => setShortcutToast(null), 4000);
          }
        }}
      />



      {/* DXF text reader dialog */}
      <DXFTextReaderDialog
        isOpen={isDXFTextReaderOpen}
        onClose={() => setIsDXFTextReaderOpen(false)}
        activeLayerId={activeLayerId}
        layers={layers}
        onImport={(importedEntities, newLayers, mergeMode) => {
          if (newLayers.length > 0) {
            setLayers(prev => [...prev, ...newLayers]);
          }

          if (mergeMode === 'replace') {
            updateEntitiesWithHistory(importedEntities);
          } else {
            updateEntitiesWithHistory(prev => [...prev, ...importedEntities]);
          }

          setShortcutToast(`Generati con successo ${importedEntities.length} elementi vettoriali DXF!`);
          setTimeout(() => setShortcutToast(null), 4000);
        }}
      />

      {/* Floating Interactive Manual Companion */}
      {showFloatingManual && hoveredGuide && (
        <div className="fixed bottom-6 left-6 z-50 w-80 bg-neutral-900/40 backdrop-blur-lg text-neutral-100 rounded-lg shadow-xl border border-neutral-700/30 p-4 transition-all duration-300 transform scale-100 ease-out flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5 flex-nowrap">
            <div className="flex items-center gap-1.5 text-emerald-400 font-sans font-bold text-xs uppercase tracking-wider">
              <BookOpen size={14} className="animate-pulse" />
              <span>Manuale Interattivo</span>
            </div>
            <button 
              onClick={() => {
                setHoveredGuide(null);
                setGuideLockedBy(null);
                setShowFloatingManual(false);
              }}
              className="text-neutral-400 hover:text-white hover:bg-neutral-800 rounded p-1 transition-colors"
              title="Chiudi Manuale"
            >
              <X size={14} />
            </button>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-neutral-100 flex items-center justify-between gap-1">
              <span className="truncate">{hoveredGuide.title}</span>
              {hoveredGuide.hotkey && (
                <span className="text-[9px] bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded font-mono shrink-0">
                  {hoveredGuide.hotkey}
                </span>
              )}
            </h4>
            <p className="text-xs text-neutral-300 mt-1.5 leading-relaxed">
              {hoveredGuide.description}
            </p>
            {hoveredGuide.tip && (
              <div className="mt-2.5 p-2 bg-indigo-950/40 border border-indigo-900/40 rounded text-[11px] text-indigo-300 flex items-start gap-1">
                <span className="text-amber-400 font-bold shrink-0">💡</span>
                <span>{hoveredGuide.tip}</span>
              </div>
            )}
          </div>
          <div className="text-[9px] text-neutral-400 pt-1 text-right italic font-medium">
            Scompare automaticamente quando premi il pulsante o lo strumento!
          </div>
        </div>
      )}

      {isLineEditorOpen && selectedLine && (
          <LineEditorDialog
            line={selectedLine}
            referenceLine={referenceLine}
            clickPoint={selectedLineClickPoint}
            onClose={() => {
                if (originalLine) {
                 setEntities(prev => prev.map(e => e.id === originalLine.id ? originalLine : e));
                }
                setIsLineEditorOpen(false);
                setSelectedLine(null);
                setOriginalLine(null);
            }}
            onPreview={(previewLine) => {
                updateEntitiesSilent(prev => prev.map(e => e.id === previewLine.id ? previewLine : e));
            }}
            onUpdate={(updatedLine) => {
                updateEntitiesWithHistory(prev => prev.map(e => e.id === updatedLine.id ? updatedLine : e));
                setIsLineEditorOpen(false);
                setSelectedLine(null);
                setOriginalLine(null);
                cadCanvasRef.current?.alignCursorToLineEndpoint(updatedLine);
            }}
          />
      )}
      <AnimatePresence>
        {quickActions && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="fixed z-[9999] bg-white dark:bg-neutral-800 rounded-full shadow-2xl border border-neutral-200 dark:border-neutral-700 p-1.5 flex items-center gap-1"
            style={{ 
              left: quickActions.pos.x, 
              top: Math.max(80, quickActions.pos.y - 80),
              transform: 'translateX(-50%)' 
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => {
                setInitialSelectedIds(quickActions.ids);
                setIsOffsetAidActive(true);
                setSelectedTool('Move');
                setQuickActions(null);
              }}
              className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-full transition-colors text-neutral-600 dark:text-neutral-300 flex items-center gap-1.5 px-3"
              title="Sposta"
            >
              <Move size={16} />
              <span className="text-xs font-medium">Sposta</span>
            </button>
            <div className="w-[1px] h-6 bg-neutral-200 dark:bg-neutral-700 mx-0.5" />
            <button 
              onClick={() => {
                setInitialSelectedIds(quickActions.ids);
                setIsOffsetAidActive(true);
                setSelectedTool('Copy');
                setQuickActions(null);
              }}
              className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-full transition-colors text-neutral-600 dark:text-neutral-300 flex items-center gap-1.5 px-3"
              title="Copia"
            >
              <Copy size={16} />
              <span className="text-xs font-medium">Copia</span>
            </button>
            <div className="w-[1px] h-6 bg-neutral-200 dark:bg-neutral-700 mx-0.5" />
            <button 
              onClick={() => {
                setRotationEntityId(quickActions.ids[0]);
                setIsRotateScaleOpen(true);
                setQuickActions(null);
              }}
              className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-full transition-colors text-neutral-600 dark:text-neutral-300 flex items-center gap-1.5 px-3"
              title="Ruota"
            >
              <RefreshCw size={16} />
              <span className="text-xs font-medium">Ruota</span>
            </button>
            <div className="w-[1px] h-6 bg-neutral-200 dark:bg-neutral-700 mx-0.5" />
            <button 
              onClick={() => {
                const newGroupId = Date.now().toString();
                updateEntitiesWithHistory(prev => prev.map(ent => {
                  if (quickActions.ids.includes(ent.id)) {
                    return { ...ent, groupId: newGroupId };
                  }
                  return ent;
                }));
                setQuickActions(null);
                setShortcutToast("Oggetti uniti (Join)");
                setTimeout(() => setShortcutToast(null), 2000);
              }}
              className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-full transition-colors text-neutral-600 dark:text-neutral-300 flex items-center gap-1.5 px-3"
              title="Join"
            >
              <Link size={16} />
              <span className="text-xs font-medium">Join</span>
            </button>
            <div className="w-[1px] h-6 bg-neutral-200 dark:bg-neutral-700 mx-0.5" />
            <div className="w-[1px] h-6 bg-neutral-200 dark:bg-neutral-700 mx-0.5" />
            <button 
              onClick={() => {
                const trimmed = trimEntities(entities as any, quickActions.ids);
                updateEntitiesWithHistory(trimmed as any);
                setShortcutToast("Taglio bordi (AI) applicato!");
                setTimeout(() => setShortcutToast(null), 2000);
              }}
              className="p-2 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-full transition-colors text-purple-600 flex items-center gap-1.5 px-3 relative"
              title="Trim Edges (AI ✂️)"
            >
              <Scissors size={16} />
              <Sparkles size={10} className="absolute top-1 right-1 text-amber-500" />
              <span className="text-xs font-medium">Trim (AI)</span>
            </button>
            <div className="w-[1px] h-6 bg-neutral-200 dark:bg-neutral-700 mx-0.5" />
            <button 
              onClick={() => {
                updateEntitiesWithHistory(prev => prev.filter(ent => !quickActions.ids.includes(ent.id)));
                setQuickActions(null);
              }}
              className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors text-red-500 flex items-center gap-1.5 px-3"
              title="Cancella"
            >
              <Trash2 size={16} />
              <span className="text-xs font-medium">Cancella</span>
            </button>
            <div className="w-[1px] h-6 bg-neutral-200 dark:bg-neutral-700 mx-0.5" />
            <button 
              onClick={() => setQuickActions(null)}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-full transition-colors text-neutral-400"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <GecolaPrezzarioPanel
        entities={entities}
        updateEntity={updateEntity}
        updateEntitiesWithHistory={updateEntitiesWithHistory}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        isOpen={isPrezzarioOpen}
        onClose={() => setIsPrezzarioOpen(false)}
        setShortcutToast={setShortcutToast}
        floors={floors}
        prezzarioItems={dynamicPrezzario}
        onOpenImporter={() => setPriceListImporterTargetFamily('GLOBAL')}
        isWorkspaceMode={workspaceMode === 'computo'}
      />

      <PriceListImporter 
        isOpen={priceListImporterTargetFamily !== null}
        targetFamilyId={priceListImporterTargetFamily !== 'GLOBAL' ? priceListImporterTargetFamily! : undefined}
        onClose={() => setPriceListImporterTargetFamily(null)}
        onImport={handleImportPriceList}
      />

      <GecoAssistant
        activeTool={selectedTool}
        setActiveTool={setSelectedTool}
        entitiesCount={entities.length}
        lastInsertedParameter={lastInsertedParameter}
        onUpdateParameter={handleSetLastInsertedParameter}
        isOpen={isGecoOpen}
        onToggle={() => setIsGecoOpen(!isGecoOpen)}
      />

      {/* Welcome & Workspace Switcher Hub Modal */}
      <WorkspaceModeModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        currentMode={workspaceMode}
        onSelectMode={handleSelectWorkspaceMode}
      />

      {/* Tecnigrafo Quick Context Menu on Right Click */}
      {contextMenuPos && (
        <TecnigrafoContextMenu
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          onClose={() => setContextMenuPos(null)}
          onSelectTool={(tool) => {
            handleToolClick(tool);
            setContextMenuPos(null);
          }}
          selectedTool={selectedTool}
          isSnapActive={effectiveSnapActive}
          onToggleSnap={() => setIsSnapActive(!isSnapActive)}
          orthoMode={effectiveOrthoMode}
          onToggleOrtho={() => setOrthoMode(!orthoMode)}
          onUndo={undo}
          onRedo={redo}
          onZoomFit={() => cadCanvasRef.current?.zoomFit?.()}
          onSwitchWorkspace={handleSelectWorkspaceMode}
          currentMode={workspaceMode}
        />
      )}

      {/* BIM Dialog Submenus were removed and redesigned in the inline top bars for higher efficiency */}
    </div>
  );
}
