import { Request, Response } from "express";
import { verifyOtpSchema } from "./verifyOtp.dto";
import { VerifyOtpService } from "./verifyOtp.service";

export async function verifyOtp(req: Request, res: Response) {
  const body = verifyOtpSchema.parse(req.body);

console.log({body});
  const result = await VerifyOtpService.verifyOTP(body.phone, body.otp);

  if ((result as any)?.success === false) {
    return res.status(400).json({
      success: false,
      message: (result as any).message || "OTP invalid",
      data: null,
    });
  }

  res.json({
    success: true,
    message: "Login successful",
    data: result,
  });
}
