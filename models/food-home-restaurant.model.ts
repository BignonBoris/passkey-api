import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class FoodHomeRestaurant extends Model {
  public id!: string;
  public ownerUserId!: string | null;
  public name!: string;
  public description!: string;
  public categoryId!: string;
  public categoryLabel!: string;
  public rating!: number;
  public ratingCount!: number;
  public deliveryMinutes!: number;
  public deliveryFee!: number;
  public isOpen!: boolean;
  public isPopular!: boolean;
  public isRecommended!: boolean;
  public isNearby!: boolean;
  public imageUrl!: string;
  public accentColorHex!: string;
  public iconKey!: string;
  public tags!: string;
  public sortOrder!: number;
  public isActive!: boolean;
}

FoodHomeRestaurant.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    ownerUserId: {
      type: DataTypes.UUID,
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
    categoryId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    categoryLabel: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    rating: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    ratingCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    deliveryMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    deliveryFee: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    isOpen: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    isPopular: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isRecommended: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isNearby: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    imageUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    accentColorHex: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    iconKey: {
      type: DataTypes.STRING,
      allowNull: false,
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
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: "FoodHomeRestaurant",
    tableName: "FoodHomeRestaurant",
    freezeTableName: true,
  }
);

export default FoodHomeRestaurant;
