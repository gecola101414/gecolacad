import React, { useState, useMemo, useEffect } from "react";
import { PREZZARIO_GECOLA } from "../data/prezzario";
import { DimensionEntity, Entity, Floor, PrezzarioItem } from "../types";
import { computeMetrics } from "../utils/bimMetrics";
import { BIM_FAMILIES } from "../data/bimFamilies";
import { 
  Clipboard, 
  Search, 
  Check, 
  Trash2, 
  Download, 
  Grid, 
  Plus, 
  Layers, 
  X, 
  Sliders, 
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  AlertCircle,
  FileJson,
  Save,
  Maximize2,
  Minimize2
} from "lucide-react";

// Converts numbers to Italian word format (e.g. 4533.28 -> Quattromilacinquecentotrentatre/28)
function numeroInLettere(num: number): string {
  const intero = Math.floor(num);
  const decimali = Math.round((num - intero) * 100);
  
  const unita = ["", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove"];
  const decine = ["", "dieci", "venti", "trenta", "quaranta", "cinquanta", "sessanta", "settanta", "ottanta", "novanta"];
  const speciali = ["dieci", "undici", "dodici", "tredici", "quattordici", "quindici", "sedici", "diciassette", "diciotto", "diciannove"];

  function convertiTreCifre(n: number): string {
    let res = "";
    const h = Math.floor(n / 100);
    const rest = n % 100;
    
    if (h > 0) {
      if (h === 1) {
        res += "cento";
      } else {
        res += unita[h] + "cento";
      }
    }
    
    if (rest > 0) {
      if (rest < 10) {
        res += unita[rest];
      } else if (rest < 20) {
        res += speciali[rest - 10];
      } else {
        const d = Math.floor(rest / 10);
        const u = rest % 10;
        let dStr = decine[d];
        if (u === 1 || u === 8) {
          dStr = dStr.slice(0, -1);
        }
        res += dStr + unita[u];
      }
    }
    return res;
  }

  function converti(n: number): string {
    if (n === 0) return "zero";
    let res = "";
    
    // Milioni
    const mil = Math.floor(n / 1000000);
    let rest = n % 1000000;
    if (mil > 0) {
      if (mil === 1) {
        res += "unmilione";
      } else {
        res += convertiTreCifre(mil) + "milioni";
      }
    }
    
    // Mila
    const mila = Math.floor(rest / 1000);
    rest = rest % 1000;
    if (mila > 0) {
      if (mila === 1) {
        res += "mille";
      } else {
        res += convertiTreCifre(mila) + "mila";
      }
    }
    
    if (rest > 0) {
      res += convertiTreCifre(rest);
    }
    
    return res.charAt(0).toUpperCase() + res.slice(1);
  }

  const interoInLettere = converti(intero);
  return `(${interoInLettere}/${decimali.toString().padStart(2, '0')})`;
}

interface ComputableItem {
  id: string;
  label: string;
  isBIM: boolean;
  subType: string;
  quantity: number;
  unita: string;
  codice: string;
  descrizione: string;
  prezzo: number;
  totale: number;
  includeInComputo: boolean;
  original: any;
  partiUguali: number;
  lunghezza: number | null;
  larghezza: number | null;
  altezza: number | null;
}

interface GroupedComputo {
  codice: string;
  descrizione: string;
  unita: string;
  prezzo: number;
  subItems: ComputableItem[];
  totaleQuantita: number;
  totaleImporto: number;
}

interface GecolaPrezzarioPanelProps {
  entities: Entity[];
  updateEntity: (id: string, updates: Partial<Entity>) => void;
  updateEntitiesWithHistory?: (newEntities: React.SetStateAction<Entity[]>) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  isOpen: boolean;
  onClose: () => void;
  setShortcutToast: (msg: string | null) => void;
  floors?: Floor[];
  prezzarioItems?: PrezzarioItem[];
  onOpenImporter?: () => void;
  isWorkspaceMode?: boolean;
}

export const GecolaPrezzarioPanel: React.FC<GecolaPrezzarioPanelProps> = ({
  entities,
  updateEntity,
  updateEntitiesWithHistory,
  selectedId,
  setSelectedId,
  isOpen,
  onClose,
  setShortcutToast,
  floors = [],
  prezzarioItems = PREZZARIO_GECOLA,
  onOpenImporter,
  isWorkspaceMode = false
}) => {
  const [activeTab, setActiveTab] = useState<"prezzario" | "computo">(isWorkspaceMode ? "computo" : "prezzario");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Tutte");
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(isWorkspaceMode);
  const [isDraggingOverComputo, setIsDraggingOverComputo] = useState(false);

  useEffect(() => {
    if (isWorkspaceMode) {
      setIsMaximized(true);
      setActiveTab("computo");
    }
  }, [isWorkspaceMode]);

  // Primus Document configuration states
  const [showPrimusModal, setShowPrimusModal] = useState(false);
  const [projectName, setProjectName] = useState("Nuovo Progetto Edile Professionale");
  const [committente, setCommittente] = useState("Nome Committente");
  const [computoDate, setComputoDate] = useState("Luglio 2026");
  const [prezzarioName, setPrezzarioName] = useState("Lombardia 2025");
  const [localita, setLocalita] = useState("Milano");
  const [progettista, setProgettista] = useState("Ing. Domenico Gimondo");

  // Position state for a floating window
  const [position, setPosition] = useState({ x: 80, y: 120 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Filter categories
  const categories = ["Tutte", ...Array.from(new Set(prezzarioItems.map(item => item.categoria)))];

  // Filter price list items
  const filteredPrezzario = prezzarioItems.filter(item => {
    const matchesSearch = item.codice.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.descrizione.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "Tutte" || item.categoria === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Generate computable items for both dimension measurements and BIM objects
  const computableItems = useMemo<ComputableItem[]>(() => {
    return entities.flatMap((e, index): ComputableItem[] => {
      if (e.type === "dimension") {
        const dim = e as DimensionEntity;
        const dx = dim.end.x - dim.start.x;
        const dy = dim.end.y - dim.start.y;
        const lengthM = Math.hypot(dx, dy) / 100;
        const mult = dim.moltiplicatore ?? 1.0;
        
        const price = dim.prezzarioPrezzo ?? 0.0;
        const code = dim.prezzarioCodice || "";
        const desc = dim.prezzarioDescrizione || "";
        const um = dim.prezzarioUnita || "m";
        const include = dim.includeInComputo !== false;

        // Apply dynamic sizing based on units for dimensions
        let finalQty = lengthM * mult;
        let lunghezza: number | null = lengthM;
        let larghezza: number | null = null;
        let altezza: number | null = null;

        if (um === "mc") {
          larghezza = 0.15;
          altezza = 2.70;
          finalQty = lengthM * larghezza * altezza * mult;
        } else if (um === "mq") {
          altezza = 2.70; // Vertical surface default
          larghezza = null;
          finalQty = lengthM * altezza * mult;
        } else if (um === "m") {
          lunghezza = lengthM;
          larghezza = null;
          altezza = null;
          finalQty = lengthM * mult;
        } else {
          lunghezza = null;
          larghezza = null;
          altezza = null;
          finalQty = mult;
        }

        return [{
          id: dim.id,
          label: `Quota Misura ${index + 1}`,
          isBIM: false,
          subType: "dimension",
          quantity: finalQty,
          unita: um,
          codice: code || "NP.GEN.001",
          descrizione: desc || `Misura lineare rilevata sul disegno (L = ${lengthM.toFixed(2)} m)`,
          prezzo: price || 15.0,
          totale: finalQty * (price || 15.0),
          includeInComputo: !!dim.includeInComputo,
          original: dim,
          partiUguali: mult,
          lunghezza,
          larghezza,
          altezza
        }];
      } else if (e.isBIM) {
        // BIM Element
        const metrics = computeMetrics(e);
        const familyId = (e as any).bimFamilyId || (e as any).bimAreaType || (e as any).bimFamily || "";
        const familyLower = familyId.toLowerCase();
        
        let label = (e as any).bimName || "Elemento BIM";
        let defaultCode = "NP.GEN.001";
        let defaultDesc = "Opere BIM generiche";
        let defaultUm = "cad";
        let defaultPrice = 120.00;
        let qty = 1;

        // Determine default based on BIM Family/Type
        if (familyLower.includes("pilastri_ca") || familyLower.includes("pilastro") || familyLower.includes("struttur") || (e as any).bimType === "column") {
          label = (e as any).bimName || "Pilastro in C.A.";
          defaultCode = "NP.OP03.002a";
          defaultDesc = "Calcestruzzo strutturale per pilastri, travi e solette in cemento armato, classe C25/30, compreso getto, compattazione con vibratore e cura del getto.";
          defaultUm = "mc";
          defaultPrice = 145.00;
          qty = metrics.volumeMc || 0.45; // default volume fallback if 0
        } else if (familyLower.includes("fondazioni") || familyLower.includes("fondazione") || familyLower.includes("plinto") || familyLower.includes("platea")) {
          label = (e as any).bimName || "Fondazione in C.A.";
          defaultCode = "NP.OP03.002a";
          defaultDesc = "Calcestruzzo strutturale per fondazioni, plinti, travi rovesce o platee in cemento armato, classe C25/30, compreso getto e compattazione.";
          defaultUm = "mc";
          defaultPrice = 145.00;
          qty = metrics.volumeMc || 1.20;
        } else if (familyLower.includes("murature_portanti") || familyLower.includes("muratura_portante") || familyLower.includes("muro_portante") || familyLower.includes("muratur")) {
          label = (e as any).bimName || "Muratura Portante";
          defaultCode = "RM.OP04.010";
          defaultDesc = "Muratura portante eseguita in blocchi di laterizio termico o mattoni pieni, allettata con malta cementizia, compreso ponteggi e finiture.";
          defaultUm = "mc"; 
          defaultPrice = 150.00;
          qty = metrics.volumeMc || (metrics.perimetroM * (metrics.spessoreCm || 30)/100 * metrics.altezzaM) || 5.0;
        } else if (familyLower.includes("muro") || familyLower.includes("parete") || familyLower.includes("tramezz") || (e as any).bimType === "wall") {
          label = (e as any).bimName || "Tramezzatura / Parete Divisoria";
          defaultCode = "RM.OP04.012a";
          defaultDesc = "Tavolato per divisori interni eseguito con blocchi di laterizio forato spessore 12 cm, legati con malta cementizia M5, compreso intonaco strutturale.";
          defaultUm = "mq";
          defaultPrice = 68.00;
          qty = metrics.perimetroM * metrics.altezzaM || metrics.areaMq || 10;
        } else if (familyLower.includes("massetti") || familyLower.includes("massetto")) {
          label = (e as any).bimName || "Massetto Sottofondo";
          defaultCode = "NP.OP08.015b";
          defaultDesc = "Massetto autolivellante a base cementizia per interni, tirato in piano, spessore medio 5 cm, idoneo per posa di pavimenti.";
          defaultUm = "mq";
          defaultPrice = 24.50;
          qty = metrics.areaMq || 15;
        } else if (familyLower.includes("intonac")) {
          label = (e as any).bimName || "Intonaco Pareti";
          defaultCode = "NP.OP04.015a";
          defaultDesc = "Intonaco rustico e di finitura tirato in piano con malta bastarda o premiscelata per interni, spessore medio 1.5 cm.";
          defaultUm = "mq";
          defaultPrice = 22.50;
          qty = (metrics.perimetroM * metrics.altezzaM) || metrics.areaMq || 10;
        } else if (familyLower.includes("pittur") || familyLower.includes("tintegg") || familyLower.includes("pittura")) {
          label = (e as any).bimName || "Tinteggiatura";
          defaultCode = "NP.OP05.001";
          defaultDesc = "Tinteggiatura con idropittura lavabile ad alta copertura per interni, stesa in due mani previa preparazione.";
          defaultUm = "mq";
          defaultPrice = 12.00;
          qty = metrics.perimetroM * metrics.altezzaM || metrics.areaMq || 10;
        } else if (familyLower.includes("controsoffitt") || familyLower.includes("cartongesso")) {
          label = (e as any).bimName || "Controsoffitto / Cartongesso";
          defaultCode = "NP.OP12.001";
          defaultDesc = "Controsoffitto piano ad orditura metallica semplice e singola lastra di cartongesso standard spessore 12.5 mm, compreso stuccatura dei giunti.";
          defaultUm = "mq";
          defaultPrice = 38.00;
          qty = metrics.areaMq || 15;
        } else if (familyLower.includes("copertur") || familyLower.includes("tetto")) {
          label = (e as any).bimName || "Copertura / Tetto";
          defaultCode = "NP.OP13.001";
          defaultDesc = "Fornitura e posa di manto di copertura o isolamento termico del tetto piano o inclinato.";
          defaultUm = "mq";
          defaultPrice = 85.00;
          qty = metrics.areaMq || 15;
        } else if (familyLower.includes("solaio")) {
          label = (e as any).bimName || "Solaio Interpiano";
          defaultCode = "NP.OP03.005";
          defaultDesc = "Solaio interpiano in laterocemento, spessore 20+4 cm, compreso travetti, pignatte, rete elettrosaldata e getto di completamento.";
          defaultUm = "mq";
          defaultPrice = 110.00;
          qty = metrics.areaMq || 15;
        } else if (familyLower.includes("isolament") || familyLower.includes("cappotto")) {
          label = (e as any).bimName || "Isolamento Termico";
          defaultCode = "NP.OP06.002";
          defaultDesc = "Isolamento termico a cappotto esterno o interno con pannelli, compresa rasatura e rete di rinforzo.";
          defaultUm = "mq";
          defaultPrice = 55.00;
          qty = metrics.areaMq || (metrics.perimetroM * metrics.altezzaM) || 15;
        } else if (familyLower.includes("impermeabilizz")) {
          label = (e as any).bimName || "Impermeabilizzazione";
          defaultCode = "NP.OP06.010";
          defaultDesc = "Impermeabilizzazione con doppia guaina elastomerica sfalsata applicata a caldo su superfici orizzontali o verticali.";
          defaultUm = "mq";
          defaultPrice = 16.50;
          qty = metrics.areaMq || 15;
        } else if (familyLower.includes("rivestiment")) {
          label = (e as any).bimName || "Rivestimento Parete";
          defaultCode = "NP.OP11.050";
          defaultDesc = "Rivestimento in piastrelle ceramiche o gres per pareti di bagni e cucine, compresa colla e sigillatura fughe.";
          defaultUm = "mq";
          defaultPrice = 38.00;
          qty = (metrics.perimetroM * metrics.altezzaM) || metrics.areaMq || 10;
        } else if (familyLower.includes("casseri") || familyLower.includes("casseratur")) {
          label = (e as any).bimName || "Casseforme / Casseri";
          defaultCode = "NP.OP03.015";
          defaultDesc = "Casseforme in legname o pannelli metallici per getto di pilastri verticali o pareti, compreso disarmante.";
          defaultUm = "mq";
          defaultPrice = 32.00;
          qty = (metrics.perimetroM * metrics.altezzaM) || 10;
        } else if ((e as any).bimType === "door" || familyLower.includes("porte_interne") || familyLower.includes("porta")) {
          label = (e as any).bimName || "Porta Interna";
          defaultCode = "NP.OP09.112";
          defaultDesc = "Porta per interni in legno tamburato o nobilitato, completa di contro-telaio, cerniere e maniglia.";
          defaultUm = "cad";
          defaultPrice = 380.00;
          qty = 1;
        } else if ((e as any).bimType === "window" || familyLower.includes("serramenti_esterni") || familyLower.includes("finestra") || familyLower.includes("serrament")) {
          label = (e as any).bimName || "Serramento Esterno";
          defaultCode = "NP.OP09.208";
          defaultDesc = "Serramento esterno in PVC a 5 camere, triplo vetro basso emissivo con gas Argon.";
          defaultUm = "cad";
          defaultPrice = 550.00;
          qty = 1;
        } else if (familyLower.includes("elettric") || (e as any).bimType === "electrical_symbol") {
          label = (e as any).bimName || "Punto Luce";
          defaultCode = "EE.OP15.004";
          defaultDesc = "Punto luce o punto di comando interno con scatola porta frutti da incasso tipo BTicino o Vimar.";
          defaultUm = "cad";
          defaultPrice = 85.00;
          qty = 1;
        } else if (familyLower.includes("idric") || familyLower.includes("idraul") || (e as any).bimType === "hydraulic_symbol") {
          label = (e as any).bimName || "Punto Acqua";
          defaultCode = "ID.OP16.032";
          defaultDesc = "Punto acqua adduzione fredda/calda e sistema di scarico completo eseguito con tubazioni multistrato.";
          defaultUm = "cad";
          defaultPrice = 240.00;
          qty = 1;
        } else if (familyLower.includes("arredo_bagno") || familyLower.includes("sanitari")) {
          label = (e as any).bimName || "Sanitari Bagno";
          defaultCode = "ID.OP16.080";
          defaultDesc = "Fornitura e posa di sanitari (vaso e bidet) in ceramica bianca, compreso rubinetteria e allacciamenti.";
          defaultUm = "cad";
          defaultPrice = 450.00;
          qty = 1;
        } else if (familyLower.includes("termico_clima") || familyLower.includes("riscaldament") || familyLower.includes("clima")) {
          label = (e as any).bimName || "Corpo Scaldante / Clima";
          defaultCode = "ID.OP16.050";
          defaultDesc = "Fornitura e posa di corpo scaldante (radiatore) o split condizionamento completo di allacciamenti.";
          defaultUm = "cad";
          defaultPrice = 350.00;
          qty = 1;
        } else if (familyLower.includes("scale_parapetti") || familyLower.includes("parapett") || familyLower.includes("ringhier")) {
          label = (e as any).bimName || "Ringhiera / Parapetto";
          defaultCode = "NP.OP14.010";
          defaultDesc = "Fornitura e posa di ringhiera o parapetto in ferro o vetro per scale o balconi.";
          defaultUm = "m";
          defaultPrice = 120.00;
          qty = metrics.perimetroM || 1.0;
        } else if (familyLower.includes("paviment")) {
          label = (e as any).bimName || "Pavimentazione";
          defaultCode = "NP.OP11.022";
          defaultDesc = "Fornitura e posa in opera di pavimentazione in piastrelle di gres porcellanato di prima scelta.";
          defaultUm = "mq";
          defaultPrice = 45.00;
          qty = metrics.areaMq || 15;
        } else if (familyLower.includes("ponteggio")) {
          label = (e as any).bimName || "Allestimento Ponteggio";
          defaultCode = "NP.OP14.100";
          defaultDesc = "Allestimento e noleggio di ponteggio metallico fisso a telai prefabbricati per lavori di facciata, compreso montaggio, smontaggio e ancoraggi di sicurezza.";
          defaultUm = "mq";
          defaultPrice = 35.00;
          qty = metrics.perimetroM * (metrics.altezzaM || 12.0) || 45.0;
        } else if (familyLower.includes("mantovana")) {
          label = (e as any).bimName || "Mantovana di Sicurezza (Parasassi)";
          defaultCode = "NP.OP14.110";
          defaultDesc = "Fornitura, posa in opera e smontaggio di mantovana di sicurezza parasassi (catch fan) in lamiera zincata ondulata sporgente, completa di staffe metalliche di sostegno ancorate al ponteggio.";
          defaultUm = "m";
          defaultPrice = 28.50;
          qty = metrics.perimetroM || 15.0;
        }

        // Overrides if set explicitly on entity
        const code = (e as any).prezzarioCodice || (e as any).cost_5d?.prezzarioCodice || defaultCode;
        const desc = (e as any).prezzarioDescrizione || (e as any).cost_5d?.prezzarioDescrizione || defaultDesc;
        const um = ((e as any).prezzarioUnita || (e as any).cost_5d?.prezzarioUnita || defaultUm).toLowerCase();
        const price = (e as any).prezzarioPrezzo !== undefined ? (e as any).prezzarioPrezzo : ((e as any).cost_5d?.prezzarioPrezzo !== undefined ? (e as any).cost_5d?.prezzarioPrezzo : defaultPrice);
        
        // CRITICAL: If we have prezzario data, prioritize it for labeling
        const effectiveLabel = (e as any).prezzarioDescrizione || (e as any).cost_5d?.prezzarioDescrizione || (e as any).bimName || label;
        
        // Handle custom multiplier/factor if specified
        const mult = (e as any).moltiplicatore ?? 1.0;

        const isManual = !!(e as any).isManualComputo;

        // DYNAMIC CALCULATION based on overridden unit 'um' and entity shape
        qty = 1.0;
        let lunghezza: number | null = isManual ? ((e as any).lunghezza ?? 1.0) : null;
        let larghezza: number | null = isManual ? ((e as any).larghezza ?? null) : null;
        let altezza: number | null = isManual ? ((e as any).altezza ?? null) : null;

        if (isManual) {
          const uLower = um.toLowerCase();
          const L = lunghezza ?? 1.0;
          const W = larghezza ?? 1.0;
          const H = altezza ?? 1.0;
          if (uLower === "mc") {
            qty = L * W * H;
          } else if (uLower === "mq") {
            qty = L * (larghezza !== null ? W : (altezza !== null ? H : 1.0));
          } else if (uLower === "m") {
            qty = L;
          } else {
            qty = 1.0;
          }
        } else {
          const isWallFamily = familyLower.includes("muro") || familyLower.includes("parete") || familyLower.includes("tramezz") || familyLower.includes("cartongesso") || familyLower.includes("cappotto") || (e as any).bimType === "wall";
          const isPlasterOrPaint = familyLower.includes("intonac") || familyLower.includes("pittur") || familyLower.includes("tintegg") || familyLower.includes("rivestiment");
          const isColumnFamily = familyLower.includes("pilastri") || familyLower.includes("struttur") || (e as any).bimType === "column";
          const isDoorOrWindow = (e as any).bimType === "door" || (e as any).bimType === "window";

          // Bounding box for polygons/points if available
          const points = (e as any).bimPoints || (e as any).points || [];
          let bbWidth = 1.0;
          let bbHeight = 1.0;
          if (points && points.length > 0) {
            const xs = points.map((p: any) => p.x);
            const ys = points.map((p: any) => p.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            bbWidth = Math.max(0.1, (maxX - minX) / 100);
            bbHeight = Math.max(0.1, (maxY - minY) / 100);
          }

          if (um === "mc") {
            // Volume
            if (e.type === "line") {
              const line = e as any;
              const start = line.start || { x: 0, y: 0 };
              const end = line.end || { x: 0, y: 0 };
              lunghezza = Math.hypot(end.x - start.x, end.y - start.y) / 100;
              larghezza = (metrics.spessoreCm || 15) / 100;
              altezza = metrics.altezzaM || 2.70;
              qty = lunghezza * larghezza * altezza;
            } else if (e.type === "rectangle") {
              const rect = e as any;
              lunghezza = Math.abs(rect.p2.x - rect.p1.x) / 100;
              larghezza = Math.abs(rect.p2.y - rect.p1.y) / 100;
              altezza = metrics.altezzaM || 2.70;
              qty = lunghezza * larghezza * altezza;
            } else if (points && points.length > 2) {
              lunghezza = bbWidth;
              // set larghezza so that lunghezza * larghezza = areaMq
              larghezza = metrics.areaMq / bbWidth;
              altezza = metrics.altezzaM || 2.70;
              qty = metrics.areaMq * altezza;
            } else if (isDoorOrWindow) {
              const wCm = (e as any).bimWidth || (e as any).width || 80;
              const hCm = (e as any).bimWindowHeight || (e as any).bimHeight || ((e as any).bimType === 'door' ? 210 : 140);
              lunghezza = wCm / 100;
              larghezza = 0.15; // default wall depth
              altezza = hCm / 100;
              qty = lunghezza * larghezza * altezza;
            } else {
              lunghezza = metrics.areaMq > 0 ? metrics.areaMq : 1.0;
              larghezza = 1.0;
              altezza = metrics.altezzaM || 2.70;
              qty = metrics.volumeMc || (lunghezza * larghezza * altezza);
            }
          } else if (um === "mq") {
            // Surface Area
            // Check if it is a vertical surface (wall, plaster, paint) or horizontal surface (floor, ceiling, slab)
            const isVertical = isWallFamily || isPlasterOrPaint || familyLower.includes("ponteggio") || familyLower.includes("parapett");
            
            if (isVertical) {
              // Vertical surface: needs exactly TWO measurements: length and height. width/depth is null.
              if (e.type === "line") {
                const line = e as any;
                const start = line.start || { x: 0, y: 0 };
                const end = line.end || { x: 0, y: 0 };
                lunghezza = Math.hypot(end.x - start.x, end.y - start.y) / 100;
                larghezza = null;
                altezza = metrics.altezzaM || 2.70;
                qty = lunghezza * altezza;
              } else if (e.type === "rectangle") {
                const rect = e as any;
                // For a wall drawn as rectangle, the length is the longer dimension
                const w = Math.abs(rect.p2.x - rect.p1.x) / 100;
                const d = Math.abs(rect.p2.y - rect.p1.y) / 100;
                lunghezza = Math.max(w, d);
                larghezza = null;
                altezza = metrics.altezzaM || 2.70;
                qty = lunghezza * altezza;
              } else if (points && points.length > 2) {
                // Plaster or wall perimeter
                lunghezza = metrics.perimetroM;
                larghezza = null;
                altezza = metrics.altezzaM || 2.70;
                qty = lunghezza * altezza;
              } else if (isDoorOrWindow) {
                const wCm = (e as any).bimWidth || (e as any).width || 80;
                const hCm = (e as any).bimWindowHeight || (e as any).bimHeight || ((e as any).bimType === 'door' ? 210 : 140);
                lunghezza = wCm / 100;
                larghezza = null;
                altezza = hCm / 100;
                qty = lunghezza * altezza;
              } else {
                lunghezza = metrics.perimetroM || 5.0;
                larghezza = null;
                altezza = metrics.altezzaM || 2.70;
                qty = lunghezza * altezza;
              }
            } else {
              // Horizontal surface: needs exactly TWO measurements: length and width. height is null.
              if (e.type === "line") {
                const line = e as any;
                const start = line.start || { x: 0, y: 0 };
                const end = line.end || { x: 0, y: 0 };
                lunghezza = Math.hypot(end.x - start.x, end.y - start.y) / 100;
                larghezza = (metrics.spessoreCm || 15) / 100;
                altezza = null;
                qty = lunghezza * larghezza;
              } else if (e.type === "rectangle") {
                const rect = e as any;
                lunghezza = Math.abs(rect.p2.x - rect.p1.x) / 100;
                larghezza = Math.abs(rect.p2.y - rect.p1.y) / 100;
                altezza = null;
                qty = lunghezza * larghezza;
              } else if (points && points.length > 2) {
                lunghezza = bbWidth;
                larghezza = metrics.areaMq / bbWidth;
                altezza = null;
                qty = metrics.areaMq;
              } else if (isDoorOrWindow) {
                const wCm = (e as any).bimWidth || (e as any).width || 80;
                const hCm = (e as any).bimWindowHeight || (e as any).bimHeight || ((e as any).bimType === 'door' ? 210 : 140);
                lunghezza = wCm / 100;
                larghezza = hCm / 100;
                altezza = null;
                qty = lunghezza * larghezza;
              } else {
                lunghezza = metrics.areaMq || 1.0;
                larghezza = 1.00;
                altezza = null;
                qty = lunghezza;
              }
            }
          } else if (um === "m") {
            // Length
            if (e.type === "line") {
              const line = e as any;
              const start = line.start || { x: 0, y: 0 };
              const end = line.end || { x: 0, y: 0 };
              lunghezza = Math.hypot(end.x - start.x, end.y - start.y) / 100;
            } else {
              lunghezza = metrics.perimetroM || 1.0;
            }
            larghezza = null;
            altezza = null;
            qty = lunghezza;
          } else {
            // CAD, PCS, etc. (counted items)
            lunghezza = null;
            larghezza = null;
            altezza = null;
            qty = 1.0;
          }
        }

        const finalQty = qty * mult;
        const include = (e as any).includeInComputo !== false; // Default true for BIM elements unless explicitly unchecked

        // Extract dimension details
        let partiUguali = mult;

        // Custom label generation for finishes (finiture)
        let finalLabel = effectiveLabel;
        const isFinishElement = (ent: any) => {
          const famId = ent.bimFamilyId || ent.bimAreaType || ent.bimFamily || "";
          const famIdLower = famId.toLowerCase();
          
          // Find family in BIM_FAMILIES
          const famObj = BIM_FAMILIES.find(f => f.id === famId);
          if (famObj && famObj.category === 'finiture') {
            return true;
          }
          
          const nameLower = (ent.bimName || ent.name || "").toLowerCase();
          const layerLower = (ent.layer || "").toLowerCase();
          
          return famIdLower.includes("intonac") || 
                 famIdLower.includes("rivest") ||
                 famIdLower.includes("pittur") ||
                 famIdLower.includes("tinteg") ||
                 famIdLower.includes("isolam") ||
                 famIdLower.includes("cappott") ||
                 famIdLower.includes("finitur") ||
                 famIdLower.includes("plaster") ||
                 famIdLower.includes("massett") ||
                 famIdLower.includes("paviment") ||
                 nameLower.includes("intonac") ||
                 nameLower.includes("rivest") ||
                 nameLower.includes("pittur") ||
                 nameLower.includes("tinteg") ||
                 nameLower.includes("isolam") ||
                 nameLower.includes("cappott") ||
                 nameLower.includes("finitur") ||
                 nameLower.includes("plaster") ||
                 nameLower.includes("massett") ||
                 nameLower.includes("paviment") ||
                 layerLower.includes("finitur");
        };

        const getEntityFloorName = (ent: any) => {
          const z = ent.bimZPlane !== undefined ? ent.bimZPlane : (ent.zPlane !== undefined ? ent.zPlane : 0);
          if (!floors || floors.length === 0) {
            const layer = ent.layer || "";
            if (layer.match(/^p\d+/i)) return layer.toLowerCase();
            return 'p0';
          }
          const matchedFloor = floors.reduce((prev, curr) => 
            Math.abs(curr.elevation - z) < Math.abs(prev.elevation - z) ? curr : prev
          );
          if (!matchedFloor) return 'p0';
          const nameLower = matchedFloor.name.toLowerCase();
          if (nameLower.startsWith("piano ")) {
            const num = nameLower.replace("piano ", "").trim();
            return `p${num}`;
          } else if (nameLower.startsWith("piano_")) {
            const num = nameLower.replace("piano_", "").trim();
            return `p${num}`;
          } else if (nameLower.startsWith("p") && !isNaN(Number(nameLower.slice(1)))) {
            return nameLower;
          }
          return matchedFloor.name;
        };

        if (isManual) {
          finalLabel = (e as any).bimName || (e as any).name || "Voce Manuale";
        } else {
          const floorName = getEntityFloorName(e);
          if (isFinishElement(e)) {
            const parentEntity = (e as any).parentEntityId ? entities.find((ent: any) => ent.id === (e as any).parentEntityId) : null;
            const parentName = parentEntity ? ((parentEntity as any).bimName || (parentEntity as any).name || "Elemento Principale") : "";
            
            if (parentName) {
              finalLabel = `${floorName} - ${parentName} - ${label}`;
            } else {
              finalLabel = `${floorName} - ${label}`;
            }
          } else {
            finalLabel = `${floorName} - ${label}`;
          }
        }

        return [{
          id: e.id,
          label: finalLabel,
          isBIM: true,
          subType: isManual ? "manual" : (familyId || (e as any).bimType || "element"),
          quantity: finalQty,
          unita: um,
          codice: code,
          descrizione: desc,
          prezzo: price,
          totale: finalQty * price,
          includeInComputo: include,
          original: e,
          partiUguali,
          lunghezza,
          larghezza,
          altezza
        }];
      }
      return [];
    });
  }, [entities, floors]);

  // Dimension measurements
  const dimensionMisure = useMemo(() => {
    return entities.filter(e => e.type === "dimension") as DimensionEntity[];
  }, [entities]);

  // Active items in the computation
  const activeComputoItems = useMemo(() => {
    return computableItems.filter(item => item.includeInComputo);
  }, [computableItems]);

  // Group items by codice for professional Primus style
  const groupedComputoItems = useMemo<GroupedComputo[]>(() => {
    const groups: { [key: string]: GroupedComputo } = {};

    computableItems.forEach(item => {
      const key = item.codice || "NP.GEN.001";
      if (!groups[key]) {
        groups[key] = {
          codice: key,
          descrizione: item.descrizione,
          unita: item.unita,
          prezzo: item.prezzo,
          subItems: [],
          totaleQuantita: 0,
          totaleImporto: 0
        };
      }
      groups[key].subItems.push(item);
    });

    return Object.values(groups).map(group => {
      const activeSubs = group.subItems.filter(s => s.includeInComputo);
      const totalQty = activeSubs.reduce((sum, s) => sum + s.quantity, 0);
      return {
        ...group,
        totaleQuantita: totalQty,
        totaleImporto: totalQty * group.prezzo
      };
    });
  }, [computableItems]);

  // Calculate totals from grouped items
  const totalComputoAmount = useMemo(() => {
    return groupedComputoItems.reduce((acc, group) => acc + group.totaleImporto, 0);
  }, [groupedComputoItems]);

  // Handle Drag Start from Price List
  const handleDragStart = (e: React.DragEvent, item: PrezzarioItem) => {
    const dataString = JSON.stringify(item);
    e.dataTransfer.setData("application/json", dataString);
    e.dataTransfer.setData("text/plain", dataString);
    e.dataTransfer.effectAllowed = "copy";
  };

  // Drag and Drop on list row to associate item directly
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnRow = (e: React.DragEvent, dimId: string) => {
    e.preventDefault();
    try {
      const rawData = e.dataTransfer.getData("text/plain");
      const item = JSON.parse(rawData) as PrezzarioItem;
      if (item && item.codice) {
        updateEntity(dimId, {
          prezzarioCodice: item.codice,
          prezzarioDescrizione: item.descrizione,
          prezzarioUnita: item.unita,
          prezzarioPrezzo: item.prezzo,
          bimName: item.descrizione,
          name: item.descrizione,
          bimFamily: item.categoria || item.prezzario || "Importati",
          includeInComputo: true,
          cost_5d: {
            prezzarioCodice: item.codice,
            prezzarioDescrizione: item.descrizione,
            prezzarioUnita: item.unita,
            prezzarioPrezzo: item.prezzo,
            incidenzaManodopera: item.incidenzaManodopera || 0,
            prezzarioNome: item.prezzario || ""
          }
        } as any);
        setShortcutToast(`Voce ${item.codice} associata con successo! 📋`);
        setTimeout(() => setShortcutToast(null), 2500);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle toggle whole group
  const handleToggleGroup = (group: GroupedComputo, checked: boolean) => {
    group.subItems.forEach(item => {
      updateEntity(item.id, { includeInComputo: checked });
    });
    setShortcutToast(checked ? `Incluso intero gruppo ${group.codice} nel computo!` : `Escluso intero gruppo ${group.codice} dal computo!`);
    setTimeout(() => setShortcutToast(null), 2000);
  };

  // Handle drop on group header to update all elements
  const handleDropOnGroup = (e: React.DragEvent, group: GroupedComputo) => {
    e.preventDefault();
    try {
      const rawData = e.dataTransfer.getData("text/plain");
      const item = JSON.parse(rawData) as PrezzarioItem;
      if (item && item.codice) {
        group.subItems.forEach(sub => {
          updateEntity(sub.id, {
            prezzarioCodice: item.codice,
            prezzarioDescrizione: item.descrizione,
            prezzarioUnita: item.unita,
            prezzarioPrezzo: item.prezzo,
            bimName: item.descrizione,
            name: item.descrizione,
            bimFamily: item.categoria || item.prezzario || "Importati",
            includeInComputo: true,
            cost_5d: {
              prezzarioCodice: item.codice,
              prezzarioDescrizione: item.descrizione,
              prezzarioUnita: item.unita,
              prezzarioPrezzo: item.prezzo,
              incidenzaManodopera: item.incidenzaManodopera || 0,
              prezzarioNome: item.prezzario || ""
            }
          } as any);
        });
        setShortcutToast(`Aggiornato gruppo ${group.codice} con nuova voce ${item.codice}! 📋`);
        setTimeout(() => setShortcutToast(null), 2500);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDropNewManualItem = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverComputo(false);
    try {
      const rawData = e.dataTransfer.getData("text/plain");
      const item = JSON.parse(rawData) as PrezzarioItem;
      if (item && item.codice) {
        // Create manual virtual BIM entity
        const newManualEntity: any = {
          id: `manual_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          type: "text",
          point: { x: 0, y: 0 },
          text: item.descrizione,
          fontFamily: "Inter",
          fontSize: 12,
          fontWeight: "normal",
          textAlign: "left",
          color: "#ffffff",
          lineWidth: 1,
          layer: "manual_computo",
          hideIn2D: true,
          isBIM: true,
          isManualComputo: true,
          bimName: item.descrizione,
          name: item.descrizione,
          bimFamily: item.categoria || item.prezzario || "Importati",
          prezzarioCodice: item.codice,
          prezzarioDescrizione: item.descrizione,
          prezzarioUnita: item.unita,
          prezzarioPrezzo: item.prezzo,
          includeInComputo: true,
          moltiplicatore: 1.0,
          lunghezza: 1.0,
          larghezza: item.unita.toLowerCase() === "mc" ? 1.0 : null,
          altezza: (item.unita.toLowerCase() === "mc" || item.unita.toLowerCase() === "mq") ? 1.0 : null,
          cost_5d: {
            prezzarioCodice: item.codice,
            prezzarioDescrizione: item.descrizione,
            prezzarioUnita: item.unita,
            prezzarioPrezzo: item.prezzo,
            incidenzaManodopera: item.incidenzaManodopera || 0,
            prezzarioNome: item.prezzario || ""
          }
        };

        if (updateEntitiesWithHistory) {
          updateEntitiesWithHistory((prev: Entity[]) => [...prev, newManualEntity]);
          setSelectedId(newManualEntity.id);
          setShortcutToast(`Nuova voce manuale ${item.codice} aggiunta al computo! 📋`);
          setTimeout(() => setShortcutToast(null), 2500);
        } else {
          setShortcutToast("Azione non consentita: perno di inserimento non configurato.");
          setTimeout(() => setShortcutToast(null), 2500);
        }
      }
    } catch (err) {
      console.error("Error dropping manual item:", err);
    }
  };

  // Export Computo to TXT / CSV file formatted like Primus
  const handleExportComputo = () => {
    const activeGroups = groupedComputoItems.filter(g => g.totaleQuantita > 0);
    if (activeGroups.length === 0) {
      setShortcutToast("Nessun elemento attivo nel computo!");
      setTimeout(() => setShortcutToast(null), 2500);
      return;
    }

    let fileContent = `GECOLA BIM - COMPUTO METRICO ESTIMATIVO (FORMATO PROFESSIONALE TIPO PRIMUS)\n`;
    fileContent += `Generato il: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n`;
    fileContent += `=========================================================================================\n\n`;

    activeGroups.forEach((group, idx) => {
      fileContent += `Art. ${idx + 1} - CODICE: ${group.codice}\n`;
      fileContent += `DESCRIZIONE: ${group.descrizione}\n`;
      fileContent += `-----------------------------------------------------------------------------------------\n`;
      fileContent += `  DETTAGLIO MISURAZIONI:\n`;
      
      group.subItems.forEach((sub, subIdx) => {
        if (!sub.includeInComputo) return;
        const multStr = (sub.original as any).moltiplicatore && (sub.original as any).moltiplicatore !== 1 
          ? ` x ${(sub.original as any).moltiplicatore.toFixed(1)} (molt.)` 
          : '';
        fileContent += `    [${subIdx + 1}] ${sub.isBIM ? 'BIM Element' : 'Misura CAD'} - ${sub.label}: ${sub.quantity.toFixed(2)} ${group.unita}${multStr}\n`;
      });
      
      fileContent += `-----------------------------------------------------------------------------------------\n`;
      fileContent += `U.M.: ${group.unita} | QUANTITÀ TOTALE: ${group.totaleQuantita.toFixed(2)} | PREZZO UNITARIO: € ${group.prezzo.toFixed(2)} | IMPORTO PARZIALE: € ${group.totaleImporto.toFixed(2)}\n`;
      fileContent += `=========================================================================================\n\n`;
    });

    fileContent += `-----------------------------------------------------------------------------------------\n`;
    fileContent += `TOTALE GENERALE COMPUTO ESTIMATIVO GECOLA:\t\t\t\t\t€ ${totalComputoAmount.toFixed(2)}\n`;
    fileContent += `-----------------------------------------------------------------------------------------\n`;

    const blob = new Blob([fileContent], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Computo_Metrico_Gecola_${Date.now()}.txt`;
    link.click();
    
    setShortcutToast("Computo Metrico esportato con successo! 📥");
    setTimeout(() => setShortcutToast(null), 2500);
  };

  // Export Computo to JSON format requested by the user
  const handleExportComputoJSON = () => {
    const activeGroups = groupedComputoItems.filter(g => g.totaleQuantita > 0);
    if (activeGroups.length === 0) {
      setShortcutToast("Nessun elemento attivo nel computo!");
      setTimeout(() => setShortcutToast(null), 2500);
      return;
    }

    // Generate categories from unique category names found in the articles
    const uniqueCategories = Array.from(new Set(activeGroups.map(g => {
      // Find one of the subItems to get its original category if possible
      const firstItem = g.subItems[0];
      return (firstItem.original as any).categoria || "Opere Varie";
    })));

    const categories = uniqueCategories.map((cat, idx) => ({
      id: `cat_${(idx + 1).toString().padStart(2, '0')}`,
      code: `WBS.${(idx + 1).toString().padStart(2, '0')}`,
      name: cat,
      isEnabled: true,
      isLocked: false,
      type: "work",
      soaCategory: "OG1" // Default
    }));

    const articles = activeGroups.map((group, idx) => {
      // Find category code for this article
      const itemCat = (group.subItems[0].original as any).categoria || "Opere Varie";
      const catObj = categories.find(c => c.name === itemCat);
      
      const measurements = group.subItems
        .filter(sub => sub.includeInComputo)
        .map(sub => ({
          id: sub.id,
          description: sub.label,
          type: "positive",
          parts: sub.partiUguali || 1,
          length: sub.lunghezza || undefined,
          width: sub.larghezza || undefined,
          height: sub.altezza || undefined
        }));

      return {
        id: `art_${idx}_${Date.now()}`,
        categoryCode: catObj ? catObj.code : "WBS.01",
        code: group.codice,
        priceListSource: prezzarioName,
        description: group.descrizione,
        unit: group.unita,
        unitPrice: group.prezzo,
        laborRate: (group.subItems[0].original as any).incidenzaManodopera || 0,
        soaCategory: (group.subItems[0].original as any).soaCategory || "OG1",
        measurements: measurements,
        quantity: group.totaleQuantita,
        displayMode: 0
      };
    });

    const exportData = {
      gecolaData: {
        projectInfo: {
          title: projectName,
          client: committente,
          designer: progettista,
          location: localita,
          date: computoDate,
          priceList: prezzarioName,
          region: "Lombardia", // Default
          year: new Date().getFullYear().toString(),
          vatRate: 10,
          safetyRate: 3.5,
          fontSizeTitle: 28,
          fontSizeClient: 15,
          fontSizeTotals: 22,
          tariffColumnWidth: 135,
          fontSizeMeasurements: 12,
          fontSizeWbsSidebar: 14,
          showLaborIncidenceInSummary: true,
          descriptionLength: "full"
        },
        categories: categories,
        articles: articles,
        analyses: []
      },
      exportedAt: new Date().toISOString(),
      app: "GeCoLa Cloud"
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Computo_Gecola_${Date.now()}.json`;
    link.click();
    
    setShortcutToast("Computo JSON esportato con successo! 📥");
    setTimeout(() => setShortcutToast(null), 2500);
  };

  // Enable/Disable all measurements/elements
  const handleToggleAll = (enable: boolean) => {
    computableItems.forEach(item => {
      updateEntity(item.id, { includeInComputo: enable });
    });
    setShortcutToast(enable ? "Tutti gli elementi inclusi nel computo!" : "Tutti gli elementi esclusi dal computo!");
    setTimeout(() => setShortcutToast(null), 2000);
  };

  // Window dragging events
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".window-header-drag")) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: isMaximized ? "fixed" : "absolute",
        left: isMaximized ? "max(12px, calc(50% - 550px))" : `${Math.max(10, Math.min(window.innerWidth - 350, position.x))}px`,
        top: isMaximized ? "65px" : `${Math.max(60, Math.min(window.innerHeight - 300, position.y))}px`,
        width: isMaximized ? "min(1100px, calc(100vw - 24px))" : undefined,
        height: isMaximized ? "calc(100vh - 85px)" : undefined,
        zIndex: 1000,
      }}
      className={`${isMaximized ? "w-full max-w-6xl shadow-2xl" : "w-96"} bg-neutral-900 border border-neutral-700 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col transition-all text-neutral-200`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* HEADER DRAGGABLE */}
      <div 
        onMouseDown={isMaximized ? undefined : handleMouseDown}
        className={`window-header-drag h-10 bg-neutral-950 px-3 flex items-center justify-between ${isMaximized ? '' : 'cursor-move'} select-none border-b border-neutral-800`}
      >
        <div className="flex items-center gap-2">
          <Clipboard size={14} className="text-amber-400" />
          <span className="text-[11px] font-black tracking-wider uppercase font-sans">
            Prezzario & Computo Gecola
          </span>
          {computableItems.length > 0 && (
            <span className="bg-neutral-800 text-amber-400 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded-full">
              {computableItems.length} elementi
            </span>
          )}
          {isWorkspaceMode && (
            <span className="bg-emerald-950 text-emerald-400 border border-emerald-700/60 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded">
              Ambiente Computo
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-1.5">
          <button 
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors"
            title={isMaximized ? "Riduci a pannello fluttuante" : "Ingrandisci a schermo intero"}
          >
            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button 
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors"
            title={isMinimized ? "Espandi" : "Comprimi"}
          >
            {isMinimized ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-red-950/50 rounded text-neutral-400 hover:text-red-400 transition-colors"
            title="Chiudi"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className={`flex flex-col ${isMaximized ? "flex-1 overflow-hidden" : "h-[380px]"} text-xs`}>
          {/* TABS SELECTOR */}
          <div className="flex bg-neutral-950 border-b border-neutral-800 p-1">
            <button
              onClick={() => setActiveTab("prezzario")}
              className={`flex-1 py-1.5 text-[10.5px] font-black rounded-lg uppercase tracking-wide transition-all ${
                activeTab === "prezzario" 
                  ? "bg-amber-500 text-neutral-950 shadow-md font-bold" 
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              📖 Prezzario Regionale
            </button>
            <button
              onClick={() => setActiveTab("computo")}
              onDragOver={(e) => {
                e.preventDefault();
                setActiveTab("computo");
              }}
              className={`flex-1 py-1.5 text-[10.5px] font-black rounded-lg uppercase tracking-wide transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "computo" 
                  ? "bg-amber-500 text-neutral-950 shadow-md font-bold" 
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              📊 Computo Metrico
              {activeComputoItems.length > 0 && (
                <span className="bg-neutral-850 text-neutral-950 text-[9px] font-black px-1.5 py-0.2 rounded-full font-sans">
                  €{totalComputoAmount.toFixed(0)}
                </span>
              )}
            </button>
          </div>

          {/* TAB 1: PREZZARIO REGIONALE (CATALOG) */}
          {activeTab === "prezzario" && (
            <div className="flex-1 flex flex-col overflow-hidden p-2.5 space-y-2">
              <div className="flex gap-1.5 items-center bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1.5">
                <Search size={12} className="text-neutral-400" />
                <input
                  type="text"
                  placeholder="Cerca codice o descrizione..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent text-xs w-full outline-none border-none text-neutral-200 placeholder-neutral-500"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="text-neutral-500 hover:text-neutral-300">
                    <X size={12} />
                  </button>
                )}
                {onOpenImporter && (
                  <button 
                    onClick={onOpenImporter}
                    className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-md transition-colors border border-indigo-500/20"
                    title="Importa Prezzario Esterno"
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>

              {/* CATEGORY TABS */}
              <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin select-none">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2 py-1 rounded text-[9.5px] font-bold whitespace-nowrap transition-colors ${
                      selectedCategory === cat 
                        ? "bg-neutral-700 text-amber-400 border border-amber-400/30" 
                        : "bg-neutral-950 text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="text-[9.5px] bg-neutral-950 text-neutral-400 p-1.5 rounded-lg border border-neutral-850 flex items-center gap-1.5 font-sans">
                <AlertCircle size={12} className="text-amber-400 shrink-0" />
                <span>Trascina le voci di computo e rilasciale sulle misure o elementi BIM</span>
              </div>

              {/* LIST ITEMS */}
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1.5 scrollbar-thin">
                {filteredPrezzario.length === 0 ? (
                  <div className="text-center py-10 text-neutral-500">
                    Nessuna voce trovata.
                  </div>
                ) : (
                  filteredPrezzario.map((item, idx) => (
                    <div
                      key={`${item.codice}-${idx}`}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, item)}
                      className="bg-neutral-950 hover:bg-neutral-850 border border-neutral-800 hover:border-amber-500/40 p-2 rounded-xl transition-all cursor-grab active:cursor-grabbing group relative"
                    >
                      <div className="flex justify-between items-center gap-2">
                        <span className="font-mono font-black text-amber-400 text-[10px] bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 rounded">
                          {item.codice}
                        </span>
                        <span className="font-mono font-black text-white text-[10.5px]">
                          € {item.prezzo.toFixed(2)} / {item.unita}
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-400 mt-1 line-clamp-2 leading-relaxed group-hover:text-neutral-200 font-sans">
                        {item.descrizione}
                      </p>
                      
                      {/* Drag handles indicator on hover */}
                      <div className="absolute right-1 bottom-1 opacity-0 group-hover:opacity-100 text-[8px] bg-amber-500 text-neutral-950 font-extrabold px-1.5 rounded font-sans">
                        TRASCINA ⎘
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 2: COMPUTO METRICO (ACTIVE MEASUREMENTS) */}
          {activeTab === "computo" && (
            <div className="flex-1 flex flex-col overflow-hidden p-2.5">
              {/* ACCORDION/TOOLBAR */}
              <div className="flex justify-between items-center mb-2 bg-neutral-950 p-1.5 rounded-lg border border-neutral-850">
                <span className="text-[9.5px] font-black uppercase text-neutral-400 tracking-wide">
                  Azioni Rapide
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggleAll(true)}
                    className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded text-[9px]"
                  >
                    Tutte
                  </button>
                  <button
                    onClick={() => handleToggleAll(false)}
                    className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold rounded text-[9px]"
                  >
                    Nessuna
                  </button>
                </div>
              </div>

              {/* Drop zone to add manual items directly from the Price list */}
              <div 
                onDragOver={handleDragOver}
                onDragEnter={() => setIsDraggingOverComputo(true)}
                onDragLeave={() => setIsDraggingOverComputo(false)}
                onDrop={handleDropNewManualItem}
                className={`border border-dashed rounded-xl p-2.5 mb-2 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                  isDraggingOverComputo 
                    ? "border-amber-500 bg-amber-500/15 text-amber-400" 
                    : "border-neutral-800 bg-neutral-950/40 text-neutral-400 hover:border-neutral-700 hover:text-neutral-300"
                }`}
              >
                <Plus size={14} className={`mb-0.5 ${isDraggingOverComputo ? "animate-bounce text-amber-400" : "text-neutral-500"}`} />
                <span className="text-[9px] font-black uppercase tracking-wider">
                  Trascina e rilascia qui una voce
                </span>
                <span className="text-[8px] text-neutral-500 font-sans mt-0.5">
                  per aggiungerla direttamente come voce manuale nel computo
                </span>
              </div>

              {/* LIST OF DRAWN MEASUREMENTS GROUPED BY PRICE CODE */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1.5 scrollbar-thin">
                {computableItems.length === 0 ? (
                  <div className="text-center py-12 text-neutral-500 flex flex-col items-center justify-center gap-1.5 font-sans">
                    <AlertCircle size={20} className="text-neutral-600" />
                    <span>Nessun elemento computabile tracciato.</span>
                    <span className="text-[9.5px]">Traccia quote o crea elementi BIM (es. pilastri, muri).</span>
                    <span className="text-[8px] text-neutral-500">Oppure trascina una voce dal prezzario in alto per aggiungerla qui!</span>
                  </div>
                ) : (
                  groupedComputoItems.map((group, idx) => {
                    const allChecked = group.subItems.every(s => s.includeInComputo);
                    const someChecked = group.subItems.some(s => s.includeInComputo);
                    const isGroupSelected = group.subItems.some(s => s.id === selectedId);

                    return (
                      <div
                        key={`${group.codice}-${idx}`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDropOnGroup(e, group)}
                        className={`p-2.5 rounded-xl border transition-all ${
                          isGroupSelected
                            ? "bg-amber-950/10 border-amber-500/50 shadow-md"
                            : "bg-neutral-950 border-neutral-850 hover:border-neutral-800"
                        }`}
                      >
                        {/* Group Header (The Price Item) */}
                        <div className="flex items-start gap-2 pb-2 border-b border-neutral-900">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            ref={el => {
                              if (el) {
                                el.indeterminate = someChecked && !allChecked;
                              }
                            }}
                            onChange={(e) => {
                              handleToggleGroup(group, e.target.checked);
                            }}
                            className="mt-1 accent-amber-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                          />
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-black text-amber-400 text-[10px] bg-neutral-900 px-1.5 py-0.2 rounded border border-neutral-800">
                                {group.codice}
                              </span>
                              <span className="font-mono text-[9.5px] font-black text-white">
                                € {group.prezzo.toFixed(2)} / {group.unita}
                              </span>
                            </div>
                            <div className="text-[9.5px] text-neutral-300 font-sans mt-0.5 line-clamp-2 leading-tight">
                              {group.descrizione}
                            </div>
                          </div>
                        </div>

                        {/* Sub-items (Dettaglio Misurazioni Primus) */}
                        <div className="pl-3.5 border-l-2 border-neutral-850 mt-1.5 space-y-1">
                          {group.subItems.map((sub) => {
                            const isSelected = selectedId === sub.id;

                            return (
                              <div key={sub.id} className="flex flex-col">
                                <div
                                  onDragOver={handleDragOver}
                                  onDrop={(e) => {
                                    e.stopPropagation();
                                    handleDropOnRow(e, sub.id);
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedId(sub.id);
                                  }}
                                  className={`flex items-center justify-between p-1 px-1.5 rounded-lg transition-all cursor-pointer text-[9.5px] ${
                                    isSelected 
                                      ? "bg-amber-500/15 text-white font-bold" 
                                      : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={sub.includeInComputo}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        updateEntity(sub.id, { includeInComputo: e.target.checked });
                                      }}
                                      className="accent-amber-500 w-3 h-3 cursor-pointer shrink-0"
                                    />
                                    <span className="shrink-0">
                                      {sub.original?.isManualComputo ? "✏️" : (sub.isBIM ? "🧱" : "📏")}
                                    </span>
                                    <span className="truncate">{sub.label}</span>
                                    {(sub.original as any).moltiplicatore && (sub.original as any).moltiplicatore !== 1 && (
                                      <span className="text-[8px] bg-neutral-900 px-1 rounded text-neutral-500 shrink-0">
                                        {(sub.original as any).moltiplicatore.toFixed(1)}x
                                      </span>
                                    )}
                                  </div>
                                  <div className="font-mono text-right shrink-0 pl-1">
                                    {sub.quantity.toFixed(2)} {group.unita}
                                  </div>
                                </div>

                                {isSelected && (
                                  <div 
                                    onClick={(e) => e.stopPropagation()} 
                                    className="mt-1 mb-2 ml-4 p-2 bg-neutral-900/95 rounded-lg border border-neutral-800 space-y-2 text-[9.5px]"
                                  >
                                    <div className="flex flex-col gap-1">
                                      <label className="text-neutral-500 font-bold uppercase tracking-wider text-[8px]">Descrizione della misurazione:</label>
                                      <input
                                        type="text"
                                        value={sub.original?.isManualComputo ? (sub.original.bimName || "") : sub.label}
                                        disabled={!sub.original?.isManualComputo}
                                        onChange={(e) => {
                                          updateEntity(sub.id, { bimName: e.target.value, name: e.target.value });
                                        }}
                                        placeholder="E.g. Massetto camera"
                                        className="bg-neutral-950 border border-neutral-800 rounded px-1.5 py-1 text-white outline-none focus:border-amber-500 w-full"
                                      />
                                      {!sub.original?.isManualComputo && (
                                        <span className="text-[8px] text-neutral-500 italic">La descrizione degli elementi grafici è derivata dal disegno</span>
                                      )}
                                    </div>

                                    <div className="grid grid-cols-4 gap-1.5">
                                      <div className="flex flex-col gap-1">
                                        <label className="text-neutral-500 font-bold uppercase tracking-wider text-[8px]" title="Parti Uguali">Par. ug.</label>
                                        <input
                                          type="number"
                                          step="any"
                                          value={(sub.original as any).moltiplicatore ?? 1}
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value) || 1;
                                            updateEntity(sub.id, { moltiplicatore: val });
                                          }}
                                          className="bg-neutral-950 border border-neutral-800 rounded px-1 py-0.5 text-white outline-none text-center"
                                        />
                                      </div>
                                      
                                      <div className="flex flex-col gap-1">
                                        <label className="text-neutral-500 font-bold uppercase tracking-wider text-[8px]">Lung.</label>
                                        <input
                                          type="number"
                                          step="any"
                                          disabled={!sub.original?.isManualComputo || (group.unita !== "mc" && group.unita !== "mq" && group.unita !== "m")}
                                          value={sub.lunghezza !== null ? sub.lunghezza : ""}
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value) || 0;
                                            updateEntity(sub.id, { lunghezza: val } as any);
                                          }}
                                          className="bg-neutral-950 border border-neutral-800 rounded px-1 py-0.5 text-white outline-none text-center disabled:opacity-30 disabled:cursor-not-allowed"
                                        />
                                      </div>

                                      <div className="flex flex-col gap-1">
                                        <label className="text-neutral-500 font-bold uppercase tracking-wider text-[8px]">Larg.</label>
                                        <input
                                          type="number"
                                          step="any"
                                          disabled={!sub.original?.isManualComputo || group.unita !== "mc"}
                                          value={sub.larghezza !== null ? sub.larghezza : ""}
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value) || 0;
                                            updateEntity(sub.id, { larghezza: val } as any);
                                          }}
                                          className="bg-neutral-950 border border-neutral-800 rounded px-1 py-0.5 text-white outline-none text-center disabled:opacity-30 disabled:cursor-not-allowed"
                                        />
                                      </div>

                                      <div className="flex flex-col gap-1">
                                        <label className="text-neutral-500 font-bold uppercase tracking-wider text-[8px]">Alt.</label>
                                        <input
                                          type="number"
                                          step="any"
                                          disabled={!sub.original?.isManualComputo || (group.unita !== "mc" && group.unita !== "mq")}
                                          value={sub.altezza !== null ? sub.altezza : ""}
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value) || 0;
                                            updateEntity(sub.id, { altezza: val } as any);
                                          }}
                                          className="bg-neutral-950 border border-neutral-800 rounded px-1 py-0.5 text-white outline-none text-center disabled:opacity-30 disabled:cursor-not-allowed"
                                        />
                                      </div>
                                    </div>

                                    {sub.original?.isManualComputo && (
                                      <div className="flex justify-between items-center pt-1 border-t border-neutral-850">
                                        <div className="flex items-center gap-1 text-[8.5px]">
                                          <span className="text-neutral-500 font-bold uppercase">Prezzo Overr:</span>
                                          <input
                                            type="number"
                                            step="any"
                                            value={(sub.original as any).prezzarioPrezzo ?? ""}
                                            onChange={(e) => {
                                              const val = parseFloat(e.target.value) || 0;
                                              updateEntity(sub.id, { 
                                                prezzarioPrezzo: val,
                                                cost_5d: {
                                                  ...((sub.original as any).cost_5d || {}),
                                                  prezzarioPrezzo: val
                                                }
                                              } as any);
                                            }}
                                            placeholder={group.prezzo.toFixed(2)}
                                            className="w-16 bg-neutral-950 border border-neutral-800 rounded px-1 py-0.5 text-white outline-none text-right font-mono"
                                          />
                                        </div>
                                        <button
                                          onClick={() => {
                                            if (updateEntitiesWithHistory) {
                                              updateEntitiesWithHistory((prev: Entity[]) => prev.filter(ent => ent.id !== sub.id));
                                            } else {
                                              updateEntity(sub.id, { includeInComputo: false });
                                            }
                                            setSelectedId(null);
                                            setShortcutToast("Voce manuale rimossa dal computo!");
                                            setTimeout(() => setShortcutToast(null), 2000);
                                          }}
                                          className="flex items-center gap-1 px-1.5 py-0.5 bg-red-950/40 hover:bg-red-900/40 text-red-400 rounded border border-red-500/20 text-[8.5px]"
                                        >
                                          <Trash2 size={9} />
                                          Elimina
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Group Summary Footer */}
                        {group.totaleQuantita > 0 && (
                          <div className="mt-2 pt-1.5 border-t border-dashed border-neutral-900 flex justify-between items-center text-[9px] font-mono text-neutral-400">
                            <span>Qt. Tot: {group.totaleQuantita.toFixed(2)} {group.unita}</span>
                            <span className="font-bold text-amber-400">Parziale: € {group.totaleImporto.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* COMPUTO FOOTER */}
              <div className="mt-2.5 pt-2.5 border-t border-neutral-800 flex items-center justify-between gap-1">
                <div>
                  <span className="block text-[8px] text-neutral-400 uppercase tracking-widest font-bold">Totale Computo</span>
                  <span className="font-mono font-black text-amber-400 text-xs">
                    € {totalComputoAmount.toFixed(2)}
                  </span>
                </div>
                
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={handleExportComputo}
                    className="flex items-center gap-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold px-2 py-1.5 rounded-lg border border-neutral-700 transition-all text-[9px] font-sans"
                    title="Esporta file TXT"
                  >
                    <Download size={10} />
                    TXT
                  </button>
                  <button
                    onClick={handleExportComputoJSON}
                    className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-2 py-1.5 rounded-lg border border-indigo-400/30 transition-all shadow-lg shadow-indigo-500/10 text-[9px] font-sans"
                    title="Salva Computo per Software Professionale (JSON)"
                  >
                    <FileJson size={10} />
                    JSON
                  </button>
                  <button
                    onClick={() => setShowPrimusModal(true)}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 text-neutral-950 font-black px-2.5 py-1.5 rounded-lg hover:from-amber-400 hover:to-amber-500 shadow-lg shadow-amber-500/10 transition-all active:scale-95 text-[9.5px] font-sans border border-amber-400/20"
                  >
                    <FileSpreadsheet size={11} className="animate-pulse" />
                    Anteprima Primus ✨
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DYNAMIC PROFESSIONAL PRIMUS REPORT OVERLAY */}
      {showPrimusModal && (
        <div className="fixed inset-0 bg-neutral-950/90 backdrop-blur-md z-[2000] flex flex-col md:flex-row h-full w-full overflow-hidden text-neutral-800 no-print">
          {/* CONFIGURATION SIDEBAR (HIDDEN IN PRINT) */}
          <div className="no-print w-full md:w-80 bg-neutral-900 border-b md:border-b-0 md:border-r border-neutral-800 p-5 flex flex-col gap-4 overflow-y-auto shrink-0 text-neutral-300">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-xs font-black tracking-wider uppercase text-amber-400 flex items-center gap-2">
                <FileSpreadsheet size={15} />
                Configura Computo
              </h3>
              <button
                onClick={() => setShowPrimusModal(false)}
                className="p-1 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[9px] uppercase tracking-wider text-neutral-400 font-bold mb-1">Nome Progetto / Opera</label>
                <textarea
                  rows={2}
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 outline-none focus:border-amber-500 text-xs resize-none"
                />
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider text-neutral-400 font-bold mb-1">Committente</label>
                <input
                  type="text"
                  value={committente}
                  onChange={(e) => setCommittente(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 outline-none focus:border-amber-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider text-neutral-400 font-bold mb-1">Il Progettista</label>
                <input
                  type="text"
                  value={progettista}
                  onChange={(e) => setProgettista(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 outline-none focus:border-amber-500 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-neutral-400 font-bold mb-1">Località</label>
                  <input
                    type="text"
                    value={localita}
                    onChange={(e) => setLocalita(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 outline-none focus:border-amber-500 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-neutral-400 font-bold mb-1">Data</label>
                  <input
                    type="text"
                    value={computoDate}
                    onChange={(e) => setComputoDate(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 outline-none focus:border-amber-500 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider text-neutral-400 font-bold mb-1">Prezzario di Riferimento</label>
                <input
                  type="text"
                  value={prezzarioName}
                  onChange={(e) => setPrezzarioName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 outline-none focus:border-amber-500 text-xs"
                />
              </div>

              <div className="bg-neutral-950 border border-neutral-850 p-3 rounded-lg text-[10px] text-neutral-400 leading-relaxed font-sans space-y-1">
                <span className="font-bold text-amber-400 block">🖨️ Suggerimento Stampa:</span>
                <p>Usa la stampante di sistema per salvare in <b>PDF</b> o stampare direttamente.</p>
                <p className="text-[9px] text-neutral-500">Nelle impostazioni di stampa abilita "Grafica di sfondo" per conservare gli sfondi delle celle.</p>
              </div>
            </div>

            <div className="mt-auto pt-4 border-t border-neutral-800 flex flex-col gap-2 no-print">
              <button
                onClick={() => window.print()}
                className="w-full bg-amber-500 text-neutral-950 font-black py-2.5 rounded-xl hover:bg-amber-400 shadow-lg transition-all active:scale-95 text-xs flex items-center justify-center gap-2"
              >
                <span>Stampa / Esporta PDF 🖨️</span>
              </button>
              <button
                onClick={() => setShowPrimusModal(false)}
                className="w-full bg-neutral-800 text-neutral-200 py-2.5 rounded-xl hover:bg-neutral-700 transition-all text-xs"
              >
                Chiudi Anteprima
              </button>
            </div>
          </div>

          {/* DYNAMIC PRINTABLE SHEET CANVAS */}
          <div className="flex-1 bg-neutral-900 p-4 md:p-8 overflow-y-auto flex flex-col items-center scrollbar-thin">
            <div 
              id="primus-print-area" 
              className="w-full max-w-[800px] bg-white text-black p-[50px] shadow-[0_15px_40px_rgba(0,0,0,0.5)] rounded-sm flex flex-col font-serif relative border border-neutral-400"
              style={{ color: '#000000', fontFamily: '"Times New Roman", Times, serif' }}
            >
              {/* Dynamic print stylesheet overrides */}
              <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                  body {
                    background: white !important;
                    color: black !important;
                  }
                  .no-print {
                    display: none !important;
                  }
                  #primus-print-area {
                    box-shadow: none !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    border: none !important;
                  }
                  .page-break {
                    page-break-before: always !important;
                    margin-top: 50px !important;
                  }
                }
                @page {
                  size: A4;
                  margin: 20mm 15mm 20mm 15mm;
                  @bottom-right {
                    content: "Pag. " counter(page);
                    font-family: sans-serif;
                    font-size: 8pt;
                    color: #555555;
                  }
                  @bottom-left {
                    content: "Gecola Computo Metrico";
                    font-family: sans-serif;
                    font-size: 8pt;
                    color: #555555;
                  }
                }
              `}} />

              {/* SHEET 1: COMPUTO METRICO ESTIMATIVO */}
              <div className="flex flex-col flex-1">
                {/* Center Title */}
                <div className="text-center mb-6">
                  <h1 className="text-lg font-bold tracking-widest uppercase text-black font-sans">
                    COMPUTO METRICO ESTIMATIVO
                  </h1>
                </div>

                {/* Metadata block identical to Primus */}
                <div className="border border-black p-3.5 text-xs mb-6 font-sans grid grid-cols-2 gap-x-6 gap-y-2 bg-neutral-50/50 leading-snug">
                  <div>
                    <span className="font-bold uppercase text-[9px] text-neutral-500 block">Progetto / Opera</span>
                    <span className="font-bold text-neutral-900 text-xs">{projectName}</span>
                  </div>
                  <div>
                    <span className="font-bold uppercase text-[9px] text-neutral-500 block">Committente</span>
                    <span className="font-bold text-neutral-900 text-xs">{committente}</span>
                  </div>
                  <div className="border-t border-neutral-200 pt-1.5 mt-1">
                    <span className="font-bold uppercase text-[9px] text-neutral-500 block">Data Documento</span>
                    <span className="text-neutral-800 text-[11px]">{computoDate}</span>
                  </div>
                  <div className="border-t border-neutral-200 pt-1.5 mt-1">
                    <span className="font-bold uppercase text-[9px] text-neutral-500 block">Prezzario di Riferimento</span>
                    <span className="text-neutral-800 text-[11px]">{prezzarioName}</span>
                  </div>
                </div>

                {/* PRIMUS GRID */}
                <div className="border-t border-l border-r border-black flex-1 flex flex-col overflow-hidden">
                  {/* Table Header Row */}
                  <div className="flex border-b border-black text-[9px] font-black uppercase tracking-wide text-neutral-700 bg-neutral-100 font-sans text-center h-10 items-center shrink-0">
                    <div className="w-[8%] border-r border-black px-1 h-full flex items-center justify-center shrink-0">Num.<br/>Ord</div>
                    <div className="w-[12%] border-r border-black px-1 h-full flex items-center justify-center shrink-0">TARIFFA</div>
                    <div className="w-[36%] border-r border-black px-2 h-full flex items-center justify-start text-left shrink-0">DESIGNAZIONE DEI LAVORI</div>
                    <div className="w-[6%] border-r border-black px-1 h-full flex items-center justify-center shrink-0">par.ug.</div>
                    <div className="w-[7%] border-r border-black px-1 h-full flex items-center justify-center shrink-0">lung.</div>
                    <div className="w-[7%] border-r border-black px-1 h-full flex items-center justify-center shrink-0">larg.</div>
                    <div className="w-[7%] border-r border-black px-1 h-full flex items-center justify-center shrink-0">H/peso</div>
                    <div className="w-[9%] border-r border-black px-1 h-full flex items-center justify-center shrink-0">Quantità</div>
                    <div className="w-[8%] border-r border-black px-1 h-full flex items-center justify-center shrink-0">unitario</div>
                    <div className="w-[10%] px-1 h-full flex items-center justify-center shrink-0">TOTALE</div>
                  </div>

                  {/* Table Body Elements */}
                  {groupedComputoItems.length === 0 ? (
                    <div className="p-8 text-center text-xs text-neutral-500 font-sans border-b border-black">
                      Nessuna voce attiva nel computo. Assicurati che le misure nel pannello abbiano la spunta abilitata.
                    </div>
                  ) : (
                    groupedComputoItems.map((group, groupIdx) => {
                      const orderNum = groupIdx + 1;
                      const activeSubs = group.subItems.filter(s => s.includeInComputo);
                      
                      if (activeSubs.length === 0) return null;

                      return (
                        <React.Fragment key={`${group.codice}-${groupIdx}`}>
                          {/* Row 1: The general tariff and description */}
                          <div className="flex border-b border-black text-xs font-serif leading-tight">
                            {/* Num Ord */}
                            <div className="w-[8%] border-r border-black p-2 text-center font-bold flex flex-col justify-start bg-neutral-50/20 shrink-0">
                              <span>{orderNum}</span>
                              <span className="text-[9px] text-neutral-500 font-normal">({orderNum}.1)</span>
                            </div>
                            
                            {/* Tariffa */}
                            <div className="w-[12%] border-r border-black p-2 text-center font-mono font-bold text-[10px] break-all leading-normal bg-neutral-50/20 shrink-0">
                              {group.codice}
                            </div>

                             {/* Designazione Dei Lavori */}
                            <div className="w-[36%] border-r border-black p-2 text-[11px] leading-relaxed text-neutral-900 font-sans font-bold shrink-0">
                              {group.descrizione}
                            </div>

                            {/* Blank columns to maintain the grid grid lines */}
                            <div className="w-[6%] border-r border-black bg-neutral-50/5 shrink-0"></div>
                            <div className="w-[7%] border-r border-black bg-neutral-50/5 shrink-0"></div>
                            <div className="w-[7%] border-r border-black bg-neutral-50/5 shrink-0"></div>
                            <div className="w-[7%] border-r border-black bg-neutral-50/5 shrink-0"></div>
                            <div className="w-[9%] border-r border-black bg-neutral-50/5 shrink-0"></div>
                            <div className="w-[8%] border-r border-black bg-neutral-50/5 shrink-0"></div>
                            <div className="w-[10%] bg-neutral-50/5 shrink-0"></div>
                          </div>

                          {/* Row 2: ELENCO DELLE MISURE Label */}
                          <div className="flex border-b border-black text-xs leading-tight">
                            <div className="w-[8%] border-r border-black shrink-0"></div>
                            <div className="w-[12%] border-r border-black shrink-0"></div>
                            <div className="w-[36%] border-r border-black p-1.5 px-2 bg-neutral-50/10 shrink-0">
                              <span className="text-[9px] font-sans font-black text-neutral-600 tracking-widest uppercase">
                                ELENCO DELLE MISURE
                              </span>
                            </div>
                            <div className="w-[6%] border-r border-black shrink-0"></div>
                            <div className="w-[7%] border-r border-black shrink-0"></div>
                            <div className="w-[7%] border-r border-black shrink-0"></div>
                            <div className="w-[7%] border-r border-black shrink-0"></div>
                            <div className="w-[9%] border-r border-black shrink-0"></div>
                            <div className="w-[8%] border-r border-black shrink-0"></div>
                            <div className="w-[10%] shrink-0"></div>
                          </div>

                          {/* Row 3+: The measurements */}
                          {activeSubs.map((sub) => {
                            return (
                              <div key={sub.id} className="flex border-b border-black text-xs font-serif leading-tight items-center min-h-[30px]">
                                <div className="w-[8%] border-r border-black self-stretch shrink-0"></div>
                                <div className="w-[12%] border-r border-black self-stretch shrink-0"></div>
                                
                                {/* Designazione: measurement label */}
                                <div className="w-[36%] border-r border-black p-2 text-[10.5px] italic text-neutral-800 leading-normal pl-4 border-l-2 border-neutral-300 shrink-0">
                                  {sub.label}
                                </div>

                                {/* par.ug. */}
                                <div className="w-[6%] border-r border-black text-center self-stretch flex items-center justify-center font-mono text-[10px] shrink-0">
                                  {sub.partiUguali.toFixed(2).replace('.', ',')}
                                </div>

                                {/* lung. */}
                                <div className="w-[7%] border-r border-black text-right pr-1.5 self-stretch flex items-center justify-end font-mono text-[10px] shrink-0">
                                  {sub.lunghezza !== null ? sub.lunghezza.toFixed(2).replace('.', ',') : "-"}
                                </div>

                                {/* larg. */}
                                <div className="w-[7%] border-r border-black text-right pr-1.5 self-stretch flex items-center justify-end font-mono text-[10px] shrink-0">
                                  {sub.larghezza !== null ? sub.larghezza.toFixed(2).replace('.', ',') : "-"}
                                </div>

                                {/* H/peso */}
                                <div className="w-[7%] border-r border-black text-right pr-1.5 self-stretch flex items-center justify-end font-mono text-[10px] shrink-0">
                                  {sub.altezza !== null ? sub.altezza.toFixed(2).replace('.', ',') : "-"}
                                </div>

                                {/* Quantità */}
                                <div className="w-[9%] border-r border-black text-right pr-1.5 self-stretch flex items-center justify-end font-mono text-[10px] font-bold text-neutral-900 shrink-0">
                                  {sub.quantity.toFixed(2).replace('.', ',')}
                                </div>

                                {/* Unitario and total columns are empty on individual measurement lines in Primus */}
                                <div className="w-[8%] border-r border-black self-stretch shrink-0"></div>
                                <div className="w-[10%] self-stretch shrink-0"></div>
                              </div>
                            );
                          })}

                          {/* Row SOMMANO */}
                          <div className="flex border-b border-black text-xs h-9 items-center font-sans font-bold bg-neutral-50/30">
                            <div className="w-[8%] border-r border-black h-full shrink-0"></div>
                            <div className="w-[12%] border-r border-black h-full shrink-0"></div>
                            
                            {/* Designazione Label */}
                            <div className="w-[36%] border-r border-black px-3 text-right text-[10px] uppercase font-black tracking-wider text-neutral-800 h-full flex items-center justify-end font-sans shrink-0">
                              SOMMANO {group.unita}
                            </div>

                            {/* Empty dimension spacers */}
                            <div className="w-[6%] border-r border-black h-full bg-neutral-50/10 shrink-0"></div>
                            <div className="w-[7%] border-r border-black h-full bg-neutral-50/10 shrink-0"></div>
                            <div className="w-[7%] border-r border-black h-full bg-neutral-50/10 shrink-0"></div>
                            <div className="w-[7%] border-r border-black h-full bg-neutral-50/10 shrink-0"></div>

                            {/* Sum of quantities */}
                            <div className="w-[9%] border-r border-black text-right font-mono font-bold pr-1.5 text-[11px] h-full flex items-center justify-end border-b-2 border-double border-neutral-950 bg-neutral-50/20 shrink-0">
                              {group.totaleQuantita.toFixed(2).replace('.', ',')}
                            </div>

                            {/* Unit Price */}
                            <div className="w-[8%] border-r border-black text-right font-mono pr-1.5 text-[11px] h-full flex items-center justify-end bg-neutral-50/10 shrink-0">
                              {group.prezzo.toFixed(2).replace('.', ',')}
                            </div>

                            {/* Total Amount */}
                            <div className="w-[10%] text-right font-mono text-[11px] font-black text-blue-900 pr-1.5 h-full flex items-center justify-end bg-blue-50/20 shrink-0">
                              € {group.totaleImporto.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })
                  )}

                  {/* TOTALE COMPUTO FINAL FOOTER */}
                  {groupedComputoItems.length > 0 && (
                    <div className="flex border-b border-black h-12 bg-neutral-100 font-sans font-black uppercase text-xs items-center">
                      <div className="w-[56%] text-right pr-6 tracking-wide text-xs font-black text-neutral-800 shrink-0">
                        TOTALE COMPUTO METRICO ESTIMATIVO
                      </div>
                      {/* Empty columns */}
                      <div className="w-[6%] border-l border-r border-black h-full shrink-0"></div>
                      <div className="w-[7%] border-r border-black h-full shrink-0"></div>
                      <div className="w-[7%] border-r border-black h-full shrink-0"></div>
                      <div className="w-[7%] border-r border-black h-full shrink-0"></div>
                      <div className="w-[9%] border-r border-black h-full shrink-0"></div>
                      <div className="w-[8%] border-r border-black h-full shrink-0"></div>
                      
                      {/* Total amount formatted nicely */}
                      <div className="w-[10%] text-right pr-1.5 font-mono text-sm text-blue-900 h-full flex items-center justify-end bg-blue-50 shrink-0">
                        € {totalComputoAmount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Amount in letters */}
                {totalComputoAmount > 0 && (
                  <div className="mt-4 text-right text-[11px] italic font-sans text-neutral-700 font-bold pr-1 tracking-wide">
                    {numeroInLettere(totalComputoAmount)}
                  </div>
                )}

                {/* Page footer at bottom of Page 1 */}
                <div className="mt-auto pt-8 border-t border-neutral-300 flex justify-between text-[10px] text-neutral-400 font-sans">
                  <span>Gecola Computo Metrico</span>
                  <span>Pag. 1</span>
                </div>
              </div>

              {/* SHEET 2: RIEPILOGO GENERALE (Page break) */}
              {groupedComputoItems.length > 0 && (
                <div className="flex flex-col mt-[80px] pt-[40px] border-t-2 border-dashed border-neutral-300 page-break flex-1">
                  <div className="text-center mb-6">
                    <h2 className="text-base font-bold uppercase tracking-widest text-black font-sans">
                      RIEPILOGO GENERALE LAVORI
                    </h2>
                  </div>

                  {/* Summary Table */}
                  <table className="w-full border-collapse border border-black font-sans text-xs">
                    <thead>
                      <tr className="bg-neutral-100 uppercase text-[9px] font-black text-neutral-700 h-9">
                        <th className="border border-black px-2 text-center w-[12%]">CODICE TARIFFA</th>
                        <th className="border border-black px-3 text-left w-[33%]">DESCRIZIONE VOCE / CAPITOLO</th>
                        <th className="border border-black px-2 text-center w-[7%]">U.M.</th>
                        <th className="border border-black px-2 text-right w-[11%]">QUANTITÀ</th>
                        <th className="border border-black px-2 text-right w-[11%]">UNITARIO</th>
                        <th className="border border-black px-3 text-right w-[13%]">IMPORTO LAVORI</th>
                        <th className="border border-black px-3 text-right w-[13%]">INCIDENZA M.O. (28%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedComputoItems.map((group, idx) => {
                        const activeSubs = group.subItems.filter(s => s.includeInComputo);
                        if (activeSubs.length === 0) return null;
                        
                        const laborCost = group.totaleImporto * 0.28; // Standard Italian labor incidence
                        return (
                          <tr key={`${group.codice}-${idx}`} className="h-10 text-[11px]">
                            <td className="border border-black px-2 text-center font-mono font-bold text-neutral-800 bg-neutral-50/30">{group.codice}</td>
                            <td className="border border-black px-3 text-left font-serif leading-relaxed text-neutral-800 py-2">
                              {group.descrizione.length > 120 ? `${group.descrizione.substring(0, 120)}...` : group.descrizione}
                            </td>
                            <td className="border border-black px-2 text-center font-bold text-neutral-800 uppercase bg-neutral-50/10">{group.unita}</td>
                            <td className="border border-black px-2 text-right font-mono font-bold text-neutral-900">{group.totaleQuantita.toFixed(2).replace('.', ',')}</td>
                            <td className="border border-black px-2 text-right font-mono text-neutral-800">€ {group.prezzo.toFixed(2).replace('.', ',')}</td>
                            <td className="border border-black px-3 text-right font-mono font-bold">€ {group.totaleImporto.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="border border-black px-3 text-right font-mono text-neutral-500">€ {laborCost.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                        );
                      })}
                      <tr className="h-10 bg-neutral-100 font-sans font-black">
                        <td className="border border-black px-2 text-center"></td>
                        <td className="border border-black px-3 text-right uppercase tracking-wider text-[9.5px]">TOTALE GENERALE</td>
                        <td className="border border-black px-2 text-center"></td>
                        <td className="border border-black px-2 text-right font-mono"></td>
                        <td className="border border-black px-2 text-right font-mono"></td>
                        <td className="border border-black px-3 text-right font-mono text-sm text-blue-900 bg-blue-50/20">
                          € {totalComputoAmount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="border border-black px-3 text-right font-mono text-neutral-700">
                          € {(totalComputoAmount * 0.28).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Signatures section */}
                  <div className="mt-[80px] grid grid-cols-2 gap-12 font-sans text-xs">
                    <div className="flex flex-col justify-end">
                      <span className="text-[9px] font-bold text-neutral-500 block uppercase tracking-wider mb-1">Località e Data</span>
                      <span className="font-bold border-b border-black pb-1.5 w-48 text-neutral-800 text-xs">{localita}, {computoDate}</span>
                    </div>
                    <div className="flex flex-col items-end text-right">
                      <span className="text-neutral-500 uppercase tracking-widest text-[9px] font-black block mb-10">IL PROGETTISTA</span>
                      <span className="font-bold border-b border-black pb-1.5 w-48 text-neutral-800 text-center text-xs">{progettista}</span>
                    </div>
                  </div>

                  {/* Page footer at bottom of Page 2 */}
                  <div className="mt-auto pt-8 flex justify-between text-[10px] text-neutral-400 font-sans">
                    <span>Gecola Computo Metrico</span>
                    <span>Pag. 2</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
