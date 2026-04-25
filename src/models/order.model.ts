import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import User from "./user.model";
import Country from "./country.model";
import { DEFAULT_COUNTRY_ID } from "../constants/countries";

class Order extends Model {
  public id!: string;
  public publicCode!: string;
  public countryId!: string;
  public userId!: string;
  public driverId?: string;
  public driverVehicleId?: string;
  public parentOrderId?: string | null;
  public returnOrderId?: string | null;
  public completionOtp!: string;
  public searchStartedAt!: Date;
  public paymentPromptDeadlineAt?: Date | null;
  public paymentCheckoutStartedAt?: Date | null;
  public paymentPromptAttemptCount!: number;
  public paymentCheckoutStatus?: string | null;
  public completionOtpValidatedAt?: Date | null;
  public pickupLocation!: string;
  public pickupAddress!: string;
  public destinationLocation!: string;
  public destinationAddress!: string;
  public deliveryPhone?: string | null;
  public distance!: string;
  public price!: number;
  public revenuePerDelivery!: number;
  public platformCommission!: number;
  public serviceFee!: number;
  public orderType!: string;
  public merchantId?: string | null;
  public merchantName?: string | null;
  public itemCount!: number;
  public foodOrderPayloadJson?: string | null;
  public flowType!: string;
  public returnContextJson?: string | null;
  public vehicleType!: string;
  public status!: string;
  public driverArrivedPickupAt?: Date | null;
  public driverLeftPickupAt?: Date | null;
  public waitingDurationSeconds!: number;
  public waitingBillableSeconds!: number;
  public waitingFee!: number;
  public cancelledAt?: Date | null;
  public cancelledBy?: string | null;
  public cancellationReason?: string | null;
  public cancelledAfterPickupAt?: Date | null;
  public cancellationFee!: number;
  public peakSurcharge!: number;
  public nightSurcharge!: number;
  public earlyMorningSurcharge!: number;
  public pricingSnapshotJson?: string | null;
  public parcelNature?: string | null;
  public packageDescription?: string | null;
  public packageSize?: string | null;
  public packageWeight?: string | null;
  public driverRating?: number | null;
  public driverRatingComment?: string | null;
  public driverRatedAt?: Date | null;
  public ratedByUserId?: string | null;
  public userRating?: number | null;
  public userRatingComment?: string | null;
  public userRatedAt?: Date | null;
  public ratedByDriverId?: string | null;
  public isArchived!: boolean;
  public searchFailureCount!: number;
  public driverSearchStatsJson?: string | null;
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
    publicCode: {
      type: DataTypes.STRING(32),
      allowNull: false,
      unique: true,
    },
    countryId: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: DEFAULT_COUNTRY_ID,
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
    parentOrderId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    returnOrderId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    completionOtp: {
      type: DataTypes.STRING(6),
      allowNull: false,
    },
    searchStartedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    paymentPromptDeadlineAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    paymentCheckoutStartedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    paymentPromptAttemptCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    paymentCheckoutStatus: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    completionOtpValidatedAt: {
      type: DataTypes.DATE,
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
    deliveryPhone: {
      type: DataTypes.STRING,
      allowNull: true,
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
    orderType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "mobility",
    },
    merchantId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    merchantName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    itemCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    foodOrderPayloadJson: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
    flowType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "STANDARD",
    },
    returnContextJson: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
    peakSurcharge: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    nightSurcharge: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    earlyMorningSurcharge: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    pricingSnapshotJson: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    },
    parcelNature: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    packageDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    packageSize: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    packageWeight: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    driverRating: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    driverRatingComment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    driverRatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    ratedByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: User, key: "id" },
    },
    userRating: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    userRatingComment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    userRatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    ratedByDriverId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: User, key: "id" },
    },
    vehicleType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(
        "PENDING",
        "ACCEPTED",
        "DRIVER_ASSIGNED",
        "DRIVER_ARRIVED_PICKUP",
        "DRIVER_LEFT_PICKUP",
        "PICKED_UP",
        "IN_TRANSIT",
        "COMPLETED",
        "NO_DRIVER_FOUND",
        "CANCELLED"
      ),
      defaultValue: "PENDING",
    },
    driverArrivedPickupAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    driverLeftPickupAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    waitingDurationSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    waitingBillableSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    waitingFee: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancelledBy: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    cancellationReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cancelledAfterPickupAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancellationFee: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    isArchived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    searchFailureCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    driverSearchStatsJson: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
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
Order.belongsTo(Country, { foreignKey: "countryId", as: "country" });

export default Order;
