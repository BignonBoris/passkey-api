import Order from "../models/order.model";

const PUBLIC_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function buildDateSegment(date: Date): string {
  const year = String(date.getUTCFullYear()).slice(-2);
  const month = padDatePart(date.getUTCMonth() + 1);
  const day = padDatePart(date.getUTCDate());
  return `${year}${month}${day}`;
}

function buildRandomSegment(length: number = 5): string {
  let output = "";
  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * PUBLIC_CODE_ALPHABET.length);
    output += PUBLIC_CODE_ALPHABET[randomIndex];
  }
  return output;
}

export async function generateUniqueOrderPublicCode(prefix: string = "CRS"): Promise<string> {
  const normalizedPrefix = String(prefix || "CRS").trim().toUpperCase() || "CRS";
  const dateSegment = buildDateSegment(new Date());

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const publicCode = `${normalizedPrefix}-${dateSegment}-${buildRandomSegment()}`;
    const existing = await Order.findOne({
      where: { publicCode },
      attributes: ["id"],
    });
    if (!existing) {
      return publicCode;
    }
  }

  throw new Error("Impossible de generer un code public de course unique.");
}
