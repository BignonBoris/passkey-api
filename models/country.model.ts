import { DataTypes, Model } from "sequelize";
import { randomBytes } from 'crypto';
import sequelize from "../config/database";
import { DEFAULT_COUNTRY_ID } from "../constants/countries";

class Country extends Model {
  public id!: string;
  public code!: string;
  public iso2!: string;
  public iso3!: string;
  public name!: string;
  public phoneCode!: string;
  public currencyCode!: string;
  public minLatitude!: number | null;
  public maxLatitude!: number | null;
  public minLongitude!: number | null;
  public maxLongitude!: number | null;
  public centerLatitude!: number | null;
  public centerLongitude!: number | null;
  public isActive!: boolean;
  public isDefault!: boolean;
  public deliveryDistanceKm!: number;
  public driverLocationDistanceKm!: number;
}

Country.init(
  {
    id: {
      type: DataTypes.STRING(16),
      defaultValue: () => randomBytes(8).toString('hex'),
      primaryKey: true,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    iso2: {
      type: DataTypes.STRING(2),
      allowNull: false,
      unique: true,
    },
    iso3: {
      type: DataTypes.STRING(3),
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    phoneCode: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    currencyCode: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: "XOF",
    },
    minLatitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    maxLatitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    minLongitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    maxLongitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    centerLatitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    centerLongitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    deliveryDistanceKm: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 10,
    },
    driverLocationDistanceKm: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 2,
    },
  },
  {
    sequelize,
    modelName: "Country",
    tableName: "Country",
    freezeTableName: true,
  }
);

export default Country;
