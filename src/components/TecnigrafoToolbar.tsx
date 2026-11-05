import React from "react";
import {
  Minus,
  Circle,
  Ruler,
  MousePointer2,
  Sparkles,
  Scissors,
  Target,
  Pen,
  Undo,
  Redo,
  Maximize2,
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

interface TecnigrafoToolbarProps {
  selectedTool: string | null;
  onSelectTool: (tool: string) => void;
  isOffsetAidActive?: boolean;
  isSnapActive: boolean;
  onToggleSnap: () => void;
  orthoMode: boolean;
  onToggleOrtho: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomFit?: () => void;
  defaultLineStyle: {
    color: string;
    lineWidth: number;
    dashed: boolean;
    mode: 'ink' | 'pencil' | 'CAD';
  };
  onChangeLineStyle?: (style: Partial<{
    color: string;
    lineWidth: number;
    dashed: boolean;
    mode: 'ink' | 'pencil' | 'CAD';
  }>) => void;
  onOpenPenne?: () => void;
}

export const TecnigrafoToolbar: React.FC<TecnigrafoToolbarProps> = ({
  selectedTool,
  onSelectTool,
  isOffsetAidActive = false,
  isSnapActive,
  onToggleSnap,
  orthoMode,
  onToggleOrtho,
  onUndo,
  onRedo,
  onZoomFit,
  defaultLineStyle,
  onChangeLineStyle,
  onOpenPenne
}) => {
  const tools = [
    {
      id: "Select",
      label: "Seleziona",
      shortcut: "Esc",
      icon: MousePointer2,
      isCore: false
    },
    {
      id: "Line",
      label: "Linea",
      shortcut: "BlocFn",
      icon: Minus,
      isCore: true
    },
    {
      id: "Circle",
      label: "Cerchio",
      shortcut: "C",
      icon: Circle,
      isCore: true
    },
    {
      id: "Parallel",
      label: "Offset",
      shortcut: "O",
      icon: ParallelIcon,
      isCore: true
    },
    {
      id: "Dimension",
      label: "Misure",
      shortcut: "D",
      icon: Ruler,
      isCore: true
    },
    {
      id: "Hatch",
      label: "Retini",
      shortcut: "R",
      icon: Grid,
      isCore: true
    },
    {
      id: "Move",
      label: "Sposta",
      shortcut: "<>",
      icon: Move,
      isCore: true
    },
    {
      id: "Trim",
      label: "Forbice",
      shortcut: "Ctrl",
      icon: Scissors,
      isCore: true
    },
    {
      id: "Gomma",
      label: "Gomma",
      shortcut: "G",
      icon: Sparkles,
      isCore: false
    }
  ];

  return (
    <div className="flex items-center gap-1.5 bg-neutral-900/90 text-neutral-100 px-3 py-1.5 rounded-xl shadow-xl border border-neutral-700/80 backdrop-blur-md select-none">
      
      {/* Brand indicator */}
      <div className="flex items-center gap-1.5 pr-2.5 border-r border-neutral-700/70 text-amber-400">
        <Compass size={18} className="text-amber-400 animate-pulse" />
        <span className="text-[11px] font-black uppercase tracking-wider hidden sm:inline">
          Tecnigrafo
        </span>
      </div>

      {/* Core Drawing & Editing Tools */}
      <div className="flex items-center gap-1">
        {tools.map((t) => {
          const Icon = t.icon;
          const isActive = selectedTool === t.id;
          const isOffsetAidButtonActive = t.id === "Parallel" && isOffsetAidActive && !isActive;
          return (
            <button
              key={t.id}
              onClick={() => onSelectTool(t.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all relative ${
                isActive
                  ? "bg-amber-500 text-neutral-950 font-bold shadow-md shadow-amber-500/20 scale-105"
                  : isOffsetAidButtonActive
                    ? "bg-emerald-950/90 text-emerald-400 border border-emerald-500/60 font-bold"
                    : t.isCore
                      ? "hover:bg-neutral-800 text-neutral-100 hover:text-amber-300 font-medium"
                      : "hover:bg-neutral-800 text-neutral-300 font-normal"
              }`}
              title={`${t.label} (Scorciatoia: ${t.shortcut})`}
            >
              <Icon size={15} />
              <span className="hidden md:inline">{t.label}</span>
              {t.isCore && (
                <span className={`text-[9px] font-mono px-1 rounded ${
                  isActive ? "bg-amber-600/40 text-neutral-900" : isOffsetAidButtonActive ? "bg-emerald-900/80 text-emerald-300" : "bg-neutral-800 text-amber-400/80"
                }`}>
                  {t.shortcut}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Separator */}
      <div className="h-5 w-[1px] bg-neutral-700/80 mx-1" />

      {/* Drafting toggles: SNAP and ORTO */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleSnap}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition ${
            isSnapActive
              ? "bg-emerald-950/80 text-emerald-400 border border-emerald-600/50 font-semibold"
              : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          }`}
          title="Snap Magnetico (Punti notevoli e intersezioni)"
        >
          <Target size={13} />
          <span className="text-[10px] uppercase tracking-wider font-bold">Snap</span>
        </button>

        <button
          onClick={onToggleOrtho}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition ${
            orthoMode
              ? "bg-amber-950/80 text-amber-400 border border-amber-600/50 font-semibold"
              : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          }`}
          title="Orto 90° (Blocca angoli ortogonali)"
        >
          <OrthoIcon size={13} />
          <span className="text-[10px] uppercase tracking-wider font-bold">Orto</span>
        </button>
      </div>

      {/* Separator */}
      <div className="h-5 w-[1px] bg-neutral-700/80 mx-1" />

      {/* Traditional & CAD Pen Switcher (Matita | China | CAD) */}
      <div className="flex items-center gap-1 bg-neutral-950/90 p-0.5 rounded-lg border border-neutral-700/80">
        <button
          onClick={() => {
            onChangeLineStyle?.({
              mode: 'pencil',
              color: defaultLineStyle.mode === 'pencil'
                ? (defaultLineStyle.color === '#bbbbbb' ? '#444444' : defaultLineStyle.color === '#444444' ? '#111111' : '#bbbbbb')
                : '#444444',
              lineWidth: defaultLineStyle.mode === 'pencil'
                ? (defaultLineStyle.color === '#bbbbbb' ? 2 : defaultLineStyle.color === '#444444' ? 3 : 1)
                : 2,
              dashed: false
            });
          }}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
            defaultLineStyle.mode === 'pencil'
              ? "bg-amber-500/25 text-amber-300 border border-amber-400/60 shadow-sm"
              : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          }`}
          title="Matita Grafite Tradizionale (Clicca per cambiare mina: 2H / HB / 2B)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <path d="M3 21L5.5 14.5L16.5 3.5C17.3 2.7 18.7 2.7 19.5 3.5L20.5 4.5C21.3 5.3 21.3 6.7 20.5 7.5L9.5 18.5L3 21Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
            <path d="M3 21L6.5 19.5L4.5 17.5L3 21Z" fill="currentColor"/>
          </svg>
          <span>Matita</span>
          {defaultLineStyle.mode === 'pencil' && (
            <span className="text-[9px] font-mono bg-amber-500 text-neutral-950 px-1 rounded font-black">
              {defaultLineStyle.color === '#bbbbbb' ? '2H' : defaultLineStyle.color === '#444444' ? 'HB' : '2B'}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            const widths = [0.25, 0.5, 1, 2];
            const nextWidth = defaultLineStyle.mode === 'ink'
              ? widths[(widths.indexOf(defaultLineStyle.lineWidth) + 1) % widths.length]
              : 0.5;
            onChangeLineStyle?.({
              mode: 'ink',
              color: '#000000',
              lineWidth: nextWidth,
              dashed: false
            });
          }}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
            defaultLineStyle.mode === 'ink'
              ? "bg-rose-500/25 text-rose-200 border border-rose-500/60 shadow-sm"
              : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          }`}
          title="Pennino a China Rapidograph / Rotring (Clicca per cambiare calibro: 0.25 / 0.5 / 1.0 / 2.0 mm)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <path d="M3 21L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M6 18L9 13L11 15L6 18Z" fill="currentColor"/>
            <path d="M9 13L17 5L19 7L11 15L9 13Z" stroke="#ef4444" strokeWidth="2"/>
          </svg>
          <span>China</span>
          {defaultLineStyle.mode === 'ink' && (
            <span className="text-[9px] font-mono bg-rose-600 text-white px-1 rounded font-black">
              {defaultLineStyle.lineWidth}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            const widths = [0.25, 0.5, 1, 2];
            const nextWidth = defaultLineStyle.mode === 'CAD'
              ? widths[(widths.indexOf(defaultLineStyle.lineWidth) + 1) % widths.length]
              : 1;
            onChangeLineStyle?.({
              mode: 'CAD',
              color: defaultLineStyle.color === '#bbbbbb' || defaultLineStyle.color === '#444444' ? '#000000' : defaultLineStyle.color,
              lineWidth: nextWidth,
              dashed: false
            });
          }}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
            defaultLineStyle.mode === 'CAD'
              ? "bg-cyan-500/25 text-cyan-300 border border-cyan-400/60 shadow-sm"
              : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          }`}
          title="Linea Pulita Vettoriale CAD (Clicca per cambiare spessore)"
        >
          <Pen size={11} />
          <span>CAD</span>
          {defaultLineStyle.mode === 'CAD' && (
            <span className="text-[9px] font-mono bg-cyan-500 text-neutral-950 px-1 rounded font-black">
              {defaultLineStyle.lineWidth}
            </span>
          )}
        </button>

        {onOpenPenne && (
          <button
            onClick={onOpenPenne}
            className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-neutral-800 transition text-neutral-300 border-l border-neutral-800"
            title="Apri Pannello Completo Penne, Colori e Spessori"
          >
            <div
              className="w-3 h-3 rounded-full border border-neutral-500"
              style={{ backgroundColor: defaultLineStyle.color }}
            />
          </button>
        )}
      </div>

      {/* Undo / Redo / Zoom */}
      <div className="flex items-center gap-0.5 border-l border-neutral-700/80 pl-1.5">
        <button
          onClick={onUndo}
          className="p-1.5 hover:bg-neutral-800 rounded text-neutral-300 hover:text-white transition"
          title="Annulla (Ctrl+Z)"
        >
          <Undo size={14} />
        </button>
        <button
          onClick={onRedo}
          className="p-1.5 hover:bg-neutral-800 rounded text-neutral-300 hover:text-white transition"
          title="Ripristina (Ctrl+Y)"
        >
          <Redo size={14} />
        </button>
        {onZoomFit && (
          <button
            onClick={onZoomFit}
            className="p-1.5 hover:bg-neutral-800 rounded text-neutral-300 hover:text-white transition"
            title="Centra Disegno / Zoom Tutto"
          >
            <Maximize2 size={14} />
          </button>
        )}
      </div>

      {/* Right-click hint */}
      <div className="hidden lg:flex items-center gap-1 pl-2 text-[10px] text-amber-400/90 font-mono border-l border-neutral-700/80">
        <span>🖱️ Tasto dx = Menu</span>
      </div>

    </div>
  );
};
