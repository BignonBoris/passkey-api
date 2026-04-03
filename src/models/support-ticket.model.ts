import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";
import Order from "./order.model";

class SupportTicket extends Model {
  public id!: string;
  public userId?: string | null;
  public orderId?: string | null;
  public subject?: string | null;
  public status!: "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
  public priority!: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  public category?: string | null;
  public assignedTo?: string | null;
  public lastMessageAt?: Date | null;
}

SupportTicket.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: User, key: "id" },
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: Order, key: "id" },
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("OPEN", "PENDING", "RESOLVED", "CLOSED"),
      allowNull: false,
      defaultValue: "OPEN",
    },
    priority: {
      type: DataTypes.ENUM("LOW", "MEDIUM", "HIGH", "URGENT"),
      allowNull: false,
      defaultValue: "MEDIUM",
    },
    category: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    assignedTo: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: User, key: "id" },
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "SupportTicket",
    tableName: "SupportTicket",
    freezeTableName: true,
  }
);

User.hasMany(SupportTicket, { foreignKey: "userId", as: "supportTickets", constraints: false });
SupportTicket.belongsTo(User, { foreignKey: "userId", as: "user", constraints: false });
User.hasMany(SupportTicket, { foreignKey: "assignedTo", as: "assignedSupportTickets", constraints: false });
SupportTicket.belongsTo(User, { foreignKey: "assignedTo", as: "assignedAdmin", constraints: false });
Order.hasMany(SupportTicket, { foreignKey: "orderId", as: "supportTickets", constraints: false });
SupportTicket.belongsTo(Order, { foreignKey: "orderId", as: "order", constraints: false });

export default SupportTicket;
