import VehiclePricingConfig from "../models/vehicle-pricing-config.model";
import DriverRevenueConfig from "../models/driver-revenue-config.model";
import PricingRule, { PricingRuleType, PricingAdjustmentType } from "../models/pricing-rule.model";
import { calculateDriverRevenue, RevenueCalculationInput, RevenueCalculationResult } from "./revenue.service";

export interface PricingCalculationInput {
  vehicleType: string;
  countryId?: string;
  distanceKm: number;
  durationMinutes: number;
  extras?: number;
  tip?: number;
  pickupTimestamp?: Date | string;
}

export interface PricingCalculationResult {
  price: number;
  baseFare: number;
  bookingFee: number;
  distanceComponent: number;
  timeComponent: number;
  minimumFareApplied: boolean;
  driverEarnings: number;
  platformCommission: number;
  serviceFee: number;
  peakSurcharge: number;
  nightSurcharge: number;
  earlyMorningSurcharge: number;
  snapshot: PricingSnapshot;
}

export interface PricingSnapshot {
  baseFare: number;
  bookingFee: number;
  distanceComponent: number;
  timeComponent: number;
  extras: number;
  surcharges: {
    peak: number;
    night: number;
    earlyMorning: number;
  };
  minimumFare: number;
  rawTotal: number;
  adjustedTotal: number;
  driverRevenue: number;
  platformCommission: number;
  serviceFee: number;
  ruleReferences: Array<{ id: string | null; type: PricingRuleType }>;
}

const DEFAULT_SURCHARGES: Record<PricingRuleType, number> = {
  [PricingRuleType.PEAK]: 0.2,
  [PricingRuleType.NIGHT]: 0.15,
  [PricingRuleType.EARLY_MORNING]: 0.1,
  [PricingRuleType.WAITING]: 0,
  [PricingRuleType.CANCELLATION_BEFORE_ARRIVAL]: 0,
  [PricingRuleType.CANCELLATION_AFTER_ARRIVAL]: 0,
};

const DEFAULT_WAITING_RATE = 50; // FCFA per minute
const DEFAULT_WAITING_FREE_MINUTES = 5;

async function resolveVehiclePricingConfig(vehicleType: string, countryId?: string) {
  const normalized = (vehicleType || "moto").toString().trim().toLowerCase();
  let config = await VehiclePricingConfig.findOne({
    where: { vehicleType: normalized, ...(countryId ? { countryId } : {}) },
  });
  if (!config) {
    config = await VehiclePricingConfig.findOne({
      where: countryId ? { countryId } : undefined,
      order: [["updatedAt", "DESC"]],
    });
  }
  if (!config) {
    throw new Error("Aucune configuration tarifaire connue pour le vehicule demande.");
  }
  return config;
}

async function resolveDriverRevenueConfig(vehicleType: string, countryId?: string) {
  const normalized = (vehicleType || "moto").toString().trim().toLowerCase();
  let config = await DriverRevenueConfig.findOne({
    where: { vehicleType: normalized, ...(countryId ? { countryId } : {}) },
  });
  if (config) return config;
  const fallback = await DriverRevenueConfig.findOne({
    where: countryId ? { countryId } : undefined,
    order: [["updatedAt", "DESC"]],
  });
  if (fallback) return fallback;
  return {
    id: "default",
    vehicleType: normalized,
    baseFare: 0,
    perKmRate: 0,
    perMinuteRate: 0,
    commissionPercent: 20,
    serviceFeePercent: 5,
  } as DriverRevenueConfig;
}

function parseTimestamp(value?: Date | string) {
  if (!value) return new Date();
  return value instanceof Date ? value : new Date(value);
}

function isRuleActiveForTimestamp(rule: PricingRule, timestamp: Date) {
  if (!rule.isActive) return false;

  if (rule.daysOfWeek) {
    const allowed = rule.daysOfWeek
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    if (allowed.length) {
      const dayLabels = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ];
      const label = dayLabels[timestamp.getDay()];
      if (!allowed.includes(label)) {
        return false;
      }
    }
  }

  if (rule.startTime && rule.endTime) {
    const [startHour, startMinute] = rule.startTime.split(":").map(Number);
    const [endHour, endMinute] = rule.endTime.split(":").map(Number);
    const startTotal = startHour * 60 + (startMinute || 0);
    const endTotal = endHour * 60 + (endMinute || 0);
    const currentTotal = timestamp.getHours() * 60 + timestamp.getMinutes();
    if (startTotal <= endTotal) {
      if (currentTotal < startTotal || currentTotal > endTotal) {
        return false;
      }
    } else {
      if (currentTotal < startTotal && currentTotal > endTotal) {
        return false;
      }
    }
  }

  return true;
}

async function loadRules(ruleType: PricingRuleType, countryId?: string) {
  return PricingRule.findAll({
    where: { ruleType, isActive: true, ...(countryId ? { countryId } : {}) },
    order: [["priority", "DESC"]],
  });
}

async function calculateTimeSurcharge(
  ruleType: PricingRuleType,
  amount: number,
  timestamp: Date,
  countryId?: string
) {
  const rules = await loadRules(ruleType, countryId);
  let total = 0;
  const ruleRefs: Array<{ id: string | null; type: PricingRuleType }> = [];
  for (const rule of rules) {
    if (!isRuleActiveForTimestamp(rule, timestamp)) continue;
    ruleRefs.push({ id: rule.id, type: rule.ruleType });

    switch (rule.adjustmentType) {
      case PricingAdjustmentType.PERCENTAGE:
        total += amount * (rule.adjustmentValue / 100);
        break;
      case PricingAdjustmentType.FIXED:
        total += rule.adjustmentValue;
        break;
      default:
        total += amount * DEFAULT_SURCHARGES[ruleType];
        break;
    }
  }

  if (!rules.length) {
    total = amount * DEFAULT_SURCHARGES[ruleType];
    ruleRefs.push({ id: null, type: ruleType });
  }

  return { amount: Number(total), ruleRefs };
}

export async function calculateWaitingFees(arrival?: Date, departure?: Date, countryId?: string) {
  if (!arrival || !departure) {
    return {
      waitingDurationSeconds: 0,
      waitingBillableSeconds: 0,
      waitingFee: 0,
      freeSeconds: 0,
      ruleId: null,
    };
  }

  const seconds = Math.max(0, Math.round((departure.getTime() - arrival.getTime()) / 1000));
  const rule = (await loadRules(PricingRuleType.WAITING, countryId))[0];
  const freeMinutes = rule?.freeMinutes ?? DEFAULT_WAITING_FREE_MINUTES;
  const ratePerMinute =
    rule?.adjustmentType === PricingAdjustmentType.PER_MINUTE ? rule.adjustmentValue : DEFAULT_WAITING_RATE;
  const freeSeconds = freeMinutes * 60;
  const billableSeconds = Math.max(0, seconds - freeSeconds);
  const fee = (billableSeconds / 60) * ratePerMinute;

  return {
    waitingDurationSeconds: seconds,
    waitingBillableSeconds: Math.ceil(billableSeconds),
    waitingFee: Number(fee.toFixed(2)),
    freeSeconds,
    ruleId: rule?.id ?? null,
  };
}

export async function calculateDeliveryPricing(input: PricingCalculationInput) {
  const config = await resolveVehiclePricingConfig(input.vehicleType, input.countryId);
  const distanceComponent = Number(config.perKmRate) * input.distanceKm;
  const timeComponent = Number(config.perMinuteRate) * input.durationMinutes;
  const baseFare = Number(config.baseFare);
  const bookingFee = Number(config.bookingFee);
  const extras = input.extras ?? 0;
  const rawTotal = baseFare + bookingFee + distanceComponent + timeComponent + extras;

  const pickupTimestamp = parseTimestamp(input.pickupTimestamp);
  const peak = await calculateTimeSurcharge(PricingRuleType.PEAK, rawTotal, pickupTimestamp, input.countryId);
  const night = await calculateTimeSurcharge(PricingRuleType.NIGHT, rawTotal, pickupTimestamp, input.countryId);
  const earlyMorning = await calculateTimeSurcharge(
    PricingRuleType.EARLY_MORNING,
    rawTotal,
    pickupTimestamp,
    input.countryId
  );

  const totalWithSurcharges =
    rawTotal + peak.amount + night.amount + earlyMorning.amount;
  const minimumFare = Number(config.minimumFare);
  const adjustedTotal = Math.max(totalWithSurcharges, minimumFare);
  const rounded = Math.ceil(adjustedTotal / 50) * 50;

  const driverConfig = await resolveDriverRevenueConfig(input.vehicleType, input.countryId);
  const revenueParams: RevenueCalculationInput = {
    distanceKm: input.distanceKm,
    durationMinutes: input.durationMinutes,
    extras,
    tip: input.tip ?? 0,
  };
  const revenue = calculateDriverRevenue(driverConfig, revenueParams);

  const snapshot: PricingSnapshot = {
    baseFare,
    bookingFee,
    distanceComponent,
    timeComponent,
    extras,
    surcharges: {
      peak: Number(peak.amount.toFixed(0)),
      night: Number(night.amount.toFixed(0)),
      earlyMorning: Number(earlyMorning.amount.toFixed(0)),
    },
    minimumFare,
    rawTotal,
    adjustedTotal,
    driverRevenue: revenue.driverEarnings,
    platformCommission: revenue.platformCommission,
    serviceFee: revenue.serviceFee,
    ruleReferences: [...peak.ruleRefs, ...night.ruleRefs, ...earlyMorning.ruleRefs],
  };

  return {
    price: Number(rounded.toFixed(0)),
    baseFare,
    bookingFee,
    distanceComponent,
    timeComponent,
    minimumFareApplied: rounded === minimumFare,
    driverEarnings: revenue.driverEarnings,
    platformCommission: revenue.platformCommission,
    serviceFee: revenue.serviceFee,
    peakSurcharge: Number(peak.amount.toFixed(0)),
    nightSurcharge: Number(night.amount.toFixed(0)),
    earlyMorningSurcharge: Number(earlyMorning.amount.toFixed(0)),
    snapshot,
  } as PricingCalculationResult;
}
