import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";

class KycRequest extends Model {
  public id!: string;
  public userId!: string;
  public type!: "KYC" | "KYB";
  public status!: "PENDING" | "APPROVED" | "REJECTED" | "REVIEW";
  public reason?: string | null;
  public submittedAt!: Date;
  public reviewedAt?: Date | null;
  public reviewedBy?: string | null;
}

KycRequest.init(
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
      type: DataTypes.ENUM("KYC", "KYB"),
      allowNull: false,
      defaultValue: "KYC",
    },
    status: {
      type: DataTypes.ENUM("PENDING", "APPROVED", "REJECTED", "REVIEW"),
      allowNull: false,
      defaultValue: "PENDING",
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    submittedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    reviewedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "KycRequest",
    tableName: "KycRequest",
    freezeTableName: true,
  }
);

User.hasMany(KycRequest, { foreignKey: "userId", as: "kycRequests", constraints: false });
KycRequest.belongsTo(User, { foreignKey: "userId", as: "user", constraints: false });

export default KycRequest;
