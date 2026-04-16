import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";

class Payout extends Model {
  public id!: string;
  public driverId!: string;
  public amount!: number;
  public currency!: string;
  public status!: string;
  public requestedAt!: Date;
  public paidAt?: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Payout.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
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
      type: DataTypes.ENUM("PENDING", "PAID", "FAILED"),
      defaultValue: "PENDING",
    },
    requestedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Payout",
    tableName: "Payout",
    freezeTableName: true,
  }
);

User.hasMany(Payout, { foreignKey: "driverId", as: "payouts" });
Payout.belongsTo(User, { foreignKey: "driverId", as: "driver" });

export default Payout;
