import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

export type SettingsSection = "contact" | "about";

export function normalizeSettingsContent(value: unknown): Record<string, string> {
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

  return Object.fromEntries(
    Object.entries(parsedValue as Record<string, unknown>).map(([key, entryValue]) => [
      String(key).trim(),
      String(entryValue ?? "").trim(),
    ])
  );
}

class AppSettings extends Model {
  public id!: string;
  public section!: SettingsSection;
  public content!: Record<string, string>;
}

AppSettings.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    section: {
      type: DataTypes.ENUM("contact", "about"),
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
