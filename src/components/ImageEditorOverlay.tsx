import React, { useState, useRef, useEffect } from 'react';
import { ImageEntity, Point, Entity } from '../types';

interface ImageEditorOverlayProps {
    entity: ImageEntity;
    zoom: number;
    pan: Point;
    onUpdate: (id: string, updates: Partial<ImageEntity>) => void;
    isActive: boolean;
}

export const ImageEditorOverlay: React.FC<ImageEditorOverlayProps> = ({ entity, zoom, pan, onUpdate, isActive }) => {
    if (!isActive) return null;

    const [isResizing, setIsResizing] = useState<string | null>(null);
    const startPos = useRef<{ x: number, y: number, w: number, h: number, cropStart: any, pt: Point }>({ x: 0, y: 0, w: 0, h: 0, cropStart: {}, pt: {x:0, y:0} });

    const handlePointerDown = (e: React.PointerEvent, handle: string) => {
        e.stopPropagation();
        e.preventDefault();
        setIsResizing(handle);
        startPos.current = {
            x: e.clientX,
            y: e.clientY,
            w: entity.width,
            h: entity.height,
            pt: entity.point,
            cropStart: {
                top: entity.crop?.top || 0,
                bottom: entity.crop?.bottom || 0,
                left: entity.crop?.left || 0,
                right: entity.crop?.right || 0
            }
        };
    };

    useEffect(() => {
        if (!isResizing) return;
        
        const handlePointerMove = (e: PointerEvent) => {
            const dx = (e.clientX - startPos.current.x) / zoom;
            const dy = (e.clientY - startPos.current.y) / zoom;

            const updates: Partial<ImageEntity> = {};

            if (isResizing.startsWith('crop-')) {
                const c = { ...startPos.current.cropStart };
                if (isResizing.includes('top')) c.top = Math.max(0, Math.min(100 - c.bottom, c.top + (dy / startPos.current.h) * 100));
                if (isResizing.includes('bottom')) c.bottom = Math.max(0, Math.min(100 - c.top, c.bottom - (dy / startPos.current.h) * 100));
                if (isResizing.includes('left')) c.left = Math.max(0, Math.min(100 - c.right, c.left + (dx / startPos.current.w) * 100));
                if (isResizing.includes('right')) c.right = Math.max(0, Math.min(100 - c.left, c.right - (dx / startPos.current.w) * 100));
                updates.crop = c;
            } else if (isResizing.startsWith('scale-')) {
                // Resize logic
                let nw = startPos.current.w;
                let nh = startPos.current.h;
                let nx = startPos.current.pt.x;
                let ny = startPos.current.pt.y;

                if (isResizing.includes('right')) nw = Math.max(10, startPos.current.w + dx);
                if (isResizing.includes('bottom')) nh = Math.max(10, startPos.current.h + dy);
                if (isResizing.includes('left')) { nw = Math.max(10, startPos.current.w - dx); nx = startPos.current.pt.x + dx; }
                if (isResizing.includes('top')) { nh = Math.max(10, startPos.current.h - dy); ny = startPos.current.pt.y + dy; }

                updates.width = nw;
                updates.height = nh;
                updates.point = { x: nx, y: ny };
            }

            onUpdate(entity.id, updates);
        };

        const handlePointerUp = () => {
            setIsResizing(null);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [isResizing, entity.id, zoom, onUpdate]);

    const handleWheel = (e: React.WheelEvent) => {
        // Ctrl key typically zooms the page, we intercept normal wheel for scale
        e.stopPropagation();
        if (e.deltaY !== 0) {
            const scaleFactor = e.deltaY < 0 ? 1.05 : 0.95; // 5% scale
            const newW = entity.width * scaleFactor;
            const newH = entity.height * scaleFactor;
            
            // Adjust point to scale from center
            const cx = entity.point.x + entity.width / 2;
            const cy = entity.point.y + entity.height / 2;
            const nx = cx - newW / 2;
            const ny = cy - newH / 2;

            onUpdate(entity.id, { width: newW, height: newH, point: { x: nx, y: ny } });
        }
    };

    const leftPixels = (entity.crop?.left || 0) / 100 * entity.width;
    const topPixels = (entity.crop?.top || 0) / 100 * entity.height;
    const cropW = entity.width - ((entity.crop?.right || 0) / 100 * entity.width) - leftPixels;
    const cropH = entity.height - ((entity.crop?.bottom || 0) / 100 * entity.height) - topPixels;

    return (
        <div 
            style={{
                position: 'absolute',
                left: entity.point.x,
                top: entity.point.y,
                width: entity.width,
                height: entity.height,
                pointerEvents: 'auto',
                touchAction: 'none'
            }}
            onWheel={handleWheel}
        >
            {/* Scale Handles around the whole image */}
            <div className="absolute inset-0 border border-blue-500/30" />
            
            <div className="absolute top-0 right-0 w-3 h-3 bg-white border border-blue-600 rounded-sm -mt-1.5 -mr-1.5 cursor-ne-resize" onPointerDown={e => handlePointerDown(e, 'scale-top-right')} />
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-white border border-blue-600 rounded-sm -mb-1.5 -mr-1.5 cursor-se-resize" onPointerDown={e => handlePointerDown(e, 'scale-bottom-right')} />
            <div className="absolute bottom-0 left-0 w-3 h-3 bg-white border border-blue-600 rounded-sm -mb-1.5 -ml-1.5 cursor-sw-resize" onPointerDown={e => handlePointerDown(e, 'scale-bottom-left')} />
            <div className="absolute top-0 left-0 w-3 h-3 bg-white border border-blue-600 rounded-sm -mt-1.5 -ml-1.5 cursor-nw-resize" onPointerDown={e => handlePointerDown(e, 'scale-top-left')} />

            {/* Crop Boundary Overlay */}
            <div 
                className="absolute border border-emerald-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.3)] pointer-events-none"
                style={{
                    left: leftPixels,
                    top: topPixels,
                    width: cropW,
                    height: cropH,
                }}
            >
                {/* Crop Handles (pointer-events-auto inside the pointer-events-none container) */}
                <div className="absolute top-0 left-1/2 w-4 h-4 bg-emerald-500 rounded-full -mt-2 -ml-2 cursor-n-resize pointer-events-auto" onPointerDown={e => handlePointerDown(e, 'crop-top')} />
                <div className="absolute bottom-0 left-1/2 w-4 h-4 bg-emerald-500 rounded-full -mb-2 -ml-2 cursor-s-resize pointer-events-auto" onPointerDown={e => handlePointerDown(e, 'crop-bottom')} />
                <div className="absolute top-1/2 left-0 w-4 h-4 bg-emerald-500 rounded-full -mt-2 -ml-2 cursor-w-resize pointer-events-auto" onPointerDown={e => handlePointerDown(e, 'crop-left')} />
                <div className="absolute top-1/2 right-0 w-4 h-4 bg-emerald-500 rounded-full -mt-2 -mr-2 cursor-e-resize pointer-events-auto" onPointerDown={e => handlePointerDown(e, 'crop-right')} />
                
                {/* Visual Label */}
                <div className="absolute -top-6 left-0 bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 font-bold rounded font-mono pointer-events-none">
                    Taglia / Ritaglia
                </div>
            </div>
        </div>
    );
};
