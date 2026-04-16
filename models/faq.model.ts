import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class Faq extends Model {
  public id!: string;
  public question!: string;
  public answer!: string;
  public status!: "ACTIVE" | "INACTIVE";
}

Faq.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    question: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    answer: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("ACTIVE", "INACTIVE"),
      allowNull: false,
      defaultValue: "ACTIVE",
    },
  },
  {
    sequelize,
    modelName: "Faq",
    tableName: "Faq",
    freezeTableName: true,
  }
);

export default Faq;
