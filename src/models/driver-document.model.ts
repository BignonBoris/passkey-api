import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";

class DriverDocument extends Model {
  public id!: string;
  public userId!: string;
  public type!: string;
  public status!: "PENDING" | "APPROVED" | "REJECTED";
  public url?: string | null;
  public rejectionReason?: string | null;
  public expiresAt?: Date | null;
  public verifiedAt?: Date | null;
  public verifiedBy?: string | null;
}

DriverDocument.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: User, key: "id" },
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("PENDING", "APPROVED", "REJECTED"),
      allowNull: false,
      defaultValue: "PENDING",
    },
    url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    verifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    verifiedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "DriverDocument",
    tableName: "DriverDocument",
    freezeTableName: true,
  }
);

User.hasMany(DriverDocument, { foreignKey: "userId", as: "driverDocuments" });
DriverDocument.belongsTo(User, { foreignKey: "userId", as: "driver" });

export default DriverDocument;
