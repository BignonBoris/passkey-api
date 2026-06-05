import { Request, Response } from "express";
import { AuthenticatedRequest } from "../../types/auth-request";
import {
  creditUserWallet,
  debitUserWallet,
  getOrCreateUserWalletAccount,
  listUserWalletTransactions,
  recordWalletTransaction,
} from "./wallet.service";

function toPositiveLimit(value: unknown, fallback = 20) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function toOffset(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

export async function getMyWallet(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = String(req.user?.id || "").trim();
    if (!userId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    const wallet = await getOrCreateUserWalletAccount(userId);
    return res.status(200).json({ success: true, data: wallet });
  } catch (error: any) {
    const message = error?.message || "Erreur lors de la recuperation du solde";
    const status = message.includes("reserve aux usagers") ? 403 : 500;
    return res.status(status).json({ success: false, message });
  }
}

export async function getMyWalletTransactions(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = String(req.user?.id || "").trim();
    if (!userId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    const limit = toPositiveLimit(req.query.limit, 20);
    const offset = toOffset(req.query.offset);
    const data = await listUserWalletTransactions(userId, { limit, offset });

    return res.status(200).json({
      success: true,
      data,
      meta: {
        limit,
        offset,
        hasMore: data.length === limit,
      },
    });
  } catch (error: any) {
    const message = error?.message || "Erreur lors de la recuperation de l'historique";
    const status = message.includes("reserve aux usagers") ? 403 : 500;
    return res.status(status).json({ success: false, message });
  }
}

export async function createWalletTransaction(req: Request, res: Response) {
  try {
    const payload = req.body || {};
    const userId = String(payload.userId || "").trim();
    const type = String(payload.type || "").trim().toUpperCase();
    const amount = Number(payload.amount);
    const reason = String(payload.reason || "").trim();
    const idempotencyKey = String(payload.idempotencyKey || "").trim();
    const direction = String(payload.direction || "").trim().toUpperCase();

    if (!userId || !type || !reason || !idempotencyKey || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "userId, type, amount, reason et idempotencyKey sont obligatoires",
      });
    }

    const result = await recordWalletTransaction({
      userId,
      type: type as any,
      amount,
      reason,
      idempotencyKey,
      orderId: String(payload.orderId || "").trim() || null,
      direction: direction === "CREDIT" || direction === "DEBIT" ? (direction as "CREDIT" | "DEBIT") : undefined,
      currency: String(payload.currency || "").trim() || "XOF",
      createdByType: String(payload.createdByType || "ADMIN").trim().toUpperCase() as any,
      createdById: String(payload.createdById || "").trim() || null,
      sourceStatus: String(payload.sourceStatus || "").trim() || null,
      metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : null,
    });

    return res.status(result.created ? 201 : 200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    const message = error?.message || "Impossible de creer le mouvement wallet";
    const status = message.includes("reserve aux usagers") ? 403 : 500;
    return res.status(status).json({ success: false, message });
  }
}
