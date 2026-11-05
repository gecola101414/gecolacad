import React, { useState, useEffect, useRef } from "react";
import { LineEntity, Point } from "../types";

export const LineEditorDialog = ({ 
    line, 
    referenceLine,
    clickPoint,
    onClose, 
    onUpdate,
    onPreview
}: { 
    line: LineEntity, 
    referenceLine: LineEntity | null,
    clickPoint: Point | null,
    onClose: () => void, 
    onUpdate: (updatedLine: LineEntity) => void,
    onPreview: (updatedLine: LineEntity) => void
}) => {
    const [distance, setDistance] = useState(0);
    const [segmentLength, setSegmentLength] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const lengthInputRef = useRef<HTMLInputElement>(null);

    // Calculate initial distance and length
    useEffect(() => {
        const initialLen = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
        setSegmentLength(Math.round(initialLen * 100) / 100);

        if (!referenceLine) return;
        
        const midX = (line.start.x + line.end.x) / 2;
        const midY = (line.start.y + line.end.y) / 2;
        
        const A = referenceLine.start.y - referenceLine.end.y;
        const B = referenceLine.end.x - referenceLine.start.x;
        const C = referenceLine.start.x * referenceLine.end.y - referenceLine.end.x * referenceLine.start.y;
        
        const dist = Math.abs(A * midX + B * midY + C) / Math.hypot(A, B);
        setDistance(Math.round(dist * 100) / 100);
    }, [line, referenceLine]);

    useEffect(() => {
        // Focus and select the input text after it's been rendered and distance has been set initially
        const timer = setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.focus();
                inputRef.current.select();
            }
        }, 50);
        return () => clearTimeout(timer);
    }, []);

    const updateLine = (newDist: number | null, newLen: number | null, isPreview: boolean) => {
        let updatedLine = { ...line };

        // Handle distance update
        if (newDist !== null && referenceLine) {
            const currentMidX = (line.start.x + line.end.x) / 2;
            const currentMidY = (line.start.y + line.end.y) / 2;
            const A = referenceLine.start.y - referenceLine.end.y;
            const B = referenceLine.end.x - referenceLine.start.x;
            const C = referenceLine.start.x * referenceLine.end.y - referenceLine.end.x * referenceLine.start.y;
            const currentDist = (A * currentMidX + B * currentMidY + C) / Math.hypot(A, B);
            
            const sign = currentDist >= 0 ? 1 : -1;
            const moveDist = sign * (newDist - Math.abs(currentDist));
            
            const len = Math.hypot(A, B);
            const normal = { x: A / len, y: B / len };
            
            updatedLine = {
                ...updatedLine,
                start: { x: updatedLine.start.x + normal.x * moveDist, y: updatedLine.start.y + normal.y * moveDist },
                end: { x: updatedLine.end.x + normal.x * moveDist, y: updatedLine.end.y + normal.y * moveDist }
            };
        }

        // Handle length update: Rescale from end NEAREST to click point
        if (newLen !== null) {
            const distStart = clickPoint ? Math.hypot(clickPoint.x - updatedLine.start.x, clickPoint.y - updatedLine.start.y) : Infinity;
            const distEnd = clickPoint ? Math.hypot(clickPoint.x - updatedLine.end.x, clickPoint.y - updatedLine.end.y) : 0;
            
            // If clickPoint is closer to start, anchor end and move start.
            // But usually lengthening means keeping one point fixed.
            // User says: "sempre dal lato dove si evidenzia il punto snap"
            // This means the point NEAR the snap should MOVE (be extended).
            // Wait, if I click near the end, and I want to lengthen the line, the end should move further.
            // So the anchor is the point FARTHER from the click point.
            
            const anchorAtStart = distEnd < distStart; 
            
            const fixedPt = anchorAtStart ? updatedLine.start : updatedLine.end;
            const movingPt = anchorAtStart ? updatedLine.end : updatedLine.start;
            
            const currentLen = Math.hypot(updatedLine.end.x - updatedLine.start.x, updatedLine.end.y - updatedLine.start.y);
            const ratio = currentLen === 0 ? 1 : newLen / currentLen;
            
            const newMovingPt = {
                x: fixedPt.x + (movingPt.x - fixedPt.x) * ratio,
                y: fixedPt.y + (movingPt.y - fixedPt.y) * ratio
            };
            
            updatedLine = {
                ...updatedLine,
                start: anchorAtStart ? fixedPt : newMovingPt,
                end: anchorAtStart ? newMovingPt : fixedPt
            };
        }
        
        // Also move inkPoints if they exist
        if ((updatedLine as any).inkPoints) {
             const oldCenter = {
                 x: (line.start.x + line.end.x) / 2,
                 y: (line.start.y + line.end.y) / 2
             };
             const newCenter = {
                 x: (updatedLine.start.x + updatedLine.end.x) / 2,
                 y: (updatedLine.start.y + updatedLine.end.y) / 2
             };
             const dx = newCenter.x - oldCenter.x;
             const dy = newCenter.y - oldCenter.y;
             
             // This is simplistic for length scaling, just moves inkPoints
             (updatedLine as any).inkPoints = (updatedLine as any).inkPoints.map((pt: any) => ({
                 ...pt,
                 x: pt.x + dx,
                 y: pt.y + dy
             }));
        }
        
        if (isPreview) {
            onPreview(updatedLine);
        } else {
            onUpdate(updatedLine);
        }
    };

    const handleDistanceChange = (val: string) => {
        const rawString = val.replace(',', '.');
        const parsed = parseFloat(rawString);
        if (isNaN(parsed)) return;
        setDistance(parsed);
        updateLine(parsed, null, true);
    };

    const handleLengthChange = (val: string) => {
        const rawString = val.replace(',', '.');
        const parsed = parseFloat(rawString);
        if (isNaN(parsed)) return;
        setSegmentLength(parsed);
        updateLine(null, parsed, true);
    };

    const handleUpdate = () => {
        const rawDist = inputRef.current ? inputRef.current.value.replace(',', '.') : distance.toString();
        const parsedDist = parseFloat(rawDist);
        const finalDistance = isNaN(parsedDist) ? distance : parsedDist;

        const rawLen = lengthInputRef.current ? lengthInputRef.current.value.replace(',', '.') : segmentLength.toString();
        const parsedLen = parseFloat(rawLen);
        const finalLength = isNaN(parsedLen) ? segmentLength : parsedLen;
        
        updateLine(finalDistance, finalLength, false);
    };


    return (
        <div className="fixed top-24 right-4 z-[9000] pointer-events-auto">
            <div className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-700 w-80">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-neutral-800 dark:text-white">Modifica Distanza</h2>
                    <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200" title="Annulla">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                
                <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 p-3 rounded-lg">
                    <h3 className="text-xs font-bold text-yellow-800 dark:text-yellow-500 mb-2">Distanza Parallela</h3>
                    <svg width="100%" height="40" viewBox="0 0 100 40">
                        <line x1="10" y1="10" x2="90" y2="10" stroke="currentColor" className="text-yellow-600 dark:text-yellow-500" strokeWidth="2" strokeDasharray="4" />
                        <line x1="10" y1="30" x2="90" y2="30" stroke="currentColor" className="text-yellow-600 dark:text-yellow-500" strokeWidth="2" />
                        <line x1="50" y1="10" x2="50" y2="30" stroke="currentColor" className="text-yellow-500 dark:text-yellow-400" strokeWidth="2" />
                        <text x="56" y="24" fontSize="11" fill="currentColor" className="text-yellow-700 dark:text-yellow-500 font-bold">{distance} mm</text>
                    </svg>
                </div>

                <div className="flex flex-col gap-3">
                    <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Nuova Distanza (mm)</label>
                    <input 
                        ref={inputRef}
                        type="text" 
                        value={distance}
                        onChange={(e) => handleDistanceChange(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleUpdate();
                            } else if (e.key === 'Escape') {
                                onClose();
                            }
                        }}
                        className="border border-neutral-300 dark:border-neutral-600 p-2.5 rounded-lg w-full bg-white dark:bg-neutral-700 font-mono text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                    
                    <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Lunghezza Segmento (mm)</label>
                    <input 
                        ref={lengthInputRef}
                        type="text" 
                        value={segmentLength}
                        onChange={(e) => handleLengthChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleUpdate();
                            } else if (e.key === 'Escape') {
                                onClose();
                            }
                        }}
                        className="border border-neutral-300 dark:border-neutral-600 p-2.5 rounded-lg w-full bg-white dark:bg-neutral-700 font-mono text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                </div>
                <div className="flex gap-2 mt-6">
                    <button onClick={onClose} className="flex-1 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200 p-2.5 rounded-lg font-medium transition-colors text-sm">
                        Annulla
                    </button>
                    <button onClick={handleUpdate} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white p-2.5 rounded-lg font-bold transition-colors text-sm shadow-sm">
                        Applica
                    </button>
                </div>
            </div>
        </div>
    );
};
