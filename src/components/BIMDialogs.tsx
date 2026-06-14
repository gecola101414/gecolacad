import React, { useState, useRef, useEffect } from 'react';
import { 
  Building, 
  X, 
  Layers, 
  Check, 
  Home, 
  Sparkles, 
  ShieldAlert, 
  Zap, 
  Droplet, 
  Grid,
  ChevronRight,
  Maximize2
} from "lucide-react";
import { Point, Entity } from '../types';
import { TEMPLATES, Template } from '../data/templates';
import { TemplatePreview } from './TemplatePreview';

// --- DRAGGABLE WRAPPER HELPERS ---
function useDraggableDialog(isOpen: boolean, defaultPos: { x: number; y: number }) {
  const [position, setPosition] = useState(defaultPos);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (isOpen) {
      // Position appropriately on screen
      const w = window.innerWidth;
      setPosition({
        x: Math.max(20, Math.floor(w - 400)), // Right side of the viewport
        y: 120
      });
    }
  }, [isOpen]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only left-click
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select')) return;

    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
    target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  return { position, handlePointerDown, handlePointerMove, handlePointerUp };
}

// 1. --- MURI (WALLS) DIALOG ---
interface MuriDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lastWallThickness: number;
  setBIMWallThickness: (t: number) => void;
  onActivateWallDrawing: (thickness: number) => void;
}
export const MuriDialog: React.FC<MuriDialogProps> = ({
  isOpen,
  onClose,
  lastWallThickness,
  setBIMWallThickness,
  onActivateWallDrawing
}) => {
  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useDraggableDialog(isOpen, { x: 300, y: 120 });
  const [thickness, setThickness] = useState<number>(lastWallThickness || 15);
  const [wallHeight, setWallHeight] = useState<number>(270);
  const [wallStyle, setWallStyle] = useState<'standard' | 'double' | 'filled'>('standard');
  const [insulation, setInsulation] = useState<'none' | 'cappotto' | 'cavity'>('none');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBIMWallThickness(thickness);
    onActivateWallDrawing(thickness);
  };

  const presetSpessori = [10, 15, 30, 40];

  return (
    <div 
      className="fixed z-[100] select-none animate-fade-in bg-slate-950 border border-slate-800 p-5 rounded-xl shadow-2xl max-w-sm w-full text-white"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div 
        className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <h3 className="text-xs font-black uppercase text-cyan-400 tracking-wider font-mono flex items-center gap-2 pointer-events-none">
          <Building size={14} />
          <span>🧱 Sottomenu Muri BIM</span>
        </h3>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-white font-mono text-xs font-bold leading-none p-1">✕</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">
            Spessore del Muro (cm)
          </label>
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {presetSpessori.map(sp => (
              <button
                type="button"
                key={sp}
                onClick={() => setThickness(sp)}
                className={`py-1.5 px-2 rounded font-mono text-xs font-bold border transition ${
                  thickness === sp ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                {sp} cm
              </button>
            ))}
          </div>
          <input
            type="number"
            min="1"
            max="150"
            value={thickness}
            onChange={(e) => setThickness(parseInt(e.target.value) || 15)}
            className="w-full bg-slate-900 border border-slate-800 text-white rounded p-2 text-xs font-mono font-semibold focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1 mt-1">Altezza (cm)</label>
            <input
              type="number"
              min="100"
              max="600"
              value={wallHeight}
              onChange={(e) => setWallHeight(parseInt(e.target.value) || 270)}
              className="w-full bg-slate-900 border border-slate-800 text-white p-1.5 rounded text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1 mt-1">Stratigrafia</label>
            <select
              value={insulation}
              onChange={(e: any) => setInsulation(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-white p-1.5 rounded text-xs focus:outline-none focus:border-cyan-400"
            >
              <option value="none">Standard</option>
              <option value="cappotto">Cappotto (12cm)</option>
              <option value="cavity">Intercapedine</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Stile Disegno</label>
          <div className="grid grid-cols-3 gap-2">
            {(['standard', 'double', 'filled'] as any[]).map(st => (
              <button
                type="button"
                key={st}
                onClick={() => setWallStyle(st)}
                className={`text-[9.5px] py-1.5 rounded border transition-colors ${
                  wallStyle === st ? 'bg-cyan-600/10 border-cyan-500 text-cyan-300 font-bold' : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                {st === 'standard' ? 'Standard' : st === 'double' ? 'Doppia riga' : 'Riempito'}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-slate-400 p-2.5 bg-slate-900 rounded border border-slate-900 leading-normal">
          💡 I muri definiti verranno mappati sul Layer <strong>BIM_Muri</strong> e disegnati in parallelo con asse centrale.
        </p>

        <button
          type="submit"
          className="w-full bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black py-2.5 rounded-lg text-xs tracking-wider transition-all shadow-md cursor-pointer"
        >
          AVVIA DISEGNO MURO ✍️
        </button>
      </form>
    </div>
  );
};


// 2. --- PORTE (DOORS) DIALOG ---
interface PorteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lastDoorWidth: number;
  lastDoorHeight: number;
  onConfirmDoor: (width: number, height: number, type: string, flip: boolean) => void;
}
export const PorteDialog: React.FC<PorteDialogProps> = ({
  isOpen,
  onClose,
  lastDoorWidth,
  lastDoorHeight,
  onConfirmDoor
}) => {
  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useDraggableDialog(isOpen, { x: 300, y: 120 });
  const [width, setWidth] = useState<number>(lastDoorWidth || 80);
  const [height, setHeight] = useState<number>(lastDoorHeight || 210);
  const [doorType, setDoorType] = useState<string>('singola');
  const [flip, setFlip] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmDoor(width, height, doorType, flip);
  };

  const presetMisure = [70, 80, 90, 100, 120];

  return (
    <div 
      className="fixed z-[100] bg-slate-950 border border-slate-800 p-5 rounded-xl shadow-2xl max-w-sm w-full text-white"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div 
        className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <h3 className="text-xs font-black uppercase text-rose-400 tracking-wider font-mono flex items-center gap-2 pointer-events-none">
          <ChevronRight size={14} className="text-rose-500 rotate-90" />
          <span>🚪 Sottomenu Porte BIM</span>
        </h3>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-white font-mono text-xs font-bold leading-none p-1">✕</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Larghezza Porta (cm)</label>
          <div className="grid grid-cols-5 gap-1.5 mb-2">
            {presetMisure.map(w => (
              <button
                type="button"
                key={w}
                onClick={() => setWidth(w)}
                className={`py-1 px-1.5 rounded font-mono text-[10px] font-bold border transition ${
                  width === w ? 'bg-rose-500/10 border-rose-500 text-rose-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                {w}cm
              </button>
            ))}
          </div>
          <input
            type="number"
            min="30"
            max="300"
            value={width}
            onChange={(e) => setWidth(parseInt(e.target.value) || 80)}
            className="w-full bg-slate-900 border border-slate-800 text-white rounded p-2 text-xs font-mono focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Altezza (cm)</label>
            <input
              type="number"
              min="100"
              max="300"
              value={height}
              onChange={(e) => setHeight(parseInt(e.target.value) || 210)}
              className="w-full bg-slate-900 border border-slate-800 text-white p-1.5 rounded text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Tipologia</label>
            <select
              value={doorType}
              onChange={(e: any) => setDoorType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-white p-1.5 rounded text-xs"
            >
              <option value="singola">Battente Singola</option>
              <option value="doppia">Doppio Battente</option>
              <option value="scorrevole">Scorrevole (Scrigno)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 py-1 bg-slate-900/50 p-2 rounded border border-slate-850">
          <input
            type="checkbox"
            id="door-flip"
            checked={flip}
            onChange={(e) => setFlip(e.target.checked)}
            className="cursor-pointer"
          />
          <label htmlFor="door-flip" className="text-[10px] text-slate-300 font-bold select-none cursor-pointer">
            Inverti direzione specchio / swing (sinistra)
          </label>
        </div>

        <button
          type="submit"
          className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black py-2.5 rounded-lg text-xs tracking-wider transition shadow-md cursor-pointer"
        >
          ATTIVA PORTA IN LOCAZIONE 🚪
        </button>
      </form>
    </div>
  );
};


// 3. --- FINESTRE (WINDOWS) DIALOG ---
interface FinestreDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lastWindowWidth: number;
  lastWindowHeight: number;
  onConfirmWindow: (width: number, height: number, type: string) => void;
}
export const FinestreDialog: React.FC<FinestreDialogProps> = ({
  isOpen,
  onClose,
  lastWindowWidth,
  lastWindowHeight,
  onConfirmWindow
}) => {
  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useDraggableDialog(isOpen, { x: 300, y: 120 });
  const [width, setWidth] = useState<number>(lastWindowWidth || 120);
  const [height, setHeight] = useState<number>(lastWindowHeight || 140);
  const [winType, setWinType] = useState<string>('singola');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmWindow(width, height, winType);
  };

  const presetMisure = [80, 100, 120, 140, 180, 240];

  return (
    <div 
      className="fixed z-[100] bg-slate-950 border border-slate-800 p-5 rounded-xl shadow-2xl max-w-sm w-full text-white"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div 
        className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <h3 className="text-xs font-black uppercase text-blue-400 tracking-wider font-mono flex items-center gap-2 pointer-events-none">
          <Maximize2 size={14} className="text-blue-500" />
          <span>🪟 Sottomenu Finestre BIM</span>
        </h3>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-white font-mono text-xs font-bold leading-none p-1">✕</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Larghezza Infisso (cm)</label>
          <div className="grid grid-cols-6 gap-1 mb-2">
            {presetMisure.map(w => (
              <button
                type="button"
                key={w}
                onClick={() => setWidth(w)}
                className={`py-1 px-1 rounded font-mono text-[9.5px] font-bold border transition ${
                  width === w ? 'bg-blue-500/10 border-blue-500 text-blue-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          <input
            type="number"
            min="30"
            max="400"
            value={width}
            onChange={(e) => setWidth(parseInt(e.target.value) || 120)}
            className="w-full bg-slate-900 border border-slate-800 text-white rounded p-2 text-xs font-mono focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Altezza (cm)</label>
            <input
              type="number"
              min="50"
              max="250"
              value={height}
              onChange={(e) => setHeight(parseInt(e.target.value) || 140)}
              className="w-full bg-slate-900 border border-slate-800 text-white p-1.5 rounded text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Tipologia</label>
            <select
              value={winType}
              onChange={(e: any) => setWinType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-white p-1.5 rounded text-xs focus:outline-none focus:border-blue-400"
            >
              <option value="singola">Singolo Battente</option>
              <option value="doppia">Doppio Battente</option>
              <option value="portafinestra">Portafinestra (H.220)</option>
              <option value="vasistas">Basi / Vasistas</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-2.5 rounded-lg text-xs tracking-wider transition shadow-md cursor-pointer"
        >
          ATTIVA FINESTRA IN LOCAZIONE 🪟
        </button>
      </form>
    </div>
  );
};


// 4. --- ARREDI (FURNITURE) DIALOG ---
interface ArrediDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTemplateId: string | null;
  onSelectFurnitureTemplate: (id: string) => void;
}
export const ArrediDialog: React.FC<ArrediDialogProps> = ({
  isOpen,
  onClose,
  selectedTemplateId,
  onSelectFurnitureTemplate
}) => {
  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useDraggableDialog(isOpen, { x: 300, y: 125 });
  const [filterStr, setFilterStr] = useState<string>('');

  if (!isOpen) return null;

  const items = TEMPLATES.filter(t => t.category === 'Arredi' && t.name.toLowerCase().includes(filterStr.toLowerCase()));

  return (
    <div 
      className="fixed z-[100] bg-slate-950 border border-slate-800 p-5 rounded-xl shadow-2xl max-w-sm w-full text-white"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div 
        className="flex justify-between items-center border-b border-slate-800 pb-3 mb-3 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider font-mono flex items-center gap-2 pointer-events-none">
          <Layers size={14} className="text-indigo-500" />
          <span>🛋️ Sottomenu Arredi BIM</span>
        </h3>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-white font-mono text-xs font-bold leading-none p-1">✕</button>
      </div>

      <div className="space-y-3">
        <input
          type="text"
          placeholder="Cerca arredo..."
          value={filterStr}
          onChange={(e) => setFilterStr(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 text-white p-2 rounded text-xs text-left focus:outline-none"
        />

        <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
          {items.map(t => (
            <button
              type="button"
              key={t.id}
              onClick={() => onSelectFurnitureTemplate(t.id)}
              className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all ${
                selectedTemplateId === t.id ? "bg-indigo-600/10 border-indigo-500 text-indigo-300 font-bold" : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900/50"
              }`}
            >
              <div className="w-12 h-12 flex items-center justify-center p-1 bg-slate-800 border border-slate-700 rounded-md mb-1.5 overflow-hidden">
                <TemplatePreview template={t} size={40} />
              </div>
              <span className="text-[9px] font-bold leading-tight line-clamp-1">{t.name}</span>
            </button>
          ))}
        </div>

        <p className="text-[9px] text-slate-400 mt-1 pl-1 leading-normal">
          💡 Clicca l'arredo e posizionalo con un click sulla planimetria. Verrà posizionato sul layer automatico <strong>BIM_Arredi</strong>.
        </p>
      </div>
    </div>
  );
};


// 5. --- SANITARI (SANITARY) DIALOG ---
interface SanitariDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTemplateId: string | null;
  onSelectSanitaryTemplate: (id: string) => void;
}
export const SanitariDialog: React.FC<SanitariDialogProps> = ({
  isOpen,
  onClose,
  selectedTemplateId,
  onSelectSanitaryTemplate
}) => {
  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useDraggableDialog(isOpen, { x: 300, y: 125 });

  if (!isOpen) return null;

  const items = TEMPLATES.filter(t => t.category === 'Bagno');

  return (
    <div 
      className="fixed z-[100] bg-slate-950 border border-slate-800 p-5 rounded-xl shadow-2xl max-w-sm w-full text-white"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div 
        className="flex justify-between items-center border-b border-slate-800 pb-3 mb-3 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <h3 className="text-xs font-black uppercase text-emerald-400 tracking-wider font-mono flex items-center gap-2 pointer-events-none">
          <Droplet size={14} className="text-emerald-500 animate-pulse" />
          <span>🚿 Sanitari & Bagno BIM</span>
        </h3>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-white font-mono text-xs font-bold leading-none p-1">✕</button>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
          {items.map(t => (
            <button
              type="button"
              key={t.id}
              onClick={() => onSelectSanitaryTemplate(t.id)}
              className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all ${
                selectedTemplateId === t.id ? "bg-emerald-600/10 border-emerald-500 text-emerald-300 font-bold" : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900/50"
              }`}
            >
              <div className="w-12 h-12 flex items-center justify-center p-1 bg-slate-800 border border-slate-700 rounded-md mb-1.5 overflow-hidden">
                <TemplatePreview template={t} size={40} />
              </div>
              <span className="text-[9px] font-bold leading-tight line-clamp-1">{t.name}</span>
            </button>
          ))}
        </div>

        <p className="text-[9px] text-slate-400 mt-1 pl-1 leading-normal">
          💡 Verrà posizionato sul layer automatico <strong>BIM_Sanitari</strong> per la gestione separata degli scarichi.
        </p>
      </div>
    </div>
  );
};


// 6. --- IMPIANTI ELETTRICI DIALOG ---
interface ElettricoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAddElectricSymbol: (symbolType: string, label: string) => void;
}
export const ElettricoDialog: React.FC<ElettricoDialogProps> = ({
  isOpen,
  onClose,
  onAddElectricSymbol
}) => {
  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useDraggableDialog(isOpen, { x: 300, y: 130 });

  if (!isOpen) return null;

  const symbols = [
    { type: 'punto_luce', name: '💡 Punto Luce standard', desc: 'Punto luce a soffitto (Rosone)', color: '#fbbf24' },
    { type: 'presa_standard', name: '🔌 Presa Bipasso 10A/16A', desc: 'Presa di corrente standard CEI', color: '#60a5fa' },
    { type: 'interruttore', name: '🔘 Interruttore unipolare', desc: 'Comando luce singolo', color: '#34d399' },
    { type: 'deviatore', name: '🎛️ Deviatore di flusso', desc: 'Doppio comando incrociato', color: '#a78bfa' },
    { type: 'quadro', name: '⏹️ Quadro Generale (Q.E.G)', desc: 'Interruttore magnetotermico salvavita', color: '#f87171' },
  ];

  return (
    <div 
      className="fixed z-[100] bg-slate-950 border border-slate-800 p-5 rounded-xl shadow-2xl max-w-sm w-full text-white"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div 
        className="flex justify-between items-center border-b border-slate-800 pb-3 mb-3 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <h3 className="text-xs font-black uppercase text-amber-400 tracking-wider font-mono flex items-center gap-2 pointer-events-none">
          <Zap size={14} className="text-amber-500 animate-pulse" />
          <span>⚡ Impianto Elettrico BIM</span>
        </h3>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-white font-mono text-xs font-bold leading-none p-1">✕</button>
      </div>

      <div className="space-y-2">
        <span className="text-[9px] text-slate-400 font-bold block uppercase pb-1 border-b border-slate-900 tracking-widest">Procedi al posizionamento</span>
        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
          {symbols.map(sym => (
            <button
              type="button"
              key={sym.type}
              onClick={() => onAddElectricSymbol(sym.type, sym.name.substring(2))}
              className="w-full text-left p-2 rounded-lg bg-slate-900 border border-slate-850 hover:bg-slate-900/50 hover:border-slate-700 transition flex items-center justify-between"
            >
              <div>
                <span className="text-[10.5px] font-bold block text-slate-200">{sym.name}</span>
                <span className="text-[8px] text-slate-500 leading-none">{sym.desc}</span>
              </div>
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sym.color }}></span>
            </button>
          ))}
        </div>

        <p className="text-[9px] text-slate-400 mt-2 pl-1 leading-normal italic text-slate-500">
          💡 Simboli CEI standard calcolati geometricamente sul Layer <strong>BIM_Impianti_Elettrici</strong>. Cerca un punto all'interno del disegno.
        </p>
      </div>
    </div>
  );
};


// 7. --- IMPIANTI IDRAULICI DIALOG ---
interface IdraulicoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAddHydraulicSymbol: (symbolType: string, label: string) => void;
}
export const IdraulicoDialog: React.FC<IdraulicoDialogProps> = ({
  isOpen,
  onClose,
  onAddHydraulicSymbol
}) => {
  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useDraggableDialog(isOpen, { x: 300, y: 130 });

  if (!isOpen) return null;

  const symbols = [
    { type: 'carico_af', name: '🔵 Carico Acqua Fredda (AF)', desc: 'Ingresso adduzione idrica fredda', color: '#2563eb' },
    { type: 'carico_ac', name: '🔴 Carico Acqua Calda (AC)', desc: 'Ingresso adduzione calda', color: '#dc2626' },
    { type: 'scarico_idr', name: '⚪ Scarico Fognario Nero', desc: 'Scarico WC o scarichi grigi cucina', color: '#9ca3af' },
    { type: 'caldaia', name: '🔥 Caldaia a Condensazione', desc: 'Impianto generazione calore', color: '#f97316' },
    { type: 'collettore', name: '🔌 Collettore riscaldamento', desc: 'Cassetta di distribuzione radiante/radiatori', color: '#eab308' },
  ];

  return (
    <div 
      className="fixed z-[100] bg-slate-950 border border-slate-800 p-5 rounded-xl shadow-2xl max-w-sm w-full text-white"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div 
        className="flex justify-between items-center border-b border-slate-800 pb-3 mb-3 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <h3 className="text-xs font-black uppercase text-blue-400 tracking-wider font-mono flex items-center gap-2 pointer-events-none">
          <Droplet size={14} className="text-blue-500 animate-pulse" />
          <span>🚰 Impianto Idraulico BIM</span>
        </h3>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-white font-mono text-xs font-bold leading-none p-1">✕</button>
      </div>

      <div className="space-y-2">
        <span className="text-[9px] text-slate-400 font-bold block uppercase pb-1 border-b border-slate-900 tracking-widest">Procedi al posizionamento</span>
        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
          {symbols.map(sym => (
            <button
              type="button"
              key={sym.type}
              onClick={() => onAddHydraulicSymbol(sym.type, sym.name.substring(2))}
              className="w-full text-left p-2 rounded-lg bg-slate-900 border border-slate-850 hover:bg-slate-900/50 hover:border-slate-700 transition flex items-center justify-between"
            >
              <div>
                <span className="text-[10.5px] font-bold block text-slate-200">{sym.name}</span>
                <span className="text-[8px] text-slate-500 leading-none">{sym.desc}</span>
              </div>
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sym.color }}></span>
            </button>
          ))}
        </div>

        <p className="text-[9px] text-slate-400 mt-2 pl-1 leading-normal italic text-slate-500">
          💡 Simboli di adduzione e scarico generati geometricamente in pianta sul Layer <strong>BIM_Impianti_Idraulici</strong>.
        </p>
      </div>
    </div>
  );
};


// 8. --- FINITURE (FINISHES) DIALOG ---
interface FinitureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultHatchStyle: any;
  setDefaultHatchStyle: (style: any) => void;
  onActivateFlooringHatch: () => void;
}
export const FinitureDialog: React.FC<FinitureDialogProps> = ({
  isOpen,
  onClose,
  defaultHatchStyle,
  setDefaultHatchStyle,
  onActivateFlooringHatch
}) => {
  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useDraggableDialog(isOpen, { x: 300, y: 130 });
  const [pattern, setPattern] = useState<string>(defaultHatchStyle?.pattern || 'ANSI31');
  const [scale, setScale] = useState<number>(defaultHatchStyle?.scale || 30);
  const [angle, setAngle] = useState<number>(defaultHatchStyle?.angle || 0);
  const [color, setColor] = useState<string>(defaultHatchStyle?.color || '#000000');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDefaultHatchStyle({
      pattern,
      scale,
      angle,
      color,
      sfumatura: 0
    });
    // Active floor placing tool
    onActivateFlooringHatch();
  };

  const patternOptions = [
    { id: 'ANSI31', name: 'Parquet trasversale' },
    { id: 'GRID', name: 'Piastrella Ceramica (Griglia)' },
    { id: 'BRICK', name: 'Gres Porcellanato Brick' },
    { id: 'ANSI32', name: 'Spina di Pesce (Chevron)' },
    { id: 'SOLID', name: 'Tinta unita (Massetto)' },
  ];

  return (
    <div 
      className="fixed z-[100] bg-slate-950 border border-slate-800 p-5 rounded-xl shadow-2xl max-w-sm w-full text-white"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div 
        className="flex justify-between items-center border-b border-slate-800 pb-3 mb-3 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <h3 className="text-xs font-black uppercase text-rose-300 tracking-wider font-mono flex items-center gap-2 pointer-events-none">
          <Grid size={14} className="text-rose-400" />
          <span>🎨 Finiture e Pavimentazione</span>
        </h3>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-white font-mono text-xs font-bold leading-none p-1">✕</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Pattern della Pavimentazione</label>
          <select
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 text-white p-2 rounded text-xs focus:outline-none focus:border-rose-400"
          >
            {patternOptions.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Scala Piastrelle/Grezza</label>
            <input
              type="number"
              min="2"
              max="200"
              value={scale}
              onChange={(e) => setScale(parseInt(e.target.value) || 30)}
              className="w-full bg-slate-900 border border-slate-800 text-white p-1.5 rounded text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Angolo di Posa (°)</label>
            <input
              type="number"
              min="0"
              max="360"
              value={angle}
              onChange={(e) => setAngle(parseInt(e.target.value) || 0)}
              className="w-full bg-slate-900 border border-slate-800 text-white p-1.5 rounded text-xs font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Colore Fuga / Pavimento</label>
          <div className="flex gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-8 bg-transparent border-0 cursor-pointer rounded-md overflow-hidden"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 text-white rounded p-1 px-2 text-xs font-mono"
            />
          </div>
        </div>

        <p className="text-[9.5px] text-slate-400 p-2 bg-slate-900 rounded border border-slate-900/50 leading-normal">
          💡 Clicca 'APPLICA PAVIMENTAZIONE' e poi clicca all'interno di una stanza per applicare in automatico la finitura sul Layer <strong>BIM_Finiture</strong>!
        </p>

        <button
          type="submit"
          className="w-full bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-black py-2.5 rounded-lg text-xs tracking-wider transition shadow-md cursor-pointer"
        >
          APPLICA REGOLAMENTO PAVIMENTI 📐
        </button>
      </form>
    </div>
  );
};
