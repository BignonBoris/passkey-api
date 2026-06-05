import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";
import {
  createWalletTransaction,
  getMyWallet,
  getMyWalletTransactions,
} from "./wallet.controller";

const router = Router();

router.get("/me", authenticate, getMyWallet);
router.get("/me/transactions", authenticate, getMyWalletTransactions);

router.post("/transactions", authenticate, authorize(PRIVILEGED_ROLES), createWalletTransaction);

export default router;
