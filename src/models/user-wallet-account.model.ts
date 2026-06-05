import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";

class UserWalletAccount extends Model {
  public id!: string;
  public userId!: string;
  public balance!: number;
  public currency!: string;
  public status!: "ACTIVE" | "SUSPENDED" | "CLOSED";
  public lastTransactionAt!: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

UserWalletAccount.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: User,
        key: "id",
      },
    },
    balance: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: "XOF",
    },
    status: {
      type: DataTypes.ENUM("ACTIVE", "SUSPENDED", "CLOSED"),
      allowNull: false,
      defaultValue: "ACTIVE",
    },
    lastTransactionAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "UserWalletAccount",
    tableName: "UserWalletAccount",
    freezeTableName: true,
  }
);

User.hasOne(UserWalletAccount, { foreignKey: "userId", as: "walletAccount" });
UserWalletAccount.belongsTo(User, { foreignKey: "userId", as: "user" });

export default UserWalletAccount;
