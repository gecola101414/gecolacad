import React from 'react';
import { DimensionEntity } from '../types';

interface DimensionStyleDialogProps {
    entity: DimensionEntity;
    onClose: () => void;
    onUpdate: (updates: Partial<DimensionEntity>) => void;
}

export const DimensionStyleDialog = ({ entity, onClose, onUpdate }: DimensionStyleDialogProps) => {
    const styles = [1, 2, 3, 4, 5];
    return (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 p-6 rounded shadow-xl w-96 border border-slate-700">
                <h3 className="text-xl font-bold mb-4">Edit Dimension</h3>
                <label className="block mb-2">Custom Text: 
                    <input type="text" value={entity.customText || ''} onChange={e => onUpdate({ customText: e.target.value })} className="w-full bg-slate-900 border border-slate-700 p-2 rounded" />
                </label>
                <div className="mb-4">
                    <label className="block mb-2">Offset:</label>
                    <input type="range" min="0" max="100" value={entity.offset} onChange={e => onUpdate({ offset: parseInt(e.target.value) })} className="w-full" />
                </div>
                <div className="mb-4">
                    <label className="block mb-2">Rotation ({entity.rotation || 0}°):</label>
                    <input type="range" min="0" max="360" value={entity.rotation || 0} onChange={e => onUpdate({ rotation: parseInt(e.target.value) })} className="w-full" />
                </div>
                <div className="mb-4">
                    <label className="block mb-2">Style:</label>
                    <div className="grid grid-cols-5 gap-2">
                        {styles.map(s => (
                            <button key={s} onClick={() => onUpdate({ style: s })} className={`p-2 rounded ${entity.style === s ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
                <button onClick={onClose} className="w-full bg-slate-600 p-2 rounded">Close</button>
            </div>
        </div>
    );
};
