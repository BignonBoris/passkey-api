import { Router } from "express";
import { verifyOtp } from "./verifyOtp.controller";

const router = Router();

 /**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     summary: Verify OTP (login, sign-up or password recovery) and generate JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - role
 *               - otp
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "+22961234567"
 *               role:
 *                 type: string
 *                 enum: [usager, livreur, admin, sous-admin]
 *                 example: "usager"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Authentication successful
 */
router.post("/", verifyOtp);

export default router;
