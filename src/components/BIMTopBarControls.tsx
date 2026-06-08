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
  Video
} from 'lucide-react';
import { TEMPLATES, Template } from '../data/templates';

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
  bimWallThickness: number;
  setBimWallThickness: (val: number) => void;
  bimWallHeight: number;
  setBimWallHeight: (val: number) => void;
  bimDoorWidth: number;
  setBimDoorWidth: (val: number) => void;
  bimDoorHeight: number;
  setBimDoorHeight: (val: number) => void;
  bimWindowWidth: number;
  setBimWindowWidth: (val: number) => void;
  bimWindowHeight: number;
  setBimWindowHeight: (val: number) => void;
  bimSymbolScale?: number;
  setBimSymbolScale?: (val: number) => void;
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
  setBimSymbolScale
}) => {
  const [activeDropdown, setActiveDropdown] = useState<
    'porte' | 'finestre' | 'arredi' | 'sanitari' | 'elettrico' | 'idraulico' | 'finiture' | null
  >(null);

  const containerRef = useRef<HTMLDivElement>(null);

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
  const handleWallThicknessChange = (w: number) => {
    setBimWallThickness(w);
    localStorage.setItem('lastWallThickness', w.toString());
    cadCanvasRef.current?.setBIMDefaults(w, bimWallHeight, 'wall');
  };

  const handleWallHeightChange = (h: number) => {
    setBimWallHeight(h);
    localStorage.setItem('lastWallHeight', h.toString());
    cadCanvasRef.current?.setBIMDefaults(bimWallThickness, h, 'wall');
  };

  const handleDoorSpecsChange = (w: number, h: number) => {
    setBimDoorWidth(w);
    setBimDoorHeight(h);
    localStorage.setItem('lastDoorWidth', w.toString());
    localStorage.setItem('lastDoorHeight', h.toString());
    cadCanvasRef.current?.setBIMDefaults(w, h, 'door');
  };

  const handleWindowSpecsChange = (w: number, h: number) => {
    setBimWindowWidth(w);
    setBimWindowHeight(h);
    localStorage.setItem('lastWindowWidth', w.toString());
    localStorage.setItem('lastWindowHeight', h.toString());
    cadCanvasRef.current?.setBIMDefaults(w, h, 'window');
  };

  // Preset constants
  const wallThicknessPresets = [10, 15, 30, 40];
  const wallHeightPresets = [270, 300, 350];

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
      
      {/* 1. WALLS BUTTON & DROPDOWN */}
      <div className="relative flex items-center">
        <button
          onClick={() => {
            cadCanvasRef.current?.setBIMDefaults(bimWallThickness, bimWallHeight, 'wall');
            setSelectedTool('BIM_Muro');
          }}
          className={`px-2 py-0.5 rounded-l flex items-center gap-1 text-xs border border-r-0 transition ${
            selectedTool === 'BIM_Muro' 
              ? 'bg-cyan-100 text-cyan-950 font-bold border-cyan-300 shadow-sm' 
              : 'hover:bg-neutral-100 border-neutral-300 bg-white'
          }`}
          title="Disegna segmenti di muro continui (con Orto e Snap!)"
        >
          <Building size={12} className="text-cyan-600" />
          <span>Muro ({bimWallThickness}cm)</span>
        </button>
        <button
          onClick={() => toggleDropdown('muri')}
          className={`px-1 py-1 rounded-r border transition text-neutral-500 hover:text-neutral-900 ${
            activeDropdown === 'muri' ? 'bg-cyan-50 border-cyan-300' : 'hover:bg-neutral-100 border-neutral-300 bg-white'
          }`}
        >
          <ChevronDown size={11} />
        </button>

        {activeDropdown === 'muri' && (
          <div className="absolute top-7 left-0 w-52 bg-white rounded-lg shadow-xl border border-neutral-200 p-3 z-50 animate-fade-in text-xs space-y-3">
            <div>
              <span className="font-semibold text-[10px] uppercase text-neutral-400 block mb-1">Spessore Muro</span>
              <div className="grid grid-cols-4 gap-1 mb-2">
                {wallThicknessPresets.map(w => (
                  <button
                    key={w}
                    onClick={() => handleWallThicknessChange(w)}
                    className={`py-1 rounded text-[10px] font-mono font-bold border transition ${
                      bimWallThickness === w 
                        ? 'bg-cyan-50 border-cyan-500 text-cyan-800' 
                        : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:border-neutral-300'
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="1"
                max="120"
                value={bimWallThickness}
                onChange={(e) => handleWallThicknessChange(parseInt(e.target.value) || 15)}
                className="w-full bg-neutral-50 border border-neutral-200 text-neutral-800 rounded p-1 text-[11px] font-mono focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <span className="font-semibold text-[10px] uppercase text-neutral-400 block mb-1">Altezza Muro (cm)</span>
              <div className="grid grid-cols-3 gap-1 mb-2">
                {wallHeightPresets.map(h => (
                  <button
                    key={h}
                    onClick={() => handleWallHeightChange(h)}
                    className={`py-0.5 rounded text-[10px] font-mono font-bold border transition ${
                      bimWallHeight === h 
                        ? 'bg-cyan-50 border-cyan-500 text-cyan-800' 
                        : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:border-neutral-300'
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="100"
                max="600"
                value={bimWallHeight}
                onChange={(e) => handleWallHeightChange(parseInt(e.target.value) || 270)}
                className="w-full bg-neutral-50 border border-neutral-200 text-neutral-800 rounded p-1 text-[11px] font-mono"
              />
            </div>
            
            <button
              onClick={() => {
                setSelectedTool('BIM_Muro');
                setActiveDropdown(null);
              }}
              className="w-full py-1 text-center bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded text-[10px] uppercase tracking-wider"
            >
              Attiva Disegno Muri
            </button>
          </div>
        )}
      </div>

      {/* 2. DOORS BUTTON & DROPDOWN */}
      <div className="relative flex items-center">
        <button
          onClick={() => {
            cadCanvasRef.current?.setBIMDefaults(bimDoorWidth, bimDoorHeight, 'door');
            setSelectedTool('BIM_Porta');
          }}
          className={`px-2 py-0.5 rounded-l flex items-center gap-1 text-xs border border-r-0 transition ${
            selectedTool === 'BIM_Porta' 
              ? 'bg-indigo-100 text-indigo-950 font-bold border-indigo-300 shadow-sm' 
              : 'hover:bg-neutral-100 border-neutral-300 bg-white'
          }`}
          title="Inserisci porte lungo i muri con battuta automatica"
        >
          <span className="text-indigo-600 font-bold text-[10px]">🚪</span>
          <span>Porta ({bimDoorWidth}x{bimDoorHeight})</span>
        </button>
        <button
          onClick={() => toggleDropdown('porte')}
          className={`px-1 py-1 rounded-r border transition text-neutral-500 hover:text-neutral-900 ${
            activeDropdown === 'porte' ? 'bg-indigo-50 border-indigo-300' : 'hover:bg-neutral-100 border-neutral-300 bg-white'
          }`}
        >
          <ChevronDown size={11} />
        </button>

        {activeDropdown === 'porte' && (
          <div className="absolute top-7 left-0 w-48 bg-white rounded-lg shadow-xl border border-neutral-200 p-3 z-50 animate-fade-in text-xs space-y-2">
            <span className="font-semibold text-[10px] uppercase text-neutral-400 block pb-1 border-b">Preseleziona Dimensioni</span>
            <div className="grid grid-cols-2 gap-1.5">
              {doorPresets.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => {
                    handleDoorSpecsChange(preset.w, preset.h);
                    setSelectedTool('BIM_Porta');
                    setActiveDropdown(null);
                  }}
                  className={`p-1.5 rounded transition border text-[10px] font-mono text-center hover:border-indigo-400 ${
                    bimDoorWidth === preset.w && bimDoorHeight === preset.h
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold'
                      : 'bg-neutral-50 border-neutral-100 text-neutral-700'
                  }`}
                >
                  {preset.label} cm
                </button>
              ))}
            </div>

            <div className="h-[1px] bg-neutral-100 my-1"/>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <label className="block text-neutral-500 mb-0.5">Larghezza</label>
                <input
                  type="number"
                  value={bimDoorWidth}
                  onChange={(e) => handleDoorSpecsChange(parseInt(e.target.value) || 80, bimDoorHeight)}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded p-1 font-mono text-[10px]"
                />
              </div>
              <div>
                <label className="block text-neutral-500 mb-0.5">Altezza</label>
                <input
                  type="number"
                  value={bimDoorHeight}
                  onChange={(e) => handleDoorSpecsChange(bimDoorWidth, parseInt(e.target.value) || 210)}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded p-1 font-mono text-[10px]"
                />
              </div>
            </div>
            
            <button
              onClick={() => {
                setSelectedTool('BIM_Porta');
                setActiveDropdown(null);
              }}
              className="w-full mt-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded text-[10px] uppercase"
            >
              Usa Porta Personalizzata
            </button>
          </div>
        )}
      </div>

      {/* 3. WINDOWS BUTTON & DROPDOWN */}
      <div className="relative flex items-center">
        <button
          onClick={() => {
            cadCanvasRef.current?.setBIMDefaults(bimWindowWidth, bimWindowHeight, 'window');
            setSelectedTool('BIM_Finestra');
          }}
          className={`px-2 py-0.5 rounded-l flex items-center gap-1 text-xs border border-r-0 transition ${
            selectedTool === 'BIM_Finestra' 
              ? 'bg-blue-100 text-blue-950 font-bold border-blue-300 shadow-sm' 
              : 'hover:bg-neutral-100 border-neutral-300 bg-white'
          }`}
          title="Inserisci finestre lungo i muri strutturali"
        >
          <span className="text-blue-500 font-bold text-[10px]">🪟</span>
          <span>Finestra ({bimWindowWidth}x{bimWindowHeight})</span>
        </button>
        <button
          onClick={() => toggleDropdown('finestre')}
          className={`px-1 py-1 rounded-r border transition text-neutral-500 hover:text-neutral-900 ${
            activeDropdown === 'finestre' ? 'bg-blue-50 border-blue-300' : 'hover:bg-neutral-100 border-neutral-300 bg-white'
          }`}
        >
          <ChevronDown size={11} />
        </button>

        {activeDropdown === 'finestre' && (
          <div className="absolute top-7 left-0 w-48 bg-white rounded-lg shadow-xl border border-neutral-200 p-3 z-50 animate-fade-in text-xs space-y-2">
            <span className="font-semibold text-[10px] uppercase text-neutral-400 block pb-1 border-b">Finestre Preset</span>
            <div className="grid grid-cols-2 gap-1">
              {windowPresets.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => {
                    handleWindowSpecsChange(preset.w, preset.h);
                    setSelectedTool('BIM_Finestra');
                    setActiveDropdown(null);
                  }}
                  className={`p-1 rounded transition border text-[10px] font-mono text-center hover:border-blue-400 ${
                    bimWindowWidth === preset.w && bimWindowHeight === preset.h
                      ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold'
                      : 'bg-neutral-50 border-neutral-100 text-neutral-700'
                  }`}
                >
                  {preset.label} cm
                </button>
              ))}
            </div>

            <div className="h-[1px] bg-neutral-100 my-1"/>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <label className="block text-neutral-500 mb-0.5">Larghezza</label>
                <input
                  type="number"
                  value={bimWindowWidth}
                  onChange={(e) => handleWindowSpecsChange(parseInt(e.target.value) || 120, bimWindowHeight)}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded p-1 font-mono text-[10px]"
                />
              </div>
              <div>
                <label className="block text-neutral-500 mb-0.5">Altezza</label>
                <input
                  type="number"
                  value={bimWindowHeight}
                  onChange={(e) => handleWindowSpecsChange(bimWindowWidth, parseInt(e.target.value) || 140)}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded p-1 font-mono text-[10px]"
                />
              </div>
            </div>
            
            <button
              onClick={() => {
                setSelectedTool('BIM_Finestra');
                setActiveDropdown(null);
              }}
              className="w-full mt-1.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-[10px] uppercase"
            >
              Usa Finestra Specifica
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

      {/* 9. THE SCANSIONE PLANIMETRICA INTEGRATION */}
      <button
        onClick={() => {
          cadCanvasRef?.current?.autoScanBIM();
        }}
        className="px-3 py-0.5 rounded bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-700 hover:to-cyan-600 text-white font-extrabold text-xs flex items-center gap-1 shadow-xs transition hover:scale-[1.02] cursor-pointer"
        title="Software scansione automatica: Trova spazi chiusi per calcolare locali e generare etichette BIM"
      >
        <Sparkles size={11} className="text-yellow-200 animate-pulse" />
        <span>Scansione Planimetria 🤖</span>
      </button>

    </div>
  );
};
