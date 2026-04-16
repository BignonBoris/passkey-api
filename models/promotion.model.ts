import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class Promotion extends Model {
  public id!: string;
  public code!: string;
  public status!: "ACTIVE" | "INACTIVE" | "EXPIRED";
  public validFrom?: Date | null;
  public validTo?: Date | null;
  public usageLimit?: number | null;
  public usedCount!: number;
}

Promotion.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    status: {
      type: DataTypes.ENUM("ACTIVE", "INACTIVE", "EXPIRED"),
      allowNull: false,
      defaultValue: "ACTIVE",
    },
    validFrom: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    validTo: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    usageLimit: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    usedCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: "Promotion",
    tableName: "Promotion",
    freezeTableName: true,
  }
);

export default Promotion;
