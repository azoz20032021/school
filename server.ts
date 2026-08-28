import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import apiApp from "./backend/app";

/**
 * Local / self-hosted entry point.
 *
 * It mounts the exact same Express app that the serverless deployment uses, so
 * there is one implementation of every route. The previous version kept a full
 * copy of the API here, which meant every fix had to be made twice and the two
 * copies had already drifted apart.
 */
async function startServer() {
  const app = express();
  const isProduction = process.env.NODE_ENV === "production";

  app.use(apiApp);

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(process.cwd(), "dist");

    // Fingerprinted bundles can be cached hard; index.html must not be.
    app.use(
      express.static(distDir, {
        maxAge: "1y",
        immutable: true,
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache");
        },
      })
    );
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n  نظام إدارة المدرسة يعمل على http://localhost:${PORT}`);
    console.log(`  البيئة: ${isProduction ? "production" : "development"}`);
    if (!process.env.SESSION_SECRET) {
      console.log("  تحذير: لم يتم ضبط SESSION_SECRET — استخدم .env قبل النشر\n");
    } else {
      console.log("");
    }
  });
}

startServer().catch((err) => {
  console.error("فشل تشغيل الخادم:", err);
  process.exit(1);
});
