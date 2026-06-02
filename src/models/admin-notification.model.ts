import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";

export type AdminNotificationSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

class AdminNotification extends Model {
  public id!: string;
  public recipientId!: string;
  public actorId?: string | null;
  public category!: string;
  public severity!: AdminNotificationSeverity;
  public eventType!: string;
  public sourceModule!: string;
  public title!: string;
  public message!: string;
  public entityType?: string | null;
  public entityId?: string | null;
  public actionUrl?: string | null;
  public payloadJson?: string | null;
  public isRead!: boolean;
  public readAt?: Date | null;
  public deliveredAt!: Date;
}

AdminNotification.init(
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
    actorId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: User, key: "id" },
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "SYSTEM",
    },
    severity: {
      type: DataTypes.ENUM("INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"),
      allowNull: false,
      defaultValue: "MEDIUM",
    },
    eventType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sourceModule: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "SYSTEM",
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    entityType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    entityId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    actionUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    payloadJson: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: "AdminNotification",
    tableName: "AdminNotification",
    freezeTableName: true,
    indexes: [
      {
        fields: ["recipientId", "isRead", "createdAt"],
        name: "admin_notification_recipient_read_created_idx",
      },
      {
        fields: ["category", "severity", "createdAt"],
        name: "admin_notification_category_severity_created_idx",
      },
    ],
  }
);

User.hasMany(AdminNotification, { foreignKey: "recipientId", as: "adminNotifications" });
AdminNotification.belongsTo(User, { foreignKey: "recipientId", as: "recipient" });
User.hasMany(AdminNotification, { foreignKey: "actorId", as: "adminNotificationsAuthored" });
AdminNotification.belongsTo(User, { foreignKey: "actorId", as: "actor" });

export default AdminNotification;
