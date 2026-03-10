import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";

class Order extends Model {
  public id!: string;
  public userId!: string;
  public driverId?: string;
  public driverVehicleId?: string;
  public pickupLocation!: string;
  public pickupAddress!: string;
  public destinationLocation!: string;
  public destinationAddress!: string;
  public distance!: string;
  public price!: number;
  public revenuePerDelivery!: number;
  public platformCommission!: number;
  public serviceFee!: number;
  public vehicleType!: string;
  public status!: string;
  public isArchived!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Order.init(
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
      allowNull: true,
      references: { model: User, key: "id" },
    },
    driverVehicleId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    pickupLocation: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    pickupAddress: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    destinationLocation: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    destinationAddress: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    distance: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    price: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    revenuePerDelivery: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    platformCommission: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    serviceFee: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    vehicleType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("PENDING", "ACCEPTED", "COMPLETED", "CANCELLED"),
      defaultValue: "PENDING",
    },
    isArchived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: "Order",
    tableName: "Order",
    freezeTableName: true,
  }
);

User.hasMany(Order, { foreignKey: "userId", as: "clientOrders" });
Order.belongsTo(User, { foreignKey: "userId", as: "client" });
User.hasMany(Order, { foreignKey: "driverId", as: "driverOrders" });
Order.belongsTo(User, { foreignKey: "driverId", as: "driver" });

export default Order;
