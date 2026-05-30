import React, { useState, useRef, useEffect } from 'react';

interface RaccordoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialConfig: { type: 'curvo' | 'rettilineo'; value: number };
  onSave: (config: { type: 'curvo' | 'rettilineo'; value: number }) => void;
  onChange?: (config: { type: 'curvo' | 'rettilineo'; value: number }) => void;
}

export const RaccordoDialog: React.FC<RaccordoDialogProps> = ({
  isOpen,
  onClose,
  initialConfig,
  onSave,
  onChange,
}) => {
  const [type, setType] = useState<'curvo' | 'rettilineo'>(initialConfig.type);
  const [value, setValue] = useState<number>(initialConfig.value);

  // Floating draggable position
  const [position, setPosition] = useState({ x: 300, y: 120 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Center horizontally on mount based on window width
  useEffect(() => {
    if (isOpen) {
      const w = window.innerWidth;
      setPosition({
        x: Math.max(20, Math.floor(w / 2 - 180)),
        y: 120
      });
    }
  }, [isOpen]);

  // Handle pointer drag
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only left click allowed
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;

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

  if (!isOpen) return null;

  const handleTypeChange = (newType: 'curvo' | 'rettilineo') => {
    setType(newType);
    onChange?.({ type: newType, value });
  };

  const handleValueChange = (newValue: number) => {
    setValue(newValue);
    if (!isNaN(newValue) && newValue > 0) {
      onChange?.({ type, value: newValue });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value <= 0) {
      alert("Il valore del parametro deve essere maggiore di 0!");
      return;
    }
    onSave({ type, value });
  };

  return (
    <div 
      className="fixed z-[100] select-none animate-fade-in bg-slate-950 border border-slate-800 p-5 rounded-xl shadow-2xl max-w-sm w-full text-white"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Draggable Header */}
      <div 
        className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4 cursor-grab active:cursor-grabbing select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <h3 className="text-xs font-black uppercase text-amber-400 tracking-wider font-mono flex items-center gap-2 pointer-events-none">
          <span>⚙️ Raccordo / Smusso</span>
        </h3>
        <button 
          type="button" 
          onClick={onClose} 
          className="text-slate-500 hover:text-white font-mono text-xs font-bold leading-none p-1 cursor-pointer"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">
            Tipo di Raccordo
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleTypeChange('curvo')}
              className={`py-2 px-3 rounded-md text-xs font-bold transition border cursor-pointer ${
                type === 'curvo'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
              }`}
            >
              Curvo (Raccordo)
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('rettilineo')}
              className={`py-2 px-3 rounded-md text-xs font-bold transition border cursor-pointer ${
                type === 'rettilineo'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
              }`}
            >
              Rettilineo (Smusso)
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">
            {type === 'curvo' ? 'Raggio del Raccordo (cm)' : 'Distanza / Smusso (cm)'}
          </label>
          <input
            type="number"
            min="0.1"
            step="any"
            value={isNaN(value) ? '' : value}
            onChange={(e) => handleValueChange(parseFloat(e.target.value) || 0)}
            className="w-full bg-slate-900 border border-slate-800 text-white rounded p-2 text-xs font-mono font-semibold focus:outline-none focus:border-amber-400"
            required
          />
        </div>

        <div className="pt-2 text-[10px] text-slate-400 font-mono leading-relaxed bg-slate-900/50 p-2.5 rounded border border-slate-900 select-text">
          💡 <span className="font-bold text-slate-300">Tip:</span> Trascina questa finestra per spostarla. I parametri si aggiornano sul disegno in diretta mentre modifichi i valori.
        </div>

        <div className="flex justify-end gap-2.5 pt-2">
          <button
            type="button"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition font-semibold cursor-pointer"
            onClick={onClose}
          >
            Annulla
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded text-xs font-black tracking-wide transition shadow-md cursor-pointer"
          >
            Applica
          </button>
        </div>
      </form>
    </div>
  );
};
