const express = require("express");
import { getSettings, updateSettings } from "./settings.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";

const router = express.Router();

router.get("/", authenticate, authorize(PRIVILEGED_ROLES), getSettings);
router.put("/", authenticate, authorize(PRIVILEGED_ROLES), updateSettings);

module.exports = router;
