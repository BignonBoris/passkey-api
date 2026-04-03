import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";
import Order from "./order.model";

class Payment extends Model {
  public id!: string;
  public orderId!: string;
  public userId!: string;
  public driverId?: string | null;
  public amount!: number;
  public currency!: string;
  public status!: string;
  public method!: string;
  public provider?: string | null;
  public providerTransactionId?: string | null;
  public providerReference?: string | null;
  public merchantReference?: string | null;
  public checkoutUrl?: string | null;
  public checkoutToken?: string | null;
  public callbackUrl?: string | null;
  public customerEmail?: string | null;
  public customerPhone?: string | null;
  public failureReason?: string | null;
  public callbackReceivedAt?: Date | null;
  public rawProviderPayload?: string | null;
  public paidAt?: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Payment.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: Order, key: "id" },
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: User, key: "id" },
    },
    driverId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: User, key: "id" },
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "F CFA",
    },
    status: {
      type: DataTypes.ENUM("PENDING", "PAID", "FAILED", "REFUNDED"),
      defaultValue: "PENDING",
    },
    method: {
      type: DataTypes.ENUM("CASH", "CARD", "MOBILE_MONEY"),
      allowNull: false,
      defaultValue: "CASH",
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    providerTransactionId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    providerReference: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    merchantReference: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    checkoutUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    checkoutToken: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    callbackUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    customerEmail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    customerPhone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    failureReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    callbackReceivedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    rawProviderPayload: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Payment",
    tableName: "Payment",
    freezeTableName: true,
  }
);

User.hasMany(Payment, { foreignKey: "userId", as: "payments", constraints: false });
Payment.belongsTo(User, { foreignKey: "userId", as: "user", constraints: false });
User.hasMany(Payment, { foreignKey: "driverId", as: "driverPayments", constraints: false });
Payment.belongsTo(User, { foreignKey: "driverId", as: "driver", constraints: false });
Order.hasMany(Payment, { foreignKey: "orderId", as: "payments", constraints: false });
Payment.belongsTo(Order, { foreignKey: "orderId", as: "order", constraints: false });

export default Payment;
