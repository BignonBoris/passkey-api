import { Router } from "express";
import { RefreshTokenController } from "./refreshToken.controller";

const router = Router();

router.post("/", RefreshTokenController.refresh);

export default router;
