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

type Elem = Template['entities'][0];

// -- HELPERS PER GENERARE FORME COMPLESSE --
function rect(cx: number, cy: number, w: number, h: number): Elem[] {
    const x = cx - w/2;
    const y = cy - h/2;
    return [
        { type: 'line', start: { x, y }, end: { x: x + w, y } },
        { type: 'line', start: { x: x + w, y }, end: { x: x + w, y: y + h } },
        { type: 'line', start: { x: x + w, y: y + h }, end: { x, y: y + h } },
        { type: 'line', start: { x, y: y + h }, end: { x, y } }
    ];
}

function roundedRect(cx: number, cy: number, w: number, h: number, r: number): Elem[] {
    const x = cx - w/2;
    const y = cy - h/2;
    return [
        { type: 'line', start: { x: x + r, y: y }, end: { x: x + w - r, y: y } },
        { type: 'arc', center: { x: x + w - r, y: y + r }, radius: r, startAngle: 270, endAngle: 360 },
        { type: 'line', start: { x: x + w, y: y + r }, end: { x: x + w, y: y + h - r } },
        { type: 'arc', center: { x: x + w - r, y: y + h - r }, radius: r, startAngle: 0, endAngle: 90 },
        { type: 'line', start: { x: x + w - r, y: y + h }, end: { x: x + r, y: y + h } },
        { type: 'arc', center: { x: x + r, y: y + h - r }, radius: r, startAngle: 90, endAngle: 180 },
        { type: 'line', start: { x: x, y: y + h - r }, end: { x: x, y: y + r } },
        { type: 'arc', center: { x: x + r, y: y + r }, radius: r, startAngle: 180, endAngle: 270 },
    ];
}

function rotateElems(elems: Elem[], cx: number, cy: number, angleDeg: number): Elem[] {
    const rad = angleDeg * Math.PI / 180;
    const rot = (p: Point): Point => {
        const dx = p.x - cx;
        const dy = p.y - cy;
        return {
            x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
            y: cy + dx * Math.sin(rad) + dy * Math.cos(rad)
        };
    };
    return elems.map(e => {
        if (e.type === 'line') return { ...e, start: rot(e.start), end: rot(e.end) };
        if (e.type === 'circle') return { ...e, center: rot(e.center) };
        if (e.type === 'arc') return { ...e, center: rot(e.center), startAngle: (e.startAngle + angleDeg) % 360, endAngle: (e.endAngle + angleDeg) % 360 };
        return e;
    });
}

function rotatedRect(cx: number, cy: number, w: number, h: number, angleDeg: number): Elem[] {
    return rotateElems(rect(cx, cy, w, h), cx, cy, angleDeg);
}

function line(x1: number, y1: number, x2: number, y2: number): Elem {
    return { type: 'line', start: { x: x1, y: y1 }, end: { x: x2, y: y2 } };
}

function arc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): Elem {
    return { type: 'arc', center: { x: cx, y: cy }, radius: r, startAngle, endAngle };
}

function circle(cx: number, cy: number, r: number): Elem {
    return { type: 'circle', center: { x: cx, y: cy }, radius: r };
}

function chairTop(cx: number, cy: number, angle: number): Elem[] {
    const base: Elem[] = [
        ...roundedRect(cx, cy+5, 40, 35, 5), // seat
        ...roundedRect(cx, cy-18, 45, 10, 2), // backrest
        line(cx-15, cy-13, cx-15, cy-8), // left arm link
        line(cx+15, cy-13, cx+15, cy-8), // right arm link
    ];
    return rotateElems(base, cx, cy, angle);
}

// ---------------------------
// MASTERPIECE TEMPLATES ("Trasferibili" style)
// ---------------------------

const comodino: Elem[] = [
    ...rect(0, 0, 50, 40),
    ...rect(0, 0, 42, 32)
];

const lampada: Elem[] = [
    ...rect(0, 5, 20, 10), // base
    line(0, 5, 0, -5), // stand
    circle(0, -5, 12), // shade top
    circle(0, -5, 4) // bulb
];

const lettoMatrimoniale: Elem[] = [
    ...rect(0, 0, 180, 200), // mattress
    ...rect(0, -100, 190, 10), // headboard
    // Pillows
    ...rect(-45, -60, 70, 40), ...rect(-45, -60, 50, 25),
    ...rect(45, -60, 70, 40), ...rect(45, -60, 50, 25),
    // Folded blanket
    line(-90, -10, 90, 30),
    line(-20, 20, 90, 30), // fold corner
    line(-90, 15, 90, 55)
];

const lettoSingolo: Elem[] = [
    ...rect(0, 0, 90, 200),
    ...rect(0, -100, 100, 10),
    // Pillow
    ...rect(0, -60, 70, 40), ...rect(0, -60, 50, 25),
    // Folded blanket
    line(-45, -10, 45, 15),
    line(10, 5, 45, 15),
    line(-45, 15, 45, 40)
];

const poltrona: Elem[] = [
    ...rect(0, 0, 80, 80), // bounding
    ...rect(0, -32, 60, 16), // back cushion
    ...rect(-34, 0, 12, 80), // left armrest
    ...rect(34, 0, 12, 80), // right armrest
    ...rect(0, 8, 56, 64), // seat cushion
    ...rotatedRect(0, 8, 25, 25, 45), // throw pillow
    ...rotatedRect(0, 8, 15, 15, 45)  // inner pillow detail
];

const scrivania: Elem[] = [
    ...rect(0, 0, 120, 60),
    ...rect(-40, 0, 30, 50), // left drawer unit
    ...rect(-40, 0, 24, 44),
];

const sediaUfficio: Elem[] = [
    ...rect(0, 0, 45, 45), // seat
    ...roundedRect(0, -25, 45, 15, 5), // backrest
    ...rect(-25, 0, 6, 30), // armrests
    ...rect(25, 0, 6, 30)
];

const vasca: Elem[] = [
    ...rect(0, 0, 170, 70), // outer frame
    ...rect(0, 0, 150, 50), // inner basin
    // bevels
    line(-75, -25, -60, -15), line(75, -25, 60, -15), 
    line(-75, 25, -60, 15), line(75, 25, 60, 15),
    // drain and tap
    circle(60, 0, 3), 
    circle(30, -5, 2), circle(30, 5, 2), arc(30, 0, 4, 90, 270)
];

const wc: Elem[] = [
    ...rect(0, -25, 40, 20), // cistern
    ...rect(-12, -25, 24, 10), // flush button
    ...roundedRect(0, 5, 36, 40, 18), // bowl
    ...roundedRect(0, 5, 26, 30, 13) // inner seat
];

const bidet: Elem[] = [
    ...roundedRect(0, -5, 36, 50, 18), // outer
    ...roundedRect(0, 0, 26, 40, 13), // inner
    circle(0, -10, 2), // drain
    circle(-8, -18, 2), circle(8, -18, 2), // knobs
    line(-2, -18, -2, -14), line(2, -18, 2, -14), arc(0, -14, 2, 0, 180) // tap
];

const lavandino: Elem[] = [
    ...rect(0, 0, 80, 50), // base/counter
    ...roundedRect(0, 0, 54, 34, 16), // basin
    ...roundedRect(0, 0, 46, 26, 12), // inner basin
    circle(0, 2, 2.5), // drain
    circle(-12, -16, 2.5), circle(12, -16, 2.5), // knobs
    line(-3, -16, -3, -8), line(3, -16, 3, -8), arc(0, -8, 3, 0, 180) // tap
];

const doccia: Elem[] = [
    ...rect(0, 0, 90, 90), // tray
    ...rect(0, 0, 80, 80), // inner tray
    line(-40, -40, 40, 40), line(-40, 40, 40, -40), // slopes
    circle(0, 0, 4), circle(0, 0, 8), // drain
    ...rect(-43, 42, 86, 4), // glass door
    line(42, 42, 45, 0)
];

const tavolo4: Elem[] = [
    ...rect(0, 0, 90, 90),
    ...rect(0, 0, 70, 70), // inner detail
    ...chairTop(0, -70, 0), ...chairTop(0, 70, 180),
    ...chairTop(-70, 0, -90), ...chairTop(70, 0, 90),
];

const tavoloTondo4: Elem[] = [
    circle(0, 0, 55), circle(0, 0, 45), // double rings
    ...chairTop(0, -85, 0), ...chairTop(0, 85, 180),
    ...chairTop(-85, 0, -90), ...chairTop(85, 0, 90),
];

const tavolo6: Elem[] = [
    ...rect(0, 0, 160, 90),
    ...rect(0, 0, 140, 70),
    ...chairTop(-40, -70, 0), ...chairTop(40, -70, 0),
    ...chairTop(-40, 70, 180), ...chairTop(40, 70, 180),
    ...chairTop(-105, 0, -90), ...chairTop(105, 0, 90),
];

const tavolo8: Elem[] = [
    ...rect(0, 0, 220, 90),
    ...rect(0, 0, 200, 70),
    ...chairTop(-70, -70, 0), ...chairTop(0, -70, 0), ...chairTop(70, -70, 0),
    ...chairTop(-70, 70, 180), ...chairTop(0, 70, 180), ...chairTop(70, 70, 180),
    ...chairTop(-135, 0, -90), ...chairTop(135, 0, 90),
];

const divano2: Elem[] = [
    ...rect(0, 0, 160, 90),
    ...rect(0, -35, 160, 20), // backrest
    ...rect(-70, 5, 20, 80), // left arm
    ...rect(70, 5, 20, 80), // right arm
    ...rect(-30, 10, 60, 70), // left cushion
    ...rect(30, 10, 60, 70), // right cushion
    ...rotatedRect(-30, 20, 30, 30, 15), // throw pillows
    ...rotatedRect(30, 20, 30, 30, -15)
];

const divano3: Elem[] = [
    ...rect(0, 0, 220, 90),
    ...rect(0, -35, 220, 20),
    ...rect(-100, 5, 20, 80),
    ...rect(100, 5, 20, 80),
    ...rect(-60, 10, 60, 70),
    ...rect(0, 10, 60, 70),
    ...rect(60, 10, 60, 70),
    ...rotatedRect(-60, 20, 30, 30, 15),
    ...rotatedRect(60, 20, 30, 30, -15)
];

const divanoAngolare: Elem[] = [
    ...rect(0, -45, 260, 90),
    ...rect(-85, 45, 90, 90),
    ...rect(0, -80, 260, 20),
    ...rect(-120, -25, 20, 160),
    ...rect(120, -40, 20, 80),
    ...rect(-85, 120, 90, 20),
    ...rect(60, -35, 60, 70),
    ...rect(0, -35, 60, 70),
    ...rect(-80, -35, 60, 70),
    ...rect(-80, 45, 60, 70),
    ...rotatedRect(0, -40, 25, 25, -20),
    ...rotatedRect(-70, 45, 25, 25, 10)
];

const armadio200: Elem[] = [
    ...rect(0, 0, 200, 60),
    line(-100, -28, 100, -28),
    line(-100, -25, 0, -25), line(0, -22, 100, -22),
    line(-90, 5, 90, 5) // bastone
];
for(let x=-80; x<=80; x+=15) {
    armadio200.push(
        line(x-6, 5, x, 15), line(x+6, 5, x, 15), line(x-6, 5, x+6, 5), circle(x, 2, 1.5)
    );
}

const armadio300: Elem[] = [
    ...rect(0, 0, 300, 60),
    line(-150, -28, 150, -28),
    line(-150, -25, -50, -25), line(-50, -22, 50, -22), line(50, -25, 150, -25),
    line(-140, 5, 140, 5) // bastone
];
for(let x=-130; x<=130; x+=15) {
    armadio300.push(
        line(x-6, 5, x, 15), line(x+6, 5, x, 15), line(x-6, 5, x+6, 5), circle(x, 2, 1.5)
    );
}

// Persone, Alberi, Mezzi (Old base templates)
const uomo: Elem[] = [
    { type: 'circle', center: { x: 0, y: -165 }, radius: 12 },
    { type: 'line', start: { x: -22, y: -150 }, end: { x: 22, y: -150 } },
    { type: 'line', start: { x: -22, y: -150 }, end: { x: -18, y: -95 } },
    { type: 'line', start: { x: 22, y: -150 }, end: { x: 18, y: -95 } },
    { type: 'line', start: { x: -18, y: -95 }, end: { x: -15, y: 0 } },
    { type: 'line', start: { x: 18, y: -95 }, end: { x: 15, y: 0 } },
    { type: 'line', start: { x: -22, y: -150 }, end: { x: -25, y: -80 } },
    { type: 'line', start: { x: 22, y: -150 }, end: { x: 25, y: -80 } },
];
const albero: Elem[] = [
    circle(0, 0, 100), circle(0, 0, 90), circle(0, 0, 10),
    line(0, 0, 60, 60), line(0, 0, -60, 60), line(0, 0, 0, -85)
];
const bici: Elem[] = [
    circle(-35, -35, 35), circle(35, -35, 35),
    line(-35, -35, 0, -35), line(0, -35, 20, -80), line(35, -35, 25, -90)
];

export const TEMPLATES: Template[] = [
    // BAGNO
    { id: 'vasca_hq', name: 'Vasca (Pianta)', category: 'Bagno', view: 'pianta', entities: vasca },
    { id: 'doccia_hq', name: 'Box Doccia 90x90', category: 'Bagno', view: 'pianta', entities: doccia },
    { id: 'lavabo_hq', name: 'Lavabo con Mobile', category: 'Bagno', view: 'pianta', entities: lavandino },
    { id: 'wc_hq', name: 'WC Sospeso/Terra', category: 'Bagno', view: 'pianta', entities: wc },
    { id: 'bidet_hq', name: 'Bidet Sospeso/Terra', category: 'Bagno', view: 'pianta', entities: bidet },

    // ARREDI CAMERA / UFFICIO
    { id: 'bed_double_hq', name: 'Letto Matrimoniale', category: 'Arredi', view: 'pianta', entities: lettoMatrimoniale },
    { id: 'bed_single_hq', name: 'Letto Singolo', category: 'Arredi', view: 'pianta', entities: lettoSingolo },
    { id: 'comodino_hq', name: 'Comodino', category: 'Arredi', view: 'pianta', entities: comodino },
    { id: 'lampada_hq', name: 'Lampada da Tavolo', category: 'Arredi', view: 'pianta', entities: lampada },
    { id: 'poltrona_hq', name: 'Poltrona', category: 'Arredi', view: 'pianta', entities: poltrona },
    { id: 'scrivania_hq', name: 'Scrivania', category: 'Arredi', view: 'pianta', entities: scrivania },
    { id: 'sedia_ufficio_hq', name: 'Sedia Ufficio', category: 'Arredi', view: 'pianta', entities: sediaUfficio },
    { id: 'armadio_200_hq', name: 'Armadio 2 Antine 200cm', category: 'Arredi', view: 'pianta', entities: armadio200 },
    { id: 'armadio_300_hq', name: 'Armadio 3 Antine 300cm', category: 'Arredi', view: 'pianta', entities: armadio300 },
    
    // TAVOLI
    { id: 'tavolo_4_hq', name: 'Tavolo 4 Sedie', category: 'Arredi', view: 'pianta', entities: tavolo4 },
    { id: 'tavolo_tondo_4_hq', name: 'Tavolo Tondo 4 Sedie', category: 'Arredi', view: 'pianta', entities: tavoloTondo4 },
    { id: 'tavolo_6_hq', name: 'Tavolo 6 Sedie', category: 'Arredi', view: 'pianta', entities: tavolo6 },
    { id: 'tavolo_8_hq', name: 'Tavolo 8 Sedie', category: 'Arredi', view: 'pianta', entities: tavolo8 },

    // DIVANI
    { id: 'divano_2_hq', name: 'Divano 2 Posti', category: 'Arredi', view: 'pianta', entities: divano2 },
    { id: 'divano_3_hq', name: 'Divano 3 Posti', category: 'Arredi', view: 'pianta', entities: divano3 },
    { id: 'divano_ang_hq', name: 'Divano Angolare', category: 'Arredi', view: 'pianta', entities: divanoAngolare },

    // VARIE (Persone, Mezzi, Verde)
    { id: 'person_man_front', name: 'Uomo (Prospetto)', category: 'Persone', view: 'prospetto', entities: uomo },
    { id: 'tree_top_hq', name: 'Albero (Pianta)', category: 'Verde', view: 'pianta', entities: albero },
    { id: 'bicycle_side', name: 'Bici (Profilo)', category: 'Mezzi', view: 'prospetto', entities: bici },
];



