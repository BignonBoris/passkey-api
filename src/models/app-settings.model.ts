import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

export type SettingsSection = "contact" | "about" | "operations";
export type SettingsEntryObject = {
  value: string;
  icon?: string;
};
export type SettingsEntryValue = string | SettingsEntryObject;
export type SettingsContent = Record<string, SettingsEntryValue>;

export function normalizeSettingsContent(value: unknown): SettingsContent {
  let parsedValue = value;

  if (typeof parsedValue === "string") {
    try {
      parsedValue = JSON.parse(parsedValue);
    } catch {
      return {};
    }
  }

  if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
    return {};
  }

  const normalizedEntries: Array<[string, SettingsEntryValue]> = [];

  for (const [key, entryValue] of Object.entries(parsedValue as Record<string, unknown>)) {
    const cleanKey = String(key ?? "").trim();
    if (!cleanKey) continue;

    if (entryValue && typeof entryValue === "object" && !Array.isArray(entryValue)) {
      const raw = entryValue as Record<string, unknown>;
      const value = String(raw.value ?? "").trim();
      const icon = String(raw.icon ?? raw.iconKey ?? "").trim();
      normalizedEntries.push([cleanKey, icon ? { value, icon } : { value }]);
      continue;
    }

    normalizedEntries.push([cleanKey, String(entryValue ?? "").trim()]);
  }

  return Object.fromEntries(normalizedEntries) as SettingsContent;
}

class AppSettings extends Model {
  public id!: string;
  public section!: SettingsSection;
  public content!: SettingsContent;
}

AppSettings.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    section: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    content: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
      get() {
        return normalizeSettingsContent(this.getDataValue("content"));
      },
      set(value: unknown) {
        this.setDataValue("content", normalizeSettingsContent(value));
      },
    },
  },
  {
    sequelize,
    modelName: "AppSettings",
    tableName: "AppSettings",
    freezeTableName: true,
  }
);

export default AppSettings;
