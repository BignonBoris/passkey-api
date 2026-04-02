import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class FoodHomePromo extends Model {
  public id!: string;
  public title!: string;
  public subtitle!: string;
  public ctaLabel!: string;
  public imageUrl!: string;
  public primaryColorHex!: string;
  public secondaryColorHex!: string;
  public iconKey!: string;
  public sortOrder!: number;
  public isActive!: boolean;
}

FoodHomePromo.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    subtitle: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    ctaLabel: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    imageUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    primaryColorHex: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    secondaryColorHex: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    iconKey: {
      type: DataTypes.STRING,
      allowNull: false,
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
    modelName: "FoodHomePromo",
    tableName: "FoodHomePromo",
    freezeTableName: true,
  }
);

export default FoodHomePromo;
