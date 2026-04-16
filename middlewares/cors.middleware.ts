import cors from "cors";
import { Request, Response, NextFunction } from "express";

// Liste blanche des origins autorisés (mobile + dev)
const whitelist = [
  "http://localhost:3000", // frontend web
  "http://127.0.0.1:3000",
  "http://localhost:4200",
  "exp://127.0.0.1:19000", // Expo / Flutter dev
];

const corsOptions: cors.CorsOptions = {
  origin: function (origin, callback) {
    if (!origin || whitelist.indexOf(origin) !== -1) {
      callback(null, true); // ✅ autorisé
    } else {
      callback(new Error("Not allowed by CORS")); // ❌ refusé
    }
  },
  credentials: true, // pour cookies si besoin
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

export const corsMiddleware = cors(corsOptions);

// Middleware wrapper pour express
export const applyCors = (req: Request, res: Response, next: NextFunction) => {
  corsMiddleware(req, res, next);
};
