import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class SupportTicketCategory extends Model {
  public id!: string;
  public name!: string;
  public description?: string | null;
  public isActive!: boolean;
  public sortOrder!: number;
}

SupportTicketCategory.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: "SupportTicketCategory",
    tableName: "SupportTicketCategory",
    freezeTableName: true,
  }
);

export default SupportTicketCategory;
