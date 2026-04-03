import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import { DEFAULT_COUNTRY_ID } from "../constants/countries";

class VehicleType extends Model {
  public id!: string;
  public countryId!: string;
  public code!: string;
  public name!: string;
  public iconKey!: string;
  public sortOrder!: number;
  public isActive!: boolean;
}

VehicleType.init(
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
    code: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    iconKey: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "two_wheeler_rounded",
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: "VehicleType",
    tableName: "VehicleType",
    freezeTableName: true,
    indexes: [
      {
        unique: true,
        fields: ["countryId", "code"],
        name: "vehicle_type_country_code_unique",
      },
    ],
  }
);

export default VehicleType;
