import PricingRule, { PricingRuleType } from "@/models/pricing-rule.model";

export interface PricingRulePayload {
  countryId?: string;
  ruleType: PricingRuleType;
  name: string;
  daysOfWeek?: string;
  startTime?: string;
  endTime?: string;
  adjustmentType: string;
  adjustmentValue?: number;
  freeMinutes?: number;
  fixedFee?: number;
  isActive?: boolean;
  priority?: number;
}

export async function listPricingRules(type?: PricingRuleType, countryId?: string) {
  const where: Record<string, unknown> = {};
  if (type) where.ruleType = type;
  if (countryId) where.countryId = countryId;
  return PricingRule.findAll({
    where,
    order: [["priority", "DESC"], ["updatedAt", "DESC"]],
  });
}

export async function upsertPricingRule(payload: PricingRulePayload & { id?: string }) {
  if (payload.id) {
    const row = await PricingRule.findByPk(payload.id);
    if (row) {
      row.set(payload as any);
      await row.save();
      return row;
    }
  }
  return PricingRule.create(payload as any);
}

export async function removePricingRule(id: string) {
  const row = await PricingRule.findByPk(id);
  if (!row) return null;
  await row.destroy();
  return row;
}
