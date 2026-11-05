import React, { useEffect, useRef } from "react";
import {
  Minus,
  Circle,
  Ruler,
  Scissors,
  Sparkles,
  Target,
  Undo,
  Redo,
  Maximize2,
  Building,
  Clipboard,
  X,
  Compass,
  Grid,
  Move
} from "lucide-react";

const ParallelIcon = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={className}
  >
    <path d="M5 20L15 4" />
    <path d="M9 20L19 4" />
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

interface TecnigrafoContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onSelectTool: (tool: string) => void;
  selectedTool: string | null;
  isSnapActive: boolean;
  onToggleSnap: () => void;
  orthoMode: boolean;
  onToggleOrtho: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomFit?: () => void;
  onSwitchWorkspace: (mode: 'tecnigrafo' | 'bim' | 'computo') => void;
  currentMode: 'tecnigrafo' | 'bim' | 'computo';
}

export const TecnigrafoContextMenu: React.FC<TecnigrafoContextMenuProps> = ({
  x,
  y,
  onClose,
  onSelectTool,
  selectedTool,
  isSnapActive,
  onToggleSnap,
  orthoMode,
  onToggleOrtho,
  onUndo,
  onRedo,
  onZoomFit,
  onSwitchWorkspace,
  currentMode
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key.toLowerCase() === "l") {
        onSelectTool("Line");
        onClose();
      } else if (e.key.toLowerCase() === "c") {
        onSelectTool("Circle");
        onClose();
      } else if (e.key.toLowerCase() === "o") {
        onSelectTool("Parallel");
        onClose();
      } else if (e.key.toLowerCase() === "d") {
        onSelectTool("Dimension");
        onClose();
      } else if (e.key.toLowerCase() === "r" || e.key.toLowerCase() === "h") {
        onSelectTool("Hatch");
        onClose();
      } else if (e.key.toLowerCase() === "m") {
        onSelectTool("Move");
        onClose();
      } else if (e.key.toLowerCase() === "t") {
        onSelectTool("Trim");
        onClose();
      } else if (e.key.toLowerCase() === "g") {
        onSelectTool("Gomma");
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose, onSelectTool]);

  // Adjust menu coordinates so it doesn't overflow viewport
  const menuWidth = 260;
  const menuHeight = 490;
  const adjustedX = Math.min(Math.max(10, x), Math.max(10, window.innerWidth - menuWidth - 16));
  const adjustedY = Math.min(Math.max(10, y), Math.max(10, window.innerHeight - menuHeight - 16));

  const coreTools = [
    {
      id: "Line",
      label: "Linea (Pennino)",
      shortcut: "BlocFn",
      icon: Minus,
      desc: "Tracciamento vettoriale con snap",
      color: "text-amber-400"
    },
    {
      id: "Circle",
      label: "Cerchio",
      shortcut: "C",
      icon: Circle,
      desc: "Centro e raggio o diametro",
      color: "text-amber-400"
    },
    {
      id: "Parallel",
      label: "Offset / Parallela",
      shortcut: "O",
      icon: ParallelIcon,
      desc: "Distanza o quota parallela",
      color: "text-amber-400"
    },
    {
      id: "Dimension",
      label: "Misura / Quota",
      shortcut: "D",
      icon: Ruler,
      desc: "Quotatura rapida allineata",
      color: "text-amber-400"
    },
    {
      id: "Hatch",
      label: "Retini / Riempimento",
      shortcut: "R",
      icon: Grid,
      desc: "Campitura automatica aree chiuse",
      color: "text-amber-400"
    }
  ];

  return (
    <div
      ref={menuRef}
      style={{ left: `${adjustedX}px`, top: `${adjustedY}px` }}
      className="fixed z-[100] w-[260px] bg-neutral-900/95 text-neutral-100 rounded-lg shadow-2xl border border-neutral-700/80 backdrop-blur-md p-1.5 font-sans select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-neutral-800 text-[11px] text-neutral-400 font-mono tracking-wider">
        <span className="flex items-center gap-1.5 text-amber-400 font-bold uppercase">
          <Compass size={13} className="text-amber-400" />
          Menu Tecnigrafo
        </span>
        <button
          onClick={onClose}
          className="text-neutral-500 hover:text-white p-0.5 rounded transition"
          title="Chiudi (ESC)"
        >
          <X size={12} />
        </button>
      </div>

      {/* Core Drawing Functions */}
      <div className="py-1">
        <div className="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider text-neutral-400">
          Funzioni Base 1° Livello
        </div>
        {coreTools.map((t) => {
          const Icon = t.icon;
          const isActive = selectedTool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                onSelectTool(t.id);
                onClose();
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors text-xs ${
                isActive
                  ? "bg-amber-500/20 text-amber-300 font-semibold border-l-2 border-amber-400"
                  : "hover:bg-neutral-800/80 text-neutral-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon size={15} className={t.color} />
                <span>{t.label}</span>
              </div>
              <span className="text-[10px] font-mono text-neutral-400 bg-neutral-800/80 px-1.5 py-0.5 rounded border border-neutral-700/60">
                {t.shortcut}
              </span>
            </button>
          );
        })}
      </div>

      <div className="h-[1px] bg-neutral-800 my-1" />

      {/* Editing & Corrections */}
      <div className="py-0.5">
        <button
          onClick={() => {
            onSelectTool("Move");
            onClose();
          }}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors text-xs ${
            selectedTool === "Move" ? "bg-amber-500/20 text-amber-300 font-semibold" : "hover:bg-neutral-800/80 text-neutral-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <Move size={14} className="text-emerald-400" />
            <span>Sposta Tutto</span>
          </div>
          <span className="text-[10px] font-mono text-neutral-400 bg-neutral-800/80 px-1.5 py-0.5 rounded border border-neutral-700/60">&lt;&gt; / M</span>
        </button>

        <button
          onClick={() => {
            onSelectTool("Trim");
            onClose();
          }}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors text-xs ${
            selectedTool === "Trim" ? "bg-amber-500/20 text-amber-300 font-semibold" : "hover:bg-neutral-800/80 text-neutral-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <Scissors size={14} className="text-cyan-400" />
            <span>Forbice (Taglia)</span>
          </div>
          <span className="text-[10px] font-mono text-neutral-400 bg-neutral-800/80 px-1.5 py-0.5 rounded border border-neutral-700/60">Ctrl / T</span>
        </button>

        <button
          onClick={() => {
            onSelectTool("Gomma");
            onClose();
          }}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors text-xs ${
            selectedTool === "Gomma" ? "bg-amber-500/20 text-amber-300 font-semibold" : "hover:bg-neutral-800/80 text-neutral-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-pink-400" />
            <span>Gomma da Cancellare</span>
          </div>
          <span className="text-[10px] font-mono text-neutral-400 bg-neutral-800/80 px-1.5 py-0.5 rounded border border-neutral-700/60">G</span>
        </button>
      </div>

      <div className="h-[1px] bg-neutral-800 my-1" />

      {/* Drafting Assists */}
      <div className="py-0.5">
        <button
          onClick={() => {
            onToggleSnap();
            onClose();
          }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left hover:bg-neutral-800/80 text-neutral-200 text-xs"
        >
          <div className="flex items-center gap-2">
            <Target size={14} className={isSnapActive ? "text-emerald-400" : "text-neutral-500"} />
            <span>Snap Magnetico</span>
          </div>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isSnapActive ? "bg-emerald-950 text-emerald-400 border border-emerald-700" : "bg-neutral-800 text-neutral-500"}`}>
            {isSnapActive ? "ATTIVO" : "OFF"}
          </span>
        </button>

        <button
          onClick={() => {
            onToggleOrtho();
            onClose();
          }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left hover:bg-neutral-800/80 text-neutral-200 text-xs"
        >
          <div className="flex items-center gap-2">
            <OrthoIcon size={14} />
            <span>Modalità Orto</span>
          </div>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${orthoMode ? "bg-amber-950 text-amber-400 border border-amber-700" : "bg-neutral-800 text-neutral-500"}`}>
            {orthoMode ? "ATTIVO" : "OFF"}
          </span>
        </button>

        {onZoomFit && (
          <button
            onClick={() => {
              onZoomFit();
              onClose();
            }}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left hover:bg-neutral-800/80 text-neutral-200 text-xs"
          >
            <div className="flex items-center gap-2">
              <Maximize2 size={14} className="text-blue-400" />
              <span>Centra Disegno (Zoom Tutto)</span>
            </div>
            <span className="text-[10px] font-mono text-neutral-400">Z</span>
          </button>
        )}
      </div>

      <div className="h-[1px] bg-neutral-800 my-1" />

      {/* Undo / Redo */}
      <div className="grid grid-cols-2 gap-1 py-0.5">
        <button
          onClick={() => {
            onUndo();
            onClose();
          }}
          className="flex items-center justify-center gap-1.5 py-1 px-2 rounded bg-neutral-800/70 hover:bg-neutral-700/80 text-neutral-300 text-[11px] transition"
        >
          <Undo size={12} />
          Annulla
        </button>
        <button
          onClick={() => {
            onRedo();
            onClose();
          }}
          className="flex items-center justify-center gap-1.5 py-1 px-2 rounded bg-neutral-800/70 hover:bg-neutral-700/80 text-neutral-300 text-[11px] transition"
        >
          <Redo size={12} />
          Ripristina
        </button>
      </div>

      <div className="h-[1px] bg-neutral-800 my-1" />

      {/* Fast Switch to BIM or Computo */}
      <div className="pt-1 flex flex-col gap-0.5">
        <button
          onClick={() => {
            onSwitchWorkspace("bim");
            onClose();
          }}
          className="w-full flex items-center gap-2 px-2.5 py-1 rounded text-left hover:bg-cyan-950/50 text-cyan-300 text-[11px] transition"
        >
          <Building size={13} className="text-cyan-400" />
          <span>Passa a BIM & 3D</span>
        </button>
        <button
          onClick={() => {
            onSwitchWorkspace("computo");
            onClose();
          }}
          className="w-full flex items-center gap-2 px-2.5 py-1 rounded text-left hover:bg-emerald-950/50 text-emerald-300 text-[11px] transition"
        >
          <Clipboard size={13} className="text-emerald-400" />
          <span>Passa a Computo Metrico</span>
        </button>
      </div>
    </div>
  );
};
