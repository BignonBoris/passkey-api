import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class FoodHomeProduct extends Model {
  public id!: string;
  public restaurantId!: string;
  public categoryId!: string | null;
  public name!: string;
  public description!: string;
  public imageUrl!: string;
  public price!: number;
  public originalPrice!: number | null;
  public isAvailable!: boolean;
  public isPopular!: boolean;
  public isActive!: boolean;
  public tags!: string;
  public sortOrder!: number;
}

FoodHomeProduct.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    restaurantId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    categoryId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    imageUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    price: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    originalPrice: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    isAvailable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    isPopular: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    tags: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "[]",
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: "FoodHomeProduct",
    tableName: "FoodHomeProduct",
    freezeTableName: true,
  }
);

export default FoodHomeProduct;
