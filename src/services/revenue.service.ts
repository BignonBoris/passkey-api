import DriverRevenueConfig from "../models/driver-revenue-config.model";

export interface RevenueCalculationInput {
  courseAmount: number;
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
  const courseAmount = roundCurrency(Number(params.courseAmount || 0));
  const settlement = calculateCourseRevenueSettlement(config, { courseAmount });
  const extras = params.extras ?? 0;
  const tip = params.tip ?? 0;
  const driverEarnings = settlement.driverRevenue + tip;

  return {
    driverEarnings: Number(driverEarnings.toFixed(2)),
    platformCommission: Number(settlement.platformShare.toFixed(2)),
    serviceFee: 0,
    distanceComponent: 0,
    timeComponent: 0,
    baseFare: 0,
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
  const percent = Math.max(0, Number(share.driverPercent || 0));
  const driverRevenue = roundCurrency(courseAmount * (percent / 100));
  const platformShare = roundCurrency(courseAmount - driverRevenue);

  return {
    courseAmount,
    driverFixedAmount: 0,
    driverPercent: Number(percent.toFixed(2)),
    driverRevenue,
    platformShare,
  };
}
