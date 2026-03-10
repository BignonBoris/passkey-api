import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class StatusHistory extends Model {
  public id!: string;
  public userId!: string;
  public actorId?: string | null;
  public action!: string;
  public before!: Record<string, unknown> | null;
  public after!: Record<string, unknown> | null;
}

StatusHistory.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    actorId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    before: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    after: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "StatusHistory",
    freezeTableName: true,
    timestamps: true,
  }
);

export default StatusHistory;
