/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Entity, Point, Layer } from "../types";

/**
 * Safely resolves and evaluates simple math expressions.
 * E.g., "-LATO/2 + 10" with LATO=50 -> "-50/2 + 10" -> -15
 */
export function evaluateExpression(expr: string, variables: Record<string, number>): number {
  let cleaned = expr.trim();
  if (!cleaned) return 0;

  // Substitute all alphabetical identifier tokens that match declared variables
  // Check word-by-word or use regex
  // Sort variables by length descending to avoid prefix collision (e.g. LATO_LUNGO and LATO)
  const sortedVarNames = Object.keys(variables).sort((a, b) => b.length - a.length);
  
  for (const name of sortedVarNames) {
    const val = variables[name];
    // Replace standalone occurrences of variable name (possibly with optional $ prefix)
    const regex = new RegExp(`\\$?${name}\\b`, 'g');
    cleaned = cleaned.replace(regex, String(val));
  }

  // Safe Math expressions only: allow numbers, operators + - * / ( ), decimals and spaces
  // Prevent any safe execute breach
  const safeCharRegex = /^[0-9.+\-*/() ]*$/;
  if (!safeCharRegex.test(cleaned)) {
    console.warn("Invalid or unsafe expression bypassed:", cleaned);
    // Try to parse direct parsed float
    const f = parseFloat(cleaned);
    return isNaN(f) ? 0 : f;
  }

  try {
    // evaluate the cleaned mathematical expression securely via Function constructor
    const res = new Function(`return (${cleaned})`)();
    const num = Number(res);
    return isNaN(num) ? 0 : num;
  } catch (err) {
    console.warn("Evaluation failed for expression:", cleaned, err);
    const f = parseFloat(cleaned);
    return isNaN(f) ? 0 : f;
  }
}

/**
 * Parses space-delimited options, respecting double or single quotes
 * E.g., LINE 0 0 50 50 "#ff0000" 2 "Maschere" -> tokens: ["LINE", "0", "0", "50", "50", "#ff0000", "2", "Maschere"]
 */
export function tokenizeLine(line: string): string[] {
  const tokens: string[] = [];
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    // If double quote captured
    if (match[1] !== undefined) {
      tokens.push(match[1]);
    } else if (match[2] !== undefined) {
      tokens.push(match[2]);
    } else {
      tokens.push(match[0]);
    }
  }
  return tokens;
}

export interface ParseResult {
  entities: Entity[];
  declaredVars: Record<string, number>;
  referencedLayers: string[];
}

/**
 * Main DSL Parser
 * Translates script text containing variables and instructions into CAD Entities
 */
export function parseScriptToEntities(
  scriptText: string,
  basePos: Point,
  activeLayer: string,
  overrideVariables?: Record<string, number>
): ParseResult {
  const lines = scriptText.split("\n");
  const entities: Entity[] = [];
  const variables: Record<string, number> = {};
  const referencedLayersSet = new Set<string>();

  // 1. Gather default variables declared in the script
  for (let line of lines) {
    line = line.trim();
    // Strip comments
    const commentIdx = line.indexOf("#") !== -1 ? line.indexOf("#") : line.indexOf("//");
    if (commentIdx !== -1) {
      line = line.substring(0, commentIdx).trim();
    }
    if (!line) continue;

    // Check for variable assignment: e.g., HEIGHT = 120 or WIDTH = 50 + 20
    const eqIdx = line.indexOf("=");
    if (eqIdx !== -1) {
      const varName = line.substring(0, eqIdx).trim();
      const exprValue = line.substring(eqIdx + 1).trim();
      // Only treat variables with valid alpha-numeric names starting with letter
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(varName)) {
        const val = evaluateExpression(exprValue, variables);
        variables[varName] = val;
      }
    }
  }

  // 2. Apply any visual edit overrides
  if (overrideVariables) {
    for (const [key, val] of Object.entries(overrideVariables)) {
      variables[key] = val;
    }
  }

  // 3. Second pass: Parse drawing commands
  for (let line of lines) {
    line = line.trim();
    // Strip comment
    const commentIdx = line.indexOf("#") !== -1 ? line.indexOf("#") : line.indexOf("//");
    if (commentIdx !== -1) {
      line = line.substring(0, commentIdx).trim();
    }
    if (!line) continue;

    // If it contains variable declaration, already handled, skip
    if (line.includes("=")) continue;

    const tokens = tokenizeLine(line);
    if (tokens.length === 0) continue;

    const command = tokens[0].toUpperCase();
    const args = tokens.slice(1);

    const randomId = () => Math.random().toString(36).substring(2, 9);

    try {
      if (command === "LINE" || command === "L") {
        // LINE x1 y1 x2 y2 [color] [lineWidth] [layer] [dashed]
        if (args.length < 4) continue;
        const x1 = evaluateExpression(args[0], variables);
        const y1 = evaluateExpression(args[1], variables);
        const x2 = evaluateExpression(args[2], variables);
        const y2 = evaluateExpression(args[3], variables);

        const color = args[4] || "#000000";
        const lineWidth = Number(args[5]) || 1;
        const layer = args[6] || activeLayer;
        const dashed = args[7] === "true" || args[7] === "dashed";

        if (layer) referencedLayersSet.add(layer);

        entities.push({
          id: randomId(),
          type: "line",
          start: { x: basePos.x + x1, y: basePos.y + y1 },
          end: { x: basePos.x + x2, y: basePos.y + y2 },
          color,
          lineWidth,
          layer,
          mode: "pencil",
          dashed,
        });
      } 
      else if (command === "CIRCLE" || command === "C") {
        // CIRCLE cx cy r [color] [lineWidth] [layer]
        if (args.length < 3) continue;
        const cx = evaluateExpression(args[0], variables);
        const cy = evaluateExpression(args[1], variables);
        const r = evaluateExpression(args[2], variables);

        const color = args[3] || "#000000";
        const lineWidth = Number(args[4]) || 1;
        const layer = args[5] || activeLayer;

        if (layer) referencedLayersSet.add(layer);

        entities.push({
          id: randomId(),
          type: "circle",
          center: { x: basePos.x + cx, y: basePos.y + cy },
          radius: r,
          color,
          lineWidth,
          layer,
          mode: "pencil",
        });
      } 
      else if (command === "RECTANGLE" || command === "RECT" || command === "R") {
        // RECTANGLE x1 y1 x2 y2 [color] [lineWidth] [layer]
        if (args.length < 4) continue;
        const x1 = evaluateExpression(args[0], variables);
        const y1 = evaluateExpression(args[1], variables);
        const x2 = evaluateExpression(args[2], variables);
        const y2 = evaluateExpression(args[3], variables);

        const color = args[4] || "#000000";
        const lineWidth = Number(args[5]) || 1;
        const layer = args[6] || activeLayer;

        if (layer) referencedLayersSet.add(layer);

        entities.push({
          id: randomId(),
          type: "rectangle",
          p1: { x: basePos.x + x1, y: basePos.y + y1 },
          p2: { x: basePos.x + x2, y: basePos.y + y2 },
          color,
          lineWidth,
          layer,
          mode: "pencil",
        });
      } 
      else if (command === "ARC" || command === "A") {
        // ARC cx cy r startAngle endAngle [color] [lineWidth] [layer]
        if (args.length < 5) continue;
        const cx = evaluateExpression(args[0], variables);
        const cy = evaluateExpression(args[1], variables);
        const r = evaluateExpression(args[2], variables);
        const startAngle = evaluateExpression(args[3], variables);
        const endAngle = evaluateExpression(args[4], variables);

        const color = args[5] || "#000000";
        const lineWidth = Number(args[6]) || 1;
        const layer = args[7] || activeLayer;

        if (layer) referencedLayersSet.add(layer);

        entities.push({
          id: randomId(),
          type: "arc",
          center: { x: basePos.x + cx, y: basePos.y + cy },
          radius: r,
          startAngle,
          endAngle,
          color,
          lineWidth,
          layer,
          mode: "pencil",
        });
      } 
      else if (command === "POINT" || command === "P") {
        // POINT x y [color] [layer]
        if (args.length < 2) continue;
        const x = evaluateExpression(args[0], variables);
        const y = evaluateExpression(args[1], variables);

        const color = args[2] || "#000000";
        const layer = args[3] || activeLayer;

        if (layer) referencedLayersSet.add(layer);

        entities.push({
          id: randomId(),
          type: "point",
          point: { x: basePos.x + x, y: basePos.y + y },
          color,
          lineWidth: 1,
          layer,
          mode: "pencil",
        });
      } 
      else if (command === "TEXT" || command === "T") {
        // TEXT x y textContent [fontSize] [color] [layer] [fontWeight]
        if (args.length < 3) continue;
        const x = evaluateExpression(args[0], variables);
        const y = evaluateExpression(args[1], variables);
        const text = args[2]; // Unquoted string tokenized automatically
        const fontSize = evaluateExpression(args[3] || "12", variables);
        const color = args[4] || "#000000";
        const layer = args[5] || activeLayer;
        const fontWeight = args[6] || "normal";

        if (layer) referencedLayersSet.add(layer);

        entities.push({
          id: randomId(),
          type: "text",
          point: { x: basePos.x + x, y: basePos.y + y },
          text,
          fontSize,
          fontFamily: "sans-serif",
          fontWeight,
          textAlign: "center",
          color,
          lineWidth: 1,
          layer,
          mode: "pencil",
        });
      }
    } catch (err) {
      console.warn("Skipping buggy script line:", line, err);
    }
  }

  return {
    entities,
    declaredVars: variables,
    referencedLayers: Array.from(referencedLayersSet),
  };
}

/**
 * Updates variable declarations in DSL script code with new values.
 * e.g., line containing "WIDTH = 50" is replaced with "WIDTH = 60"
 */
export function updateScriptVariables(scriptText: string, variables: Record<string, number>): string {
  const lines = scriptText.split("\n");
  const updatedLines = lines.map(line => {
    const trimmed = line.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const varName = trimmed.substring(0, eqIdx).trim();
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(varName) && variables[varName] !== undefined) {
        // preserve comment on same line
        const commentIdx = line.indexOf("#") !== -1 ? line.indexOf("#") : line.indexOf("//");
        let commentPart = "";
        if (commentIdx !== -1) {
          commentPart = " " + line.substring(commentIdx);
        }
        return `${varName} = ${variables[varName]}${commentPart}`;
      }
    }
    return line;
  });
  return updatedLines.join("\n");
}

