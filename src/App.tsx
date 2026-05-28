/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from 'react-pdf';
import { CADCanvas } from "./components/CADCanvas";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
import { DimensionStyleDialog } from "./components/DimensionStyleDialog";
import { Entity, Point, Layer, Measurement, Tavola } from "./types";
import { mergeAllSegments } from "./utils/entityUtils";
import {
  Minus,
  Circle,
  Square,
  MousePointer2,
  Eraser,
  Sparkles,
  MoveHorizontal,
  Scissors,
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
  Lightbulb,
  LightbulbOff,
  Snowflake,
  Plus,
  Check,
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

export default function App() {
  const [selectedTool, setSelectedTool] = useState("Line");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [layers, setLayers] = useState<Layer[]>([
    { id: "Layer 0", name: "Layer 0", visible: true, frozen: false },
    { id: "Misure", name: "Misure", visible: true, frozen: false },
    { id: "Spessori", name: "Spessori", visible: true, frozen: false },
    { id: "Schizzo", name: "Schizzo", visible: true, frozen: false },
  ]);
  const [activeLayerId, setActiveLayerId] = useState<string>("Layer 0");
  const [defaultLineStyle, setDefaultLineStyle] = useState({
    color: "#000000",
    lineWidth: 1,
    dashed: false,
    mode: "ink" as "ink" | "pencil",
  });
  const [eraserRadius, setEraserRadius] = useState(20);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDimensionDialogOpen, setIsDimensionDialogOpen] = useState(false);
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
  const [activeSidebarTab, setActiveSidebarTab] = useState<'defaults' | 'tavole' | 'layers'>('defaults');
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingCartiglioTavolaId, setEditingCartiglioTavolaId] = useState<string | null>(null);
  const [doubleClickedTavolaId, setDoubleClickedTavolaId] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [rulerStyle, setRulerStyle] = useState<"tecnigrafo" | "crosshair">(
    "crosshair",
  );
  const [orthoMode, setOrthoMode] = useState(true);

  const cadCanvasRef = useRef<any>(null);

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
    if (selectedTool !== "Line") {
      setSelectedCategory("Disegno");
      setSelectedTool("Line");
      setShortcutToast("Strumento: Linea");
      setTimeout(() => setShortcutToast(null), 1500);
    } 
    // Removed context menu display
    /* else {
      setContextMenu({ x: e.clientX, y: e.clientY, isOpen: true });
    } */
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
        { name: "Rectangle", icon: Square },
        { name: "Point", icon: Dot },
        { name: "Trim", icon: Scissors },
        { name: "Eraser", icon: Eraser },
        { name: "Parallel", icon: ParallelIcon },
        { name: "Join", icon: Link },
        { name: "Move", icon: Move },
        { name: "Copy", icon: Copy },
        { name: "Dimension", icon: Ruler },
        { name: "Cancella", icon: Trash2 },
      ],
    },
  ];
  const [showProperties, setShowProperties] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("Disegno");

  // Undo/Redo
  const [history, setHistory] = useState<Entity[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

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
    setHistory((prevHistory) => {
      const newHistory = prevHistory.slice(0, historyIndex + 1);
      newHistory.push(snapshotToSave || entities);
      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
  };

  const updateEntitiesWithHistory = (
    newEntities: React.SetStateAction<Entity[]>,
  ) => {
    setEntities((prev) => {
      const next =
        typeof newEntities === "function" ? newEntities(prev) : newEntities;
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(next);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      return next;
    });
  };

  // Auto-show properties when entity selected
  useEffect(() => {
    if (selectedId) setShowProperties(true);
  }, [selectedId]);

  const selectedCategoryTools =
    categories.find((c) => c.name === selectedCategory)?.tools || [];

  return (
    <div className="flex flex-col h-screen bg-neutral-100 text-neutral-900">
      {/* Ribbon */}
      <header className="h-14 border-b border-neutral-300 bg-white flex">
        <div className="flex items-center px-4 border-r border-neutral-300 bg-neutral-900 text-white select-none mr-1">
          <span className="font-sans font-black tracking-wider text-sm">GECOLA <span className="text-amber-400">CAD</span></span>
        </div>
        {categories.map((cat) => (
          <button
            key={cat.name}
            onClick={() => {
              setSelectedCategory(cat.name);
              if (cat.name === "Disegno") {
                setSelectedTool("Line");
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
          <button onClick={undo} title="Annulla" className="p-1.5 bg-white rounded shadow-sm border border-neutral-200 hover:bg-neutral-100 hover:text-indigo-600 transition-colors text-neutral-600">
            <Undo size={16} />
          </button>
          <button onClick={redo} title="Ripristina" className="p-1.5 bg-white rounded shadow-sm border border-neutral-200 hover:bg-neutral-100 hover:text-indigo-600 transition-colors text-neutral-600">
            <Redo size={16} />
          </button>
        </div>

        <button
          onClick={() => {
            if (activeSidebarTab === 'layers' && showProperties) {
              setShowProperties(false);
            } else {
              setActiveSidebarTab('layers');
              setShowProperties(true);
            }
          }}
          className={`px-4 flex flex-col items-center justify-center gap-0.5 border-l border-neutral-300 ${showProperties && activeSidebarTab === 'layers' ? "bg-indigo-50 text-indigo-700 font-bold" : "hover:bg-neutral-200 text-neutral-600"}`}
        >
          <Layers size={16} />
          <span className="text-[10px]">Layer</span>
        </button>

        <button
          onClick={() => {
            if (activeSidebarTab === 'defaults' && showProperties) {
              setShowProperties(false);
            } else {
              setActiveSidebarTab('defaults');
              setShowProperties(true);
            }
          }}
          className={`px-4 flex flex-col items-center justify-center gap-0.5 border-l border-neutral-300 ${showProperties && activeSidebarTab === 'defaults' ? "bg-neutral-100 text-indigo-600 font-bold" : "hover:bg-neutral-200"}`}
        >
          <Square size={16} />
          <span className="text-[10px]">Proprietà</span>
        </button>
        <div className="flex-1"></div>
        <button
          onClick={() => {
            if (activeSidebarTab === 'tavole' && showProperties) {
              setShowProperties(false);
            } else {
              setActiveSidebarTab('tavole');
              setShowProperties(true);
            }
          }}
          className={`px-4 flex flex-col items-center justify-center gap-0.5 ${showProperties && activeSidebarTab === 'tavole' ? "bg-indigo-50 border-x border-indigo-200" : "hover:bg-neutral-200 border-l border-neutral-300"}`}
        >
          <Layers size={16} className={`${activeSidebarTab === 'tavole' && showProperties ? "text-indigo-600 animate-pulse" : "text-neutral-500"}`} />
          <span className={`text-[10px] font-bold ${activeSidebarTab === 'tavole' && showProperties ? "text-indigo-700" : "text-neutral-600"}`}>Tavole CAD</span>
        </button>
        <button
          onClick={async () => {
            const { exportDXF } = await import("./utils/dxfExport");
            exportDXF(entities, layers, "disegno.dxf");
          }}
          className="px-4 flex flex-col items-center justify-center gap-0.5 hover:bg-neutral-200 text-blue-600 border-l border-neutral-300"
        >
          <span className="font-bold text-sm">DXF</span>
          <span className="text-[10px] font-bold">Salva CAD</span>
        </button>
      </header>
      <div className="h-8 bg-white border-b border-neutral-300 flex items-center px-4 gap-2">
        {selectedCategoryTools.map((tool) => (
          <button
            key={tool.name}
            onClick={() => setSelectedTool(tool.name)}
            className={`px-2 py-0.5 rounded flex items-center gap-1 text-xs ${selectedTool === tool.name ? "bg-indigo-100 text-indigo-900 border border-indigo-300" : "hover:bg-neutral-200"}`}
          >
            <tool.icon size={12} />
            {tool.name}
          </button>
        ))}
        {selectedCategory === "Seleziona" && (
          <>
            <div className="h-4 w-[1px] bg-neutral-300 mx-1" />
            <span className="text-[11px] text-neutral-500 font-medium">
              Menu Righelli:
            </span>
            <button
              onClick={() => setRulerStyle("tecnigrafo")}
              className={`px-2 py-0.5 rounded flex items-center gap-1 text-xs transition ${rulerStyle === "tecnigrafo" ? "bg-amber-100 text-amber-950 border border-amber-300 font-medium" : "hover:bg-neutral-200"}`}
            >
              <DraftingCompass size={12} />
              Classico (Tecnigrafo)
            </button>
            <button
              onClick={() => setRulerStyle("crosshair")}
              className={`px-2 py-0.5 rounded flex items-center gap-1 text-xs transition ${rulerStyle === "crosshair" ? "bg-amber-100 text-amber-950 border border-amber-300 font-medium" : "hover:bg-neutral-200"}`}
            >
              <Crosshair size={12} />
              Incrocio CAD
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="h-4 w-[1px] bg-neutral-300" />
          <div className="flex gap-1 rounded bg-neutral-200 p-0.5">
            <button
              onClick={() => setDefaultLineStyle({...defaultLineStyle, mode: 'pencil'})}
              className={`px-3 py-1 rounded text-[10px] font-bold ${defaultLineStyle.mode === 'pencil' ? 'bg-white shadow-sm' : 'text-neutral-500'}`}
            >
              Standard
            </button>
            <button
              onClick={() => setDefaultLineStyle({...defaultLineStyle, mode: 'ink'})}
              className={`px-3 py-1 rounded text-[10px] font-bold ${defaultLineStyle.mode === 'ink' ? 'bg-white shadow-sm' : 'text-neutral-500'}`}
            >
              Schizzo
            </button>
          </div>
          <div className="h-4 w-[1px] bg-neutral-300" />
          <button
            onClick={() => setOrthoMode(!orthoMode)}
            className={`px-3 py-1 rounded flex items-center gap-1.5 text-xs transition border font-semibold ${
              orthoMode 
                ? "bg-emerald-100 text-emerald-950 border-emerald-400" 
                : "bg-neutral-100 text-neutral-600 border-neutral-300 hover:bg-neutral-200"
            }`}
          >
            <span className={`inline-block w-2 h-2 rounded-full ${orthoMode ? "bg-emerald-600 animate-pulse" : "bg-neutral-400"}`} />
            MODO ORTO: {orthoMode ? "ATTIVO (0°/90°)" : "DISATTIVATO"}
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden relative">
        <main
          className="flex-1 overflow-hidden relative"
        >
          <CADCanvas
            ref={cadCanvasRef}
            entities={entities}
            activeTool={selectedTool}
            setActiveTool={setSelectedTool}
            setEntities={updateEntitiesWithHistory}
            setEntitiesSilent={updateEntitiesSilent}
            onCommitHistory={commitToHistory}
            onSelect={(id) => {
              setSelectedId(id);
              if (id) setShowProperties(true);
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
            tavole={tavole}
            onUpdateTavole={setTavole}
            onDoubleClickTavola={setDoubleClickedTavolaId}
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

                      </div>
                      <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-2">
                        <button
                          onClick={async () => {
                            const { exportNativePDF } = await import("./utils/pdfExport");
                            const url = exportNativePDF(entities, tav.format, tav.scale, tav.unit, tav, 'bloburl');
                            if (url) {
                              setPdfPreviewUrl(url);
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
                <div className="px-4 py-3 border-b flex items-center justify-between bg-neutral-50 shrink-0">
                  <h3 className="font-bold text-neutral-800 flex items-center gap-2">
                    <Printer size={18} className="text-indigo-600" />
                    Anteprima di Stampa PDF
                  </h3>
                  <div className="flex items-center gap-2">
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
                      onClick={() => setPdfPreviewUrl(null)} 
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold text-sm transition-colors"
                    >
                      Chiudi Anteprima
                    </button>
                  </div>
                </div>
                <div id="pdf-scroll-container" className="flex-1 overflow-auto bg-neutral-200/50 p-4">
                  <Document 
                    file={pdfPreviewUrl} 
                    onLoadSuccess={() => {
                      setTimeout(() => {
                         const container = document.getElementById("pdf-scroll-container");
                         if (container) {
                           container.scrollTo({ top: container.scrollHeight, left: container.scrollWidth, behavior: 'smooth' });
                         }
                      }, 200);
                    }}
                    loading={<div className="text-neutral-500 font-bold p-10 animate-pulse text-center w-full">Generazione PDF in corso...</div>}
                    error={<div className="text-red-500 p-10 font-bold text-center w-full">Impossibile generare l'anteprima PDF.</div>}
                    className="flex justify-center min-w-min"
                  >
                    <Page 
                       pageNumber={1} 
                       renderTextLayer={false} 
                       renderAnnotationLayer={false}
                       scale={2.0}
                       className="shadow-2xl border border-neutral-300"
                    />
                  </Document>
                </div>
              </div>
            </div>
          )}
          
          {/* Subtle watermark overlay for licensing & authenticity */}
          <div className="absolute bottom-4 left-4 bg-white/70 backdrop-blur-sm border border-neutral-300/60 px-3 py-1.5 rounded shadow-sm text-[10px] text-neutral-600 font-mono pointer-events-none select-none flex flex-col z-10">
            <span className="font-sans font-black text-neutral-800 tracking-wider">GECOLA CAD v1.4</span>
            <span className="text-[9px]">Diritti riservati a Gimondo Ing. Domenico -</span>
            <span className="text-[9px]">AETERNA@2026</span>
          </div>
        </main>

        {shortcutToast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-neutral-800 text-white px-4 py-2 rounded-md shadow-lg pointer-events-none z-50 text-sm animate-pulse">
            {shortcutToast}
          </div>
        )}

        {/* Properties Panel (Drawer) */}
        {showProperties && (
          <div className="w-80 bg-white border-l border-neutral-300 p-4 transition-all overflow-y-auto flex flex-col h-full">
            <h3 className="font-bold mb-4 flex justify-between items-center text-neutral-800 border-b border-neutral-100 pb-2">
              <span className="text-xs font-black uppercase tracking-wider font-mono">
                {activeSidebarTab === "tavole" ? "Gestione Tavole" : activeSidebarTab === "layers" ? "Gestione Layers" : "Proprietà Disegno"}
              </span>
              <button 
                onClick={() => setShowProperties(false)} 
                className="text-neutral-400 hover:text-neutral-600 font-bold font-mono text-sm p-1"
              >
                ✕
              </button>
            </h3>

            <div className="space-y-4 flex-1">
              {activeSidebarTab === "defaults" ? (
                selectedEntity ? (
                  <>
                    <label className="block text-sm">
                      Stile Linea:
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() =>
                            updateEntity(selectedEntity.id, { mode: "ink" })
                          }
                          className={`p-2 rounded flex-1 text-xs font-bold transition-all ${selectedEntity.mode === "ink" ? "bg-indigo-600 text-white" : "bg-neutral-200"}`}
                        >
                          Stile Schizzo
                        </button>
                        <button
                          onClick={() =>
                            updateEntity(selectedEntity.id, { mode: "pencil" })
                          }
                          className={`p-2 rounded flex-1 text-xs font-bold transition-all ${selectedEntity.mode === "pencil" ? "bg-indigo-600 text-white" : "bg-neutral-200"}`}
                        >
                          Stile Standard
                        </button>
                      </div>
                    </label>
                    <label className="block text-sm">
                      Width:
                      <div className="flex gap-2 mt-1">
                        {[1, 2.5, 4].map((w) => (
                          <button
                            key={w}
                            onClick={() =>
                              updateEntity(selectedEntity.id, { lineWidth: w })
                            }
                            className={`p-2 rounded flex-1 text-xs font-bold ${selectedEntity.lineWidth === w ? "bg-indigo-600 text-white" : "bg-neutral-200 text-neutral-900 border border-neutral-400"}`}
                          >
                            {w} mm
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
                ) : (
                  <>
                    <label className="block text-sm">
                      Stile Default:
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() =>
                            setDefaultLineStyle({
                              ...defaultLineStyle,
                              mode: "ink",
                            })
                          }
                          className={`p-2 rounded flex-1 text-xs font-bold ${defaultLineStyle.mode === "ink" ? "bg-indigo-600 text-white" : "bg-neutral-200"}`}
                        >
                          Stile Schizzo
                        </button>
                        <button
                          onClick={() =>
                            setDefaultLineStyle({
                              ...defaultLineStyle,
                              mode: "pencil",
                            })
                          }
                          className={`p-2 rounded flex-1 text-xs font-bold ${defaultLineStyle.mode === "pencil" ? "bg-indigo-600 text-white" : "bg-neutral-200"}`}
                        >
                          Stile Standard
                        </button>
                      </div>
                    </label>
                    <label className="block text-sm">
                      Default Width:
                      <div className="flex gap-2 mt-1">
                        {[1, 2.5, 4].map((w) => (
                          <button
                            key={w}
                            onClick={() =>
                              setDefaultLineStyle({
                                ...defaultLineStyle,
                                lineWidth: w,
                              })
                            }
                            className={`p-2 rounded flex-1 text-xs font-bold ${defaultLineStyle.lineWidth === w ? "bg-indigo-600 text-white" : "bg-neutral-200 text-neutral-900 border border-neutral-400"}`}
                          >
                            {w} mm
                          </button>
                        ))}
                      </div>
                    </label>
                  </>
                )
              ) : activeSidebarTab === 'layers' ? (
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
                      </div>
                    ))}
                  </div>
                </>
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
    </div>
  );
}
