import { Request, Response } from "express";
import { randomUUID } from "crypto";
import AppSettings, {
  SettingsSection,
  SettingsContent,
  SettingsEntryObject,
  normalizeSettingsContent,
} from "../../models/app-settings.model";
import { getGoogleMapsApiKey } from "../maps/maps.config";

const PREDEFINED_SECTIONS: SettingsSection[] = ["contact", "about", "operations"];
const PARCEL_NATURES_KEY = "parcelNatureCatalog";
const PARCEL_NATURE_OPTIONS_KEY = "parcelNatureOptions";
const DEFAULT_PARCEL_NATURES = [
  "Documents",
  "Repas",
  "Vetements",
  "Chaussures",
  "Medicaments",
  "Produits cosmetiques",
  "Appareil electronique",
  "Accessoires electroniques",
  "Pieces de rechange",
  "Courses / provisions",
  "Articles de bureau",
  "Cadeau",
  "Fleurs",
  "Livre / cahiers",
  "Colis fragile",
  "Autre",
];

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

type ParcelNatureItem = {
  id: string;
  label: string;
};

function normalizeParcelNatureLabel(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeParcelNatureLabels(items: ParcelNatureItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.label.toLocaleLowerCase("fr");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseParcelNatureCatalog(rawValue: unknown): ParcelNatureItem[] {
  const raw = String(rawValue ?? "").trim();
  if (!raw) {
    return DEFAULT_PARCEL_NATURES.map((label) => ({ id: randomUUID(), label }));
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return DEFAULT_PARCEL_NATURES.map((label) => ({ id: randomUUID(), label }));
    }

    const items = parsed
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        const record = item as Record<string, unknown>;
        const label = normalizeParcelNatureLabel(record.label);
        if (!label) return null;
        return {
          id: String(record.id ?? randomUUID()).trim() || randomUUID(),
          label,
        };
      })
      .filter((item): item is ParcelNatureItem => item !== null);

    const unique = dedupeParcelNatureLabels(items);
    return unique.length
      ? unique
      : DEFAULT_PARCEL_NATURES.map((label) => ({ id: randomUUID(), label }));
  } catch {
    return DEFAULT_PARCEL_NATURES.map((label) => ({ id: randomUUID(), label }));
  }
}

async function getOperationsSettingsRow() {
  const existing = await AppSettings.findOne({ where: { section: "operations" } });
  if (existing) return existing;
  return AppSettings.create({ section: "operations", content: {} });
}

function serializeParcelNatureCatalog(items: ParcelNatureItem[]) {
  return JSON.stringify(items.map((item) => ({ id: item.id, label: item.label })));
}

function serializeParcelNatureOptions(items: ParcelNatureItem[]) {
  return JSON.stringify(items.map((item) => item.label));
}

async function loadParcelNatureCatalog() {
  const row = await getOperationsSettingsRow();
  const content = normalizeSettingsContent(row.get("content"));
  const items = parseParcelNatureCatalog(content[PARCEL_NATURES_KEY]);

  const nextContent: SettingsContent = {
    ...content,
    [PARCEL_NATURES_KEY]: serializeParcelNatureCatalog(items),
    [PARCEL_NATURE_OPTIONS_KEY]: serializeParcelNatureOptions(items),
  };

  if (JSON.stringify(content) !== JSON.stringify(nextContent)) {
    row.set("content", nextContent);
    await row.save();
  }

  return { row, content: nextContent, items };
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

export async function listParcelNatures(_req: Request, res: Response) {
  try {
    const { items } = await loadParcelNatureCatalog();
    return res.status(200).json({ success: true, data: items });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Impossible de recuperer les natures de colis",
    });
  }
}

export async function getAdminGoogleMapsKey(_req: Request, res: Response) {
  try {
    const apiKey = getGoogleMapsApiKey();
    return res.status(200).json({
      success: true,
      data: {
        apiKey,
        source: apiKey ? "api" : "none",
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Impossible de recuperer la cle Google Maps",
    });
  }
}

export async function createParcelNature(req: Request, res: Response) {
  try {
    const label = normalizeParcelNatureLabel(req.body?.label);
    if (!label) {
      return res.status(400).json({ success: false, message: "Le libelle est requis" });
    }

    const { row, content, items } = await loadParcelNatureCatalog();
    const exists = items.some((item) => item.label.toLocaleLowerCase("fr") === label.toLocaleLowerCase("fr"));
    if (exists) {
      return res.status(409).json({ success: false, message: "Cette nature de colis existe deja" });
    }

    const nextItems = [...items, { id: randomUUID(), label }];
    row.set("content", {
      ...content,
      [PARCEL_NATURES_KEY]: serializeParcelNatureCatalog(nextItems),
      [PARCEL_NATURE_OPTIONS_KEY]: serializeParcelNatureOptions(nextItems),
    });
    await row.save();

    return res.status(201).json({ success: true, data: nextItems[nextItems.length - 1] });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Impossible d'ajouter la nature de colis",
    });
  }
}

export async function updateParcelNature(req: Request, res: Response) {
  try {
    const targetId = String(req.params.id || "").trim();
    const label = normalizeParcelNatureLabel(req.body?.label);
    if (!targetId) {
      return res.status(400).json({ success: false, message: "Identifiant invalide" });
    }
    if (!label) {
      return res.status(400).json({ success: false, message: "Le libelle est requis" });
    }

    const { row, content, items } = await loadParcelNatureCatalog();
    const index = items.findIndex((item) => item.id === targetId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: "Nature de colis introuvable" });
    }

    const duplicate = items.some(
      (item) =>
        item.id !== targetId &&
        item.label.toLocaleLowerCase("fr") === label.toLocaleLowerCase("fr")
    );
    if (duplicate) {
      return res.status(409).json({ success: false, message: "Cette nature de colis existe deja" });
    }

    const nextItems = items.map((item) => (item.id === targetId ? { ...item, label } : item));
    const updated = nextItems[index];
    row.set("content", {
      ...content,
      [PARCEL_NATURES_KEY]: serializeParcelNatureCatalog(nextItems),
      [PARCEL_NATURE_OPTIONS_KEY]: serializeParcelNatureOptions(nextItems),
    });
    await row.save();

    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Impossible de modifier la nature de colis",
    });
  }
}

export async function deleteParcelNature(req: Request, res: Response) {
  try {
    const targetId = String(req.params.id || "").trim();
    if (!targetId) {
      return res.status(400).json({ success: false, message: "Identifiant invalide" });
    }

    const { row, content, items } = await loadParcelNatureCatalog();
    const nextItems = items.filter((item) => item.id !== targetId);
    if (nextItems.length === items.length) {
      return res.status(404).json({ success: false, message: "Nature de colis introuvable" });
    }

    row.set("content", {
      ...content,
      [PARCEL_NATURES_KEY]: serializeParcelNatureCatalog(nextItems),
      [PARCEL_NATURE_OPTIONS_KEY]: serializeParcelNatureOptions(nextItems),
    });
    await row.save();

    return res.status(200).json({ success: true, message: "Nature de colis supprimee" });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Impossible de supprimer la nature de colis",
    });
  }
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
