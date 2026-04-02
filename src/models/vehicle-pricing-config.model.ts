import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { DEFAULT_COUNTRY_ID } from "../constants/countries";

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
      type: DataTypes.UUID,
      allowNull: false,
      defaultValue: DEFAULT_COUNTRY_ID,
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

export default VehiclePricingConfig;
