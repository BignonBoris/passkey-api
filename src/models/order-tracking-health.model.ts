import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import Order from "./order.model";
import User from "./user.model";

class OrderTrackingHealth extends Model {
  public id!: string;
  public orderId!: string;
  public driverId!: string;
  public lastLocationAt?: Date | null;
  public lastHeartbeatAt?: Date | null;
  public lastLatitude?: number | null;
  public lastLongitude?: number | null;
  public gpsEnabled?: boolean | null;
  public locationPermission?: boolean | null;
  public socketConnected?: boolean | null;
  public appState?: string | null;
  public movementStatus!: "UNKNOWN" | "MOVING" | "STATIONARY";
  public stationarySince?: Date | null;
  public reasonCode?: string | null;
  public reasonLabel?: string | null;
  public metadataJson?: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

OrderTrackingHealth.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: Order, key: "id" },
      onDelete: "CASCADE",
    },
    driverId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: User, key: "id" },
      onDelete: "CASCADE",
    },
    lastLocationAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastHeartbeatAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastLatitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    lastLongitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    gpsEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    locationPermission: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    socketConnected: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    appState: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    movementStatus: {
      type: DataTypes.ENUM("UNKNOWN", "MOVING", "STATIONARY"),
      allowNull: false,
      defaultValue: "UNKNOWN",
    },
    stationarySince: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    reasonCode: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    reasonLabel: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    metadataJson: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "OrderTrackingHealth",
    tableName: "OrderTrackingHealth",
    freezeTableName: true,
    indexes: [
      {
        unique: true,
        fields: ["orderId"],
        name: "order_tracking_health_order_unique",
      },
      {
        fields: ["driverId"],
        name: "order_tracking_health_driver_idx",
      },
      {
        fields: ["lastHeartbeatAt"],
        name: "order_tracking_health_heartbeat_idx",
      },
    ],
  }
);

Order.hasOne(OrderTrackingHealth, { foreignKey: "orderId", as: "trackingHealth" });
OrderTrackingHealth.belongsTo(Order, { foreignKey: "orderId", as: "order" });
User.hasMany(OrderTrackingHealth, { foreignKey: "driverId", as: "trackingHealthEntries" });
OrderTrackingHealth.belongsTo(User, { foreignKey: "driverId", as: "driver" });

export default OrderTrackingHealth;
