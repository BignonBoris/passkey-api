import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";

class UserAddress extends Model {
  public id!: string;
  public userId!: string;
  public label!: string;
  public mapLabel!: string;
  public latitude!: number;
  public longitude!: number;
}

UserAddress.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "User",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    label: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    mapLabel: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    latitude: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    longitude: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "UserAddress",
    freezeTableName: true,
    indexes: [
      { fields: ["userId"] },
      { fields: ["label"] },
      { fields: ["mapLabel"] },
    ],
  }
);

User.hasMany(UserAddress, { foreignKey: "userId", as: "addresses" });
UserAddress.belongsTo(User, { foreignKey: "userId", as: "user" });

export default UserAddress;
