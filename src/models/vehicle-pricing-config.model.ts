import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { DEFAULT_COUNTRY_ID } from "@/constants/countries";
import Country from "./country.model";

class VehiclePricingConfig extends Model {
  public id!: string;
  public countryId!: string;
  public vehicleType!: string;
  public baseFare!: number;
  public perKmRate!: number;
  public perMinuteRate!: number;
  public bookingFee!: number;
  public minimumFare!: number;
}

VehiclePricingConfig.init(
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
    bookingFee: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    minimumFare: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: "VehiclePricingConfig",
    tableName: "VehiclePricingConfig",
    freezeTableName: true,
    indexes: [
      {
        unique: true,
        fields: ["countryId", "vehicleType"],
        name: "vehicle_pricing_country_vehicle_unique",
      },
    ],
  }
);


Country.hasMany(VehiclePricingConfig, { foreignKey: "countryId", as: "pricingConfigs", constraints: false });
VehiclePricingConfig.belongsTo(Country, { foreignKey: "countryId", as: "country", constraints: false });

export default VehiclePricingConfig;
