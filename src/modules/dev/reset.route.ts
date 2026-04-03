import { Router } from "express";

const router = Router();

router.post("/reset-database", async (_req, res) => {
  return res.status(403).json({
    success: false,
    message: "Database reset is disabled.",
  });
});

export default router;
