import { Router } from "express";
import { login } from "./login.controller";

const router = Router();

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Send OTP to phone
 *     tags: [Auth]
 *     requestBody:
 *        required : true
 *        content : 
 *           application/json:
 *              schema:
 *                 type: object
 *                 required:
 *                    - phone
 *                 properties:
 *                    phone:
 *                       type: string
 *                       example: "+22961234567"
 *                    password:
 *                       type: string
 *                       example: "superSecret123"
 *     responses:
 *        200:
 *           description: OTP sent successfully
 *           content:
 *              application/json:
 *                  schema:
 *                      $ref: "#/components/schemas/AuthResponse"
 */
router.post("/", login);

export default router;
