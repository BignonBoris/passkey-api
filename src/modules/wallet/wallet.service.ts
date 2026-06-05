import sequelize from "../../config/database";
import { Transaction as SequelizeTransaction } from "sequelize";
import User from "../../models/user.model";
import UserWalletAccount from "../../models/user-wallet-account.model";
import UserWalletTransaction from "../../models/user-wallet-transaction.model";

type WalletDirection = "CREDIT" | "DEBIT";

export type WalletTransactionType =
  | "DEBIT_UNPAID"
  | "DEBIT_CANCELLATION"
  | "DEBIT_MANUAL"
  | "CREDIT_REFUND"
  | "CREDIT_MANUAL"
  | "ADJUSTMENT_ADMIN";

export type WalletActorType = "SYSTEM" | "ADMIN" | "SUPPORT" | "USER";

export interface WalletTransactionInput {
  userId: string;
  type: WalletTransactionType;
  amount: number;
  reason: string;
  idempotencyKey: string;
  orderId?: string | null;
  direction?: WalletDirection;
  currency?: string;
  createdByType?: WalletActorType;
  createdById?: string | null;
  sourceStatus?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface WalletSummary {
  id: string;
  userId: string;
  balance: number;
  currency: string;
  status: string;
  lastTransactionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  isNegative: boolean;
  availableBalance: number;
}

function normalizeCurrency(value: unknown) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || "XOF";
}

function normalizeReason(value: unknown) {
  return String(value || "").trim();
}

function normalizeIdempotencyKey(value: unknown) {
  return String(value || "").trim();
}

function normalizeDirection(
  type: WalletTransactionType,
  direction?: WalletDirection,
): WalletDirection {
  if (direction === "CREDIT" || direction === "DEBIT") {
    return direction;
  }
  if (type === "CREDIT_REFUND" || type === "CREDIT_MANUAL") return "CREDIT";
  return "DEBIT";
}

function serializeWalletAccount(row: UserWalletAccount): WalletSummary {
  const balance = Number(row.get("balance") || 0);
  return {
    id: String(row.get("id") || ""),
    userId: String(row.get("userId") || ""),
    balance,
    currency: String(row.get("currency") || "XOF"),
    status: String(row.get("status") || "ACTIVE"),
    lastTransactionAt: (row.get("lastTransactionAt") as Date | null) ?? null,
    createdAt: row.get("createdAt") as Date,
    updatedAt: row.get("updatedAt") as Date,
    isNegative: balance < 0,
    availableBalance: balance,
  };
}

function serializeTransaction(row: UserWalletTransaction) {
  const metadataRaw = row.get("metadataJson");
  let metadata: Record<string, unknown> | null = null;
  if (typeof metadataRaw === "string" && metadataRaw.trim().length > 0) {
    try {
      const parsed = JSON.parse(metadataRaw);
      if (parsed && typeof parsed === "object") {
        metadata = parsed as Record<string, unknown>;
      }
    } catch (_) {
      metadata = null;
    }
  }

  return {
    id: String(row.get("id") || ""),
    accountId: String(row.get("accountId") || ""),
    userId: String(row.get("userId") || ""),
    orderId: row.get("orderId") || null,
    type: String(row.get("type") || ""),
    direction: String(row.get("direction") || ""),
    amount: Number(row.get("amount") || 0),
    currency: String(row.get("currency") || "XOF"),
    balanceBefore: Number(row.get("balanceBefore") || 0),
    balanceAfter: Number(row.get("balanceAfter") || 0),
    reason: String(row.get("reason") || ""),
    idempotencyKey: String(row.get("idempotencyKey") || ""),
    createdByType: String(row.get("createdByType") || "SYSTEM"),
    createdById: row.get("createdById") || null,
    sourceStatus: row.get("sourceStatus") || null,
    metadata,
    createdAt: row.get("createdAt"),
    updatedAt: row.get("updatedAt"),
  };
}

async function getUserWalletAccountRow(
  userId: string,
  transaction?: SequelizeTransaction,
) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    throw new Error("userId est obligatoire");
  }

  const user = await User.findByPk(normalizedUserId, {
    attributes: ["id", "role"],
    transaction,
  });
  if (!user) {
    throw new Error("Utilisateur introuvable");
  }

  if (String(user.get("role") || "").trim() !== "usager") {
    throw new Error("Le compte caisse est reserve aux usagers");
  }

  const existingAccount = await UserWalletAccount.findOne({
    where: { userId: normalizedUserId },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (existingAccount) {
    return existingAccount;
  }

  try {
    return await UserWalletAccount.create(
      {
        userId: normalizedUserId,
        balance: 0,
        currency: "XOF",
        status: "ACTIVE",
      },
      { transaction },
    );
  } catch (error: any) {
    if (String(error?.name || "").includes("UniqueConstraint")) {
      const fallbackAccount = await UserWalletAccount.findOne({
        where: { userId: normalizedUserId },
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : undefined,
      });
      if (fallbackAccount) {
        return fallbackAccount;
      }
    }
    throw error;
  }
}

export async function getOrCreateUserWalletAccount(userId: string) {
  const account = await getUserWalletAccountRow(userId);
  return serializeWalletAccount(account);
}

export async function listUserWalletTransactions(
  userId: string,
  options?: { limit?: number; offset?: number },
) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    throw new Error("userId est obligatoire");
  }

  const limit = Math.max(1, Math.min(100, Number(options?.limit || 20)));
  const offset = Math.max(0, Number(options?.offset || 0));

  const rows = await UserWalletTransaction.findAll({
    where: { userId: normalizedUserId },
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return rows.map(serializeTransaction);
}

export async function recordWalletTransaction(params: WalletTransactionInput) {
  const userId = String(params.userId || "").trim();
  const reason = normalizeReason(params.reason);
  const idempotencyKey = normalizeIdempotencyKey(params.idempotencyKey);
  const amount = Number(params.amount);
  const type = params.type;
  const direction = normalizeDirection(type, params.direction);
  const currency = normalizeCurrency(params.currency);
  const orderId = String(params.orderId || "").trim();
  const createdByType = params.createdByType || "SYSTEM";
  const createdById = String(params.createdById || "").trim() || null;
  const sourceStatus = String(params.sourceStatus || "").trim() || null;
  const metadataJson =
    params.metadata && Object.keys(params.metadata).length > 0
      ? JSON.stringify(params.metadata)
      : null;

  if (!userId) throw new Error("userId est obligatoire");
  if (!reason) throw new Error("reason est obligatoire");
  if (!idempotencyKey) throw new Error("idempotencyKey est obligatoire");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Le montant doit etre superieur a 0");
  }

  return sequelize.transaction(async (transaction) => {
    const account = await getUserWalletAccountRow(userId, transaction);

    const existing = await UserWalletTransaction.findOne({
      where: { idempotencyKey },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (existing) {
      const refreshedExistingAccount = await UserWalletAccount.findByPk(
        String(account.get("id") || ""),
        { transaction },
      );
      return {
        account: refreshedExistingAccount
          ? serializeWalletAccount(refreshedExistingAccount)
          : serializeWalletAccount(account),
        transaction: serializeTransaction(existing),
        created: false,
      };
    }

    const balanceBefore = Number(account.get("balance") || 0);
    const signedAmount = direction === "CREDIT" ? amount : -amount;
    const balanceAfter = Number((balanceBefore + signedAmount).toFixed(2));
    const now = new Date();

    let row: UserWalletTransaction;
    try {
      row = await UserWalletTransaction.create(
        {
          accountId: String(account.get("id") || ""),
          userId,
          orderId: orderId || null,
          type,
          direction,
          amount: Math.abs(Number(amount)),
          currency,
          balanceBefore,
          balanceAfter,
          reason,
          idempotencyKey,
          createdByType,
          createdById,
          sourceStatus,
          metadataJson,
        },
        { transaction },
      );
    } catch (error: any) {
      const isDuplicate = String(error?.name || "").includes("UniqueConstraint");
      if (!isDuplicate) {
        throw error;
      }
      const existingAfterCreate = await UserWalletTransaction.findOne({
        where: { idempotencyKey },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!existingAfterCreate) {
        throw error;
      }
      const refreshedDuplicateAccount = await UserWalletAccount.findByPk(
        String(account.get("id") || ""),
        { transaction },
      );
      return {
        account: refreshedDuplicateAccount
          ? serializeWalletAccount(refreshedDuplicateAccount)
          : serializeWalletAccount(account),
        transaction: serializeTransaction(existingAfterCreate),
        created: false,
      };
    }

    await account.update(
      {
        balance: balanceAfter,
        currency,
        lastTransactionAt: now,
      },
      { transaction },
    );

    const refreshedAccount = await UserWalletAccount.findByPk(
      String(account.get("id") || ""),
      { transaction },
    );

    return {
      account: refreshedAccount ? serializeWalletAccount(refreshedAccount) : serializeWalletAccount(account),
      transaction: serializeTransaction(row),
      created: true,
    };
  });
}

export async function debitUserWallet(params: Omit<WalletTransactionInput, "direction">) {
  return recordWalletTransaction({
    ...params,
    direction: "DEBIT",
  });
}

export async function creditUserWallet(params: Omit<WalletTransactionInput, "direction">) {
  return recordWalletTransaction({
    ...params,
    direction: "CREDIT",
  });
}

export function serializeWalletSummary(row: UserWalletAccount) {
  return serializeWalletAccount(row);
}

export function serializeWalletTransactionRow(row: UserWalletTransaction) {
  return serializeTransaction(row);
}
