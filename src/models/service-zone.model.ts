import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class ServiceZone extends Model {
  public id!: string;
  public name!: string;
  public city?: string | null;
  public status!: "ACTIVE" | "INACTIVE";
  public polygon?: Record<string, unknown> | null;
}

ServiceZone.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("ACTIVE", "INACTIVE"),
      allowNull: false,
      defaultValue: "ACTIVE",
    },
    polygon: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "ServiceZone",
    tableName: "ServiceZone",
    freezeTableName: true,
  }
);

export default ServiceZone;
