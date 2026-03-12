import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

export enum PricingRuleType {
  WAITING = "WAITING",
  PEAK = "PEAK",
  NIGHT = "NIGHT",
  EARLY_MORNING = "EARLY_MORNING",
  CANCELLATION_BEFORE_ARRIVAL = "CANCELLATION_BEFORE_ARRIVAL",
  CANCELLATION_AFTER_ARRIVAL = "CANCELLATION_AFTER_ARRIVAL",
}

export enum PricingAdjustmentType {
  PERCENTAGE = "PERCENTAGE",
  FIXED = "FIXED",
  PER_MINUTE = "PER_MINUTE",
}

class PricingRule extends Model {
  public id!: string;
  public ruleType!: PricingRuleType;
  public name!: string;
  public daysOfWeek!: string | null;
  public startTime!: string | null;
  public endTime!: string | null;
  public adjustmentType!: PricingAdjustmentType;
  public adjustmentValue!: number;
  public freeMinutes!: number;
  public fixedFee!: number;
  public isActive!: boolean;
  public priority!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

PricingRule.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ruleType: {
      type: DataTypes.ENUM(
        "WAITING",
        "PEAK",
        "NIGHT",
        "EARLY_MORNING",
        "CANCELLATION_BEFORE_ARRIVAL",
        "CANCELLATION_AFTER_ARRIVAL"
      ),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    daysOfWeek: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    startTime: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    endTime: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    adjustmentType: {
      type: DataTypes.ENUM("PERCENTAGE", "FIXED", "PER_MINUTE"),
      allowNull: false,
    },
    adjustmentValue: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
    },
    freeMinutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    fixedFee: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: "PricingRule",
    tableName: "PricingRule",
    freezeTableName: true,
  }
);

export default PricingRule;
