import React, { useState, useRef, useEffect } from 'react';
import { Play, Clipboard, RotateCcw, HelpCircle, FileText, Check, AlertCircle } from 'lucide-react';
import { Entity, Layer } from '../types';
import { parseDXF } from '../utils/dxfImport';

interface DXFTextReaderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  activeLayerId: string;
  layers: Layer[];
  onImport: (entities: Entity[], newLayers: Layer[], mergeMode: 'merge' | 'replace') => void;
}

const PRESETS = [
  {
    name: "Quadrato con Diagonali",
    description: "Un semplice quadrato di 100x100 cm con assi incrociati",
    content: `0
LINE
8
Layer0
10
0.0
20
0.0
11
100.0
21
0.0
0
LINE
8
Layer0
10
100.0
20
0.0
11
100.0
21
100.0
0
LINE
8
Layer0
10
100.0
20
100.0
11
0.0
21
100.0
0
LINE
8
Layer0
10
0.0
20
100.0
11
0.0
21
0.0
0
LINE
8
Layer0
10
0.0
20
0.0
11
100.0
21
100.0
0
LINE
8
Layer0
10
100.0
20
0.0
11
0.0
21
100.0`
  },
  {
    name: "Cerchi e Archi Concentrici",
    description: "Un cerchio centrale con due archi simmetrici esterni",
    content: `0
CIRCLE
8
CerchiAndArchi
10
50.0
20
50.0
40
25.0
0
ARC
8
CerchiAndArchi
10
50.0
20
50.0
40
40.0
50
45.0
51
135.0
0
ARC
8
CerchiAndArchi
10
50.0
20
50.0
40
40.0
50
225.0
51
315.0`
  },
  {
    name: "Etichetta di Testo e Punto",
    description: "Un punto di riferimento con etichetta descrittiva",
    content: `0
POINT
8
TestoAnnotazioni
10
40.0
20
30.0
0
TEXT
8
TestoAnnotazioni
10
45.0
20
32.0
40
8.0
1
Punto di Riferimento DXF`
  }
];

export const DXFTextReaderDialog: React.FC<DXFTextReaderDialogProps> = ({
  isOpen,
  onClose,
  activeLayerId,
  layers,
  onImport
}) => {
  const [dxfText, setDxfText] = useState<string>('');
  const [mergeMode, setMergeMode] = useState<'merge' | 'replace'>('merge');
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [successStatus, setSuccessStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  
  // Floating draggable state
  const [position, setPosition] = useState({ x: 100, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (isOpen) {
      const w = window.innerWidth;
      // Center horizontally and set a reasonable y
      setPosition({
        x: Math.max(20, Math.floor(w / 2 - 280)),
        y: 80
      });
      // Clear statuses
      setErrorStatus(null);
      setSuccessStatus(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only left click drag
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('textarea') || target.closest('select') || target.closest('label') || target.closest('input')) {
      return; 
    }

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

  const applyPreset = (content: string) => {
    setDxfText(content);
    setErrorStatus(null);
    setSuccessStatus("Preset caricato nell'editor. Clicca su 'Disegna Vettori' per generare.");
    setTimeout(() => setSuccessStatus(null), 3000);
  };

  const handleClipboardPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setDxfText(text);
        setSuccessStatus("Incollato con successo dagli appunti!");
        setTimeout(() => setSuccessStatus(null), 3000);
      } else {
        setErrorStatus("La clipboard è vuota.");
      }
    } catch (err) {
      setErrorStatus("Impossibile accedere alla clipboard automatica. Usa Ctrl+V o Cmd+V direttamente nella casella.");
    }
  };

  const handleGenerate = () => {
    if (!dxfText.trim()) {
      setErrorStatus("Inserto o incolla del codice DXF valido prima di generare.");
      return;
    }

    try {
      const { entities, newLayers } = parseDXF(dxfText, activeLayerId, layers);
      
      if (entities.length === 0) {
        setErrorStatus("Nessun elemento supportato (LINE, CIRCLE, ARC, TEXT, POINT) trovato nel codice fornito.");
        return;
      }

      onImport(entities, newLayers, mergeMode);
      setSuccessStatus(`Generati con successo ${entities.length} elementi vettoriali!`);
      setErrorStatus(null);
      
      // Auto close after 1.5 seconds representation of success
      setTimeout(() => {
        onClose();
      }, 1500);

    } catch (e) {
      console.error(e);
      setErrorStatus("Errore durante il parsing del testo DXF. Assicurati che rispetti la convenzione a coppie chiave/valore.");
    }
  };

  return (
    <div 
      className="fixed z-[110] select-none animate-fade-in bg-slate-950 border border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden text-white"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '560px',
        maxHeight: '80vh'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Draggable header panel */}
      <div 
        className="flex justify-between items-center bg-slate-900 border-b border-slate-800 px-5 py-3.5 cursor-grab active:cursor-grabbing select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="flex items-center gap-2 pointer-events-none">
          <FileText size={16} className="text-emerald-400" />
          <span className="text-xs font-black uppercase text-emerald-400 tracking-wider font-mono">
            Lettore & Interprete Codice DXF Vettoriale
          </span>
        </div>
        <button 
          onClick={onClose}
          className="text-slate-400 hover:text-white font-mono text-xs font-bold bg-slate-800 hover:bg-slate-700 h-6 w-6 rounded flex items-center justify-center transition-colors pb-0.5 cursor-pointer"
        >
          ✕
        </button>
      </div>

      <div className="p-5 flex-1 overflow-y-auto space-y-4">
        {/* Preset Selectors */}
        <div>
          <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">
            Preset Esempi Rapidi (un click per caricare nell'editor)
          </span>
          <div className="grid grid-cols-3 gap-2.5">
            {PRESETS.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => applyPreset(preset.content)}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 p-2.5 rounded-lg text-left transition duration-200 cursor-pointer flex flex-col group"
              >
                <div className="text-[11px] font-bold text-emerald-400 group-hover:text-emerald-300">
                  {preset.name}
                </div>
                <div className="text-[9px] text-slate-500 mt-0.5 leading-tight">
                  {preset.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Status indicator messages */}
        {errorStatus && (
          <div className="bg-red-500/10 border border-red-500/30 rounded p-2.5 flex items-start gap-2 text-[11px] text-red-200">
            <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
            <span>{errorStatus}</span>
          </div>
        )}
        {successStatus && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-2.5 flex items-start gap-2 text-[11px] text-emerald-200">
            <Check size={14} className="text-emerald-400 shrink-0 mt-0.5" />
            <span>{successStatus}</span>
          </div>
        )}

        {/* Raw Text Input TextArea area */}
        <div className="flex flex-col flex-1">
          <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">
            <span>Editor Codice DXF (Incolla il testo ASCII DXF)</span>
            <div className="flex gap-2 font-semibold">
              <button 
                onClick={handleClipboardPaste}
                type="button"
                className="text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Clipboard size={10} />
                Incolla Appunti
              </button>
              <button 
                onClick={() => {
                  setDxfText('');
                  setErrorStatus(null);
                  setSuccessStatus(null);
                }}
                type="button"
                className="text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer ml-1"
              >
                <RotateCcw size={10} />
                Svuota
              </button>
            </div>
          </div>
          
          <div className="relative">
            <textarea
              value={dxfText}
              onChange={(e) => {
                setDxfText(e.target.value);
                if (errorStatus) setErrorStatus(null);
              }}
              placeholder={`Esempio formato AutoCAD ASCII DXF:
0
LINE
8
0
10
0.0
20
0.0
11
150.0
21
150.0
...`}
              className="w-full h-44 bg-slate-900 border border-slate-800 text-slate-100 rounded-lg p-3 text-[11px] font-mono leading-relaxed focus:outline-none focus:border-emerald-500 placeholder-slate-600 focus:ring-1 focus:ring-emerald-500/20"
              style={{ resize: 'none' }}
              spellCheck="false"
            />
          </div>
        </div>

        {/* Merge Settings & Execution */}
        <div className="grid grid-cols-2 gap-4 items-center bg-slate-900/60 p-3 rounded-lg border border-slate-900">
          <div>
            <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
              Metodo Inserimento
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setMergeMode('merge')}
                className={`py-1.5 px-2 rounded text-[10px] font-bold transition border cursor-pointer ${
                  mergeMode === 'merge'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                Includi (Conserva)
              </button>
              <button
                type="button"
                onClick={() => setMergeMode('replace')}
                className={`py-1.5 px-2 rounded text-[10px] font-bold transition border cursor-pointer ${
                  mergeMode === 'replace'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                Sovrascrivi (Clear)
              </button>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={onClose}
              type="button"
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition font-semibold cursor-pointer"
            >
              Chiudi
            </button>
            <button
              onClick={handleGenerate}
              type="button"
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded text-xs font-black tracking-wide transition shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <Play size={12} className="fill-current" />
              Disegna Vettori
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
