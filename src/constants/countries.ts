export const BENIN_COUNTRY_ID = "11111111-1111-1111-1111-111111111111";
export const TOGO_COUNTRY_ID = "22222222-2222-2222-2222-222222222222";

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
    centerLatitude: 9.3077,
    centerLongitude: 2.3158,
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
    centerLatitude: 8.6195,
    centerLongitude: 0.8248,
    isActive: true,
    isDefault: false,
  },
];
