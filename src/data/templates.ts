import { Point, Entity } from '../types';

export interface Template {
    id: string;
    name: string;
    category: 'Arredi' | 'Bagno' | 'Verde' | 'Persone' | 'Mezzi';
    view: 'pianta' | 'prospetto';
    entities: (
        | { type: 'line'; start: Point; end: Point }
        | { type: 'circle'; center: Point; radius: number }
        | { type: 'arc'; center: Point; radius: number; startAngle: number; endAngle: number }
    )[];
}

export const TEMPLATES: Template[] = [
    // --- PERSONE (PROSPETTO) ---
    {
        id: 'person_man_front',
        name: 'Uomo (Frontale)',
        category: 'Persone',
        view: 'prospetto',
        entities: [
            { type: 'circle', center: { x: 0, y: -165 }, radius: 12 }, // Testa
            { type: 'line', start: { x: -22, y: -150 }, end: { x: 22, y: -150 } }, // Spalle
            { type: 'line', start: { x: -22, y: -150 }, end: { x: -18, y: -95 } }, // Fianchi L
            { type: 'line', start: { x: 22, y: -150 }, end: { x: 18, y: -95 } }, // Fianchi R
            { type: 'line', start: { x: -18, y: -95 }, end: { x: -15, y: 0 } }, // Gamba L
            { type: 'line', start: { x: 18, y: -95 }, end: { x: 15, y: 0 } }, // Gamba R
            { type: 'line', start: { x: -22, y: -150 }, end: { x: -25, y: -80 } }, // Braccio L
            { type: 'line', start: { x: 22, y: -150 }, end: { x: 25, y: -80 } }, // Braccio R
        ]
    },
    {
        id: 'person_woman_front',
        name: 'Donna (Frontale)',
        category: 'Persone',
        view: 'prospetto',
        entities: [
            { type: 'circle', center: { x: 0, y: -155 }, radius: 10 },
            { type: 'line', start: { x: -18, y: -142 }, end: { x: 18, y: -142 } },
            { type: 'arc', center: { x: 0, y: -110 }, radius: 22, startAngle: 0, endAngle: 180 }, // Gonna
            { type: 'line', start: { x: -22, y: -110 }, end: { x: -10, y: 0 } },
            { type: 'line', start: { x: 22, y: -110 }, end: { x: 10, y: 0 } },
        ]
    },
    // --- BAGNO (PROSPETTO) ---
    {
        id: 'wc_front_hq',
        name: 'WC (Frontale)',
        category: 'Bagno',
        view: 'prospetto',
        entities: [
            { type: 'line', start: { x: -18, y: 0 }, end: { x: 18, y: 0 } },
            { type: 'arc', center: { x: 0, y: -20 }, radius: 18, startAngle: 0, endAngle: 180 },
            { type: 'line', start: { x: -18, y: -20 }, end: { x: -18, y: -42 } },
            { type: 'line', start: { x: 18, y: -20 }, end: { x: 18, y: -42 } },
            { type: 'line', start: { x: -20, y: -42 }, end: { x: 20, y: -42 } },
            { type: 'line', start: { x: -20, y: -42 }, end: { x: -20, y: -80 } },
            { type: 'line', start: { x: 20, y: -42 }, end: { x: 20, y: -80 } },
            { type: 'line', start: { x: -20, y: -80 }, end: { x: 20, y: -80 } },
        ]
    },
    {
        id: 'washbasin_front_hq',
        name: 'Lavabo (Frontale)',
        category: 'Bagno',
        view: 'prospetto',
        entities: [
            { type: 'line', start: { x: -30, y: -85 }, end: { x: 30, y: -85 } },
            { type: 'line', start: { x: -30, y: -85 }, end: { x: -25, y: -65 } },
            { type: 'line', start: { x: 30, y: -85 }, end: { x: 25, y: -65 } },
            { type: 'arc', center: { x: 0, y: -65 }, radius: 25, startAngle: 0, endAngle: 180 },
            { type: 'line', start: { x: -4, y: -85 }, end: { x: -4, y: 0 } },
            { type: 'line', start: { x: 4, y: -85 }, end: { x: 4, y: 0 } },
        ]
    },
    // --- BAGNO (PIANTA) ---
    {
        id: 'shower_plan_hq',
        name: 'Box Doccia (Pianta)',
        category: 'Bagno',
        view: 'pianta',
        entities: [
            { type: 'line', start: { x: -40, y: -40 }, end: { x: 40, y: -40 } },
            { type: 'line', start: { x: 40, y: -40 }, end: { x: 40, y: 40 } },
            { type: 'line', start: { x: 40, y: 40 }, end: { x: -40, y: 40 } },
            { type: 'line', start: { x: -40, y: 40 }, end: { x: -40, y: -40 } },
            { type: 'circle', center: { x: 30, y: 30 }, radius: 4 },
            { type: 'line', start: { x: -38, y: -38 }, end: { x: 38, y: 38 } },
        ]
    },
    // --- ARREDI (PIANTA) ---
    {
        id: 'bed_double_plan_hq',
        name: 'Letto Matr. (Pianta)',
        category: 'Arredi',
        view: 'pianta',
        entities: [
            { type: 'line', start: { x: -80, y: -100 }, end: { x: 80, y: -100 } },
            { type: 'line', start: { x: 80, y: -100 }, end: { x: 80, y: 100 } },
            { type: 'line', start: { x: 80, y: 100 }, end: { x: -80, y: 100 } },
            { type: 'line', start: { x: -80, y: 100 }, end: { x: -80, y: -100 } },
            { type: 'line', start: { x: -70, y: -90 }, end: { x: -10, y: -90 } },
            { type: 'line', start: { x: 10, y: -90 }, end: { x: 70, y: -90 } },
        ]
    },
    {
        id: 'sofa_hq_plan',
        name: 'Divano (Pianta)',
        category: 'Arredi',
        view: 'pianta',
        entities: [
            { type: 'line', start: { x: -100, y: -45 }, end: { x: 100, y: -45 } },
            { type: 'line', start: { x: 100, y: -45 }, end: { x: 100, y: 45 } },
            { type: 'line', start: { x: 100, y: 45 }, end: { x: -100, y: 45 } },
            { type: 'line', start: { x: -100, y: 45 }, end: { x: -100, y: -45 } },
            { type: 'line', start: { x: -85, y: -30 }, end: { x: 85, y: -30 } },
        ]
    },
    {
        id: 'table_round_plan',
        name: 'Tavolo Tondo (Pianta)',
        category: 'Arredi',
        view: 'pianta',
        entities: [
            { type: 'circle', center: { x: 0, y: 0 }, radius: 60 },
            { type: 'circle', center: { x: 0, y: 0 }, radius: 55 },
        ]
    },
    {
        id: 'chair_plan_hq',
        name: 'Sedia (Pianta)',
        category: 'Arredi',
        view: 'pianta',
        entities: [
            { type: 'line', start: { x: -22, y: -22 }, end: { x: 22, y: -22 } },
            { type: 'line', start: { x: 22, y: -22 }, end: { x: 22, y: 22 } },
            { type: 'line', start: { x: 22, y: 22 }, end: { x: -22, y: 22 } },
            { type: 'line', start: { x: -22, y: 22 }, end: { x: -22, y: -22 } },
            { type: 'line', start: { x: -22, y: 15 }, end: { x: 22, y: 15 } },
        ]
    },
    // --- MEZZI (PROSPETTO) ---
    {
        id: 'bicycle_side',
        name: 'Bici (Profilo)',
        category: 'Mezzi',
        view: 'prospetto',
        entities: [
            { type: 'circle', center: { x: -35, y: -35 }, radius: 35 },
            { type: 'circle', center: { x: 35, y: -35 }, radius: 35 },
            { type: 'line', start: { x: -35, y: -35 }, end: { x: 0, y: -35 } },
            { type: 'line', start: { x: 0, y: -35 }, end: { x: 20, y: -80 } },
            { type: 'line', start: { x: 35, y: -35 }, end: { x: 25, y: -90 } },
        ]
    },
    // --- VERDE (PIANTA) ---
    {
        id: 'tree_top_hq',
        name: 'Albero (Pianta)',
        category: 'Verde',
        view: 'pianta',
        entities: [
            { type: 'circle', center: { x: 0, y: 0 }, radius: 100 },
            { type: 'circle', center: { x: 0, y: 0 }, radius: 90 },
            { type: 'circle', center: { x: 0, y: 0 }, radius: 10 },
            { type: 'line', start: { x: 0, y: 0 }, end: { x: 60, y: 60 } },
            { type: 'line', start: { x: 0, y: 0 }, end: { x: -60, y: 60 } },
            { type: 'line', start: { x: 0, y: 0 }, end: { x: 0, y: -85 } },
        ]
    }
];



