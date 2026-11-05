import React, { useState, useEffect } from "react";
import { Entity, LineEntity } from "../types";

export interface SketchParam {
    label: string,
    id: string,
    length: number,
    angle: number
}

export const SketchParamsDialog = ({ 
    entities, 
    onClose, 
    onUpdate,
    onParamsChange,
    onHighlight
}: { 
    entities: Entity[], 
    onClose: () => void, 
    onUpdate: (updatedEntities: Entity[]) => void,
    onParamsChange: (params: SketchParam[]) => void,
    onHighlight: (id: string | null) => void
}) => {
    const [params, setParams] = useState<SketchParam[]>([]);

    useEffect(() => {
        const newParams = entities.filter(e => e.type === 'line').map((e, index) => {
            const line = e as LineEntity;
            const length = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
            const angle = Math.atan2(line.end.y - line.start.y, line.end.x - line.start.x) * 180 / Math.PI;
            return {
                label: String.fromCharCode(65 + index), // A, B, C...
                id: e.id,
                length: Math.round(length * 100) / 100,
                angle: Math.round(angle * 100) / 100
            };
        });
        setParams(newParams);
        // Removed calling onParamsChange(newParams) here to prevent loop
    }, [entities]);

    const handleUpdate = (id: string, newLength: number) => {
        const updated = entities.map(e => {
            if (e.id === id) {
                const line = e as LineEntity;
                const currentLength = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
                if (currentLength === 0) return e;
                const ratio = newLength / currentLength;
                return {
                    ...line,
                    end: {
                        x: line.start.x + (line.end.x - line.start.x) * ratio,
                        y: line.start.y + (line.end.y - line.start.y) * ratio
                    }
                };
            }
            return e;
        });
        onUpdate(updated);
        const newParams = params.map(p => p.id === id ? { ...p, length: newLength } : p);
        setParams(newParams);
        onParamsChange(newParams);
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-[10000]">
            <div className="bg-white dark:bg-neutral-800 p-6 rounded-lg shadow-xl w-96">
                <h2 className="text-lg font-bold mb-4">Parametri Schizzo (Dinamico)</h2>
                {params.map(p => (
                    <div 
                        key={p.id} 
                        className="flex justify-between items-center mb-2 p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer border-b border-neutral-200"
                        onMouseEnter={() => onHighlight(p.id)}
                        onMouseLeave={() => onHighlight(null)}
                    >
                        <div className="flex flex-col">
                            <span className="font-mono font-bold text-lg">{p.label}</span>
                            <span className="text-xs text-neutral-500">Angolo: {p.angle}°</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs">Lunghezza:</label>
                            <input 
                                type="number" 
                                value={p.length}
                                onChange={(e) => handleUpdate(p.id, parseFloat(e.target.value))}
                                className="border p-1 rounded w-20 text-right bg-white dark:bg-neutral-700 font-mono"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>
                ))}
                <button onClick={onClose} className="mt-4 w-full bg-emerald-600 text-white p-2 rounded font-bold">
                    Applica e Chiudi
                </button>
            </div>
        </div>
    );
};
