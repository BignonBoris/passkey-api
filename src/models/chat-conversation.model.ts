import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";
import Order from "./order.model";

class ChatConversation extends Model {
  public id!: string;
  public userId!: string;
  public driverId!: string;
  public orderId?: string | null;
  public lastMessage?: string | null;
  public lastMessageAt?: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ChatConversation.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: User, key: "id" },
    },
    driverId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: User, key: "id" },
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: Order, key: "id" },
    },
    lastMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "ChatConversation",
    tableName: "ChatConversation",
    freezeTableName: true,
    indexes: [
      {
        unique: true,
        fields: ["userId", "driverId"],
      },
      {
        fields: ["lastMessageAt"],
      },
    ],
  }
);

User.hasMany(ChatConversation, { foreignKey: "userId", as: "userConversations", constraints: false });
User.hasMany(ChatConversation, { foreignKey: "driverId", as: "driverConversations", constraints: false });
ChatConversation.belongsTo(User, { foreignKey: "userId", as: "user", constraints: false });
ChatConversation.belongsTo(User, { foreignKey: "driverId", as: "driver", constraints: false });
Order.hasMany(ChatConversation, { foreignKey: "orderId", as: "chatConversations", constraints: false });
ChatConversation.belongsTo(Order, { foreignKey: "orderId", as: "order", constraints: false });

export default ChatConversation;
