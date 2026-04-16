import { Request, Response } from "express";
import AppSettings, {
  SettingsSection,
  SettingsContent,
  SettingsEntryObject,
  normalizeSettingsContent,
} from "../../models/app-settings.model";

const PREDEFINED_SECTIONS: SettingsSection[] = ["contact", "about", "operations"];

type DynamicItem = {
  key: string;
  value: string;
  icon?: string;
};
type DynamicItems = DynamicItem[];

function normalizeDynamicValue(rawValue: unknown): SettingsEntryObject {
  if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
    const item = rawValue as Record<string, unknown>;
    const value = String(item.value ?? "").trim();
    const icon = String(item.icon ?? item.iconKey ?? "").trim();
    return icon ? { value, icon } : { value };
  }

  return { value: String(rawValue ?? "").trim() };
}

function sanitizeDynamicSectionInput(input: unknown): SettingsContent {
  const normalized: SettingsContent = {};

  if (!Array.isArray(input)) return normalized;

  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const explicitKey = String(record.key ?? "").trim();

    let cleanKey = explicitKey;
    let entryValue: SettingsEntryObject;

    if (cleanKey) {
      entryValue = {
        value: String(record.value ?? "").trim(),
      };
      const icon = String(record.icon ?? record.iconKey ?? "").trim();
      if (icon) entryValue.icon = icon;
    } else {
      const entries = Object.entries(record);
      if (entries.length === 0) continue;
      const [legacyKey, legacyValue] = entries[0];
      cleanKey = String(legacyKey ?? "").trim();
      entryValue = normalizeDynamicValue(legacyValue);
    }

    if (!cleanKey) continue;

    normalized[cleanKey] = entryValue;
  }

  return normalized;
}

function sanitizeOperationsInput(input: unknown): SettingsContent {
  const normalized: SettingsContent = {};
  if (!Array.isArray(input)) return normalized;

  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const explicitKey = String(record.key ?? "").trim();

    if (explicitKey) {
      normalized[explicitKey] = String(record.value ?? "").trim();
      continue;
    }

    const entries = Object.entries(record);
    if (entries.length === 0) continue;
    const [legacyKey, rawValue] = entries[0];
    const cleanKey = String(legacyKey ?? "").trim();
    if (!cleanKey) continue;
    normalized[cleanKey] = String(rawValue ?? "").trim();
  }

  return normalized;
}

function toDynamicItems(sectionData: SettingsContent | null | undefined): DynamicItems {
  if (!sectionData || typeof sectionData !== "object") return [];
  return Object.entries(sectionData).map(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const item = value as SettingsEntryObject;
      return {
        key,
        value: String(item.value ?? ""),
        ...(item.icon ? { icon: String(item.icon) } : {}),
      };
    }

    return {
      key,
      value: String(value ?? ""),
    };
  });
}

async function buildSettingsResponse() {
  const rows = await AppSettings.findAll({
    where: { section: PREDEFINED_SECTIONS },
  });

  const map: Record<SettingsSection, SettingsContent> = {
    contact: {},
    about: {},
    operations: {},
  };

  for (const row of rows) {
    const section = row.get("section") as SettingsSection;
    map[section] = normalizeSettingsContent(row.get("content"));
  }

  return {
    contact: toDynamicItems(map.contact),
    about: toDynamicItems(map.about),
    operations: toDynamicItems(map.operations),
  };
}

export async function getSettings(req: Request, res: Response) {
  try {
    const data = await buildSettingsResponse();
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de recuperer les parametres" });
  }
}

export async function updateSettings(req: Request, res: Response) {
  try {
    const payload = req.body || {};
    const hasContact = Object.prototype.hasOwnProperty.call(payload, "contact");
    const hasAbout = Object.prototype.hasOwnProperty.call(payload, "about");
    const hasOperations = Object.prototype.hasOwnProperty.call(payload, "operations");

    if (!hasContact && !hasAbout && !hasOperations) {
      return res.status(400).json({
        success: false,
        message: "Au moins une section est requise : contact, about ou operations",
      });
    }

    const updates: Array<{ section: SettingsSection; content: SettingsContent }> = [];

    if (hasContact) {
      updates.push({ section: "contact", content: sanitizeDynamicSectionInput(payload.contact) });
    }

    if (hasAbout) {
      updates.push({ section: "about", content: sanitizeDynamicSectionInput(payload.about) });
    }

    if (hasOperations) {
      updates.push({ section: "operations", content: sanitizeOperationsInput(payload.operations) });
    }

    for (const update of updates) {
      const existing = await AppSettings.findOne({ where: { section: update.section } });
      if (existing) {
        const currentContent = normalizeSettingsContent(existing.get("content"));
        if (JSON.stringify(currentContent) !== JSON.stringify(update.content)) {
          existing.set("content", update.content);
          await existing.save();
        }
      } else {
        await AppSettings.create(update);
      }
    }

    const data = await buildSettingsResponse();
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de mettre a jour les parametres" });
  }
}
