import { Request, Response } from "express";
import { verifyOtpSchema } from "./verifyOtp.dto";
import { VerifyOtpService } from "./verifyOtp.service";

export async function verifyOtp(req: Request, res: Response) {
  const body = verifyOtpSchema.parse(req.body);

  const result = await VerifyOtpService.verifyOTP(body.phone, body.role, body.otp);

  if ((result as any)?.success === false) {
    return res.status((result as any)?.status ?? 400).json({
      success: false,
      message: (result as any).message || "Code OTP invalide.",
      data: null,
    });
  }

  res.json({
    success: true,
    message: "Téléphone vérifié avec succès.",
    data: result,
  });
}
