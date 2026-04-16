import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";
import Payment from "./payment.model";
import Order from "./order.model";

class RefundRequest extends Model {
  public id!: string;
  public paymentId!: string;
  public orderId!: string;
  public userId!: string;
  public amount!: number;
  public status!: "PENDING" | "APPROVED" | "REJECTED" | "PAID";
  public reason?: string | null;
  public processedBy?: string | null;
  public processedAt?: Date | null;
}

RefundRequest.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    paymentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: Payment, key: "id" },
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
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("PENDING", "APPROVED", "REJECTED", "PAID"),
      allowNull: false,
      defaultValue: "PENDING",
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    processedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "RefundRequest",
    tableName: "RefundRequest",
    freezeTableName: true,
  }
);

Payment.hasMany(RefundRequest, { foreignKey: "paymentId", as: "refunds" });
RefundRequest.belongsTo(Payment, { foreignKey: "paymentId", as: "payment" });
Order.hasMany(RefundRequest, { foreignKey: "orderId", as: "refunds" });
RefundRequest.belongsTo(Order, { foreignKey: "orderId", as: "order" });
User.hasMany(RefundRequest, { foreignKey: "userId", as: "refunds" });
RefundRequest.belongsTo(User, { foreignKey: "userId", as: "user" });

export default RefundRequest;
