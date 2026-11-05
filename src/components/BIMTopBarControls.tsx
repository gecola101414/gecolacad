import React, { useState, useRef, useEffect } from 'react';
import { 
  Building, 
  ChevronDown, 
  Home, 
  Droplet, 
  Zap, 
  Grid, 
  Sparkles, 
  Maximize2, 
  Crosshair, 
  Check, 
  CornerDownRight,
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
  Cuboid,
  Square,
  FolderOpen,
  Scissors
} from 'lucide-react';

const PolylineIcon = ({ size = 13, className }: { size?: number; className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2.2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="3,17 9,7 16,13 21,5" />
    <circle cx="3" cy="17" r="2" fill="currentColor" stroke="none" />
    <circle cx="9" cy="7" r="2" fill="currentColor" stroke="none" />
    <circle cx="16" cy="13" r="2" fill="currentColor" stroke="none" />
    <circle cx="21" cy="5" r="2" fill="currentColor" stroke="none" />
  </svg>
);
import { TEMPLATES, Template } from '../data/templates';
import { Entity } from '../types';
import { exportEntitiesToIFC } from '../utils/ifcExport';
import { parseIFCContent } from '../utils/ifcImport';
import { splitAllLinesAtIntersections, smartCleanDrawing } from '../utils/entityUtils';

interface BIMTopBarControlsProps {
  selectedTool: string | null;
  setSelectedTool: (tool: string | null) => void;
  selectedTemplateId: string | null;
  setSelectedTemplateId: (id: string | null) => void;
  selectedBIMSymbolType: string | null;
  setSelectedBIMSymbolType: (type: string | null) => void;
  cadCanvasRef: React.RefObject<any>;
  defaultHatchStyle: any;
  setDefaultHatchStyle: (style: any) => void;
  
  // Reactive states from App level
  bimWallThickness: number | '';
  setBimWallThickness: (val: number | '') => void;
  bimWallHeight: number | '';
  setBimWallHeight: (val: number | '') => void;
  bimDoorWidth: number | '';
  setBimDoorWidth: (val: number | '') => void;
  bimDoorHeight: number | '';
  setBimDoorHeight: (val: number | '') => void;
  bimWindowWidth: number | '';
  setBimWindowWidth: (val: number | '') => void;
  bimWindowHeight: number | '';
  setBimWindowHeight: (val: number | '') => void;
  bimSymbolScale?: number | '';
  setBimSymbolScale?: (val: number | '') => void;
  setIsBIMFinestreOpen: (val: boolean) => void;
  onOpen3DView?: () => void;
  entities: Entity[];
  setEntities?: React.Dispatch<React.SetStateAction<Entity[]>>;
  isStratifiedView: boolean;
  setIsStratifiedView: (val: boolean) => void;
}

export const BIMTopBarControls: React.FC<BIMTopBarControlsProps> = ({
  selectedTool,
  setSelectedTool,
  selectedTemplateId,
  setSelectedTemplateId,
  selectedBIMSymbolType,
  setSelectedBIMSymbolType,
  cadCanvasRef,
  defaultHatchStyle,
  setDefaultHatchStyle,
  bimWallThickness,
  setBimWallThickness,
  bimWallHeight,
  setBimWallHeight,
  bimDoorWidth,
  setBimDoorWidth,
  bimDoorHeight,
  setBimDoorHeight,
  bimWindowWidth,
  setBimWindowWidth,
  bimWindowHeight,
  setBimWindowHeight,
  bimSymbolScale = 1,
  setBimSymbolScale,
  setIsBIMFinestreOpen,
  onOpen3DView,
  entities,
  setEntities,
  isStratifiedView,
  setIsStratifiedView,
}) => {
   const [activeDropdown, setActiveDropdown] = useState<
     'porte' | 'finestre' | 'arredi' | 'sanitari' | 'elettrico' | 'idraulico' | 'finiture' | 'vani' | null
   >(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportIFC = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      // 1. Esegui il parsing con web-ifc (come richiesto dal prompt)
      // Carica e usa la libreria web-ifc per estrarre IFCBEAM e IFCPROPERTYSET
      const { loadAndParseIFC } = await import('../utils/ifcWebLoader');
      const beams = await loadAndParseIFC(file);
      console.log('IFCBEAM Estratti con web-ifc:', beams);
      if (beams.length > 0) {
        alert(`Trovati ${beams.length} elementi IFCBEAM nel file con relative proprietà (controlla la console).`);
      }
    } catch (err) {
      console.warn("Errore nell'uso di web-ifc:", err);
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let text = e.target?.result as string;
        if (!text) return;
        if (!text.includes('ENDSEC;')) text += '\nENDSEC;';
        if (!text.includes('END-ISO-10303-21;')) text += '\nEND-ISO-10303-21;';
        const imported = parseIFCContent(text);
        if (imported.length === 0) {
          alert("Nessun elemento geometrico BIM riconosciuto nel file IFC.");
          return;
        }

        const msg = `Trovati ${imported.length} elementi BIM nel file IFC.\n\nVuoi AGGIUNGERLI al disegno corrente (fai click su OK) o SOSTITUIRE l'intero progetto esistente (fai click su Annulla)?`;
        const joinCurrent = window.confirm(msg);

        if (setEntities) {
          if (joinCurrent) {
            setEntities(prev => [...prev, ...imported]);
          } else {
            setEntities(imported);
          }
          alert("Progetto IFC importato con successo! ✅");
        } else {
          alert("Errore interno: setEntities non collegato.");
        }
      } catch (err: any) {
        alert("Errore durante il parsing del file IFC: " + err.message);
      }
    };
    reader.readAsText(file);
    if (event.target) event.target.value = '';
  };

  // Close dropdowns on clicking outside
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const toggleDropdown = (dd: typeof activeDropdown) => {
    setActiveDropdown(prev => prev === dd ? null : dd);
  };

  // Sync canvas defaults
  const handleDoorSpecsChange = (w: number | '', h: number | '') => {
    setBimDoorWidth(w);
    setBimDoorHeight(h);
    localStorage.setItem('lastDoorWidth', w.toString());
    localStorage.setItem('lastDoorHeight', h.toString());
    cadCanvasRef.current?.setBIMDefaults(w || 80, h || 210, 'door');
  };

  const handleWindowSpecsChange = (w: number | '', h: number | '') => {
    setBimWindowWidth(w);
    setBimWindowHeight(h);
    localStorage.setItem('lastWindowWidth', w.toString());
    localStorage.setItem('lastWindowHeight', h.toString());
    cadCanvasRef.current?.setBIMDefaults(w || 120, h || 140, 'window');
  };

  const doorPresets = [
    { w: 70, h: 210, label: '70 x 210' },
    { w: 80, h: 210, label: '80 x 210' },
    { w: 90, h: 210, label: '90 x 210' },
    { w: 100, h: 210, label: '100 x 210' },
  ];

  const windowPresets = [
    { w: 80, h: 120, label: '80 x 120' },
    { w: 100, h: 120, label: '100 x 120' },
    { w: 120, h: 140, label: '120 x 140' },
    { w: 140, h: 140, label: '140 x 140' },
    { w: 160, h: 140, label: '160 x 140' },
  ];

  // Templates
  const furnitureTemplates = TEMPLATES.filter(t => t.category === 'Arredi');
  const bathTemplates = TEMPLATES.filter(t => t.category === 'Bagno');

  // Symbols
  const electricSymbols = [
    { type: 'punto_luce', label: 'Punto Luce', icon: Lightbulb },
    { type: 'presa_standard', label: 'Presa 10/16A', icon: Plug },
    { type: 'presa_schuko', label: 'Presa Schuko', icon: Zap },
    { type: 'presa_tv', label: 'Presa TV', icon: Tv },
    { type: 'presa_dati', label: 'Presa Dati/LAN', icon: Wifi },
    { type: 'interruttore', label: 'Interruttore', icon: Power },
    { type: 'interruttore_bipolare', label: 'Int. Bipolare', icon: ToggleRight },
    { type: 'deviatore', label: 'Deviatore', icon: Repeat },
    { type: 'invertitore', label: 'Invertitore', icon: Shuffle },
    { type: 'pulsante', label: 'Pulsante', icon: CircleDot },
    { type: 'pulsante_tirante', label: 'Tirante', icon: ArrowDownToLine },
    { type: 'quadro', label: 'Quadro Elet.', icon: Server },
    { type: 'scatola_derivazione', label: 'Scatola Deriv.', icon: Box },
    { type: 'suoneria', label: 'Suoneria', icon: Bell },
    { type: 'ronzatore', label: 'Ronzatore', icon: Volume2 },
    { type: 'termostato', label: 'Termostato', icon: Thermometer },
    { type: 'faretto', label: 'Faretto Incasso', icon: Flashlight },
    { type: 'lampada_emergenza', label: 'Lamp. Emergenza', icon: Siren },
    { type: 'applique', label: 'Applique', icon: Sun },
    { type: 'citofono', label: 'Citofono', icon: Phone },
    { type: 'videocitofono', label: 'Videocitofono', icon: Video }
  ];

  const hydraulicSymbols = [
    { type: 'carico_af', label: '💧 Carico Freddo (AF)' },
    { type: 'carico_ac', label: '🔥 Carico Caldo (AC)' },
    { type: 'scarico_idr', label: '🔘 Scarico Idrico' },
    { type: 'caldaia', label: '🔥 Caldaia Boiler' },
    { type: 'collettore', label: '🔩 Collettore' }
  ];

  const finishPresets = [
    { name: 'Standard (Sabbia)', pattern: 'SAND', scale: 10, angle: 0 },
    { name: 'Parquet Righe', pattern: 'ANSI31', scale: 35, angle: 45 },
    { name: 'Ceramica Quadrati', pattern: 'GRID', scale: 40, angle: 0 },
    { name: 'Marmo Diagonale', pattern: 'ANSI32', scale: 50, angle: 45 },
  ];

  return (
    <div ref={containerRef} className="flex items-center gap-1.5 w-full text-neutral-800">
      

      {/* 1. ELEMENTS (ELEMENTI BIM) BUTTON & DROPDOWN */}
      <div className="relative flex items-center">
        <button
          onClick={() => {
            setSelectedTool('BIM_RilevaStanza');
          }}
          className={`px-2 py-0.5 rounded-l flex items-center gap-1 text-xs border border-r-0 transition ${
            selectedTool === 'BIM_RilevaStanza' || selectedTool === 'BIM_DisegnaStanza' || selectedTool === 'BIM_DisegnaLineare'
              ? 'bg-cyan-100 text-cyan-950 font-bold border-cyan-300 shadow-sm' 
              : 'hover:bg-neutral-100 border-neutral-300 bg-white'
          }`}
          title="Rilevamento e Tracciamento Elementi BIM (Muri, Fondazioni, Tavolati, etc)"
        >
          <span className="text-cyan-600 font-bold text-[10px]">🏗️</span>
          <span>
            {selectedTool === 'BIM_DisegnaStanza' 
              ? 'Traccia Elemento' 
              : selectedTool === 'BIM_DisegnaLineare' 
                ? 'Rilievo Lineare' 
                : 'Rileva Elemento'}
          </span>
        </button>
        <button
          onClick={() => toggleDropdown('vani')}
          className={`px-1 py-1 rounded-r border transition text-neutral-500 hover:text-neutral-900 ${
            activeDropdown === 'vani' ? 'bg-cyan-50 border-cyan-300 pointer-events-auto' : 'hover:bg-neutral-100 border-neutral-300 bg-white'
          }`}
          title="Seleziona modalità rilevamento elementi bim"
        >
          <ChevronDown size={11} />
        </button>

        {activeDropdown === 'vani' && (
          <div className="absolute top-7 left-0 w-52 bg-white rounded-lg shadow-xl border border-neutral-200 p-2 z-50 animate-fade-in text-xs space-y-1">
            <span className="font-semibold text-[10px] uppercase text-neutral-400 block px-2 py-1 border-b">Rilevamento Elemento BIM</span>
            
            <button
              onClick={() => {
                setSelectedTool('BIM_RilevaStanza');
                setActiveDropdown(null);
              }}
              className={`w-full text-left px-2 py-1.5 hover:bg-neutral-50 transition rounded text-[11px] font-medium flex items-center gap-2 ${
                selectedTool === 'BIM_RilevaStanza' ? 'bg-cyan-50 text-cyan-800 font-bold' : 'text-neutral-700'
              }`}
            >
              <Sparkles size={13} className="text-cyan-600" />
              <div className="flex flex-col text-left">
                <span>Rilevamento Elemento BIM</span>
                <span className="text-[9px] text-neutral-400 font-normal">Sotto-muro automatico con 1 click</span>
              </div>
            </button>

            <button
              onClick={() => {
                setSelectedTool('BIM_DisegnaStanza');
                setActiveDropdown(null);
              }}
              className={`w-full text-left px-2 py-1.5 hover:bg-neutral-50 transition rounded text-[11px] font-medium flex items-center gap-2 ${
                selectedTool === 'BIM_DisegnaStanza' ? 'bg-indigo-50 text-indigo-800 font-bold' : 'text-neutral-700'
              }`}
            >
              <Square size={13} className="text-indigo-600" />
              <div className="flex flex-col text-left">
                <span>Traccia punti esterni</span>
                <span className="text-[9px] text-neutral-400 font-normal">Disegno manuale vertici</span>
              </div>
            </button>

            <button
              onClick={() => {
                setSelectedTool('BIM_DisegnaLineare');
                setActiveDropdown(null);
              }}
              className={`w-full text-left px-2 py-1.5 hover:bg-neutral-50 transition rounded text-[11px] font-medium flex items-center gap-2 ${
                selectedTool === 'BIM_DisegnaLineare' ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-neutral-700'
              }`}
            >
              <PolylineIcon size={13} className="text-emerald-600" />
              <div className="flex flex-col text-left">
                <span>Tracciato Perimetro</span>
                <span className="text-[9px] text-neutral-400 font-normal">Pareti verticali per polilinea</span>
              </div>
            </button>

            <button
              onClick={() => {
                setSelectedTool('BIM_TracciaSegmento');
                setActiveDropdown(null);
              }}
              className={`w-full text-left px-2 py-1.5 hover:bg-neutral-50 transition rounded text-[11px] font-medium flex items-center gap-2 ${
                selectedTool === 'BIM_TracciaSegmento' ? 'bg-orange-50 text-orange-800 font-bold' : 'text-neutral-700'
              }`}
            >
              <Crosshair size={13} className="text-orange-600" />
              <div className="flex flex-col text-left">
                <span>Traccia Segmento</span>
                <span className="text-[9px] text-neutral-400 font-normal">Trova elemento BIM più vicino</span>
              </div>
            </button>
          </div>
        )}
      </div>




      <div className="h-4 w-[1px] bg-neutral-300 mx-1" />

      {/* 4. FURNITURE TEMPLATE DROPDOWN */}
      <div className="relative">
        <button
          onClick={() => toggleDropdown('arredi')}
          className={`px-2 py-0.5 rounded border flex items-center gap-1 text-xs transition bg-white border-neutral-300 hover:bg-neutral-100 ${
            selectedTool === 'Template' && furnitureTemplates.some(t => t.id === selectedTemplateId)
              ? 'bg-amber-100 border-amber-300 text-neutral-900 font-bold' 
              : ''
          }`}
        >
          <Home size={12} className="text-amber-500" />
          <span>🛋️ Arredi</span>
          <ChevronDown size={11} className="text-neutral-500" />
        </button>

        {activeDropdown === 'arredi' && (
          <div className="absolute top-7 left-0 w-52 bg-white rounded-lg shadow-xl border border-neutral-200 p-2 z-50 animate-fade-in text-xs max-h-60 overflow-y-auto">
            <span className="font-semibold text-[10px] uppercase text-neutral-400 block px-2 py-1 border-b">Inserisci Mobili</span>
            {furnitureTemplates.map(t => (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedTemplateId(t.id);
                  setSelectedTool('Template');
                  setActiveDropdown(null);
                }}
                className={`w-full text-left px-2 py-1.5 hover:bg-neutral-50 transition rounded text-[11px] font-medium flex justify-between items-center ${
                  selectedTemplateId === t.id && selectedTool === 'Template'
                    ? 'bg-amber-50 text-amber-900 font-bold'
                    : 'text-neutral-700'
                }`}
              >
                <span>{t.name}</span>
                {selectedTemplateId === t.id && selectedTool === 'Template' && <Check size={10} className="text-amber-600" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 5. SANITARY TEMPLATE DROPDOWN */}
      <div className="relative">
        <button
          onClick={() => toggleDropdown('sanitari')}
          className={`px-2 py-0.5 rounded border flex items-center gap-1 text-xs transition bg-white border-neutral-300 hover:bg-neutral-100 ${
            selectedTool === 'Template' && bathTemplates.some(t => t.id === selectedTemplateId)
              ? 'bg-emerald-100 border-emerald-300 text-neutral-900 font-bold' 
              : ''
          }`}
        >
          <Droplet size={12} className="text-emerald-500" />
          <span>🚿 Bagno</span>
          <ChevronDown size={11} className="text-neutral-500" />
        </button>

        {activeDropdown === 'sanitari' && (
          <div className="absolute top-7 left-0 w-48 bg-white rounded-lg shadow-xl border border-neutral-200 p-2 z-50 animate-fade-in text-xs">
            <span className="font-semibold text-[10px] uppercase text-neutral-400 block px-2 py-1 border-b">Sanitari Bagno</span>
            {bathTemplates.map(t => (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedTemplateId(t.id);
                  setSelectedTool('Template');
                  setActiveDropdown(null);
                }}
                className={`w-full text-left px-2 py-1.5 hover:bg-neutral-50 transition rounded text-[11px] font-medium flex justify-between items-center ${
                  selectedTemplateId === t.id && selectedTool === 'Template'
                    ? 'bg-emerald-50 text-emerald-900 font-bold'
                    : 'text-neutral-700'
                }`}
              >
                <span>{t.name}</span>
                {selectedTemplateId === t.id && selectedTool === 'Template' && <Check size={10} className="text-emerald-600" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 6. SYSTEM ELECTRICAL SYMBOLS */}
      <div className="relative">
        <button
          onClick={() => toggleDropdown('elettrico')}
          className={`px-2 py-0.5 rounded border flex items-center gap-1 text-xs transition bg-white border-neutral-300 hover:bg-neutral-100 ${
            selectedTool === 'BIM_Symbol' && electricSymbols.some(s => s.type === selectedBIMSymbolType)
              ? 'bg-yellow-100 border-yellow-300 text-neutral-950 font-bold' 
              : ''
          }`}
        >
          <Zap size={12} className="text-yellow-500 fill-yellow-500" />
          <span>⚡ Elettrico</span>
          <ChevronDown size={11} className="text-neutral-500" />
        </button>

        {activeDropdown === 'elettrico' && (
          <div className="absolute top-7 left-0 w-48 bg-white rounded-lg shadow-xl border border-neutral-200 p-2 z-50 animate-fade-in text-xs max-h-72 overflow-y-auto">
            <span className="font-semibold text-[10px] uppercase text-neutral-400 block px-2 py-1 mb-1 border-b">Impianto Elettrico</span>
            
            <div className="px-2 py-2 border-b border-neutral-100 mb-1">
              <label className="flex justify-between text-[10px] text-neutral-500 mb-1">
                <span>Scala Simboli</span>
                <span>{bimSymbolScale}x</span>
              </label>
              <input 
                type="range" 
                min="0.1" 
                max="10" 
                step="0.1"
                value={bimSymbolScale}
                onChange={(e) => setBimSymbolScale?.(parseFloat(e.target.value))}
                className="w-full accent-slate-600"
              />
            </div>

            {electricSymbols.map(sym => (
              <button
                key={sym.type}
                onClick={() => {
                  setSelectedBIMSymbolType(sym.type);
                  setSelectedTool('BIM_Symbol');
                  setActiveDropdown(null);
                }}
                className={`w-full text-left px-2 py-1.5 hover:bg-neutral-50 transition rounded text-[11px] font-medium flex justify-between items-center ${
                  selectedBIMSymbolType === sym.type && selectedTool === 'BIM_Symbol'
                    ? 'bg-yellow-50 text-yellow-800 font-bold'
                    : 'text-neutral-700'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <sym.icon size={12} className={selectedBIMSymbolType === sym.type ? "text-slate-800" : "text-slate-500"} />
                  {sym.label}
                </span>
                {selectedBIMSymbolType === sym.type && selectedTool === 'BIM_Symbol' && <Check size={10} className="text-slate-800" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 7. SYSTEM HYDRAULIC SYMBOLS */}
      <div className="relative">
        <button
          onClick={() => toggleDropdown('idraulico')}
          className={`px-2 py-0.5 rounded border flex items-center gap-1 text-xs transition bg-white border-neutral-300 hover:bg-neutral-100 ${
            selectedTool === 'BIM_Symbol' && hydraulicSymbols.some(s => s.type === selectedBIMSymbolType)
              ? 'bg-sky-100 border-sky-300 text-neutral-950 font-bold' 
              : ''
          }`}
        >
          <Crosshair size={12} className="text-sky-500" />
          <span>🚰 Idraulico</span>
          <ChevronDown size={11} className="text-neutral-500" />
        </button>

        {activeDropdown === 'idraulico' && (
          <div className="absolute top-7 left-0 w-48 bg-white rounded-lg shadow-xl border border-neutral-200 p-2 z-50 animate-fade-in text-xs max-h-72 overflow-y-auto">
            <span className="font-semibold text-[10px] uppercase text-neutral-400 block px-2 py-1 mb-1 border-b">Impianto Idraulico</span>
            
            <div className="px-2 py-2 border-b border-neutral-100 mb-1">
              <label className="flex justify-between text-[10px] text-neutral-500 mb-1">
                <span>Scala Simboli</span>
                <span>{bimSymbolScale}x</span>
              </label>
              <input 
                type="range" 
                min="0.1" 
                max="10" 
                step="0.1"
                value={bimSymbolScale}
                onChange={(e) => setBimSymbolScale?.(parseFloat(e.target.value))}
                className="w-full accent-slate-600"
              />
            </div>

            {hydraulicSymbols.map(sym => (
              <button
                key={sym.type}
                onClick={() => {
                  setSelectedBIMSymbolType(sym.type);
                  setSelectedTool('BIM_Symbol');
                  setActiveDropdown(null);
                }}
                className={`w-full text-left px-2 py-1.5 hover:bg-sky-50 transition rounded text-[11px] font-medium flex justify-between items-center ${
                  selectedBIMSymbolType === sym.type && selectedTool === 'BIM_Symbol'
                    ? 'bg-sky-50 text-sky-800 font-bold'
                    : 'text-neutral-700'
                }`}
              >
                <span>{sym.label}</span>
                {selectedBIMSymbolType === sym.type && selectedTool === 'BIM_Symbol' && <Check size={10} className="text-sky-600" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 8. FINITURE FLOORING HATCH DROPDOWN */}
      <div className="relative">
        <button
          onClick={() => toggleDropdown('finiture')}
          className={`px-2 py-0.5 rounded border flex items-center gap-1 text-xs transition bg-white border-neutral-300 hover:bg-neutral-100 ${
            selectedTool === 'BIM_Finitura'
              ? 'bg-purple-100 border-purple-300 text-neutral-950 font-bold' 
              : ''
          }`}
        >
          <Grid size={12} className="text-purple-500" />
          <span>🎨 Finiture</span>
          <ChevronDown size={11} className="text-neutral-500" />
        </button>

        {activeDropdown === 'finiture' && (
          <div className="absolute top-7 left-0 w-52 bg-white rounded-lg shadow-xl border border-neutral-200 p-2 z-50 animate-fade-in text-xs">
            <span className="font-semibold text-[10px] uppercase text-neutral-400 block px-2 py-1 border-b">Pavimentazioni Hatch</span>
            {finishPresets.map(preset => (
              <button
                key={preset.name}
                onClick={() => {
                  setDefaultHatchStyle({
                    pattern: preset.pattern,
                    scale: preset.scale,
                    angle: preset.angle,
                    color: '#6b7280',
                    sfumatura: 0
                  });
                  setSelectedTool('BIM_Finitura');
                  setActiveDropdown(null);
                }}
                className={`w-full text-left px-2 py-1.5 hover:bg-neutral-50 transition rounded text-[11px] font-medium flex justify-between items-center ${
                  selectedTool === 'BIM_Finitura' && defaultHatchStyle.pattern === preset.pattern
                    ? 'bg-purple-50 text-purple-800 font-bold'
                    : 'text-neutral-700'
                }`}
              >
                <span>{preset.name}</span>
                {selectedTool === 'BIM_Finitura' && defaultHatchStyle.pattern === preset.pattern && <Check size={10} className="text-purple-600" />}
              </button>
            ))}
            
            <div className="h-[1px] bg-neutral-150 my-1"/>
            <button
              onClick={() => {
                setSelectedTool('BIM_Finitura');
                setActiveDropdown(null);
              }}
              className="w-full mt-1 py-1 text-center bg-purple-600 hover:bg-purple-700 text-white font-bold rounded text-[10px] uppercase"
            >
              Usa Riempimento Attivo
            </button>
          </div>
        )}
      </div>

      <div className="h-4 w-[1px] bg-neutral-300 mx-1" />

      {/* 9. THE 3D VISUALIZATION INTEGRATION */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImportIFC} 
        accept=".ifc" 
        className="hidden" 
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-7 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold flex justify-center items-center shadow-md transition hover:scale-105 cursor-pointer ml-2"
        title="Importa file IFC"
      >
        <FolderOpen size={14} className="text-white drop-shadow-sm" />
      </button>

      <button
        onClick={() => exportEntitiesToIFC(entities)}
        className="w-7 h-7 rounded-lg bg-green-600 hover:bg-green-700 text-white font-extrabold flex justify-center items-center shadow-md transition hover:scale-105 cursor-pointer ml-2"
        title="Esporta in formato IFC (BIM)"
      >
        <ArrowDownToLine size={14} className="text-white drop-shadow-sm" />
      </button>

      <button
        onClick={() => {
          if (setEntities) {
            setEntities(prev => splitAllLinesAtIntersections(prev));
          }
        }}
        className="w-7 h-7 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-extrabold flex justify-center items-center shadow-md transition hover:scale-105 cursor-pointer ml-2"
        title="Atomizzazione Segmenti (Dividi tutto in Spezzoni Reali)"
      >
        <Scissors size={14} className="text-white drop-shadow-sm" />
      </button>

      <button
        onClick={() => {
          if (setEntities) {
            setEntities(prev => smartCleanDrawing(prev));
          }
        }}
        className="w-7 h-7 rounded-lg bg-pink-600 hover:bg-pink-700 text-white font-extrabold flex justify-center items-center shadow-md transition hover:scale-105 cursor-pointer ml-2"
        title="Super Pulizia Smart (Spezzoni + Trim + Snap Reali)"
      >
        <Sparkles size={14} className="text-white drop-shadow-sm" />
      </button>

      <button
        onClick={onOpen3DView}
        className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-600 to-cyan-500 hover:from-cyan-700 hover:to-cyan-600 text-white font-extrabold flex justify-center items-center shadow-md transition hover:scale-105 cursor-pointer ml-2"
        title="Apri Visualizzazione 3D BIM"
      >
        <Cuboid size={14} className="text-white drop-shadow-sm" />
      </button>

    </div>
  );
};
