import express from "express";
import app from "../backend/app.js";

/**
 * Vercel serverless entry point.
 *
 * Every `.ts` file under `/api` is compiled into its own serverless function,
 * so this directory holds nothing but this adapter — the application itself
 * lives in `backend/`, where `server.ts` can also run it on a plain Node host
 * with no Vercel-specific wiring.
 *
 * The one Vercel-specific detail is the path: the `/api/(.*)` rewrite in
 * vercel.json can deliver `/api/login` to the function as `/login`, so the
 * prefix is restored here. This used to live inside the shared app, where it
 * also rewrote page routes such as `/register` into API calls and broke them
 * whenever the app was served by `server.ts`.
 */
const handler = express();

handler.use((req, _res, next) => {
  if (!req.url.startsWith("/api")) {
    req.url = "/api" + (req.url === "/" ? "" : req.url);
  }
  next();
});

handler.use(app);

export default handler;
