import { Request, Response } from 'express';
import {
  sendIncomingDriverCallNotification,
  sendNotificationToDriver,
  sendPushNotification,
  sendSmsNotification,
} from '../../services/notification.service';
import { Server } from 'socket.io';
import User from '../../models/user.model';
import { Op } from 'sequelize';
import Order from '../../models/order.model';
import UserAddress from '../../models/user-address.model';
import DriverVehicle from "../../models/driver-vehicle.model";
import DriverDocument from "../../models/driver-document.model";
import Payment from "../../models/payment.model";
import RefundRequest from "../../models/refund-request.model";
import { calculateDeliveryPricing, calculateWaitingFees } from "../../services/pricing.service";
import { calculateCancellationFees } from "../../services/cancellation.service";
import { resolveCountryId } from "../../services/country.service";
import sequelize from '../../config/database';
import Country from "../../models/country.model";
import { AuthenticatedRequest } from '../../types/auth-request';
import { getRouteDetails } from '../maps/maps.service';
import {
  beginOrderSearchAttempt,
  markOrderSearchAccepted,
  markOrderSearchFailed,
  SearchDriverSnapshot,
} from '../../services/order-search-stats.service';
import {
  confirmCancelAfterPickup,
  getCancelAfterPickupQuote,
} from "../../services/return-order.service";
import { SmsService } from "../../services/sms/sms.service";
import { nomalizeCustomerPhone } from "../../utils/phoneNormalize";
import { generateUniqueOrderPublicCode } from "../../utils/orderPublicCode";
import {
  paymentPromptWindowMs,
  shouldPromptPaymentAfterDriverAccept,
  shouldStartDriverSearchImmediatelyForPaymentMethod,
} from "./order-payment-flow.service";
import {
  getOrderTrackingHealthSnapshot,
  recordOrderTrackingHealthSnapshot,
} from "../../services/order-tracking-health.service";

const DELIVERY_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "DRIVER_ASSIGNED",
  "DRIVER_ARRIVED_PICKUP",
  "DRIVER_LEFT_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "COMPLETED",
  "NO_DRIVER_FOUND",
  "CANCELLED",
] as const;

const CANCELLATION_BLOCKING_STATUSES = [
  "DRIVER_LEFT_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "COMPLETED",
] as const;

const DELIVERY_TRACKING_STATUSES = [
  "DRIVER_LEFT_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
] as const;

const DRIVER_ACTIVE_ORDER_STATUSES = [
  "ACCEPTED",
  "DRIVER_ASSIGNED",
  "DRIVER_ARRIVED_PICKUP",
  "DRIVER_LEFT_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "IN_PROGRESS",
  "ONGOING",
  "ON_GOING",
] as const;

const ETA_CACHE_TTL_MS = 8000;
const APP_BASE_URL = String(process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
const SIMULATE_DRIVER_FOUND =
  String(process.env.SIMULATE_DRIVER_FOUND || "false").trim().toLowerCase() === "true";
const SIMULATE_DRIVER_FOUND_DELAY_MS = Math.max(
  1000,
  Number(process.env.SIMULATE_DRIVER_FOUND_DELAY_MS || 6000) || 6000,
);

type DeliveryEtaPayload = {
  remainingSeconds: number;
  remainingText: string;
  distanceMeters: number;
  distanceText: string;
  target: "DESTINATION";
  computedAt: string;
};

type DeliveryEtaCacheEntry = {
  computedAtMs: number;
  originKey: string;
  destinationKey: string;
  payload: DeliveryEtaPayload | null;
};

const deliveryEtaCache = new Map<string, DeliveryEtaCacheEntry>();

function extractNotifiedDriverIdsFromOrder(order: Order): string[] {
  const raw = order.get("driverSearchStatsJson");
  if (typeof raw !== "string" || !raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw) as {
      attempts?: Array<{
        notifiedDrivers?: Array<{ id?: string }>;
      }>;
    };
    const attempts = Array.isArray(parsed.attempts) ? parsed.attempts : [];
    const ids = new Set<string>();

    for (const attempt of attempts) {
      const drivers = Array.isArray(attempt?.notifiedDrivers)
        ? attempt.notifiedDrivers
        : [];
      for (const driver of drivers) {
        const id = String(driver?.id || "").trim();
        if (id) ids.add(id);
      }
    }

    return [...ids];
  } catch {
    return [];
  }
}

function emitCancelIncomingCall(
  io: Server,
  order: Order,
  payload: Record<string, unknown>,
) {
  io.to("drivers").emit("CANCEL_INCOMING_CALL", payload);

  for (const driverId of extractNotifiedDriverIdsFromOrder(order)) {
    io.to(`user_${driverId}`).emit("CANCEL_INCOMING_CALL", payload);
  }
}

function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return false;
  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0"
  ) {
    return true;
  }
  if (normalized.startsWith("10.") || normalized.startsWith("192.168.")) {
    return true;
  }
  const private172 = /^172\.(1[6-9]|2\d|3[0-1])\./;
  return private172.test(normalized);
}

function normalizePublicMediaUrl(rawValue: unknown): string {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";

  if (APP_BASE_URL) {
    if (raw.startsWith("/uploads/")) {
      return `${APP_BASE_URL}${raw}`;
    }

    if (raw.startsWith("uploads/")) {
      return `${APP_BASE_URL}/${raw}`;
    }

    try {
      const parsed = new URL(raw);
      if (parsed.pathname.startsWith("/uploads/") && isPrivateHost(parsed.hostname)) {
        return `${APP_BASE_URL}${parsed.pathname}${parsed.search}`;
      }
    } catch (_) {
      // Keep the original value when it's not a URL and not a known uploads path.
    }
  }

  return raw;
}

function generateCompletionOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizeOtp(value: unknown): string {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function normalizeDeliveryStatus(value: unknown): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "IN_PROGRESS" || normalized === "ONGOING" || normalized === "ON_GOING") {
    return "IN_TRANSIT";
  }
  if (normalized === "SEARCH_EXPIRED" || normalized === "NO_DRIVER" || normalized === "NO_DRIVER_AVAILABLE") {
    return "NO_DRIVER_FOUND";
  }
  return normalized;
}

function isDeliveryTrackingStatus(value: unknown): boolean {
  return DELIVERY_TRACKING_STATUSES.includes(
    normalizeDeliveryStatus(value) as (typeof DELIVERY_TRACKING_STATUSES)[number]
  );
}

async function getOrderPaymentSnapshot(orderId: string) {
  const payment = await resolveOrderDisplayPayment(orderId);

  return {
    payment,
    paymentMethod: String(payment?.get("method") || "CASH"),
    paymentStatus: String(payment?.get("status") || "PENDING"),
  };
}

function buildPaymentPromptPayload(order: Order | Record<string, unknown>) {
  const read = (key: string) =>
    order instanceof Order ? order.get(key) : (order as Record<string, unknown>)[key];

  return {
    paymentPromptDeadlineAt: read("paymentPromptDeadlineAt") || null,
    paymentCheckoutStartedAt: read("paymentCheckoutStartedAt") || null,
    paymentPromptAttemptCount: Number(read("paymentPromptAttemptCount") || 0),
    paymentCheckoutStatus: read("paymentCheckoutStatus") || null,
  };
}

async function resolveDriverMedia(params: {
  driverId?: string | null;
  driverVehicleId?: string | null;
}) {
  const driverId = String(params.driverId || "").trim();
  if (!driverId) {
    return { driverPhotoUrl: "", vehiclePhotoUrl: "" };
  }

  const where: Record<string, unknown> = { userId: driverId };
  const documents = await DriverDocument.findAll({
    where,
    raw: true,
  });

  const pickDocumentUrl = (type: string) =>
    String(
      documents
        .filter(
          (doc: any) =>
            String(doc.type || "").trim().toUpperCase() === type &&
            String(doc.url || "").trim() !== "",
        )
        .sort((a: any, b: any) => {
          const aApproved = String(a.status || "").trim().toUpperCase() === "APPROVED" ? 1 : 0;
          const bApproved = String(b.status || "").trim().toUpperCase() === "APPROVED" ? 1 : 0;
          if (aApproved !== bApproved) return bApproved - aApproved;
          const aTime = new Date(String(a.updatedAt || a.createdAt || 0)).getTime();
          const bTime = new Date(String(b.updatedAt || b.createdAt || 0)).getTime();
          return bTime - aTime;
        })[0]?.url || "",
    ).trim();

  return {
    driverPhotoUrl: normalizePublicMediaUrl(pickDocumentUrl("ID_PHOTO")),
    vehiclePhotoUrl: normalizePublicMediaUrl(pickDocumentUrl("VEHICLE_IMAGE")),
  };
}

async function buildTrackingDataForOrder(orderId: string) {
  const order = await Order.findByPk(orderId, { raw: true });
  if (!order) return null;

  let driver: Record<string, unknown> | null = null;
  let vehicle: Record<string, unknown> | null = null;

  if (order.driverId) {
    const vehicleWhere: Record<string, unknown> = { driverId: order.driverId };
    if (order.driverVehicleId) {
      vehicleWhere.id = order.driverVehicleId;
    }

    const [driverResult, vehicleResult, media] = await Promise.all([
      User.findByPk(order.driverId, { raw: true }),
      DriverVehicle.findOne({
        where: vehicleWhere,
        order: [["createdAt", "DESC"]],
        raw: true,
      }),
      resolveDriverMedia({
        driverId: String(order.driverId || ""),
        driverVehicleId: String(order.driverVehicleId || ""),
      }),
    ]);

    driver = driverResult
      ? ({
        ...(driverResult as unknown as Record<string, unknown>),
        photoUrl:
          media.driverPhotoUrl ||
          normalizePublicMediaUrl((driverResult as any).avatarUrl) ||
          "",
      } as Record<string, unknown>)
      : null;
    vehicle = buildDriverVehiclePayload(
      (vehicleResult as unknown as Record<string, unknown> | null) || null,
      media.vehiclePhotoUrl || "",
      String(order.vehicleType || "").trim()
    );
  }

  const [paymentSnapshot, trackingHealth] = await Promise.all([
    getOrderPaymentSnapshot(orderId),
    getOrderTrackingHealthSnapshot(orderId).catch(() => null),
  ]);
  const { paymentMethod, paymentStatus } = paymentSnapshot;
  const rawOrderPayload = order as unknown as Record<string, unknown>;
  const orderPayload = {
    ...rawOrderPayload,
    payment_method: paymentMethod,
    payment_status: paymentStatus,
    ...buildPaymentPromptPayload(rawOrderPayload),
    driverTrackingHealth: trackingHealth,
    driverHealth: trackingHealth,
  };
  const latitude = parseNumber(driver?.latitude ?? rawOrderPayload["driverLatitude"]);
  const longitude = parseNumber(driver?.longitude ?? rawOrderPayload["driverLongitude"]);
  const eta =
    latitude != null && longitude != null
      ? await buildDeliveryEtaPayload({
        orderId,
        order,
        latitude,
        longitude,
      })
      : null;

  return {
    order: orderPayload,
    driver: driver
      ? {
          ...driver,
          trackingHealth,
          health: trackingHealth,
        }
      : null,
    vehicle,
    eta,
  };
}

function buildDriverVehiclePayload(
  vehicle: Record<string, unknown> | null | undefined,
  mediaVehiclePhotoUrl: string,
  fallbackType?: string | null
) {
  const normalizedType =
    String(vehicle?.type || fallbackType || "").trim();

  return {
    ...((vehicle as Record<string, unknown> | undefined) || {}),
    type: normalizedType,
    name: normalizedType,
    brand: String(vehicle?.brand || "").trim(),
    model: String(vehicle?.model || "").trim(),
    plateNumber: String(vehicle?.plateNumber || "").trim(),
    year: vehicle?.year ?? null,
    photoUrl: mediaVehiclePhotoUrl || "",
  };
}

async function resolveOrderDisplayPayment(orderId: string) {
  const payments = await Payment.findAll({
    where: { orderId },
    order: [["createdAt", "DESC"]],
  });

  if (!payments.length) return null;

  const paidPayment = payments.find(
    (payment) => String(payment.get("status") || "").trim().toUpperCase() === "PAID"
  );
  if (paidPayment) return paidPayment;

  const paymentWithPaidAt = payments.find((payment) => payment.get("paidAt"));
  if (paymentWithPaidAt) return paymentWithPaidAt;

  return payments[0];
}

async function createRefundRequestForCancelledRemotePayment(params: {
  order: Order;
  cancelledBy: string;
  cancellationReason?: string | null;
}) {
  const orderId = String(params.order.get("id") || "").trim();
  if (!orderId) return { created: false };

  const payment = await resolveOrderDisplayPayment(orderId);
  if (!payment) return { created: false };

  const paymentId = String(payment.get("id") || "").trim();
  const userId = String(params.order.get("userId") || payment.get("userId") || "").trim();
  const paymentMethod = normalizePaymentMethod(payment.get("method"));
  const paymentStatus = String(payment.get("status") || "").trim().toUpperCase();
  const amount = Number(payment.get("amount") || params.order.get("price") || 0);

  if (!paymentId || !userId) return { created: false };
  if (!["MOBILE_MONEY", "CARD"].includes(paymentMethod) || paymentStatus !== "PAID") {
    return { created: false };
  }
  if (!Number.isFinite(amount) || amount <= 0) return { created: false };

  const existing = await RefundRequest.findOne({
    where: {
      paymentId,
      orderId,
      status: {
        [Op.in]: ["PENDING", "APPROVED", "PAID"],
      },
    },
  });
  if (existing) {
    return { created: false, refundRequest: existing };
  }

  const actor = String(params.cancelledBy || "").trim().toUpperCase() || "SYSTEM";
  const reasonParts = [
    "Demande de remboursement créée automatiquement après annulation d'une course payée.",
    `Origine: ${actor}.`,
  ];
  const cancellationReason = String(params.cancellationReason || "").trim();
  if (cancellationReason) {
    reasonParts.push(`Motif: ${cancellationReason}`);
  }

  const refundRequest = await RefundRequest.create({
    paymentId,
    orderId,
    userId,
    amount,
    reason: reasonParts.join(" ").trim(),
    status: "PENDING",
  });

  return { created: true, refundRequest };
}

async function notifyUserDeliveryStep(
  order: Order,
  params: { title: string; body: string; type: string; route?: string }
) {
  const user = await User.findByPk(String(order.get("userId") || ""));
  const userToken = String(user?.get("fcmToken") || "").trim();
  if (!userToken) return;

  await sendPushNotification(userToken, params.title, params.body, {
    type: params.type,
    orderId: String(order.get("id") || ""),
    driverId: String(order.get("driverId") || ""),
    status: String(order.get("status") || ""),
    route: params.route || "/app",
  });
}

async function notifyDriverDeliveryStep(
  driverId: string,
  params: { title: string; body: string; type: string; route?: string; orderId?: string },
) {
  const driver = await User.findByPk(driverId);
  const driverToken = String(driver?.get("fcmToken") || "").trim();
  if (!driverToken) return;

  await sendNotificationToDriver(driverToken, params.title, params.body, {
    type: params.type,
    orderId: String(params.orderId || "").trim(),
    status: "CANCELLED",
    route: params.route || "/delivery",
  });
}

function normalizeCancellationActor(value: unknown): "USER" | "DRIVER" | "ADMIN" | "SYSTEM" {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "ADMIN") return "ADMIN";
  if (normalized === "DRIVER") return "DRIVER";
  if (normalized === "SYSTEM") return "SYSTEM";
  return "USER";
}

function buildCancellationStatusMessage(actor: "USER" | "DRIVER" | "ADMIN" | "SYSTEM"): string {
  switch (actor) {
    case "ADMIN":
      return "Cette course a ete annulee par l'administration.";
    case "DRIVER":
      return "Le livreur a annule cette course.";
    case "SYSTEM":
      return "Cette course a ete annulee par le systeme.";
    default:
      return "Cette course a ete annulee par l'usager.";
  }
}

async function cancelOrderAndBroadcast(params: {
  order: Order;
  io: Server;
  cancelledBy: "USER" | "DRIVER" | "ADMIN" | "SYSTEM";
  cancellationReason?: string;
  waiveFees?: boolean;
}) {
  const { order, io, cancelledBy, waiveFees = false } = params;
  const reason = String(params.cancellationReason || "").trim();
  const orderId = String(order.get("id") || "").trim();
  const driverId = String(order.get("driverId") || "").trim();
  const userId = String(order.get("userId") || "").trim();

  const updatePayload: Record<string, unknown> = {
    status: "CANCELLED",
    cancelledAt: new Date(),
    cancelledBy,
    cancellationReason: reason || null,
  };
  if (waiveFees) {
    updatePayload.cancellationFee = 0;
  }

  await order.update(updatePayload);
  const refundResult = await createRefundRequestForCancelledRemotePayment({
    order,
    cancelledBy,
    cancellationReason: reason,
  });

  if (driverId) {
    await User.update({ isAvailable: true }, { where: { id: driverId } });
  }

  const payload = {
    orderId,
    status: "CANCELLED",
    driverId,
    cancelledBy,
    cancellationReason: reason,
    cancellationFee: waiveFees ? 0 : Number(order.get("cancellationFee") || 0),
  };

  io.to(`user_${userId}`).emit("order_status_changed", payload);
  io.to("rides").emit("ride:updated", {
    id: orderId,
    orderId,
    status: "CANCELLED",
    driverId,
    cancellationReason: reason,
  });
  emitCancelIncomingCall(io, order, {
    orderId,
    requestId: orderId,
    cancelledBy,
    cancellationReason: reason,
  });
  if (driverId) {
    io.to(`user_${driverId}`).emit("order_status_changed", payload);
  }

  const cancellationMessage = buildCancellationStatusMessage(cancelledBy);
  const reasonSuffix = reason ? ` Motif: ${reason}` : "";
  await notifyUserDeliveryStep(order, {
    title: "Course annulee",
    body: `${cancellationMessage}${reasonSuffix}`.trim(),
    type: "ORDER_CANCELLED",
    route: "/app",
  });
  if (driverId) {
    await notifyDriverDeliveryStep(driverId, {
      title: "Course annulee",
      body: `${cancellationMessage}${reasonSuffix}`.trim(),
      type: "ORDER_CANCELLED",
      route: "/delivery",
      orderId,
    });
  }

  return {
    refundRequestCreated: refundResult.created,
    refundRequestId: refundResult.refundRequest
      ? String(refundResult.refundRequest.get("id") || "").trim()
      : "",
  };
}

function parseLatLng(raw?: string): { lat: number; lng: number } | null {
  if (!raw) return null;
  const [latText, lngText] = raw.split(",").map((v) => v.trim());
  const lat = Number(latText);
  const lng = Number(lngText);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

function parseNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toLatLngString(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

async function buildDeliveryEtaPayload(params: {
  orderId: string;
  order: Record<string, any>;
  latitude: number;
  longitude: number;
}): Promise<DeliveryEtaPayload | null> {
  const { orderId, order, latitude, longitude } = params;

  if (!isDeliveryTrackingStatus(order.status)) {
    deliveryEtaCache.delete(orderId);
    return null;
  }

  const destinationRaw = String(order.destinationLocation || "").trim();
  const destination = parseLatLng(destinationRaw);
  if (!destination) {
    deliveryEtaCache.delete(orderId);
    return null;
  }

  const originKey = toLatLngString(latitude, longitude);
  const destinationKey = destinationRaw;
  const now = Date.now();
  const cached = deliveryEtaCache.get(orderId);

  if (
    cached &&
    cached.originKey == originKey &&
    cached.destinationKey == destinationKey &&
    now - cached.computedAtMs < ETA_CACHE_TTL_MS
  ) {
    return cached.payload;
  }

  const route = await getRouteDetails(
    `${latitude},${longitude}`,
    `${destination.lat},${destination.lng}`
  );

  const payload = route
    ? {
      remainingSeconds: Math.max(0, Number(route.durationValue) || 0),
      remainingText: String(route.durationText || "").trim(),
      distanceMeters: Math.max(0, Number(route.distanceValue) || 0),
      distanceText: String(route.distanceText || "").trim(),
      target: "DESTINATION" as const,
      computedAt: new Date().toISOString(),
    }
    : null;

  deliveryEtaCache.set(orderId, {
    computedAtMs: now,
    originKey,
    destinationKey,
    payload,
  });

  return payload;
}

function extractDistanceKm(distanceValue: unknown): number {
  if (typeof distanceValue === "number" && Number.isFinite(distanceValue)) {
    return Math.max(0, distanceValue);
  }
  if (typeof distanceValue === "string") {
    const normalized = distanceValue.replace(",", ".");
    const match = normalized.match(/(\d+(\.\d+)?)/);
    if (!match) return 0;
    const value = Number(match[1]);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  return 0;
}

function normalizePaymentMethod(value: unknown): "CASH" | "MOBILE_MONEY" | "CARD" {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "MOBILE_MONEY") return "MOBILE_MONEY";
  if (normalized === "CARD" || normalized === "STRIPE") return "CARD";
  return "CASH";
}

function normalizeRatingValue(value: unknown): number | null {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return null;
  if (rating < 1 || rating > 5) return null;
  return Math.round(rating * 100) / 100;
}

function resolveParcelNature(input: Record<string, unknown>): string {
  return String(
    input.parcelNature ??
    input.packageNature ??
    input.packageDescription ??
    ""
  ).trim();
}

function resolvePackageDescription(
  input: Record<string, unknown>,
  fallbackParcelNature = "",
): string {
  return String(
    input.packageDescription ??
    input.parcelNature ??
    input.packageNature ??
    fallbackParcelNature ??
    "",
  ).trim();
}

function resolvePackageSize(input: Record<string, unknown>): string {
  return String(
    input.packageSize ??
    input.package_size ??
    input.parcelSize ??
    input.parcel_size ??
    "",
  ).trim();
}

function resolvePackageWeight(input: Record<string, unknown>): string {
  return String(
    input.packageWeight ??
    input.package_weight ??
    input.parcelWeight ??
    input.parcel_weight ??
    "",
  ).trim();
}

function resolveDeliveryPhone(input: Record<string, unknown>): string {
  return String(
    input.deliveryPhone ??
    input.delivery_phone ??
    input.receiverPhone ??
    input.receiver_phone ??
    input.destinationPhone ??
    ""
  ).trim();
}

async function normalizeOrderPhoneIfPossible(phone: string): Promise<string> {
  const rawPhone = String(phone || "").trim();
  if (!rawPhone) return "";
  const normalizedPhone = await nomalizeCustomerPhone(rawPhone);
  if (!normalizedPhone || normalizedPhone === "INVALID_PHONE") {
    return rawPhone;
  }
  return normalizedPhone;
}

async function sendCompletionOtpSmsIfPossible(params: {
  phone: string;
  otp: string;
  parcelNature?: string;
}) {
  const phone = params.phone.trim();
  const otp = params.otp.trim();
  if (!phone || !otp) return;

  const parcelLabel = params.parcelNature?.trim();
  const message = parcelLabel
    ? `Code OTP PassKey: ${otp}. Communiquez ce code a la livraison du colis "${parcelLabel}".`
    : `Code OTP PassKey: ${otp}. Communiquez ce code a la livraison de votre colis.`;

  await sendSmsNotification(phone, message);
}

async function sendAcceptedOrderOtpSmsIfPossible(params: {
  phone: string;
  otp: string;
  parcelNature?: string;
}) {
  const phone = params.phone.trim();
  const otp = params.otp.trim();
  if (!phone || !otp) return;

  const parcelLabel = params.parcelNature?.trim();
  const message = parcelLabel
    ? `PassKey: votre livraison a ete prise en charge. Le code OTP de remise est ${otp} pour le colis "${parcelLabel}".`
    : `PassKey: votre livraison a ete prise en charge. Le code OTP de remise est ${otp}.`;

  await SmsService.sendSmsViaTwilio(phone, message);
}

async function getDriverSearchRadiusKm(countryId?: string | null): Promise<number> {
  try {
    const resolvedCountryId = await resolveCountryId(countryId || "");
    const country = await Country.findByPk(resolvedCountryId);
    if (!country) return 5;
    const radius = Number(country.get("driverLocationDistanceKm"));
    return Number.isFinite(radius) && radius > 0 ? radius : 5;
  } catch {
    return 5;
  }
}

function shouldSimulateDriverFound() {
  return SIMULATE_DRIVER_FOUND && String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production";
}

async function findSimulatedDriverCandidate() {
  return User.findOne({
    where: {
      role: "livreur",
      isActive: true,
      identityVerified: true,
      accountStatus: "active",
    },
    order: [["isAvailable", "DESC"], ["createdAt", "ASC"]],
  });
}

async function acceptOrderWithDriver(params: {
  orderId: string;
  driverId: string;
  io: Server;
}) {
  const orderId = String(params.orderId || "").trim();
  const driverId = String(params.driverId || "").trim();
  if (!orderId || !driverId) {
    return { success: false, message: "orderId et driverId sont requis." };
  }

  const existingOrder = await Order.findByPk(orderId);
  if (!existingOrder) {
    return { success: false, message: "Course introuvable." };
  }

  const activeOrder = await findActiveOrderForDriver(driverId, orderId);
  if (activeOrder) {
    return {
      success: false,
      message: "Vous avez déjà une livraison en cours. Terminez-la avant d'accepter une nouvelle course.",
    };
  }

  const paymentSnapshot = await getOrderPaymentSnapshot(orderId);
  const paymentMethod = String(paymentSnapshot.paymentMethod || "CASH")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  const paymentStatus = String(paymentSnapshot.paymentStatus || "PENDING")
    .trim()
    .toUpperCase();
  const paymentCheckoutStatus = String(
    existingOrder.get("paymentCheckoutStatus") || "",
  )
    .trim()
    .toUpperCase();
  const hasConfirmedRemotePayment =
    ["MOBILE_MONEY", "CARD"].includes(paymentMethod) &&
    paymentCheckoutStatus === "PAID";
  const effectivePaymentStatus = hasConfirmedRemotePayment
    ? "PAID"
    : paymentStatus;
  const shouldAwaitRemotePayment = shouldPromptPaymentAfterDriverAccept({
    paymentMethod,
    paymentStatus: effectivePaymentStatus,
  });
  const paymentPromptDeadlineAt = shouldAwaitRemotePayment
    ? new Date(Date.now() + paymentPromptWindowMs)
    : null;
  let activeVehicle: Record<string, unknown> | null = null;
  try {
    activeVehicle = await DriverVehicle.findOne({
      where: { driverId },
      order: [["isPrimary", "DESC"], ["createdAt", "DESC"]],
      raw: true,
    }) as unknown as Record<string, unknown> | null;
  } catch (e) {}
  const driverVehicleId = String(activeVehicle?.id || "").trim() || null;

  const [affectedCount] = await Order.update(
    {
      driverId,
      driverVehicleId,
      status: "ACCEPTED",
      paymentPromptDeadlineAt,
      paymentCheckoutStartedAt: null,
      paymentPromptAttemptCount: shouldAwaitRemotePayment ? 1 : 0,
      paymentCheckoutStatus: shouldAwaitRemotePayment
        ? "AWAITING_ACTION"
        : hasConfirmedRemotePayment
          ? "PAID"
          : null,
    },
    { where: { id: orderId, status: "PENDING" } }
  );

  if (affectedCount === 0) {
    return { success: false, message: "Course deja assignee ou annulee." };
  }

  const order = await Order.findByPk(orderId);
  if (!order) return { success: false, message: "Course introuvable." };

  await User.update({ isAvailable: false }, { where: { id: driverId } });
  const [driverResult, media] = await Promise.all([
    User.findByPk(driverId),
    resolveDriverMedia({ driverId, driverVehicleId }),
  ]);
  const driver = driverResult
    ? (driverResult.get({ plain: true }) as Record<string, unknown>)
    : null;

  if (!driver) return { success: false, message: "Livreur introuvable." };
  await markOrderSearchAccepted(orderId, {
    id: String(driver?.id || driverId || "").trim(),
    name: String(driver?.name || "").trim(),
    phone: String(driver?.phone || "").trim(),
  });

  void recordOrderTrackingHealthSnapshot({
    orderId,
    driverId,
    latitude: driver?.latitude,
    longitude: driver?.longitude,
    socketConnected: true,
    appState: "ACCEPTED",
    metadata: {
      source: "ORDER_ACCEPTED",
    },
  }).catch(() => null);

  const vehicle = activeVehicle;

  const userId = order.get("userId");

  params.io.to(`user_${userId}`).emit("order_status_changed", {
    orderId,
    publicCode: String(order.get("publicCode") || ""),
    status: "ACCEPTED",
    driverId,
    driver: {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      latitude: driver.latitude,
      longitude: driver.longitude,
      rating: Number(driver.rating || 0),
      photoUrl:
        media.driverPhotoUrl ||
        normalizePublicMediaUrl(String(driver.avatarUrl || "")),
      coursesCount: Number(driver.deliveryCount || 0),
      fcmToken: driver.fcmToken,
    },
    vehicle: buildDriverVehiclePayload(
      (vehicle as unknown as Record<string, unknown> | undefined) || null,
      media.vehiclePhotoUrl || "",
      String(order.get("vehicleType") || "").trim()
    ),
    completionOtp: order.get("completionOtp"),
    payment_method: paymentMethod,
    payment_status: effectivePaymentStatus,
    paymentPromptDeadlineAt,
    paymentCheckoutStartedAt: null,
    paymentPromptAttemptCount: shouldAwaitRemotePayment ? 1 : 0,
    paymentCheckoutStatus: shouldAwaitRemotePayment
      ? "AWAITING_ACTION"
      : hasConfirmedRemotePayment
        ? "PAID"
        : null,
  });

  params.io.to(`user_${driverId}`).emit("order_status_changed", {
    orderId,
    publicCode: String(order.get("publicCode") || ""),
    status: "ACCEPTED",
    payment_method: paymentMethod,
    payment_status: effectivePaymentStatus,
    paymentPromptDeadlineAt,
    paymentCheckoutStartedAt: null,
    paymentPromptAttemptCount: shouldAwaitRemotePayment ? 1 : 0,
    paymentCheckoutStatus: shouldAwaitRemotePayment
      ? "AWAITING_ACTION"
      : hasConfirmedRemotePayment
        ? "PAID"
        : null,
  });

  params.io.to("rides").emit("ride:updated", {
    id: orderId,
    orderId,
    status: "ACCEPTED",
    driverId,
    publicCode: String(order.get("publicCode") || ""),
    updatedAt: new Date().toISOString(),
  });

  emitCancelIncomingCall(params.io, order, {
    orderId,
    requestId: orderId,
    acceptedByDriverId: driverId,
  });

  await notifyUserDeliveryStep(order, {
    title: "Livreur trouve",
    body: "Votre chauffeur a accepte la course et se dirige vers vous.",
    type: "DRIVER_ACCEPTED",
    route: "/app",
  });

  try {
    const smsPayload = {
      phone: String(order.get("deliveryPhone") || "").trim(),
      otp: String(order.get("completionOtp") || "").trim(),
      parcelNature: String(
        order.get("parcelNature") || order.get("packageDescription") || "",
      ).trim(),
    };
    await sendAcceptedOrderOtpSmsIfPossible(smsPayload);
  } catch (smsError) {
    console.error("acceptOrderWithDriver OTP SMS failed", smsError);
  }

  return { success: true };
}

function scheduleSimulatedDriverFound(params: {
  orderId: string;
  driverId: string;
  io: Server;
}) {
  setTimeout(async () => {
    try {
      const order = await Order.findByPk(params.orderId);
      if (!order) return;
      const currentStatus = String(order.get("status") || "").trim().toUpperCase();
      if (currentStatus !== "PENDING") return;

      const result = await acceptOrderWithDriver(params);
      if (!result.success) {
        console.warn("[simulate-driver-found] acceptance skipped:", result.message);
      }
    } catch (error) {
      console.error("[simulate-driver-found] failed", error);
    }
  }, SIMULATE_DRIVER_FOUND_DELAY_MS);
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isTruthyAvailability(value: unknown): boolean {
  return (
    value === true ||
    value === 1 ||
    String(value || "").trim().toLowerCase() === "true" ||
    String(value || "").trim() === "1"
  );
}

async function findActiveOrderForDriver(driverId: string, excludedOrderId?: string) {
  const normalizedDriverId = String(driverId || "").trim();
  if (!normalizedDriverId) return null;

  const where: Record<string, unknown> = {
    driverId: normalizedDriverId,
    status: {
      [Op.in]: [...DRIVER_ACTIVE_ORDER_STATUSES],
    } as any,
  };

  const normalizedExcludedOrderId = String(excludedOrderId || "").trim();
  if (normalizedExcludedOrderId) {
    where.id = { [Op.ne]: normalizedExcludedOrderId } as any;
  }

  return Order.findOne({
    where: where as any,
    raw: true,
  });
}

function hasUsableFcmToken(value: unknown): boolean {
  const token = String(value || "").trim();
  return token !== "" && token !== "null" && token !== "undefined";
}

async function buildDriverDeliveryRequestPayload(order: Order, paymentRow: any) {
  const orderId = String(order.get('id') || '').trim();
  const userId = String(order.get('userId') || '').trim();
  const pickupCoords = parseLatLng(String(order.get('pickupLocation') || ''));
  const destinationCoords = parseLatLng(String(order.get('destinationLocation') || ''));
  const customer = userId ? await User.findByPk(userId) : null;
  const rawSearchStartedAt = order.get('searchStartedAt') || new Date();
  const searchStartedAtIso = new Date(String(rawSearchStartedAt)).toISOString();
  return {
    type: "NEW_DELIVERY_REQUEST",
    requestId: orderId,
    orderId,
    publicCode: String(order.get('publicCode') || ''),
    id: orderId,
    order: orderId,
    callerId: userId,
    customerId: userId,
    userId,
    pickupAddress: String(order.get('pickupAddress') || ''),
    deliveryAddress: String(order.get('destinationAddress') || ''),
    destinationAddress: String(order.get('destinationAddress') || ''),
    price: String(order.get('price') || ''),
    distance: String(order.get('distance') || ''),
    vehicleType: String(order.get('vehicleType') || ''),
    vehicleName: String(order.get('vehicleType') || ''),
    pickupLocation: String(order.get('pickupLocation') || ''),
    destinationLocation: String(order.get('destinationLocation') || ''),
    pickupLat: pickupCoords ? String(pickupCoords.lat) : '',
    pickupLng: pickupCoords ? String(pickupCoords.lng) : '',
    destinationLat: destinationCoords ? String(destinationCoords.lat) : '',
    destinationLng: destinationCoords ? String(destinationCoords.lng) : '',
    payment_method: String(paymentRow?.get("method") || "CASH"),
    payment_status: String(paymentRow?.get("status") || "PENDING"),
    paymentMethod: String(paymentRow?.get("method") || "CASH"),
    paymentStatus: String(paymentRow?.get("status") || "PENDING"),
    parcel_nature: String(order.get('parcelNature') || order.get('packageDescription') || ''),
    parcelNature: String(order.get('parcelNature') || order.get('packageDescription') || ''),
    packageNature: String(order.get('parcelNature') || order.get('packageDescription') || ''),
    packageDescription: String(order.get('packageDescription') || order.get('parcelNature') || ''),
    packageSize: String(order.get('packageSize') || ''),
    packageWeight: String(order.get('packageWeight') || ''),
    customerName: String(customer?.get('name') || 'Client PassKey'),
    customerPhone: String(customer?.get('phone') || ''),
    customerRating: String(Number(customer?.get('rating') || 0)),
    user_name: String(customer?.get('name') || 'Client PassKey'),
    user_phone: String(customer?.get('phone') || ''),
    user_rating: String(Number(customer?.get('rating') || 0)),
    status: String(order.get('status') || 'PENDING'),
    createdAt: searchStartedAtIso,
    timestamp: searchStartedAtIso,
    searchStartedAt: searchStartedAtIso,
  };
}

async function notifyNearbyDrivers(order: Order, io: Server, pricing: any, paymentRow: any) {
  const pickup = parseLatLng(String(order.get('pickupLocation')));
  if (!pickup) return;

  const radiusKm = await getDriverSearchRadiusKm(
    String(order.get("countryId") || "").trim(),
  );
  console.log(`\n[RECHERCHE LIVREURS] Commande ID: ${order.get('id')}`);
  console.log(` - Point de ramassage: ${order.get('pickupLocation')} (${order.get('pickupAddress')})`);
  console.log(` - Rayon de recherche configuré: ${radiusKm} km`);

  if (shouldSimulateDriverFound()) {
    const simulatedDriver = await findSimulatedDriverCandidate();
    if (simulatedDriver) {
      const driverId = String(simulatedDriver.get("id") || "").trim();
      const snapshot: SearchDriverSnapshot = {
        id: driverId,
        name: String(simulatedDriver.get("name") || "Livreur").trim(),
        phone: String(simulatedDriver.get("phone") || "").trim(),
      };
      await beginOrderSearchAttempt(String(order.get("id") || ""), [snapshot]);

      const latitude =
        simulatedDriver.get("latitude") != null
          ? Number(simulatedDriver.get("latitude"))
          : Number((pickup.lat + 0.002).toFixed(6));
      const longitude =
        simulatedDriver.get("longitude") != null
          ? Number(simulatedDriver.get("longitude"))
          : Number((pickup.lng + 0.002).toFixed(6));

      scheduleSimulatedDriverFound({
        orderId: String(order.get("id") || "").trim(),
        driverId,
        io,
      });

      return {
        radiusKm,
        notifiedDrivers: [
          {
            id: driverId,
            name: snapshot.name,
            phone: snapshot.phone,
            latitude,
            longitude,
          },
        ],
      };
    }
  }

  const drivers = await User.findAll({
    where: {
      role: 'livreur',
      isActive: true,
      isAvailable: true,
      identityVerified: true,
      accountStatus: 'active',
      fcmToken: { [Op.ne]: null }
    }
  });

  console.log(` - ${drivers.length} livreurs actifs, disponibles et vérifiés trouvés en base.`);

  const nearbyDrivers = drivers.filter(d => {
    if (!isTruthyAvailability(d.get('isAvailable'))) return false;

    if (d.get('latitude') == null || d.get('longitude') == null) return false;
    const dist = (d.get('latitude') != null && d.get('longitude') != null)
      ? calculateDistance(pickup.lat, pickup.lng, Number(d.get('latitude')), Number(d.get('longitude')))
      : 0;

    const isNearby = dist <= radiusKm;

    if (isNearby) {
      console.log(`   -> Livreur [${d.get('id')}] ${d.get('name') ?? 'N/A'} (${d.get('phone')}): SÉLECTIONNÉ (dist: ${dist.toFixed(2)} km, rayon: ${radiusKm} km)`);
    }
    return isNearby;
  });

  console.log(`[RÉSULTAT] ${nearbyDrivers.length} livreurs vont recevoir l'appel de course.\n`);

  const driverSnapshots: SearchDriverSnapshot[] = nearbyDrivers.map((driver) => ({
    id: String(driver.get('id') || '').trim(),
    name: String(driver.get('name') || 'Livreur').trim(),
    phone: String(driver.get('phone') || '').trim(),
  }));
  const notifiedDrivers = nearbyDrivers.map((driver) => ({
    id: String(driver.get('id') || '').trim(),
    name: String(driver.get('name') || 'Livreur').trim(),
    phone: String(driver.get('phone') || '').trim(),
    latitude:
      driver.get('latitude') != null ? Number(driver.get('latitude')) : null,
    longitude:
      driver.get('longitude') != null ? Number(driver.get('longitude')) : null,
  }));
  await beginOrderSearchAttempt(String(order.get('id') || ''), driverSnapshots);

  const deliveryRequestPayload = await buildDriverDeliveryRequestPayload(order, paymentRow);

  const pushPromises = nearbyDrivers.map(d => {
    const driverId = String(d.get('id') || '').trim();
    const fcmToken = String(d.get('fcmToken') || '').trim();
    if (!driverId) return Promise.resolve();

    io.to(`user_${driverId}`).emit('new_delivery_request', deliveryRequestPayload);
    io.to(`user_${driverId}`).emit('new_ride_request', deliveryRequestPayload);

    if (!hasUsableFcmToken(fcmToken)) {
      return Promise.resolve();
    }

    return sendIncomingDriverCallNotification(
      fcmToken,
      deliveryRequestPayload
    );
  });

  await Promise.all(pushPromises);
  return {
    radiusKm,
    notifiedDrivers,
  };
}

export async function startDriverSearchForOrder(params: {
  order: Order;
  io: Server;
  paymentRow: any;
  pricing?: any;
}) {
  const result = await notifyNearbyDrivers(
    params.order,
    params.io,
    params.pricing ?? null,
    params.paymentRow,
  );
  const orderId = String(params.order.get("id") || "").trim();
  params.io.to("rides").emit("ride:search_started", {
    id: orderId,
    orderId,
    publicCode: String(params.order.get("publicCode") || "").trim(),
    status: String(params.order.get("status") || "PENDING"),
    searchStartedAt: String(params.order.get("searchStartedAt") || new Date().toISOString()),
    radiusKm: result?.radiusKm ?? null,
    notifiedDriversCount: Array.isArray(result?.notifiedDrivers) ? result.notifiedDrivers.length : 0,
    updatedAt: new Date().toISOString(),
  });
  return result;
}

export const createOrder = async (req: Request, res: Response) => {
  console.log('[DEBUG] createOrder');
  try {
    const { userId, pickupLocation, destinationLocation, pickupAddress, destinationAddress, vehicleId, distance, durationMinutes, extras, tip, pickupTimestamp, simulationMode } = req.body;
    const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);
    const parcelNature = resolveParcelNature(req.body || {});
    const packageDescription = resolvePackageDescription(req.body || {}, parcelNature);
    const packageSize = resolvePackageSize(req.body || {});
    const packageWeight = resolvePackageWeight(req.body || {});
    const deliveryPhone = await normalizeOrderPhoneIfPossible(
      resolveDeliveryPhone(req.body || {}),
    );
    const countryId = await resolveCountryId(req.body?.countryId || "");
    const pricing = await calculateDeliveryPricing({
      vehicleType: vehicleId,
      countryId,
      distanceKm: extractDistanceKm(distance),
      durationMinutes: parseNumber(durationMinutes) ?? 0,
      extras: parseNumber(extras) ?? 0,
      tip: parseNumber(tip) ?? 0,
      pickupTimestamp,
    });
    const newOrder = await Order.create({
      publicCode: await generateUniqueOrderPublicCode("CRS"),
      countryId,
      userId, pickupLocation, pickupAddress, destinationLocation, destinationAddress,
      price: pricing.price, distance, revenuePerDelivery: pricing.driverEarnings,
      platformCommission: pricing.platformCommission, serviceFee: pricing.serviceFee,
      completionOtp: generateCompletionOtp(), vehicleType: vehicleId, status: "PENDING",
      deliveryPhone,
      searchStartedAt: new Date(),
      pricingSnapshotJson: JSON.stringify(pricing.snapshot),
      parcelNature,
      packageDescription: packageDescription || parcelNature,
      packageSize: packageSize || null,
      packageWeight: packageWeight || null,
    });
    const paymentRow = await Payment.create({ orderId: newOrder.get('id'), userId, amount: pricing.price, currency: "XOF", status: "PENDING", method: paymentMethod });
    await sendCompletionOtpSmsIfPossible({
      phone: deliveryPhone,
      otp: String(newOrder.get('completionOtp') || ''),
      parcelNature,
    });
    const io: Server = (req as any).io;
    let notifiedDriversPayload: any[] = [];
    let searchRadiusKm: number | null = null;
    const shouldStartSearchImmediately =
      shouldStartDriverSearchImmediatelyForPaymentMethod(paymentMethod);
    if (!simulationMode && shouldStartSearchImmediately) {
      try {
        const notifyResult = await startDriverSearchForOrder({
          order: newOrder,
          io,
          pricing,
          paymentRow,
        });
        notifiedDriversPayload = notifyResult?.notifiedDrivers ?? [];
        searchRadiusKm =
          typeof notifyResult?.radiusKm === 'number' ? notifyResult.radiusKm : null;
      } catch (error) {
        console.error(error);
      }
    }
    io.to('rides').emit('ride:created', newOrder);
    return res.status(201).json({
      success: true,
      order: newOrder,
      payment: paymentRow,
      completionOtp: String(newOrder.get('completionOtp') || ''),
      notifiedDrivers: notifiedDriversPayload,
      searchRadiusKm,
    });
  } catch (error) {
    return res.status(500).json({ error: "Creation failed" });
  }
};

export const driverArrivedPickup = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Course introuvable" });
    await order.update({ driverArrivedPickupAt: new Date(), status: "DRIVER_ARRIVED_PICKUP" });
    await notifyUserDeliveryStep(order, { title: "Livreur arrive", body: "Votre livreur est arrive.", type: "DRIVER_ARRIVED_PICKUP" });
    const io: Server = (req as any).io;
    io.to(`user_${order.get('userId')}`).emit("order_status_changed", { orderId, status: "DRIVER_ARRIVED_PICKUP", driverId: order.get('driverId') });
    io.to("rides").emit("ride:updated", {
      id: orderId,
      orderId,
      status: "DRIVER_ARRIVED_PICKUP",
      driverId: order.get("driverId"),
      publicCode: String(order.get("publicCode") || ""),
      updatedAt: new Date().toISOString(),
    });
    return res.status(200).json({ success: true, data: order });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const driverLeftPickup = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ success: false });
    const waitingAt = order.get('driverArrivedPickupAt') as Date | null;
    const waiting = await calculateWaitingFees(waitingAt ?? new Date(), new Date(), String(order.get('countryId') || ""));
    await order.update({ status: "DRIVER_LEFT_PICKUP", driverLeftPickupAt: new Date(), waitingFee: waiting.waitingFee });
    await notifyUserDeliveryStep(order, { title: "Livraison demarree", body: "Le livreur a recupere le colis.", type: "DRIVER_LEFT_PICKUP" });
    const io: Server = (req as any).io;
    io.to(`user_${order.get('userId')}`).emit("order_status_changed", { orderId, status: "DRIVER_LEFT_PICKUP", driverId: order.get('driverId') });
    io.to("rides").emit("ride:updated", {
      id: orderId,
      orderId,
      status: "DRIVER_LEFT_PICKUP",
      driverId: order.get("driverId"),
      publicCode: String(order.get("publicCode") || ""),
      updatedAt: new Date().toISOString(),
    });
    return res.status(200).json({ success: true, data: waiting });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const cancelDelivery = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order || order.get('status') === "COMPLETED") return res.status(400).json({ success: false });
    const io: Server = (req as any).io;
    const cancellationResult = await cancelOrderAndBroadcast({
      order,
      io,
      cancelledBy: normalizeCancellationActor(req.body?.cancelledBy),
      cancellationReason: req.body?.cancellationReason,
    });
    return res.status(200).json({
      success: true,
      message: cancellationResult.refundRequestCreated
        ? "La course a ete annulee. Une demande de remboursement a ete creee."
        : "La course a ete annulee.",
      data: cancellationResult,
    });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const estimateCancelAfterPickup = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { order, quote } = await getCancelAfterPickupQuote(orderId);

    if (quote.existingReturnOrderId) {
      return res.status(409).json({
        success: false,
        message: "Une course retour existe deja pour cette course.",
        data: {
          existingReturnOrderId: quote.existingReturnOrderId,
        },
      });
    }

    const io: Server = (req as any).io;
    const driverId = String(order.get("driverId") || "").trim();
    const userId = String(order.get("userId") || "").trim();
    if (driverId) {
      const user = userId ? await User.findByPk(userId) : null;
      io.to(`user_${driverId}`).emit("cancel_after_pickup_requested", {
        orderId,
        driverId,
        userId,
        userName: String(user?.get("name") || "L'usager").trim(),
        message: "L'usager souhaite annuler la course en cours.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        currentDriverPosition: quote.currentDriverPosition,
        returnPickupLocation: quote.returnPickupLocation,
        returnPickupAddress: quote.returnPickupAddress,
        returnDestinationLocation: quote.returnDestinationLocation,
        returnDestinationAddress: quote.returnDestinationAddress,
        distanceMeters: quote.distanceMeters,
        distanceText: quote.distanceText,
        durationSeconds: quote.durationSeconds,
        durationText: quote.durationText,
        initialOrderAmount: quote.initialOrderAmount,
        initialUnpaidAmount: quote.initialUnpaidAmount,
        returnAmount: quote.returnAmount,
        totalAmountDue: quote.totalAmountDue,
        paymentMethod: quote.paymentMethod,
        originalPaymentStatus: quote.originalPaymentStatus,
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Impossible de calculer la course retour.",
    });
  }
};

export const confirmCancelAfterPickupFlow = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const result = await confirmCancelAfterPickup({
      orderId,
      cancellationReason: req.body?.cancellationReason,
    });

    if (!result.returnOrder) {
      return res.status(409).json({
        success: false,
        message: "Une course retour existe deja pour cette course.",
      });
    }

    const originalOrderId = String(result.originalOrder.get("id") || "").trim();
    const returnOrderId = String(result.returnOrder.get("id") || "").trim();
    const returnTracking = await buildTrackingDataForOrder(returnOrderId);
    const io: Server = (req as any).io;

    const payload = {
      orderId: originalOrderId,
      status: "CANCELLED",
      cancelledBy: "USER",
      cancellationReason: String(req.body?.cancellationReason || "").trim(),
      hasReturnOrder: true,
      returnOrderId,
      returnTracking,
      totalAmountDue: Number(result.quote?.totalAmountDue || 0),
      returnAmount: Number(result.quote?.returnAmount || 0),
      initialUnpaidAmount: Number(result.quote?.initialUnpaidAmount || 0),
    };

    const userId = String(result.originalOrder.get("userId") || "").trim();
    const driverId = String(result.originalOrder.get("driverId") || "").trim();

    io.to(`user_${userId}`).emit("order_status_changed", payload);
    if (driverId) {
      io.to(`user_${driverId}`).emit("order_status_changed", payload);
    }

    io.to("rides").emit("ride:updated", {
      id: originalOrderId,
      orderId: originalOrderId,
      status: "CANCELLED",
      driverId,
      hasReturnOrder: true,
      returnOrderId,
    });
    io.to("rides").emit("ride:created", result.returnOrder);

    await notifyUserDeliveryStep(result.returnOrder, {
      title: "Retour du colis en cours",
      body: "Votre course retour a ete creee automatiquement. Le livreur ramene le colis au point de recuperation.",
      type: "RETURN_ORDER_CREATED",
      route: "/maps",
    });
    if (driverId) {
      await notifyDriverDeliveryStep(driverId, {
        title: "Course retour",
        body: "L'usager a annule apres demarrage. Ramenez le colis au point de recuperation initial.",
        type: "RETURN_ORDER_CREATED",
        route: "/delivery",
        orderId: returnOrderId,
      });
    }

    return res.status(200).json({
      success: true,
      message: "La course retour a ete creee.",
      data: {
        originalOrderId,
        returnOrderId,
        tracking: returnTracking,
        quote: result.quote
          ? {
            distanceText: result.quote.distanceText,
            durationText: result.quote.durationText,
            initialOrderAmount: result.quote.initialOrderAmount,
            initialUnpaidAmount: result.quote.initialUnpaidAmount,
            returnAmount: result.quote.returnAmount,
            totalAmountDue: result.quote.totalAmountDue,
            paymentMethod: result.quote.paymentMethod,
          }
          : null,
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Impossible de creer la course retour.",
    });
  }
};

export const adminCancelDelivery = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Course introuvable" });
    }
    if (String(order.get("status") || "").trim().toUpperCase() === "COMPLETED") {
      return res.status(400).json({
        success: false,
        message: "Une course terminee ne peut plus etre annulee",
      });
    }
    if (String(order.get("status") || "").trim().toUpperCase() === "CANCELLED") {
      return res.status(400).json({
        success: false,
        message: "Cette course est deja annulee",
      });
    }

    const io: Server = (req as any).io;
    const cancellationResult = await cancelOrderAndBroadcast({
      order,
      io,
      cancelledBy: "ADMIN",
      cancellationReason: req.body?.cancellationReason,
      waiveFees: true,
    });

    return res.status(200).json({
      success: true,
      message: cancellationResult.refundRequestCreated
        ? "La course a ete annulee sans frais. Une demande de remboursement a ete creee."
        : "La course a ete annulee sans frais pour l'usager.",
      data: cancellationResult,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Impossible d'annuler cette course.",
    });
  }
};

export const getOrders = async (req: Request, res: Response) => {
  try {
    const { userId, driverId, status, vehicleType, startDate, endDate, includeArchived, archived, page, limit } = req.query;
    const where: any = {};
    if (userId) where.userId = userId;
    if (driverId) where.driverId = driverId;
    if (status) where.status = status;
    if (vehicleType) where.vehicleType = vehicleType;

    if (startDate || endDate) {
      const dateRange: any = {};
      if (startDate) dateRange[Op.gte] = new Date(String(startDate));
      if (endDate) dateRange[Op.lte] = new Date(String(endDate));
      where.createdAt = dateRange;
    }

    const includeArchivedFlag =
      String(includeArchived || "").trim().toLowerCase() === "true" ||
      String(archived || "").trim().toLowerCase() === "all";
    if (!includeArchivedFlag) {
      where.isArchived = false;
    }

    const pageNumber = Math.max(1, parseInt(String(page || "1")));
    const limitNumber = Math.max(1, parseInt(String(limit || "10")));
    const offset = (pageNumber - 1) * limitNumber;

    const { count, rows: orders } = await Order.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      include: [{ model: Country, as: "country", attributes: ["name"] }],
      limit: limitNumber,
      offset: offset,
    });

    const enrichedOrders = await Promise.all(
      orders.map(async (order: any) => {
        const rawOrder = order.toJSON() as Record<string, unknown>;
        const currentDriverId = String(rawOrder.driverId || "").trim();
        const countryName = order.country?.name || String(rawOrder.countryName || "-");

        try {
          const [payment, driver] = await Promise.all([
            resolveOrderDisplayPayment(String(rawOrder.id || "")),
            currentDriverId
              ? User.findByPk(currentDriverId, {
                attributes: ["id", "name", "phone", "rating", "avatarUrl"],
              })
              : Promise.resolve(null),
          ]);

          return {
            ...rawOrder,
            countryName,
            paymentStatus: String(payment?.get("status") || rawOrder.paymentStatus || ""),
            payment_status: String(payment?.get("status") || rawOrder.payment_status || ""),
            paymentMethod: String(payment?.get("method") || rawOrder.paymentMethod || ""),
            payment_method: String(payment?.get("method") || rawOrder.payment_method || ""),
            payment: payment
              ? {
                id: String(payment.get("id") || ""),
                status: String(payment.get("status") || ""),
                method: String(payment.get("method") || ""),
                amount: Number(payment.get("amount") || 0),
                currency: String(payment.get("currency") || ""),
                paidAt: payment.get("paidAt") || null,
              }
              : null,
            driver: driver
              ? {
                id: String(driver.get("id") || ""),
                name: String(driver.get("name") || ""),
                phone: String(driver.get("phone") || ""),
                rating: Number(driver.get("rating") || 0),
                photoUrl: normalizePublicMediaUrl(String(driver.get("avatarUrl") || "")),
              }
              : null,
          };
        } catch (enrichmentError) {
          console.error("getOrders enrichment failed", enrichmentError);
          return rawOrder;
        }
      })
    );

    return res.status(200).json({
      success: true,
      data: enrichedOrders,
      pagination: {
        total: count,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(count / limitNumber),
      }
    });
  } catch (error) { return res.status(500).json({ error: "Failed" }); }
};

export const archiveOrder = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ success: false });
    await order.update({ isArchived: true });
    return res.status(200).json({ success: true });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const deleteOrder = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ success: false });
    await order.destroy();
    return res.status(200).json({ success: true });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const bulkDeleteOrders = async (req: Request, res: Response) => {
  try {
    const { orderIds } = req.body;
    await Order.destroy({ where: { id: { [Op.in]: orderIds } } });
    return res.status(200).json({ success: true });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const generateEmergencyOrderOtp = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Course introuvable" });
    }

    const status = String(order.get("status") || "").trim().toUpperCase();
    if (["COMPLETED", "CANCELLED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Impossible de regenerer un OTP pour une course terminee ou annulee.",
      });
    }

    const otp = generateCompletionOtp();
    await order.update({
      completionOtp: otp,
      completionOtpValidatedAt: null,
    });

    const deliveryPhone = String(order.get("deliveryPhone") || "").trim();
    const parcelNature = String(
      order.get("parcelNature") || order.get("packageDescription") || "",
    ).trim();
    const smsSent = deliveryPhone
      ? await sendAcceptedOrderOtpSmsIfPossible({
          phone: deliveryPhone,
          otp,
          parcelNature,
        })
      : false;

    await notifyUserDeliveryStep(order, {
      title: "Nouveau code OTP",
      body: "Un nouveau code OTP de livraison a ete genere par l'administration.",
      type: "EMERGENCY_ORDER_OTP",
      route: "/app",
    });

    const io: Server | undefined = (req as any).io;
    if (io) {
      const payload = {
        orderId,
        status,
        completionOtp: otp,
        emergencyOtpGeneratedAt: new Date().toISOString(),
      };
      io.to(`user_${order.get("userId")}`).emit("order_status_changed", payload);
      const driverId = String(order.get("driverId") || "").trim();
      if (driverId) {
        io.to(`user_${driverId}`).emit("order_status_changed", payload);
      }
      io.to("rides").emit("ride:updated", payload);
    }

    return res.status(200).json({
      success: true,
      message: smsSent
        ? "OTP d'urgence de la course genere et envoye."
        : "OTP d'urgence de la course genere, mais l'envoi SMS a echoue.",
      data: {
        orderId,
        otp,
        smsSent,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Impossible de regenerer l'OTP de la course.",
    });
  }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { driverId, completionOtp } = req.body;
    const status = normalizeDeliveryStatus(req.body?.status);
    const order = await Order.findByPk(orderId);
    if (status === "IN_TRANSIT" && order) {
      const { paymentMethod, paymentStatus } = await getOrderPaymentSnapshot(orderId);
      const normalizedPaymentMethod = String(paymentMethod || "CASH")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
      const normalizedPaymentStatus = String(paymentStatus || "PENDING")
        .trim()
        .toUpperCase();
      if (["MOBILE_MONEY", "CARD"].includes(normalizedPaymentMethod) && normalizedPaymentStatus !== "PAID") {
        return res.status(400).json({
          success: false,
          message: "Le paiement doit etre confirme avant le demarrage de la course.",
        });
      }
    }
    if (!order) return res.status(404).json({ message: "Commande non trouvée" });
    if (status === 'ACCEPTED' && order.get('status') !== 'PENDING') return res.status(400).json({ success: false, message: "Déjà acceptée par un autre livreur" });
    const previousStatus = String(order.get('status') || '').trim().toUpperCase();
    const updateData: any = { status };
    if (status === 'PENDING' && previousStatus === 'NO_DRIVER_FOUND') {
      updateData.searchStartedAt = new Date();
    }
    if (driverId) updateData.driverId = driverId;
    if (status === "ACCEPTED" && driverId) {
      const activeVehicle = await DriverVehicle.findOne({ where: { driverId, isPrimary: true }, order: [["createdAt", "DESC"]] });
      if (activeVehicle) updateData.driverVehicleId = activeVehicle.get("id");
      await User.update({ isAvailable: false }, { where: { id: driverId } });
    }
    if (status === "COMPLETED") {
      const providedOtp = normalizeOtp(completionOtp);
      const storedOtp = normalizeOtp(order.get("completionOtp"));
      if (providedOtp !== storedOtp) return res.status(400).json({ success: false, message: "Code OTP invalide" });
      updateData.completionOtpValidatedAt = new Date();
      const currentDriverId = order.get('driverId');
      if (currentDriverId) await User.update({ isAvailable: true }, { where: { id: currentDriverId } });
    }
    if (status === "IN_TRANSIT") {
      updateData.paymentPromptDeadlineAt = null;
      updateData.paymentCheckoutStartedAt = null;
      updateData.paymentCheckoutStatus = "PAID";
    }
    await Order.update(updateData, { where: { id: orderId } });
    const refreshedOrder = await Order.findByPk(orderId);
    const orderForEvents = refreshedOrder ?? order;
    const { paymentMethod, paymentStatus } = await getOrderPaymentSnapshot(orderId);
    const io: Server = (req as any).io;
    const payload = {
      orderId,
      publicCode: String(orderForEvents.get('publicCode') || ''),
      status,
      driverId: driverId || orderForEvents.get('driverId'),
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      searchStartedAt: orderForEvents.get('searchStartedAt'),
      paymentPromptDeadlineAt: orderForEvents.get('paymentPromptDeadlineAt'),
      paymentCheckoutStartedAt: orderForEvents.get('paymentCheckoutStartedAt'),
    };
    io.to(`user_${orderForEvents.get('userId')}`).emit('order_status_changed', payload);
    if (status === 'ACCEPTED') emitCancelIncomingCall(io, orderForEvents, {
      orderId,
      requestId: orderId,
      acceptedByDriverId: String(driverId || orderForEvents.get('driverId') || ''),
    });
    if (status === 'NO_DRIVER_FOUND') emitCancelIncomingCall(io, orderForEvents, {
      orderId,
      requestId: orderId,
      cancelledBy: 'SYSTEM_NO_DRIVER_FOUND',
    });
    if (status === 'NO_DRIVER_FOUND') {
      await markOrderSearchFailed(orderId);
    }
    if (status === 'PENDING' && previousStatus === 'NO_DRIVER_FOUND') {
      const paymentRow = await Payment.findOne({
        where: { orderId },
        order: [["createdAt", "DESC"]],
      });
      notifyNearbyDrivers(orderForEvents, io, null, paymentRow).catch(console.error);
    }
    if (status === 'ACCEPTED') {
      await markOrderSearchAccepted(orderId, {
        id: String(driverId || orderForEvents.get('driverId') || '').trim(),
        name: '',
        phone: '',
      });
    }
    if (status === "COMPLETED") await notifyUserDeliveryStep(orderForEvents, { title: "Livraison terminee", body: "Merci!", type: "ORDER_COMPLETED" });
    if (status === "ACCEPTED") {
      await notifyUserDeliveryStep(orderForEvents, {
        title: "Livreur trouvé",
        body: "Un livreur a accepté votre commande, suivez-le sur la carte.",
        type: "DRIVER_ACCEPTED",
        route: "/app",
      });
    }
    return res.status(200).json({ success: true });
  } catch (error) { return res.status(500).json({ error: "Update failed" }); }
};

export const submitOrderRating = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requesterId = req.user?.id;
    const requesterRole = req.user?.role;
    const { orderId } = req.params;
    const io: Server = (req as any).io;
    const rating = normalizeRatingValue(req.body?.rating ?? req.body?.note);
    const comment = String(req.body?.comment ?? req.body?.review ?? "").trim();

    if (!requesterId || !requesterRole) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    if (rating == null) {
      return res.status(400).json({
        success: false,
        message: "La note doit etre un nombre compris entre 1 et 5",
      });
    }

    const result = await sequelize.transaction(async (transaction) => {
      const order = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!order) {
        return { status: 404, body: { success: false, message: "Course introuvable" } };
      }

      if (String(order.get("status") || "") !== "COMPLETED") {
        return {
          status: 400,
          body: { success: false, message: "La note ne peut etre soumise qu'apres une course terminee" },
        };
      }

      const orderOwnerId = String(order.get("userId") || "").trim();
      const driverId = String(order.get("driverId") || "").trim();

      if (requesterRole === "livreur") {
        if (driverId !== requesterId) {
          return {
            status: 403,
            body: { success: false, message: "Vous ne pouvez noter que les clients de vos propres courses" },
          };
        }

        if (order.get("userRating") != null) {
          return {
            status: 409,
            body: {
              success: false,
              message: "Cette course a deja ete notee",
              data: {
                orderId: String(order.get("id") || ""),
                rating: Number(order.get("userRating")),
                comment: String(order.get("userRatingComment") || ""),
                ratedAt: order.get("userRatedAt"),
              },
            },
          };
        }

        if (!orderOwnerId) {
          return {
            status: 400,
            body: { success: false, message: "Aucun client n'est associe a cette course" },
          };
        }

        const user = await User.findByPk(orderOwnerId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!user) {
          return { status: 404, body: { success: false, message: "Client introuvable" } };
        }

        const currentRating = Number(user.get("rating") || 0);
        const currentRatingCount = Number(user.get("ratingCount") || 0);
        const nextRatingCount = currentRatingCount + 1;
        const nextRating =
          Math.round((((currentRating * currentRatingCount) + rating) / nextRatingCount) * 100) / 100;
        const ratedAt = new Date();

        await order.update(
          {
            userRating: rating,
            userRatingComment: comment || null,
            userRatedAt: ratedAt,
            ratedByDriverId: requesterId,
          },
          { transaction }
        );

        await user.update(
          {
            rating: nextRating,
            ratingCount: nextRatingCount,
          },
          { transaction }
        );

        return {
          status: 200,
          body: {
            success: true,
            message: "Note enregistree avec succes",
            data: {
              orderId: String(order.get("id") || ""),
              userId: orderOwnerId,
              submittedRating: rating,
              comment,
              ratedAt,
              userRating: nextRating,
              userRatingCount: nextRatingCount,
            },
          },
        };
      }

      if (requesterRole !== "admin" && orderOwnerId !== requesterId) {
        return {
          status: 403,
          body: { success: false, message: "Vous ne pouvez noter que vos propres courses" },
        };
      }

      if (order.get("driverRating") != null) {
        return {
          status: 409,
          body: {
            success: false,
            message: "Cette course a deja ete notee",
            data: {
              orderId: String(order.get("id") || ""),
              rating: Number(order.get("driverRating")),
              comment: String(order.get("driverRatingComment") || ""),
              ratedAt: order.get("driverRatedAt"),
            },
          },
        };
      }

      if (!driverId) {
        return {
          status: 400,
          body: { success: false, message: "Aucun livreur n'est associe a cette course" },
        };
      }

      const driver = await User.findByPk(driverId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!driver) {
        return { status: 404, body: { success: false, message: "Livreur introuvable" } };
      }

      const currentRating = Number(driver.get("rating") || 0);
      const currentRatingCount = Number(driver.get("ratingCount") || 0);
      const nextRatingCount = currentRatingCount + 1;
      const nextRating =
        Math.round((((currentRating * currentRatingCount) + rating) / nextRatingCount) * 100) / 100;
      const ratedAt = new Date();

      await order.update(
        {
          driverRating: rating,
          driverRatingComment: comment || null,
          driverRatedAt: ratedAt,
          ratedByUserId: requesterId,
        },
        { transaction }
      );

      await driver.update(
        {
          rating: nextRating,
          ratingCount: nextRatingCount,
        },
        { transaction }
      );

      return {
        status: 200,
        body: {
          success: true,
          message: "Note enregistree avec succes",
          data: {
            orderId: String(order.get("id") || ""),
            driverId,
            submittedRating: rating,
            comment,
            ratedAt,
            driverRating: nextRating,
            driverRatingCount: nextRatingCount,
          },
        },
      };
    });

    if (
      result.status === 200 &&
      requesterRole === "livreur" &&
      result.body?.success === true
    ) {
      const order = await Order.findByPk(orderId);
      const userId = String(order?.get("userId") || "").trim();
      if (userId) {
        io?.to(`user_${userId}`).emit("driver_submitted_rating", {
          orderId,
          driverId: String(order?.get("driverId") || requesterId || "").trim(),
          userId,
          userRating: result.body?.data?.submittedRating ?? rating,
          userRatedAt: result.body?.data?.ratedAt ?? new Date().toISOString(),
        });
      }
    }

    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({ success: false, message: "Erreur lors de l'enregistrement de la note" });
  }
};

export const createDeliveryRequest = async (req: Request, res: Response) => {
  try {
    const { userId, pickupLocation, pickupAddress, destinationLocation, destinationAddress, distance, vehicleType } = req.body;
    const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);
    const parcelNature = resolveParcelNature(req.body || {});
    const packageDescription = resolvePackageDescription(req.body || {}, parcelNature);
    const packageSize = resolvePackageSize(req.body || {});
    const packageWeight = resolvePackageWeight(req.body || {});
    const deliveryPhone = await normalizeOrderPhoneIfPossible(
      resolveDeliveryPhone(req.body || {}),
    );
    const countryId = await resolveCountryId("");
    const pricing = await calculateDeliveryPricing({ vehicleType, countryId, distanceKm: extractDistanceKm(distance), durationMinutes: 0, extras: 0, tip: 0 });
    const newOrder = await Order.create({ publicCode: await generateUniqueOrderPublicCode("CRS"), countryId, userId, pickupLocation, pickupAddress, destinationLocation, destinationAddress, price: pricing.price, distance: String(distance || ""), status: "PENDING", vehicleType, completionOtp: generateCompletionOtp(), deliveryPhone, parcelNature, packageDescription: packageDescription || parcelNature, packageSize: packageSize || null, packageWeight: packageWeight || null });
    const paymentRow = await Payment.create({ orderId: newOrder.get('id'), userId, amount: pricing.price, status: "PENDING", method: paymentMethod });
    await sendCompletionOtpSmsIfPossible({
      phone: deliveryPhone,
      otp: String(newOrder.get('completionOtp') || ''),
      parcelNature,
    });
    const io: Server = (req as any).io;
    notifyNearbyDrivers(newOrder, io, pricing, paymentRow).catch(console.error);
    return res.status(201).json({ success: true, order: newOrder });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const assignNearestDriver = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ success: false });
    const availableDrivers = await User.findAll({ where: { role: 'livreur', isActive: true, isAvailable: true }, raw: true });
    if (!availableDrivers.length) return res.status(404).json({ success: false });

    const eligibleDrivers: any[] = [];
    for (const candidate of availableDrivers as any[]) {
      const activeOrder = await findActiveOrderForDriver(String(candidate.id || "").trim(), orderId);
      if (!activeOrder) {
        eligibleDrivers.push(candidate);
      }
    }

    if (!eligibleDrivers.length) {
      return res.status(409).json({
        success: false,
        message: "Aucun livreur disponible pour cette course.",
      });
    }

    const selected = eligibleDrivers[0] as any;

    let vehicle = null;
    let media = { driverPhotoUrl: "", vehiclePhotoUrl: "" };
    try {
      const [vehicleResult, mediaResult] = await Promise.all([
        DriverVehicle.findOne({
          where: { driverId: selected.id },
          order: [
            ["isPrimary", "DESC"],
            ["createdAt", "DESC"],
          ],
          raw: true,
        }),
        resolveDriverMedia({ driverId: String(selected.id || "").trim() }),
      ]);
      vehicle = vehicleResult;
      media = mediaResult;
    } catch (e) { }

    await Order.update(
      {
        driverId: selected.id,
        driverVehicleId: vehicle?.id || null,
        status: "ACCEPTED",
      },
      { where: { id: orderId } },
    );
    await User.update({ isAvailable: false }, { where: { id: selected.id } });

    return res.status(200).json({
      success: true,
      data: {
        driver: {
          id: selected.id,
          name: selected.name,
          phone: selected.phone,
          latitude: selected.latitude,
          longitude: selected.longitude,
          rating: Number(selected.rating || 0),
          photoUrl:
            media.driverPhotoUrl ||
            normalizePublicMediaUrl(selected.photoUrl) ||
            normalizePublicMediaUrl(selected.avatarUrl) ||
            "",
          coursesCount: selected.deliveryCount || 0,
          fcmToken: selected.fcmToken,
        },
        vehicle: buildDriverVehiclePayload(
          (vehicle as unknown as Record<string, unknown> | undefined) || null,
          media.vehiclePhotoUrl || "",
          String(order.get('vehicleType') || '').trim()
        ),
        completionOtp: order.get('completionOtp')
      }
    });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const acceptDeliveryByDriver = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { driverId } = req.body;
    const ioServer: Server = (req as any).io;
    const helperResult = await acceptOrderWithDriver({ orderId, driverId, io: ioServer });
    if (!helperResult.success) {
      return res.status(400).json({ success: false, message: helperResult.message });
    }
    return res.status(200).json({ success: true });
    /*

    console.log("[acceptDeliveryByDriver] request", {
      url: req.originalUrl,
      params: req.params,
      body: req.body,
    });
    const paymentSnapshot = await getOrderPaymentSnapshot(orderId);
    const paymentMethod = String(paymentSnapshot.paymentMethod || "CASH")
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");
    const paymentStatus = String(paymentSnapshot.paymentStatus || "PENDING")
      .trim()
      .toUpperCase();
    const shouldAwaitRemotePayment =
      ["MOBILE_MONEY", "CARD"].includes(paymentMethod) &&
      paymentStatus !== "PAID";
    const paymentPromptDeadlineAt = shouldAwaitRemotePayment
      ? new Date(Date.now() + PAYMENT_PROMPT_WINDOW_MS)
      : null;

    // Sécurisation : on met à jour SEULEMENT si la course est toujours en attente
    const [affectedCount] = await Order.update(
      {
        driverId,
        status: "ACCEPTED",
        paymentPromptDeadlineAt,
        paymentCheckoutStartedAt: null,
        paymentPromptAttemptCount: shouldAwaitRemotePayment ? 1 : 0,
        paymentCheckoutStatus: shouldAwaitRemotePayment ? "AWAITING_ACTION" : null,
      },
      { where: { id: orderId, status: "PENDING" } }
    );

    if (affectedCount === 0) {
      return res.status(400).json({ success: false, message: "Course déjà assignée ou annulée." });
    }

    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ success: false });
    console.log("[acceptDeliveryByDriver] order snapshot", {
      orderId,
      driverId,
      deliveryPhone: String(order.get("deliveryPhone") || "").trim(),
      completionOtp: String(order.get("completionOtp") || "").trim(),
      parcelNature: String(
        order.get("parcelNature") || order.get("packageDescription") || "",
      ).trim(),
    });

    await User.update({ isAvailable: false }, { where: { id: driverId } });
    const [driverResult, media] = await Promise.all([
      User.findByPk(driverId),
      resolveDriverMedia({ driverId: String(driverId || "").trim() }),
    ]);
    const driver = driverResult
      ? (driverResult.get({ plain: true }) as Record<string, unknown>)
      : null;

    // await User.update({ isAvailable: false }, { where: { id: driverId } });
    // const [driver, media] = await Promise.all([
    //   User.findByPk(driverId, { raw: true }) as Promise<Record<string, unknown> | null>,
    //   resolveDriverMedia({ driverId: String(driverId || "").trim() }),
    // ]);
    if (!driver) return res.status(404).json({ success: false, message: "Livreur introuvable." });
    await markOrderSearchAccepted(orderId, {
      id: String(driver?.id || driverId || '').trim(),
      name: String(driver?.name || '').trim(),
      phone: String(driver?.phone || '').trim(),
    });

    let vehicle = null;
    try {
      vehicle = await DriverVehicle.findOne({ where: { driverId }, raw: true });
    } catch (e) { }

    const io: Server = (req as any).io;
    const userId = order.get('userId');

    io.to(`user_${userId}`).emit("order_status_changed", {
      orderId,
      publicCode: String(order.get('publicCode') || ''),
      status: "ACCEPTED",
      driverId,
      driver: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        latitude: driver.latitude,
        longitude: driver.longitude,
        rating: Number(driver.rating || 0),
        photoUrl:
          media.driverPhotoUrl ||
          normalizePublicMediaUrl(String(driver.avatarUrl || "")),
        coursesCount: Number(driver.deliveryCount || 0),
        fcmToken: driver.fcmToken,
      },
      vehicle: buildDriverVehiclePayload(
        (vehicle as unknown as Record<string, unknown> | undefined) || null,
        media.vehiclePhotoUrl || "",
        String(order.get("vehicleType") || "").trim()
      ),
      completionOtp: order.get('completionOtp'),
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      paymentPromptDeadlineAt,
      paymentCheckoutStartedAt: null,
      paymentPromptAttemptCount: shouldAwaitRemotePayment ? 1 : 0,
      paymentCheckoutStatus: shouldAwaitRemotePayment ? "AWAITING_ACTION" : null,
    });
    io.to(`user_${driverId}`).emit("order_status_changed", {
      orderId,
      publicCode: String(order.get('publicCode') || ''),
      status: "ACCEPTED",
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      paymentPromptDeadlineAt,
      paymentCheckoutStartedAt: null,
      paymentPromptAttemptCount: shouldAwaitRemotePayment ? 1 : 0,
      paymentCheckoutStatus: shouldAwaitRemotePayment ? "AWAITING_ACTION" : null,
    });
    emitCancelIncomingCall(io, order, {
      orderId,
      requestId: orderId,
      acceptedByDriverId: String(driverId || ''),
    });

    await notifyUserDeliveryStep(order, {
      title: "Livreur trouvé",
      body: "Votre chauffeur a accepté la course et se dirige vers vous.",
      type: "DRIVER_ACCEPTED",
      route: "/app",
    });

    try {
      const smsPayload = {
        phone: String(order.get("deliveryPhone") || "").trim(),
        otp: String(order.get("completionOtp") || "").trim(),
        parcelNature: String(
          order.get("parcelNature") || order.get("packageDescription") || "",
        ).trim(),
      };
      console.log("[acceptDeliveryByDriver] sms payload", smsPayload);
      await sendAcceptedOrderOtpSmsIfPossible(smsPayload);
      console.log("[acceptDeliveryByDriver] sms send requested successfully");
    } catch (smsError) {
      console.error("acceptDeliveryByDriver OTP SMS failed", smsError);
    }

    const responsePayload = { success: true };
    console.log("[acceptDeliveryByDriver] response", responsePayload);
    return res.status(200).json(responsePayload);
    */
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const updateDeliveryStatus = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    await Order.update({ status }, { where: { id: orderId } });
    return res.status(200).json({ success: true });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const updateDriverLocationForDelivery = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { driverId, latitude, longitude, gpsEnabled, locationPermission, socketConnected, appState } = req.body;
    const normalizedDriverId = String(driverId || "").trim();
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!normalizedDriverId || Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({
        success: false,
        message: "driverId, latitude et longitude sont requis",
      });
    }

    await User.update(
      { latitude: lat, longitude: lng, locationUpdatedAt: new Date() },
      { where: { id: normalizedDriverId } }
    );
    let trackingHealth = null;
    try {
      trackingHealth = await recordOrderTrackingHealthSnapshot({
        orderId,
        driverId: normalizedDriverId,
        latitude: lat,
        longitude: lng,
        gpsEnabled,
        locationPermission,
        socketConnected,
        appState,
        metadata: {
          source: "ORDER_DRIVER_LOCATION_PATCH",
        },
      });
    } catch (_) {
      trackingHealth = null;
    }
    return res.status(200).json({ success: true, data: { trackingHealth } });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const broadcastDriverLocationForDelivery = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { driverId, latitude, longitude, gpsEnabled, locationPermission, socketConnected, appState } = req.body;

    const order = await Order.findByPk(orderId, { raw: true });
    if (!order) {
      return res.status(404).json({ success: false, message: "Course introuvable" });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    const normalizedDriverId = String(driverId || order.driverId || "").trim();
    if (!normalizedDriverId || Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({
        success: false,
        message: "driverId, latitude et longitude sont requis",
      });
    }

    const status = String(order.status || "").trim();
    const eta = await buildDeliveryEtaPayload({
      orderId,
      order,
      latitude: lat,
      longitude: lng,
    });
    await User.update(
      { latitude: lat, longitude: lng, locationUpdatedAt: new Date() },
      { where: { id: normalizedDriverId } }
    );
    let trackingHealth = null;
    try {
      trackingHealth = await recordOrderTrackingHealthSnapshot({
        orderId,
        driverId: normalizedDriverId,
        latitude: lat,
        longitude: lng,
        gpsEnabled,
        locationPermission,
        socketConnected,
        appState,
        metadata: {
          source: "ORDER_DRIVER_LOCATION_LIVE",
        },
      });
    } catch (_) {
      trackingHealth = null;
    }
    const payload = {
      orderId,
      driverId: normalizedDriverId,
      userId: normalizedDriverId,
      role: "livreur",
      latitude: lat,
      longitude: lng,
      status,
      locationUpdatedAt: new Date().toISOString(),
      eta,
      trackingHealth: trackingHealth || undefined,
    };

    const io: Server = (req as any).io;
    io.to(`order_${orderId}`).emit("order:driver_location_updated", payload);
    io.to(`order_${orderId}`).emit("driver_location_updated", payload);
    io.to(`user_${String(order.userId || "").trim()}`).emit(
      "order:driver_location_updated",
      payload,
    );
    io.to(`user_${String(order.userId || "").trim()}`).emit(
      "driver_location_updated",
      payload,
    );

    return res.status(200).json({ success: true, data: { eta } });
  } catch (error) {
    return res.status(500).json({ success: false });
  }
};

export const reportDriverTrackingHealth = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId, { raw: true });
    if (!order) {
      return res.status(404).json({ success: false, message: "Course introuvable" });
    }

    const requesterId = String(req.user?.id || "").trim();
    const requesterRole = String(req.user?.role || "").trim().toLowerCase();
    const assignedDriverId = String(order.driverId || "").trim();
    if (!requesterId || !requesterRole) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    if (!["livreur", "admin", "sous-admin"].includes(requesterRole)) {
      return res.status(403).json({
        success: false,
        message: "Acces refuse: insufficient role",
      });
    }

    const payload = req.body || {};
    const resolvedDriverId = String(payload.driverId || assignedDriverId || "").trim();
    if (!resolvedDriverId) {
      return res.status(400).json({
        success: false,
        message: "driverId est requis pour enregistrer le suivi.",
      });
    }

    if (requesterRole === "livreur" && requesterId !== resolvedDriverId) {
      return res.status(403).json({
        success: false,
        message: "Vous ne pouvez pas mettre a jour le suivi d'une autre course.",
      });
    }

    const trackingHealth = await recordOrderTrackingHealthSnapshot({
      orderId,
      driverId: resolvedDriverId,
      latitude: payload.latitude,
      longitude: payload.longitude,
      gpsEnabled: payload.gpsEnabled,
      locationPermission: payload.locationPermission,
      socketConnected: payload.socketConnected,
      appState: payload.appState,
      heartbeatAt: payload.heartbeatAt,
      reasonCode: payload.reasonCode,
      reasonLabel: payload.reasonLabel,
      metadata: {
        source: "TRACKING_HEALTH_REPORT",
        ...(payload.metadata && typeof payload.metadata === "object"
          ? payload.metadata
          : {}),
      },
    });

    return res.status(200).json({
      success: true,
      data: { trackingHealth },
    });
  } catch (error) {
    return res.status(500).json({ success: false });
  }
};

export const getDeliveryTracking = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const trackingData = await buildTrackingDataForOrder(orderId);
    if (!trackingData) {
      return res.status(404).json({ success: false, message: "Course introuvable" });
    }
    return res.status(200).json({ success: true, data: trackingData });
  } catch (error) { return res.status(500).json({ success: false }); }
};

export const estimateCancellation = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Commande non trouvée" });

    const fees = await calculateCancellationFees({
      orderId: String(order.get('id')),
      driverArrivedAt: order.get('driverArrivedPickupAt') as Date | null,
      cancelledAt: new Date(),
      countryId: String(order.get('countryId') || ""),
    });
    return res.status(200).json({ success: true, data: fees });
  } catch (error) { return res.status(500).json({ success: false }); }
};
