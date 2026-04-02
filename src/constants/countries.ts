import { createHash } from 'crypto';

function generateStableId(code: string): string {
  return createHash('md5').update(code).digest('hex').substring(0, 16);
}

export const BENIN_COUNTRY_ID = generateStableId("benin");
export const TOGO_COUNTRY_ID = generateStableId("togo");
export const SENEGAL_COUNTRY_ID = generateStableId("senegal");
export const IVORY_COAST_COUNTRY_ID = generateStableId("cote-divoire");
export const GHANA_COUNTRY_ID = generateStableId("ghana");
export const BURKINA_FASO_COUNTRY_ID = generateStableId("burkina-faso");

export type SupportedCountrySeed = {
  id: string;
  code: string;
  iso2: string;
  iso3: string;
  name: string;
  phoneCode: string;
  currencyCode: string;
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
  centerLatitude: number;
  centerLongitude: number;
  isActive: boolean;
  isDefault: boolean;
};

export const DEFAULT_COUNTRY_ID = BENIN_COUNTRY_ID;

export const DEFAULT_COUNTRIES: SupportedCountrySeed[] = [
  {
    id: BENIN_COUNTRY_ID,
    code: "benin",
    iso2: "BJ",
    iso3: "BEN",
    name: "Benin",
    phoneCode: "+229",
    currencyCode: "XOF",
    minLatitude: 6.1,
    maxLatitude: 12.5,
    minLongitude: 0.7,
    maxLongitude: 3.9,
    centerLatitude: 6.4969,
    centerLongitude: 2.6289,
    isActive: true,
    isDefault: true,
  },
  {
    id: TOGO_COUNTRY_ID,
    code: "togo",
    iso2: "TG",
    iso3: "TGO",
    name: "Togo",
    phoneCode: "+228",
    currencyCode: "XOF",
    minLatitude: 6.0,
    maxLatitude: 11.3,
    minLongitude: -0.2,
    maxLongitude: 1.9,
    centerLatitude: 6.1256,
    centerLongitude: 1.2254,
    isActive: true,
    isDefault: false,
  },
  {
    id: SENEGAL_COUNTRY_ID,
    code: "senegal",
    iso2: "SN",
    iso3: "SEN",
    name: "Senegal",
    phoneCode: "+221",
    currencyCode: "XOF",
    minLatitude: 12.3,
    maxLatitude: 16.7,
    minLongitude: -17.5,
    maxLongitude: -11.3,
    centerLatitude: 14.7167,
    centerLongitude: -17.4677,
    isActive: true,
    isDefault: false,
  },
  {
    id: IVORY_COAST_COUNTRY_ID,
    code: "cote-divoire",
    iso2: "CI",
    iso3: "CIV",
    name: "Cote d'Ivoire",
    phoneCode: "+225",
    currencyCode: "XOF",
    minLatitude: 4.3,
    maxLatitude: 10.7,
    minLongitude: -8.6,
    maxLongitude: -2.5,
    centerLatitude: 6.8276,
    centerLongitude: -5.2893,
    isActive: true,
    isDefault: false,
  },
  {
    id: GHANA_COUNTRY_ID,
    code: "ghana",
    iso2: "GH",
    iso3: "GHA",
    name: "Ghana",
    phoneCode: "+233",
    currencyCode: "GHS",
    minLatitude: 4.7,
    maxLatitude: 11.2,
    minLongitude: -3.3,
    maxLongitude: 1.2,
    centerLatitude: 5.6037,
    centerLongitude: -0.187,
    isActive: true,
    isDefault: false,
  },
  {
    id: BURKINA_FASO_COUNTRY_ID,
    code: "burkina-faso",
    iso2: "BF",
    iso3: "BFA",
    name: "Burkina Faso",
    phoneCode: "+226",
    currencyCode: "XOF",
    minLatitude: 9.4,
    maxLatitude: 15.0,
    minLongitude: -5.5,
    maxLongitude: 2.4,
    centerLatitude: 12.3714,
    centerLongitude: -1.5197,
    isActive: true,
    isDefault: false,
  },
];

