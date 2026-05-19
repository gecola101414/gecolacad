import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
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
        
        // Simple heuristic for speed
        const lowerPrompt = prompt.toLowerCase();
        let simpleEntities = null;
        if (lowerPrompt.includes("line")) {
            simpleEntities = [{ type: 'line', start: basePosition, end: { x: basePosition.x + 100, y: basePosition.y + 100 }, color: 'white', lineWidth: 2, layer: 'Layer 0' }];
        } else if (lowerPrompt.includes("square") || lowerPrompt.includes("rectangle")) {
            simpleEntities = [{ type: 'rectangle', p1: basePosition, p2: { x: basePosition.x + 100, y: basePosition.y + 100 }, color: 'white', lineWidth: 2, layer: 'Layer 0' }];
        } else if (lowerPrompt.includes("circle")) {
            simpleEntities = [{ type: 'circle', center: basePosition, radius: 50, color: 'white', lineWidth: 2, layer: 'Layer 0' }];
        }

        if (simpleEntities) {
            return res.json({ entities: simpleEntities });
        }

        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `The current drawing has these entities: {}. The user wants to add: "${prompt}" at base position ${JSON.stringify(basePosition)}. Generate a JSON representation of the new entity(ies) to add, relative to the base position. For example, if adding a line of length 100, set start to basePosition. Only return the JSON array of objects.`,
            config: {
                systemInstruction: "You are a CAD assistant. Provide only the JSON array of entities.",
                responseMimeType: "application/json"
            }
        });

        const text = response.text || "[]";
        const entities = JSON.parse(text);
        res.json({ entities });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to generate entity" });
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
