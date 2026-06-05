/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from 'react-pdf';
import { CADCanvas } from "./components/CADCanvas";
import { CanvasPDFPreview } from "./components/CanvasPDFPreview";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
import { DimensionStyleDialog } from "./components/DimensionStyleDialog";
import { RaccordoDialog } from "./components/RaccordoDialog";
import { DXFTextReaderDialog } from "./components/DXFTextReaderDialog";
import { TemplatePreview } from "./components/TemplatePreview";
import { BIMWorkspacePanel } from "./components/BIMWorkspacePanel";
import { BIMTopBarControls } from "./components/BIMTopBarControls";
import { TEMPLATES } from './data/templates';
import { GUIDE_DATABASE, GuideItem } from './data/guides';
import { Entity, Point, Layer, Measurement, Tavola } from "./types";
import { mergeAllSegments } from "./utils/entityUtils";
import { parseScriptToEntities, updateScriptVariables } from "./utils/parametricParser";
import { contours } from "d3-contour";
import { simplifyPoints } from "./utils/simplify";
import {
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
  Building,
  Lock,
  Home,
  Maximize2,
  Droplet,
  Zap,
  ChevronDown,
  ArrowDown,
  Clipboard
} from "lucide-react";

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

export default function App() {
  const [selectedTool, setSelectedTool] = useState<string | null>(() => localStorage.getItem('selectedTool') || 'Select');
  const [entities, setEntities] = useState<Entity[]>([]);
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
  const [defaultLineStyle, setDefaultLineStyle] = useState(() => {
    const saved = localStorage.getItem('defaultLineStyle');
    return saved ? JSON.parse(saved) : {
      color: "#444444",
      lineWidth: 2,
      dashed: false,
      mode: "HB" as "2H" | "HB" | "CAD",
    };
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
  const [eraserRadius, setEraserRadius] = useState(() => Number(localStorage.getItem('eraserRadius')) || 20);
  const [favoritePanels, setFavoritePanels] = useState<Array<{ id: string; tools: string[]; x: number; y: number; isDocked: 'left' | 'right' | null }>>(() => {
    const saved = localStorage.getItem('favoritePanels');
    return saved ? JSON.parse(saved) : [
      { id: "fav-1", tools: ["Line", "Circle", "Hatch", "Eraser"], x: 180, y: 120, isDocked: null }
    ];
  });
  const [activeDraggingId, setActiveDraggingId] = useState<string | null>(null);
  const favoritesDragRef = useRef<{ isDragging: boolean; panelId: string; startX: number; startY: number; posX: number; posY: number } | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDimensionDialogOpen, setIsDimensionDialogOpen] = useState(false);
  const [isRaccordoDialogOpen, setIsRaccordoDialogOpen] = useState(false);
  const [isDXFTextReaderOpen, setIsDXFTextReaderOpen] = useState(false);
  const [selectedBIMSymbolType, setSelectedBIMSymbolType] = useState<string | null>(null);

  // BIM dedicated dialog states
  const [isBIMMuriOpen, setIsBIMMuriOpen] = useState(false);
  const [isBIMPorteOpen, setIsBIMPorteOpen] = useState(false);
  const [isBIMFinestreOpen, setIsBIMFinestreOpen] = useState(false);
  const [isBIMArrediOpen, setIsBIMArrediOpen] = useState(false);
  const [isBIMSanitariOpen, setIsBIMSanitariOpen] = useState(false);
  const [isBIMElettricoOpen, setIsBIMElettricoOpen] = useState(false);
  const [isBIMIdraulicoOpen, setIsBIMIdraulicoOpen] = useState(false);
  const [isBIMFinitureOpen, setIsBIMFinitureOpen] = useState(false);

  // BIM top bar reactive parameters
  const [bimWallThickness, setBimWallThickness] = useState<number>(() => parseFloat(localStorage.getItem('lastWallThickness') || '15'));
  const [bimWallHeight, setBimWallHeight] = useState<number>(() => parseFloat(localStorage.getItem('lastWallHeight') || '270'));
  const [bimDoorWidth, setBimDoorWidth] = useState<number>(() => parseFloat(localStorage.getItem('lastDoorWidth') || '80'));
  const [bimDoorHeight, setBimDoorHeight] = useState<number>(() => parseFloat(localStorage.getItem('lastDoorHeight') || '210'));
  const [bimWindowWidth, setBimWindowWidth] = useState<number>(() => parseFloat(localStorage.getItem('lastWindowWidth') || '120'));
  const [bimWindowHeight, setBimWindowHeight] = useState<number>(() => parseFloat(localStorage.getItem('lastWindowHeight') || '140'));

  const [editingRaccordo, setEditingRaccordo] = useState<Entity | null>(null);
  const [raccordoConfig, setRaccordoConfig] = useState<{ type: 'curvo' | 'rettilineo'; value: number }>({
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
    { id: "tav1", name: "Tavola n. 1", format: "A4", scale: 100, unit: "cm", position: { x: -30, y: -20 }, visible: true, datiCartiglio: { progetto: "GECOLA CAD", titolo: "Tavola n. 1", autore: "Ing. Domenico Gimondo", data: "2026" } },
    { id: "tav2", name: "Tavola n. 2", format: "A3", scale: 100, unit: "cm", position: { x: 30, y: -20 }, visible: false, datiCartiglio: { progetto: "GECOLA CAD", titolo: "Tavola n. 2", autore: "Ing. Domenico Gimondo", data: "2026" } },
    { id: "tav3", name: "Tavola n. 3", format: "A2", scale: 200, unit: "cm", position: { x: -40, y: 30 }, visible: false, datiCartiglio: { progetto: "GECOLA CAD", titolo: "Tavola n. 3", autore: "Ing. Domenico Gimondo", data: "2026" } },
    { id: "tav4", name: "Tavola n. 4", format: "A1", scale: 500, unit: "cm", position: { x: 40, y: 30 }, visible: false, datiCartiglio: { progetto: "GECOLA CAD", titolo: "Tavola n. 4", autore: "Ing. Domenico Gimondo", data: "2026" } },
    { id: "tav5", name: "Tavola n. 5", format: "A0", scale: 1000, unit: "cm", position: { x: 0, y: 0 }, visible: false, datiCartiglio: { progetto: "GECOLA CAD", titolo: "Tavola n. 5", autore: "Ing. Domenico Gimondo", data: "2026" } },
  ]);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'penne' | 'tavole' | 'layers' | 'maschere' | 'testo' | 'gemini' | 'manuale' | 'bim'>(() => (localStorage.getItem('activeSidebarTab') as any) || 'penne');
  const [hoveredGuide, setHoveredGuide] = useState<GuideItem | null>(null);
  const [guideLockedBy, setGuideLockedBy] = useState<string | null>(null);
  const [showFloatingManual, setShowFloatingManual] = useState(false);
  const [geminiPrompt, setGeminiPrompt] = useState("");
  const [geminiResponse, setGeminiResponse] = useState<{
    explanation: string;
    parameters: { name: string; value: number; label: string }[];
    script: string;
  } | null>(null);
  const [geminiDslScript, setGeminiDslScript] = useState("");
  const [geminiParams, setGeminiParams] = useState<Record<string, number>>({});
  const [geminiIsLoading, setGeminiIsLoading] = useState(false);
  const [geminiInsertX, setGeminiInsertX] = useState(0);
  const [geminiInsertY, setGeminiInsertY] = useState(0);
  
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingCartiglioTavolaId, setEditingCartiglioTavolaId] = useState<string | null>(null);
  const [doubleClickedTavolaId, setDoubleClickedTavolaId] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [activePreviewTavolaId, setActivePreviewTavolaId] = useState<string | null>(null);
  const [rulerStyle, setRulerStyle] = useState<"tecnigrafo" | "crosshair">(() => (localStorage.getItem('rulerStyle') as any) || "crosshair");
  const [orthoMode, setOrthoMode] = useState(() => localStorage.getItem('orthoMode') === 'true');
  const [isTecnigrafoActive, setIsTecnigrafoActive] = useState(false);
  const [isContinuousMode, setIsContinuousMode] = useState(false);
  const [cancelTrigger, setCancelTrigger] = useState(0);
  const [parallelTrigger, setParallelTrigger] = useState(0);
  const [showProperties, setShowProperties] = useState(() => localStorage.getItem('showProperties') === 'true');
  const [selectedCategory, setSelectedCategory] = useState(() => localStorage.getItem('selectedCategory') || "Disegno");

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
    localStorage.setItem('defaultHatchStyle', JSON.stringify(defaultHatchStyle));
  }, [defaultHatchStyle]);

  useEffect(() => {
    localStorage.setItem('defaultTextStyle', JSON.stringify(defaultTextStyle));
  }, [defaultTextStyle]);

  useEffect(() => {
    localStorage.setItem('eraserRadius', eraserRadius.toString());
  }, [eraserRadius]);

  useEffect(() => {
    localStorage.setItem('favoritePanels', JSON.stringify(favoritePanels));
  }, [favoritePanels]);

  useEffect(() => {
    localStorage.setItem('activeSidebarTab', activeSidebarTab);
  }, [activeSidebarTab]);

  useEffect(() => {
    const requiredLayers = [
      { id: "BIM_Muri", name: "BIM_Muri", visible: true, frozen: false },
      { id: "BIM_Porte", name: "BIM_Porte", visible: true, frozen: false },
      { id: "BIM_Finestre", name: "BIM_Finestre", visible: true, frozen: false },
      { id: "BIM_Arredi", name: "BIM_Arredi", visible: true, frozen: false },
      { id: "BIM_Sanitari", name: "BIM_Sanitari", visible: true, frozen: false },
      { id: "BIM_Impianti_Elettrici", name: "BIM_Impianti_Elettrici", visible: true, frozen: false },
      { id: "BIM_Impianti_Idraulici", name: "BIM_Impianti_Idraulici", visible: true, frozen: false },
      { id: "BIM_Finiture", name: "BIM_Finiture", visible: true, frozen: false },
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
    } else {
      alert("Formato non supportato. Selezionare un file .dxf o .dwg.");
    }
    
    // reset input so the same file can be imported again
    event.target.value = '';
  };

  const handleImportGemini = () => {
    if (!geminiDslScript) return;
    try {
      const p = parseScriptToEntities(geminiDslScript, { x: Number(geminiInsertX), y: Number(geminiInsertY) }, activeLayerId);
      
      // Automatic Layer Addition if any referred layers don't exist!
      const existingNames = new Set(layers.map(l => l.name));
      const layersToCreate: Layer[] = [];
      for (const reqLayer of p.referencedLayers) {
        if (!existingNames.has(reqLayer)) {
          layersToCreate.push({
            id: reqLayer,
            name: reqLayer,
            visible: true,
            frozen: false
          });
        }
      }
      if (layersToCreate.length > 0) {
        setLayers(prev => [...prev, ...layersToCreate]);
      }

      updateEntitiesWithHistory(prev => [...prev, ...p.entities]);
      setShortcutToast(`Importati ${p.entities.length} elementi parametrici!`);
      setTimeout(() => setShortcutToast(null), 3000);
    } catch (err) {
      console.error(err);
      alert("Errore nell'importazione degli oggetti geometrici.");
    }
  };

  const cadCanvasRef = useRef<any>(null);

  // Automatic Layer Selection based on style/pen
  // Matita 2H -> Layer 0
  // HB, CAD -> p1, p2, p4
  useEffect(() => {
    if (defaultLineStyle.mode === 'pencil' && defaultLineStyle.color === '#bbbbbb') {
      setActiveLayerId("0"); // Schizzo / Costruzione
    } else if (defaultLineStyle.mode === 'ink') {
      if (defaultLineStyle.lineWidth === 0.25) setActiveLayerId("p1");
      else if (defaultLineStyle.lineWidth === 0.35) setActiveLayerId("p2");
      else if (defaultLineStyle.lineWidth >= 0.5) setActiveLayerId("p4");
    }
  }, [defaultLineStyle.mode, defaultLineStyle.lineWidth, defaultLineStyle.color]);

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
        // Simuliamo un invio al form del dialogo
        const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
        window.dispatchEvent(ev);
        e.preventDefault();
        return;
    }

    // If in Template tool, try rotating first
    if (selectedTool === 'Template' || selectedTool === 'Select') {
        const rotated = cadCanvasRef.current?.rotateMaskAtPoint(e);
        if (rotated) {
            e.preventDefault();
            return;
        }
    }

    // If in Template tool and didn't rotate, cancel it and switch to Select
    if (selectedTool === 'Template') {
      setSelectedTool('Select');
      setSelectedTemplateId(null);
      setShortcutToast("Strumento: Selezione (Magneti)");
      setTimeout(() => setShortcutToast(null), 1500);
      return;
    }

    // If not in a drawing tool, switch to Line
    if (!["Line", "Circle", "Arc", "Hatch", "Dimension"].includes(selectedTool || '')) {
      setSelectedCategory("Disegno");
      setSelectedTool("Line");
      setShortcutToast("Strumento: Linea");
      setTimeout(() => setShortcutToast(null), 1500);
    }
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
      setIsRaccordoDialogOpen(true);
      setShowProperties(false);
    } else if (tool === "Parallel") {
      setSelectedTool("Parallel");
      setCancelTrigger(prev => prev + 1);
      setParallelTrigger(prev => prev + 1);
      setShowProperties(false);
      setIsRaccordoDialogOpen(false);
    } else if (tool === "Penne") {
      setActiveSidebarTab('penne');
      setShowProperties(true);
      if (selectedTool === 'Hatch' || selectedTool === 'Specchio' || selectedTool === 'Dimension') {
        setSelectedTool('Select');
      }
    } else if (tool === "Maschere") {
      setActiveSidebarTab('maschere');
      setShowProperties(true);
      if (selectedTool === 'Template') {
        setSelectedTool('Select');
      }
    } else {
      setSelectedTool(tool);
      // Ensure the correct sidebar tab opens for specific tools as requested
      if (tool === 'Hatch') {
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
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e)),
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
        { name: "Line", icon: Minus },
        { name: "Circle", icon: Circle },
        { name: "Arc", icon: History },
        { name: "Hatch", icon: Grid },
        { name: "Specchio", icon: MirrorIcon },
        { name: "Testo", icon: Type },
        { name: "Trim", icon: Scissors },
        { name: "Eraser", icon: Eraser },
        { name: "Parallel", icon: ParallelIcon },
        { name: "CopiaVideo", icon: Camera },
        { name: "Join", icon: Link },
        { name: "Raccordo", icon: RaccordoIcon },
        { name: "Move", icon: Move },
        { name: "Copy", icon: Copy },
        { name: "Dimension", icon: Ruler },
        { name: "Penne", icon: Pen },
        { name: "Maschere", icon: Square },
        { name: "Cancella", icon: Trash2 },
      ],
    },
    {
      name: "BIM",
      icon: Building,
      tools: [
        { name: "BIM_Muro", icon: Building },
        { name: "BIM_Porta", icon: Type },
        { name: "BIM_Finestra", icon: Maximize2 },
        { name: "BIM_Arredi", icon: Home },
        { name: "BIM_Sanitari", icon: Droplet },
        { name: "BIM_Elettrico", icon: Zap },
        { name: "BIM_Idraulico", icon: Crosshair },
        { name: "BIM_Finitura", icon: Grid },
        { name: "BIM_Scansione", icon: Sparkles }
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

      let isDocked: 'left' | 'right' | null = null;

      // Docking thresholds based on screen borders
      if (targetX < 45) {
        isDocked = 'left';
      } else if (window.innerWidth - moveEvent.clientX < 240) {
        isDocked = 'right';
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
    if (historyIndex > 0) {
      setHistoryIndex((prev) => prev - 1);
      setEntities(history[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex((prev) => prev + 1);
      setEntities(history[historyIndex + 1]);
    }
  };

  const updateEntitiesSilent = (
    newEntities: React.SetStateAction<Entity[]>,
  ) => {
    setEntities(newEntities);
  };

  const commitToHistory = (snapshotToSave?: Entity[]) => {
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
      return newHistory;
    });
    setHistoryIndex((prevIndex) => prevIndex + 1);
  };

  const updateEntitiesWithHistory = (
    newEntities: React.SetStateAction<Entity[]>,
  ) => {
    setEntities((prev) => {
      const next =
        typeof newEntities === "function" ? (newEntities as Function)(prev) : newEntities;
      
      // Postpone history state side-effects safely to avoid React render queue issues
      setTimeout(() => {
        const currentIdx = historyIndexRef.current;
        const currentHistory = historyRef.current;
        const lastState = currentHistory[currentIdx];

        if (lastState && areEntitiesEqual(lastState, next)) {
          return; // Do not commit duplicates
        }

        setHistory((prevHistory) => {
          const newHistory = prevHistory.slice(0, currentIdx + 1);
          newHistory.push(next);
          return newHistory;
        });
        setHistoryIndex((prevIndex) => prevIndex + 1);
      }, 0);

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
      } else if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault();
        redo();
      }

      // Escape to reset
      if (e.key === 'Escape') {
        setSelectedTool('Select');
        setSelectedId(null);
        setCancelTrigger(prev => prev + 1);
      }

      // Shift or F for Bloc Fn (Hold to activate)
      if (e.key === 'Shift' || key === 'f') {
        setIsContinuousMode(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (e.key === 'Shift' || key === 'f') {
        setIsContinuousMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [historyIndex, history, entities]); // Dependencies for shortcuts

  return (
    <div className="flex flex-col h-screen bg-neutral-100 text-neutral-900">
      {/* Ribbon */}
      <header className="h-14 border-b border-neutral-300 bg-white flex">
        <div className="flex items-center px-4 border-r border-neutral-300 bg-neutral-900 text-white select-none mr-2 relative">
          <span className="font-sans font-black tracking-wider text-sm whitespace-nowrap">GECOLA <span className="text-amber-400">CAD</span></span>
          {fileHandle && (
            <div className="absolute top-1 right-2 flex items-center justify-center pointer-events-none">
              <div className={`w-2 h-2 rounded-full ${isSaving ? 'bg-amber-400' : 'bg-emerald-500'} transition-colors duration-300 drop-shadow-md`} title={isSaving ? "Salvataggio in corso..." : "Auto-save attivo"}></div>
            </div>
          )}
        </div>

        {categories.map((cat) => (
          <button
            key={cat.name}
            onClick={() => {
              setSelectedCategory(cat.name);
              // If clicking "Seleziona", immediately activate the Select tool and show properties
              if (cat.name === "Seleziona") {
                setSelectedTool("Select");
                setShowProperties(true);
              }
            }}
            className={`px-4 flex flex-col items-center justify-center gap-0.5 ${selectedCategory === cat.name ? "bg-neutral-100" : "hover:bg-neutral-200"}`}
          >
            <cat.icon size={16} />
            <span className="text-[10px]">{cat.name}</span>
          </button>
        ))}
        <button
          onClick={() => setShowProperties(!showProperties)}
          className="flex flex-col items-center justify-center px-4 hover:bg-neutral-200 border-l border-neutral-300"
        >
          <span className="text-[10px] text-neutral-500">
            Mode: {defaultLineStyle.mode}
          </span>
          <span className="text-xs font-bold">
            {defaultLineStyle.lineWidth}
          </span>
        </button>

        <div className="flex items-center justify-center px-4 gap-3 border-l border-neutral-300 bg-neutral-50/50">
          <button
            onClick={() => { handleGuideClick('Annulla'); undo(); }}
            onMouseEnter={() => handleGuideHover('Annulla')}
            title="Annulla"
            className="p-1.5 bg-white rounded shadow-sm border border-neutral-200 hover:bg-neutral-100 hover:text-indigo-600 transition-colors text-neutral-600"
          >
            <Undo size={16} />
          </button>
          <button
            onClick={() => { handleGuideClick('Ripristina'); redo(); }}
            onMouseEnter={() => handleGuideHover('Ripristina')}
            title="Ripristina"
            className="p-1.5 bg-white rounded shadow-sm border border-neutral-200 hover:bg-neutral-100 hover:text-indigo-600 transition-colors text-neutral-600"
          >
            <Redo size={16} />
          </button>
        </div>

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
          onMouseEnter={() => handleGuideHover('Layers')}
          className={`px-4 flex flex-col items-center justify-center gap-0.5 border-l border-neutral-300 ${showProperties && activeSidebarTab === 'layers' ? "bg-indigo-50 text-indigo-700 font-bold" : "hover:bg-neutral-200 text-neutral-600"}`}
        >
          <Layers size={16} />
          <span className="text-[10px]">Layer</span>
        </button>

        <button
          onClick={() => {
            handleGuideClick('Penne');
            if (activeSidebarTab === 'penne' && showProperties) {
              // If we are already in the penne tab, but a specific tool help OR entity is selected,
              // we reset the state to show the default pen settings instead of closing the menu.
              if (selectedTool === 'Hatch' || selectedTool === 'Specchio' || selectedTool === 'Dimension' || selectedId) {
                setSelectedTool('Select');
                setSelectedId(null);
              } else {
                setShowProperties(false);
              }
            } else {
              setActiveSidebarTab('penne');
              setShowProperties(true);
              // Ensure we don't carry over a tool that might hide the pen settings
              if (selectedTool === 'Hatch' || selectedTool === 'Specchio' || selectedTool === 'Dimension') {
                setSelectedTool('Select');
              }
            }
          }}
          onMouseEnter={() => handleGuideHover('Penne')}
          className={`px-4 flex flex-col items-center justify-center gap-0.5 border-l border-neutral-300 ${showProperties && activeSidebarTab === 'penne' ? "bg-neutral-100 text-indigo-600 font-bold" : "hover:bg-neutral-200"}`}
        >
          <Pen size={16} />
          <span className="text-[10px]">Penne</span>
        </button>
        <button
          onClick={() => {
            handleGuideClick('Testo');
            if (activeSidebarTab === 'testo' && showProperties) {
              setShowProperties(false);
            } else {
              setActiveSidebarTab('testo');
              setShowProperties(true);
            }
          }}
          onMouseEnter={() => handleGuideHover('Testo')}
          className={`px-4 flex flex-col items-center justify-center gap-0.5 border-l border-neutral-300 ${showProperties && activeSidebarTab === 'testo' ? "bg-neutral-100 text-indigo-600 font-bold" : "hover:bg-neutral-200"}`}
        >
          <Type size={16} />
          <span className="text-[10px]">Testo</span>
        </button>
        <button
          onClick={() => {
            handleGuideClick('Gemini AI');
            if (activeSidebarTab === 'gemini' && showProperties) {
              setShowProperties(false);
            } else {
              setActiveSidebarTab('gemini');
              setShowProperties(true);
            }
          }}
          onMouseEnter={() => handleGuideHover('Gemini AI')}
          className={`px-4 flex flex-col items-center justify-center gap-0.5 border-l border-neutral-300 ${showProperties && activeSidebarTab === 'gemini' ? "bg-amber-50 text-amber-700 font-bold border-x border-amber-200" : "hover:bg-neutral-200 text-neutral-600"}`}
        >
          <Sparkles size={16} className={showProperties && activeSidebarTab === 'gemini' ? "text-amber-500 animate-pulse" : "text-amber-500"} />
          <span className="text-[10px]">Gemini AI</span>
        </button>
        <button
          onClick={() => {
            handleGuideClick('BIM');
            if (activeSidebarTab === 'bim' && showProperties) {
              setShowProperties(false);
            } else {
              setActiveSidebarTab('bim');
              setSelectedCategory('BIM');
              setShowProperties(true);
            }
          }}
          onMouseEnter={() => handleGuideHover('BIM')}
          className={`px-4 flex flex-col items-center justify-center gap-0.5 border-l border-neutral-300 ${showProperties && activeSidebarTab === 'bim' ? "bg-cyan-50 text-cyan-800 font-bold border-x border-cyan-200" : "hover:bg-neutral-200 text-neutral-600"}`}
        >
          <Building size={16} className={showProperties && activeSidebarTab === 'bim' ? "text-cyan-600 animate-pulse" : "text-cyan-600"} />
          <span className="text-[10px] font-bold">BIM</span>
        </button>
        <div className="flex-1"></div>
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
          className={`px-5 py-1.5 flex flex-col items-center justify-center gap-0.5 border-l border-neutral-300 relative select-none h-full min-w-[76px] ${showProperties && activeSidebarTab === 'manuale' ? "bg-emerald-50 text-emerald-950 font-bold border-x border-emerald-200" : "hover:bg-neutral-200 text-neutral-600"}`}
        >
          {/* Spuntatura interattiva in alto a destra */}
          <div 
            className="absolute top-1 right-1 flex items-center justify-center z-20 p-0.5 rounded cursor-pointer hover:bg-neutral-300/40"
            onClick={(e) => {
              e.stopPropagation(); // Evita l'apertura del pannello laterale quando si clicca solo la spunta
              setShowFloatingManual(!showFloatingManual);
            }}
            title={showFloatingManual ? "Help in linea ATTIVO - Ogni volta che tocchi uno strumento avrai la guida rapida pop-up (Clicca la spunta per disattivare)" : "Help in linea DISATTIVATO - Le spiegazioni automatiche non si apriranno in pop-up per non appesantire (Clicca la spunta per attivare)"}
          >
            <input
              type="checkbox"
              checked={showFloatingManual}
              onChange={() => {}} // Gestito interamente da onClick per compatibilità stopPropagation
              className="w-3 h-3 cursor-pointer accent-emerald-600 border border-neutral-300 rounded transition-all focus:ring-0"
            />
          </div>

          <BookOpen size={16} className={showProperties && activeSidebarTab === 'manuale' ? "text-emerald-600 animate-pulse" : "text-neutral-500"} />
          <span className="text-[10px] font-bold">Manuale</span>
        </button>

        <div className="flex items-center gap-1.5 px-2 border-l border-neutral-300 bg-neutral-50 h-full">
           <button onClick={() => { handleGuideClick('Apri'); handleOpenFile(); }} onMouseEnter={() => handleGuideHover('Apri')} title="Apri File" className="flex flex-col items-center justify-center p-1.5 hover:bg-neutral-200 text-neutral-600 rounded gap-0.5">
             <FolderOpen size={16} />
             <span className="text-[10px]">Apri</span>
           </button>
           <button onClick={() => { handleGuideClick('Salva'); handleSaveAsFile(); }} onMouseEnter={() => handleGuideHover('Salva')} title={fileHandle ? "Salva con nome" : "Salva"} className="flex flex-col items-center justify-center p-1.5 hover:bg-neutral-200 text-neutral-600 rounded gap-0.5">
             <Save size={16} />
             <span className="text-[10px]">Salva</span>
           </button>
           <button onClick={() => { handleGuideClick('Importa'); importInputRef.current?.click(); }} onMouseEnter={() => handleGuideHover('Importa')} title="Importa file .dxf o .dwg" className="flex flex-col items-center justify-center p-1.5 hover:bg-emerald-100 text-emerald-600 hover:text-emerald-700 rounded gap-0.5 border-l border-neutral-200 pl-2 transition-colors">
             <FileUp size={16} />
             <span className="text-[10px] font-bold">Importa</span>
           </button>
           <button onClick={() => { handleGuideClick('Lettore DXF'); setIsDXFTextReaderOpen(true); }} onMouseEnter={() => handleGuideHover('Lettore DXF')} title="Genera disegno da testo/codice DXF" className="flex flex-col items-center justify-center p-1.5 hover:bg-teal-50 text-teal-600 hover:text-teal-700 rounded gap-0.5 border-l border-neutral-200 pl-2 transition-colors">
             <Code size={16} />
             <span className="text-[10px] font-bold">Lettore DXF</span>
           </button>
        </div>
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
          onMouseEnter={() => handleGuideHover('Tavole CAD')}
          className={`px-4 flex flex-col items-center justify-center gap-0.5 ${showProperties && activeSidebarTab === 'tavole' ? "bg-indigo-50 border-x border-indigo-200" : "hover:bg-neutral-200 border-l border-neutral-300"}`}
        >
          <Layers size={16} className={`${activeSidebarTab === 'tavole' && showProperties ? "text-indigo-600 animate-pulse" : "text-neutral-500"}`} />
          <span className={`text-[10px] font-bold ${activeSidebarTab === 'tavole' && showProperties ? "text-indigo-700" : "text-neutral-600"}`}>Tavole CAD</span>
        </button>
        <button
          onClick={async () => {
            handleGuideClick('Salva');
            const { exportDXF } = await import("./utils/dxfExport");
            exportDXF(entities, layers, "disegno.dxf");
          }}
          onMouseEnter={() => handleGuideHover('Salva')}
          className="px-4 flex flex-col items-center justify-center gap-0.5 hover:bg-neutral-200 text-blue-600 border-l border-neutral-300"
        >
          <span className="font-bold text-sm">DXF</span>
          <span className="text-[10px] font-bold">Salva CAD</span>
        </button>
      </header>
      <div className="h-8 bg-white border-b border-neutral-300 flex items-center px-4 gap-2">
        {selectedCategory === "BIM" ? (
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
          />
        ) : (
          selectedCategoryTools.map((tool) => (
            <button
              key={tool.name}
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", tool.name);
                e.dataTransfer.setData("source", "toolbar");
              }}
              onMouseEnter={() => handleGuideHover(tool.name)}
              onClick={() => handleToolClick(tool.name)}
              className={`px-2 py-0.5 rounded flex items-center gap-1 text-xs cursor-grab active:cursor-grabbing border border-transparent transition-all hover:border-neutral-300 ${
                selectedTool === tool.name 
                  ? "bg-indigo-100 text-indigo-900 border border-indigo-300 font-bold shadow-xs" 
                  : "hover:bg-neutral-200"
              }`}
              title="Trascina e rilascia nel foglio per creare un menu speciale preferiti!"
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
              handleGuideClick("Modo Orto");
              setOrthoMode(!orthoMode);
            }}
            onMouseEnter={() => handleGuideHover("Modo Orto")}
            className={`px-2 py-0.5 rounded flex items-center gap-1 text-xs transition ${
              orthoMode 
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
              if (next && selectedTool === 'Select') {
                setOrthoMode(true);
                setSelectedTool('Line');
              }
              setCancelTrigger(prev => prev + 1);
            }}
            className={`px-2 py-0.5 rounded flex items-center gap-1 text-xs transition-all ${
              isContinuousMode 
                ? "bg-amber-100 text-amber-950 border border-amber-300 font-bold shadow-[0_0_8px_rgba(245,158,11,0.2)]" 
                : "hover:bg-neutral-200"
            }`}
          >
            <Lock size={12} className={isContinuousMode ? "text-amber-600" : ""} />
            <span>Bloc Fn</span>
          </button>
          <div className="flex gap-1 rounded bg-neutral-200 p-0.5">
            <button
              onClick={() => {
                handleGuideClick("Penne");
                setDefaultLineStyle({ mode: 'CAD', color: '#000000', lineWidth: 1, dashed: false });
                setActiveSidebarTab('penne');
                setShowProperties(true);
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
              let isDocked: 'left' | 'right' | null = null;
              let finalX = x;

              if (x < 50) {
                isDocked = 'left';
                finalX = 0;
              } else if (window.innerWidth - e.clientX < 240) {
                isDocked = 'right';
                finalX = window.innerWidth - 60;
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
          <CADCanvas
            ref={cadCanvasRef}
            entities={entities}
            activeTool={selectedTool}
            setActiveTool={setSelectedTool}
            setEntities={updateEntitiesWithHistory}
            setEntitiesSilent={updateEntitiesSilent}
            defaultTextStyle={defaultTextStyle}
            onCommitHistory={commitToHistory}
            onSelect={(id) => {
              setSelectedId(id);
              if (id) {
                setShowProperties(true);
                const ent = entities.find(e => e.id === id);
                if (ent && ent.type === 'text') {
                  setActiveSidebarTab('testo');
                } else {
                  setActiveSidebarTab('penne');
                }
              }
            }}
            onContextMenu={handleRightClickShortcut}
            activeLayerId={activeLayerId}
            layers={layers}
            defaultLineStyle={defaultLineStyle}
            setDefaultLineStyle={setDefaultLineStyle}
            eraserRadius={eraserRadius}
            setEraserRadius={setEraserRadius}
            rulerStyle={rulerStyle}
            orthoMode={orthoMode}
            setOrthoMode={setOrthoMode}
            isContinuousMode={isContinuousMode}
            cancelTrigger={cancelTrigger}
            parallelTrigger={parallelTrigger}
            tavole={tavole}
            onUpdateTavole={setTavole}
            onDoubleClickTavola={setDoubleClickedTavolaId}
            selectedTemplateId={selectedTemplateId}
            selectedEntityId={selectedId}
            selectedBIMSymbolType={selectedBIMSymbolType}
            setSelectedBIMSymbolType={setSelectedBIMSymbolType}
            defaultHatchStyle={defaultHatchStyle}
            onActionStart={() => {
              setHoveredGuide(null);
              setGuideLockedBy(null);
            }}
            raccordoConfig={raccordoConfig}
            onEditRaccordo={(raccordoEntity) => {
              setEditingRaccordo(raccordoEntity);
              setIsRaccordoDialogOpen(true);
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

            return favoritePanels.map((panel) => {
              const isDocked = panel.isDocked;
              const leftIndex = leftDockedPanels.findIndex(p => p.id === panel.id);
              const rightIndex = rightDockedPanels.findIndex(p => p.id === panel.id);
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
                  left: leftIndex * 58,
                  top: '15%',
                  height: '70%',
                  maxHeight: '520px',
                  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                };
              } else if (isDocked === 'right' && !isDraggingThis) {
                placementStyle = {
                  right: rightIndex * 58,
                  top: '15%',
                  height: '70%',
                  maxHeight: '520px',
                  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                };
              }

              return (
                <div
                  key={panel.id}
                  style={placementStyle}
                  className={`absolute z-30 select-none bg-white/80 backdrop-blur-md border border-neutral-200/80 shadow-[0_12px_40px_rgba(0,0,0,0.06)] overflow-hidden flex flex-col pointer-events-auto ${
                    isDraggingThis
                      ? "ring-2 ring-indigo-500/30 shadow-indigo-500/10 scale-[1.01] z-40" 
                      : ""
                  } ${
                    isDocked === 'left' 
                      ? 'rounded-r-xl border-l-0' 
                      : isDocked === 'right' 
                        ? 'rounded-l-xl border-r-0' 
                        : 'rounded-xl max-w-[70px]'
                  }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const toolName = e.dataTransfer.getData("text/plain");
                  const source = e.dataTransfer.getData("source");

                  if (toolName) {
                    if (source === `favorites-${panel.id}`) return;

                    if (source && source.startsWith("favorites-")) {
                      const sourcePanelId = source.replace("favorites-", "");
                      setFavoritePanels(prev => prev.map(p => {
                        if (p.id === sourcePanelId) {
                          return { ...p, tools: p.tools.filter(t => t !== toolName) };
                        }
                        return p;
                      }).filter(p => p.tools.length > 0));
                    }

                    setFavoritePanels(prev => prev.map(p => {
                      if (p.id === panel.id) {
                        if (p.tools.includes(toolName)) return p;
                        return { ...p, tools: [...p.tools, toolName] };
                      }
                      return p;
                    }));
                  }
                }}
              >
                {/* Vertical discrete drag handle at top or side */}
                <div
                  onMouseDown={(e) => handleFavoritesMouseDown(e, panel.id)}
                  className={`px-2 py-1.5 bg-neutral-100/90 hover:bg-neutral-200/50 text-neutral-600 flex items-center justify-between cursor-move text-[9px] uppercase font-mono font-bold tracking-wider border-b border-neutral-200/60 ${isDocked ? 'flex-col gap-1' : ''}`}
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

                {/* Vertical list of tools */}
                <div className={`p-1.5 flex flex-col gap-1.5 bg-white items-center min-w-[54px] justify-start overflow-y-auto ${isDocked ? 'h-full' : 'max-h-[360px]'}`}>
                  {panel.tools.length === 0 ? (
                    <div className="text-[8px] text-neutral-400 text-center w-full p-2">
                       Vuoto
                    </div>
                  ) : (
                    panel.tools.map((toolName) => {
                      const IconComp = getToolIcon(toolName);
                      return (
                        <div
                          key={toolName}
                          draggable={true}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", toolName);
                            e.dataTransfer.setData("source", `favorites-${panel.id}`);
                          }}
                          className="group relative"
                        >
                          <button
                            onClick={() => handleToolClick(toolName)}
                            className={`p-2 rounded-lg bg-neutral-50 border border-neutral-200/50 text-neutral-700 transition-all flex flex-col items-center justify-center gap-0.5 w-11 h-11 cursor-grab active:cursor-grabbing hover:bg-indigo-50/70 hover:text-indigo-950 hover:border-indigo-400/50 ${
                              selectedTool === toolName ? "bg-indigo-50 border-indigo-400 text-indigo-950 font-bold shadow-xs" : ""
                            }`}
                            title={`${toolName} - Trascina per spostare o rimuovere`}
                          >
                            {IconComp ? <IconComp size={15} className="text-neutral-600 group-hover:text-indigo-600 transition-colors" /> : null}
                            <span className="text-[7.5px] font-sans font-medium text-neutral-500 truncate w-full text-center tracking-tight leading-none">
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
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center pointer-events-none select-none text-center z-10 opacity-35 hover:opacity-75 transition-opacity duration-300">
            <span className="text-[9.5px] font-sans tracking-wider text-neutral-600 font-medium">
              Copyright © 2026 Domenico Gimondo
            </span>
            <span className="text-[8.5px] font-mono tracking-[0.3em] text-neutral-500 font-bold mt-0.5 uppercase">
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
          <div className="w-80 bg-white border-l border-neutral-300 p-4 transition-all overflow-y-auto overflow-x-hidden flex flex-col h-full">
            <h3 className="font-bold mb-4 flex justify-between items-center text-neutral-800 border-b border-neutral-100 pb-2">
              <span className="text-xs font-black uppercase tracking-wider font-mono">
                {activeSidebarTab === "tavole" ? "Gestione Tavole" 
                  : activeSidebarTab === "layers" ? "Gestione Layers" 
                  : activeSidebarTab === "maschere" ? "Archivio Maschere" 
                  : activeSidebarTab === "testo" ? "Impostazioni Testo"
                  : activeSidebarTab === "gemini" ? "Disegno Gemini AI"
                  : activeSidebarTab === "bim" ? "Tecnologia BIM / I.A."
                  : "Mazzo Penne & Stili"}
              </span>
              <button 
                onClick={() => setShowProperties(false)} 
                className="text-neutral-400 hover:text-neutral-600 font-bold font-mono text-sm p-1"
              >
                ✕
              </button>
            </h3>

            <div className="space-y-4 flex-1">
              {activeSidebarTab === "bim" ? (
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
                  onOpenMuri={() => setIsBIMMuriOpen(true)}
                  onOpenPorte={() => setIsBIMPorteOpen(true)}
                  onOpenFinestre={() => setIsBIMFinestreOpen(true)}
                  onOpenArredi={() => setIsBIMArrediOpen(true)}
                  onOpenSanitari={() => setIsBIMSanitariOpen(true)}
                  onOpenElettrico={() => setIsBIMElettricoOpen(true)}
                  onOpenIdraulico={() => setIsBIMIdraulicoOpen(true)}
                  onOpenFiniture={() => setIsBIMFinitureOpen(true)}
                />
              ) : activeSidebarTab === "gemini" ? (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg shadow-sm">
                    <p className="text-[11px] text-amber-900 leading-normal font-sans">
                      <span className="font-bold">🔮 DIALOGA CON GEMINI CAD:</span> Descrivi cosa vuoi disegnare. Riceverai un codice parametrico visualizzabile ed modificabile in tempo reale.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {/* Prompt input */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block font-mono">
                        Cosa desideri disegnare?
                      </label>
                      <textarea
                        className="w-full bg-neutral-50 hover:bg-neutral-100 focus:bg-white border border-neutral-300 text-xs rounded p-2 focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-neutral-400 font-sans leading-relaxed"
                        rows={3}
                        value={geminiPrompt}
                        onChange={(e) => setGeminiPrompt(e.target.value)}
                        placeholder="Es: un tavolo da pranzo 160x80 con 6 sedie, oppure una scala con 5 alzate..."
                      />
                    </div>

                    {/* Presets */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider block font-mono">Esempi rapidi:</span>
                      <div className="grid grid-cols-2 gap-1">
                        {[
                          { label: "Tavolo e sedie", text: "tavolo rettangolare 160x90 con 6 sedie attorno" },
                          { label: "Ingranaggio", text: "ingranaggio circolare raggio 35 con 10 denti rettangolari" },
                          { label: "Scala a gradini", text: "una scala a gradini con 5 alzate da 18 e pedate da 28" },
                          { label: "Piscina ovale", text: "piscina ovale formata da un rettangolo centrale 100x50 e due semicerchi laterali" }
                        ].map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setGeminiPrompt(preset.text)}
                            className="bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[9px] px-1.5 py-1 rounded transition-colors font-medium border border-neutral-200 text-left truncate"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Generate Button */}
                    <button
                      onClick={async () => {
                        if (!geminiPrompt.trim()) return;
                        setGeminiIsLoading(true);
                        try {
                          const response = await fetch("/api/ai-draw", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ prompt: geminiPrompt })
                          });
                          if (!response.ok) {
                            throw new Error("Generazione fallita.");
                          }
                          const data = await response.json();
                          if (data.script) {
                            setGeminiResponse(data);
                            setGeminiDslScript(data.script);
                            
                            // Initialize parameters
                            const initialParams: Record<string, number> = {};
                            if (data.parameters) {
                              data.parameters.forEach((p: any) => {
                                initialParams[p.name] = p.value;
                              });
                            }
                            setGeminiParams(initialParams);
                          }
                        } catch (err: any) {
                          console.error(err);
                          alert("Impossibile connettersi o ricevere dati da Gemini: " + err.message);
                        } finally {
                          setGeminiIsLoading(false);
                        }
                      }}
                      disabled={geminiIsLoading || !geminiPrompt.trim()}
                      className={`w-full py-2 px-3 rounded-md font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm ${
                        geminiIsLoading 
                          ? "bg-neutral-200 text-neutral-400 cursor-not-allowed" 
                          : "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:from-amber-700 text-white hover:shadow-md cursor-pointer"
                      }`}
                    >
                      <Sparkles size={14} className={geminiIsLoading ? "animate-spin text-amber-500" : "text-white"} />
                      <span>{geminiIsLoading ? "Elaborazione IA..." : "Chiedi a Gemini"}</span>
                    </button>

                    {/* Gemini Result / Script Area */}
                    {geminiResponse && (
                      <div className="space-y-4 pt-3 border-t border-neutral-100">
                        {/* Explanation */}
                        {geminiResponse.explanation && (
                          <div className="bg-neutral-50 border border-neutral-200 rounded p-2 text-[10.5px] text-neutral-600 leading-relaxed font-sans">
                            <span className="font-bold text-neutral-800 block mb-0.5">Note di Progetto:</span>
                            {geminiResponse.explanation}
                          </div>
                        )}

                        {/* Interactive Sliders/Inputs for Parameters */}
                        {geminiResponse.parameters && geminiResponse.parameters.length > 0 && (
                          <div className="space-y-2 bg-indigo-50/50 border border-indigo-100 rounded p-2.5">
                            <span className="text-[9px] font-black uppercase text-indigo-800 tracking-wider font-mono flex items-center gap-1">
                              <Sparkles size={10} className="text-indigo-500 animate-pulse" />
                              Parametri Dinamici (Tweak)
                            </span>
                            
                            <div className="space-y-1.5">
                              {geminiResponse.parameters.map((p, idx) => {
                                const currentVal = geminiParams[p.name] !== undefined ? geminiParams[p.name] : p.value;
                                return (
                                  <div key={idx} className="space-y-0.5">
                                    <div className="flex justify-between items-center text-[10px] font-bold text-neutral-600">
                                      <span className="truncate max-w-[150px]">{p.label || p.name}</span>
                                      <span className="font-mono text-indigo-700 font-black bg-indigo-100/50 px-1.5 py-0.5 rounded text-[8.5px]">{currentVal}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="range"
                                        min={Math.max(1, Math.round(p.value * 0.2))}
                                        max={Math.round(p.value * 5)}
                                        value={currentVal}
                                        onChange={(e) => {
                                          const newVal = Number(e.target.value);
                                          const updated = { ...geminiParams, [p.name]: newVal };
                                          setGeminiParams(updated);
                                          
                                          // Immediately rewrite variable declaration inside DSL script
                                          const updatedScript = updateScriptVariables(geminiDslScript, updated);
                                          setGeminiDslScript(updatedScript);
                                        }}
                                        className="flex-1 accent-indigo-600 h-1 bg-neutral-300 rounded-lg appearance-none cursor-pointer"
                                      />
                                      <input
                                        type="number"
                                        value={currentVal}
                                        onChange={(e) => {
                                          const newVal = Number(e.target.value);
                                          const updated = { ...geminiParams, [p.name]: newVal };
                                          setGeminiParams(updated);
                                          
                                          // Immediately rewrite variable declaration
                                          const updatedScript = updateScriptVariables(geminiDslScript, updated);
                                          setGeminiDslScript(updatedScript);
                                        }}
                                        className="w-12 bg-white border border-neutral-300 rounded text-center text-[10px] font-bold py-0.5 outline-none focus:border-indigo-500"
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Interactive Script Text Area */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest block font-mono">
                              Codice Disegno (DSL)
                            </label>
                            <span className="text-[8px] bg-emerald-100 text-emerald-800 font-bold uppercase font-mono px-1.5 rounded">
                              Modificabile!
                            </span>
                          </div>
                          
                          <textarea
                            className="w-full bg-slate-900 text-emerald-400 text-[10px] leading-tight font-mono rounded p-2 min-h-[140px] focus:ring-1 focus:ring-emerald-500 focus:outline-none shadow-inner border border-slate-700"
                            value={geminiDslScript}
                            onChange={(e) => setGeminiDslScript(e.target.value)}
                            spellCheck={false}
                          />
                        </div>

                        {/* Insertion offset */}
                        <div className="space-y-1 bg-neutral-50 rounded p-2 border border-neutral-200">
                          <label className="text-[9px] font-black uppercase text-neutral-400 tracking-widest block font-mono mb-1">
                            Punto di Inserimento (X, Y)
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center gap-1 bg-white border border-neutral-300 rounded px-1.5 py-0.5">
                              <span className="text-[9px] text-neutral-400 font-bold font-mono">X:</span>
                              <input
                                type="number"
                                className="w-full text-xs font-bold outline-none border-none p-0 bg-transparent text-neutral-800"
                                value={geminiInsertX}
                                onChange={(e) => setGeminiInsertX(Number(e.target.value))}
                              />
                            </div>
                            <div className="flex items-center gap-1 bg-white border border-neutral-300 rounded px-1.5 py-0.5">
                              <span className="text-[9px] text-neutral-400 font-bold font-mono">Y:</span>
                              <input
                                type="number"
                                className="w-full text-xs font-bold outline-none border-none p-0 bg-transparent text-neutral-800"
                                value={geminiInsertY}
                                onChange={(e) => setGeminiInsertY(Number(e.target.value))}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Apply Drawing Button */}
                        <button
                          onClick={handleImportGemini}
                          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-black text-xs uppercase tracking-widest rounded-md flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                        >
                          <Check size={14} />
                          <span>Importa nel Disegno</span>
                        </button>
                      </div>
                    )}
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
                      {selectedEntity.type === "dimension" && (
                        <>
                          <label className="block text-sm">
                            Text:{" "}
                            <input
                              type="text"
                              value={(selectedEntity as any).customText || ""}
                              onChange={(e) =>
                                updateEntity(selectedEntity.id, {
                                  customText: e.target.value,
                                })
                              }
                              className="w-full bg-neutral-100 p-2 mt-1 rounded text-xs"
                            />
                          </label>
                          <button
                            className="w-full bg-indigo-600 text-white p-2 text-xs font-bold rounded"
                            onClick={() => setIsDimensionDialogOpen(true)}
                          >
                            Edit Style
                          </button>
                        </>
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
                                  onClick={() =>
                                    setDefaultLineStyle({ mode: "CAD", color: '#000000', lineWidth: w, dashed: false })
                                  }
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
                                  onClick={() =>
                                    setDefaultLineStyle({ mode: "ink", color: '#000000', lineWidth: w, dashed: false })
                                  }
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
                                    onClick={() =>
                                      setDefaultLineStyle({ mode: "pencil", color, lineWidth: width, dashed: false })
                                    }
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
                                  onClick={() => setDefaultLineStyle(prev => ({ ...prev, color: c }))}
                                  className={`w-full aspect-square rounded-full flex items-center justify-center transition-transform ${defaultLineStyle.color === c ? "ring-2 ring-offset-2 ring-indigo-500 scale-110 shadow-md" : "hover:scale-105 border border-black/10"}`}
                                  style={{ backgroundColor: c }}
                                >
                                  {defaultLineStyle.color === c && <Check size={10} className="text-white drop-shadow-md" />}
                                </button>
                              ))}
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

      {/* Hidden file input for DXF/DWG uploader */}
      <input
        ref={importInputRef}
        type="file"
        accept=".dxf,.dwg"
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

      {/* Raccordo configuration dialog */}
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

      {/* BIM Dialog Submenus were removed and redesigned in the inline top bars for higher efficiency */}
    </div>
  );
}
