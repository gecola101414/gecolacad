import React, { useEffect, useState } from "react";
import {
  Compass,
  Building,
  Clipboard,
  Check,
  X,
  ArrowRight,
  Sparkles,
  Layers,
  Box,
  FileSpreadsheet,
  MousePointer2,
  Ruler,
  Minus,
  Circle
} from "lucide-react";

export type WorkspaceMode = 'tecnigrafo' | 'bim' | 'computo';

interface WorkspaceModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMode: WorkspaceMode;
  onSelectMode: (mode: WorkspaceMode) => void;
}

export const WorkspaceModeModal: React.FC<WorkspaceModeModalProps> = ({
  isOpen,
  onClose,
  currentMode,
  onSelectMode
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(() => {
    return localStorage.getItem("gecola_hide_workspace_modal") === "true";
  });

  const [hoveredMode, setHoveredMode] = useState<WorkspaceMode | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "1") {
        handleConfirm("tecnigrafo");
      } else if (e.key === "2") {
        handleConfirm("bim");
      } else if (e.key === "3") {
        handleConfirm("computo");
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, dontShowAgain]);

  if (!isOpen) return null;

  const handleConfirm = (mode: WorkspaceMode) => {
    localStorage.setItem("gecola_hide_workspace_modal", dontShowAgain ? "true" : "false");
    localStorage.setItem("gecola_workspace_mode", mode);
    onSelectMode(mode);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl max-w-4xl w-full text-white overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-neutral-800 flex items-center justify-between bg-gradient-to-r from-neutral-900 via-neutral-850 to-neutral-900">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-sans font-black tracking-widest text-lg">
                GECOLA <span className="text-amber-400">STUDIO</span>
              </span>
              <span className="text-[11px] font-mono uppercase bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded border border-neutral-700">
                Selezione Ambiente
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Scegli come iniziare a lavorare. Puoi passare da un ambiente all'altro in qualunque momento dalla barra superiore.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-2 rounded-lg hover:bg-neutral-800 transition"
            title="Chiudi (ESC)"
          >
            <X size={20} />
          </button>
        </div>

        {/* 3 Main Choice Cards */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 overflow-y-auto">
          
          {/* Card 1: TECNIGRAFO */}
          <div
            onClick={() => handleConfirm("tecnigrafo")}
            onMouseEnter={() => setHoveredMode("tecnigrafo")}
            onMouseLeave={() => setHoveredMode(null)}
            className={`cursor-pointer rounded-xl p-5 border transition-all duration-200 flex flex-col justify-between group relative overflow-hidden ${
              currentMode === "tecnigrafo"
                ? "bg-amber-950/30 border-amber-500 ring-2 ring-amber-500/30"
                : "bg-neutral-850 border-neutral-700/80 hover:border-amber-400/70 hover:bg-neutral-800/80"
            }`}
          >
            {/* Top Accent line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
            
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                  <Compass size={26} />
                </div>
                <span className="text-xs font-mono font-bold text-amber-400/90 bg-amber-500/10 px-2 py-1 rounded">
                  Premi [1]
                </span>
              </div>

              <div className="mb-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 block">
                  Disegno Veloce & Puro
                </span>
                <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
                  TECNIGRAFO CAD
                </h3>
              </div>

              <p className="text-xs text-neutral-300 leading-relaxed mb-4">
                L'essenza del disegno tecnico tradizionale. Interfaccia leggera, priva di distrazioni, focalizzata esclusivamente sulla massima velocità grafica.
              </p>

              <div className="bg-neutral-900/80 rounded-lg p-3 border border-neutral-800/80 space-y-2 mb-4">
                <div className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  4 Funzioni Cardine:
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px] text-neutral-400">
                  <span className="flex items-center gap-1">📏 Linea</span>
                  <span className="flex items-center gap-1">⭕ Cerchio</span>
                  <span className="flex items-center gap-1">📐 Offset</span>
                  <span className="flex items-center gap-1">📏 Misure</span>
                </div>
                <div className="text-[11px] text-amber-300/90 pt-1 border-t border-neutral-800 flex items-center gap-1">
                  🖱️ <span className="font-medium">Menu Rapido Tasto Destro</span>
                </div>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleConfirm("tecnigrafo");
              }}
              className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-amber-500/10"
            >
              <span>Accedi al Tecnigrafo</span>
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Card 2: BIM & 3D STUDIO */}
          <div
            onClick={() => handleConfirm("bim")}
            onMouseEnter={() => setHoveredMode("bim")}
            onMouseLeave={() => setHoveredMode(null)}
            className={`cursor-pointer rounded-xl p-5 border transition-all duration-200 flex flex-col justify-between group relative overflow-hidden ${
              currentMode === "bim"
                ? "bg-cyan-950/30 border-cyan-500 ring-2 ring-cyan-500/30"
                : "bg-neutral-850 border-neutral-700/80 hover:border-cyan-400/70 hover:bg-neutral-800/80"
            }`}
          >
            {/* Top Accent line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-cyan-500" />

            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                  <Building size={26} />
                </div>
                <span className="text-xs font-mono font-bold text-cyan-400/90 bg-cyan-500/10 px-2 py-1 rounded">
                  Premi [2]
                </span>
              </div>

              <div className="mb-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-400 block">
                  Architettura Avanzata
                </span>
                <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
                  BIM & 3D STUDIO
                </h3>
              </div>

              <p className="text-xs text-neutral-300 leading-relaxed mb-4">
                Progettazione parametrica per l'edilizia: murature con stratigrafie, aperture, quote quote Z, solai e modellazione 3D fotorealistica interattiva.
              </p>

              <div className="bg-neutral-900/80 rounded-lg p-3 border border-neutral-800/80 space-y-2 mb-4">
                <div className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  Caratteristiche BIM:
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px] text-neutral-400">
                  <span className="flex items-center gap-1">🧱 Pareti 3D</span>
                  <span className="flex items-center gap-1">🪟 Finestre/Porte</span>
                  <span className="flex items-center gap-1">🏢 Gestione Piani</span>
                  <span className="flex items-center gap-1">🧊 3D Viewer</span>
                </div>
                <div className="text-[11px] text-cyan-300/90 pt-1 border-t border-neutral-800 flex items-center gap-1">
                  📦 <span className="font-medium">Export IFC & Compatibilità CAD</span>
                </div>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleConfirm("bim");
              }}
              className="w-full py-2.5 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-cyan-600/15"
            >
              <span>Accedi a BIM & 3D</span>
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Card 3: COMPUTO METRICO */}
          <div
            onClick={() => handleConfirm("computo")}
            onMouseEnter={() => setHoveredMode("computo")}
            onMouseLeave={() => setHoveredMode(null)}
            className={`cursor-pointer rounded-xl p-5 border transition-all duration-200 flex flex-col justify-between group relative overflow-hidden ${
              currentMode === "computo"
                ? "bg-emerald-950/30 border-emerald-500 ring-2 ring-emerald-500/30"
                : "bg-neutral-850 border-neutral-700/80 hover:border-emerald-400/70 hover:bg-neutral-800/80"
            }`}
          >
            {/* Top Accent line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />

            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                  <Clipboard size={26} />
                </div>
                <span className="text-xs font-mono font-bold text-emerald-400/90 bg-emerald-500/10 px-2 py-1 rounded">
                  Premi [3]
                </span>
              </div>

              <div className="mb-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 block">
                  Economia & Capitolati
                </span>
                <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
                  COMPUTO METRICO
                </h3>
              </div>

              <p className="text-xs text-neutral-300 leading-relaxed mb-4">
                Estrazione automatica in tempo reale delle quantità dal disegno tecnico, calcolo dei costi con Prezzario Gecola e quadri economici.
              </p>

              <div className="bg-neutral-900/80 rounded-lg p-3 border border-neutral-800/80 space-y-2 mb-4">
                <div className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Strumenti di Stima:
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px] text-neutral-400">
                  <span className="flex items-center gap-1">📊 QTO Real-Time</span>
                  <span className="flex items-center gap-1">💶 Prezzari Estesi</span>
                  <span className="flex items-center gap-1">👷 Manodopera %</span>
                  <span className="flex items-center gap-1">📑 Stampa & Excel</span>
                </div>
                <div className="text-[11px] text-emerald-300/90 pt-1 border-t border-neutral-800 flex items-center gap-1">
                  ⚡ <span className="font-medium">Associazione diretta geometrie</span>
                </div>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleConfirm("computo");
              }}
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-600/15"
            >
              <span>Accedi al Computo</span>
              <ArrowRight size={14} />
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
          <label className="flex items-center gap-2 cursor-pointer hover:text-neutral-200 select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => {
                setDontShowAgain(e.target.checked);
                localStorage.setItem("gecola_hide_workspace_modal", e.target.checked ? "true" : "false");
              }}
              className="rounded bg-neutral-800 border-neutral-700 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <span>Non mostrare all'avvio (puoi sempre cambiare ambiente dalla barra in alto)</span>
          </label>

          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-neutral-500">
              Ambiente attuale: <strong className="text-white uppercase">{currentMode}</strong>
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};
