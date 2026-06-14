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
  Zap,
  Droplet,
  Grid,
  ChevronDown,
  User,
  TreePine,
  Car,
  ChevronRight
} from "lucide-react";
import { TEMPLATES } from "../data/templates";
import { TemplatePreview } from "./TemplatePreview";

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
  onOpenFiniture
}: BIMWorkspacePanelProps) {
  const [customRoomName, setCustomRoomName] = useState<string>("");
  const [open2DSection, setOpen2DSection] = useState<boolean>(false);
  const [active2DCat, setActive2DCat] = useState<string>('Verde');

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
      </div>

      {/* Scansione Automatica Solver */}
      <div className="bg-cyan-50 shadow-sm border border-cyan-200 p-4 rounded-xl space-y-2.5">
        <span className="text-[10px] font-black uppercase tracking-wider text-cyan-800 block font-mono">
          Scansione Automatica ⚡
        </span>
        <button
          onClick={() => cadCanvasRef?.current?.autoScanBIM()}
          className="w-full bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-700 hover:to-cyan-600 text-white font-bold py-2 px-4 rounded-lg text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98] cursor-pointer"
        >
          <Sparkles size={14} className="animate-pulse" />
          Scansione Geometrica Planimetria 🤖
        </button>
      </div>

      {/* BIM SOTTOMENU PORTAL */}
      <div className="space-y-2.5">
        <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block border-b border-slate-100 pb-1 font-mono">
          🗂️ Sottomenu BIM di Struttura
        </span>

        <div className="grid grid-cols-2 gap-2">
          {/* MURI SUBMENU */}
          <button
            onClick={onOpenMuri}
            className="group relative flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 bg-white hover:border-cyan-500 hover:bg-slate-50 transition duration-300 transform active:scale-95 text-center cursor-pointer shadow-sm"
          >
            <Building className="text-slate-600 group-hover:text-cyan-600 transition duration-300 mb-1" size={20} />
            <span className="text-[11px] font-black text-slate-800">🧱 Muri BIM</span>
            <span className="text-[8px] opacity-60 font-mono text-slate-500">spessore/altezza</span>
            <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
          </button>

          {/* PORTE SUBMENU */}
          <button
            onClick={onOpenPorte}
            className="group relative flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 bg-white hover:border-rose-500 hover:bg-slate-50 transition duration-300 transform active:scale-95 text-center cursor-pointer shadow-sm"
          >
            <div className="w-5.5 h-5.5 flex items-center justify-center border border-dashed border-rose-500 rounded text-rose-500 font-black text-[10px] mb-1 group-hover:bg-rose-50 transition duration-300">D</div>
            <span className="text-[11px] font-black text-slate-800">🚪 Porte BIM</span>
            <span className="text-[8px] opacity-60 font-mono text-slate-500">larghezz./swing</span>
            <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          </button>

          {/* FINESTRE SUBMENU */}
          <button
            onClick={onOpenFinestre}
            className="group relative flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 bg-white hover:border-blue-500 hover:bg-slate-50 transition duration-300 transform active:scale-95 text-center cursor-pointer shadow-sm"
          >
            <Maximize2 className="text-slate-600 group-hover:text-blue-600 transition mb-1" size={18} />
            <span className="text-[11px] font-black text-slate-800">🪟 Finestre</span>
            <span className="text-[8px] opacity-60 font-mono text-slate-500 font-semibold text-slate-400">luce/aerazione</span>
            <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-500"></span>
          </button>

          {/* ARREDI SUBMENU */}
          <button
            onClick={onOpenArredi}
            className="group relative flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 bg-white hover:border-indigo-500 hover:bg-slate-50 transition duration-300 transform active:scale-95 text-center cursor-pointer shadow-sm"
          >
            <Home className="text-slate-600 group-hover:text-indigo-600 transition mb-1" size={18} />
            <span className="text-[11px] font-black text-slate-800">🛋️ Arredi</span>
            <span className="text-[8px] opacity-60 font-mono text-slate-500">mobili di pianta</span>
            <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
          </button>

          {/* SANITARI SUBMENU */}
          <button
            onClick={onOpenSanitari}
            className="group relative flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 bg-white hover:border-emerald-500 hover:bg-slate-50 transition duration-300 transform active:scale-95 text-center cursor-pointer shadow-sm"
          >
            <Droplet className="text-slate-600 group-hover:text-emerald-600 transition mb-1" size={18} />
            <span className="text-[11px] font-black text-slate-800">🚿 Sanitari</span>
            <span className="text-[8px] opacity-60 font-mono text-slate-500">disegno bagno</span>
            <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          </button>

          {/* IMPIANTI ELETTRICI SUBMENU */}
          <button
            onClick={onOpenElettrico}
            className="group relative flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 bg-white hover:border-amber-500 hover:bg-slate-50 transition duration-300 transform active:scale-95 text-center cursor-pointer shadow-sm"
          >
            <Zap className="text-slate-600 group-hover:text-amber-500 transition mb-1" size={18} />
            <span className="text-[11px] font-black text-slate-800">⚡ Elettrico</span>
            <span className="text-[8px] opacity-60 font-mono text-slate-500">prese, luci, QE</span>
            <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          </button>

          {/* IMPIANTI IDRAULICI SUBMENU */}
          <button
            onClick={onOpenIdraulico}
            className="group relative flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 bg-white hover:border-blue-500 hover:bg-slate-50 transition duration-300 transform active:scale-95 text-center cursor-pointer shadow-sm"
          >
            <Droplet className="text-slate-600 group-hover:text-blue-500 transition mb-1" size={18} />
            <span className="text-[11px] font-black text-slate-800">🚰 Idraulico</span>
            <span className="text-[8px] opacity-60 font-mono text-slate-500">tubi, caldaie</span>
            <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-500"></span>
          </button>

          {/* FINITURE SUBMENU */}
          <button
            onClick={onOpenFiniture}
            className="group relative flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 bg-white hover:border-rose-400 hover:bg-slate-50 transition duration-300 transform active:scale-95 text-center cursor-pointer shadow-sm"
          >
            <Grid className="text-slate-600 group-hover:text-rose-500 transition mb-1" size={18} />
            <span className="text-[11px] font-black text-slate-800">🎨 Finiture</span>
            <span className="text-[8px] opacity-60 font-mono text-slate-500 font-semibold">pavimentazione</span>
            <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-rose-400"></span>
          </button>
        </div>

        {/* AREA TRACING GENERAL TOOLS */}
        <div className="grid grid-cols-2 gap-2 mt-2">
          <button
            onClick={() => setSelectedTool("BIM_RilevaStanza")}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-[10.5px] font-bold tracking-tight transition duration-150 cursor-pointer ${
              selectedTool === "BIM_RilevaStanza"
                ? "bg-cyan-50 border-cyan-500 text-cyan-950 font-black shadow-inner"
                : "bg-white border-slate-250 text-slate-700 hover:bg-slate-100"
            }`}
          >
            <Sparkles size={13} className="text-cyan-600" />
            Rileva Locale
          </button>
          <button
            onClick={() => setSelectedTool("BIM_DisegnaStanza")}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-[10.5px] font-bold tracking-tight transition duration-150 cursor-pointer ${
              selectedTool === "BIM_DisegnaStanza"
                ? "bg-emerald-50 border-emerald-500 text-emerald-950 font-black shadow-inner"
                : "bg-white border-slate-250 text-slate-700 hover:bg-slate-100"
            }`}
          >
            <Square size={13} className="text-emerald-600" />
            Traccia Locale
          </button>
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
                <div className="bg-white/80 border p-1 rounded-md flex flex-col justify-center items-center text-center">
                  <span className="text-[9px] text-slate-400 font-mono">Volume Loc.</span>
                  <span className="text-[11px] font-bold text-slate-700">
                    {((getRoomAreaMq((selectedEntity as any).bimPoints || (selectedEntity as any).points)) * (selectedEntity.bimHeight || 2.70)).toFixed(1)} m³
                  </span>
                </div>
              </div>
            )}

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
              <span>Locale</span>
              <span>Sup. (mq)</span>
            </div>
            <div className="divide-y max-h-40 overflow-y-auto">
              {bimRooms.map((r) => {
                const pts = (r as any).bimPoints || (r as any).points;
                const area = getRoomAreaMq(pts);
                const isSelected = r.id === selectedId;
                return (
                  <div
                    key={r.id}
                    onClick={() => onSelect(r.id)}
                    className={`p-2 py-1.5 flex justify-between items-center text-xs cursor-pointer select-none transition-colors ${
                      isSelected ? "bg-cyan-50 text-cyan-950 font-bold" : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span className="truncate pr-4 max-w-[130px] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      {r.bimName || "Unlabeled"}
                    </span>
                    <span className="font-mono text-[10px]">
                      {area.toFixed(2)}
                    </span>
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
