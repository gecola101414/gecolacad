import React, { useState } from "react";
import { Entity, Point } from "../types";
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
  // Systems icons
  Lightbulb,
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
  Notebook
} from "lucide-react";
import { TEMPLATES } from "../data/templates";
import { TemplatePreview } from "./TemplatePreview";
import { getBIMSymbolEntities } from "./CADCanvas";

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
  onOpen3DView
}: BIMWorkspacePanelProps) {
  const [customRoomName, setCustomRoomName] = useState<string>("");
  const [open2DSection, setOpen2DSection] = useState<boolean>(false);
  const [active2DCat, setActive2DCat] = useState<string>('Verde');

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

    report += `1. RILIEVO E STIMA DELLE SUPERFICI (STANTE)\n`;
    report += `--------------------------------------------------------\n`;
    report += `ID\tNome Locale\tAltezza (m)\tArea (mq)\tPerimetro (m)\tVolume (mc)\n`;
    bimRooms.forEach((r, idx) => {
      const pts = (r as any).bimPoints || (r as any).points;
      const area = getRoomAreaMq(pts);
      const per = getRoomPerimeterM(pts);
      const h = r.bimHeight || 2.70;
      const vol = area * h;
      report += `${r.id.substring(0, 5)}\t${r.bimName || 'Unlabeled'}\t${h.toFixed(2)}\t${area.toFixed(2)}\t${per.toFixed(2)}\t${vol.toFixed(1)}\n`;
    });
    report += `--------------------------------------------------------\n`;
    report += `Totale Locali Rilevati: ${bimRooms.length}\n`;
    report += `Superficie Calpestabile Totale: ${totalRoomArea.toFixed(2)} mq\n\n`;

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
        <button 
          onClick={onOpen3DView}
          className="mt-4 w-full bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs tracking-widest uppercase transition-all shadow-[0_10px_20px_rgba(34,211,238,0.2)]"
        >
          <BoxIcon size={16} />
          Visualizzazione 3D BIM
        </button>
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
          <div className="flex justify-between items-center border-b border-cyan-100 pb-1">
            <h5 className="text-[10px] font-mono font-bold uppercase text-cyan-800 flex items-center gap-1">
              <Building size={12} />
              Ispezione Elemento BIM
            </h5>
            <button
              onClick={deleteSelectedBIM}
              title="Elimina Elemento BIM"
              className="text-rose-600 hover:text-rose-800 p-1 hover:bg-rose-50 rounded transition-colors cursor-pointer"
            >
              <Trash2 size={14} />
            </button>
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5 font-bold">
                    Altezza Interpiano (m)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="1.0"
                    max="6.0"
                    value={selectedEntity.bimHeight || 2.70}
                    onChange={(e) => updateSelectedBIMField("bimHeight", parseFloat(e.target.value) || 2.70)}
                    className="w-full border rounded px-1.5 py-1 text-xs bg-white"
                  />
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
                  type="number"
                  step="0.01"
                  value={selectedEntity.bimTrasmittanza || 0}
                  onChange={(e) => updateSelectedBIMField("bimTrasmittanza", parseFloat(e.target.value) || 0)}
                  className="w-full border rounded px-1.5 py-1 text-xs bg-white text-slate-800"
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
                  type="number"
                  value={(selectedEntity as any).bimOffset || 0}
                  onChange={(e) => updateSelectedBIMField("bimOffset", parseFloat(e.target.value) || 0)}
                  placeholder="Es: 10"
                  className="w-full border rounded px-2 py-1 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-cyan-500"
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
                      type="number"
                      min="30"
                      max="400"
                      value={(selectedEntity as any).bimWidth || 80}
                      onChange={(e) => updateSelectedBIMField("bimWidth", parseInt(e.target.value) || 80)}
                      className="w-full border rounded px-1.5 py-1 text-xs bg-white"
                    />
                  </div>
                  {selectedEntity.bimType === 'window' && (
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5 font-bold">
                        Altezza Infisso (cm)
                      </label>
                      <input
                        type="number"
                        min="30"
                        max="300"
                        value={(selectedEntity as any).bimWindowHeight || 140}
                        onChange={(e) => updateSelectedBIMField("bimWindowHeight", parseInt(e.target.value) || 140)}
                        className="w-full border rounded px-1.5 py-1 text-xs bg-white"
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
          </div>
        </div>
      ) : null}

      {/* BIM STATS QUANTITA SUMMARY */}
      <div className="space-y-3">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block border-b pb-1 font-mono">
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
    </div>
  );
}
