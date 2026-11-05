import { IfcAPI } from 'web-ifc';
import * as WebIFC from 'web-ifc';

export async function loadAndParseIFC(file: File) {
  const ifcAPI = new IfcAPI();
  
  // Use unpkg to fetch the wasm files without needing to serve them locally
  ifcAPI.SetWasmPath("https://unpkg.com/web-ifc@0.0.77/");
  await ifcAPI.Init();
  
  // Scrivi uno script in Python che analizzi una stringa di testo... (Python requested but TS implemented)
  // Here we read as text, apply the fix, and then convert to Uint8Array
  let text = await file.text();
  text = fixTruncatedIFC(text);
  
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  // Open the model
  const modelID = ifcAPI.OpenModel(data);
  
  // Extract IFCBEAM elements
  const beamLines = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCBEAM);
  const beams = [];
  
  for (let i = 0; i < beamLines.size(); i++) {
    const beamID = beamLines.get(i);
    const beam = ifcAPI.GetLine(modelID, beamID);
    
    // Get properties (IFCPROPERTYSET)
    const props = getPropertySets(ifcAPI, modelID, beamID);
    beams.push({ beam, properties: props });
  }
  
  ifcAPI.CloseModel(modelID);
  return beams;
}

function getPropertySets(ifcAPI: IfcAPI, modelID: number, elementID: number) {
  const propertySets: any[] = [];
  const relDefs = ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
  
  for (let i = 0; i < relDefs.size(); i++) {
    const relID = relDefs.get(i);
    const rel = ifcAPI.GetLine(modelID, relID);
    
    // Check if this relation applies to our element
    let appliesToElement = false;
    if (Array.isArray(rel.RelatedObjects)) {
      appliesToElement = rel.RelatedObjects.some((obj: any) => obj.value === elementID);
    }
    
    if (appliesToElement && rel.RelatingPropertyDefinition) {
      const propSetID = rel.RelatingPropertyDefinition.value;
      try {
        const propSet = ifcAPI.GetLine(modelID, propSetID);
        if (propSet && propSet.HasProperties) {
          const props = propSet.HasProperties.map((p: any) => {
            try {
              return ifcAPI.GetLine(modelID, p.value);
            } catch {
              return null;
            }
          }).filter(Boolean);
          
          propertySets.push({ set: propSet, properties: props });
        }
      } catch (e) {
        console.warn('Could not read property set', e);
      }
    }
  }
  
  return propertySets;
}

export function fixTruncatedIFC(content: string): string {
  let fixedContent = content;
  
  if (!fixedContent.includes('ENDSEC;')) {
    fixedContent += '\nENDSEC;';
  }
  
  if (!fixedContent.includes('END-ISO-10303-21;')) {
    fixedContent += '\nEND-ISO-10303-21;';
  }
  
  return fixedContent;
}
