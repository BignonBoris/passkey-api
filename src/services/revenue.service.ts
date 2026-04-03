import DriverRevenueConfig from "@/models/driver-revenue-config.model";

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
