import React, { useState, useEffect } from 'react';
import { Point } from '../types';

interface ManualInputOverlayProps {
    type: 'line' | 'circle' | 'rectangle' | 'parallel';
    drawing?: { start: Point, current: Point };
    parallelLine?: { start: Point, end: Point, mouse: Point, distance?: number };
    canvasToScreen: (x: number, y: number) => { x: number, y: number };
    onCommit: (data: any) => void;
    isOpen: boolean;
    onClose: () => void;
    position?: Point | null;
}

export const ManualInputOverlay: React.FC<ManualInputOverlayProps> = ({ type, drawing, parallelLine, canvasToScreen, onCommit, isOpen, onClose, position }) => {
    // Initial calculations
    let initVal1 = 0;
    let initVal2 = 0;
    let screenPos = { x: 0, y: 0 };

    if (type === 'line' || type === 'circle' || type === 'rectangle') {
        if (!drawing) return null;
        const dx = drawing.current.x - drawing.start.x;
        const dy = drawing.current.y - drawing.start.y;
        
        if (type === 'line') {
            initVal1 = Math.sqrt(dx * dx + dy * dy);
            initVal2 = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        } else if (type === 'circle') {
            initVal1 = Math.sqrt(dx * dx + dy * dy); // Radius
        } else if (type === 'rectangle') {
            initVal1 = dx;
            initVal2 = dy;
        }
        screenPos = canvasToScreen(drawing.current.x, drawing.current.y);
    } else if (type === 'parallel') {
        if (!parallelLine) return null;
        const { start, end, mouse, distance } = parallelLine;
        if (distance !== undefined) {
            initVal1 = distance;
        } else {
            const dxLine = end.x - start.x;
            const dyLine = end.y - start.y;
            const L = Math.sqrt(dxLine * dxLine + dyLine * dyLine);
            if (L > 0) {
                const normX = -dyLine / L;
                const normY = dxLine / L;
                const vecMouse = { x: mouse.x - start.x, y: mouse.y - start.y };
                initVal1 = Math.abs(vecMouse.x * normX + vecMouse.y * normY); // Distance
            }
        }
        screenPos = canvasToScreen(mouse.x, mouse.y);
    }

    const [val1, setVal1] = useState('');
    const [val2, setVal2] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (type === 'line') {
                setVal1('');
            } else {
                setVal1(initVal1.toFixed(2));
            }
            setVal2(initVal2.toFixed(2));
        }
    }, [isOpen, initVal1, initVal2, type]);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        const v1 = val1 === '' && type === 'line' ? initVal1 : parseFloat(val1.replace(',', '.'));
        const v2 = parseFloat(val2.replace(',', '.'));
        onCommit({ val1: v1, val2: v2 });
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen) {
        return (
            <div 
                style={{ position: 'absolute', left: screenPos.x + 10, top: screenPos.y + 10 }}
                className="bg-slate-500/40 backdrop-blur-md border border-slate-400/50 text-white p-2 rounded text-sm flex flex-col gap-1 pointer-events-none z-50"
            >
                {type === 'line' && (
                    <>
                        <span>L: {initVal1.toFixed(2)}</span>
                        <span>A: {initVal2.toFixed(2)}°</span>
                    </>
                )}
                {type === 'circle' && <span>R: {initVal1.toFixed(2)}</span>}
                {type === 'rectangle' && (
                    <>
                        <span>W: {initVal1.toFixed(2)}</span>
                        <span>H: {initVal2.toFixed(2)}</span>
                    </>
                )}
                {type === 'parallel' && <span className="text-cyan-400">Dist: {initVal1.toFixed(2)}</span>}
            </div>
        );
    }

    return (
        <div 
            className={position ? "absolute z-[100] pointer-events-none" : "fixed inset-0 flex items-center justify-center z-[100] bg-transparent pointer-events-none"} 
            style={position ? { left: position.x - 80, top: position.y - 40 } : {}}
            onMouseDown={e => e.stopPropagation()} 
            onMouseMove={e => e.stopPropagation()} 
            onMouseUp={e => e.stopPropagation()} 
            onWheel={e => e.stopPropagation()}
        >
            <form 
                className="bg-slate-900/90 backdrop-blur-xl text-white p-2 rounded shadow-[0_0_20px_rgba(0,0,0,0.5)] flex flex-col gap-2 min-w-[160px] border border-emerald-500/30 pointer-events-auto text-xs"
                onSubmit={handleSubmit}
                onKeyDown={handleKeyDown}
            >
                <div className="flex justify-between items-center pb-1 border-b border-slate-400/50">
                    <div className="text-xs font-bold text-slate-100">
                        Inserimento
                    </div>
                </div>
                
                {type === 'line' && (
                    <>
                        <label className="flex items-center gap-2 justify-between">
                            L: <input type="text" autoFocus onFocus={e => e.target.select()} value={val1} onChange={e => setVal1(e.target.value)} className="w-16 bg-slate-800/60 border border-slate-500/50 px-1 py-0.5 rounded text-right outline-none focus:border-indigo-400" />
                        </label>
                        <label className="flex items-center gap-2 justify-between">
                            A: <input type="text" onFocus={e => e.target.select()} value={val2} onChange={e => setVal2(e.target.value)} className="w-16 bg-slate-800/60 border border-slate-500/50 px-1 py-0.5 rounded text-right outline-none focus:border-indigo-400" />
                        </label>
                    </>
                )}
                
                {type === 'circle' && (
                    <label className="flex items-center gap-2 justify-between">
                        R: <input type="text" autoFocus onFocus={e => e.target.select()} value={val1} onChange={e => setVal1(e.target.value)} className="w-16 bg-slate-800/60 border border-slate-500/50 px-1 py-0.5 rounded text-right outline-none focus:border-indigo-400" />
                    </label>
                )}

                {type === 'rectangle' && (
                    <>
                        <label className="flex items-center gap-2 justify-between">
                            W: <input type="text" autoFocus onFocus={e => e.target.select()} value={val1} onChange={e => setVal1(e.target.value)} className="w-16 bg-slate-800/60 border border-slate-500/50 px-1 py-0.5 rounded text-right outline-none focus:border-indigo-400" />
                        </label>
                        <label className="flex items-center gap-2 justify-between">
                            H: <input type="text" onFocus={e => e.target.select()} value={val2} onChange={e => setVal2(e.target.value)} className="w-16 bg-slate-800/60 border border-slate-500/50 px-1 py-0.5 rounded text-right outline-none focus:border-indigo-400" />
                        </label>
                    </>
                )}

                {type === 'parallel' && (
                    <label className="flex items-center gap-2 justify-between text-cyan-200">
                        Dist: <input type="text" autoFocus onFocus={e => e.target.select()} value={val1} onChange={e => setVal1(e.target.value)} className="w-16 bg-slate-800/60 border border-slate-500/50 text-white px-1 py-0.5 rounded text-right outline-none focus:border-indigo-400" />
                    </label>
                )}

                <div className="flex gap-1 mt-1">
                    <button type="submit" className="flex-1 bg-indigo-500/80 hover:bg-indigo-400/80 text-white py-1 rounded text-xs transition-colors">
                        OK
                    </button>
                    <button type="button" onClick={onClose} className="flex-1 bg-slate-600/80 hover:bg-slate-500/80 text-white py-1 rounded text-xs transition-colors">
                        X
                    </button>
                </div>
            </form>
        </div>
    );
};
