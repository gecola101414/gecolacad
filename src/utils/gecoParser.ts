// Offline Natural Language, Named Measures & Math Parser for Geco Assistant

export interface GecoParsedCommand {
  hasMatch: boolean;
  isGecoTriggered: boolean;
  extractedValue: number | null;
  parameterType: 'length' | 'radius' | 'thickness';
  suggestedTool: string | null;
  actionSummary: string | null;
  responseText: string;
  savedAlias?: { name: string; value: number } | null;
}

const STORAGE_KEY = 'geco_named_measures';

export function getNamedMeasures(): Record<string, number> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return {
    'muro nord': 4.5,
    'finestra soggiorno': 1.2,
    'porta ingresso': 2.1,
    'parete cucina': 3.8,
    'pilastro p1': 0.4
  };
}

export function saveNamedMeasure(name: string, value: number): Record<string, number> {
  const current = getNamedMeasures();
  const cleanName = name.toLowerCase().trim();
  if (cleanName && !isNaN(value) && value > 0) {
    current[cleanName] = value;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (e) {}
  }
  return current;
}

export function deleteNamedMeasure(name: string): Record<string, number> {
  const current = getNamedMeasures();
  const cleanName = name.toLowerCase().trim();
  delete current[cleanName];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (e) {}
  return current;
}

const ITALIAN_NUMBER_WORDS: Record<string, number> = {
  'zero': 0,
  'uno': 1, 'un': 1, 'una': 1,
  'due': 2,
  'tre': 3,
  'quattro': 4,
  'cinque': 5,
  'sei': 6,
  'sette': 7,
  'otto': 8,
  'nove': 9,
  'dieci': 10,
  'undici': 11,
  'dodici': 12,
  'tredici': 13,
  'quattordici': 14,
  'quindici': 15,
  'sedici': 16,
  'diciassette': 17,
  'diciotto': 18,
  'diciannove': 19,
  'venti': 20,
  'trenta': 30,
  'quaranta': 40,
  'cinquanta': 50,
  'sessanta': 60,
  'settanta': 70,
  'ottanta': 80,
  'novanta': 90,
  'cento': 100,
  'duecento': 200,
  'trecento': 300,
  'quattrocento': 400,
  'cinquecento': 500,
  'seicento': 600,
  'settecento': 700,
  'ottocento': 800,
  'novecento': 900,
  'mille': 1000,
  'mezzo': 0.5, 'mezza': 0.5
};

// Safe evaluator for arithmetic formulas like "4.5 + 1.2", "120 * 2 - 10", "3.5 + 2.1 + 0.8"
export function evalMathExpression(expr: string): number | null {
  if (!expr || typeof expr !== 'string') return null;
  
  // Replace comma with dot and clean input
  let clean = expr.trim()
    .replace(/,/g, '.')
    .replace(/x|per|moltiplicato/gi, '*')
    .replace(/diviso|fratto|:|÷/gi, '/')
    .replace(/più|piu/gi, '+')
    .replace(/meno/gi, '-');

  // Keep only numbers, decimal points, spaces, and math operators
  clean = clean.replace(/[^0-9.+\-*/() ]/g, '');
  if (!clean.trim()) return null;

  try {
    // Check safety
    if (/[^0-9.+\-*/() ]/.test(clean)) return null;
    
    // Evaluate safely using Function
    const res = new Function(`"use strict"; return (${clean})`)();
    if (typeof res === 'number' && !isNaN(res) && isFinite(res)) {
      return parseFloat(res.toFixed(3));
    }
  } catch (e) {}
  
  return null;
}

// Helper to extract numbers or named measures from arbitrary text snippet
function extractValuesAndLabels(text: string, namedDict: Record<string, number>): { val: number; label: string }[] {
  const results: { val: number; label: string }[] = [];
  const cleanedText = text.replace(/\b(\d{1,3})[.,](\d{3})(?!\d)/g, '$1$2');
  const words = cleanedText.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ').split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w) continue;

    if (namedDict[w] !== undefined) {
      results.push({ val: namedDict[w], label: w });
      continue;
    }

    const num = parseFloat(w.replace(',', '.'));
    if (!isNaN(num) && num > 0) {
      results.push({ val: num, label: `${num}` });
      continue;
    }

    if (ITALIAN_NUMBER_WORDS[w] !== undefined) {
      let baseVal = ITALIAN_NUMBER_WORDS[w];
      if (words[i + 1] === 'e' && words[i + 2] && ITALIAN_NUMBER_WORDS[words[i + 2]] !== undefined) {
        const decVal = ITALIAN_NUMBER_WORDS[words[i + 2]];
        if (decVal === 0.5) baseVal += 0.5;
        else if (decVal < 10) baseVal += decVal / 10;
        else if (decVal < 100) baseVal += decVal / 100;
        i += 2;
      }
      results.push({ val: baseVal, label: `${baseVal}` });
    }
  }

  return results;
}

// Extract name/label associated with a measurement in spoken/written text
// e.g. "muro nord 4.5", "finestra cucina 120", "parete soggiorno 3.8", "salva pilastro p1 a 40"
function extractAssociatedLabel(text: string): { label: string | null; value: number | null } {
  const clean = text.trim();

  // Pattern 1: [nome/oggetto] [valore] e.g. "muro nord 4.5", "finestra cucina 1.20", "parete est 3.8"
  const match1 = clean.match(/^([a-zàèéìòù0-9\s_-]{2,30}?)\s*[:=a\s]+(\d+(?:[.,]\d+)?)\s*(?:m|cm|mm|metri|centimetri)?$/i);
  if (match1) {
    const labelCandidates = match1[1].trim().toLowerCase();
    const val = parseFloat(match1[2].replace(',', '.'));
    // Filter out generic trigger words
    const filterOut = ['geco', 'gecco', 'misura', 'imposta', 'traccia', 'disegna', 'valore', 'lunghezza'];
    const words = labelCandidates.split(/\s+/).filter(w => !filterOut.includes(w));
    if (words.length > 0 && !isNaN(val) && val > 0) {
      return { label: words.join(' '), value: val };
    }
  }

  // Pattern 2: "muro" / "parete" / "finestra" / "porta" / "pilastro" followed by name and number
  const match2 = clean.match(/(muro|parete|finestra|porta|pilastro|stanza|cucina|bagno|soggiorno|distanza|soglia|falda|trave)\s+([a-z0-9àèéìòù\s_-]+?)\s*[:=a\s]+(\d+(?:[.,]\d+)?)/i);
  if (match2) {
    const fullLabel = `${match2[1]} ${match2[2]}`.trim().toLowerCase();
    const val = parseFloat(match2[3].replace(',', '.'));
    if (!isNaN(val) && val > 0) {
      return { label: fullLabel, value: val };
    }
  }

  return { label: null, value: null };
}

export function parseGecoCommand(text: string): GecoParsedCommand {
  if (!text || !text.trim()) {
    return {
      hasMatch: false,
      isGecoTriggered: false,
      extractedValue: null,
      parameterType: 'length',
      suggestedTool: null,
      actionSummary: null,
      responseText: ''
    };
  }

  const cleanedText = text.replace(/\b(\d{1,3})[.,](\d{3})(?!\d)/g, '$1$2');
  const rawLower = cleanedText.toLowerCase().trim();
  const isGecoTriggered = rawLower.includes('geco') || rawLower.includes('gecco') || rawLower.includes('jeco');

  // Determine parameter type
  let parameterType: 'length' | 'radius' | 'thickness' = 'length';
  if (rawLower.includes('raggio') || rawLower.includes('cerchio') || rawLower.includes('diametro')) {
    parameterType = 'radius';
  } else if (rawLower.includes('spessore') || rawLower.includes('muro') || rawLower.includes('parete')) {
    parameterType = 'thickness';
  } else if (rawLower.includes('misura') || rawLower.includes('lunghezza') || rawLower.includes('quota') || rawLower.includes('distanza') || rawLower.includes('segmento')) {
    parameterType = 'length';
  }

  // Determine tool command
  let suggestedTool: string | null = null;
  if (rawLower.includes('linea') || rawLower.includes('segmento') || rawLower.includes('traccia')) {
    suggestedTool = 'Line';
  } else if (rawLower.includes('cerchio') || rawLower.includes('raggio')) {
    suggestedTool = 'Circle';
  } else if (rawLower.includes('rettangolo') || rawLower.includes('box')) {
    suggestedTool = 'Rectangle';
  } else if (rawLower.includes('muro') || rawLower.includes('parete') || rawLower.includes('bim muro')) {
    suggestedTool = 'Muro';
  } else if (rawLower.includes('cancella') || rawLower.includes('gomma')) {
    suggestedTool = 'Gomma';
  } else if (rawLower.includes('quota') || rawLower.includes('quotatura')) {
    suggestedTool = 'Dimension';
  }

  const namedDict = getNamedMeasures();

  // Check Name Association
  const associated = extractAssociatedLabel(rawLower);
  if (associated.label && associated.value !== null) {
    saveNamedMeasure(associated.label, associated.value);
    return {
      hasMatch: true,
      isGecoTriggered: true,
      extractedValue: associated.value,
      parameterType,
      suggestedTool,
      actionSummary: `${associated.label.toUpperCase()}: ${associated.value}`,
      responseText: `Fatto! Associata e impostata misura "${associated.label}": ${associated.value}.`,
      savedAlias: { name: associated.label, value: associated.value }
    };
  }

  // Check Explicit Math Expression Evaluation (e.g. "4.5 + 1.2", "120 * 2 + 50")
  if (/^[\d.,\s+\-*/()x:÷]+$/.test(rawLower)) {
    const mathVal = evalMathExpression(rawLower);
    if (mathVal !== null) {
      return {
        hasMatch: true,
        isGecoTriggered: true,
        extractedValue: mathVal,
        parameterType,
        suggestedTool,
        actionSummary: `CALCOLO: ${rawLower} = ${mathVal}`,
        responseText: `Risultato calcolo: ${rawLower} = ${mathVal}. Misura impostata!`
      };
    }
  }

  // Check 1: Explicit Save Command e.g. "salva finestra 120", "chiama parete nord 4.5"
  const saveMatch = rawLower.match(/(?:salva|associa|chiama|imposta|denomina)\s+(?:misura\s+)?([a-zàèéìòù0-9\s_-]+?)\s+(?:a\s+|=|\b)(\d+(?:[.,]\d+)?)/i);
  if (saveMatch) {
    const aliasName = saveMatch[1].trim();
    const val = parseFloat(saveMatch[2].replace(',', '.'));
    if (aliasName && !isNaN(val) && val > 0) {
      saveNamedMeasure(aliasName, val);
      return {
        hasMatch: true,
        isGecoTriggered: true,
        extractedValue: val,
        parameterType,
        suggestedTool,
        actionSummary: `SALVATO: ${aliasName} = ${val}`,
        responseText: `Fatto! Salvato e impostato ${aliasName}: ${val}.`,
        savedAlias: { name: aliasName, value: val }
      };
    }
  }

  // Check 2: MATH MATH OPERATIONS
  const isSquareRootMatch = rawLower.includes('radice');
  const isSquareMatch = rawLower.includes('quadrato') || rawLower.includes('elevato');
  const isHalfMatch = rawLower.includes('metà') || rawLower.includes('meta') || rawLower.includes('mezzo') || rawLower.includes('mezza');
  const isDoubleMatch = rawLower.includes('doppio') || rawLower.includes('duplica');
  const isMultiplyMatch = rawLower.includes('per') || rawLower.includes('moltiplica') || rawLower.includes('volte') || rawLower.includes('*');
  const isDivisionMatch = rawLower.includes('diviso') || rawLower.includes('dividi') || rawLower.includes('fratto') || rawLower.includes('/');
  const isSumMatch = rawLower.includes('somma') || rawLower.includes('più') || rawLower.includes('piu') || rawLower.includes('+');
  const isMinusMatch = rawLower.includes('meno') || rawLower.includes('sottrai') || rawLower.includes('-');

  const extractedItems = extractValuesAndLabels(rawLower, namedDict);

  if (isSquareRootMatch && extractedItems.length >= 1) {
    const item = extractedItems[0];
    const sqrtVal = parseFloat(Math.sqrt(item.val).toFixed(2));
    return {
      hasMatch: true,
      isGecoTriggered: true,
      extractedValue: sqrtVal,
      parameterType,
      suggestedTool,
      actionSummary: `RADICE: √${item.label} = ${sqrtVal}`,
      responseText: `Fatto! La radice quadrata di ${item.label} è ${sqrtVal}.`
    };
  }

  if (isSquareMatch && extractedItems.length >= 1) {
    const item = extractedItems[0];
    const sqVal = parseFloat((item.val * item.val).toFixed(2));
    return {
      hasMatch: true,
      isGecoTriggered: true,
      extractedValue: sqVal,
      parameterType,
      suggestedTool,
      actionSummary: `QUADRATO: (${item.label})² = ${sqVal}`,
      responseText: `Fatto! Il quadrato di ${item.label} è ${sqVal}.`
    };
  }

  if (isHalfMatch && extractedItems.length >= 1) {
    const item = extractedItems[0];
    const halfVal = parseFloat((item.val / 2).toFixed(2));
    return {
      hasMatch: true,
      isGecoTriggered: true,
      extractedValue: halfVal,
      parameterType,
      suggestedTool,
      actionSummary: `METÀ: ${item.label} (${item.val}) -> ${halfVal}`,
      responseText: `Fatto! La metà di ${item.label} è ${halfVal}.`
    };
  }

  if (isDoubleMatch && extractedItems.length >= 1) {
    const item = extractedItems[0];
    const doubleVal = parseFloat((item.val * 2).toFixed(2));
    return {
      hasMatch: true,
      isGecoTriggered: true,
      extractedValue: doubleVal,
      parameterType,
      suggestedTool,
      actionSummary: `DOPPIO: ${item.label} (${item.val}) -> ${doubleVal}`,
      responseText: `Fatto! Il doppio di ${item.label} è ${doubleVal}.`
    };
  }

  if (isDivisionMatch && extractedItems.length >= 2) {
    const item1 = extractedItems[0];
    const item2 = extractedItems[1];
    if (item2.val !== 0) {
      const divVal = parseFloat((item1.val / item2.val).toFixed(2));
      return {
        hasMatch: true,
        isGecoTriggered: true,
        extractedValue: divVal,
        parameterType,
        suggestedTool,
        actionSummary: `DIVISO: ${item1.val} / ${item2.val} = ${divVal}`,
        responseText: `Fatto! ${item1.label} diviso ${item2.label} fa ${divVal}.`
      };
    }
  }

  if (isMultiplyMatch && extractedItems.length >= 2) {
    const item1 = extractedItems[0];
    const item2 = extractedItems[1];
    const multVal = parseFloat((item1.val * item2.val).toFixed(2));
    return {
      hasMatch: true,
      isGecoTriggered: true,
      extractedValue: multVal,
      parameterType,
      suggestedTool,
      actionSummary: `MOLTIPLICAZIONE: ${item1.val} * ${item2.val} = ${multVal}`,
      responseText: `Fatto! ${item1.label} per ${item2.label} fa ${multVal}.`
    };
  }

  if (isSumMatch && extractedItems.length >= 2) {
    const item1 = extractedItems[0];
    const item2 = extractedItems[1];
    const sumVal = parseFloat((item1.val + item2.val).toFixed(2));
    return {
      hasMatch: true,
      isGecoTriggered: true,
      extractedValue: sumVal,
      parameterType,
      suggestedTool,
      actionSummary: `SOMMA: ${item1.val} + ${item2.val} = ${sumVal}`,
      responseText: `Fatto! ${item1.label} più ${item2.label} fa ${sumVal}.`
    };
  }

  if (isMinusMatch && extractedItems.length >= 2) {
    const item1 = extractedItems[0];
    const item2 = extractedItems[1];
    const minusVal = parseFloat((item1.val - item2.val).toFixed(2));
    return {
      hasMatch: true,
      isGecoTriggered: true,
      extractedValue: minusVal,
      parameterType,
      suggestedTool,
      actionSummary: `SOTTRAZIONE: ${item1.val} - ${item2.val} = ${minusVal}`,
      responseText: `Fatto! ${item1.label} meno ${item2.label} fa ${minusVal}.`
    };
  }

  // Check 3: Recall named measure directly by key in text
  for (const [aliasName, aliasVal] of Object.entries(namedDict)) {
    if (rawLower.includes(aliasName)) {
      return {
        hasMatch: true,
        isGecoTriggered: true,
        extractedValue: aliasVal,
        parameterType,
        suggestedTool,
        actionSummary: `NOME: ${aliasName} (${aliasVal})`,
        responseText: `Fatto! Applicato ${aliasName}: ${aliasVal}.`,
        savedAlias: { name: aliasName, value: aliasVal }
      };
    }
  }

  // Check 4: Direct explicit digits / units
  let extractedValue: number | null = null;
  const digitRegex = /(\d+(?:[.,]\d+)?)\s*(cm|m|mm|metri|metro|centimetri|millimetri)?/g;
  let match: RegExpExecArray | null;

  while ((match = digitRegex.exec(rawLower)) !== null) {
    let numStr = match[1].replace(',', '.');
    let val = parseFloat(numStr);
    const unit = match[2];

    if (!isNaN(val) && val > 0) {
      if (unit === 'mm' || unit === 'millimetri') {
        val = val / 10;
      }
      extractedValue = val;
      break;
    }
  }

  if (extractedValue !== null && rawLower.includes('diametro')) {
    extractedValue = parseFloat((extractedValue / 2).toFixed(2));
  }

  if (extractedValue === null && extractedItems.length > 0) {
    extractedValue = extractedItems[0].val;
  }

  const hasMatch = extractedValue !== null || suggestedTool !== null;

  let responseText = '';
  if (extractedValue !== null) {
    const typeLabel = parameterType === 'radius' ? 'raggio' : parameterType === 'thickness' ? 'spessore' : 'misura';
    responseText = `Fatto! ${typeLabel} ${extractedValue} impostata.`;
    if (suggestedTool) {
      responseText += ` Strumento ${suggestedTool} attivo.`;
    }
  } else if (suggestedTool) {
    responseText = `Fatto! Strumento ${suggestedTool} attivato.`;
  } else if (isGecoTriggered) {
    responseText = `Ascolto! Scrivi o pronuncia il nome e la misura (es. "Muro Nord 4.5").`;
  }

  return {
    hasMatch,
    isGecoTriggered,
    extractedValue,
    parameterType,
    suggestedTool,
    actionSummary: extractedValue !== null ? `${parameterType.toUpperCase()}: ${extractedValue}` : suggestedTool,
    responseText
  };
}
