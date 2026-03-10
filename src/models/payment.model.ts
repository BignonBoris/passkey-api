import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";
import Order from "./order.model";

class Payment extends Model {
  public id!: string;
  public orderId!: string;
  public userId!: string;
  public driverId!: string;
  public amount!: number;
  public currency!: string;
  public status!: string;
  public method!: string;
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
      allowNull: false,
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

User.hasMany(Payment, { foreignKey: "userId", as: "payments" });
Payment.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(Payment, { foreignKey: "driverId", as: "driverPayments" });
Payment.belongsTo(User, { foreignKey: "driverId", as: "driver" });
Order.hasMany(Payment, { foreignKey: "orderId", as: "payments" });
Payment.belongsTo(Order, { foreignKey: "orderId", as: "order" });

export default Payment;
