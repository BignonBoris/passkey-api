import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";

class NotificationLog extends Model {
  public id!: string;
  public recipientId!: string;
  public channel!: "PUSH" | "SMS" | "EMAIL";
  public status!: "SENT" | "DELIVERED" | "FAILED" | "OPENED";
  public templateId?: string | null;
  public eventType?: string | null;
  public sentAt!: Date;
}

NotificationLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    recipientId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: User, key: "id" },
    },
    channel: {
      type: DataTypes.ENUM("PUSH", "SMS", "EMAIL"),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("SENT", "DELIVERED", "FAILED", "OPENED"),
      allowNull: false,
      defaultValue: "SENT",
    },
    templateId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    eventType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: "NotificationLog",
    tableName: "NotificationLog",
    freezeTableName: true,
  }
);

User.hasMany(NotificationLog, { foreignKey: "recipientId", as: "notifications", constraints: false });
NotificationLog.belongsTo(User, { foreignKey: "recipientId", as: "recipient", constraints: false });

export default NotificationLog;
