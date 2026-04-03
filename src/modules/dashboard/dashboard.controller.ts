import { Request, Response } from "express";
import { Op } from "sequelize";

import sequelize from "../../config/database";
import User from "../../models/user.model";
import StatusHistory from "../../models/status-history.model";
import Order from "../../models/order.model";
import Payment from "../../models/payment.model";
import Payout from "../../models/payout.model";
import KycRequest from "../../models/kyc-request.model";
import DriverDocument from "../../models/driver-document.model";
import SupportTicket from "../../models/support-ticket.model";
import NotificationLog from "../../models/notification-log.model";
import RefundRequest from "../../models/refund-request.model";
import Promotion from "../../models/promotion.model";
import PromotionRedemption from "../../models/promotion-redemption.model";
import Incident from "../../models/incident.model";
import ServiceZone from "../../models/service-zone.model";

const TREND_WINDOW_DAYS = 7;

const formatDateKey = (date: Date) => date.toISOString().slice(0, 10);

const buildDateRange = (start: Date, days = TREND_WINDOW_DAYS) => {
  const range: string[] = [];
  for (let index = 0; index < days; index += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    range.push(formatDateKey(day));
  }
  return range;
};

const rowsToMap = (rows: Array<{ date: string; value: number | string | null }>) => {
  return rows.reduce<Map<string, number>>((acc, row) => {
    if (!row || !row.date) return acc;
    const numeric = Number(row.value ?? 0);
    acc.set(row.date, Number.isNaN(numeric) ? 0 : numeric);
    return acc;
  }, new Map());
};

export const getDashboardOverview = async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const onlineDriversCount = await User.count({
      where: {
        role: "livreur",
        isAvailable: true,
        isActive: true,
      },
    });

    const totalUsers = await User.count({ where: { role: "usager" } });
    const totalDrivers = await User.count({ where: { role: "livreur" } });
    const newUsersToday = await User.count({
      where: {
        role: "usager",
        createdAt: { [Op.gte]: startOfToday, [Op.lt]: startOfTomorrow },
      },
    });
    const newDriversToday = await User.count({
      where: {
        role: "livreur",
        createdAt: { [Op.gte]: startOfToday, [Op.lt]: startOfTomorrow },
      },
    });

    const suspendedUsers = await User.count({
      where: { role: "usager", accountStatus: "suspended" },
    });
    const suspendedDrivers = await User.count({
      where: { role: "livreur", accountStatus: "suspended" },
    });

    const unverifiedUsers = await User.count({
      where: { role: "usager", identityVerified: false },
    });
    const unverifiedDrivers = await User.count({
      where: { role: "livreur", identityVerified: false },
    });

    const activeUsers30d = await User.count({
      where: {
        role: "usager",
        updatedAt: { [Op.gte]: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      },
    });
    const activeDrivers7d = await User.count({
      where: {
        role: "livreur",
        updatedAt: { [Op.gte]: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
    });

    const identityVerifiedToday = await StatusHistory.count({
      where: {
        action: "IDENTITY_VERIFIED_CHANGE",
        createdAt: { [Op.gte]: startOfToday, [Op.lt]: startOfTomorrow },
      },
    });

    const ordersTotal = await Order.count();
    const ordersPending = await Order.count({ where: { status: "PENDING" } });
    const ordersAccepted = await Order.count({ where: { status: "ACCEPTED" } });
    const ordersCompleted = await Order.count({ where: { status: "COMPLETED" } });
    const ordersCancelled = await Order.count({ where: { status: "CANCELLED" } });
    const ordersToday = await Order.count({
      where: { createdAt: { [Op.gte]: startOfToday, [Op.lt]: startOfTomorrow } },
    });

    const paymentsToday = (await Payment.sum("amount", {
      where: {
        status: "PAID",
        paidAt: { [Op.gte]: startOfToday, [Op.lt]: startOfTomorrow },
      },
    })) as number | null;
    const paymentsFailedToday = await Payment.count({
      where: {
        status: "FAILED",
        createdAt: { [Op.gte]: startOfToday, [Op.lt]: startOfTomorrow },
      },
    });

    const payoutsPendingCount = await Payout.count({ where: { status: "PENDING" } });
    const payoutsPendingAmount = (await Payout.sum("amount", {
      where: { status: "PENDING" },
    })) as number | null;

    const refundPendingCount = await RefundRequest.count({ where: { status: "PENDING" } });
    const refundApprovedToday = await RefundRequest.count({
      where: {
        status: "APPROVED",
        processedAt: { [Op.gte]: startOfToday, [Op.lt]: startOfTomorrow },
      },
    });

    const kycPending = await KycRequest.count({ where: { status: "PENDING" } });
    const kycApprovedToday = await KycRequest.count({
      where: {
        status: "APPROVED",
        reviewedAt: { [Op.gte]: startOfToday, [Op.lt]: startOfTomorrow },
      },
    });
    const kycRejectedToday = await KycRequest.count({
      where: {
        status: "REJECTED",
        reviewedAt: { [Op.gte]: startOfToday, [Op.lt]: startOfTomorrow },
      },
    });

    const driverDocsPending = await DriverDocument.count({ where: { status: "PENDING" } });

    const ticketsOpen = await SupportTicket.count({ where: { status: "OPEN" } });
    const ticketsPending = await SupportTicket.count({ where: { status: "PENDING" } });
    const ticketsUrgent = await SupportTicket.count({ where: { priority: "URGENT" } });

    const notificationsSentToday = await NotificationLog.count({
      where: {
        status: "SENT",
        sentAt: { [Op.gte]: startOfToday, [Op.lt]: startOfTomorrow },
      },
    });
    const notificationsDeliveredToday = await NotificationLog.count({
      where: {
        status: "DELIVERED",
        sentAt: { [Op.gte]: startOfToday, [Op.lt]: startOfTomorrow },
      },
    });
    const notificationsFailedToday = await NotificationLog.count({
      where: {
        status: "FAILED",
        sentAt: { [Op.gte]: startOfToday, [Op.lt]: startOfTomorrow },
      },
    });

    const promotionsActive = await Promotion.count({ where: { status: "ACTIVE" } });
    const promotionsTotal = await Promotion.count();
    const redemptionsToday = await PromotionRedemption.count({
      where: { createdAt: { [Op.gte]: startOfToday, [Op.lt]: startOfTomorrow } },
    });

    const incidentsOpen = await Incident.count({ where: { status: "OPEN" } });
    const incidentsHigh = await Incident.count({
      where: { priority: { [Op.in]: ["HIGH", "CRITICAL"] } },
    });

    const zonesActive = await ServiceZone.count({ where: { status: "ACTIVE" } });
    const zonesInactive = await ServiceZone.count({ where: { status: "INACTIVE" } });

    return res.status(200).json({
      success: true,
      message: "Dashboard loaded",
      data: {
        onlineDriversCount,
        totalUsers,
        totalDrivers,
        newUsersToday,
        newDriversToday,
        suspendedUsers,
        suspendedDrivers,
        unverifiedUsers,
        unverifiedDrivers,
        activeUsers30d,
        activeDrivers7d,
        identityVerifiedToday,
        ordersTotal,
        ordersPending,
        ordersAccepted,
        ordersCompleted,
        ordersCancelled,
        ordersToday,
        paymentsToday: paymentsToday || 0,
        paymentsFailedToday,
        payoutsPendingCount,
        payoutsPendingAmount: payoutsPendingAmount || 0,
        refundPendingCount,
        refundApprovedToday,
        kycPending,
        kycApprovedToday,
        kycRejectedToday,
        driverDocsPending,
        ticketsOpen,
        ticketsPending,
        ticketsUrgent,
        notificationsSentToday,
        notificationsDeliveredToday,
        notificationsFailedToday,
        promotionsActive,
        promotionsTotal,
        redemptionsToday,
        incidentsOpen,
        incidentsHigh,
        zonesActive,
        zonesInactive,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard",
      data: {},
      error: error?.message,
    });
  }
};

export const getDashboardTrends = async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const rangeStart = new Date(startOfToday);
    rangeStart.setDate(rangeStart.getDate() - (TREND_WINDOW_DAYS - 1));

    const dateRange = buildDateRange(rangeStart, TREND_WINDOW_DAYS);

    const [
      newUsersRows,
      newDriversRows,
      ordersCreatedRows,
      ordersCompletedRows,
      revenueRows,
    ] = await Promise.all([
      User.findAll({
        attributes: [
          [sequelize.fn("DATE", sequelize.col("createdAt")), "date"],
          [sequelize.fn("COUNT", sequelize.col("id")), "value"],
        ],
        where: {
          role: "usager",
          createdAt: { [Op.gte]: rangeStart },
        },
        group: [sequelize.fn("DATE", sequelize.col("createdAt"))],
        order: [[sequelize.fn("DATE", sequelize.col("createdAt")), "ASC"]],
        raw: true,
      }),
      User.findAll({
        attributes: [
          [sequelize.fn("DATE", sequelize.col("createdAt")), "date"],
          [sequelize.fn("COUNT", sequelize.col("id")), "value"],
        ],
        where: {
          role: "livreur",
          createdAt: { [Op.gte]: rangeStart },
        },
        group: [sequelize.fn("DATE", sequelize.col("createdAt"))],
        order: [[sequelize.fn("DATE", sequelize.col("createdAt")), "ASC"]],
        raw: true,
      }),
      Order.findAll({
        attributes: [
          [sequelize.fn("DATE", sequelize.col("createdAt")), "date"],
          [sequelize.fn("COUNT", sequelize.col("id")), "value"],
        ],
        where: {
          createdAt: { [Op.gte]: rangeStart },
        },
        group: [sequelize.fn("DATE", sequelize.col("createdAt"))],
        order: [[sequelize.fn("DATE", sequelize.col("createdAt")), "ASC"]],
        raw: true,
      }),
      Order.findAll({
        attributes: [
          [sequelize.fn("DATE", sequelize.col("updatedAt")), "date"],
          [sequelize.fn("COUNT", sequelize.col("id")), "value"],
        ],
        where: {
          status: "COMPLETED",
          updatedAt: { [Op.gte]: rangeStart },
        },
        group: [sequelize.fn("DATE", sequelize.col("updatedAt"))],
        order: [[sequelize.fn("DATE", sequelize.col("updatedAt")), "ASC"]],
        raw: true,
      }),
      Payment.findAll({
        attributes: [
          [sequelize.fn("DATE", sequelize.col("paidAt")), "date"],
          [sequelize.fn("SUM", sequelize.col("amount")), "value"],
        ],
        where: {
          status: "PAID",
          paidAt: { [Op.gte]: rangeStart },
        },
        group: [sequelize.fn("DATE", sequelize.col("paidAt"))],
        order: [[sequelize.fn("DATE", sequelize.col("paidAt")), "ASC"]],
        raw: true,
      }),
    ]);

    const castEntries = <T extends { date: string; value: number | string | null }>(rows: unknown): T[] =>
      (rows as T[]) ?? [];

    const newUsersMap = rowsToMap(castEntries(newUsersRows));
    const newDriversMap = rowsToMap(castEntries(newDriversRows));
    const ordersCreatedMap = rowsToMap(castEntries(ordersCreatedRows));
    const ordersCompletedMap = rowsToMap(castEntries(ordersCompletedRows));
    const revenueMap = rowsToMap(castEntries(revenueRows));

    const daily = dateRange.map((date) => ({
      date,
      newUsers: newUsersMap.get(date) ?? 0,
      newDrivers: newDriversMap.get(date) ?? 0,
      ordersCreated: ordersCreatedMap.get(date) ?? 0,
      ordersCompleted: ordersCompletedMap.get(date) ?? 0,
      payments: revenueMap.get(date) ?? 0,
    }));

    return res.status(200).json({
      success: true,
      message: "Dashboard trends loaded",
      data: {
        daily,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard trends",
      data: { daily: [] },
      error: error?.message,
    });
  }
};
