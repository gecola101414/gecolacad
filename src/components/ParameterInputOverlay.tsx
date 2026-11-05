import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { GripHorizontal, Check, X, ChevronDown, ArrowRightLeft } from 'lucide-react';

interface ParameterInputOverlayProps {
  type: 'radius' | 'length' | 'thickness' | 'offset';
  value: number;
  position: { x: number; y: number };
  onValueChange: (newValue: number) => void;
  onClose: () => void;
  history?: number[];
}

export const ParameterInputOverlay: React.FC<ParameterInputOverlayProps> = ({
  type,
  value,
  position,
  onValueChange,
  onClose,
  history = []
}) => {
  const [inputValue, setInputValue] = useState(value.toString());
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleConfirm = () => {
    const val = parseFloat(inputValue.replace(',', '.'));
    if (!isNaN(val)) {
      onValueChange(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const title = type === 'offset' ? 'Offset Input' : 'Snap Input';
  const icon = type === 'offset' ? <ArrowRightLeft size={12} /> : <GripHorizontal size={12} />;

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0}
      className="absolute bg-slate-900 text-white border-2 border-amber-400 shadow-2xl rounded-xl p-3 flex flex-col gap-2 z-[100000] cursor-grab active:cursor-grabbing select-none"
      style={{ left: position.x, top: position.y }}
    >
      <div className="flex items-center justify-between gap-3 cursor-move border-b border-slate-700 pb-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-amber-400">
          {icon}
          <span>{title}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-white"
        >
          <X size={12} />
        </button>
      </div>
      <div className="flex items-center gap-2 pt-1 relative">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          className="w-24 bg-slate-800 border border-slate-600 px-2 py-1.5 rounded text-right font-mono text-sm text-white outline-none focus:border-amber-400"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Valore..."
        />
        {history.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2 py-1.5 rounded text-xs text-amber-300 flex items-center gap-1 transition-colors"
              title="Elenco a cascata misure recenti"
            >
              <span>Misure</span>
              <ChevronDown size={12} />
            </button>
            {showHistoryDropdown && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 z-50 max-h-48 overflow-y-auto">
                <div className="px-2 py-1 text-[9px] font-bold text-slate-400 border-b border-slate-700">
                  Misure memorizzate
                </div>
                {history.map((histVal, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setInputValue(histVal.toString());
                      onValueChange(histVal);
                      setShowHistoryDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-amber-500 hover:text-slate-950 transition-colors flex items-center justify-between ${
                      Math.abs(histVal - parseFloat(inputValue || '0')) < 0.001 ? 'text-amber-400 font-bold bg-slate-700/50' : 'text-slate-200'
                    }`}
                  >
                    <span>{histVal}</span>
                    <span className="text-[9px] opacity-60">{type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={handleConfirm}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1.5 rounded text-xs flex items-center gap-1 shadow cursor-pointer transition-colors"
          title="Conferma"
        >
          <Check size={14} />
          Invio
        </button>
      </div>
      <div className="text-[9px] text-amber-300/80 italic font-medium">
        💡 Conferma con Invio.
      </div>
    </motion.div>
  );
};

