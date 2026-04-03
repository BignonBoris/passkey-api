import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import SupportTicket from "./support-ticket.model";
import User from "./user.model";

class SupportTicketMessage extends Model {
  public id!: string;
  public ticketId!: string;
  public senderId!: string;
  public senderRole!: "usager" | "livreur" | "admin" | "sous-admin";
  public message!: string;
}

SupportTicketMessage.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ticketId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: SupportTicket, key: "id" },
    },
    senderId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: User, key: "id" },
    },
    senderRole: {
      type: DataTypes.ENUM("usager", "livreur", "admin", "sous-admin"),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "SupportTicketMessage",
    tableName: "SupportTicketMessage",
    freezeTableName: true,
  }
);

SupportTicket.hasMany(SupportTicketMessage, { foreignKey: "ticketId", as: "messages", constraints: false });
SupportTicketMessage.belongsTo(SupportTicket, { foreignKey: "ticketId", as: "ticket", constraints: false });
User.hasMany(SupportTicketMessage, { foreignKey: "senderId", as: "supportMessagesSent", constraints: false });
SupportTicketMessage.belongsTo(User, { foreignKey: "senderId", as: "sender", constraints: false });

export default SupportTicketMessage;
