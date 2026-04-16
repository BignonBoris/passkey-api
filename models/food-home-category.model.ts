import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class FoodHomeCategory extends Model {
  public id!: string;
  public restaurantId!: string | null;
  public name!: string;
  public iconKey!: string;
  public colorHex!: string;
  public sortOrder!: number;
  public isActive!: boolean;
}

FoodHomeCategory.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    restaurantId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    iconKey: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    colorHex: {
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
    modelName: "FoodHomeCategory",
    tableName: "FoodHomeCategory",
    freezeTableName: true,
  }
);

export default FoodHomeCategory;
