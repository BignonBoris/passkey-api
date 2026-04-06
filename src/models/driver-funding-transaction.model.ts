import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";

class DriverFundingTransaction extends Model {
  public id!: string;
  public driverId!: string;
  public amount!: number;
  public type!: string; // RECHARGE or USAGE
  public status!: string; // PENDING, COMPLETED, FAILED
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

DriverFundingTransaction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    driverId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM("RECHARGE", "USAGE"),
      defaultValue: "RECHARGE",
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("PENDING", "COMPLETED", "FAILED"),
      defaultValue: "COMPLETED",
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "DriverFundingTransaction",
    tableName: "DriverFundingTransaction",
    freezeTableName: true,
  }
);

User.hasMany(DriverFundingTransaction, { foreignKey: "driverId", as: "fundingTransactions" });
DriverFundingTransaction.belongsTo(User, { foreignKey: "driverId", as: "driver" });

export default DriverFundingTransaction;
