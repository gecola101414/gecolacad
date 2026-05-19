/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef } from 'react';
import { CADCanvas } from './components/CADCanvas';
import { Entity, Point } from './types';
import { Minus, Circle, Square, MousePointer2, Trash2, Sparkles, MoveHorizontal } from 'lucide-react';

export default function App() {
  const [selectedTool, setSelectedTool] = useState('Select');
  const [entities, setEntities] = useState<Entity[]>([
    { id: '1', type: 'line', color: 'white', lineWidth: 2, start: { x: 0, y: 0 }, end: { x: 100, y: 100 }, layer: 'Layer 0' }
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAIDialogOpen, setIsAIDialogOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
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
            setEntities(prev => [...prev, ...data.entities.map((e: any) => ({ ...e, id: Date.now().toString() + Math.random() }))]);
        }
        setIsAIDialogOpen(false);
        setAiPrompt('');
    } catch (e) {
        console.error(e);
        alert("Failed to create AI object");
    }
  };

  const toolbarButtons = [
    { name: 'Select', icon: MousePointer2 },
    { name: 'Line', icon: Minus },
    { name: 'Circle', icon: Circle },
    { name: 'Rectangle', icon: Square },
    { name: 'Parallel', icon: MoveHorizontal },
    { name: 'Delete', icon: Trash2 },
    { name: 'AI', icon: Sparkles },
  ];

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="h-12 border-b border-slate-800 flex items-center px-4 font-bold text-sm bg-slate-900 justify-between">
        <span>ZenCAD</span>
        <span className="text-xs text-slate-500">v0.1.0</span>
      </header>
      
      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Toolbar */}
        <aside className="w-16 border-r border-slate-800 p-2 space-y-2 bg-slate-900">
          {toolbarButtons.map((btn) => (
            <button 
              key={btn.name}
              title={btn.name}
              onClick={() => {
                if (btn.name === 'AI') {
                    setIsAIDialogOpen(true);
                } else {
                    setSelectedTool(btn.name);
                }
              }}
              className={`w-12 h-12 rounded flex items-center justify-center transition-colors ${selectedTool === btn.name ? 'bg-indigo-600' : 'bg-slate-800 hover:bg-slate-700'}`}
            >
              <btn.icon size={20} />
            </button>
          ))}
        </aside>
        
        {/* Canvas Area */}
        <main className="flex-1 overflow-hidden relative">
          <CADCanvas ref={cadCanvasRef} entities={entities} activeTool={selectedTool} setEntities={setEntities} onSelect={setSelectedId} />
        </main>
      </div>

      {/* Properties Panel */}
      {selectedEntity && (
        <div className="absolute right-4 top-16 w-64 bg-slate-800 p-4 border border-slate-700 rounded shadow-lg text-sm">
          <h3 className="font-bold mb-2">Properties: {selectedEntity.type}</h3>
          <div className="space-y-2">
            <label className="block">Color: <input type="color" value={selectedEntity.color} onChange={e => updateEntity(selectedEntity.id, { color: e.target.value })} /></label>
            <label className="block">Width: <input type="range" min="1" max="10" value={selectedEntity.lineWidth} onChange={e => updateEntity(selectedEntity.id, { lineWidth: parseInt(e.target.value) })} /></label>
            <label className="block">Dash: <input type="checkbox" checked={!!selectedEntity.dashed} onChange={e => updateEntity(selectedEntity.id, { dashed: e.target.checked })} /></label>
            <label className="block">Layer: 
              <select value={selectedEntity.layer} onChange={e => updateEntity(selectedEntity.id, { layer: e.target.value })}>
                <option>Layer 0</option>
                <option>Layer 1</option>
                <option>Layer 2</option>
              </select>
            </label>
            <button className="w-full bg-red-600 mt-4 p-1 rounded" onClick={() => { setEntities(prev => prev.filter(e => e.id !== selectedId)); setSelectedId(null); }}>Delete</button>
          </div>
        </div>
      )}

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
