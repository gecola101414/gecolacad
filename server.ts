import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  
  // ==========================================
  // MILITARY SECURITY: IP WHITELISTING MIDDLEWARE
  // ==========================================
  app.use((req, res, next) => {
    // Di default la whitelist è ATTIVATA, a meno che non venga esplicitamente disabilitata
    const whitelistEnabled = process.env.ENABLE_IP_WHITELIST !== 'false';
    if (!whitelistEnabled) {
      return next(); 
    }

    // Estrai la lista di IP consentiti dalla variabile d'ambiente (fallback all'IP dell'ufficio)
    const allowedIps = (process.env.ALLOWED_IPS || "82.180.59.135")
      .split(',')
      .map(ip => ip.trim());

    // Ottieni l'IP del client
    const rawIp = req.header('x-forwarded-for') || req.socket.remoteAddress || "";
    const clientIp = rawIp.split(',')[0].trim(); 

    // Log per debug lato server (visibile nei log del backend)
    console.log(`[SECURITY CHECK] Connessione in ingresso da IP: ${clientIp} - Raw: ${rawIp}`);

    // Controlla se l'IP è autorizzato
    if (allowedIps.includes(clientIp) || clientIp === "::1" || clientIp === "127.0.0.1" || clientIp.startsWith("10.22.")) {
      return next(); // IP autorizzato -> procedi
    }

    // IP NON AUTORIZZATO -> Blocca la richiesta
    console.warn(`[SECURITY] Tentativo di accesso bloccato dall'IP: ${clientIp}`);
    return res.status(403).send(`
      <div style="font-family: monospace; padding: 20px; color: #dc2626;">
        <h1>403 - Forbidden</h1>
        <p><b>Accesso negato - Rete non autorizzata.</b></p>
        <p>Il tuo indirizzo IP (${clientIp}) non compare nella whitelist della rete militare.</p>
      </div>
    `);
  });

  app.use(express.json());
  const PORT = 3000;

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY!,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API routes FIRST
  app.post("/api/ai-draw", async (req, res) => {
    try {
        const { prompt, basePosition } = req.body;
        
        const systemInstruction = 
          "Sei un assistente CAD professionale che progetta forme geometriche parametriche e disegni tecnici 2D.\n" +
          "Il tuo compito è convertire la descrizione dell'utente in un disegno parametrico scritto in un semplice linguaggio DSL.\n\n" +
          "Le regole del DSL sono le seguenti:\n" +
          "1. Puoi dichiarare variabili parametriche all'inizio del file, ad esempio:\n" +
          "   LARGHEZZA = 120\n" +
          "   ALTEZZA = 80\n" +
          "   RAGGIO = 15\n\n" +
          "2. Puoi disegnare elementi geometrici inserendo un comando per riga. Puoi utilizzare le variabili dichiarate nei parametri delle coordinate e dimensioni, risolvendo semplici espressioni matematiche (es: LARGHEZZA/2 o -ALTEZZA/2).\n" +
          "Le coordinare devono essere relative al centro (0, 0).\n" +
          "I comandi supportati sono:\n" +
          "   - LINE x1 y1 x2 y2 [colore] [spessore_linea] [layer] [dashed_bool]\n" +
          '     Esempio: LINE -LARGHEZZA/2 -ALTEZZA/2 LARGHEZZA/2 -ALTEZZA/2 "#000000" 1\n' +
          "   - CIRCLE cx cy r [colore] [spessore_linea] [layer]\n" +
          '     Esempio: CIRCLE 0 0 RAGGIO "#ef4444" 2.5\n' +
          "   - RECTANGLE x1 y1 x2 y2 [colore] [spessore_linea] [layer]\n" +
          '     Esempio: RECTANGLE -LARGHEZZA/2 -ALTEZZA/2 LARGHEZZA/2 ALTEZZA/2 "#000000" 1\n' +
          "   - ARC cx cy r startAngle endAngle [colore] [spessore_linea] [layer]\n" +
          '     Esempio: ARC 0 0 50 0 180 "#000000" 1\n' +
          "   - POINT x y [colore] [layer]\n" +
          '   - TEXT x y textContent [fontSize] [colore] [layer] [fontWeight]\n' +
          '     Esempio: TEXT 0 0 "Tavolo" 14 "#000000" "0" "bold"\n\n' +
          "Crea sempre il disegno centrato intorno alla coordinata (0,0), in modo che l'utente possa poi traslarlo o posizionarlo dove desidera.\n" +
          "Aggiungi commenti chiari (usando #) nel codice DSL per spiegare ogni sezione del disegno (es. # Contorno tavolo, # Sedie superiori).\n\n" +
          "Restituisci la risposta esclusivamente in formato JSON valido, secondo questo schema:\n" +
          "{\n" +
          '  "explanation": "Spiegazione in italiano del disegno generato e dei parametri utilizzati.",\n' +
          '  "parameters": [\n' +
          '    { "name": "NOME_VARIABILE", "value": DEFAULT_NUMBER, "label": "Label leggibile in italiano" }\n' +
          '  ],\n' +
          '  "script": "Il codice DSL completo con le dichiarazioni delle variabili in alto e i comandi di disegno in basso."\n' +
          "}";

        const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: `Genera una rappresentazione parametrica per: "${prompt}"`,
            config: {
                systemInstruction,
                responseMimeType: "application/json"
            }
        });

        const text = response.text || "{}";
        const result = JSON.parse(text);
        res.json(result);
    } catch (error: any) {
        console.error("Gemini AI-draw generation error:", error);
        res.status(500).json({ error: error?.message || "Failed to generate parametric drawing" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
