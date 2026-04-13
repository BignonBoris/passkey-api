import DriverAccount from "../../models/driver-account.model";
import DriverFundingTransaction from "../../models/driver-funding-transaction.model";
import User from "../../models/user.model";

export async function getOrCreateBalance(driverId: string) {
  const user = await User.findByPk(driverId);
  if (!user || user.role !== "livreur") {
    throw new Error("L'utilisateur n'est pas un livreur");
  }

  let account = await DriverAccount.findOne({ where: { userId: driverId } });
  if (!account) {
    account = await DriverAccount.create({ userId: driverId, balance: 0 });
  }
  return account;
}

export async function fundDriver(driverId: string, amount: number, action: 'ADD' | 'SUBTRACT' = 'ADD') {
  const account = await getOrCreateBalance(driverId);
  
  // Mettre à jour le solde
  const transactionAmount = action === 'ADD' ? Number(amount) : -Number(amount);
  account.balance += transactionAmount;
  await account.save();

  // Créer une transaction
  const transaction = await DriverFundingTransaction.create({
    driverId,
    amount: transactionAmount,
    type: action === 'ADD' ? "RECHARGE" : "USAGE",
    status: "COMPLETED",
  });

  return { account, transaction };
}

export async function applyDriverAccountMovement(
  driverId: string,
  amount: number,
  action: "ADD" | "SUBTRACT"
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Le montant doit etre superieur a 0");
  }

  return fundDriver(driverId, amount, action);
}

export async function getFundingHistory(driverId: string) {
  return await DriverFundingTransaction.findAll({
    where: { driverId },
    order: [["createdAt", "DESC"]],
  });
}
