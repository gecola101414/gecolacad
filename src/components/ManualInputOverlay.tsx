import React, { useState, useEffect, useRef } from 'react';
import { Point } from '../types';
import { Mic, MicOff, MoveHorizontal } from 'lucide-react';

interface ManualInputOverlayProps {
    type: 'line' | 'circle' | 'rectangle' | 'parallel';
    drawing?: { start: Point, current: Point, lockedDir?: Point };
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
    const [isListening, setIsListening] = useState(false);
    const [transcriptPreview, setTranscriptPreview] = useState('');
    const recognitionRef = useRef<any>(null);

    // Jog slider state
    const [isJogging, setIsJogging] = useState(false);
    const [jogDisplayDiff, setJogDisplayDiff] = useState(0);
    const jogRef = useRef({ startX: 0, currentX: 0 });
    const jogAnimRef = useRef<number | null>(null);

    useEffect(() => {
        if (isOpen) {
            if (type === 'line') {
                setVal1('');
            } else {
                setVal1(initVal1.toFixed(2));
            }
            setVal2(initVal2.toFixed(2));
            setTranscriptPreview('');
        }
    }, [isOpen, initVal1, initVal2, type]);

    // Speech Recognition Setup
    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'it-IT';

        const italianNumbers: { [key: string]: string } = {
            'zero': '0', 'uno': '1', 'due': '2', 'tre': '3', 'quattro': '4',
            'cinque': '5', 'sei': '6', 'sette': '7', 'otto': '8', 'nove': '9',
            'dieci': '10', 'undici': '11', 'dodici': '12', 'tredici': '13',
            'quattordici': '14', 'quindici': '15', 'sedici': '16', 'diciassette': '17',
            'diciotto': '18', 'diciannove': '19', 'venti': '20', 'trenta': '30',
            'quaranta': '40', 'cinquanta': '50', 'sessanta': '60', 'settanta': '70',
            'ottanta': '80', 'novanta': '90', 'cento': '100'
        };

        recognition.onresult = (event: any) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                transcript += event.results[i][0].transcript.toLowerCase();
            }

            if (transcript) {
                setTranscriptPreview(transcript);
                
                // Remove spaces and replace separators
                let processed = transcript.replace(/virgola/g, '.').replace(/punto/g, '.').replace(/meno/g, '-').replace(/\s+/g, '');
                
                // Extract numbers
                const numbers = processed.match(/-?\d+(?:[.,]\d+)?/g);
                if (numbers && numbers.length > 0) {
                    setVal1(numbers[numbers.length - 1]);
                }
            }
        };

        recognition.onerror = (event: any) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                setIsListening(false);
                isListeningRef.current = false;
            }
        };

        recognition.onend = () => {
            if (isListeningRef.current) {
                try {
                    recognition.start();
                } catch(e) {
                    setTimeout(() => {
                        if (isListeningRef.current) try { recognition.start(); } catch(e2) {}
                    }, 50);
                }
            }
        };

        recognitionRef.current = recognition;
        
        return () => {
            recognition.abort();
        };
    }, []);

    const isListeningRef = useRef(false);
    const startListening = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        if (!recognitionRef.current) return;
        setVal1('');
        setTranscriptPreview('In ascolto...');
        setIsListening(true);
        isListeningRef.current = true;
        try {
            recognitionRef.current.start();
        } catch(e) {
            // ignore
        }
    };


    const stopListening = () => {
        if (!recognitionRef.current) return;
        setIsListening(false);
        isListeningRef.current = false;
        try {
            recognitionRef.current.stop();
        } catch(e) {
            // ignore
        }
    };

    const handleIncrement = (amount: number) => {
        setVal1(prev => {
            const current = parseFloat(prev.replace(',', '.')) || 0;
            return (current + amount).toFixed(2);
        });
    };

    // Jog Slider Logic
    const startJog = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        const x = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        jogRef.current = { startX: x, currentX: x };
        setIsJogging(true);
    };

    useEffect(() => {
        if (!isJogging) return;

        let lastTime = performance.now();
        const animate = (time: number) => {
            const deltaTime = (time - lastTime) / 1000;
            lastTime = time;

            const diff = jogRef.current.currentX - jogRef.current.startX;
            if (Math.abs(diff) > 2) { // lowered threshold for better response
                setVal1(prev => {
                    const currentStr = prev === '' ? '0' : prev;
                    const current = parseFloat(currentStr.replace(',', '.')) || 0;
                    // Linear + Quadratic sensitivity
                    const linearPart = diff * 0.1;
                    const quadraticPart = Math.sign(diff) * Math.pow(diff / 50, 2) * 5;
                    const speed = linearPart + quadraticPart;
                    const newValue = current + (speed * deltaTime);
                    return newValue.toFixed(2);
                });
            }
            jogAnimRef.current = requestAnimationFrame(animate);
        };
        jogAnimRef.current = requestAnimationFrame(animate);

        return () => {
            if (jogAnimRef.current) cancelAnimationFrame(jogAnimRef.current);
        };
    }, [isJogging]);

    useEffect(() => {
        const handleMove = (e: MouseEvent | TouchEvent) => {
            if (!isJogging) return;
            const x = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
            jogRef.current.currentX = x;
            setJogDisplayDiff(x - jogRef.current.startX);
        };
        const handleUp = () => {
            setIsJogging(false);
            setJogDisplayDiff(0);
        };

        if (isJogging) {
            window.addEventListener('mousemove', handleMove);
            window.addEventListener('mouseup', handleUp);
            window.addEventListener('touchmove', handleMove);
            window.addEventListener('touchend', handleUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('touchend', handleUp);
        };
    }, [isJogging]);

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
            style={position ? { left: position.x - 80, top: position.y - 60 } : {}}
            onMouseDown={e => e.stopPropagation()} 
            onMouseMove={e => e.stopPropagation()} 
            onMouseUp={e => e.stopPropagation()} 
            onWheel={e => e.stopPropagation()}
        >
            <form 
                className="bg-slate-900/60 backdrop-blur-xl text-white p-3 rounded-lg shadow-[0_10px_40px_rgba(0,0,0,0.6)] flex flex-col gap-3 min-w-[200px] border border-emerald-500/40 pointer-events-auto text-xs"
                onSubmit={handleSubmit}
                onKeyDown={handleKeyDown}
            >
                {/* Drag handle */}
                <div 
                    className="flex justify-between items-center pb-2 border-b border-slate-700 cursor-move"
                    onPointerDown={e => {
                        // Logic for dragging would be implemented here in a more complete way
                        // For now, it serves as a handle and stops propagation
                        e.stopPropagation();
                    }}
                >
                    <div className="text-[10px] uppercase font-bold tracking-tight text-emerald-400 flex items-center gap-2">
                        <MoveHorizontal size={12} />
                        {drawing?.lockedDir ? "Linea Ortogonale" : "Input"}
                    </div>
                    {isListening && (
                        <div className="flex flex-col items-end gap-0.5 max-w-[100px]">
                            <div className="text-[9px] animate-pulse text-red-400 font-bold">In ascolto...</div>
                            <div className="text-[8px] text-slate-400 truncate w-full text-right italic">
                                {transcriptPreview}
                            </div>
                        </div>
                    )}
                    <button 
                        type="button" 
                        onClick={onClose}
                        className="text-slate-400 hover:text-white"
                    >
                        ✕
                    </button>
                </div>
                
                <div className="flex flex-col gap-3">
                    {/* Primary Input with Microphone */}
                    <div className="flex items-center gap-2">
                        <span className="w-8 text-slate-400 font-mono text-[10px]">
                            {type === 'line' ? 'L:' : type === 'circle' ? 'R:' : type === 'rectangle' ? 'W:' : 'Dist:'}
                        </span>
                        <div className="flex-1 relative">
                            <input 
                                type="text" 
                                autoFocus 
                                onFocus={e => e.target.select()} 
                                value={val1} 
                                onChange={e => setVal1(e.target.value)} 
                                className="w-full bg-slate-800 border border-slate-600 px-2 py-1.5 rounded text-right outline-none focus:border-emerald-500 font-mono text-sm" 
                            />
                        </div>
                        <button 
                            type="button" 
                            onMouseDown={startListening}
                            onMouseUp={stopListening}
                            onMouseLeave={stopListening}
                            onTouchStart={startListening}
                            onTouchEnd={stopListening}
                            className={`p-1.5 rounded-full transition-all ${isListening ? 'bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'}`}
                        >
                            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                        </button>
                    </div>

                    {/* Jog Slider Bar (The "Barretta") */}
                    <div className="flex flex-col gap-1.5 px-0.5">
                        <div className="flex h-10 gap-0.5 rounded-lg overflow-hidden border border-slate-700 bg-slate-800/30 shadow-inner">
                            <button 
                                type="button"
                                onClick={() => handleIncrement(-1)}
                                className="w-10 bg-red-950/40 hover:bg-red-900/60 transition-colors text-red-500 font-bold border-r border-slate-700/50 flex items-center justify-center active:scale-95 shadow-inner"
                            >
                                <span className="text-[10px]">-1</span>
                            </button>
                            <button 
                                type="button"
                                onClick={() => handleIncrement(-0.1)}
                                className="w-12 bg-red-800/10 hover:bg-red-700/20 transition-colors text-red-400 border-r border-slate-700/50 flex items-center justify-center active:scale-95"
                            >
                                <span className="text-[10px]">-0,1</span>
                            </button>
                            
                            <div 
                                className="flex-1 relative cursor-ew-resize select-none flex items-center justify-center group bg-slate-900/30"
                                onMouseDown={startJog}
                                onTouchStart={startJog}
                            >
                                <div className="absolute inset-x-0 h-[1px] bg-emerald-500/5 top-1/2 -translate-y-1/2" />
                                <div className="absolute inset-y-0 w-px bg-slate-700/50 left-1/2 -translate-x-1/2" /> {/* Center mark */}
                                <div className="w-1.5 h-6 bg-emerald-500/50 rounded-full z-10 shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
                                
                                {isJogging && (
                                    <div 
                                        className="absolute bg-emerald-500/10 h-full backdrop-blur-[1px]" 
                                        style={{ 
                                            left: '50%',
                                            width: Math.abs(jogDisplayDiff),
                                            transform: `translateX(${jogDisplayDiff > 0 ? '0' : '-100%'})`
                                        }} 
                                    />
                                )}
                                <MoveHorizontal size={12} className="absolute bottom-1 right-1 text-slate-700 group-hover:text-emerald-500/20 transition-colors" />
                            </div>

                            <button 
                                type="button"
                                onClick={() => handleIncrement(0.1)}
                                className="w-12 bg-emerald-800/10 hover:bg-emerald-700/20 transition-colors text-emerald-400 border-l border-slate-700/50 flex items-center justify-center active:scale-95"
                            >
                                <span className="text-[10px]">+0,1</span>
                            </button>
                            <button 
                                type="button"
                                onClick={() => handleIncrement(1)}
                                className="w-10 bg-emerald-950/40 hover:bg-emerald-900/60 transition-colors text-emerald-500 font-bold border-l border-slate-700/50 flex items-center justify-center active:scale-95 shadow-inner"
                            >
                                <span className="text-[10px]">+1</span>
                            </button>
                        </div>
                        <div className="text-[8px] text-slate-600 uppercase tracking-widest text-center">Regolazione Dinamica</div>
                    </div>

                    {/* Secondary Input for Angle/Height */}
                    {(type === 'line' && !drawing?.lockedDir) || type === 'rectangle' ? (
                        <div className="flex items-center gap-2">
                             <span className="w-8 text-slate-400 font-mono text-[10px]">
                                {type === 'line' ? 'A:' : 'H:'}
                            </span>
                            <div className="flex-1">
                                <input 
                                    type="text" 
                                    onFocus={e => e.target.select()} 
                                    value={val2} 
                                    onChange={e => setVal2(e.target.value)} 
                                    className="w-full bg-slate-800 border border-slate-600 px-2 py-1.5 rounded text-right outline-none focus:border-indigo-500 font-mono text-sm" 
                                />
                            </div>
                            <div className="w-8" /> {/* Spacer to match mic button */}
                        </div>
                    ) : null}
                </div>

                <div className="flex gap-2 mt-2 pt-2 border-t border-slate-700">
                    <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-md text-xs font-bold transition-all shadow-lg active:scale-95 uppercase tracking-wide">
                        Conferma
                    </button>
                    <button type="button" onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-2 rounded-md text-xs transition-all active:scale-95">
                        Annulla
                    </button>
                </div>
            </form>
        </div>
    );
};

