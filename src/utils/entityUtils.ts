import { Entity, LineEntity } from '../types';

export const mergeAllSegments = (entities: Entity[]): Entity[] => {
    const lines = entities.filter(e => e.type === 'line') as LineEntity[];
    const others = entities.filter(e => e.type !== 'line');
    
    // Group lines by layer and mode
    const groups: { [key: string]: LineEntity[] } = {};
    for (const line of lines) {
        const key = `${line.layer}-${line.mode}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(line);
    }
    
    let mergedLines: LineEntity[] = [];
    
    for (const key in groups) {
        let group = groups[key];
        let canMerge = true;
        
        while (canMerge) {
            canMerge = false;
            for (let i = 0; i < group.length; i++) {
                for (let j = i + 1; j < group.length; j++) {
                    const l1 = group[i];
                    const l2 = group[j];
                    
                    const dx1 = l1.end.x - l1.start.x;
                    const dy1 = l1.end.y - l1.start.y;
                    const dx2 = l2.end.x - l2.start.x;
                    const dy2 = l2.end.y - l2.start.y;

                    // Check for any connection and collinearity
                    const connectionType = 
                        (Math.abs(l1.end.x - l2.start.x) < 0.1 && Math.abs(l1.end.y - l2.start.y) < 0.1) ? 'end-start' :
                        (Math.abs(l1.start.x - l2.end.x) < 0.1 && Math.abs(l1.start.y - l2.end.y) < 0.1) ? 'start-end' :
                        (Math.abs(l1.start.x - l2.start.x) < 0.1 && Math.abs(l1.start.y - l2.start.y) < 0.1) ? 'start-start' :
                        (Math.abs(l1.end.x - l2.end.x) < 0.1 && Math.abs(l1.end.y - l2.end.y) < 0.1) ? 'end-end' : null;
                    
                    const collinear = Math.abs(dx1 * dy2 - dy1 * dx2) < 0.5;
                        
                    if (connectionType && collinear) {
                        // Merge logic
                        let start = l1.start;
                        let end = l1.end;
                        
                        if (connectionType === 'end-start') { end = l2.end; }
                        else if (connectionType === 'start-end') { start = l2.start; }
                        else if (connectionType === 'start-start') { start = l1.end; end = l2.end; /* naive reversal */ }
                        else if (connectionType === 'end-end') { start = l1.start; end = l2.start; /* naive reversal */ }
                        
                        const l1Length = Math.sqrt((l1.end.x - l1.start.x) ** 2 + (l1.end.y - l1.start.y) ** 2);
                        const l2Length = Math.sqrt((l2.end.x - l2.start.x) ** 2 + (l2.end.y - l2.start.y) ** 2);
                        const mergedLength = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
                        if (mergedLength < Math.max(l1Length, l2Length) - 0.1) {
                            // This merge collapses the line, so skip merging
                            continue;
                        }

                        const mergedLine: LineEntity = {
                            ...l1,
                            start: start,
                            end: end,
                            inkPoints: l1.inkPoints && l2.inkPoints ? [...l1.inkPoints, ...l2.inkPoints] : undefined
                        };
                        
                        group[i] = mergedLine;
                        group.splice(j, 1);
                        canMerge = true;
                        break;
                    }
                }
                if (canMerge) break;
            }
        }
        mergedLines.push(...group);
    }
    
    return [...others, ...mergedLines];
};
