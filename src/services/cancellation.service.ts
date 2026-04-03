import { PricingRuleType, PricingAdjustmentType } from "../models/pricing-rule.model";
import { calculateWaitingFees } from "../services/pricing.service";
import PricingRule from "../models/pricing-rule.model";

const DEFAULT_DRIVER_SHARE_PERCENTAGE = 0.6;
const DEFAULT_CANCELLATION_AFTER_FEE = 500;

async function loadCancellationRule(type: PricingRuleType) {
  const rules = await PricingRule.findAll({
    where: { ruleType: type, isActive: true },
    order: [["priority", "DESC"]],
  });
  return rules[0] ?? null;
}

export interface CancellationFeesResult {
  cancellationFee: number;
  waitingFee: number;
  waitingDurationSeconds: number;
  waitingBillableSeconds: number;
  driverShare: number;
  platformShare: number;
  ruleId: string | null;
}

export async function calculateCancellationFees(params: {
  orderId: string;
  driverArrivedAt?: Date | null;
  cancelledAt: Date;
  countryId?: string;
}) {
  const { driverArrivedAt, cancelledAt, countryId } = params;
  const isAfterArrival = Boolean(driverArrivedAt && cancelledAt > driverArrivedAt);
  const ruleType = isAfterArrival
    ? PricingRuleType.CANCELLATION_AFTER_ARRIVAL
    : PricingRuleType.CANCELLATION_BEFORE_ARRIVAL;
  const rules = await PricingRule.findAll({
    where: { ruleType, isActive: true, ...(countryId ? { countryId } : {}) },
    order: [["priority", "DESC"]],
  });
  const rule = rules[0] ?? null;
  const freeMinutes = rule?.freeMinutes ?? 0;
  const fixedFee =
    rule?.adjustmentType === PricingAdjustmentType.FIXED
      ? rule.adjustmentValue
      : isAfterArrival
      ? DEFAULT_CANCELLATION_AFTER_FEE
      : 0;

  const waitingData = isAfterArrival
    ? await calculateWaitingFees(driverArrivedAt ?? cancelledAt, cancelledAt, countryId)
    : await calculateWaitingFees(driverArrivedAt ?? cancelledAt, cancelledAt, countryId);
  const waitingFee = waitingData.waitingFee;

  const cancellationFee = Number((fixedFee + waitingFee).toFixed(2));
  const driverSharePercent =
    rule?.adjustmentType === PricingAdjustmentType.PERCENTAGE
      ? rule.adjustmentValue / 100
      : DEFAULT_DRIVER_SHARE_PERCENTAGE;
  const driverShare = Number((cancellationFee * driverSharePercent).toFixed(2));
  const platformShare = Number((cancellationFee - driverShare).toFixed(2));

  return {
    cancellationFee,
    waitingFee,
    waitingDurationSeconds: waitingData.waitingDurationSeconds,
    waitingBillableSeconds: waitingData.waitingBillableSeconds,
    driverShare,
    platformShare,
    ruleId: rule?.id ?? null,
  } as CancellationFeesResult;
}
