import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";
import Order from "./order.model";
import UserWalletAccount from "./user-wallet-account.model";

class UserWalletTransaction extends Model {
  public id!: string;
  public accountId!: string;
  public userId!: string;
  public orderId!: string | null;
  public type!:
    | "DEBIT_UNPAID"
    | "DEBIT_CANCELLATION"
    | "DEBIT_MANUAL"
    | "CREDIT_REFUND"
    | "CREDIT_MANUAL"
    | "ADJUSTMENT_ADMIN";
  public direction!: "CREDIT" | "DEBIT";
  public amount!: number;
  public currency!: string;
  public balanceBefore!: number;
  public balanceAfter!: number;
  public reason!: string;
  public idempotencyKey!: string;
  public createdByType!: "SYSTEM" | "ADMIN" | "SUPPORT" | "USER";
  public createdById!: string | null;
  public sourceStatus!: string | null;
  public metadataJson!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

UserWalletTransaction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    accountId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: UserWalletAccount,
        key: "id",
      },
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: Order,
        key: "id",
      },
    },
    type: {
      type: DataTypes.ENUM(
        "DEBIT_UNPAID",
        "DEBIT_CANCELLATION",
        "DEBIT_MANUAL",
        "CREDIT_REFUND",
        "CREDIT_MANUAL",
        "ADJUSTMENT_ADMIN"
      ),
      allowNull: false,
    },
    direction: {
      type: DataTypes.ENUM("CREDIT", "DEBIT"),
      allowNull: false,
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: "XOF",
    },
    balanceBefore: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    balanceAfter: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    idempotencyKey: {
      type: DataTypes.STRING(180),
      allowNull: false,
      unique: true,
    },
    createdByType: {
      type: DataTypes.ENUM("SYSTEM", "ADMIN", "SUPPORT", "USER"),
      allowNull: false,
      defaultValue: "SYSTEM",
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: User,
        key: "id",
      },
    },
    sourceStatus: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    metadataJson: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "UserWalletTransaction",
    tableName: "UserWalletTransaction",
    freezeTableName: true,
  }
);

User.hasMany(UserWalletTransaction, { foreignKey: "userId", as: "walletTransactions" });
UserWalletAccount.hasMany(UserWalletTransaction, {
  foreignKey: "accountId",
  as: "transactions",
});
UserWalletTransaction.belongsTo(User, { foreignKey: "userId", as: "user" });
UserWalletTransaction.belongsTo(UserWalletAccount, {
  foreignKey: "accountId",
  as: "walletAccount",
});
UserWalletTransaction.belongsTo(Order, { foreignKey: "orderId", as: "order" });

export default UserWalletTransaction;
