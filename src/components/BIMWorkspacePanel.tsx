import React, { useState } from "react";
import { Entity, Point } from "../types";
import { computeMetrics } from "../utils/bimMetrics";
import { 
  Building, 
  Trash2, 
  Ruler, 
  Download, 
  Layers, 
  Plus, 
  Square,
  Sparkles,
  Home,
  Menu,
  Check,
  FileText,
  Repeat,
  RotateCw,
  Copy as CopyIcon,
  Maximize2,
  Edit,
  Zap,
  Droplet,
  Grid,
  ChevronDown,
  User,
  TreePine,
  Car,
  ChevronRight,
  Lock,
  Unlock,
  FolderOpen,
  Folder,
  FolderTree,
  Sliders,
  // Systems icons
  Lightbulb,
  LightbulbOff,
  Plug,
  Tv,
  Wifi,
  Power,
  ToggleRight,
  Shuffle,
  CircleDot,
  ArrowDownToLine,
  Server,
  Box as BoxIcon,
  Bell,
  Volume2,
  Thermometer,
  Flashlight,
  Siren,
  Sun,
  Phone,
  Video as VideoIcon,
  Activity,
  Info,
  Notebook,
  FileSearch
} from "lucide-react";
import { TEMPLATES } from "../data/templates";
import { TemplatePreview } from "./TemplatePreview";
import { getBIMSymbolEntities } from "./CADCanvas";
import { BIMPropertyCardDialog } from "./BIMPropertyCardDialog";
import { BIMFamilyPropertyDialog } from "./BIMFamilyPropertyDialog";

const BIM_SYSTEMS_DICTIONARY: Record<string, { label: string; system: 'elettrico' | 'idraulico' }> = {
  // Elettrico
  'punto_luce': { label: 'Punto Luce', system: 'elettrico' },
  'presa_standard': { label: 'Presa Standard 10/16A', system: 'elettrico' },
  'presa_schuko': { label: 'Presa Schuko 16A', system: 'elettrico' },
  'presa_tv': { label: 'Presa TV', system: 'elettrico' },
  'presa_dati': { label: 'Presa Dati/LAN', system: 'elettrico' },
  'interruttore': { label: 'Interruttore', system: 'elettrico' },
  'interruttore_bipolare': { label: 'Interruttore Bipolare', system: 'elettrico' },
  'deviatore': { label: 'Deviatore', system: 'elettrico' },
  'invertitore': { label: 'Invertitore', system: 'elettrico' },
  'pulsante': { label: 'Pulsante', system: 'elettrico' },
  'pulsante_tirante': { label: 'Pulsante con Tirante', system: 'elettrico' },
  'quadro': { label: 'Quadro Elettrico', system: 'elettrico' },
  'scatola_derivazione': { label: 'Scatola Derivazione', system: 'elettrico' },
  'suoneria': { label: 'Suoneria Campanello', system: 'elettrico' },
  'ronzatore': { label: 'Ronzatore', system: 'elettrico' },
  'termostato': { label: 'Termostato Ambiente', system: 'elettrico' },
  'faretto': { label: 'Faretto Incasso', system: 'elettrico' },
  'lampada_emergenza': { label: 'Lampada d\'Emergenza', system: 'elettrico' },
  'applique': { label: 'Applique da Muro', system: 'elettrico' },
  'citofono': { label: 'Citofono', system: 'elettrico' },
  'videocitofono': { label: 'Videocitofono', system: 'elettrico' },

  // Idraulico
  'carico_af': { label: 'Carico Acqua Fredda (AF)', system: 'idraulico' },
  'carico_ac': { label: 'Carico Acqua Calda (AC)', system: 'idraulico' },
  'scarico_idr': { label: 'Scarico Idrico', system: 'idraulico' },
  'caldaia': { label: 'Caldaia / Boiler', system: 'idraulico' },
  'collettore': { label: 'Collettore Impianto', system: 'idraulico' }
};

const SYSTEM_ICONS: Record<string, React.FC<any>> = {
  'punto_luce': Lightbulb,
  'presa_standard': Plug,
  'presa_schuko': Zap,
  'presa_tv': Tv,
  'presa_dati': Wifi,
  'interruttore': Power,
  'interruttore_bipolare': ToggleRight,
  'deviatore': Repeat,
  'invertitore': Shuffle,
  'pulsante': CircleDot,
  'pulsante_tirante': ArrowDownToLine,
  'quadro': Server,
  'scatola_derivazione': BoxIcon,
  'suoneria': Bell,
  'ronzatore': Volume2,
  'termostato': Thermometer,
  'faretto': Flashlight,
  'lampada_emergenza': Siren,
  'applique': Sun,
  'citofono': Phone,
  'videocitofono': VideoIcon,
  'carico_af': Droplet,
  'carico_ac': Droplet,
  'scarico_idr': Droplet,
  'caldaia': Volume2,
  'collettore': Layers
};

interface BIMWorkspacePanelProps {
  entities: Entity[];
  selectedTool: string | null;
  setSelectedTool: (tool: string) => void;
  setEntities: React.Dispatch<React.SetStateAction<Entity[]>> | ((updater: (prev: Entity[]) => Entity[]) => void);
  onCommitHistory?: (entities: Entity[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  cadCanvasRef?: React.RefObject<any>;
  selectedTemplateId?: string | null;
  setSelectedTemplateId?: (id: string | null) => void;

  // Custom drill-down dialog openers
  onOpenMuri?: () => void;
  onOpenPorte?: () => void;
  onOpenFinestre?: () => void;
  onOpenArredi?: () => void;
  onOpenSanitari?: () => void;
  onOpenElettrico?: () => void;
  onOpenIdraulico?: () => void;
  onOpenFiniture?: () => void;
  onEditArea?: (id: string) => void;
  onOpen3DView?: () => void;
  onOpenAnalyzer?: () => void;
}

// Shoelace formula helper
function getRoomAreaMq(roomPoints: Point[]): number {
  if (!roomPoints || roomPoints.length < 3) return 0;
  let area = 0;
  const len = roomPoints.length;
  for (let i = 0; i < len; i++) {
    const p1 = roomPoints[i];
    const p2 = roomPoints[(i + 1) % len];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(area) / 20000; // Divided by 10000 to convert to MQ, and 2 for shoelace
}

// Perimeter helper
function getRoomPerimeterM(roomPoints: Point[]): number {
  if (!roomPoints || roomPoints.length < 2) return 0;
  let perimeter = 0;
  const len = roomPoints.length;
  for (let i = 0; i < len; i++) {
    const p = roomPoints[i];
    const nextP = roomPoints[(i + 1) % len];
    perimeter += Math.sqrt((nextP.x - p.x)**2 + (nextP.y - p.y)**2);
  }
  return perimeter / 100; // cm to meters
}

export function BIMWorkspacePanel({
  entities,
  selectedTool,
  setSelectedTool,
  setEntities,
  onCommitHistory,
  selectedId,
  onSelect,
  cadCanvasRef,
  selectedTemplateId,
  setSelectedTemplateId,
  onOpenMuri,
  onOpenPorte,
  onOpenFinestre,
  onOpenArredi,
  onOpenSanitari,
  onOpenElettrico,
  onOpenIdraulico,
  onOpenFiniture,
  onEditArea,
  onOpen3DView,
  onOpenAnalyzer
}: BIMWorkspacePanelProps) {
  const [customRoomName, setCustomRoomName] = useState<string>("");
  const [open2DSection, setOpen2DSection] = useState<boolean>(false);
  const [active2DCat, setActive2DCat] = useState<string>('Verde');
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set(['Muri Portanti', 'Tramezzature']));
  const [showPropertyDialogId, setShowPropertyDialogId] = useState<string | null>(null);
  const [showFamilyPropertyDialog, setShowFamilyPropertyDialog] = useState<string | null>(null);

  const bimElements = entities.filter(e => e.isBIM);
  
  const elementsByFamily = React.useMemo(() => {
    const groups: Record<string, Entity[]> = {};
    bimElements.forEach(e => {
        const family = (e as any).bimFamily || (e as any).bimAreaType || 'Altri Elementi';
        if (!groups[family]) groups[family] = [];
        groups[family].push(e);
    });
    return groups;
  }, [bimElements]);

  const toggleFamily = (family: string) => {
    const next = new Set(expandedFamilies);
    if (next.has(family)) next.delete(family);
    else next.add(family);
    setExpandedFamilies(next);
  };

  const toggleVisibility = (id: string) => {
    setEntities((prev: Entity[]) => {
      const next = prev.map(e => e.id === id ? { ...e, isVisible: !(e as any).isVisible } as any : e);
      onCommitHistory?.(next);
      return next;
    });
  };

  const toggleFrozen = (id: string) => {
    setEntities((prev: Entity[]) => {
      const next = prev.map(e => e.id === id ? { ...e, isFrozen: !(e as any).isFrozen } as any : e);
      onCommitHistory?.(next);
      return next;
    });
  };

  // Live grouped symbols counting for UI rendering
  const activeSymbolsSummary = React.useMemo(() => {
    const uniqueMap = new Map<string, { name: string; count: number; system: 'elettrico' | 'idraulico'; label: string }>();
    const visited = new Set<string>();

    entities.forEach(ent => {
      if (ent.isBIM && (ent.bimType === 'electrical_symbol' || ent.bimType === 'hydraulic_symbol')) {
        const grp = ent.groupId;
        const name = ent.bimName || 'unknown';
        if (grp) {
          if (!visited.has(grp)) {
            visited.add(grp);
            const info = BIM_SYSTEMS_DICTIONARY[name] || {
              label: name.replace('_', ' ').toUpperCase(),
              system: ent.bimType === 'electrical_symbol' ? 'elettrico' : 'idraulico'
            };
            const current = uniqueMap.get(name) || {
              name,
              count: 0,
              system: info.system,
              label: info.label
            };
            current.count += 1;
            uniqueMap.set(name, current);
          }
        } else {
          const info = BIM_SYSTEMS_DICTIONARY[name] || {
            label: name.replace('_', ' ').toUpperCase(),
            system: ent.bimType === 'electrical_symbol' ? 'elettrico' : 'idraulico'
          };
          const current = uniqueMap.get(name) || {
            name,
            count: 0,
            system: info.system,
            label: info.label
          };
          current.count += 1;
          uniqueMap.set(name, current);
        }
      }
    });

    const list = Array.from(uniqueMap.values());
    return {
      all: list,
      electric: list.filter(item => item.system === 'elettrico'),
      hydraulic: list.filter(item => item.system === 'idraulico')
    };
  }, [entities]);

  const [legendInsertingState, setLegendInsertingState] = useState<string>("default");
  const [legendScale, setLegendScale] = useState<number>(2.0);

  const handleInsertLegendToDrawing = () => {
    const symbolList = activeSymbolsSummary.all;
    if (symbolList.length === 0) {
      alert("Nessun simbolo d'impianto posizionato sul disegno. Inserisci prima dei simboli dal menu superiore!");
      return;
    }

    setLegendInsertingState("inserting");

    // Default start position
    let startX = 300;
    let startY = 30;
    let maxX = -999999;
    let minY = 999999;
    let foundEntities = false;

    // Check if a previous legend already exists to maintain its custom position if moved
    const existingLegend = entities.find(e => e.layer === 'BIM_Legenda' && e.type === 'image') as any;
    if (existingLegend && existingLegend.point) {
      startX = existingLegend.point.x;
      startY = existingLegend.point.y;
    } else {
      entities.forEach(e => {
        if (e.layer === 'BIM_Legenda') return;
        if (e.type === 'line' && (e as any).start && (e as any).end) {
          maxX = Math.max(maxX, (e as any).start.x, (e as any).end.x);
          minY = Math.min(minY, (e as any).start.y, (e as any).end.y);
          foundEntities = true;
        } else if (e.type === 'circle' && (e as any).center) {
          const rad = (e as any).radius || 0;
          maxX = Math.max(maxX, (e as any).center.x + rad);
          minY = Math.min(minY, (e as any).center.y - rad);
          foundEntities = true;
        } else if (e.type === 'rectangle' && (e as any).p1 && (e as any).p2) {
          maxX = Math.max(maxX, (e as any).p1.x, (e as any).p2.x);
          minY = Math.min(minY, (e as any).p1.y, (e as any).p2.y);
          foundEntities = true;
        } else if (e.type === 'arc' && (e as any).center) {
          const rad = (e as any).radius || 0;
          maxX = Math.max(maxX, (e as any).center.x + rad);
          minY = Math.min(minY, (e as any).center.y - rad);
          foundEntities = true;
        }
      });

      if (foundEntities && maxX !== -999999 && minY !== 999999) {
        startX = maxX + 40;
        startY = minY;
      }
    }

    const scale = legendScale;
    const tableWidth = 160 * scale;
    const col1Width = 35 * scale;
    const col2Width = 95 * scale;
    const col3Width = 30 * scale;

    const titleH = 22 * scale;
    const rowH = 18 * scale;
    const layerId = 'BIM_Legenda';

    const electrics = activeSymbolsSummary.electric;
    const hydraulics = activeSymbolsSummary.hydraulic;

    // First simulated layout pass to calculate exact total table height
    let totalHeight = 0;
    totalHeight += titleH; // Title bar height
    totalHeight += 12 * scale; // Columns header height

    if (electrics.length > 0) {
      totalHeight += 12 * scale; // Electric section header height
      electrics.forEach(() => {
        totalHeight += rowH;
      });
    }

    if (hydraulics.length > 0) {
      totalHeight += 12 * scale; // Hydraulic section header height
      hydraulics.forEach(() => {
        totalHeight += rowH;
      });
    }

    // Bottom border offset
    totalHeight += 2; // minor spacing padding safe zone

    // Create a high-DPI offscreen HTML5 Canvas
    const canvas = document.createElement('canvas');
    const resolutionScale = 4.0; // High resolution rendering for printing & scaling
    canvas.width = tableWidth * resolutionScale;
    canvas.height = totalHeight * resolutionScale;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setLegendInsertingState("default");
      return;
    }

    ctx.save();
    ctx.scale(resolutionScale, resolutionScale);

    // Render solid paper-white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tableWidth, totalHeight);

    // Drawing helpers
    const drawLine = (x1: number, y1: number, x2: number, y2: number, lineWidth = 0.5, color = '#1e293b') => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth * Math.sqrt(scale);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };

    const drawText = (text: string, x: number, y: number, fontSize = 7.5, fontWeight = 'normal', align: 'left' | 'center' | 'right' = 'left', color = '#1e3a8a') => {
      ctx.save();
      ctx.fillStyle = color;
      ctx.font = `${fontWeight === 'bold' ? 'bold ' : ''}${fontSize * scale}px sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'top';
      ctx.fillText(text, x, y);
      ctx.restore();
    };

    const drawHatch = (fillColor: string, opacity: number, y: number, heightVal: number) => {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = fillColor;
      ctx.fillRect(0, y, tableWidth, heightVal);
      ctx.restore();
    };

    let drawY = 0;

    // Main Table header line (double horizontal accent line)
    drawLine(0, drawY, tableWidth, drawY, 1.2, '#1e293b');
    drawLine(0, drawY + 1.2 * scale, tableWidth, drawY + 1.2 * scale, 0.6, '#1e293b');

    // Title and sub-title
    drawText("LEGENDA IMPIANTI", tableWidth / 2, drawY + 4.5 * scale, 9, 'bold', 'center', '#0f172a');
    drawText("Sincronizzazione BIM Realtime", tableWidth / 2, drawY + 13.5 * scale, 5.5, 'normal', 'center', '#475569');

    drawY += titleH;
    drawLine(0, drawY, tableWidth, drawY, 0.8, '#475569');

    // Section headers columns
    drawText("SIMBOLO", col1Width / 2, drawY + 3.5 * scale, 7, 'bold', 'center', '#1e293b');
    drawText("DESCRIZIONE COMPONENTE", col1Width + 4 * scale, drawY + 3.5 * scale, 7, 'bold', 'left', '#1e293b');
    drawText("QTY", col1Width + col2Width + col3Width / 2, drawY + 3.5 * scale, 7, 'bold', 'center', '#1e293b');

    drawY += 12 * scale;
    drawLine(0, drawY, tableWidth, drawY, 0.8, '#475569');

    // Section 1: ELETTRICO
    if (electrics.length > 0) {
      drawHatch('#fef08a', 0.18, drawY, 12 * scale);
      drawText("⚡ IMPIANTO ELETTRICO STANDARD CEI / BIM", 4 * scale, drawY + 3.0 * scale, 6.5, 'bold', 'left', '#854d0e');
      drawY += 12 * scale;
      drawLine(0, drawY, tableWidth, drawY, 0.6, '#cbd5e1');

      electrics.forEach(sym => {
        const symbolCenter = { x: col1Width / 2, y: drawY + rowH / 2 };
        const geometries = getBIMSymbolEntities(sym.name, 0.65 * scale);
        
        ctx.save();
        geometries.forEach(geo => {
          if (geo.type === 'line' && geo.start && geo.end) {
            ctx.beginPath();
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 0.65 * Math.sqrt(scale);
            ctx.moveTo(symbolCenter.x + geo.start.x, symbolCenter.y + geo.start.y);
            ctx.lineTo(symbolCenter.x + geo.end.x, symbolCenter.y + geo.end.y);
            ctx.stroke();
          } else if (geo.type === 'circle' && geo.center && geo.radius) {
            ctx.beginPath();
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 0.65 * Math.sqrt(scale);
            ctx.arc(symbolCenter.x + geo.center.x, symbolCenter.y + geo.center.y, geo.radius, 0, Math.PI * 2);
            ctx.stroke();
          } else if (geo.type === 'arc' && geo.center && geo.radius) {
            ctx.beginPath();
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 0.65 * Math.sqrt(scale);
            ctx.arc(symbolCenter.x + geo.center.x, symbolCenter.y + geo.center.y, geo.radius, (geo.startAngle || 0) * Math.PI / 180, (geo.endAngle || 360) * Math.PI / 180);
            ctx.stroke();
          } else if (geo.type === 'text' && geo.center && geo.text) {
            ctx.save();
            ctx.fillStyle = '#1e293b';
            ctx.font = `600 ${5.5 * scale}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(geo.text, symbolCenter.x + geo.center.x, symbolCenter.y + geo.center.y);
            ctx.restore();
          }
        });
        ctx.restore();

        drawText(sym.label, col1Width + 4 * scale, symbolCenter.y - 4 * scale, 6.5, 'normal', 'left', '#334155');
        drawText(sym.count.toString(), col1Width + col2Width + col3Width / 2, symbolCenter.y - 4.5 * scale, 8, 'bold', 'center', '#0f172a');

        drawY += rowH;
        drawLine(0, drawY, tableWidth, drawY, 0.4, '#e2e8f0');
      });
    }

    // Section 2: IDRAULICO
    if (hydraulics.length > 0) {
      drawHatch('#e0f2fe', 0.18, drawY, 12 * scale);
      drawText("💧 IMPIANTO IDRAULICO & TERMICO", 4 * scale, drawY + 3.0 * scale, 6.5, 'bold', 'left', '#0369a1');
      drawY += 12 * scale;
      drawLine(0, drawY, tableWidth, drawY, 0.6, '#cbd5e1');

      hydraulics.forEach(sym => {
        const symbolCenter = { x: col1Width / 2, y: drawY + rowH / 2 };
        const geometries = getBIMSymbolEntities(sym.name, 0.65 * scale);
        
        ctx.save();
        geometries.forEach(geo => {
          if (geo.type === 'line' && geo.start && geo.end) {
            ctx.beginPath();
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 0.65 * Math.sqrt(scale);
            ctx.moveTo(symbolCenter.x + geo.start.x, symbolCenter.y + geo.start.y);
            ctx.lineTo(symbolCenter.x + geo.end.x, symbolCenter.y + geo.end.y);
            ctx.stroke();
          } else if (geo.type === 'circle' && geo.center && geo.radius) {
            ctx.beginPath();
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 0.65 * Math.sqrt(scale);
            ctx.arc(symbolCenter.x + geo.center.x, symbolCenter.y + geo.center.y, geo.radius, 0, Math.PI * 2);
            ctx.stroke();
          } else if (geo.type === 'arc' && geo.center && geo.radius) {
            ctx.beginPath();
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 0.65 * Math.sqrt(scale);
            ctx.arc(symbolCenter.x + geo.center.x, symbolCenter.y + geo.center.y, geo.radius, (geo.startAngle || 0) * Math.PI / 180, (geo.endAngle || 360) * Math.PI / 180);
            ctx.stroke();
          } else if (geo.type === 'text' && geo.center && geo.text) {
            ctx.save();
            ctx.fillStyle = '#0369a1';
            ctx.font = `600 ${5.5 * scale}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(geo.text, symbolCenter.x + geo.center.x, symbolCenter.y + geo.center.y);
            ctx.restore();
          }
        });
        ctx.restore();

        drawText(sym.label, col1Width + 4 * scale, symbolCenter.y - 4 * scale, 6.5, 'normal', 'left', '#334155');
        drawText(sym.count.toString(), col1Width + col2Width + col3Width / 2, symbolCenter.y - 4.5 * scale, 8, 'bold', 'center', '#0f172a');

        drawY += rowH;
        drawLine(0, drawY, tableWidth, drawY, 0.4, '#e2e8f0');
      });
    }

    // Table outer borders
    drawLine(0, drawY, tableWidth, drawY, 1.2, '#1e293b'); // bottom outer
    drawLine(0, 0, 0, drawY, 1.2, '#1e293b'); // left outer
    drawLine(col1Width, titleH, col1Width, drawY, 0.6, '#94a3b8'); // internal left divider
    drawLine(col1Width + col2Width, titleH, col1Width + col2Width, drawY, 0.6, '#94a3b8'); // internal right divider
    drawLine(tableWidth, 0, tableWidth, drawY, 1.2, '#1e293b'); // right outer

    ctx.restore();

    // Export offscreen canvas as high-fidelity PNG image
    const dataUrl = canvas.toDataURL('image/png');

    // Create the single responsive ImageEntity
    const newLegendEntity: Entity = {
      id: 'legenda_img_' + Date.now().toString(),
      type: 'image',
      layer: layerId,
      point: { x: startX, y: startY },
      width: tableWidth,
      height: totalHeight,
      src: dataUrl,
      mediaType: 'image',
      name: 'Legenda Impianti',
      angle: 0,
      opacity: 1.0,
      brightness: 100,
      contrast: 100,
      blendMode: 'normal'
    } as any;

    if (typeof setEntities === 'function') {
      (setEntities as any)((prev: Entity[]) => {
        const clean = prev.filter(e => e.layer !== 'BIM_Legenda');
        onCommitHistory?.([...clean, newLegendEntity]);
        return [...clean, newLegendEntity];
      });
    }

    setLegendInsertingState("success");
    setTimeout(() => {
      setLegendInsertingState("default");
    }, 2000);
  };

  // Filter BIM entities
  const bimRooms = entities.filter(e => e.isBIM && e.bimType === 'room');
  const bimDoors = entities.filter(e => e.isBIM && e.bimType === 'door');
  const bimWindows = entities.filter(e => e.isBIM && e.bimType === 'window');

  // Currently selected BIM entity
  const selectedEntity = selectedId ? entities.find(e => e.id === selectedId) : null;
  const isBIMSelected = selectedEntity && selectedEntity.isBIM;

  // Compute metric calculations
  const totalRoomArea = bimRooms.reduce((acc, r) => {
    const pts = (r as any).bimPoints || (r as any).points;
    return acc + getRoomAreaMq(pts);
  }, 0);

  const totalRoomPerimeter = bimRooms.reduce((acc, r) => {
    const pts = (r as any).bimPoints || (r as any).points;
    return acc + getRoomPerimeterM(pts);
  }, 0);

  // Total width of all doors (in meters) to subtract for baseboards
  const totalDoorsWidthM = bimDoors.reduce((acc, d) => {
    return acc + ((d as any).bimWidth || 80) / 100;
  }, 0);

  // Intelligent Battiscopa (Baseboards) = Perimeters - Doors passage width
  const intelligentBaseboardM = Math.max(0, totalRoomPerimeter - totalDoorsWidthM);

  // Light ratios validating
  const totalWindowsLightAreaMq = bimWindows.reduce((acc, w) => {
    const widthM = ((w as any).bimWidth || 120) / 100;
    const heightM = ((w as any).bimWindowHeight || 140) / 100;
    return acc + (widthM * heightM);
  }, 0);

  // Update selected entity helper
  const updateSelectedBIMField = (field: string, value: any) => {
    if (!selectedId) return;
    
    const updateFunc = (prev: Entity[]) => {
      const next = prev.map(e => {
        if (e.id === selectedId) {
          let updated = { ...e, [field]: value } as any;
          
          // Clear bimData so it's regenerated from updated legacy fields
          if (field.startsWith('bim') || field === 'color' || field === 'backgroundColor') {
            updated.bimData = undefined;
          }

          if (field === 'bimFamily' || field === 'bimAreaType') {
             updated.bimSubFamily = value;
             updated.bimFamilyId = value;
          }
          
          if (field === 'bimWidth' && (e.bimType === 'door' || e.bimType === 'window')) {
            const start = (e as any).start;
            const end = (e as any).end;
            if (start && end) {
               const dx = end.x - start.x;
               const dy = end.y - start.y;
               const currentLen = Math.sqrt(dx * dx + dy * dy);
               if (currentLen > 0.01) {
                  const newLen = value;
                  updated.end = {
                    x: start.x + (dx / currentLen) * newLen,
                    y: start.y + (dy / currentLen) * newLen
                  };
               }
            }
          }
          return updated;
        }
        return e;
      });
      onCommitHistory?.(next);
      return next;
    };

    if (typeof setEntities === 'function') {
      (setEntities as any)(updateFunc);
    }
  };

  // Delete selected entity helper
  const deleteSelectedBIM = () => {
    if (!selectedId) return;

    const updateFunc = (prev: Entity[]) => {
      const next = prev.filter(e => e.id !== selectedId);
      onCommitHistory?.(next);
      return next;
    };

    if (typeof setEntities === 'function') {
      (setEntities as any)(updateFunc);
    }
    onSelect(null);
  };

  // Export report as CSV containing Bill of Quantities
  const handleExportTextReport = () => {
    let report = `========================================================\n`;
    report += `COMPUTO METRICO BIM ESTIMATIVO & ANALISI SUPERFICI      \n`;
    report += `Generato automaticamente da GE-COLA CAD BIM AI          \n`;
    report += `========================================================\n\n`;

    report += `1. RILIEVO E STIMA DELLE SUPERFICI & CASSERI (STANTE)\n`;
    report += `--------------------------------------------------------\n`;
    report += `ID\tNome Locale\tAltezza (m)\tArea (mq)\tPerimetro (m)\tVolume (mc)\tCasseri (mq)\n`;
    let totalCasseri = 0;
    bimRooms.forEach((r, idx) => {
      const pts = (r as any).bimPoints || (r as any).points;
      const area = getRoomAreaMq(pts);
      const per = getRoomPerimeterM(pts);
      const h = r.bimHeight || 2.70;
      const vol = area * h;
      const cass = area + (per * h);
      totalCasseri += cass;
      report += `${r.id.substring(0, 5)}\t${r.bimName || 'Unlabeled'}\t${h.toFixed(2)}\t${area.toFixed(2)}\t${per.toFixed(2)}\t${vol.toFixed(1)}\t${cass.toFixed(2)}\n`;
    });
    report += `--------------------------------------------------------\n`;
    report += `Totale Locali Rilevati: ${bimRooms.length}\n`;
    report += `Superficie Calpestabile Totale: ${totalRoomArea.toFixed(2)} mq\n`;
    report += `Superficie Totale Casseri C.A.: ${totalCasseri.toFixed(2)} mq\n\n`;

    report += `2. ELEMENTI BIM RILEVATI SUI LAYER DEDICATI\n`;
    report += `--------------------------------------------------------\n`;
    entities.forEach(ent => {
      if (ent.isBIM && ent.bimType) {
        report += `ID: ${ent.id.substring(0, 5)}\tTipo: ${ent.bimType.toUpperCase()}\tNome: ${ent.bimName || 'Non specificato'}\tLayer: ${ent.layer || 'BIM'}\n`;
      }
    });
    report += `--------------------------------------------------------\n\n`;

    report += `3. ANALISI AEROILLUMINANTE & BATTISCOPA NETTO\n`;
    report += `--------------------------------------------------------\n`;
    report += `- Sviluppo Battiscopa Netto: ${intelligentBaseboardM.toFixed(2)} m\n`;
    report += `- Superficie Finestratura Totale: ${totalWindowsLightAreaMq.toFixed(2)} mq\n`;
    const aerRatio = totalWindowsLightAreaMq > 0 && totalRoomArea > 0 ? (totalWindowsLightAreaMq / totalRoomArea) : 0;
    report += `  Superficie aerante/illuminante calcolata: 1 / ${(aerRatio > 0 ? (1/aerRatio).toFixed(1) : '∞')}\n`;
    report += `  Regolamento Igienico-Sanitario (Limite 1/8): ${aerRatio >= 0.125 ? 'IDONEO (Soddisfatto ✅)' : 'NON IDONEO ⚠️ (Verificare rapporti)'}\n`;
    report += `========================================================\n`;

    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Computo_Metrico_BIM_${new Date().getFullYear()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const roomSuggerite = [
    "Soggiorno",
    "Cucina",
    "Camera Matrimoniale",
    "Camera Singola",
    "Bagno",
    "Corridoio",
    "Studio",
    "Balcone"
  ];

  return (
    <div className="space-y-6">
      {/* Intestazione BIM */}
      <div className="bg-gradient-to-br from-cyan-900 to-slate-900 text-white p-4 rounded-xl shadow-lg border border-cyan-500/30">
        <div className="flex items-center gap-2 mb-2">
          <Building className="text-cyan-400 animate-pulse" size={20} />
          <h4 className="font-bold text-sm tracking-wide">Automazione BIM Integrata</h4>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-300">
          Traccia elementi strutturali avanzati su layer automatici dedicati, configura impianti, arredi, e pavimenti per calcoli metrici in tempo reale.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button 
            onClick={() => setShowFamilyPropertyDialog("Ponteggio")}
            className="col-span-2 w-full bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-black py-3 rounded-lg flex items-center justify-center gap-2 text-[11px] tracking-wider uppercase transition-all shadow-[0_10px_20px_rgba(234,88,12,0.25)] cursor-pointer border border-orange-400/30 font-sans"
            title="Apri Suite Sicurezza Ponteggi, Relazione FEM e Pi.M.U.S."
          >
            🛡️ Relazioni Ponteggio & Pi.M.U.S. (FEM)
          </button>
          <button 
            onClick={onOpen3DView}
            className="w-full bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black py-2.5 rounded-lg flex items-center justify-center gap-1.5 text-[10px] tracking-wider uppercase transition-all shadow-[0_10px_20px_rgba(34,211,238,0.15)] cursor-pointer"
          >
            <BoxIcon size={14} />
            Visione 3D
          </button>
          <button 
            onClick={onOpenAnalyzer}
            className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-black py-2.5 rounded-lg flex items-center justify-center gap-1.5 text-[10px] tracking-wider uppercase transition-all shadow-[0_10px_20px_rgba(79,70,229,0.15)] cursor-pointer"
            title="Analizza Pacchetti Dati (JSON/TXT)"
          >
            <FileSearch size={14} />
            Analizza Pacchetto
          </button>
          <button 
            onClick={() => {
              const treeEl = document.getElementById('bim-manager-tree');
              if (treeEl) {
                treeEl.scrollIntoView({ behavior: 'smooth' });
                treeEl.classList.add('ring-2', 'ring-cyan-450', 'ring-offset-2');
                setTimeout(() => {
                  treeEl.classList.remove('ring-2', 'ring-cyan-450', 'ring-offset-2');
                }, 2000);
              }
            }}
            className="w-full bg-slate-800 hover:bg-slate-750 text-cyan-400 border border-cyan-500/30 font-black py-2.5 rounded-lg flex items-center justify-center gap-1.5 text-[10px] tracking-wider uppercase transition-all cursor-pointer"
            title="Mostra / Gestisci rami e alberature BIM"
          >
            <FolderTree size={14} className="text-cyan-400" />
            Rami BIM
          </button>
        </div>
      </div>

      {/* BIM MANAGER - HIERARCHICAL TREE VIEW */}
      <div id="bim-manager-tree" className="border border-cyan-200/50 bg-white rounded-xl overflow-hidden shadow-sm transition-all duration-300">
        <div className="bg-cyan-50/50 p-2.5 px-3 border-b border-cyan-100 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-cyan-900 font-mono flex items-center gap-1.5">
            <FolderTree size={13} className="text-cyan-600" />
            Rami BIM (Albero Struttura)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const allVisible = bimElements.every(m => (m as any).isVisible !== false);
                const nextVisible = !allVisible;
                setEntities((prev: Entity[]) => {
                  const next = prev.map(ent => {
                    if (ent.isBIM) {
                      return { ...ent, isVisible: nextVisible } as any;
                    }
                    return ent;
                  });
                  onCommitHistory?.(next);
                  return next;
                });
              }}
              className={`p-1 rounded-md transition-all duration-200 cursor-pointer ${
                bimElements.every(m => (m as any).isVisible !== false) ? 'text-amber-500 hover:bg-white border border-transparent hover:border-amber-100' : 'text-slate-400 hover:bg-white border border-slate-200/50'
              }`}
              title={bimElements.every(m => (m as any).isVisible !== false) ? "Spegni tutto l'albero BIM" : "Accendi tutto l'albero BIM"}
            >
              {bimElements.every(m => (m as any).isVisible !== false) ? <Lightbulb size={12.5} /> : <LightbulbOff size={12.5} />}
            </button>
            <span className="text-[9px] bg-white border border-cyan-200 text-cyan-700 px-1.5 py-0.5 rounded-full font-bold">
              {bimElements.length} elementi
            </span>
          </div>
        </div>

        <div className="max-h-[350px] overflow-y-auto divide-y divide-slate-100">
          {Object.entries(elementsByFamily).length > 0 ? (
            (Object.entries(elementsByFamily) as [string, Entity[]][]).map(([family, members]) => {
              const isExpanded = expandedFamilies.has(family);
              const allVisible = members.every(m => (m as any).isVisible !== false);
              const allFrozen = members.every(m => (m as any).isFrozen === true);
              
              return (
                <div key={family} className="group/family bg-slate-50/20">
                  {/* Family Header */}
                  <div 
                    className="flex items-center p-2.5 hover:bg-slate-50 transition cursor-pointer gap-2"
                    onClick={() => toggleFamily(family)}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-slate-400 select-none shrink-0 transition-transform duration-205">
                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </span>
                      {isExpanded ? (
                        <FolderOpen size={13.5} className="text-amber-500 fill-amber-100 shrink-0" />
                      ) : (
                        <Folder size={13.5} className="text-amber-500 fill-amber-50 shrink-0" />
                      )}
                      <span className="text-[11px] font-extrabold text-slate-850 truncate" title={family}>
                        {family}
                      </span>
                      <span className="text-[9px] text-slate-450 font-bold font-mono">({members.length})</span>
                      <span className="text-[9px] text-cyan-600 font-bold font-mono ml-auto mr-2">{members.reduce((acc, ent) => acc + computeMetrics(ent as any).volumeMc, 0).toFixed(2)} mc</span>
                    </div>

                    {/* Actions on family level */}
                    <div className="flex items-center gap-1.5 shrink-0 transition duration-200" onClick={(e) => e.stopPropagation()}>
                      {/* Family Visibility */}
                      <button 
                        onClick={() => {
                          const nextVisible = !allVisible;
                          setEntities((prev: Entity[]) => {
                            const next = prev.map(ent => {
                              const isMem = ent.isBIM && (((ent as any).bimFamily || (ent as any).bimAreaType || 'Altri Elementi') === family);
                              return isMem ? { ...ent, isVisible: nextVisible } as any : ent;
                            });
                            onCommitHistory?.(next);
                            return next;
                          });
                        }}
                        className={`p-1 rounded-md transition-all duration-200 cursor-pointer ${
                          allVisible ? 'text-amber-500 hover:bg-white border border-transparent hover:border-amber-100' : 'text-slate-400 hover:bg-white border border-transparent'
                        }`}
                        title={allVisible ? "Spegni tutta la famiglia" : "Accendi tutta la famiglia"}
                      >
                        {allVisible ? <Lightbulb size={12.5} /> : <LightbulbOff size={12.5} />}
                      </button>

                       {/* Family Properties */}
                      <button 
                        onClick={() => {
                          console.log("Family Property Clicked for:", family);
                          setShowFamilyPropertyDialog(family);
                        }}
                        className="p-1 rounded border border-red-500 bg-red-100 text-red-600 hover:bg-red-200"
                        title="Parametri e Riepilogo Famiglia"
                      >
                        <Sliders size={16} />
                      </button>

                      {/* Family Freezing */}
                      <button 
                        onClick={() => {
                          const nextFrozen = !allFrozen;
                          setEntities((prev: Entity[]) => {
                            const next = prev.map(ent => {
                              const isMem = ent.isBIM && (((ent as any).bimFamily || (ent as any).bimAreaType || 'Altri Elementi') === family);
                              return isMem ? { ...ent, isFrozen: nextFrozen } as any : ent;
                            });
                            onCommitHistory?.(next);
                            return next;
                          });
                        }}
                        className={`p-1 rounded-md transition-all duration-200 cursor-pointer ${
                          allFrozen ? 'text-amber-600 hover:bg-white border border-transparent hover:border-amber-100' : 'text-slate-400 hover:bg-white border border-transparent'
                        }`}
                        title={allFrozen ? "Sblocca tutta la famiglia" : "Congela/Blocca tutta la famiglia"}
                      >
                        {allFrozen ? <Lock size={12.5} /> : <Unlock size={12.5} />}
                      </button>

                      {/* Delete Family */}
                      <button 
                        onClick={() => {
                          if (confirm(`Sei sicuro di voler eliminare interamente la famiglia "${family}" insieme a tutti i suoi ${members.length} oggetti?`)) {
                            setEntities((prev: Entity[]) => {
                              const next = prev.filter(ent => !(ent.isBIM && (((ent as any).bimFamily || (ent as any).bimAreaType || 'Altri Elementi') === family)));
                              onCommitHistory?.(next);
                              return next;
                            });
                            onSelect(null);
                          }
                        }}
                        className="p-1 rounded-md hover:bg-rose-50 text-rose-500 hover:text-rose-750 transition-all duration-200 cursor-pointer"
                        title="Elimina intera famiglia"
                      >
                        <Trash2 size={12.5} />
                      </button>
                    </div>
                  </div>

                  {/* Member elements under the family */}
                  {isExpanded && (
                    <div className="bg-white pb-1 border-t border-slate-100/50 divide-y divide-slate-50">
                      {members.map(member => {
                        const isSelected = member.id === selectedId;
                        const isHidden = (member as any).isVisible === false;
                        const isLocked = (member as any).isFrozen === true;
                        
                        return (
                          <div 
                            key={member.id}
                            onClick={() => onSelect(member.id)}
                            className={`flex items-center justify-between py-1.5 pl-6 pr-2 hover:bg-indigo-50/20 transition cursor-pointer group/item select-none ${
                              isSelected ? "bg-cyan-50/60 border-l-2 border-cyan-500" : ""
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span 
                                className="w-2 h-2 rounded-full shrink-0" 
                                style={{ backgroundColor: (member as any).backgroundColor || member.color || '#06b6d4' }} 
                              />
                              <span className={`text-[10.5px] truncate max-w-[105px] ${
                                isSelected ? "font-black text-cyan-950" : "text-slate-650 font-medium"
                              } ${isHidden ? "opacity-45 line-through decoration-slate-400" : ""}`}>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {(member as any).bimName || "Elemento senza nome"}
                                  {((member as any).objectWidth || (member as any).bimWidth) && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-[9px] text-emerald-400 font-mono font-black border border-emerald-500/20 shadow-sm">
                                      S: {(member as any).objectWidth || (member as any).bimWidth}cm
                                    </span>
                                  )}
                                  {((member as any).pattern && (member as any).pattern !== 'SOLID' && (member as any).pattern !== 'NONE') && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-[9px] text-indigo-400 font-mono font-black border border-indigo-500/20 shadow-sm uppercase">
                                      {(member as any).pattern.replace('TILE_', '').replace('PARQUET_', '')}
                                    </span>
                                  )}
                                </div>
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                              {/* Member Visibility */}
                              <button 
                                onClick={() => toggleVisibility(member.id)}
                                className={`p-1 rounded transition-colors cursor-pointer ${
                                  isHidden ? "text-slate-350 hover:bg-slate-100" : "text-amber-500 hover:bg-amber-50"
                                }`}
                                title={isHidden ? "Accendi lampadina elemento" : "Spegni lampadina elemento"}
                              >
                                {isHidden ? <LightbulbOff size={11} /> : <Lightbulb size={11} />}
                              </button>

                              {/* Member Lock */}
                              <button 
                                onClick={() => toggleFrozen(member.id)}
                                className={`p-1 rounded transition-colors cursor-pointer ${
                                  isLocked ? "text-amber-600 hover:bg-amber-50" : "text-slate-350 hover:bg-slate-100"
                                }`}
                                title={isLocked ? "Sblocca elemento" : "Congela elemento"}
                              >
                                {isLocked ? <Lock size={11} /> : <Unlock size={11} />}
                              </button>

                              {/* Member Properties */}
                              <button 
                                onClick={() => {
                                  onSelect(member.id);
                                  setShowPropertyDialogId(member.id);
                                }}
                                className={`p-1 rounded transition-colors cursor-pointer ${
                                  isSelected ? "text-cyan-700 bg-cyan-100/50" : "text-slate-355 hover:bg-slate-100 hover:text-slate-750"
                                }`}
                                title="Parametri e Proprietà"
                              >
                                <Sliders size={11} />
                              </button>

                              {/* Member Edit (Pencil) */}
                              <button 
                                onClick={() => onEditArea?.(member.id)}
                                className="p-1 rounded hover:bg-slate-100 text-slate-355 hover:text-slate-750 transition-colors cursor-pointer"
                                title="Modifica parametri grafici"
                              >
                                <Edit size={11} />
                              </button>

                              {/* Delete Member */}
                              <button 
                                onClick={() => {
                                  if (confirm(`Sei sicuro di voler eliminare l'elemento "${(member as any).bimName || 'Bimpl'}"?`)) {
                                    setEntities((prev: Entity[]) => {
                                      const next = prev.filter(e => e.id !== member.id);
                                      onCommitHistory?.(next);
                                      return next;
                                    });
                                    if (selectedId === member.id) {
                                      onSelect(null);
                                    }
                                  }
                                }}
                                className="p-1 rounded hover:bg-rose-50 text-rose-450 hover:text-rose-650 transition-colors cursor-pointer"
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
          ) : (
            <div className="p-8 text-center space-y-2">
              <div className="bg-slate-50 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2 text-slate-300 border border-slate-100 italic font-serif">
                BIM
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Nessun elemento strutturale rilevato.</p>
              <p className="text-[9px] text-slate-300">Usa "Rileva Elemento" per aggiungere fondazioni, murature o finiture.</p>
            </div>
          )}
        </div>
      </div>

      {/* 2D SYMBOLS COMPONENT RECONCILIATION */}
      <div className="border border-slate-200 bg-slate-50/50 rounded-xl overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setOpen2DSection(!open2DSection)}
          className="w-full flex justify-between items-center bg-slate-100 p-3 text-[11px] uppercase font-black tracking-widest text-slate-600 hover:bg-slate-200 transition font-mono border-b border-slate-200"
        >
          <span className="flex items-center gap-1.5">
            <Layers size={14} className="text-slate-500" />
            📂 Biblioteca Elementi 2D
          </span>
          <ChevronDown size={14} className={`transform transition ${open2DSection ? "rotate-180" : ""}`} />
        </button>

        {open2DSection && (
          <div className="p-3 bg-white space-y-3.5 max-h-[400px] overflow-y-auto">
            <div className="flex gap-1.5 border-b border-neutral-100 pb-1.5">
              {[
                { id: 'Verde', name: 'Alberi 🌲', icon: TreePine },
                { id: 'Persone', name: 'Persone 🧑', icon: User },
                { id: 'Mezzi', name: 'Mezzi 🚗', icon: Car }
              ].map(cat => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActive2DCat(cat.id)}
                    className={`flex-1 flex items-center justify-center gap-1 text-[9.5px] py-1 px-1.5 rounded transition ${
                      active2DCat === cat.id ? 'bg-indigo-600/10 text-indigo-700 border border-indigo-500/20 font-bold' : 'text-slate-500 hover:bg-neutral-50 border border-transparent'
                    }`}
                  >
                    <Icon size={11} />
                    {cat.name.split(' ')[0]}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.filter(t => t.category === active2DCat).map(template => (
                <button
                  key={template.id}
                  onClick={() => {
                    setSelectedTemplateId?.(template.id);
                    setSelectedTool('Template');
                  }}
                  className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all border group relative overflow-hidden ${selectedTemplateId === template.id && selectedTool === 'Template' ? "bg-indigo-600/10 border-indigo-500 ring-2 ring-indigo-200" : "bg-neutral-50 border-neutral-200 hover:border-neutral-300 hover:bg-white"}`}
                >
                  <div className="mb-1.5 transform scale-75 group-hover:scale-95 transition-transform duration-300">
                    <TemplatePreview template={template} size={40} />
                  </div>
                  <span className={`text-[8.5px] font-black text-center leading-tight line-clamp-1 ${selectedTemplateId === template.id && selectedTool === 'Template' ? "text-indigo-600" : "text-neutral-600"}`}>
                    {template.name}
                  </span>
                  <div className={`absolute top-0 right-0 px-1 text-white text-[6.5px] font-black uppercase ${template.view === 'prospetto' ? "bg-orange-500" : "bg-indigo-400"}`}>
                    {template.view === 'prospetto' ? 'Front' : 'Plan'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* INSPECTOR RANGE FOR SELECTED ELEMENTS */}
      {isBIMSelected && selectedEntity ? (
        <div className="bg-cyan-50/50 border border-cyan-200 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center border-b border-cyan-100 pb-1.5 gap-2">
            <h5 className="text-[10px] font-mono font-bold uppercase text-cyan-800 flex items-center gap-1 min-w-0 truncate">
              <Building size={12} className="shrink-0" />
              Ispezione Elemento
            </h5>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setShowPropertyDialogId(selectedEntity.id)}
                title="Apri Scheda Tecnica BIM Avanzata"
                className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-0.5 px-1.5 rounded text-[8.5px] uppercase flex items-center gap-0.5 transition-all shadow-sm cursor-pointer"
              >
                <Sliders size={8.5} />
                SCHEDA BIM 🚀
              </button>
              <button
                onClick={deleteSelectedBIM}
                title="Elimina Elemento BIM"
                className="text-rose-600 hover:text-rose-800 p-1 hover:bg-rose-50 rounded transition-colors cursor-pointer"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Dual Dynamic Visibility & Locking Controller (Element vs Family) */}
          <div className="bg-white/90 border border-cyan-100 rounded-lg p-2.5 space-y-2 text-xs shadow-sm">
            <div className="text-[8.5px] font-mono font-black text-cyan-800 uppercase tracking-widest border-b border-cyan-50 pb-1 flex items-center justify-between">
              <span>🎛️ Filtri & Controllo Rapido</span>
              <span className="text-[7.5px] bg-cyan-100 px-1 py-0.2 rounded text-cyan-700">Multi-Livello</span>
            </div>
            
            {/* Row 1: Selected Element Control */}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 pr-1 flex-1">
                <span className="block text-[8px] text-slate-400 uppercase tracking-wide font-black">Singolo Elemento</span>
                <span className="block font-bold text-slate-700 truncate text-[10.5px]" title={selectedEntity.bimName || 'Elemento'}>
                  {selectedEntity.bimName || 'Senza Nome'}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* Visibility */}
                <button
                  onClick={() => updateSelectedBIMField('isVisible', (selectedEntity as any).isVisible === false ? true : false)}
                  className={`p-1 rounded transition ${(selectedEntity as any).isVisible === false ? 'bg-slate-100 text-slate-400' : 'bg-cyan-50 text-cyan-600 hover:bg-cyan-100 hover:text-cyan-700'}`}
                  title={(selectedEntity as any).isVisible === false ? "Mostra Elemento" : "Nascondi Elemento"}
                >
                  {(selectedEntity as any).isVisible === false ? <LightbulbOff size={11.5} /> : <Lightbulb size={11.5} />}
                </button>
                {/* Freeze / Lock */}
                <button
                  onClick={() => updateSelectedBIMField('isFrozen', !(selectedEntity as any).isFrozen)}
                  className={`p-1 rounded transition ${(selectedEntity as any).isFrozen ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
                  title={(selectedEntity as any).isFrozen ? "Sblocca Elemento" : "Blocca/Congela Elemento"}
                >
                  {(selectedEntity as any).isFrozen ? <Lock size={11.5} /> : <Unlock size={11.5} />}
                </button>
                {/* Delete */}
                <button
                  onClick={deleteSelectedBIM}
                  className="p-1 rounded transition bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700"
                  title="Elimina Elemento"
                >
                  <Trash2 size={11.5} />
                </button>
              </div>
            </div>

            {/* Row 2: Selected Family Control */}
            {(() => {
              const familyName = (selectedEntity as any).bimFamily || (selectedEntity as any).bimAreaType || 'Altri Elementi';
              const familyMembers = entities.filter(e => e.isBIM && (((e as any).bimFamily === familyName) || ((e as any).bimAreaType === familyName)));
              const isFamilyVisible = familyMembers.every(m => (m as any).isVisible !== false);
              const isFamilyFrozen = familyMembers.every(m => (m as any).isFrozen === true);
              
              const toggleFamilyVisibility = () => {
                const nextVal = !isFamilyVisible;
                if (typeof setEntities === 'function') {
                  (setEntities as any)((prev: Entity[]) => {
                    const next = prev.map(e => {
                      const isMem = e.isBIM && (((e as any).bimFamily === familyName) || ((e as any).bimAreaType === familyName));
                      return isMem ? { ...e, isVisible: nextVal } as any : e;
                    });
                    onCommitHistory?.(next);
                    return next;
                  });
                }
              };

              const toggleFamilyFrozen = () => {
                const nextVal = !isFamilyFrozen;
                if (typeof setEntities === 'function') {
                  (setEntities as any)((prev: Entity[]) => {
                    const next = prev.map(e => {
                      const isMem = e.isBIM && (((e as any).bimFamily === familyName) || ((e as any).bimAreaType === familyName));
                      return isMem ? { ...e, isFrozen: nextVal } as any : e;
                    });
                    onCommitHistory?.(next);
                    return next;
                  });
                }
              };

              const deleteFamily = () => {
                if (confirm(`Sei sicuro di voler eliminare l'intera famiglia di elementi "${familyName}" contenente ${familyMembers.length} oggetti?`)) {
                  if (typeof setEntities === 'function') {
                    (setEntities as any)((prev: Entity[]) => {
                      const next = prev.filter(e => !(e.isBIM && (((e as any).bimFamily === familyName) || ((e as any).bimAreaType === familyName))));
                      onCommitHistory?.(next);
                      return next;
                    });
                    onSelect(null);
                  }
                }
              };

              return (
                <div className="flex items-center justify-between gap-2 border-t border-cyan-50 pt-2 shrink-0">
                  <div className="min-w-0 pr-1 flex-1">
                    <span className="block text-[8px] text-slate-400 uppercase tracking-wide font-black">Famiglia di Appartenenza</span>
                    <span className="block font-black text-slate-800 truncate text-[10.5px]" title={familyName}>
                      📁 {familyName}
                    </span>
                    <span className="text-[8.5px] text-slate-500 font-medium">({familyMembers.length} elementi)</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Family Visibility */}
                    <button
                      onClick={toggleFamilyVisibility}
                      className={`p-1 rounded transition ${!isFamilyVisible ? 'bg-slate-105 text-slate-400 hover:bg-slate-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
                      title={isFamilyVisible ? "Spegni Intera Famiglia" : "Accendi Intera Famiglia"}
                    >
                      {!isFamilyVisible ? <LightbulbOff size={11} /> : <Lightbulb size={11} />}
                    </button>
                    {/* Family Properties */}
                    <button
                      onClick={() => { console.log('Family button clicked:', familyName); setShowFamilyPropertyDialog(familyName); }}
                      className="p-1 rounded transition bg-cyan-100 text-cyan-700 hover:bg-cyan-200"
                      title="Proprietà e Riepilogo Famiglia"
                    >
                      <Info size={11} />
                    </button>
                    {/* Family Freezing */}
                    <button
                      onClick={toggleFamilyFrozen}
                      className={`p-1 rounded transition ${isFamilyFrozen ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600'}`}
                      title={isFamilyFrozen ? "Sblocca Intera Famiglia" : "Congela Intera Famiglia"}
                    >
                      {isFamilyFrozen ? <Lock size={11} /> : <Unlock size={11} />}
                    </button>
                    {/* Family Deletion */}
                    <button
                      onClick={deleteFamily}
                      className="p-1 rounded transition bg-rose-100 text-rose-700 hover:bg-rose-200 hover:text-rose-800"
                      title="Elimina Tutta la Famiglia"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <label className="text-[10px] text-slate-500 font-bold block mb-1">
                Nome / Categoria locale
              </label>
              <input
                type="text"
                value={selectedEntity.bimName || ""}
                onChange={(e) => updateSelectedBIMField("bimName", e.target.value)}
                placeholder="E.g. Soggiorno"
                className="w-full border rounded px-2 py-1 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
              {selectedEntity.bimType === 'room' && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {roomSuggerite.map(rName => (
                    <button
                      key={rName}
                      onClick={() => updateSelectedBIMField("bimName", rName)}
                      className={`text-[8.5px] px-1.5 py-0.5 rounded border transition-colors ${
                        selectedEntity.bimName === rName
                          ? "bg-cyan-600 text-white border-cyan-600"
                          : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      {rName}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedEntity.bimType === 'room' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5 font-bold">
                      Altezza Interpiano (m)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={selectedEntity.bimHeight === undefined ? 2.70 : selectedEntity.bimHeight}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateSelectedBIMField("bimHeight", val === '' ? '' : (parseFloat(val) || 0));
                      }}
                      className="w-full border rounded px-1.5 py-1 text-xs bg-white font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5 font-bold text-amber-800">
                      📐 Casseri (mq)
                    </label>
                    <div className="w-full border rounded px-1.5 py-1 text-xs bg-amber-50 text-amber-900 border-amber-200 font-black">
                      {(() => {
                        const pts = (selectedEntity as any).bimPoints || (selectedEntity as any).points;
                        const area = getRoomAreaMq(pts);
                        const per = getRoomPerimeterM(pts);
                        const h = (selectedEntity as any).bimHeight || 2.70;
                        return (area + (per * h)).toFixed(2);
                      })()} mq
                    </div>
                  </div>
                </div>

                <div className="text-[8px] leading-tight text-amber-900 bg-amber-100/40 p-1.5 uppercase tracking-wider font-extrabold rounded border border-dashed border-amber-300">
                  🏗️ Formula Cassero: Area Base ({(() => {
                    const pts = (selectedEntity as any).bimPoints || (selectedEntity as any).points;
                    return getRoomAreaMq(pts).toFixed(1);
                  })()} mq) + Spalla Pareti ({(() => {
                    const pts = (selectedEntity as any).bimPoints || (selectedEntity as any).points;
                    const per = getRoomPerimeterM(pts);
                    const h = (selectedEntity as any).bimHeight || 2.70;
                    return (per * h).toFixed(1);
                  })()} mq). Spalla superiore esclusa.
                </div>
              </div>
            )}
            
            {/* Generic BIM Fields for all BIM entities */}
            <div className="space-y-2 border-t pt-2 mt-2">
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5 font-bold">
                  Tipo Elemento/Area
                </label>
                <select
                  value={selectedEntity.bimAreaType || 'stanza'}
                  onChange={(e) => updateSelectedBIMField("bimAreaType", e.target.value)}
                  className="w-full border rounded px-1.5 py-1 text-xs bg-white text-slate-800"
                >
                  <option value="stanza">Stanza/Locale</option>
                  <option value="muro">Muro Portante</option>
                  <option value="tramezzo">Tramezzo Interno</option>
                  <option value="giardino">Giardino/Esterno</option>
                  <option value="tetto">Tetto/Copertura</option>
                  <option value="altro">Altro/Specifica</option>
                </select>
              </div>
              
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5 font-bold">
                  Trasmittanza (U)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={selectedEntity.bimTrasmittanza === undefined ? 0 : selectedEntity.bimTrasmittanza}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateSelectedBIMField("bimTrasmittanza", val === '' ? '' : (parseFloat(val) || 0));
                  }}
                  className="w-full border rounded px-1.5 py-1 text-xs bg-white text-slate-800 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5 font-bold">
                  Voce Prezzario
                </label>
                <input
                  type="text"
                  value={selectedEntity.bimDescription || ""}
                  onChange={(e) => updateSelectedBIMField("bimDescription", e.target.value)}
                  className="w-full border rounded px-1.5 py-1 text-xs bg-white text-slate-800"
                />
              </div>

              <div className="pt-2">
                <label className="text-[10px] text-slate-500 font-bold block mb-1">
                  Colore Elemento
                </label>
                <input
                  type="color"
                  value={selectedEntity.color || '#3b82f6'}
                  onChange={(e) => updateSelectedBIMField("color", e.target.value)}
                  className="w-full h-8 border rounded px-1 bg-white cursor-pointer"
                />
              </div>

              <div className="pt-2">
                <button
                  onClick={() => updateSelectedBIMField("hideIn2D", !(selectedEntity as any).hideIn2D)}
                  className={`w-full py-1.5 px-2 rounded font-bold text-[10px] transition-colors border ${
                    (selectedEntity as any).hideIn2D 
                    ? 'bg-rose-100 text-rose-700 border-rose-300 hover:bg-rose-200' 
                    : 'bg-white hover:bg-neutral-50 text-slate-700 border-slate-300'
                  }`}
                >
                  {(selectedEntity as any).hideIn2D ? '🚫 Oggetto non visibile in pianta' : '👁️ Nascondi in pianta (Solo 3D Sfumato)'}
                </button>
              </div>

              <div className="pt-2">
                <label className="text-[10px] text-slate-500 font-bold block mb-1">
                  Inizio (Offset - cm)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={(selectedEntity as any).bimOffset === undefined ? 0 : (selectedEntity as any).bimOffset}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateSelectedBIMField("bimOffset", val === '' ? '' : (parseFloat(val) || 0));
                  }}
                  placeholder="Es: 10"
                  className="w-full border rounded px-2 py-1 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-cyan-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>

            {(selectedEntity.bimType === 'door' || selectedEntity.bimType === 'window') && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5 font-bold">
                      Larghezza Spatola (cm)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={(selectedEntity as any).bimWidth === undefined ? 80 : (selectedEntity as any).bimWidth}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateSelectedBIMField("bimWidth", val === '' ? '' : (parseInt(val) || 0));
                      }}
                      className="w-full border rounded px-1.5 py-1 text-xs bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  {selectedEntity.bimType === 'window' && (
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5 font-bold">
                        Altezza Infisso (cm)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={(selectedEntity as any).bimWindowHeight === undefined ? 140 : (selectedEntity as any).bimWindowHeight}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateSelectedBIMField("bimWindowHeight", val === '' ? '' : (parseInt(val) || 0));
                        }}
                        className="w-full border rounded px-1.5 py-1 text-xs bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => updateSelectedBIMField("bimFlip", !(selectedEntity as any).bimFlip)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-[10px] font-bold py-1.5 rounded-lg shadow-sm transition-all active:scale-[0.98] cursor-pointer"
                  >
                    <Repeat size={12} className="text-cyan-600" />
                    Inverti Swing
                  </button>
                  <button
                    onClick={() => {
                        const start = (selectedEntity as any).start;
                        const end = (selectedEntity as any).end;
                        if (start && end) {
                            const dx = end.x - start.x;
                            const dy = end.y - start.y;
                            const newEnd = {
                                x: start.x - dy,
                                y: start.y + dx
                            };
                            updateSelectedBIMField("end", newEnd);
                        }
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-[10px] font-bold py-1.5 rounded-lg shadow-sm transition-all active:scale-[0.98] cursor-pointer"
                  >
                    <RotateCw size={12} className="text-cyan-600" />
                    Ruota 90°
                  </button>
                </div>

                {/* Description field for price list */}
                <div className="pt-2">
                  <label className="text-[10px] text-slate-500 font-bold block mb-1">
                    Descrizione Prezzario
                  </label>
                  <textarea
                    value={selectedEntity.bimDescription || ""}
                    onChange={(e) => updateSelectedBIMField("bimDescription", e.target.value)}
                    placeholder="Inserisci descrizione prezzario..."
                    className="w-full border rounded px-2 py-1 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    rows={3}
                  />
                </div>

                <div className="pt-2">
                  <label className="text-[10px] text-slate-500 font-bold block mb-1">
                    Opere in Marmo (Soglie)
                  </label>
                  <input
                    type="text"
                    value={selectedEntity.bimMarmo || ""}
                    onChange={(e) => updateSelectedBIMField("bimMarmo", e.target.value)}
                    placeholder="Es: Marmo bianco, 3cm"
                    className="w-full border rounded px-2 py-1 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <button
                    onClick={() => {
                        const width = (selectedEntity as any).bimWidth || 80;
                        const height = (selectedEntity as any).bimWindowHeight || (selectedEntity.bimType === 'door' ? 210 : 140);
                        cadCanvasRef?.current?.setBIMDefaults(width, height, selectedEntity.bimType);
                        const btn = (document.activeElement as HTMLElement);
                        if (btn) {
                            const original = btn.innerHTML;
                            btn.innerHTML = `<span class="flex items-center gap-1 text-emerald-600">Parametri Copiati!</span>`;
                            setTimeout(() => btn.innerHTML = original, 1500);
                        }
                    }}
                    className="w-full flex items-center justify-center gap-1.5 bg-cyan-600 text-white hover:bg-cyan-700 text-[10px] font-bold py-2 rounded-lg shadow-md transition-all active:scale-[0.98] cursor-pointer"
                >
                  <CopyIcon size={12} />
                  Copia parametri come oggetto
                </button>
              </div>
            )}

            {/* MISURE GEOMETRICHE BIM INTEGRALI */}
            {((selectedEntity as any).bimType === 'room' || (selectedEntity as any).bimType === 'muro' || (selectedEntity as any).bimType === 'wall' || (selectedEntity as any).bimAreaType === 'muro' || selectedEntity.type === 'bim-csg' || (selectedEntity as any).bimType === 'door' || (selectedEntity as any).bimType === 'window') && (
              <div className="mt-4 border-t border-slate-150 pt-3.5 space-y-2">
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
                    const rawHeight = (selectedEntity as any).bimHeight || (selectedEntity as any).height || 2.70;
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
                      <div className="grid grid-cols-2 gap-1.5 text-[10.5px] bg-slate-50 border border-slate-200/50 p-2.5 rounded-xl">
                        <div className="bg-white p-2 rounded-lg border border-slate-100">
                          <span className="block text-[7.5px] text-slate-400 font-extrabold uppercase tracking-wider">Pavimento (Base)</span>
                          <span className="font-mono font-black text-slate-800 text-[11px]">{baseAreaMq.toFixed(2)} mq</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-100">
                          <span className="block text-[7.5px] text-slate-400 font-extrabold uppercase tracking-wider">Soffitto</span>
                          <span className="font-mono font-black text-slate-800 text-[11px]">{soffittoMq.toFixed(2)} mq</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-100">
                          <span className="block text-[7.5px] text-slate-400 font-extrabold uppercase tracking-wider">Pareti/Spalle</span>
                          <span className="font-mono font-black text-slate-800 text-[11px]">{spondeMq.toFixed(2)} mq</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-100">
                          <span className="block text-[7.5px] text-slate-400 font-extrabold uppercase tracking-wider">Volume Netto</span>
                          <span className="font-mono font-black text-cyan-700 text-[11px]">{volumeMc.toFixed(2)} mc</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-100 col-span-2 flex justify-between items-center">
                          <span className="text-[7.5px] text-slate-400 font-extrabold uppercase tracking-wider">
                            {isWallLine ? "Sviluppo / Lunghezza Muro" : "Perimetro Sviluppo"}
                          </span>
                          <span className="font-mono font-black text-slate-800 text-[11px]">{perimeterM.toFixed(2)} m</span>
                        </div>
                        <div className="bg-amber-500/5 p-2 rounded-lg border border-amber-500/10 col-span-2 flex justify-between items-center">
                          <span className="text-[7.5px] text-amber-800 font-extrabold uppercase tracking-wider flex items-center gap-1">🏗️ Sviluppo Casseri / Tot.</span>
                          <span className="font-mono font-black text-amber-700 text-[11px]">{totalCasseri.toFixed(2)} mq</span>
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
                      <div className="grid grid-cols-2 gap-1.5 text-[10.5px] bg-slate-50 border border-slate-200/50 p-2.5 rounded-xl">
                        <div className="bg-white p-2 rounded-lg border border-slate-100">
                          <span className="block text-[7.5px] text-slate-450 font-extrabold uppercase tracking-wider">Pavimento (Soglia)</span>
                          <span className="font-mono font-black text-slate-800 text-[11px]">{baseAreaMq.toFixed(3)} mq</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-100">
                          <span className="block text-[7.5px] text-slate-450 font-extrabold uppercase tracking-wider">Soffitto (Mazzetta)</span>
                          <span className="font-mono font-black text-slate-800 text-[11px]">{soffittoMq.toFixed(3)} mq</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-100">
                          <span className="block text-[7.5px] text-slate-450 font-extrabold uppercase tracking-wider">Superficie Foro</span>
                          <span className="font-mono font-black text-indigo-700 text-[11px]">{foroMq.toFixed(2)} mq</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-100">
                          <span className="block text-[7.5px] text-slate-450 font-extrabold uppercase tracking-wider">Volume Serramento</span>
                          <span className="font-mono font-black text-cyan-700 text-[11px]">{volumeMc.toFixed(4)} mc</span>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-slate-100 col-span-2 flex justify-between items-center">
                          <span className="text-[7.5px] text-slate-450 font-extrabold uppercase tracking-wider">Spalle Laterali</span>
                          <span className="font-mono font-black text-slate-800 text-[11px]">{spondeMq.toFixed(3)} mq</span>
                        </div>
                        <div className="bg-slate-100 p-2 rounded-lg border border-slate-200/50 col-span-2 flex justify-between items-center">
                          <span className="text-[7.5px] text-slate-600 font-extrabold uppercase tracking-wider">Sviluppo Totale</span>
                          <span className="font-mono font-black text-slate-700 text-[11px]">{totalSviluppo.toFixed(3)} mq</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* BIM STATS QUANTITA SUMMARY */}
      <div className="space-y-3">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-450 block border-b pb-1 font-mono">
          Rilievo Quantità & Computo
        </span>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg flex flex-col justify-between">
            <span className="text-[8.5px] uppercase tracking-wider text-slate-400 font-bold block mb-1">
              Area Netta Stanze
            </span>
            <div>
              <span className="text-lg font-black text-slate-800">{totalRoomArea.toFixed(2)}</span>
              <span className="text-[10px] font-semibold text-slate-600 pl-1">mq</span>
            </div>
            <span className="text-[8px] text-slate-400 mt-1">
              Vani mappati: {bimRooms.length}
            </span>
          </div>

          <div className="bg-cyan-50/40 border border-cyan-200/50 p-3 rounded-lg flex flex-col justify-between">
            <span className="text-[8.5px] uppercase tracking-wider text-cyan-800 font-bold block mb-1">
              Battiscopa Netto 🚪
            </span>
            <div>
              <span className="text-lg font-black text-cyan-950">{intelligentBaseboardM.toFixed(1)}</span>
              <span className="text-[10px] font-semibold text-cyan-800 pl-1">m</span>
            </div>
            <span className="text-[7.5px] text-cyan-600 mt-1 leading-none italic font-medium block">
              Escluso varchi (-{totalDoorsWidthM.toFixed(1)}m)
            </span>
          </div>
        </div>

        {/* 🏗️ Master Casseri Card */}
        <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg flex flex-col justify-between transition-all hover:bg-amber-500/15">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[8.5px] uppercase tracking-wider text-amber-800 font-black block">
              🏗️ Totale Casseri (Cassaforma Getto C.A.)
            </span>
            <span className="text-[7px] bg-amber-500/20 text-amber-900 border border-amber-500/30 px-1 py-0.2 rounded font-black uppercase">Cemento Armato</span>
          </div>
          <div className="flex justify-between items-baseline">
            <div>
              <span className="text-xl font-black text-slate-900">
                {bimRooms.reduce((acc, r) => {
                  const pts = (r as any).bimPoints || (r as any).points;
                  const area = getRoomAreaMq(pts);
                  const per = getRoomPerimeterM(pts);
                  const h = r.bimHeight || 2.70;
                  return acc + area + (per * h);
                }, 0).toFixed(2)}
              </span>
              <span className="text-[11px] font-bold text-amber-800 pl-1">mq</span>
            </div>
            <span className="text-[8.5px] text-amber-700/85 font-black italic text-right uppercase tracking-wider">
              Esclusa testa superiore
            </span>
          </div>
        </div>

        {bimRooms.length > 0 ? (
          <div className="border border-neutral-200 rounded-lg overflow-hidden bg-white">
            <div className="p-1 px-2.5 bg-neutral-100 text-[9.5px] font-bold uppercase tracking-wider text-slate-500 border-b flex justify-between">
              <span>Aree Funzionali</span>
              <span>Sup. (mq)</span>
            </div>
            <div className="divide-y max-h-40 overflow-y-auto">
              {bimRooms.map((r) => {
                const pts = (r as any).bimPoints || (r as any).points;
                const area = getRoomAreaMq(pts);
                const isSelected = r.id === selectedId;
                const dotColor = (r as any).backgroundColor || (r as any).color || '#10b981';
                return (
                  <div
                    key={r.id}
                    onClick={() => onSelect(r.id)}
                    className={`p-2 py-1.5 flex justify-between items-center text-xs cursor-pointer select-none transition-colors ${
                      isSelected ? "bg-cyan-50 text-cyan-950 font-bold" : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span className="truncate pr-4 max-w-[130px] flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full border border-black/10 shadow-inner shrink-0" style={{ backgroundColor: dotColor }}></span>
                      <div className="flex flex-col min-w-0">
                        <span className="truncate font-bold text-slate-700">{(r as any).bimName || "Unlabeled"}</span>
                        <div className="flex items-center gap-1">
                          {(r as any).bimAreaType && (
                            <span className="text-[7.5px] opacity-60 uppercase font-bold tracking-tighter leading-none">{(r as any).bimAreaType}</span>
                          )}
                          {(r as any).bimHatchPattern && (
                             <span className="text-[7.5px] opacity-40 uppercase font-black tracking-tighter leading-none border-l pl-0.5 border-slate-300">{(r as any).bimHatchPattern}</span>
                          )}
                        </div>
                      </div>
                    </span>
                    <span className="font-mono text-[10px] font-bold text-emerald-600">
                      {area.toFixed(2)}
                    </span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onEditArea?.(r.id); }}
                      className="ml-1 p-1 text-slate-400 hover:text-cyan-500 hover:bg-cyan-50 rounded transition-colors"
                    >
                      <Edit size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 border border-dashed rounded-lg text-center text-[10px] text-slate-400 bg-slate-50">
            Traccia o rileva una stanza per vederla qui!
          </div>
        )}

        {bimRooms.length > 0 && (
          <div className="p-3 bg-neutral-50 rounded-lg border text-[10.5px] space-y-1.5 leading-normal">
            <div className="flex justify-between items-center text-slate-600">
              <span className="font-semibold text-slate-500">Superficie finestre totale:</span>
              <span className="font-mono text-[10.5px] font-bold text-slate-705">{totalWindowsLightAreaMq.toFixed(2)} mq</span>
            </div>
            {totalRoomArea > 0 && (
              <div className="pt-1 border-t flex items-center gap-1.5 text-[9.5px]">
                {totalWindowsLightAreaMq / totalRoomArea >= 0.125 ? (
                  <div className="text-emerald-700 font-bold flex items-center gap-1">
                    <Check size={12} className="text-emerald-500" />
                    R.A. conforme a normativa italiana (≥ 1/8) ✅
                  </div>
                ) : (
                  <div className="text-amber-850 font-bold leading-tight">
                    ⚠️ Rapporto Illuminante perimetrale inferiore a 1/8 limitato.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 📋 LEGENDA AUTOMATICA IMPIANTI */}
        <div className="border border-neutral-200 rounded-lg bg-white overflow-hidden p-3 space-y-3">
          <div className="flex items-center justify-between border-b pb-1.5">
            <div className="flex items-center gap-1.5">
              <Notebook size={14} className="text-cyan-600" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Legenda Impianti
              </span>
            </div>
            <span className="text-[9px] bg-cyan-100 text-cyan-800 font-extrabold px-1.5 py-0.5 rounded-full uppercase">
              BIM Live
            </span>
          </div>

          {activeSymbolsSummary.all.length > 0 ? (
            <div className="space-y-3">
              {/* Elettrici */}
              {activeSymbolsSummary.electric.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[9px] font-black uppercase text-amber-600 flex items-center gap-1">
                    ⚡ Impianto Elettrico ({activeSymbolsSummary.electric.reduce((sum, item) => sum + item.count, 0)} p.ti)
                  </span>
                  <div className="divide-y border rounded-md overflow-hidden bg-slate-50/50">
                    {activeSymbolsSummary.electric.map(sym => {
                      const IconComponent = SYSTEM_ICONS[sym.name] || Lightbulb;
                      return (
                        <div key={sym.name} className="flex justify-between items-center p-2 py-1.5 text-[11px] text-slate-700">
                          <span className="flex items-center gap-2 truncate">
                            <span className="p-1 bg-amber-50 rounded text-amber-600 border border-amber-100">
                              <IconComponent size={12} />
                            </span>
                            <span className="truncate font-medium">{sym.label}</span>
                          </span>
                          <span className="font-mono font-bold bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded text-[10px]">
                            {sym.count} u.
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Idraulici */}
              {activeSymbolsSummary.hydraulic.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[9px] font-black uppercase text-sky-600 flex items-center gap-1">
                    💧 Impianto Idraulico e Termico ({activeSymbolsSummary.hydraulic.reduce((sum, item) => sum + item.count, 0)} p.ti)
                  </span>
                  <div className="divide-y border rounded-md overflow-hidden bg-slate-50/50">
                    {activeSymbolsSummary.hydraulic.map(sym => {
                      const IconComponent = SYSTEM_ICONS[sym.name] || Droplet;
                      return (
                        <div key={sym.name} className="flex justify-between items-center p-2 py-1.5 text-[11px] text-slate-700">
                          <span className="flex items-center gap-2 truncate">
                            <span className="p-1 bg-sky-50 rounded text-sky-600 border border-sky-100">
                              <IconComponent size={12} />
                            </span>
                            <span className="truncate font-medium">{sym.label}</span>
                          </span>
                          <span className="font-mono font-bold bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded text-[10px]">
                            {sym.count} u.
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-1 border-t pt-2 mt-2">
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Scala Tabella CAD:</span>
                <select
                  value={legendScale}
                  onChange={(e) => setLegendScale(parseFloat(e.target.value))}
                  className="bg-slate-100 border border-slate-200 text-slate-700 rounded px-1.5 py-0.5 text-[10px] font-bold text-right outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
                >
                  <option value="1.0">1.0x (Piccola)</option>
                  <option value="1.5">1.5x (Compatta)</option>
                  <option value="2.0">2.0x (Consigliata)</option>
                  <option value="2.5">2.5x (Grande)</option>
                  <option value="3.0">3.0x (Molto Grande)</option>
                  <option value="4.0">4.0x (Massima)</option>
                </select>
              </div>

              <button
                onClick={handleInsertLegendToDrawing}
                className={`w-full py-2 px-3 text-[10.5px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] cursor-pointer ${
                  legendInsertingState === 'success'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-900 text-white'
                }`}
              >
                <Grid size={12} />
                {legendInsertingState === 'success' ? (
                  <span>Legenda Sincronizzata in Tavola! ✓</span>
                ) : (
                  <span>Disegna Tabella Legenda in CAD</span>
                )}
              </button>
            </div>
          ) : (
            <div className="p-3 text-center border border-dashed rounded-lg bg-neutral-50 flex flex-col items-center justify-center gap-1 text-[10px] text-slate-400">
              <Info size={16} className="text-slate-300" />
              <span>Nessun simbolo d'impianto posizionato.</span>
              <span className="text-[8.5px] text-slate-400 leading-tight">
                Usa i menu superiori per inserire Punti Luce, Prese o Collettori.
              </span>
            </div>
          )}
        </div>

        <button
          onClick={handleExportTextReport}
          disabled={entities.filter(e => e.isBIM).length === 0}
          className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed text-white font-bold py-2.5 px-3 rounded-lg text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98] cursor-pointer"
        >
          <FileText size={14} />
          Esporta Computo Metrico BIM
        </button>
      </div>

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
              setEntities((prevUps: Entity[]) => {
                const next = prevUps.map(x => {
                  if (x.id === id) {
                    const updated = { ...x, [field]: value } as any;
                    // Clear bimData on any BIM-related field update
                    if (field.startsWith('bim') || field === 'color' || field === 'backgroundColor') {
                      updated.bimData = undefined;
                    }
                    if (field === 'bimFamily' || field === 'bimAreaType') {
                      updated.bimSubFamily = value;
                      updated.bimFamilyId = value;
                    }
                    return updated;
                  }
                  return x;
                });
                onCommitHistory?.(next);
                return next;
              });
            }}
          />
        );
      })()}

      {showFamilyPropertyDialog && (
        <BIMFamilyPropertyDialog
          family={showFamilyPropertyDialog}
          entities={entities}
          onClose={() => setShowFamilyPropertyDialog(null)}
          onUpdateEntityProperties={(ids, properties) => {
            setEntities((prev) => {
              const next = prev.map((ent) => {
                if (ids.includes(ent.id)) {
                  return { ...ent, ...properties } as any;
                }
                return ent;
              });
              onCommitHistory?.(next);
              return next;
            });
          }}
        />
      )}
    </div>
  );
}
