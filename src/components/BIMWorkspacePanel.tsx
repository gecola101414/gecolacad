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
  Copy as CopyIcon
} from "lucide-react";

interface BIMWorkspacePanelProps {
  entities: Entity[];
  selectedTool: string | null;
  setSelectedTool: (tool: string) => void;
  setEntities: React.Dispatch<React.SetStateAction<Entity[]>> | ((updater: (prev: Entity[]) => Entity[]) => void);
  onCommitHistory?: (entities: Entity[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  cadCanvasRef?: React.RefObject<any>;
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
  cadCanvasRef
}: BIMWorkspacePanelProps) {
  const [customRoomName, setCustomRoomName] = useState<string>("");

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
          
          // If width is updated for a door/window, update its line geometry too
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

  // Export report as CSV file containing Bill of Quantities
  const handleExportTextReport = () => {
    let report = `========================================================\n`;
    report += `COMPUTO METRICO BIM ESTIMATIVO & ANALISI SUPERFICI      \n`;
    report += `Generato automaticamente da GE-COLA CAD BIM AI          \n`;
    report += `Data di generazione: ${new Date().toLocaleDateString()}  \n`;
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
    report += `Superficie Calpestabile Totale: ${totalRoomArea.toFixed(2)} mq\n`;
    report += `Volume Svuotamento Totale: ${(bimRooms.reduce((acc, r) => acc + (getRoomAreaMq((r as any).bimPoints || (r as any).points) * (r.bimHeight || 2.70)), 0)).toFixed(1)} mc\n\n`;

    report += `2. RILIEVO INFISSI & ACCESSIBILITA'\n`;
    report += `--------------------------------------------------------\n`;
    report += `Tipo\tNome Codice\tLarghezza (cm)\tAltezza (cm)\tSuperficie Luce (mq)\n`;
    bimDoors.forEach((d) => {
      report += `PORTA\t${d.bimName || 'Porta'}\t${(d as any).bimWidth || 80}\t---\t---\n`;
    });
    bimWindows.forEach((w) => {
      const area = (((w as any).bimWidth || 120) * ((w as any).bimWindowHeight || 140)) / 10000;
      report += `FINESTRA\t${w.bimName || 'Finestra'}\t${(w as any).bimWidth || 120}\t${(w as any).bimWindowHeight || 140}\t${area.toFixed(2)}\n`;
    });
    report += `--------------------------------------------------------\n\n`;

    report += `3. COMPUTO METRICO INTELLIGENTE INTELLIGENTE DETRATTO\n`;
    report += `--------------------------------------------------------\n`;
    report += `Voce d'Opera:\n`;
    report += `- Fornitura e posa di BATTISCOPA in legno/ceramica (Perimetri dedotti vani porte):\n`;
    report += `  Sviluppo Metrico Netto: ${intelligentBaseboardM.toFixed(2)} m\n`;
    report += `- Superficie Illuminante Netta Complessiva (Rapporto Aeroilluminante):\n`;
    report += `  Superficie finestre totale: ${totalWindowsLightAreaMq.toFixed(2)} mq\n`;
    const aerRatio = totalWindowsLightAreaMq > 0 && totalRoomArea > 0 ? (totalWindowsLightAreaMq / totalRoomArea) : 0;
    report += `  Rapporto Illuminante Calcolato (A. finestre / A. stanze): 1 / ${(aerRatio > 0 ? (1/aerRatio).toFixed(1) : '∞')}\n`;
    report += `  Verifica Regolamento Edilizio (Richiesto 1/8 = 0.125): ${aerRatio >= 0.125 ? 'IDONEO (Soddisfatto ✅)' : 'NON IDONEO ⚠️ (Verificare superfici illuminanti)'}\n`;
    report += `========================================================\n`;

    // Download text file
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Computo_Metrico_GECOLA_BIM_${new Date().getFullYear()}.txt`;
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
      <div className="bg-gradient-to-br from-cyan-900 to-slate-900 text-white p-4 rounded-xl shadow-lg border border-cyan-500/30">
        <div className="flex items-center gap-2 mb-2">
          <Building className="text-cyan-400 animate-pulse" size={20} />
          <h4 className="font-bold text-sm tracking-wide">Automazione BIM / I.A.</h4>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-300">
          Proietta il disegno CAD verso il Building Information Modeling. Rileva aree, calcola battiscopa intelligenti, infissi e genera esportazioni metriche automatiche.
        </p>
      </div>

      {/* Scansione Automatica Solver */}
      <div className="bg-cyan-50 border border-cyan-200 p-4 rounded-xl shadow-sm space-y-2.5">
        <span className="text-[10px] font-black uppercase tracking-wider text-cyan-800 block font-mono">
          Scansione Automatica ⚡
        </span>
        <p className="text-[10.5px] leading-relaxed text-slate-600">
          Rileva all-in-one l'intera planimetria per identificare automaticamente <strong>tutte le stanze</strong>, le <strong>porte</strong> e le <strong>finestre</strong> basandosi esclusivamente sul disegno geometrico!
        </p>
        <button
          onClick={() => {
            cadCanvasRef?.current?.autoScanBIM();
          }}
          className="w-full bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-700 hover:to-cyan-600 text-white font-bold py-2.5 px-4 rounded-lg text-xs flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
        >
          <Sparkles size={14} className="animate-pulse" />
          Avvia Scansione Geometrica 🤖
        </button>
      </div>

      {/* 1. BIM DRAFTING TOOLS */}
      <div className="space-y-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block border-b pb-1 font-mono">
          Strumenti di Rilievo BIM
        </span>
        <div className="grid grid-cols-2 gap-2">
          {/* AUTO AREA DETECTION */}
          <button
            onClick={() => setSelectedTool("BIM_RilevaStanza")}
            className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all ${
              selectedTool === "BIM_RilevaStanza"
                ? "bg-cyan-50 border-cyan-500 text-cyan-950 ring-2 ring-cyan-200 font-bold"
                : "bg-white border-neutral-200 hover:bg-neutral-50 text-neutral-700"
            }`}
          >
            <Sparkles size={18} className="text-cyan-600 mb-1" />
            <span className="text-[10px] font-bold">Rileva Stanza</span>
            <span className="text-[8px] opacity-60">Auto Area</span>
          </button>

          {/* MANUAL ROOM DRAWER */}
          <button
            onClick={() => setSelectedTool("BIM_DisegnaStanza")}
            className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all ${
              selectedTool === "BIM_DisegnaStanza"
                ? "bg-emerald-50 border-emerald-500 text-emerald-950 ring-2 ring-emerald-200 font-bold"
                : "bg-white border-neutral-200 hover:bg-neutral-50 text-neutral-700"
            }`}
          >
            <Square size={18} className="text-emerald-600 mb-1" />
            <span className="text-[10px] font-bold">Disegna Stanza</span>
            <span className="text-[8px] opacity-60">Traccia Punti</span>
          </button>

          {/* BIM DOOR */}
          <button
            onClick={() => setSelectedTool("BIM_Porta")}
            className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all ${
              selectedTool === "BIM_Porta"
                ? "bg-rose-50 border-rose-400 text-rose-950 ring-2 ring-rose-100 font-bold"
                : "bg-white border-neutral-200 hover:bg-neutral-50 text-neutral-700"
            }`}
          >
            <div className="w-5 h-5 flex items-center justify-center border-2 border-dashed border-rose-500 rounded mb-1 text-rose-500 font-black text-[9px]">
              D
            </div>
            <span className="text-[10px] font-bold">Porta BIM</span>
            <span className="text-[8px] opacity-60">P1 → P2 width</span>
          </button>

          {/* BIM WINDOW */}
          <button
            onClick={() => setSelectedTool("BIM_Finestra")}
            className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all ${
              selectedTool === "BIM_Finestra"
                ? "bg-blue-50 border-blue-400 text-blue-950 ring-2 ring-blue-100 font-bold"
                : "bg-white border-neutral-200 hover:bg-neutral-50 text-neutral-700"
            }`}
          >
            <div className="w-5 h-5 flex items-center justify-center border-2 border-double border-blue-500 rounded mb-1 text-blue-500 font-black text-[9px]">
              W
            </div>
            <span className="text-[10px] font-bold">Finestra BIM</span>
            <span className="text-[8px] opacity-60">P1 → P2 width</span>
          </button>
        </div>
        {selectedTool?.startsWith("BIM_") && (
          <div className="p-2 bg-slate-50 border rounded text-[10px] text-slate-600 leading-normal animate-fade-in">
            {selectedTool === "BIM_RilevaStanza" && (
              <span>💡 <strong>AUTOMATICO:</strong> Clicca una volta all'interno di un'area chiusa per individuarne il perimetro e calcolare la superficie calpestabile automaticamente.</span>
            )}
            {selectedTool === "BIM_DisegnaStanza" && (
              <span>✍️ <strong>CORNER BY CORNER:</strong> Clicca i vertici sul disegno. Per chiudere il locale, clicca nuovamente vicino al punto iniziale. Premi <strong>ESC</strong> per annullare.</span>
            )}
            {selectedTool === "BIM_Porta" && (
              <span>🚪 <strong>PORTA:</strong> Clicca il primo stipite (P1) e poi il secondo stipite (P2) per inserire il vano e calcolare la spalla di passaggio.</span>
            )}
            {selectedTool === "BIM_Finestra" && (
              <span>🪟 <strong>FINESTRA:</strong> Clicca i due estremi della bucatura (P1 → P2) per misurare la larghezza e impostare l'infisso luminoso.</span>
            )}
          </div>
        )}
      </div>

      {/* 2. INSPECTOR FOR SELECTED BIM OBJECT */}
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
              className="text-rose-600 hover:text-rose-800 p-1 hover:bg-rose-50 rounded transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>

          <div className="space-y-2 text-xs">
            {/* NAME SELECT / INPUT */}
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

            {/* BIM HEIGHT (Rooms) */}
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

            {/* BIM WIDTH (Doors / Windows) */}
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
                    className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-[10px] font-bold py-1.5 rounded-lg shadow-sm transition-all active:scale-[0.98]"
                  >
                    <Repeat size={12} className="text-cyan-600" />
                    Inverti Swing
                  </button>
                  <button
                    onClick={() => {
                        // Rotation 90 degrees
                        const start = (selectedEntity as any).start;
                        const end = (selectedEntity as any).end;
                        if (start && end) {
                            const dx = end.x - start.x;
                            const dy = end.y - start.y;
                            // Rotate 90 CW: (x, y) -> (-y, x)
                            const newEnd = {
                                x: start.x - dy,
                                y: start.y + dx
                            };
                            updateSelectedBIMField("end", newEnd);
                        }
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-[10px] font-bold py-1.5 rounded-lg shadow-sm transition-all active:scale-[0.98]"
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
                        // Visual feedback
                        const btn = (document.activeElement as HTMLElement);
                        if (btn) {
                            const original = btn.innerHTML;
                            btn.innerHTML = `<span class="flex items-center gap-1 text-emerald-600">Parametri Copiati!</span>`;
                            setTimeout(() => btn.innerHTML = original, 1500);
                        }
                    }}
                    className="w-full flex items-center justify-center gap-1.5 bg-cyan-600 text-white hover:bg-cyan-700 text-[10px] font-bold py-2 rounded-lg shadow-md transition-all active:scale-[0.98]"
                >
                    <CopyIcon size={12} />
                    Copia parametri come oggetto
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* 3. COMPUTO METRICO SUMMARY BOX */}
      <div className="space-y-3">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block border-b pb-1 font-mono">
          Rilievo Quantità & Computo
        </span>

        {/* BIM STATS GRID */}
        <div className="grid grid-cols-2 gap-2">
          {/* FLOOR AREA */}
          <div className="bg-slate-50 border border-slate-250 p-3 rounded-lg flex flex-col justify-between">
            <span className="text-[8.5px] uppercase tracking-wider text-slate-400 font-bold block mb-1">
              Area Netta Stanze
            </span>
            <div>
              <span className="text-lg font-black text-slate-800">{totalRoomArea.toFixed(2)}</span>
              <span className="text-[10px] font-semibold text-slate-600 pl-1">mq</span>
            </div>
            <span className="text-[8px] text-slate-400 mt-1">
              Locali tracciati: {bimRooms.length}
            </span>
          </div>

          {/* BATTISCOPA INTELLIGENTE */}
          <div className="bg-cyan-50/40 border border-cyan-200/50 p-3 rounded-lg flex flex-col justify-between">
            <span className="text-[8.5px] uppercase tracking-wider text-cyan-800 font-bold block mb-1">
              Battiscopa Netto 🚪
            </span>
            <div>
              <span className="text-lg font-black text-cyan-950">{intelligentBaseboardM.toFixed(1)}</span>
              <span className="text-[10px] font-semibold text-cyan-800 pl-1">m</span>
            </div>
            <span className="text-[7.5px] text-cyan-600 mt-1 leading-none italic font-medium block">
              Detratte le porte (-{totalDoorsWidthM.toFixed(1)}m)
            </span>
          </div>
        </div>

        {/* DETAILED BIM LOCALI TABLE */}
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
            Nessuna stanza rilevata. Utilizza "Rileva Stanza" o "Disegna Stanza" per iniziare!
          </div>
        )}

        {/* RAPPORTI ILLUMINANTI COMPLIANCE BANNER */}
        {bimRooms.length > 0 && (
          <div className="p-3 bg-neutral-50 rounded-lg border text-[10.5px] space-y-1.5 leading-normal">
            <div className="flex justify-between items-center text-slate-600">
              <span className="font-semibold text-slate-500">Superficie finestre totale:</span>
              <span className="font-mono text-[10.5px] font-bold text-slate-700">{totalWindowsLightAreaMq.toFixed(2)} mq</span>
            </div>
            <div className="flex justify-between items-center text-slate-600">
              <span className="font-semibold text-slate-500">Rapporto Aeroilluminante (R.A.):</span>
              <span className="font-mono text-[10.5px] font-bold text-slate-705">
                {totalWindowsLightAreaMq > 0 && totalRoomArea > 0 
                  ? `1 / ${(totalRoomArea / totalWindowsLightAreaMq).toFixed(1)}` 
                  : "Nessun infisso"}
              </span>
            </div>
            
            {/* Legal compliance check */}
            {totalRoomArea > 0 && (
              <div className="pt-1 border-t flex items-center gap-1.5 text-[9.5px]">
                {totalWindowsLightAreaMq / totalRoomArea >= 0.125 ? (
                  <div className="text-emerald-700 font-bold flex items-center gap-1">
                    <Check size={12} className="text-emerald-500" />
                    R.A. conforme a normativa italiana (≥ 1/8) ✅
                  </div>
                ) : (
                  <div className="text-amber-800 font-bold leading-tight">
                    ⚠️ R.A. inferiore a 1/8. Aggiungi più finestre per verificare i requisiti igienico-sanitari.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* REPORT GENERATION BUTTON */}
        <button
          onClick={handleExportTextReport}
          disabled={entities.filter(e => e.isBIM).length === 0}
          className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed text-white font-bold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98]"
        >
          <FileText size={14} />
          Esporta Computo Medico
        </button>
      </div>
    </div>
  );
}
