import { Request, Response } from "express";
import { LoginService } from "./login.service";
import { loginSchema } from "./login.dto";

export async function login(req: Request, res: Response) {
  const body = loginSchema.parse(req.body);
  const result = await LoginService.login(body.phone, body.password, body.role );
  // const result = await LoginService.sendOTP(body.phone, body.password);

  res.json({
    success: true,
    message: "OTP sent",
    data: result,
  });
}
