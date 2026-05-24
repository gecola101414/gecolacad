/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { CADCanvas } from './components/CADCanvas';
import { DimensionStyleDialog } from './components/DimensionStyleDialog';
import { Entity, Point, Layer, Measurement } from './types';
import { Minus, Circle, Square, MousePointer2, Eraser, Sparkles, MoveHorizontal, Scissors, Ruler, Move, DraftingCompass, History, Dot, Undo, Redo } from 'lucide-react';

export default function App() {
  const [selectedTool, setSelectedTool] = useState('Select');
  const [entities, setEntities] = useState<Entity[]>([]);
  const [layers, setLayers] = useState<Layer[]>([
      { id: 'Layer 0', name: 'Layer 0', visible: true, frozen: false },
      { id: 'Layer 1', name: 'Layer 1', visible: true, frozen: false }
  ]);
  const [activeLayerId, setActiveLayerId] = useState<string>('Layer 0');
  const [defaultLineStyle, setDefaultLineStyle] = useState({ color: '#000000', lineWidth: 1, dashed: false, mode: 'ink' as 'ink' | 'pencil' });
  const [eraserRadius, setEraserRadius] = useState(20);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAIDialogOpen, setIsAIDialogOpen] = useState(false);
  const [isDimensionDialogOpen, setIsDimensionDialogOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, isOpen: boolean} | null>(null);
  const cadCanvasRef = useRef<any>(null);

  const selectedEntity = entities.find(e => e.id === selectedId);

  const updateEntity = (id: string, updates: Partial<Entity>) => {
    setEntities(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const handleAICommand = async () => {
    if (!aiPrompt) return;
    const basePosition = cadCanvasRef.current?.getCurrentMousePosition() || { x: 0, y: 0 };
    try {
        const response = await fetch("/api/ai-draw", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: aiPrompt, basePosition }),
        });
        const data = await response.json();
        if (data.entities) {
            updateEntitiesWithHistory(prev => [...prev, ...data.entities.map((e: any) => ({ ...e, id: Date.now().toString() + Math.random() }))]);
        }
        setIsAIDialogOpen(false);
        setAiPrompt('');
    } catch (e) {
        console.error(e);
        alert("Failed to create AI object");
    }
  };

  const categories = [
    { name: 'Seleziona', icon: MousePointer2, tools: [{ name: 'Select', icon: MousePointer2 }] },
    { name: 'Disegno', icon: DraftingCompass, tools: [{ name: 'Line', icon: Minus }, { name: 'Circle', icon: Circle }, { name: 'Arc', icon: History }, { name: 'Rectangle', icon: Square }, { name: 'Point', icon: Dot }, { name: 'Trim', icon: Scissors }, { name: 'Eraser', icon: Eraser }] },
    { name: 'Modifica', icon: Scissors, tools: [{ name: 'Parallel', icon: MoveHorizontal }, { name: 'Move', icon: Move }] },
    { name: 'Avanzate', icon: Ruler, tools: [{ name: 'Dimension', icon: Ruler }, { name: 'AI', icon: Sparkles }] },
    { name: 'Layer', icon: Square, tools: [{ name: 'Layer 0', icon: Square }, { name: 'Layer 1', icon: Square }]},
  ];
  const [showProperties, setShowProperties] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(categories[0].name);

  // Undo/Redo
  const [history, setHistory] = useState<Entity[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const undo = () => {
    if (historyIndex > 0) {
        setHistoryIndex(prev => prev - 1);
        setEntities(history[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
        setHistoryIndex(prev => prev + 1);
        setEntities(history[historyIndex + 1]);
    }
  };

  const updateEntitiesWithHistory = (newEntities: React.SetStateAction<Entity[]>) => {
      setEntities(prev => {
          const next = typeof newEntities === 'function' ? newEntities(prev) : newEntities;
          const newHistory = history.slice(0, historyIndex + 1);
          newHistory.push(next);
          setHistory(newHistory);
          setHistoryIndex(newHistory.length - 1);
          return next;
      });
  };

  // Auto-show properties when entity selected
  useEffect(() => {
	  if(selectedId) setShowProperties(true);
  }, [selectedId]);

  const selectedCategoryTools = categories.find(c => c.name === selectedCategory)?.tools || [];

  return (
    <div className="flex flex-col h-screen bg-neutral-100 text-neutral-900">
      {/* Ribbon */}
      <header className="h-20 border-b border-neutral-300 bg-white flex">
        {categories.map(cat => (
          <button key={cat.name} onClick={() => setSelectedCategory(cat.name)} className={`px-6 flex flex-col items-center justify-center gap-1 ${selectedCategory === cat.name ? 'bg-neutral-100' : 'hover:bg-neutral-200'}`}>
            <cat.icon size={20} />
            <span className="text-xs">{cat.name}</span>
          </button>
        ))}
        <div className="flex flex-col items-center justify-center gap-1">
            <button onClick={undo} className="p-2 hover:bg-neutral-200"><Undo size={16}/></button>
            <button onClick={redo} className="p-2 hover:bg-neutral-200"><Redo size={16}/></button>
        </div>
        <button onClick={() => setShowProperties(!showProperties)} className={`px-6 flex flex-col items-center justify-center gap-1 ${showProperties ? 'bg-neutral-100' : 'hover:bg-neutral-200'}`}>
            <Square size={20} />
            <span className="text-xs">Defaults</span>
        </button>
        <button onClick={() => setShowProperties(!showProperties)} className="flex flex-col items-center justify-center px-6 hover:bg-neutral-200">
            <span className="text-xs text-neutral-500">Mode: {defaultLineStyle.mode}</span>
            <span className="text-sm font-bold">{defaultLineStyle.lineWidth}</span>
        </button>
      </header>
      <div className="h-10 bg-white border-b border-neutral-300 flex items-center px-4 gap-2">
         {selectedCategoryTools.map(tool => (
            <button key={tool.name} onClick={() => setSelectedTool(tool.name)} className={`px-3 py-1 rounded flex items-center gap-1 text-sm ${selectedTool === tool.name ? 'bg-indigo-100 text-indigo-900 border border-indigo-300' : 'hover:bg-neutral-200'}`}>
               <tool.icon size={16} />
               {tool.name}
            </button>
         ))}
      </div>
      
      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-hidden relative" onClick={() => setContextMenu(null)}>
          <CADCanvas ref={cadCanvasRef} entities={entities} activeTool={selectedTool} setEntities={updateEntitiesWithHistory} onSelect={(id) => { setSelectedId(id); if(id) setShowProperties(true); }} onContextMenu={(e) => setContextMenu({ x: e.clientX, y: e.clientY, isOpen: true })} activeLayerId={activeLayerId} defaultLineStyle={defaultLineStyle} eraserRadius={eraserRadius} setEraserRadius={setEraserRadius} />
        </main>

        {/* Properties Panel (Drawer) */}
        {showProperties && (
          <div className="w-64 bg-white border-l border-neutral-300 p-4 transition-all overflow-y-auto">
            <h3 className="font-bold mb-4 flex justify-between">
                <span>{selectedEntity ? `Properties (${selectedEntity.type})` : 'Drawing Defaults'}</span>
                <button onClick={() => setShowProperties(false)}>X</button>
            </h3>
            <div className="space-y-4">
                {selectedEntity ? (
                    <>
                        <label className="block text-sm">Mode:
                            <div className="flex gap-2">
                                <button onClick={() => updateEntity(selectedEntity.id, { mode: 'ink' })} className={`p-2 rounded flex-1 ${selectedEntity.mode === 'ink' ? 'bg-indigo-600 text-white' : 'bg-neutral-200'}`}>Ink</button>
                                <button onClick={() => updateEntity(selectedEntity.id, { mode: 'pencil' })} className={`p-2 rounded flex-1 ${selectedEntity.mode === 'pencil' ? 'bg-indigo-600 text-white' : 'bg-neutral-200'}`}>Pencil</button>
                            </div>
                        </label>
                        <label className="block text-sm">Width: 
                            <div className="flex gap-2">
                                {[1, 2.5, 4].map(w => (
                                    <button key={w} onClick={() => updateEntity(selectedEntity.id, { lineWidth: w })} className={`p-2 rounded flex-1 ${selectedEntity.lineWidth === w ? 'bg-indigo-600 text-white' : 'bg-neutral-200 text-neutral-900 border border-neutral-400'}`}>{w} mm</button>
                                ))}
                            </div>
                        </label>
                        {selectedEntity.type === 'dimension' && (
                           <>
                               <label className="block text-sm">Text: <input type="text" value={(selectedEntity as any).customText || ''} onChange={e => updateEntity(selectedEntity.id, { customText: e.target.value })} className="w-full bg-neutral-100 p-2 rounded" /></label>
                               <button className="w-full bg-indigo-600 text-white p-2 text-sm rounded" onClick={() => setIsDimensionDialogOpen(true)}>Edit Style</button>
                           </>
                        )}
                    </>
                ) : (
                    <>
                        <label className="block text-sm">Default Mode:
                            <div className="flex gap-2">
                                <button onClick={() => setDefaultLineStyle({...defaultLineStyle, mode: 'ink'})} className={`p-2 rounded flex-1 ${defaultLineStyle.mode === 'ink' ? 'bg-indigo-600 text-white' : 'bg-neutral-200'}`}>Ink</button>
                                <button onClick={() => setDefaultLineStyle({...defaultLineStyle, mode: 'pencil'})} className={`p-2 rounded flex-1 ${defaultLineStyle.mode === 'pencil' ? 'bg-indigo-600 text-white' : 'bg-neutral-200'}`}>Pencil</button>
                            </div>
                        </label>
                        <label className="block text-sm">Default Width: 
                            <div className="flex gap-2">
                                {[1, 2.5, 4].map(w => (
                                    <button key={w} onClick={() => setDefaultLineStyle({...defaultLineStyle, lineWidth: w})} className={`p-2 rounded flex-1 ${defaultLineStyle.lineWidth === w ? 'bg-indigo-600 text-white' : 'bg-neutral-200 text-neutral-900 border border-neutral-400'}`}>{w} mm</button>
                                ))}
                            </div>
                        </label>
                        <label className="block text-sm">Active Layer:
                            <select value={activeLayerId} onChange={e => setActiveLayerId(e.target.value)} className="w-full bg-neutral-100 p-2 rounded text-sm mt-1">
                                {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        </label>
                    </>
                )}
            </div>
          </div>
        )}
      </div>

      {/* Command Bar */}
      <footer className="h-8 border-t border-slate-800 bg-slate-900 px-4 flex items-center text-sm">
        <span className="text-slate-500 mr-2 uppercase tracking-wide font-mono">Command:</span>
        <input type="text" className="bg-transparent flex-1 outline-none font-mono" placeholder="Type a command (f.ex. L, C, R)..." />
      </footer>

      {isAIDialogOpen && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="bg-slate-800 p-6 rounded shadow-xl w-96 border border-slate-700">
                <h3 className="text-xl font-bold mb-4">AI Drawing</h3>
                <input 
                    type="text" 
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 p-2 rounded mb-4" 
                    placeholder="Descrivi l'oggetto..."
                />
                <div className="flex gap-2">
                    <button onClick={() => setIsAIDialogOpen(false)} className="flex-1 bg-slate-700 p-2 rounded">Cancel</button>
                    <button onClick={handleAICommand} className="flex-1 bg-indigo-600 p-2 rounded">Create</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
