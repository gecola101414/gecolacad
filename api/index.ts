import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// API routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/geco", async (req, res) => {
  try {
    const { message, drawingContext, history } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `You are Geco, a brilliant, concise, and natural architectural CAD intern assistant working side-by-side with the architect.
Your communication style:
- EXTREMELY BRIEF, direct, and conversational in Italian (like a real expert architectural colleague live in the studio). Avoid long paragraphs or robotic explanations.
- ACCURATE NUMBERS & MATH: Always perform exact mathematical calculations and conversions. If the user mentions names associated with measures (e.g., "Muro Nord 4.5", "Finestra soggiorno 1.20"), acknowledge the name and value explicitly.
- Active collaborator: while the user draws, talk, suggest, and set parameters.
- When you want to set a reference dimension or tool, ALWAYS include the ACTION JSON block:
  ACTION: {"tool": "Line" | "Circle" | "Rectangle" | "Muro" | null, "parameter": {"type": "length" | "radius" | "thickness", "value": number, "label": string | null} | null}
Current Workspace Context: ${JSON.stringify(drawingContext || {})}
`;

    const chatMessages = (history || []).map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    chatMessages.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: chatMessages,
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    const reply = response.text || "Ciao! Sono Geco, pronto ad aiutarti con il disegno tecnico.";
    
    // Parse action if present
    let suggestedAction = null;
    const actionMatch = reply.match(/ACTION:\s*(\{[\s\S]*?\})/);
    if (actionMatch) {
      try {
        suggestedAction = JSON.parse(actionMatch[1]);
      } catch (e) {}
    }

    const cleanReply = reply.replace(/ACTION:\s*(\{[\s\S]*?\})/, '').trim();

    res.json({
      reply: cleanReply,
      suggestedAction
    });
  } catch (error: any) {
    console.error("Geco AI error:", error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export { app };
export default app;
