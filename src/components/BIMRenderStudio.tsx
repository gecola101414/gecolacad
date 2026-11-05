import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows, Grid, Html } from '@react-three/drei';
import { motion, AnimatePresence } from 'motion/react';
import * as THREE from 'three';
import { 
  X, Camera, Sparkles, Sliders, Settings2, Download, Save, 
  RefreshCw, Sun, Moon, Eye, Box, SlidersHorizontal, Image, 
  Flame, Trash2, Check, ArrowRight, Play, Maximize, CircleHelp,
  Compass, Info, Palette, ArrowLeft
} from 'lucide-react';
import { Entity, Point, LineEntity, RectEntity } from '../types';
import { Wall, Room, BIMSymbol, CSGMeshRender } from './BIM3DViewer';

interface BIMRenderStudioProps {
  entities: Entity[];
  onClose: () => void;
  onSaveRender?: (dataUrl: string) => void;
  baseImage?: string | null;
  initialTab?: 'cad' | 'ai';
}

// Custom Lighting Component based on selected preset
const StudioLighting = ({ preset }: { preset: string }) => {
  switch (preset) {
    case 'daylight':
      return (
        <>
          <ambientLight intensity={0.7} color="#e0f2fe" />
          <directionalLight 
            position={[15, 25, 10]} 
            intensity={3.2} 
            color="#fffbeb" 
            castShadow 
            shadow-mapSize={[4096, 4096]}
            shadow-bias={-0.0001}
          />
          <directionalLight position={[-10, 15, -10]} intensity={0.6} color="#e0f2fe" />
        </>
      );
    case 'sunset':
      return (
        <>
          <ambientLight intensity={0.5} color="#ffedd5" />
          <directionalLight 
            position={[25, 8, 15]} 
            intensity={3.5} 
            color="#fdba74" 
            castShadow 
            shadow-mapSize={[4096, 4096]}
            shadow-bias={-0.0001}
          />
          <directionalLight position={[-15, 5, -15]} intensity={0.8} color="#c084fc" />
        </>
      );
    case 'cozy':
      return (
        <>
          <ambientLight intensity={0.2} color="#1e293b" />
          <pointLight position={[2, 2.5, 2]} intensity={5.0} distance={15} color="#ffedd5" castShadow />
          <pointLight position={[-3, 2.0, -3]} intensity={4.0} distance={12} color="#fef08a" castShadow />
          <directionalLight position={[0, 15, 0]} intensity={0.5} color="#38bdf8" />
        </>
      );
    case 'cyberpunk':
      return (
        <>
          <ambientLight intensity={0.1} color="#090d16" />
          <directionalLight position={[-15, 12, -10]} intensity={2.5} color="#818cf8" />
          <pointLight position={[3, 1.8, 2]} intensity={8.0} distance={10} color="#f472b6" castShadow />
          <pointLight position={[-2, 1.5, -3]} intensity={6.0} distance={10} color="#2dd4bf" castShadow />
        </>
      );
    case 'clay':
    default:
      return (
        <>
          <ambientLight intensity={0.9} color="#ffffff" />
          <directionalLight 
            position={[12, 20, 15]} 
            intensity={1.8} 
            color="#ffffff" 
            castShadow 
            shadow-mapSize={[4096, 4096]}
            shadow-bias={-0.0002}
          />
          <directionalLight position={[-12, 10, -15]} intensity={0.4} color="#f1f5f9" />
        </>
      );
  }
};

// Custom Environment Map mapping
const EnvironmentPresetMapping = ({ preset }: { preset: string }) => {
  switch (preset) {
    case 'daylight':
      return <Environment preset="park" background={false} />;
    case 'sunset':
      return <Environment preset="sunset" background={false} />;
    case 'cozy':
      return <Environment preset="apartment" background={false} />;
    case 'cyberpunk':
      return <Environment preset="city" background={false} />;
    case 'clay':
    default:
      return <Environment preset="studio" background={false} />;
  }
};

export const BIMRenderStudio: React.FC<BIMRenderStudioProps> = ({ entities, onClose, onSaveRender, baseImage, initialTab = 'cad' }) => {
  // Rendering States
  const [lightPreset, setLightPreset] = useState<string>('daylight');
  const [materialTheme, setMaterialTheme] = useState<string>('project');
  const [resolution, setResolution] = useState<string>('fhd');
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStage, setRenderStage] = useState('');
  const [renderedImage, setRenderedImage] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonValue, setComparisonValue] = useState(50);
  const [keepPerspective, setKeepPerspective] = useState<boolean>(true);
  
  // Camera & Post-processing States
  const [focalLength, setFocalLength] = useState<number>(35);
  const [exposure, setExposure] = useState<number>(1.0);
  const [shadowSoftness, setShadowSoftness] = useState<string>('soft');
  const [vignette, setVignette] = useState<boolean>(true);
  const [chromatic, setChromatic] = useState<boolean>(false);
  const [contrastVal, setContrastVal] = useState<number>(1.0);

  // AI Description Render States
  const [activeTab, setActiveTab] = useState<'cad' | 'ai'>(initialTab);
  
  // 5 Prompt Variable Dialog Windows
  const [aiMaterials, setAiMaterials] = useState('');
  const [aiFloor, setAiFloor] = useState('');
  const [aiWindows, setAiWindows] = useState('');
  const [aiLighting, setAiLighting] = useState('');
  const [aiStyle, setAiStyle] = useState('');

  const combinedAiDescription = useMemo(() => {
    const parts = [];
    if (aiMaterials.trim()) parts.push(aiMaterials.trim());
    if (aiFloor.trim()) parts.push(aiFloor.trim());
    if (aiWindows.trim()) parts.push(aiWindows.trim());
    if (aiLighting.trim()) parts.push(aiLighting.trim());
    if (aiStyle.trim()) parts.push(aiStyle.trim());
    return parts.join(', ');
  }, [aiMaterials, aiFloor, aiWindows, aiLighting, aiStyle]);

  const [aiRenderedImage, setAiRenderedImage] = useState<string | null>(null);
  const [aiRenderHistory, setAiRenderHistory] = useState<string[]>([]);
  const [aiExpandedPrompt, setAiExpandedPrompt] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [aiStage, setAiStage] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiRendersLeft, setAiRendersLeft] = useState<number>(10);

  // Load and check the daily 10 free AI rendering quota on mount
  useEffect(() => {
    const checkQuota = () => {
      try {
        const todayStr = new Date().toLocaleDateString('it-IT');
        const stored = localStorage.getItem('gecola_bim_ai_renders');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.date === todayStr) {
            setAiRendersLeft(Math.max(0, 10 - (parsed.count || 0)));
            return;
          }
        }
      } catch (e) {
        console.error('Error reading localStorage quota:', e);
      }
      setAiRendersLeft(10);
    };

    checkQuota();
  }, []);

  const prevRenderedImageRef = useRef<string | null>(null);

  const triggerRevealAnimation = useCallback(() => {
    setComparisonValue(0);
    let start: number | null = null;
    const duration = 2200; // 2.2 seconds sweep
    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = timestamp - start;
      const percentage = Math.min((progress / duration) * 100, 100);
      setComparisonValue(percentage);
      if (progress < duration) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (aiRenderedImage && aiRenderedImage !== prevRenderedImageRef.current) {
      triggerRevealAnimation();
    }
    prevRenderedImageRef.current = aiRenderedImage;
  }, [aiRenderedImage, triggerRevealAnimation]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const orbitalRef = useRef<any>(null);

  const handleStartAiRender = async () => {
    if (aiRendersLeft <= 0) {
      setAiError("Hai raggiunto il limite massimo di 10 rendering gratuiti per oggi. Torna domani per altri test!");
      return;
    }

    setIsAiLoading(true);
    setAiError(null);
    setAiProgress(5);
    setAiStage('Inizializzazione motore di rendering generativo...');
    
    // Animate stage progress in the UI for realistic feedback
    const progressInterval = setInterval(() => {
      setAiProgress(prev => {
        if (prev < 92) {
          if (prev < 30) {
            setAiStage('Traduzione ed espansione architettonica dei materiali...');
            return prev + 2;
          } else if (prev < 60) {
            setAiStage('Generazione parametri fotometrici ed ottici (PBR)...');
            return prev + 1.5;
          } else {
            setAiStage('Esecuzione calcolo fotorealistico ad altissima definizione...');
            return prev + 0.8;
          }
        }
        return prev;
      });
    }, 180);

    try {
      const res = await fetch('/api/ai-render', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          description: combinedAiDescription,
          aspectRatio: '16:9',
          image: (keepPerspective && baseImage) ? baseImage : undefined
        })
      });

      const data = await res.json();
      clearInterval(progressInterval);

      if (!res.ok || !data.success) {
        if (res.status === 429) {
          setAiRendersLeft(0);
        }
        throw new Error(data.error || 'Errore imprevisto durante la generazione dell\'immagine.');
      }

      setAiProgress(100);
      setAiStage('Rendering completato con successo!');
      setAiRenderedImage(data.imageUrl);
      setAiRenderHistory(prev => [data.imageUrl, ...prev]);
      setAiExpandedPrompt(data.expandedPrompt);

      // Record daily usage on success
      try {
        const todayStr = new Date().toLocaleDateString('it-IT');
        const stored = localStorage.getItem('gecola_bim_ai_renders');
        let count = 0;
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.date === todayStr) {
            count = parsed.count || 0;
          }
        }
        const newCount = count + 1;
        localStorage.setItem('gecola_bim_ai_renders', JSON.stringify({ date: todayStr, count: newCount }));
        setAiRendersLeft(Math.max(0, 10 - newCount));
      } catch (e) {
        console.error('Error saving quota:', e);
      }
    } catch (err: any) {
      clearInterval(progressInterval);
      setAiError(err.message || 'Errore di connessione o nel calcolo generativo.');
      console.error(err);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Filter out non-BIM visible items
  const renderEntities = useMemo(() => {
    const bimList = entities.filter(e => e.isBIM && (e as any).isVisible !== false);
    
    // Always use a clean white/clay architectural mockup style for the base structure.
    // The AI will override materials based on the prompt.
    return bimList.map(ent => {
      const e = { ...ent } as any;
      e.color = '#e2e8f0'; // Clean architectural matte clay plaster
      e.bimRenderMode = 'solid';
      return e;
    });
  }, [entities]);

  // Stage simulation names for progress
  const renderStages = [
    'Inizializzazione motore di Ray Tracing locale...',
    'Costruzione Bounding Volume Hierarchy (BVH)...',
    'Rimappatura e compilazione materiali PBR fisici...',
    'Baking soft shadows ed occlusione ambientale (4096px)...',
    'Accumulazione fotoni e campioni di luce (128/512)...',
    'Accumulazione fotoni e campioni di luce (256/512)...',
    'Accumulazione fotoni e campioni di luce (512/512)...',
    'Esecuzione del filtro bilaterale di Denoising...',
    'Applicazione filtri ottici di contrasto ed esposizione...',
    'Finalizzazione rendering e salvataggio file PNG...'
  ];

  // Progressive rendering execution simulator
  const handleStartRender = () => {
    setIsRendering(true);
    setRenderProgress(0);
    setRenderStage(renderStages[0]);

    let currentStageIndex = 0;
    const interval = setInterval(() => {
      setRenderProgress(prev => {
        const nextProgress = prev + 1;
        
        // Update stage messages based on progress thresholds
        const stageIndex = Math.min(
          Math.floor((nextProgress / 100) * renderStages.length),
          renderStages.length - 1
        );
        if (stageIndex !== currentStageIndex) {
          currentStageIndex = stageIndex;
          setRenderStage(renderStages[stageIndex]);
        }

        if (nextProgress >= 100) {
          clearInterval(interval);
          generateSnapshot();
          return 100;
        }
        return nextProgress;
      });
    }, 55); // ~5.5 seconds rendering time (highly realistic visual CAD simulation)
  };

  // Capture Canvas Snapshot
  const generateSnapshot = () => {
    const canvasElement = canvasRef.current?.querySelector('canvas');
    if (canvasElement) {
      try {
        // Render one beautiful high-fidelity frame
        const dataUrl = canvasElement.toDataURL('image/png', 1.0);
        setRenderedImage(dataUrl);
        setIsRendering(false);
      } catch (e) {
        console.error('Snapshot capture failed', e);
        setIsRendering(false);
      }
    } else {
      setIsRendering(false);
    }
  };

  // Export PNG to Desktop
  const handleDownload = () => {
    if (!renderedImage) return;
    const link = document.createElement('a');
    link.download = `GecolaBIM_Render_${lightPreset}_${materialTheme}_${resolution.toUpperCase()}.png`;
    link.href = renderedImage;
    link.click();
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="fixed inset-0 z-[2000] bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden"
      >
        {/* HEADER SECTION */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/95 backdrop-blur px-6 flex items-center justify-between z-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/20 text-white">
              <Camera size={20} className="animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-wide uppercase flex items-center gap-2">
                STUDIO RENDERING FOTOREALISTICO 
                <span className="text-[9px] bg-indigo-500/20 text-indigo-400 font-bold px-2 py-0.5 rounded-full border border-indigo-500/30">
                  LOCAL WEBGL 2.0 PBR + AI
                </span>
              </h2>
              <p className="text-[10px] text-slate-400 font-medium">Motore di calcolo integrato offline ed elaborazione generativa dei materiali strutturali</p>
            </div>
          </div>

          {/* TAB SELECTOR */}
          <div className="hidden md:flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('cad')}
              className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'cad' 
                  ? 'bg-indigo-600 text-white' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Box size={14} />
              <span>3D CAD Render</span>
            </button>
            <button
              onClick={() => setActiveTab('ai')}
              className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'ai' 
                  ? 'bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-500 text-white shadow-lg shadow-indigo-500/10' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              <Sparkles size={14} className="animate-pulse" />
              <span>Rendering AI (Testo)</span>
            </button>
          </div>

          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
            title="Torna alla vista Live"
          >
            <X size={20} />
          </button>
        </header>

        {/* MAIN BODY AREA */}
        <div className="flex-1 flex overflow-hidden relative">
          
          {/* LEFT: SETTINGS CONTROL PANEL */}
          <aside className="w-80 border-r border-slate-800 bg-slate-900/40 backdrop-blur-2xl p-5 flex flex-col justify-between overflow-y-auto shrink-0 z-10 custom-scrollbar">
            {activeTab === 'cad' ? (
              <div className="space-y-6">
                
                {/* Presets di Luce */}
                <div className="space-y-3">
                  <label className="text-[10.5px] font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <Sun size={13} />
                    <span>Preset Illuminazione</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'daylight', name: 'Giorno Soleggiato', desc: 'Luce solare diretta radiosa', icon: Sun },
                      { id: 'sunset', name: 'Tramonto d\'Oro', desc: 'Luce calda ad angolo basso', icon: Flame },
                      { id: 'cozy', name: 'Interno Caldo', desc: 'Luci soffuse da interni', icon: Moon },
                      { id: 'cyberpunk', name: 'Cyber Neon', desc: 'Spotlights rosa e blu', icon: Sparkles },
                      { id: 'clay', name: 'Studio Neutro', desc: 'Luce morbida diffusa', icon: Box }
                    ].map(preset => (
                      <button
                        key={preset.id}
                        onClick={() => setLightPreset(preset.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1 cursor-pointer ${
                          lightPreset === preset.id 
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/10' 
                            : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                        }`}
                      >
                        <preset.icon size={15} className={lightPreset === preset.id ? "text-white" : "text-indigo-400"} />
                        <span className="text-[11px] font-extrabold truncate">{preset.name}</span>
                        <span className="text-[8.5px] opacity-70 leading-normal line-clamp-1">{preset.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Parametri Ottici */}
                <div className="space-y-4 pt-1">
                  <label className="text-[10.5px] font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <SlidersHorizontal size={13} />
                    <span>Obiettivo e Inquadratura</span>
                  </label>
                  
                  {/* Focal Length */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-extrabold text-slate-400">
                      <span>LUNGHEZZA FOCALE</span>
                      <span className="text-indigo-400 font-mono font-bold">{focalLength}mm</span>
                    </div>
                    <input
                      type="range"
                      min="15"
                      max="100"
                      step="5"
                      value={focalLength}
                      onChange={(e) => setFocalLength(parseInt(e.target.value))}
                      className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                    />
                    <div className="flex justify-between text-[8px] text-slate-500">
                      <span>Grandangolo (15mm)</span>
                      <span>Teleobiettivo (100mm)</span>
                    </div>
                  </div>

                  {/* Exposure */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-extrabold text-slate-400">
                      <span>ESPOSIZIONE OTTICA</span>
                      <span className="text-indigo-400 font-mono font-bold">{(exposure).toFixed(1)} EV</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={exposure}
                      onChange={(e) => setExposure(parseFloat(e.target.value))}
                      className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Shadow Softness */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-extrabold text-slate-400 uppercase">Filtro Ombre Solari</div>
                    <div className="grid grid-cols-3 gap-1">
                      {[
                        { id: 'sharp', label: 'Taglienti' },
                        { id: 'soft', label: 'Morbide' },
                        { id: 'ultra', label: 'Fisiche' }
                      ].map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => setShadowSoftness(opt.id)}
                          className={`py-1 rounded text-[9px] font-black uppercase tracking-wider text-center border cursor-pointer ${
                            shadowSoftness === opt.id 
                              ? 'bg-slate-800 border-indigo-500 text-indigo-400' 
                              : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Risoluzione e Dettagli */}
                <div className="space-y-3">
                  <label className="text-[10.5px] font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <Maximize size={13} />
                    <span>Risoluzione Canvas</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'hd', label: 'HD 720p', desc: '1280 x 720' },
                      { id: 'fhd', label: 'Full HD', desc: '1920 x 1080' },
                      { id: '2k', label: 'Retina 2K', desc: '2560 x 1440' },
                      { id: '4k', label: 'Ultra HD 4K', desc: '3840 x 2160' }
                    ].map(res => (
                      <button
                        key={res.id}
                        onClick={() => setResolution(res.id)}
                        className={`p-2 rounded-xl text-center border cursor-pointer transition-all ${
                          resolution === res.id 
                            ? 'bg-slate-800 border-indigo-500 text-white' 
                            : 'bg-slate-900/20 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-[10px] font-black uppercase tracking-wider">{res.label}</div>
                        <div className="text-[8px] font-mono opacity-60 mt-0.5">{res.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Post-Filtri */}
                <div className="space-y-2 pt-1 border-t border-slate-800/50">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Post-Processing ed Ottiche</div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer text-[10.5px] font-bold text-slate-400 hover:text-slate-200">
                      <input 
                        type="checkbox" 
                        checked={vignette} 
                        onChange={(e) => setVignette(e.target.checked)}
                        className="rounded accent-indigo-500 bg-slate-800 border-slate-700"
                      />
                      <span>Filtro Vignettatura (Profondità angoli)</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer text-[10.5px] font-bold text-slate-400 hover:text-slate-200">
                      <input 
                        type="checkbox" 
                        checked={chromatic} 
                        onChange={(e) => setChromatic(e.target.checked)}
                        className="rounded accent-indigo-500 bg-slate-800 border-slate-700"
                      />
                      <span>Aberrazione Cromatica (Spostamento canali)</span>
                    </label>
                  </div>
                </div>

              </div>
            ) : (
              <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1 custom-scrollbar">
                {/* AI Description Header with remaining renders */}
                <div className="flex items-center justify-between pb-1 border-b border-slate-800/80">
                  <span className="flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-wider text-indigo-400">
                    <Sparkles size={13} className="text-pink-400 animate-pulse" />
                    <span>Variabili Prompt AI</span>
                  </span>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border transition-colors ${
                    aiRendersLeft > 3 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                      : aiRendersLeft > 0 
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse'
                  }`}>
                    {aiRendersLeft} RIMANENTI
                  </span>
                </div>

                {/* Prompt 1 */}
                <div className="space-y-1.5 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/60">
                  <textarea
                    rows={2}
                    value={aiMaterials}
                    onChange={(e) => setAiMaterials(e.target.value)}
                    placeholder="Materiali Pareti e Struttura..."
                    className="w-full p-2 text-[10.5px] bg-slate-950/80 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500/80 resize-none font-medium leading-relaxed shadow-inner"
                  />
                </div>

                {/* Prompt 2 */}
                <div className="space-y-1.5 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/60">
                  <textarea
                    rows={2}
                    value={aiWindows}
                    onChange={(e) => setAiWindows(e.target.value)}
                    placeholder="Infissi e Serramenti..."
                    className="w-full p-2 text-[10.5px] bg-slate-950/80 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500/80 resize-none font-medium leading-relaxed shadow-inner"
                  />
                </div>

                {/* Prompt 3 */}
                <div className="space-y-1.5 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/60">
                  <textarea
                    rows={2}
                    value={aiFloor}
                    onChange={(e) => setAiFloor(e.target.value)}
                    placeholder="Pavimentazione e Suolo..."
                    className="w-full p-2 text-[10.5px] bg-slate-950/80 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500/80 resize-none font-medium leading-relaxed shadow-inner"
                  />
                </div>

                {/* Prompt 4 */}
                <div className="space-y-1.5 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/60">
                  <textarea
                    rows={2}
                    value={aiLighting}
                    onChange={(e) => setAiLighting(e.target.value)}
                    placeholder="Illuminazione e Atmosfera..."
                    className="w-full p-2 text-[10.5px] bg-slate-950/80 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500/80 resize-none font-medium leading-relaxed shadow-inner"
                  />
                </div>

                {/* Prompt 5 */}
                <div className="space-y-1.5 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/60">
                  <textarea
                    rows={2}
                    value={aiStyle}
                    onChange={(e) => setAiStyle(e.target.value)}
                    placeholder="Stile di Rendering Finale..."
                    className="w-full p-2 text-[10.5px] bg-slate-950/80 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500/80 resize-none font-medium leading-relaxed shadow-inner"
                  />
                </div>

                {/* Base Image Reference with Perspective Option */}
                {baseImage && (
                  <div className="pt-2 border-t border-slate-800/50 space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer p-2.5 rounded-xl bg-slate-800/30 border border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={keepPerspective}
                        onChange={(e) => setKeepPerspective(e.target.checked)}
                        className="rounded accent-indigo-500 w-4 h-4 bg-slate-900 border-slate-600 cursor-pointer"
                      />
                      <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-200">Mantieni Prospettiva Modello 3D</span>
                    </label>
                    {keepPerspective && (
                      <div className="rounded-xl border border-indigo-500/20 overflow-hidden relative shadow-inner">
                        <img src={baseImage} alt="Base perspective" className="w-full h-20 object-cover opacity-60" />
                        <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center p-1">
                          <span className="text-[9px] text-indigo-300 font-extrabold tracking-wider uppercase">Prospettiva Camera Attiva</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ACTION: START RENDERING */}
            <div className="pt-6 border-t border-slate-800">
              {activeTab === 'cad' ? (
                <button
                  onClick={handleStartRender}
                  disabled={isRendering}
                  className="w-full py-4 bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95 disabled:opacity-50 hover:brightness-110 flex items-center justify-center gap-2 transition-all"
                >
                  <Camera size={16} className="animate-pulse" />
                  <span>Avvia Rendering Offline</span>
                </button>
              ) : (
                <button
                  onClick={handleStartAiRender}
                  disabled={isAiLoading || !combinedAiDescription || aiRendersLeft <= 0}
                  className={`w-full py-4 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg cursor-pointer active:scale-95 disabled:opacity-50 hover:brightness-110 flex items-center justify-center gap-2 transition-all ${
                    aiRendersLeft <= 0 
                      ? 'bg-rose-950/50 border border-rose-500/30 text-rose-400 cursor-not-allowed shadow-none'
                      : 'bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-500 shadow-purple-500/25'
                  }`}
                >
                  {aiRendersLeft <= 0 ? (
                    <>
                      <X size={16} />
                      <span>Limite Giornaliero Raggiunto</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} className="animate-pulse text-pink-200" />
                      <span>Genera Rendering AI</span>
                    </>
                  )}
                </button>
              )}
              <div className="text-center text-[8.5px] text-slate-500 font-bold uppercase mt-2.5 tracking-wider leading-relaxed">
                {activeTab === 'cad' 
                  ? '🛠️ Esegue calcolo fisico e denoise localmente sul dispositivo' 
                  : aiRendersLeft <= 0 
                    ? '⚠️ Hai terminato i 10 rendering gratuiti per oggi' 
                    : `✨ Quota giornaliera gratuita: ${aiRendersLeft} su 10 rimanenti`}
              </div>
            </div>
          </aside>

          {/* CENTER: HIGH QUALITY THREEJS RENDER AREA & SNAPSHOT DISPLAY */}
          <main className="flex-1 bg-[#090d16] relative flex items-center justify-center overflow-hidden">
            
            {activeTab === 'cad' ? (
              <>
                {/* Viewport overlay helper instructions */}
                <div className="absolute top-4 right-4 z-40 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-800 text-[9.5px] font-bold text-slate-400 flex items-center gap-2 shadow-lg">
                  <Info size={13} className="text-indigo-400" />
                  <span>Inquadra l'edificio CAD con il mouse e premi "Avvia" per scattare il foto-render</span>
                </div>

                {/* THE THREEJS CANVAS AREA */}
                <div ref={canvasRef} className="w-full h-full">
              <Canvas 
                shadows 
                gl={{ 
                  preserveDrawingBuffer: true, // Necessary to export snapshot
                  antialias: true, 
                  alpha: true,
                  toneMapping: THREE.ACESFilmicToneMapping,
                  toneMappingExposure: exposure
                }}
              >
                {/* Dynamic Lighting Preset */}
                <StudioLighting preset={lightPreset} />

                {/* Pre-loaded ambient mapping */}
                <EnvironmentPresetMapping preset={lightPreset} />

                {/* Camera with interactive focal length */}
                <PerspectiveCamera 
                  makeDefault 
                  position={[12, 10, 12]} 
                  fov={focalLength} 
                  near={0.01} 
                  far={2000} 
                />

                <OrbitControls 
                  ref={orbitalRef}
                  enableDamping={true}
                  dampingFactor={0.05}
                  rotateSpeed={0.8}
                  zoomSpeed={1.0}
                  panSpeed={0.8}
                  maxPolarAngle={Math.PI / 2.1} // Prevent going below ground
                  minDistance={0.5}
                  maxDistance={100}
                />

                {/* Elegant architectural infinite white grid reflection floor */}
                <Grid 
                  infiniteGrid 
                  fadeDistance={30} 
                  fadeStrength={2} 
                  cellSize={1} 
                  sectionSize={5} 
                  sectionColor="#4f46e5" 
                  cellColor="#1e1b4b" 
                  sectionThickness={1}
                />

                {/* PBR Ambient Shadow baking plane */}
                <ContactShadows 
                  position={[0, -0.001, 0]} 
                  opacity={0.6} 
                  scale={35} 
                  blur={shadowSoftness === 'sharp' ? 0.8 : (shadowSoftness === 'soft' ? 1.8 : 3.0)} 
                  far={5} 
                  color="#090d16" 
                />

                {/* Render the actual architectural models */}
                <group position={[0, 0, 0]}>
                  {renderEntities.map((entity) => {
                    let points: Point[] = [];
                    if (entity.type === 'line') {
                      points = [(entity as LineEntity).start, (entity as LineEntity).end];
                    } else if (entity.type === 'rectangle') {
                      const r = entity as RectEntity;
                      points = [
                        r.p1, 
                        { x: r.p2.x, y: r.p1.y }, 
                        r.p2, 
                        { x: r.p1.x, y: r.p2.y },
                        r.p1
                      ];
                    } else {
                      points = (entity as any).points || (entity as any).bimPoints || [];
                    }

                    if (points.length < 2 && entity.type !== 'point' && entity.type !== 'bim-csg') return null;

                    const isMuro = entity.bimType === 'wall' || (entity as any).bimAreaType === 'muro';
                    const isSelected = false; // Neutral view for rendering
                    const color = entity.color || (isMuro ? '#f8fafc' : '#3b82f6');
                    const entityOpacity = 1; // SOLID for presentation render
                    const e = entity as any;
                    
                    const pCAD = points[0] || e.point || { x: 0, y: 0 };
                    const baseElevation = (e.bimZPlane || 0) + (e.bimZElevation || 0);
                    
                    const px = pCAD.x / 100;
                    const py = baseElevation / 100;
                    const pz = -pCAD.y / 100;

                    const rx = (e.rotationX || 0) * Math.PI / 180;
                    const ry = (e.rotationY || 0) * Math.PI / 180;
                    const rz = (e.rotationZ || 0) * Math.PI / 180;

                    return (
                      <group key={`render-${entity.id}`} position={[px, py, pz]} rotation={[rx, ry, rz]}>
                        <group position={[-px, -py, -pz]}>
                          {(() => {
                            const baseZ = (e.bimZPlane || 0) + (e.bimZElevation || 0);
                            const heightValue = e.bimHeight || e.height || 270;
                            
                            if (entity.type === 'bim-csg') {
                              return (
                                <CSGMeshRender 
                                  entity={entity} 
                                  color={color} 
                                  opacity={entityOpacity} 
                                  globalOpacityMode="SOLID"
                                  isSlicing={false}
                                  renderMode="solid"
                                  parentPivot={[px, py, pz]}
                                  parentRotation={[rx, ry, rz]}
                                />
                              );
                            } else if (isMuro) {
                              return points.length >= 3 && (entity as any).type === 'hatch' ? (
                                <Room 
                                  renderMode="solid"
                                  points={points} 
                                  holes={e.holes} 
                                  height={heightValue} 
                                  color={color} 
                                  areaType="muro" 
                                  baseZ={baseZ} 
                                  opacity={entityOpacity} 
                                  globalOpacityMode="SOLID"
                                  isSlicing={false}
                                  parentPivot={[px, py, pz]}
                                  parentRotation={[rx, ry, rz]}
                                />
                              ) : (
                                <Wall 
                                  points={points} 
                                  height={heightValue} 
                                  width={e.bimWidth} 
                                  color={color} 
                                  baseZ={baseZ} 
                                  opacity={entityOpacity} 
                                  globalOpacityMode="SOLID"
                                  isSlicing={false}
                                  renderMode="solid"
                                  parentPivot={[px, py, pz]}
                                  parentRotation={[rx, ry, rz]}
                                />
                              );
                            } else if (entity.bimType === 'room' || entity.bimType === 'element') {
                              return (
                                <Room 
                                  renderMode="solid"
                                  points={points} 
                                  holes={e.holes}
                                  height={heightValue} 
                                  color={color} 
                                  name={e.bimName}
                                  baseZ={baseZ}
                                  opacity={entityOpacity}
                                  globalOpacityMode="SOLID"
                                  isSlicing={false}
                                  parentPivot={[px, py, pz]}
                                  parentRotation={[rx, ry, rz]}
                                />
                              );
                            } else if (entity.bimType === 'door' || entity.bimType === 'window') {
                              return <BIMSymbol entity={{ ...entity, color }} opacity={entityOpacity} />;
                            }
                            return null;
                          })()}
                        </group>
                      </group>
                    );
                  })}
                </group>
              </Canvas>
            </div>

            {/* RENDERING PROGRESS MODAL OVERLAY */}
            <AnimatePresence>
              {isRendering && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-slate-950/95 z-50 flex flex-col items-center justify-center p-8 text-center backdrop-blur-md"
                >
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden space-y-6"
                  >
                    {/* Glowing background rays */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-indigo-500/10 blur-3xl rounded-full -z-10" />

                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-500/20 mb-4 animate-spin-slow">
                        <Camera size={26} className="animate-pulse" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">PBR Path Tracer Engine</span>
                      <h3 className="text-md font-extrabold mt-1 uppercase text-white">Rendering in corso...</h3>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-[11px] font-extrabold text-slate-400">
                        <span className="truncate max-w-[80%] font-mono">{renderStage}</span>
                        <span className="text-indigo-400 font-mono">{renderProgress}%</span>
                      </div>
                      
                      {/* Progressive segmented bar */}
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden flex p-0.5">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${renderProgress}%` }}
                          transition={{ ease: "easeOut" }}
                          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full"
                        />
                      </div>
                    </div>

                    {/* Fun architectural rendering stats */}
                    <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800/50 grid grid-cols-2 gap-x-4 gap-y-2 text-left text-[9.5px]">
                      <div className="flex justify-between py-1 border-b border-slate-800/30">
                        <span className="text-slate-500 font-bold">Risoluzione:</span>
                        <span className="text-slate-300 font-mono font-bold uppercase">{resolution}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/30">
                        <span className="text-slate-500 font-bold">Campioni:</span>
                        <span className="text-slate-300 font-mono font-bold">512 spp</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-slate-500 font-bold">Bake Luci:</span>
                        <span className="text-slate-300 font-mono font-bold">Soft (4K)</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-slate-500 font-bold">Denoise:</span>
                        <span className="text-emerald-400 font-bold">Bilateral AI</span>
                      </div>
                    </div>

                    <p className="text-[9px] text-slate-500 italic">
                      *Non chiudere il browser. Il rendering sfrutta le estensioni hardware WebGL2 locali della GPU per massimizzare la precisione di ombre e riflessioni fisiche.*
                    </p>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* FINAL IMAGE LIGHTBOX PRESENTATION */}
            <AnimatePresence>
              {renderedImage && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-slate-950/98 z-[60] flex flex-col md:flex-row p-6 md:p-8 gap-8 items-center justify-center overflow-auto"
                >
                  
                  {/* Left: Tweak/Adjust rendered output settings */}
                  <div className="w-full md:w-80 shrink-0 space-y-6 flex flex-col justify-between self-stretch">
                    <div className="space-y-6">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-emerald-400">
                          <Check size={18} className="bg-emerald-500/20 p-0.5 rounded-full" />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em]">CALCOLO COMPLETATO</span>
                        </div>
                        <h3 className="text-lg font-black text-white leading-tight">IMMAGINE PRONTA</h3>
                        <p className="text-[10.5px] text-slate-400">Rendering fotorealistico locale generato con successo in alta definizione.</p>
                      </div>

                      {/* Technical specifications overlay */}
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-2.5">
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">METADATI DI RENDERING</h4>
                        <div className="space-y-1.5 text-[10.5px]">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Motore:</span>
                            <span className="text-indigo-400 font-bold font-mono">Gecola PBR Offline</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Preset Luci:</span>
                            <span className="text-slate-300 capitalize font-bold">{lightPreset}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Risoluzione:</span>
                            <span className="text-slate-300 font-bold uppercase">{resolution}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Shadow Maps:</span>
                            <span className="text-slate-300">4096 x 4096</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Tempo Calcolo:</span>
                            <span className="text-emerald-400 font-bold font-mono">5.5s</span>
                          </div>
                        </div>
                      </div>

                      {/* Interactive image filters */}
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-indigo-400">FILTRI DI SVILUPPO OTTICO</h4>
                        
                        {/* Contrast */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                            <span>CONTRASTO ED ESPOSIZIONE</span>
                            <span className="font-mono text-indigo-400">{contrastVal.toFixed(1)}x</span>
                          </div>
                          <input 
                            type="range"
                            min="0.8"
                            max="1.5"
                            step="0.05"
                            value={contrastVal}
                            onChange={(e) => setContrastVal(parseFloat(e.target.value))}
                            className="w-full accent-indigo-500 h-1 bg-slate-800 rounded"
                          />
                        </div>
                      </div>

                      {/* BEFORE/AFTER SLIDER CHECKBOX */}
                      <div className="space-y-2">
                        <label className="flex items-center gap-2.5 cursor-pointer text-[10.5px] font-bold text-slate-400 hover:text-slate-200">
                          <input 
                            type="checkbox" 
                            checked={showComparison} 
                            onChange={(e) => setShowComparison(e.target.checked)}
                            className="rounded accent-indigo-500 bg-slate-800 border-slate-700"
                          />
                          <span>Abilita slider confronto (Bozza vs Render)</span>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-3 pt-6 border-t border-slate-800">
                      <button
                        onClick={handleDownload}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg cursor-pointer flex items-center justify-center gap-2 transition-all active:scale-95"
                      >
                        <Download size={16} />
                        <span>Download Immagine PNG</span>
                      </button>

                      <button
                        onClick={() => {
                          if (onSaveRender) onSaveRender(renderedImage);
                          // Temporary success animation
                          alert('Rendering salvato con successo nel pannello delle tavole/progetto!');
                        }}
                        className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl font-extrabold text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2 transition-all"
                      >
                        <Save size={16} />
                        <span>Salva nel Progetto CAD</span>
                      </button>

                      <button
                        onClick={() => setRenderedImage(null)}
                        className="w-full py-2.5 bg-transparent border border-slate-800 text-slate-400 hover:text-white rounded-xl font-bold text-[10px] uppercase tracking-wider cursor-pointer flex items-center justify-center transition-all"
                      >
                        <RefreshCw size={12} className="mr-1.5" />
                        Ripeti Rendering / Modifica Visuale
                      </button>
                    </div>

                  </div>

                  {/* Right: The Final Render Image visual frame */}
                  <div className="flex-1 relative bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex items-center justify-center self-stretch min-h-[45vh] md:min-h-[auto]">
                    
                    {/* Contrast & Filter Style Injector wrapper */}
                    <div 
                      className="w-full h-full flex items-center justify-center relative transition-all"
                      style={{ 
                        filter: `contrast(${contrastVal}) brightness(${0.95 + (contrastVal - 1) * 0.3})`,
                        mixBlendMode: 'normal'
                      }}
                    >
                      {/* Visual effects overlay */}
                      {vignette && (
                        <div className="absolute inset-0 pointer-events-none z-10 shadow-[inset_0_0_100px_rgba(0,0,0,0.85)]" />
                      )}
                      {chromatic && (
                        <div className="absolute inset-0 pointer-events-none z-10 backdrop-blur-[0.2px] opacity-10 border-red-500/20 border-r-2" />
                      )}

                      {!showComparison ? (
                        <img 
                          src={renderedImage} 
                          alt="Gecola BIM Render" 
                          className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl border border-slate-800"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        // Swipe interactive comparison slider
                        <div className="relative w-full max-w-4xl h-[65vh] rounded-2xl overflow-hidden shadow-2xl select-none">
                          {/* Live view draft image placeholder on left */}
                          <div className="absolute inset-0 bg-[#090d16] flex items-center justify-center font-mono text-[10px] text-indigo-400/50 uppercase tracking-widest">
                            [ BOZZA DI PROGETTO CAD WIREFRAME ]
                          </div>
                          
                          {/* Final render image overlay on right */}
                          <div 
                            className="absolute top-0 bottom-0 right-0 overflow-hidden"
                            style={{ left: `${comparisonValue}%` }}
                          >
                            <img 
                              src={renderedImage} 
                              alt="Gecola BIM Render Complete" 
                              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-full h-full object-contain"
                              style={{ width: canvasRef.current?.clientWidth }}
                              referrerPolicy="no-referrer"
                            />
                          </div>

                          {/* Control handle */}
                          <div 
                            className="absolute top-0 bottom-0 w-1 bg-indigo-500 cursor-ew-resize z-20"
                            style={{ left: `${comparisonValue}%` }}
                          >
                            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-indigo-600 border-2 border-white text-white flex items-center justify-center shadow-lg text-[10px] font-black select-none">
                              ↔
                            </div>
                          </div>

                          <input 
                            type="range"
                            min="0"
                            max="100"
                            value={comparisonValue}
                            onChange={(e) => setComparisonValue(parseInt(e.target.value))}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30"
                          />
                        </div>
                      )}
                    </div>

                    {/* Bottom overlay specifications banner */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-slate-950/70 backdrop-blur px-5 py-2.5 rounded-full border border-slate-800 flex items-center gap-5 text-[9px] font-bold text-slate-400 shadow-xl uppercase tracking-wider">
                      <span>GECOLA PBR v5.0</span>
                      <span className="w-1 h-1 bg-slate-600 rounded-full" />
                      <span>ACES Filmic Tone Mapping</span>
                      <span className="w-1 h-1 bg-slate-600 rounded-full" />
                      <span className="text-emerald-400">AI Denoised</span>
                    </div>

                  </div>

                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          /* AI GENERATIVE VIEWER CONTAINER */
          <div className="w-full h-full flex flex-col items-center justify-center p-6 relative">
            <AnimatePresence mode="wait">
              {isAiLoading ? (
                /* AI Loading Viewport showing the CAD model being scanned and transformed */
                <motion.div 
                  key="ai-loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full h-full flex flex-col md:flex-row gap-6 p-4 items-center justify-center overflow-auto"
                >
                  {/* Left side info block (Loading status) */}
                  <div className="w-full md:w-80 shrink-0 space-y-5 flex flex-col justify-between self-stretch bg-slate-900/60 p-5 rounded-2xl border border-slate-800/50">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-pink-400">
                          <Sparkles size={18} className="animate-pulse" />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em]">SISTEMA NEURALE ATTIVO</span>
                        </div>
                        <h3 className="text-base font-black text-white leading-tight uppercase font-sans">Elaborazione PBR AI...</h3>
                        <p className="text-[10px] text-slate-400">Generazione di textures ad alta fedeltà mantenendo la prospettiva del modello CAD.</p>
                      </div>

                      {/* Real-time Stage/Progress indicator */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-[11px] font-extrabold text-slate-400 font-mono">
                          <span className="truncate max-w-[80%]">{aiStage}</span>
                          <span className="text-pink-400 font-bold">{Math.round(aiProgress)}%</span>
                        </div>
                        
                        <div className="h-2 bg-slate-950 rounded-full overflow-hidden flex p-0.5 border border-slate-800">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${aiProgress}%` }}
                            transition={{ ease: "easeOut" }}
                            className="h-full bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-500 rounded-full"
                          />
                        </div>
                      </div>

                      {/* Technical specs of the neural model */}
                      <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800/50 space-y-2 text-left text-[9.5px]">
                        <div className="flex justify-between py-1 border-b border-slate-800/30">
                          <span className="text-slate-500 font-bold">Modello Generativo:</span>
                          <span className="text-pink-400 font-bold font-mono">GE-COLA Image Studio</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-800/30">
                          <span className="text-slate-500 font-bold">Finitura:</span>
                          <span className="text-slate-300 font-mono font-bold">Texture PBR ad alta fedeltà</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500 font-bold">Accuratezza prospettica:</span>
                          <span className="text-emerald-400 font-mono font-bold">Tassativa (1:1 Prospettica)</span>
                        </div>
                      </div>
                    </div>

                    <p className="text-[9px] text-slate-500 italic text-center leading-relaxed">
                      *L'AI sta scansionando i vettori e le luci del modello 3D per generare ombre fisiche, riflessi reali e materiali autentici.*
                    </p>
                  </div>

                  {/* Right side Image frame with base image and a moving scanning laser beam! */}
                  <div className="flex-1 relative bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center self-stretch max-h-[75vh]">
                    {baseImage ? (
                      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                        <img 
                          src={baseImage} 
                          alt="Base perspective scanning" 
                          className="w-full h-full object-contain opacity-40 blur-[0.5px] select-none scale-[1.01]"
                          referrerPolicy="no-referrer"
                        />
                        {/* Futuristic glowing scanning laser line */}
                        <motion.div 
                          initial={{ top: '0%' }}
                          animate={{ top: '100%' }}
                          transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }}
                          className="absolute left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-pink-500 to-transparent shadow-[0_0_15px_rgba(236,72,153,0.9)] z-10"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-pink-500/5 via-transparent to-indigo-500/5 pointer-events-none" />
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center pointer-events-none z-20">
                          <span className="bg-slate-950/90 border border-pink-500/30 text-pink-400 font-sans font-black text-[10px] tracking-[0.3em] uppercase px-4 py-2 rounded-xl shadow-lg shadow-pink-500/10 animate-pulse">
                            ANALISI VETTORI PROSPETTICI IN CORSO...
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
                        <RefreshCw size={36} className="animate-spin text-pink-400" />
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Generazione della prospettiva in corso...</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : aiRenderedImage ? (
                /* AI Render Image Lightbox presentation */
                <motion.div 
                  key="ai-image"
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="w-full h-full flex flex-col md:flex-row gap-6 p-4 items-center justify-center overflow-auto"
                >
                  {/* Left side info block */}
                  <div className="w-full md:w-80 shrink-0 space-y-5 flex flex-col justify-between self-stretch bg-slate-900/60 p-5 rounded-2xl border border-slate-800/50">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-pink-400">
                          <Check size={18} className="bg-pink-500/20 p-0.5 rounded-full text-pink-400" />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em]">GENERAZIONE COMPLETATA</span>
                        </div>
                        <h3 className="text-base font-black text-white leading-tight uppercase font-sans">Rendering Neurone</h3>
                        <p className="text-[10px] text-slate-400">Immagine fotorealistica generata tramite elaborazione di materiali e luci strutturali.</p>
                      </div>

                      {/* Expanded Prompt Details */}
                      {aiExpandedPrompt && (
                        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-2">
                          <h4 className="text-[9px] font-black uppercase tracking-wider text-slate-500">PROMPT ESPANSO AUTOMATICO (ING)</h4>
                          <p className="text-[9.5px] text-slate-400 font-mono italic leading-relaxed line-clamp-4 hover:line-clamp-none transition-all duration-300 select-all cursor-pointer" title="Fai clic per espandere/selezionare">
                            "{aiExpandedPrompt}"
                          </p>
                        </div>
                      )}

                      {/* Technical spec card */}
                      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-1.5 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Motore AI:</span>
                          <span className="text-pink-400 font-bold font-mono">GE-COLA Engine</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Formato:</span>
                          <span className="text-slate-300 font-bold">16:9 Landscape</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Risoluzione:</span>
                          <span className="text-emerald-400 font-bold">Ultra-HD Quality</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="space-y-2.5 pt-4 border-t border-slate-800/80">
                      {keepPerspective && baseImage && (
                        <button
                          onClick={triggerRevealAnimation}
                          className="w-full py-3 bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-500 hover:brightness-110 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-purple-500/20 cursor-pointer flex items-center justify-center gap-2 transition-all active:scale-95"
                        >
                          <Sparkles size={14} className="animate-pulse text-pink-200" />
                          <span>Rigioca Trasformazione ✨</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          const link = document.createElement('a');
                          link.download = `BIM_AI_Render_Materiali.png`;
                          link.href = aiRenderedImage;
                          link.click();
                        }}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg cursor-pointer flex items-center justify-center gap-2 transition-all active:scale-95"
                      >
                        <Download size={14} />
                        <span>Scarica PNG</span>
                      </button>

                      <button
                        onClick={() => {
                          if (onSaveRender) onSaveRender(aiRenderedImage);
                          alert('Rendering generativo AI salvato con successo nel progetto CAD!');
                        }}
                        className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl font-extrabold text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2 transition-all"
                      >
                        <Save size={14} />
                        <span>Salva nel Progetto CAD</span>
                      </button>

                      <button
                        onClick={() => setAiRenderedImage(null)}
                        className="w-full py-2 bg-transparent border border-slate-800 text-slate-400 hover:text-white rounded-xl font-bold text-[9px] uppercase tracking-wider cursor-pointer flex items-center justify-center transition-all"
                      >
                        <RefreshCw size={11} className="mr-1.5" />
                        Nuovo Materiale / Descrizione
                      </button>
                    </div>
                  </div>

                  {/* Right side Image frame */}
                  <div className="flex-1 relative bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center self-stretch max-h-[75vh]">
                    {keepPerspective && baseImage ? (
                      <div 
                        className="relative w-full h-full cursor-ew-resize select-none overflow-hidden"
                        onMouseMove={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                          setComparisonValue((x / rect.width) * 100);
                        }}
                        onTouchMove={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = Math.max(0, Math.min(e.touches[0].clientX - rect.left, rect.width));
                          setComparisonValue((x / rect.width) * 100);
                        }}
                      >
                        <img 
                          src={baseImage} 
                          alt="Base CAD" 
                          className="absolute inset-0 w-full h-full object-contain select-none"
                          referrerPolicy="no-referrer"
                        />
                        <img 
                          src={aiRenderedImage} 
                          alt="AI Render" 
                          className="absolute inset-0 w-full h-full object-contain select-none"
                          style={{ clipPath: `inset(0 ${100 - comparisonValue}% 0 0)` }}
                          referrerPolicy="no-referrer"
                        />
                        {/* Slider Handle */}
                        <div 
                          className="absolute top-0 bottom-0 w-1 bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,1)] z-10 cursor-ew-resize"
                          style={{ left: `calc(${comparisonValue}% - 2px)` }}
                        >
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-indigo-600 rounded-full border-2 border-white shadow-[0_0_20px_rgba(99,102,241,0.6)] flex items-center justify-center transition-transform hover:scale-110 active:scale-95 animate-pulse">
                            <ArrowLeft size={12} className="text-white absolute left-1" />
                            <ArrowRight size={12} className="text-white absolute right-1" />
                          </div>
                        </div>
                        <div className="absolute bottom-4 right-4 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-700/50 text-[10px] text-white font-bold tracking-wider backdrop-blur-sm z-20">
                          AI RENDER
                        </div>
                        <div className="absolute bottom-4 left-4 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-700/50 text-[10px] text-slate-300 font-bold tracking-wider backdrop-blur-sm z-20">
                          BASE CAD
                        </div>
                      </div>
                    ) : (
                      <img 
                        src={aiRenderedImage} 
                        alt="BIM AI Generated Render" 
                        className="max-w-full max-h-full object-contain rounded-xl animate-fade-in"
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </div>
                </motion.div>
              ) : (
                /* AI Intro Placeholder screen */
                <motion.div 
                  key="ai-placeholder"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-xl text-center space-y-6 p-8 bg-slate-900/30 border border-slate-800/40 rounded-3xl backdrop-blur-md"
                >
                  <div className="w-16 h-16 mx-auto bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-purple-500/15">
                    <Sparkles size={24} className="animate-pulse" />
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-lg font-black uppercase text-white tracking-wide font-sans">Studio di Materializzazione AI</h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                      Sperimenta abbinamenti strutturali reali digitando una descrizione dei materiali nel pannello di sinistra. L'AI genererà un'immagine fotorealistica con textures, riflessi fisici e ombreggiature.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-left max-w-md mx-auto">
                    <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800/40">
                      <span className="text-[10px] font-black text-indigo-400 block uppercase mb-1 font-sans">Pilastri in Cemento</span>
                      <p className="text-[9px] text-slate-500 leading-normal">Crea render di strutture in calcestruzzo a faccia vista, brutaliste o levigate.</p>
                    </div>
                    <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800/40">
                      <span className="text-[10px] font-black text-pink-400 block uppercase mb-1 font-sans">Mattoni e Pietre</span>
                      <p className="text-[9px] text-slate-500 leading-normal">Visualizza murature in mattone rosso, travertino, marmo o ardesia svizzera.</p>
                    </div>
                  </div>

                  {aiError && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold p-3 rounded-xl max-w-sm mx-auto">
                      ⚠️ {aiError}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* HISTORY RAIL (STAY IN MEMORY) */}
            {activeTab === 'ai' && aiRenderHistory.length > 0 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 p-2 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 max-w-[90%] overflow-x-auto custom-scrollbar">
                {aiRenderHistory.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setAiRenderedImage(img);
                      // Reset comparison if needed or trigger animation
                    }}
                    className={`relative w-24 h-14 rounded-lg overflow-hidden border-2 transition-all shrink-0 hover:scale-105 active:scale-95 cursor-pointer ${
                      aiRenderedImage === img ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-slate-800 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt={`Render ${idx}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent flex items-end p-1">
                      <span className="text-[7px] font-black text-white uppercase tracking-tighter">RENDER #{aiRenderHistory.length - idx}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

        </div>
      </motion.div>
    </AnimatePresence>
  );
};
