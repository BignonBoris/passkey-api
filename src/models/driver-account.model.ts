import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";

class DriverAccount extends Model {
  public id!: string;
  public userId!: string;
  public balance!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

DriverAccount.init(
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
  },
  {
    sequelize,
    modelName: "DriverAccount",
    tableName: "DriverAccount",
    freezeTableName: true,
  }
);

// Associations are usually defined in models or in a central place.
// Let's add them here for now, but we might need to update user.model.ts too.
User.hasOne(DriverAccount, { foreignKey: "userId", as: "account" });
DriverAccount.belongsTo(User, { foreignKey: "userId", as: "user" });

export default DriverAccount;
