import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { DEFAULT_COUNTRY_ID } from "../constants/countries";
import Country from "./country.model";

class DriverRevenueConfig extends Model {
  public id!: string;
  public countryId!: string;
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
    countryId: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: DEFAULT_COUNTRY_ID,
      references: { model: Country, key: "id" },
    },
    vehicleType: {
      type: DataTypes.STRING,
      allowNull: false,
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
    indexes: [
      {
        unique: true,
        fields: ["countryId", "vehicleType"],
        name: "driver_revenue_country_vehicle_unique",
      },
    ],
  }
);


Country.hasMany(DriverRevenueConfig, { foreignKey: "countryId", as: "revenueConfigs" });
DriverRevenueConfig.belongsTo(Country, { foreignKey: "countryId", as: "country" });

export default DriverRevenueConfig;
