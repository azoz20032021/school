import { onRequest } from "firebase-functions/v2/https";
import app from "./backend/app.js";

export const api = onRequest(
  {
    region: "europe-west1",
    cors: true,
    invoker: "public",
    maxInstances: 10,
  },
  app
);
