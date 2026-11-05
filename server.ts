import { app } from "./api/index";
import path from "path";
import express from "express";

// Only start the server listening if we are running in standalone mode (not as a serverless function)
async function runStandalone() {
  if (process.env.VERCEL !== "1") {
    let vitePromise: Promise<any> | null = null;
    const getVite = () => {
      if (!vitePromise) {
        vitePromise = import("vite").then(({ createServer: createViteServer }) =>
          createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
          })
        );
      }
      return vitePromise;
    };

    if (process.env.NODE_ENV !== "production") {
      app.use(async (req, res, next) => {
        try {
          const vite = await getVite();
          vite.middlewares(req, res, next);
        } catch (err) {
          next(err);
        }
      });
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
      if (process.env.NODE_ENV !== "production") {
        setTimeout(() => {
          getVite().catch((err) => console.error("Vite init error:", err));
        }, 100);
      }
    });
  }
}
runStandalone();