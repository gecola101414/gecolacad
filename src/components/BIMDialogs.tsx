import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  Maximize2,
  Lightbulb,
  Plug,
  Power,
  Repeat,
  Server,
  Tv,
  Wifi,
  ToggleRight,
  Shuffle,
  CircleDot,
  ArrowDownToLine,
  Box,
  Bell,
  Volume2,
  Thermometer,
  Flashlight,
  Siren,
  Sun,
  Phone,
  Video,
  Trash2
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
  onDelete?: () => void;
}
export const PorteDialog: React.FC<PorteDialogProps> = ({
  isOpen,
  onClose,
  lastDoorWidth,
  lastDoorHeight,
  onConfirmDoor,
  onDelete
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

        <div className="flex gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="bg-red-600/10 hover:bg-red-600/20 text-red-500 font-black px-4 py-2.5 rounded-lg text-xs tracking-wider transition cursor-pointer flex items-center justify-center border border-red-500/20"
              title="Cancella Oggetto"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            type="submit"
            className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-black py-2.5 rounded-lg text-xs tracking-wider transition shadow-md cursor-pointer uppercase"
          >
            ATTIVA PORTA IN LOCAZIONE 🚪
          </button>
        </div>
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
  onConfirmWindow: (width: number, height: number, type: string, trasmittanza: number, prezzario: string) => void;
  onDelete?: () => void;
}
export const FinestreDialog: React.FC<FinestreDialogProps> = ({
  isOpen,
  onClose,
  lastWindowWidth,
  lastWindowHeight,
  onConfirmWindow,
  onDelete
}) => {
  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useDraggableDialog(isOpen, { x: 300, y: 120 });
  const [width, setWidth] = useState<number>(lastWindowWidth || 120);
  const [height, setHeight] = useState<number>(lastWindowHeight || 140);
  const [winType, setWinType] = useState<string>('singola');

  const [trasmittanza, setTrasmittanza] = useState<number>(0.0);
  const [prezzario, setPrezzario] = useState<string>('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmWindow(width, height, winType, trasmittanza, prezzario);
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
          <div>
            <label className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Trasmittanza (W/m²K)</label>
            <input
              type="number"
              step="0.01"
              value={trasmittanza}
              onChange={(e) => setTrasmittanza(parseFloat(e.target.value) || 0.0)}
              className="w-full bg-slate-900 border border-slate-800 text-white p-1.5 rounded text-xs font-mono"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Voce Prezzario</label>
            <input
              type="text"
              value={prezzario}
              onChange={(e) => setPrezzario(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-white p-1.5 rounded text-xs font-mono"
              placeholder="Codice o voce..."
            />
          </div>
        </div>

        <div className="flex gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="bg-red-600/10 hover:bg-red-600/20 text-red-500 font-black px-4 py-2.5 rounded-lg text-xs tracking-wider transition cursor-pointer flex items-center justify-center border border-red-500/20"
              title="Cancella Oggetto"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            type="submit"
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black py-2.5 rounded-lg text-xs tracking-wider transition shadow-md cursor-pointer uppercase"
          >
            CONFERMA E POSIZIONA
          </button>
        </div>
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
    { type: 'punto_luce', name: 'Punto Luce', desc: 'Punto luce a soffitto/rosone CEI', color: '#64748b', icon: Lightbulb },
    { type: 'presa_standard', name: 'Presa Bipasso 10/16A', desc: 'Presa standard universale CEI', color: '#64748b', icon: Plug },
    { type: 'presa_schuko', name: 'Presa Schuko', desc: 'Presa universale tedesca', color: '#64748b', icon: Zap },
    { type: 'presa_tv', name: 'Presa TV', desc: 'Presa antenna TV', color: '#64748b', icon: Tv },
    { type: 'presa_dati', name: 'Presa Dati LAN', desc: 'Presa rete RJ45 / LAN', color: '#64748b', icon: Wifi },
    { type: 'interruttore', name: 'Interruttore', desc: 'Comando singolo polo', color: '#64748b', icon: Power },
    { type: 'interruttore_bipolare', name: 'Int. Bipolare', desc: 'Comando doppio polo', color: '#64748b', icon: ToggleRight },
    { type: 'deviatore', name: 'Deviatore', desc: 'Comando incrociato 2 vie', color: '#64748b', icon: Repeat },
    { type: 'invertitore', name: 'Invertitore', desc: 'Comando incrociato 3+ vie', color: '#64748b', icon: Shuffle },
    { type: 'pulsante', name: 'Pulsante', desc: 'Comando a impulso', color: '#64748b', icon: CircleDot },
    { type: 'pulsante_tirante', name: 'Tirante', desc: 'Pulsante a tirante bagno', color: '#64748b', icon: ArrowDownToLine },
    { type: 'quadro', name: 'Quadro Generale', desc: 'Quadro elettrico (Q.E.G)', color: '#64748b', icon: Server },
    { type: 'scatola_derivazione', name: 'Scatola Deriv.', desc: 'Scatola di derivazione', color: '#64748b', icon: Box },
    { type: 'suoneria', name: 'Suoneria', desc: 'Campanello o ronzatore principale', color: '#64748b', icon: Bell },
    { type: 'ronzatore', name: 'Ronzatore', desc: 'Segnalatore acustico', color: '#64748b', icon: Volume2 },
    { type: 'termostato', name: 'Termostato', desc: 'Controllo termico ambientale', color: '#64748b', icon: Thermometer },
    { type: 'faretto', name: 'Faretto Incasso', desc: 'Punto luce a faretto', color: '#64748b', icon: Flashlight },
    { type: 'lampada_emergenza', name: 'Lamp. Emergenza', desc: 'Luce di emergenza autonoma', color: '#64748b', icon: Siren },
    { type: 'applique', name: 'Applique', desc: 'Punto luce a parete', color: '#64748b', icon: Sun },
    { type: 'citofono', name: 'Citofono', desc: 'Unità interna citofonica', color: '#64748b', icon: Phone },
    { type: 'videocitofono', name: 'Videocitofono', desc: 'Unità interna videocitofonica', color: '#64748b', icon: Video },
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
              onClick={() => onAddElectricSymbol(sym.type, sym.name)}
              className="w-full text-left p-2 rounded-lg bg-slate-900 border border-slate-850 hover:bg-slate-900/50 hover:border-slate-700 transition flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center">
                  <sym.icon size={16} style={{ color: sym.color }} />
                </div>
                <div>
                  <span className="text-[10.5px] font-bold block text-slate-200">{sym.name}</span>
                  <span className="text-[8px] text-slate-500 leading-none">{sym.desc}</span>
                </div>
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

// 9. --- AREA FUNZIONALE DIALOG ---
interface AreaFunzionaleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (areaData: { 
    type: 'stanza' | 'muro' | 'tramezzo' | 'giardino' | 'tetto' | 'altro'; 
    name: string; 
    color: string; 
    zPlane: number;
    zElevation: number;
    objectHeight: number;
    hatch: 'SOLID' | 'ANSI31' | 'CROSS' | 'NONE';
    cadVisible?: boolean;
  }) => void;
  points?: Point[] | { points: Point[], holes?: Point[][] };
  initialData?: {
    type: 'stanza' | 'muro' | 'tramezzo' | 'giardino' | 'tetto' | 'altro';
    name: string;
    color: string;
    zPlane: number;
    zElevation: number;
    objectHeight: number;
    hatch: 'SOLID' | 'ANSI31' | 'CROSS' | 'NONE';
    cadVisible?: boolean;
  };
  onDelete?: () => void;
}

const AREA_COLORS = [
  'rgba(52, 211, 153, 0.4)', // Stanza (Emerald)
  'rgba(244, 63, 94, 0.4)',  // Muro (Rose)
  'rgba(59, 130, 246, 0.4)', // Tramezzo (Blue)
  'rgba(132, 204, 22, 0.4)', // Giardino (Lime)
  'rgba(168, 85, 247, 0.4)', // Tetto (Purple)
  'rgba(249, 115, 22, 0.4)', // Altro (Orange)
];

const HATCH_PATTERNS: Array<{ id: 'SOLID' | 'ANSI31' | 'CROSS' | 'NONE', label: string }> = [
  { id: 'SOLID', label: 'Colore Pieno' },
  { id: 'ANSI31', label: 'Tratteggio (ANSI31)' },
  { id: 'CROSS', label: 'Reticolo (Cross)' },
  { id: 'NONE', label: 'Solo Contorno' },
];

const AREA_LABELS: Record<'stanza' | 'muro' | 'tramezzo' | 'giardino' | 'tetto' | 'altro', string> = {
  stanza: 'Stanza / Locale',
  muro: 'Muro Portante',
  tramezzo: 'Tramezzo Interno',
  giardino: 'Giardino / Esterno',
  tetto: 'Tetto / Copertura',
  altro: 'Altro / Funzione Specifica'
};

export const AreaFunzionaleDialog: React.FC<AreaFunzionaleDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  points,
  initialData,
  onDelete
}) => {
  const { position, handlePointerDown, handlePointerMove, handlePointerUp } = useDraggableDialog(isOpen, { x: 300, y: 130 });
  const [areaType, setAreaType] = useState<'stanza' | 'muro' | 'tramezzo' | 'giardino' | 'tetto' | 'altro'>('stanza');
  const [name, setName] = useState('');
  const [color, setColor] = useState(AREA_COLORS[0]);
  const [zPlane, setZPlane] = useState(0);
  const [zElevation, setZElevation] = useState(0);
  const [objectHeight, setObjectHeight] = useState(2.70);
  const [hatch, setHatch] = useState<'SOLID' | 'ANSI31' | 'CROSS' | 'NONE'>('SOLID');
  const [cadVisible, setCadVisible] = useState(true);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setAreaType(initialData.type);
        setName(initialData.name);
        setColor(initialData.color);
        setZPlane(initialData.zPlane);
        setZElevation(initialData.zElevation);
        setObjectHeight(initialData.objectHeight);
        setHatch(initialData.hatch);
        setCadVisible(initialData.cadVisible !== false);
      } else {
        // Reset to defaults for new area
        setAreaType('stanza');
        setName(AREA_LABELS['stanza']);
        setColor(AREA_COLORS[0]);
        setZPlane(parseFloat(localStorage.getItem('last_bim_zPlane') || '0'));
        setZElevation(parseFloat(localStorage.getItem('last_bim_zElevation') || '0'));
        setObjectHeight(parseFloat(localStorage.getItem('last_bim_height') || '270'));
        setHatch('SOLID');
        setCadVisible(true);
      }
    }
  }, [isOpen, initialData]);

  // Effect only for type changes (when NOT in edit mode or when user manually changes type)
  useEffect(() => {
    if (isOpen && !initialData) {
      setName(AREA_LABELS[areaType] || '');
      const types: Array<'stanza' | 'muro' | 'tramezzo' | 'giardino' | 'tetto' | 'altro'> = ['stanza', 'muro', 'tramezzo', 'giardino', 'tetto', 'altro'];
      const idx = types.indexOf(areaType);
      setColor(AREA_COLORS[idx % AREA_COLORS.length]);
      
      if (areaType === 'muro') setHatch('ANSI31');
      else if (areaType === 'tetto') setHatch('CROSS');
      else setHatch('SOLID');
    }
  }, [isOpen, areaType, initialData]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('last_bim_zPlane', zPlane.toString());
    localStorage.setItem('last_bim_zElevation', zElevation.toString());
    localStorage.setItem('last_bim_height', objectHeight.toString());
    onConfirm({ type: areaType, name, color, zPlane, zElevation, objectHeight: parseFloat(objectHeight.toString()), hatch, cadVisible });
  };

  return (
    <div 
      className="fixed z-[200] bg-slate-950 border-2 border-cyan-500/50 p-5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] max-w-sm w-full text-white backdrop-blur-2xl"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div 
        className="flex justify-between items-center border-b border-white/10 pb-3 mb-4 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="flex flex-col text-left">
          <h3 className="text-[12px] font-black uppercase text-cyan-400 tracking-widest font-mono flex items-center gap-2">
            <Layers size={14} className="animate-pulse" />
            <span>{initialData ? 'MODIFICA AREA BIM' : 'RILEVAMENTO AREA BIM'}</span>
          </h3>
          <span className="text-[9px] text-slate-500 font-bold font-mono">{initialData ? 'Aggiorna parametri area selezionata' : 'Input parametri aree funzionali'}</span>
        </div>
        <button type="button" onClick={onClose} className="bg-white/5 border border-white/10 text-slate-400 hover:text-white rounded-lg p-1.5 transition-colors">
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1.5 font-mono">Tipo di Funzione</label>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(AREA_LABELS) as Array<keyof typeof AREA_LABELS>).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setAreaType(type)}
                className={`py-1.5 px-2.5 rounded-lg border transition-all text-[10px] font-bold font-sans text-left flex items-center gap-2 ${
                  areaType === type 
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200' 
                  : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
                }`}
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: AREA_COLORS[['stanza', 'muro', 'tramezzo', 'giardino', 'tetto', 'altro'].indexOf(type)] }}></div>
                {AREA_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1.5 font-mono">Etichetta Vano</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 text-white rounded-lg p-2.5 text-xs font-bold focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1.5 font-mono">Retino (Hatch)</label>
            <select
              value={hatch}
              onChange={(e) => setHatch(e.target.value as any)}
              className="w-full bg-white/5 border border-white/10 text-white rounded-lg p-2.5 text-[10px] font-bold focus:outline-none focus:border-cyan-500"
            >
              {HATCH_PATTERNS.map(p => <option key={p.id} value={p.id} className="bg-slate-900">{p.label}</option>)}
            </select>
          </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1">
            <label className="block text-[8px] text-slate-400 font-black uppercase tracking-widest mb-1 font-mono">Piano Z (m)</label>
            <input
              type="text"
              value={zPlane}
              onChange={(e) => setZPlane(parseFloat(e.target.value) || 0)}
              className="w-full bg-white/5 border border-white/10 text-white rounded p-2 text-xs font-mono font-bold focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div className="col-span-1">
            <label className="block text-[8px] text-slate-400 font-black uppercase tracking-widest mb-1 font-mono">Elevaz. (m)</label>
            <input
              type="text"
              value={zElevation}
              onChange={(e) => setZElevation(parseFloat(e.target.value) || 0)}
              className="w-full bg-white/5 border border-white/10 text-white rounded p-2 text-xs font-mono font-bold focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div className="col-span-1">
            <label className="block text-[8px] text-slate-400 font-black uppercase tracking-widest mb-1 font-mono">Altezza (cm)</label>
            <input
              type="text"
              value={objectHeight}
              onChange={(e) => setObjectHeight(parseFloat(e.target.value) || 270)}
              className="w-full bg-white/5 border border-white/10 text-white rounded p-2 text-xs font-mono font-bold focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-2 mt-2 bg-white/5 border border-white/10 rounded-lg p-2.5">
          <label className="flex items-center cursor-pointer gap-2 flex-1">
            <div className="relative">
              <input type="checkbox" className="sr-only" checked={cadVisible} onChange={(e) => setCadVisible(e.target.checked)} />
              <div className={`block w-8 h-4.5 rounded-full transition-colors ${cadVisible ? 'bg-cyan-500' : 'bg-slate-600'}`}></div>
              <div className={`dot absolute left-0.5 top-0.5 bg-white w-3.5 h-3.5 rounded-full transition-transform ${cadVisible ? 'transform translate-x-3.5' : ''}`}></div>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-white uppercase tracking-widest font-mono">Visibilità CAD Layer 2D</span>
              <span className="text-[8px] text-slate-400 leading-tight">Nascondi in pianta mantenendo l'oggetto nel modello 3D</span>
            </div>
          </label>
        </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1.5 font-mono">Colore Area</label>
            <div className="flex items-center gap-2 h-10 bg-white/5 border border-white/10 rounded-lg px-3 overflow-hidden">
               <input
                type="color"
                value={color.includes('rgba') ? '#06b6d4' : color}
                onChange={(e) => {
                  const r = parseInt(e.target.value.slice(1, 3), 16);
                  const g = parseInt(e.target.value.slice(3, 5), 16);
                  const b = parseInt(e.target.value.slice(5, 7), 16);
                  setColor(`rgba(${r}, ${g}, ${b}, 0.4)`);
                }}
                className="w-6 h-6 bg-transparent border-0 cursor-pointer"
              />
              <span className="text-[10px] font-mono text-slate-500">{color.substring(0, 15)}...</span>
            </div>
          </div>
        </div>

        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-between">
          <p className="text-[9px] text-emerald-400/80 leading-relaxed italic">
            L'area visualizzata sul CAD avrà un <span className="text-emerald-300 font-bold underline">bordo verde lampeggiante</span> per conferma posizionale.
          </p>
          <div className="bg-emerald-500/20 px-2 py-1 rounded border border-emerald-500/30">
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="bg-red-600/10 hover:bg-red-600/20 text-red-500 font-black px-4 py-3.5 rounded-lg text-xs tracking-widest transition-all cursor-pointer flex items-center justify-center border border-red-500/20 active:scale-[0.97]"
              title="Cancella Oggetto"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            type="submit"
            className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black py-3.5 rounded-lg text-xs tracking-widest transition-all shadow-lg cursor-pointer uppercase active:scale-[0.97]"
          >
            {initialData ? 'SALVA MODIFICHE ✅' : 'GENERA AREA FUNZIONALE ✅'}
          </button>
        </div>
      </form>
    </div>
  );
};

