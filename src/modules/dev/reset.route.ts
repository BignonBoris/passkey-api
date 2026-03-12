import { Router } from "express";
import sequelize from "../../config/database";

const router = Router();

router.post("/reset-database", async (_req, res) => {
  try {
    await sequelize.sync({ force: true });
    console.log("Database reset via /dev/reset-database");
    return res.status(200).json({
      success: true,
      message: "Database reset completed; all tables recreated.",
    });
  } catch (error) {
    console.error("Database reset failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reset database",
      error: String(error),
    });
  }
});

export default router;
