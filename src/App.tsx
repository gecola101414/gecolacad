/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { CADCanvas } from "./components/CADCanvas";
import { DimensionStyleDialog } from "./components/DimensionStyleDialog";
import { Entity, Point, Layer, Measurement } from "./types";
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
  const [selectedTool, setSelectedTool] = useState("Select");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [layers, setLayers] = useState<Layer[]>([
    { id: "Layer 0", name: "Layer 0", visible: true, frozen: false },
    { id: "Misure", name: "Misure", visible: true, frozen: false },
    { id: "Spessori", name: "Spessori", visible: true, frozen: false },
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
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    isOpen: boolean;
  } | null>(null);
  const [shortcutToast, setShortcutToast] = useState<string | null>(null);
  const [pdfScale, setPdfScale] = useState<number>(100);
  const [pdfUnit, setPdfUnit] = useState<string>("m");
  const [pdfFormat, setPdfFormat] = useState<string>("a4");
  const [rulerStyle, setRulerStyle] = useState<"tecnigrafo" | "crosshair">(
    "tecnigrafo",
  );
  const [orthoMode, setOrthoMode] = useState(false);

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
    } else {
      setContextMenu({ x: e.clientX, y: e.clientY, isOpen: true });
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
        { name: "Rectangle", icon: Square },
        { name: "Point", icon: Dot },
        { name: "Trim", icon: Scissors },
        { name: "Eraser", icon: Eraser },
        { name: "Parallel", icon: ParallelIcon },
        { name: "Join", icon: Link },
        { name: "Move", icon: Move },
        { name: "Dimension", icon: Ruler },
        { name: "Cancella", icon: Trash2 },
      ],
    },
  ];
  const [showProperties, setShowProperties] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(categories[0].name);

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
        <div className="flex flex-col items-center justify-center gap-0.5">
          <button onClick={undo} className="p-1 hover:bg-neutral-200">
            <Undo size={12} />
          </button>
          <button onClick={redo} className="p-1 hover:bg-neutral-200">
            <Redo size={12} />
          </button>
        </div>
        <button
          onClick={() => setShowProperties(!showProperties)}
          className={`px-4 flex flex-col items-center justify-center gap-0.5 ${showProperties ? "bg-neutral-100" : "hover:bg-neutral-200"}`}
        >
          <Square size={16} />
          <span className="text-[10px]">Defaults</span>
        </button>
        <button
          onClick={() => setShowProperties(!showProperties)}
          className="flex flex-col items-center justify-center px-4 hover:bg-neutral-200"
        >
          <span className="text-[10px] text-neutral-500">
            Mode: {defaultLineStyle.mode}
          </span>
          <span className="text-xs font-bold">
            {defaultLineStyle.lineWidth}
          </span>
        </button>
        <div className="flex-1"></div>
        <div className="flex items-center gap-4 mr-4">
          <div className="flex items-center gap-1">
            <span className="text-xs text-neutral-600 font-medium">
              Scala 1:
            </span>
            <input
              type="number"
              value={pdfScale || ""}
              onChange={(e) => setPdfScale(Number(e.target.value))}
              className="w-16 h-7 border border-neutral-300 rounded px-1 text-xs text-center"
            />
          </div>
          <select
            value={pdfUnit}
            onChange={(e) => setPdfUnit(e.target.value)}
            className="h-7 text-xs border border-neutral-300 rounded px-2"
          >
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="m">m</option>
          </select>
          <select
            value={pdfFormat}
            onChange={(e) => setPdfFormat(e.target.value)}
            className="h-7 text-xs border border-neutral-300 rounded px-2"
          >
            <option value="a4">A4</option>
            <option value="a3">A3</option>
            <option value="a2">A2</option>
            <option value="a1">A1</option>
          </select>
        </div>
        <button
          onClick={async () => {
            const { exportNativePDF } = await import("./utils/pdfExport");
            exportNativePDF(entities, pdfFormat, pdfScale || 100, pdfUnit);
          }}
          className="px-4 flex flex-col items-center justify-center gap-0.5 hover:bg-neutral-200 text-indigo-600 border-l border-neutral-300"
        >
          <Printer size={16} />
          <span className="text-[10px] font-bold">Crea PDF</span>
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
          onClick={() => setContextMenu(null)}
        >
          <CADCanvas
            ref={cadCanvasRef}
            entities={entities}
            activeTool={selectedTool}
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
            eraserRadius={eraserRadius}
            setEraserRadius={setEraserRadius}
            rulerStyle={rulerStyle}
            orthoMode={orthoMode}
          />
        </main>

        {contextMenu && contextMenu.isOpen && (
          <div
            className="absolute z-50 bg-white border border-neutral-300 rounded shadow-lg p-1 cursor-move"
            style={{ top: toolboxPos.top, right: toolboxPos.right }}
            onMouseDown={startDragging}
          >
            <button
              className="block w-full text-left px-4 py-2 hover:bg-neutral-200 text-sm"
              onClick={() => { setSelectedTool("Trim"); setContextMenu(null); }}
            >
              Forbici
            </button>
            <button
              className="block w-full text-left px-4 py-2 hover:bg-neutral-200 text-sm"
              onClick={() => { setSelectedTool("Eraser"); setContextMenu(null); }}
            >
              Gomma
            </button>
            <button
              className="block w-full text-left px-4 py-2 hover:bg-neutral-200 text-sm"
              onClick={() => { setSelectedTool("Dimension"); setContextMenu(null); }}
            >
              Righello
            </button>
            <button
              className="block w-full text-left px-4 py-2 hover:bg-neutral-200 text-sm"
              onClick={() => { setSelectedTool("Cancella"); setContextMenu(null); }}
            >
              Cancellino
            </button>
          </div>
        )}

        {shortcutToast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-neutral-800 text-white px-4 py-2 rounded-md shadow-lg pointer-events-none z-50 text-sm animate-pulse">
            {shortcutToast}
          </div>
        )}

        {/* Properties Panel (Drawer) */}
        {showProperties && (
          <div className="w-64 bg-white border-l border-neutral-300 p-4 transition-all overflow-y-auto">
            <h3 className="font-bold mb-4 flex justify-between">
              <span>
                {selectedEntity
                  ? `Properties (${selectedEntity.type})`
                  : "Drawing Defaults"}
              </span>
              <button onClick={() => setShowProperties(false)}>X</button>
            </h3>
            <div className="space-y-4">
              {selectedEntity ? (
                <>
                  <label className="block text-sm">
                    Stile Linea:
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          updateEntity(selectedEntity.id, { mode: "ink" })
                        }
                        className={`p-2 rounded flex-1 ${selectedEntity.mode === "ink" ? "bg-indigo-600 text-white" : "bg-neutral-200"}`}
                      >
                        Stile Schizzo
                      </button>
                      <button
                        onClick={() =>
                          updateEntity(selectedEntity.id, { mode: "pencil" })
                        }
                        className={`p-2 rounded flex-1 ${selectedEntity.mode === "pencil" ? "bg-indigo-600 text-white" : "bg-neutral-200"}`}
                      >
                        Stile Standard
                      </button>
                    </div>
                  </label>
                  <label className="block text-sm">
                    Width:
                    <div className="flex gap-2">
                      {[1, 2.5, 4].map((w) => (
                        <button
                          key={w}
                          onClick={() =>
                            updateEntity(selectedEntity.id, { lineWidth: w })
                          }
                          className={`p-2 rounded flex-1 ${selectedEntity.lineWidth === w ? "bg-indigo-600 text-white" : "bg-neutral-200 text-neutral-900 border border-neutral-400"}`}
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
                          className="w-full bg-neutral-100 p-2 rounded"
                        />
                      </label>
                      <button
                        className="w-full bg-indigo-600 text-white p-2 text-sm rounded"
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
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setDefaultLineStyle({
                            ...defaultLineStyle,
                            mode: "ink",
                          })
                        }
                        className={`p-2 rounded flex-1 ${defaultLineStyle.mode === "ink" ? "bg-indigo-600 text-white" : "bg-neutral-200"}`}
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
                        className={`p-2 rounded flex-1 ${defaultLineStyle.mode === "pencil" ? "bg-indigo-600 text-white" : "bg-neutral-200"}`}
                      >
                        Stile Standard
                      </button>
                    </div>
                  </label>
                  <label className="block text-sm">
                    Default Width:
                    <div className="flex gap-2">
                      {[1, 2.5, 4].map((w) => (
                        <button
                          key={w}
                          onClick={() =>
                            setDefaultLineStyle({
                              ...defaultLineStyle,
                              lineWidth: w,
                            })
                          }
                          className={`p-2 rounded flex-1 ${defaultLineStyle.lineWidth === w ? "bg-indigo-600 text-white" : "bg-neutral-200 text-neutral-900 border border-neutral-400"}`}
                        >
                          {w} mm
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="block text-sm mb-2">
                    Active Layer:
                    <select
                      value={activeLayerId}
                      onChange={(e) => setActiveLayerId(e.target.value)}
                      className="w-full bg-neutral-100 p-2 rounded text-sm mt-1"
                    >
                      {layers.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="space-y-2 mt-4">
                    <h4 className="text-sm font-bold text-neutral-700">
                      Layers
                    </h4>
                    {layers.map((l) => (
                      <div
                        key={l.id}
                        className="flex items-center justify-between bg-neutral-100 p-2 rounded text-sm"
                      >
                        <span className="flex-1">{l.name}</span>
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
                          className={`px-2 py-1 rounded text-xs ${l.visible ? "bg-indigo-100 text-indigo-700" : "bg-neutral-300 text-neutral-600"}`}
                        >
                          {l.visible ? "Visibile" : "Nascosto"}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Command Bar */}
      <footer className="h-8 border-t border-slate-800 bg-slate-900 px-4 flex items-center text-sm">
        <span className="text-slate-500 mr-2 uppercase tracking-wide font-mono">
          Command:
        </span>
        <input
          type="text"
          className="bg-transparent flex-1 outline-none font-mono"
          placeholder="Type a command (f.ex. L, C, R)..."
        />
      </footer>
    </div>
  );
}
