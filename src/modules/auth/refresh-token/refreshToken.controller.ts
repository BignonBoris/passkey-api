import { Request, Response } from "express";
import { RefreshTokenService } from "./refreshToken.service";

export class RefreshTokenController {
  static async refresh(req: Request, res: Response) {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token manquant.",
      });
    }

    const result = await RefreshTokenService.refresh(refreshToken);
    return res.status(result.status).json(result);
  }
}
