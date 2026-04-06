import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";
import ChatConversation from "./chat-conversation.model";

class ChatMessage extends Model {
  public id!: string;
  public conversationId!: string;
  public senderId!: string;
  public recipientId!: string;
  public content!: string;
  public isRead!: boolean;
  public readAt?: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ChatMessage.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    conversationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: ChatConversation, key: "id" },
    },
    senderId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: User, key: "id" },
    },
    recipientId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: User, key: "id" },
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
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
  },
  {
    sequelize,
    modelName: "ChatMessage",
    tableName: "ChatMessage",
    freezeTableName: true,
    indexes: [
      {
        fields: ["conversationId", "createdAt"],
      },
      {
        fields: ["recipientId", "isRead"],
      },
    ],
  }
);

ChatConversation.hasMany(ChatMessage, { foreignKey: "conversationId", as: "messages" });
ChatMessage.belongsTo(ChatConversation, { foreignKey: "conversationId", as: "conversation" });
User.hasMany(ChatMessage, { foreignKey: "senderId", as: "sentMessages" });
User.hasMany(ChatMessage, { foreignKey: "recipientId", as: "receivedMessages" });
ChatMessage.belongsTo(User, { foreignKey: "senderId", as: "sender" });
ChatMessage.belongsTo(User, { foreignKey: "recipientId", as: "recipient" });

export default ChatMessage;
