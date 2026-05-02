export const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key";
export const JWT_EXPIRES_IN = "7d"; // ou "1h", selon besoin

export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "super_refresh_secret_key";
export const JWT_REFRESH_EXPIRES_IN = "365d"; 
