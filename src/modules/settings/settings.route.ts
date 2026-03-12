import { Router } from "express";
import { getSettings, updateSettings } from "./settings.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";

const router = Router();

router.get("/", authenticate, authorize(PRIVILEGED_ROLES), getSettings);
router.put("/", authenticate, authorize(PRIVILEGED_ROLES), updateSettings);

export default router;
