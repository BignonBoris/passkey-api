import sequelize from "../config/database";
import Order from "../models/order.model";
import Payment from "../models/payment.model";
import User from "../models/user.model";
import DriverVehicle from "../models/driver-vehicle.model";
import { calculateDeliveryPricing } from "./pricing.service";
import { getRouteDetails } from "../modules/maps/maps.service";
import { generateUniqueOrderPublicCode } from "../utils/orderPublicCode";

const RETURN_ELIGIBLE_STATUSES = new Set([
  "DRIVER_LEFT_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "IN_PROGRESS",
  "ONGOING",
  "ON_GOING",
]);

function parseLatLng(raw?: string | null) {
  if (!raw) return null;
  const [latText, lngText] = String(raw).split(",").map((value) => value.trim());
  const lat = Number(latText);
  const lng = Number(lngText);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function toLatLngString(lat: number, lng: number) {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

function generateCompletionOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generatePickupOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

async function findLatestOrderPayment(orderId: string, userId: string, transaction?: any) {
  return Payment.findOne({
    where: { orderId, userId },
    order: [["createdAt", "DESC"]],
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
}

async function buildCancelAfterPickupQuoteForOrder(order: Order) {
  const status = String(order.get("status") || "").trim().toUpperCase();
  if (!RETURN_ELIGIBLE_STATUSES.has(status)) {
    throw new Error("La course retour n'est disponible qu'apres le demarrage de la course.");
  }

  if (String(order.get("flowType") || "STANDARD").trim().toUpperCase() === "RETURN") {
    throw new Error("Une course retour ne peut pas etre annulee a nouveau par ce flow.");
  }

  const existingReturnOrderId = String(order.get("returnOrderId") || "").trim();
  if (existingReturnOrderId) {
    return { existingReturnOrderId };
  }

  const driverId = String(order.get("driverId") || "").trim();
  if (!driverId) {
    throw new Error("Aucun livreur n'est assigne a cette course.");
  }

  const driver = await User.findByPk(driverId);
  if (!driver) {
    throw new Error("Livreur introuvable.");
  }

  const currentLat = Number(driver.get("latitude"));
  const currentLng = Number(driver.get("longitude"));
  if (!Number.isFinite(currentLat) || !Number.isFinite(currentLng)) {
    throw new Error("La position actuelle du livreur est indisponible.");
  }

  const originalPickupLocation = String(order.get("pickupLocation") || "").trim();
  const originalPickupAddress = String(order.get("pickupAddress") || "").trim();
  const originalDestinationAddress = String(order.get("destinationAddress") || "").trim();
  const parsedOriginalPickup = parseLatLng(originalPickupLocation);
  if (!parsedOriginalPickup) {
    throw new Error("Le point de recuperation initial est invalide.");
  }

  const route = await getRouteDetails(
    toLatLngString(currentLat, currentLng),
    originalPickupLocation,
  );
  if (!route) {
    throw new Error("Impossible de calculer le trajet de retour.");
  }

  const distanceMeters = Math.max(0, Number(route.distanceValue) || 0);
  const durationSeconds = Math.max(0, Number(route.durationValue) || 0);
  const distanceKm = distanceMeters / 1000;
  const durationMinutes = durationSeconds / 60;
  const returnPricing = await calculateDeliveryPricing({
    vehicleType: String(order.get("vehicleType") || "moto"),
    countryId: String(order.get("countryId") || ""),
    distanceKm,
    durationMinutes,
    extras: 0,
    tip: 0,
  });

  const userId = String(order.get("userId") || "").trim();
  const latestPayment = await findLatestOrderPayment(String(order.get("id") || ""), userId);
  const originalPaymentStatus = String(latestPayment?.get("status") || "PENDING").trim().toUpperCase();
  const originalPaymentMethod = normalizePaymentMethod(latestPayment?.get("method"));
  const initialOrderAmount = Number(order.get("price") || latestPayment?.get("amount") || 0);
  const initialUnpaidAmount = originalPaymentStatus === "PAID" ? 0 : Number(latestPayment?.get("amount") || initialOrderAmount || 0);
  const returnAmount = Number(returnPricing.price || 0);
  const totalAmountDue = returnAmount + initialUnpaidAmount;

  return {
    existingReturnOrderId: "",
    currentDriverPosition: {
      latitude: currentLat,
      longitude: currentLng,
    },
    returnPickupLocation: toLatLngString(currentLat, currentLng),
    returnPickupAddress: "Position actuelle du livreur",
    returnDestinationLocation: originalPickupLocation,
    returnDestinationAddress: originalPickupAddress || "Point de recuperation initial",
    originalDestinationAddress,
    distanceMeters,
    distanceText: String(route.distanceText || "").trim(),
    durationSeconds,
    durationText: String(route.durationText || "").trim(),
    initialOrderAmount,
    initialUnpaidAmount,
    returnAmount,
    totalAmountDue,
    paymentMethod: originalPaymentMethod,
    originalPaymentStatus,
    returnPricing,
    latestPayment,
    driver,
  };
}

export async function getCancelAfterPickupQuote(orderId: string) {
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw new Error("Course introuvable.");
  }

  const quote = await buildCancelAfterPickupQuoteForOrder(order);
  return {
    order,
    quote,
  };
}

export async function confirmCancelAfterPickup(params: {
  orderId: string;
  cancellationReason?: string;
  paymentMethod?: string;
}) {
  return sequelize.transaction(async (transaction) => {
    const order = await Order.findByPk(params.orderId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!order) {
      throw new Error("Course introuvable.");
    }

    const currentStatus = String(order.get("status") || "").trim().toUpperCase();
    if (currentStatus === "COMPLETED") {
      throw new Error("Une course terminee ne peut plus etre annulee.");
    }

    if (String(order.get("flowType") || "STANDARD").trim().toUpperCase() === "RETURN") {
      throw new Error("Cette course retour ne peut pas etre traitee par ce flow.");
    }

    const existingReturnOrderId = String(order.get("returnOrderId") || "").trim();
    if (existingReturnOrderId) {
      const existingReturnOrder = await Order.findByPk(existingReturnOrderId, { transaction });
      return {
        originalOrder: order,
        returnOrder: existingReturnOrder,
        quote: null,
        payment: null,
        driver: null,
        vehicle: null,
        alreadyExists: true,
      };
    }

    const quoteData = await buildCancelAfterPickupQuoteForOrder(order);
    if (quoteData.existingReturnOrderId) {
      const existingReturnOrder = await Order.findByPk(quoteData.existingReturnOrderId, { transaction });
      return {
        originalOrder: order,
        returnOrder: existingReturnOrder,
        quote: null,
        payment: null,
        driver: null,
        vehicle: null,
        alreadyExists: true,
      };
    }

    const quote = quoteData;
    const returnPricing = quote.returnPricing!;
    const userId = String(order.get("userId") || "").trim();
    const driverId = String(order.get("driverId") || "").trim();
    const driverVehicleId = String(order.get("driverVehicleId") || "").trim() || null;
    const reason = String(params.cancellationReason || "").trim();
    const selectedPaymentMethod = normalizePaymentMethod(
      params.paymentMethod || quote.paymentMethod,
    );

    const returnContext = {
      kind: "RETURN_AFTER_PICKUP",
      originalOrderId: String(order.get("id") || ""),
      initialOrderAmount: quote.initialOrderAmount,
      initialUnpaidAmount: quote.initialUnpaidAmount,
      returnAmount: quote.returnAmount,
      totalAmountDue: quote.totalAmountDue,
      revenueBaseAmount: quote.returnAmount,
      distanceText: quote.distanceText,
      durationText: quote.durationText,
      originalDestinationAddress: quote.originalDestinationAddress,
      createdAt: new Date().toISOString(),
    };

    const returnOrder = await Order.create(
      {
        publicCode: await generateUniqueOrderPublicCode("RET"),
        countryId: String(order.get("countryId") || ""),
        userId,
        driverId,
        driverVehicleId,
        parentOrderId: String(order.get("id") || ""),
        pickupOtp: generatePickupOtp(),
        pickupOtpValidatedAt: null,
        completionOtp: generateCompletionOtp(),
        searchStartedAt: new Date(),
        pickupLocation: quote.returnPickupLocation,
        pickupAddress: quote.returnPickupAddress,
        destinationLocation: quote.returnDestinationLocation,
        destinationAddress: quote.returnDestinationAddress,
        distance: quote.distanceText,
        price: quote.totalAmountDue,
        revenuePerDelivery: Number(returnPricing.driverEarnings || 0),
        platformCommission: Number(returnPricing.platformCommission || 0),
        serviceFee: Number(returnPricing.serviceFee || 0),
        orderType: String(order.get("orderType") || "mobility"),
        merchantId: order.get("merchantId") || null,
        merchantName: order.get("merchantName") || null,
        itemCount: Number(order.get("itemCount") || 0),
        foodOrderPayloadJson: order.get("foodOrderPayloadJson") || null,
        flowType: "RETURN",
        returnContextJson: JSON.stringify(returnContext),
        vehicleType: String(order.get("vehicleType") || "moto"),
        status: "IN_TRANSIT",
        peakSurcharge: Number(returnPricing.peakSurcharge || 0),
        nightSurcharge: Number(returnPricing.nightSurcharge || 0),
        earlyMorningSurcharge: Number(returnPricing.earlyMorningSurcharge || 0),
        pricingSnapshotJson: JSON.stringify(returnPricing.snapshot),
        parcelNature: order.get("parcelNature") || null,
        packageDescription: order.get("packageDescription") || null,
      },
      { transaction },
    );

    const payment = await Payment.create(
      {
        orderId: String(returnOrder.get("id") || ""),
        userId,
        driverId: driverId || null,
        amount: quote.totalAmountDue,
        currency: "XOF",
        status: "PENDING",
        method: selectedPaymentMethod,
      },
      { transaction },
    );

    await order.update(
      {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: "USER",
        cancellationReason: reason || "Retour du colis demande par l'usager",
        cancelledAfterPickupAt: new Date(),
        returnOrderId: String(returnOrder.get("id") || ""),
      },
      { transaction },
    );

    await Payment.update(
      {
        status: "FAILED",
        failureReason: `Consolidee sur la course retour ${String(returnOrder.get("id") || "")}`,
      },
      {
        where: {
          orderId: String(order.get("id") || ""),
          userId,
          status: "PENDING",
        },
        transaction,
      },
    );

    const vehicle = driverVehicleId
      ? await DriverVehicle.findByPk(driverVehicleId, { transaction, raw: true })
      : await DriverVehicle.findOne({
          where: { driverId },
          order: [["createdAt", "DESC"]],
          transaction,
          raw: true,
        });

    return {
      originalOrder: order,
      returnOrder,
      quote: {
        ...quote,
        paymentMethod: selectedPaymentMethod,
      },
      payment,
      driver: quote.driver,
      vehicle,
      alreadyExists: false,
    };
  });
}
