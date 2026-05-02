import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_SECRET } from "../../../config/jwt";
import User from "../../../models/user.model";

export class RefreshTokenService {
  static async refresh(refreshToken: string) {
    try {
      // 1. Verify the refresh token
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { id: string };

      // 2. Check if user exists and has this refresh token
      const user = await User.findByPk(decoded.id);
      if (!user || user.refreshToken !== refreshToken) {
        return {
          success: false,
          status: 401,
          message: "Session expirée ou invalide. Veuillez vous reconnecter.",
        };
      }

      // 3. Check if account is suspended
      if (user.accountStatus === "suspended") {
        return {
          success: false,
          status: 403,
          message: "Votre compte est bloqué. Contactez le support.",
        };
      }

      // 4. Generate new Access Token
      const canAccessCourier = user.identityVerified;
      const newToken = jwt.sign(
        { id: user.id, role: user.role, canAccessCourier },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      return {
        success: true,
        status: 200,
        data: {
          token: newToken,
        },
      };
    } catch (error) {
      return {
        success: false,
        status: 401,
        message: "Token de rafraîchissement invalide.",
      };
    }
  }
}
