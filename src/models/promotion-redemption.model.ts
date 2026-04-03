import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import Promotion from "./promotion.model";
import User from "./user.model";
import Order from "./order.model";

class PromotionRedemption extends Model {
  public id!: string;
  public promotionId!: string;
  public userId!: string;
  public orderId?: string | null;
  public amount!: number;
}

PromotionRedemption.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    promotionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: Promotion, key: "id" },
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: User, key: "id" },
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: Order, key: "id" },
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: "PromotionRedemption",
    tableName: "PromotionRedemption",
    freezeTableName: true,
  }
);

Promotion.hasMany(PromotionRedemption, { foreignKey: "promotionId", as: "redemptions", constraints: false });
PromotionRedemption.belongsTo(Promotion, { foreignKey: "promotionId", as: "promotion", constraints: false });
User.hasMany(PromotionRedemption, { foreignKey: "userId", as: "redemptions", constraints: false });
PromotionRedemption.belongsTo(User, { foreignKey: "userId", as: "user", constraints: false });
Order.hasMany(PromotionRedemption, { foreignKey: "orderId", as: "redemptions", constraints: false });
PromotionRedemption.belongsTo(Order, { foreignKey: "orderId", as: "order", constraints: false });

export default PromotionRedemption;
