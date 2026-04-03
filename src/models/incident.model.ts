import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import Order from "./order.model";
import User from "./user.model";

class Incident extends Model {
  public id!: string;
  public orderId?: string | null;
  public driverId?: string | null;
  public type!: string;
  public priority!: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  public status!: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  public resolvedAt?: Date | null;
}

Incident.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: Order, key: "id" },
    },
    driverId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: User, key: "id" },
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    priority: {
      type: DataTypes.ENUM("LOW", "MEDIUM", "HIGH", "CRITICAL"),
      allowNull: false,
      defaultValue: "MEDIUM",
    },
    status: {
      type: DataTypes.ENUM("OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"),
      allowNull: false,
      defaultValue: "OPEN",
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Incident",
    tableName: "Incident",
    freezeTableName: true,
  }
);

Order.hasMany(Incident, { foreignKey: "orderId", as: "incidents", constraints: false });
Incident.belongsTo(Order, { foreignKey: "orderId", as: "order", constraints: false });
User.hasMany(Incident, { foreignKey: "driverId", as: "driverIncidents", constraints: false });
Incident.belongsTo(User, { foreignKey: "driverId", as: "driver", constraints: false });

export default Incident;
