import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class DriverRevenueConfig extends Model {
  public id!: string;
  public vehicleType!: string;
  public baseFare!: number;
  public perKmRate!: number;
  public perMinuteRate!: number;
  public commissionPercent!: number;
  public serviceFeePercent!: number;
}

DriverRevenueConfig.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    vehicleType: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    baseFare: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    perKmRate: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    perMinuteRate: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    commissionPercent: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 25,
    },
    serviceFeePercent: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 5,
    },
  },
  {
    sequelize,
    modelName: "DriverRevenueConfig",
    tableName: "DriverRevenueConfig",
    freezeTableName: true,
  }
);

export default DriverRevenueConfig;
