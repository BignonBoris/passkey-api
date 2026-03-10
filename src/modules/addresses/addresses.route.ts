const express = require("express");
import {
  createMyAddress,
  deleteMyAddress,
  listMyAddresses,
  updateMyAddress,
} from "./addresses.controller";
import { authenticate } from "@/middlewares/auth.middleware";

const router = express.Router();

router.get("/me", authenticate, listMyAddresses);
router.post("/me", authenticate, createMyAddress);
router.patch("/me/:id", authenticate, updateMyAddress);
router.delete("/me/:id", authenticate, deleteMyAddress);

module.exports = router;
