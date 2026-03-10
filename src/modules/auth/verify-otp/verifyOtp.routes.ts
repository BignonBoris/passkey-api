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
 *               - otp
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "+22961234567"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Authentication successful
 */
router.post("/", verifyOtp);

export default router;
