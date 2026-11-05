import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileDown, X, Check, AlertCircle, Plus, Clipboard, LayoutGrid } from 'lucide-react';
import { PrezzarioItem } from '../types';
import { BIM_FAMILIES } from '../data/bimFamilies';

interface PriceListImporterProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (items: PrezzarioItem[]) => void;
  targetFamilyId?: string;
}

export const PriceListImporter: React.FC<PriceListImporterProps> = ({
  isOpen,
  onClose,
  onImport,
  targetFamilyId
}) => {
  const [isOver, setIsOver] = useState(false);
  const [parsedItems, setParsedItems] = useState<PrezzarioItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(true);
  };

  const handleDragLeave = () => {
    setIsOver(false);
  };

  const parsePastedData = (text: string) => {
    try {
      let items: PrezzarioItem[] = [];
      const cleanText = text.trim();
      
      const targetFamilyName = targetFamilyId ? BIM_FAMILIES.find(f => f.id === targetFamilyId)?.name : null;
      const defaultCategory = targetFamilyName || 'Importati';
      
      // 1. Try JSON
      if (cleanText.startsWith('{') || cleanText.startsWith('[')) {
        try {
          const data = JSON.parse(cleanText);
          const rawItems = Array.isArray(data) ? data : [data];
          items = rawItems.map((it: any) => ({
            codice: it.codice || it.code || 'NP.NEW.000',
            descrizione: it.descrizione || it.description || 'Nessuna descrizione',
            unita: it.unita || it.um || it.unit || 'cad',
            prezzo: parseFloat(it.prezzo || it.price || 0),
            categoria: it.categoria || it.category || defaultCategory,
            incidenzaManodopera: parseFloat(it.incidenzaManodopera || it.labor || 0),
            prezzario: it.prezzario || it.catalog || 'Esterno'
          }));
        } catch (e) {}
      }

      // 2. CSV / TSV / Copy-Paste line-by-line
      if (items.length === 0) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        let bestSep = /\t/;
        if (text.includes('\t')) {
          bestSep = /\t/;
        } else if (text.includes(';')) {
          bestSep = /;/;
        } else if (text.includes('|')) {
          bestSep = /\|/;
        } else if (text.includes(',')) {
          bestSep = /,/;
        }

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const parts = line.split(bestSep).map(p => p.trim());
          
          if (parts.length >= 2) {
            // ORDINE RIGOROSO RICHIESTO DAL CLIENTE
            let codice = parts[0] || `NP.NEW.${100 + i}`;
            let descrizione = parts[1] || '';
            let unita = parts[2] || 'cad';
            
            let prezzo = 0;
            if (parts[3]) {
              const rawPrice = parts[3].replace(/[^\d.,-]/g, '').replace(',', '.');
              prezzo = parseFloat(rawPrice) || 0;
            }
            
            let incidenzaManodopera = 0;
            if (parts[4]) {
              const rawLabor = parts[4].replace(/[^\d.,-]/g, '').replace(',', '.');
              incidenzaManodopera = parseFloat(rawLabor) || 0;
            }
            
            let prezzario = parts[5] || 'Esterno';

            // Skip se è un'intestazione (es. prezzo 0 e contiene parole chiave)
            const descLower = descrizione.toLowerCase();
            if (prezzo === 0 && (descLower.includes('descrizione') || descLower.includes('prezzo') || descLower.includes('tariffa') || descLower.includes('importo'))) {
              continue;
            }

            if (!descrizione) {
              descrizione = `Voce di Computo senza descrizione (Riga ${i + 1})`;
            }

            items.push({
              codice,
              descrizione,
              unita,
              prezzo,
              categoria: defaultCategory,
              incidenzaManodopera,
              prezzario
            });
          }
        }
      }

      if (items.length > 0) {
        if (targetFamilyId) {
          items = items.map(item => ({ ...item, bimFamilyId: targetFamilyId }));
        }
        setParsedItems(items);
        setError(null);
      } else {
        setError("Impossibile riconoscere il formato dei dati. Nessuna voce valida trovata nel testo.");
      }
    } catch (err) {
      setError("Errore durante il parsing dei dati.");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);

    // Support dropping files (CSV, TSV, JSON)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          parsePastedData(text);
        }
      };
      reader.readAsText(file);
      return;
    }

    const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
    if (text) {
      parsePastedData(text);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (text) {
      parsePastedData(text);
    }
  };

  const handleConfirm = () => {
    onImport(parsedItems);
    setParsedItems([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-slate-950 border-2 border-indigo-500/50 rounded-2xl shadow-2xl max-w-2xl w-full text-white overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="flex justify-between items-center p-5 border-b border-white/10 bg-indigo-500/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <FileDown className="text-indigo-400" size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-indigo-400 font-mono">
                Importazione Prezzario Esterno
              </h3>
              <p className="text-[10px] text-slate-500 font-mono">Trascina o incolla le voci dal tuo applicativo</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex flex-col gap-4">
          {parsedItems.length === 0 ? (
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onPaste={handlePaste}
              className={`
                flex flex-col items-center justify-center gap-4 p-12 rounded-2xl border-2 border-dashed transition-all cursor-pointer
                ${isOver ? 'bg-indigo-500/20 border-indigo-500 scale-[1.02]' : 'bg-slate-900 border-white/10 hover:border-white/20'}
              `}
            >
              <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                <Plus className={`text-indigo-400 transition-transform duration-500 ${isOver ? 'rotate-90 scale-125' : ''}`} size={32} />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-slate-300 mb-1">Rilascia qui i dati o Incolla (Ctrl+V)</p>
                <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Prezzario • Codice • Descrizione • U.M. • Prezzo • Manodopera</p>
              </div>
              <div className="flex gap-2 mt-2">
                <span className="px-2 py-1 bg-slate-950 border border-white/5 rounded text-[9px] text-slate-500">CSV</span>
                <span className="px-2 py-1 bg-slate-950 border border-white/5 rounded text-[9px] text-slate-500">Excel / TSV</span>
                <span className="px-2 py-1 bg-slate-950 border border-white/5 rounded text-[9px] text-slate-500">JSON</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] font-black text-emerald-400 uppercase tracking-widest">Elementi Riconosciuti ({parsedItems.length})</h4>
                <button 
                  onClick={() => setParsedItems([])}
                  className="text-[10px] text-rose-400 hover:underline font-bold uppercase tracking-wider"
                >
                  Svuota Lista
                </button>
              </div>
              <div className="grid gap-4 max-h-[50vh] overflow-y-auto pr-2 scrollbar-thin">
                {parsedItems.map((it, idx) => (
                  <div key={idx} className="bg-slate-900/80 border border-white/10 p-4 rounded-xl flex flex-col gap-3 group hover:border-emerald-500/50 transition-colors shadow-lg">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex flex-col gap-1">
                        <div className="bg-slate-950 border border-white/10 px-3 py-1.5 rounded-lg text-sm font-mono font-black text-emerald-400 self-start shadow-inner">
                          {it.codice}
                        </div>
                        <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest pl-1 mt-1">
                          {it.prezzario || 'Prezzario Esterno'}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 bg-emerald-500/10 px-3 py-2 rounded-xl border border-emerald-500/20">
                        <span className="text-sm font-black text-emerald-400">€ {it.prezzo.toFixed(2)}</span>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                          <span className="flex items-center gap-1"><LayoutGrid size={10} /> {it.unita}</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-slate-950/50 rounded-lg p-3 border border-white/5">
                      <p className="text-xs font-medium text-slate-200 leading-relaxed whitespace-pre-wrap break-words text-justify">{it.descrizione}</p>
                    </div>
                    {it.incidenzaManodopera !== undefined && it.incidenzaManodopera > 0 && (
                      <div className="flex items-center gap-2 text-[10px] text-amber-400/80 bg-amber-400/10 self-start px-2 py-1 rounded">
                        <span>🛠️ Incidenza Manodopera:</span>
                        <span className="font-bold">{it.incidenzaManodopera}%</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl flex items-center gap-3 text-rose-400 animate-shake">
              <AlertCircle size={20} />
              <p className="text-[11px] font-medium">{error}</p>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-white/10 bg-slate-950 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl border border-white/10 text-slate-400 font-bold text-xs uppercase tracking-widest hover:bg-white/5 transition-colors"
          >
            Annulla
          </button>
          <button 
            disabled={parsedItems.length === 0}
            onClick={handleConfirm}
            className={`
              flex-[2] py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all
              ${parsedItems.length > 0 
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20' 
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'}
            `}
          >
            {targetFamilyId && targetFamilyId !== 'GLOBAL' && targetFamilyId !== 'ESTRANEO' ? 'Assegna e Archivia' : 'Importa nel Catalogo'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
