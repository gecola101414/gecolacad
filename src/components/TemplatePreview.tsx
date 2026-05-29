import React from 'react';
import { Template } from '../data/templates';

interface TemplatePreviewProps {
    template: Template;
    size?: number;
}

export const TemplatePreview: React.FC<TemplatePreviewProps> = ({ template, size = 60 }) => {
    // Calculate bounds to center and scale
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    template.entities.forEach(ent => {
        if (ent.type === 'line') {
            minX = Math.min(minX, ent.start.x, ent.end.x);
            minY = Math.min(minY, ent.start.y, ent.end.y);
            maxX = Math.max(maxX, ent.start.x, ent.end.x);
            maxY = Math.max(maxY, ent.start.y, ent.end.y);
        } else if (ent.type === 'circle' || ent.type === 'arc') {
            minX = Math.min(minX, ent.center.x - ent.radius);
            minY = Math.min(minY, ent.center.y - ent.radius);
            maxX = Math.max(maxX, ent.center.x + ent.radius);
            maxY = Math.max(maxY, ent.center.y + ent.radius);
        }
    });

    let width = maxX - minX;
    let height = maxY - minY;
    
    if (!isFinite(width)) width = 100;
    if (!isFinite(height)) height = 100;
    if (width === 0) width = 1;
    if (height === 0) height = 1;

    const padding = Math.max(width, height) * 0.15;
    
    const viewBox = `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`;

    return (
        <div className="flex items-center justify-center bg-neutral-200/30 rounded p-1 border border-neutral-300/20 shadow-inner group-hover:bg-white transition-colors duration-300">
            <svg 
                width={size} 
                height={size} 
                viewBox={viewBox} 
                className="stroke-neutral-700 fill-none"
                style={{ strokeWidth: '1.5px', strokeLinecap: 'round', strokeLinejoin: 'round' }}
            >
            {template.entities.map((te, i) => {
                if (te.type === 'line') {
                    return <line key={i} x1={te.start.x} y1={te.start.y} x2={te.end.x} y2={te.end.y} strokeWidth="2.5" />;
                } else if (te.type === 'circle') {
                    return <circle key={i} cx={te.center.x} cy={te.center.y} r={te.radius} strokeWidth="2.5" />;
                } else if (te.type === 'arc') {
                    // Approximate arc for SVG
                    const startRad = te.startAngle * Math.PI / 180;
                    const endRad = te.endAngle * Math.PI / 180;
                    const x1 = te.center.x + te.radius * Math.cos(startRad);
                    const y1 = te.center.y + te.radius * Math.sin(startRad);
                    const x2 = te.center.x + te.radius * Math.cos(endRad);
                    const y2 = te.center.y + te.radius * Math.sin(endRad);
                    const largeArcFlag = te.endAngle - te.startAngle <= 180 ? 0 : 1;
                    return (
                        <path 
                            key={i} 
                            d={`M ${x1} ${y1} A ${te.radius} ${te.radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`} 
                            strokeWidth="2.5" 
                        />
                    );
                }
                return null;
            })}
        </svg>
    </div>
    );
};
