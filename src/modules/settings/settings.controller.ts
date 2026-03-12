import { Request, Response } from "express";
import AppSettings, {
  SettingsSection,
  normalizeSettingsContent,
} from "../../models/app-settings.model";

const PREDEFINED_SECTIONS: SettingsSection[] = ["contact", "about"];

type DynamicItems = Record<string, string>[];

function sanitizeSectionInput(input: unknown): Record<string, string> {
  const normalized: Record<string, string> = {};

  if (!Array.isArray(input)) return normalized;

  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const entries = Object.entries(item as Record<string, unknown>);
    if (entries.length === 0) continue;

    const [key, rawValue] = entries[0];
    const cleanKey = String(key ?? "").trim();
    if (!cleanKey) continue;

    normalized[cleanKey] = String(rawValue ?? "").trim();
  }

  return normalized;
}

function toDynamicItems(sectionData: Record<string, string> | null | undefined): DynamicItems {
  if (!sectionData || typeof sectionData !== "object") return [];
  return Object.entries(sectionData).map(([key, value]) => ({ [key]: String(value ?? "") }));
}

async function buildSettingsResponse() {
  const rows = await AppSettings.findAll({
    where: { section: PREDEFINED_SECTIONS },
  });

  const map: Record<SettingsSection, Record<string, string>> = {
    contact: {},
    about: {},
  };

  for (const row of rows) {
    const section = row.get("section") as SettingsSection;
    map[section] = normalizeSettingsContent(row.get("content"));
  }

  return {
    contact: toDynamicItems(map.contact),
    about: toDynamicItems(map.about),
  };
}

export async function getSettings(req: Request, res: Response) {
  try {
    const data = await buildSettingsResponse();
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to fetch settings" });
  }
}

export async function updateSettings(req: Request, res: Response) {
  try {
    const payload = req.body || {};
    const hasContact = Object.prototype.hasOwnProperty.call(payload, "contact");
    const hasAbout = Object.prototype.hasOwnProperty.call(payload, "about");

    if (!hasContact && !hasAbout) {
      return res.status(400).json({
        success: false,
        message: "At least one section is required: contact or about",
      });
    }

    const updates: Array<{ section: SettingsSection; content: Record<string, string> }> = [];

    if (hasContact) {
      updates.push({ section: "contact", content: sanitizeSectionInput(payload.contact) });
    }

    if (hasAbout) {
      updates.push({ section: "about", content: sanitizeSectionInput(payload.about) });
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
    return res.status(500).json({ success: false, message: error?.message || "Failed to update settings" });
  }
}
