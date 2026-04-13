import DriverRevenueConfig from "../models/driver-revenue-config.model";

export interface RevenueCalculationInput {
  distanceKm: number;
  durationMinutes: number;
  tip?: number;
  extras?: number;
}

export interface RevenueCalculationResult {
  driverEarnings: number;
  platformCommission: number;
  serviceFee: number;
  distanceComponent: number;
  timeComponent: number;
  baseFare: number;
  tip: number;
  extras: number;
}

export interface CourseRevenueSettlementInput {
  courseAmount: number;
}

export interface CourseRevenueSettlementResult {
  courseAmount: number;
  driverFixedAmount: number;
  driverPercent: number;
  driverRevenue: number;
  platformShare: number;
}

export function calculateDriverRevenue(
  config: DriverRevenueConfig,
  params: RevenueCalculationInput
): RevenueCalculationResult {
  const distanceComponent = config.perKmRate * params.distanceKm;
  const timeComponent = config.perMinuteRate * params.durationMinutes;
  const baseFare = config.baseFare;
  const subtotal = baseFare + distanceComponent + timeComponent;
  const platformCommission = subtotal * (config.commissionPercent / 100);
  const serviceFee = subtotal * (config.serviceFeePercent / 100);
  const extras = params.extras ?? 0;
  const tip = params.tip ?? 0;
  const payoutBeforeExtras = subtotal - platformCommission - serviceFee;
  const driverEarnings = payoutBeforeExtras + extras + tip;

  return {
    driverEarnings: Number(driverEarnings.toFixed(2)),
    platformCommission: Number(platformCommission.toFixed(2)),
    serviceFee: Number(serviceFee.toFixed(2)),
    distanceComponent: Number(distanceComponent.toFixed(2)),
    timeComponent: Number(timeComponent.toFixed(2)),
    baseFare: Number(baseFare.toFixed(2)),
    tip: Number(tip.toFixed(2)),
    extras: Number(extras.toFixed(2)),
  };
}

function roundCurrency(value: number) {
  return Number(Math.max(0, value).toFixed(2));
}

function resolveConfiguredDriverShare(config: DriverRevenueConfig) {
  const explicitFixedAmount = Number((config as any).driverFixedAmount ?? 0);
  const explicitDriverPercent = Number((config as any).driverPercent ?? 0);

  if (explicitFixedAmount > 0 || explicitDriverPercent > 0) {
    return {
      driverFixedAmount: Math.max(0, explicitFixedAmount),
      driverPercent: Math.max(0, explicitDriverPercent),
    };
  }

  const legacyCommission = Number(config.commissionPercent ?? 0);
  const legacyServiceFee = Number(config.serviceFeePercent ?? 0);
  const derivedDriverPercent = Math.max(
    0,
    100 - legacyCommission - legacyServiceFee
  );

  return {
    driverFixedAmount: 0,
    driverPercent: derivedDriverPercent,
  };
}

export function calculateCourseRevenueSettlement(
  config: DriverRevenueConfig,
  params: CourseRevenueSettlementInput
): CourseRevenueSettlementResult {
  const courseAmount = roundCurrency(Number(params.courseAmount || 0));
  const share = resolveConfiguredDriverShare(config);
  const fixedAmount = roundCurrency(share.driverFixedAmount);
  const percent = Math.max(0, Number(share.driverPercent || 0));
  const variableComponent = roundCurrency(courseAmount * (percent / 100));
  const driverRevenue = roundCurrency(
    Math.min(courseAmount, fixedAmount + variableComponent)
  );
  const platformShare = roundCurrency(courseAmount - driverRevenue);

  return {
    courseAmount,
    driverFixedAmount: fixedAmount,
    driverPercent: Number(percent.toFixed(2)),
    driverRevenue,
    platformShare,
  };
}
