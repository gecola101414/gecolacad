import React, { useState, useRef } from 'react';
import { 
  FileSearch, 
  X, 
  Upload, 
  FileJson, 
  FileText, 
  Zap, 
  CheckCircle2, 
  AlertCircle,
  Database,
  Search,
  ArrowRight
} from "lucide-react";
import { motion, AnimatePresence } from 'motion/react';

interface BIMDataAnalyzerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAnalyzeResult?: (result: any) => void;
}

export const BIMDataAnalyzerDialog: React.FC<BIMDataAnalyzerDialogProps> = ({
  isOpen,
  onClose,
  onAnalyzeResult
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'analyzing' | 'success' | 'error'>('idle');
  const [analyzedData, setAnalyzedData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processData = async (content: string) => {
    setAnalysisStatus('analyzing');
    setErrorMsg(null);
    
    try {
      // Attempt to parse as JSON first
      let data: any;
      try {
        data = JSON.parse(content);
      } catch (e) {
        // If not JSON, maybe it's a CSV or custom text format
        data = { rawText: content, type: 'text' };
      }

      // Simulate analysis logic (in a real app, this could call an AI endpoint or complex parser)
      // Here we look for "voci", "articoli", or "prezzi"
      const results: any = {
        summary: "Analisi completata con successo",
        foundArticles: 0,
        foundCategories: 0,
        timestamp: new Date().toISOString()
      };

      if (data.gecolaData && data.gecolaData.articles) {
        results.foundArticles = data.gecolaData.articles.length;
        results.foundCategories = data.gecolaData.categories?.length || 0;
        results.source = "GeCoLa Package";
      } else if (Array.isArray(data)) {
        results.foundArticles = data.length;
        results.source = "Array di dati generico";
      } else {
        results.source = "Dato testuale o non strutturato";
      }

      setAnalyzedData({
        ...results,
        articles: data.gecolaData?.articles || (Array.isArray(data) ? data : [])
      });
      setAnalysisStatus('success');
      onAnalyzeResult?.(data);

    } catch (err) {
      console.error("Analysis Error:", err);
      setAnalysisStatus('error');
      setErrorMsg("Errore durante l'analisi dei dati. Assicurati che il formato sia corretto.");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        processData(content);
      };
      reader.readAsText(file);
    } else {
      // Try to get text data directly from the drop (e.g. dragged text from another window)
      const textData = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
      if (textData) {
        processData(textData);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        processData(content);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <FileSearch className="text-indigo-400" size={20} />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Analizzatore Pacchetti Dati</h3>
              <p className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">BIM & Computo Intelligence</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
          {analysisStatus === 'idle' && (
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer
                ${isDragging ? 'border-indigo-500 bg-indigo-500/5 scale-[1.02]' : 'border-slate-800 hover:border-slate-700 hover:bg-slate-800/30'}
              `}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                className="hidden" 
                accept=".json,.txt,.csv"
              />
              <div className="p-4 bg-slate-800 rounded-full text-slate-400 group-hover:text-indigo-400 transition-colors">
                <Upload size={32} />
              </div>
              <div className="text-center">
                <p className="text-white font-semibold text-sm mb-1">Trascina qui il file o i dati del pacchetto</p>
                <p className="text-slate-500 text-xs">Rilascia un file JSON/TXT o incolla/trascina il testo direttamente</p>
              </div>
              <button className="mt-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest py-2 px-4 rounded-full transition-all">
                Seleziona File o Dati
              </button>
            </div>
          )}

          {analysisStatus === 'analyzing' && (
            <div className="py-12 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
              <div className="text-center">
                <p className="text-white font-bold text-sm">Analisi in corso...</p>
                <p className="text-slate-500 text-xs mt-1">L'AI sta mappando le voci e individuando i pattern del pacchetto</p>
              </div>
            </div>
          )}

          {analysisStatus === 'success' && analyzedData && (
            <div className="space-y-4 animate-in zoom-in-95 duration-300">
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-start gap-3">
                <CheckCircle2 className="text-emerald-400 shrink-0" size={20} />
                <div>
                  <p className="text-emerald-400 font-bold text-sm">Analisi Completata</p>
                  <p className="text-emerald-400/70 text-xs">Il pacchetto è stato interpretato correttamente.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="text-indigo-400" size={14} />
                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Articoli Trovati</span>
                  </div>
                  <p className="text-2xl font-black text-white">{analyzedData.foundArticles}</p>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="text-amber-400" size={14} />
                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Sorgente</span>
                  </div>
                  <p className="text-sm font-bold text-white truncate">{analyzedData.source}</p>
                </div>
              </div>

              {/* Preview List */}
              {analyzedData.articles && analyzedData.articles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider ml-1">Anteprima Voci Individuate</p>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {analyzedData.articles.slice(0, 10).map((art: any, idx: number) => (
                      <div key={idx} className="bg-slate-800/40 border border-slate-800 p-3 rounded-xl flex items-start gap-3 group hover:border-indigo-500/30 transition-all">
                        <div className="p-1.5 bg-slate-700 rounded text-indigo-400 text-[10px] font-bold font-mono">
                          {art.code || art.codice || 'ART'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-bold truncate">{art.name || art.descrizione || art.title || 'Senza titolo'}</p>
                          <p className="text-slate-500 text-[10px] line-clamp-1 italic">{art.description || art.descrizione || ''}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-emerald-400 text-[10px] font-black">€ {art.unitPrice || art.prezzo || 0}</p>
                          <p className="text-slate-600 text-[9px] uppercase font-bold">{art.unit || art.unita || 'u'}</p>
                        </div>
                      </div>
                    ))}
                    {analyzedData.articles.length > 10 && (
                      <p className="text-center text-slate-600 text-[10px] py-2 italic">E altri {analyzedData.articles.length - 10} articoli...</p>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-700 rounded-lg">
                    <Search className="text-slate-400" size={16} />
                  </div>
                  <p className="text-xs text-slate-300">Vuoi integrare queste voci nel tuo progetto?</p>
                </div>
                <button 
                  onClick={() => setAnalysisStatus('idle')}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg transition-all"
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {analysisStatus === 'error' && (
            <div className="py-8 flex flex-col items-center justify-center gap-4 animate-in shake duration-300">
              <div className="p-4 bg-rose-500/10 rounded-full text-rose-500">
                <AlertCircle size={32} />
              </div>
              <div className="text-center">
                <p className="text-white font-bold text-sm">Qualcosa è andato storto</p>
                <p className="text-rose-400/70 text-xs mt-1">{errorMsg}</p>
              </div>
              <button 
                onClick={() => setAnalysisStatus('idle')}
                className="mt-2 text-indigo-400 hover:text-indigo-300 text-xs font-bold underline"
              >
                Riprova il caricamento
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/50 border-t border-slate-800 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
          >
            Annulla
          </button>
          {analysisStatus === 'success' && (
            <button 
              onClick={onClose}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-lg transition-all shadow-lg shadow-indigo-500/20"
            >
              UTILIZZA DATI
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
