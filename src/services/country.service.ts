import Country from "@/models/country.model";
import { DEFAULT_COUNTRIES, DEFAULT_COUNTRY_ID } from "@/constants/countries";
import { Op } from "sequelize";

function normalizeCountryLookup(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

export async function ensureDefaultCountries() {
  for (const country of DEFAULT_COUNTRIES) {
    const existing =
      (await Country.findByPk(country.id)) ||
      (await Country.findOne({
        where: {
          iso2: country.iso2,
        },
      }));

    if (existing) {
      existing.set(country);
      await existing.save();
      continue;
    }

    await Country.create(country as any);
  }
}

export async function getDefaultCountry() {
  const country =
    (await Country.findByPk(DEFAULT_COUNTRY_ID)) ||
    (await Country.findOne({ where: { isDefault: true } })) ||
    (await Country.findOne({ order: [["createdAt", "ASC"]] }));

  if (!country) {
    throw new Error("Aucun pays par defaut n'est configure.");
  }

  return country;
}

export async function resolveCountryId(value?: string | null) {
  const normalized = normalizeCountryLookup(value);
  if (!normalized) {
    const defaultCountry = await getDefaultCountry();
    return String(defaultCountry.get("id"));
  }

  const country = await Country.findOne({
    where: {
      [Op.or]: [
        { id: normalized },
        { code: normalized },
        { iso2: normalized.toUpperCase() },
        { iso3: normalized.toUpperCase() },
        { name: normalized },
      ],
    },
  });

  if (country) {
    return String(country.get("id"));
  }

  const defaultCountry = await getDefaultCountry();
  return String(defaultCountry.get("id"));
}

export async function findCountryByIdOrCode(value?: string | null) {
  const resolvedId = await resolveCountryId(value);
  return Country.findByPk(resolvedId);
}

export async function detectCountryByCoordinates(latitude: number, longitude: number) {
  const rows = await Country.findAll({
    where: { isActive: true },
    order: [["isDefault", "DESC"], ["name", "ASC"]],
  });

  return (
    rows.find((row) => {
      const minLat = Number(row.get("minLatitude"));
      const maxLat = Number(row.get("maxLatitude"));
      const minLng = Number(row.get("minLongitude"));
      const maxLng = Number(row.get("maxLongitude"));

      if (
        !Number.isFinite(minLat) ||
        !Number.isFinite(maxLat) ||
        !Number.isFinite(minLng) ||
        !Number.isFinite(maxLng)
      ) {
        return false;
      }

      return latitude >= minLat && latitude <= maxLat && longitude >= minLng && longitude <= maxLng;
    }) || null
  );
}

export async function resolveCountryFromCoordinates(latitude: number, longitude: number) {
  const detected = await detectCountryByCoordinates(latitude, longitude);
  if (detected) {
    return {
      country: detected,
      matchedByGps: true,
    };
  }

  return {
    country: await getDefaultCountry(),
    matchedByGps: false,
  };
}
