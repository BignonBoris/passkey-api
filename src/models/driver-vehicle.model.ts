import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";

class DriverVehicle extends Model {
  public id!: string;
  public driverId!: string;
  public type!: string;
  public plateNumber!: string;
  public brand?: string | null;
  public model?: string | null;
  public year?: number | null;
  public status!: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  public isPrimary!: boolean;
}

DriverVehicle.init(
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
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    plateNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    brand: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    model: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("ACTIVE", "INACTIVE", "SUSPENDED"),
      allowNull: false,
      defaultValue: "ACTIVE",
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: "DriverVehicle",
    tableName: "DriverVehicle",
    freezeTableName: true,
  }
);

User.hasMany(DriverVehicle, { foreignKey: "driverId", as: "vehicles" });
DriverVehicle.belongsTo(User, { foreignKey: "driverId", as: "driver" });

export default DriverVehicle;
