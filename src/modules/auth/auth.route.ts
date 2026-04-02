import { Router } from "express";
import loginRoutes from "./login/login.routes";
import verifyOtpRoutes from "./verify-otp/verifyOtp.routes";
import {
  adminSignUp,
  adminSignIn,
  checkPhone,
  forgotPassword,
  recoverPassword,
  signIn,
  signUp,
  resendOtp,
} from "./authFlow.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";

const router = Router();

router.use("/login", loginRoutes);
router.use("/verify-otp", verifyOtpRoutes);
router.post("/check-phone", checkPhone);
router.post("/resend-otp", resendOtp);
router.post("/sign-in", signIn);
router.post("/sign-up", signUp);
router.post("/register", signUp);
router.post("/password/forgot", forgotPassword);
router.post("/password/recover", recoverPassword);
router.post("/admin/sign-in", adminSignIn);
router.post("/admin/sign-up", authenticate, authorize(["admin"]), adminSignUp);

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication flow (phone check, login/register, OTP, password reset)
 */

/**
 * @swagger
 * /auth/check-phone:
 *   post:
 *     summary: Check if a phone number already exists
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/PhoneCheckRequest"
 *     responses:
 *       200:
 *         description: Returns existence status and next step
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/PhoneCheckResponse"
 */

/**
 * @swagger
 * /auth/sign-in:
 *   post:
 *     summary: Authenticate an existing user with phone and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/PasswordLoginRequest"
 *     responses:
 *       200:
 *         description: Password is valid and OTP was sent
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/OtpSentResponse"
 */

/**
 * @swagger
 * /auth/sign-up:
 *   post:
 *     summary: Create a new account with phone and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/RegisterRequest"
 *     responses:
 *       201:
 *         description: Account created and OTP was sent
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/OtpSentResponse"
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user (fails if phone already exists)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/RegisterRequest"
 *     responses:
 *       201:
 *         description: Account created and OTP was sent
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/OtpSentResponse"
 */

/**
 * @swagger
 * /auth/password/forgot:
 *   post:
 *     summary: Start forgot password flow (send OTP)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/ForgotPasswordRequest"
 *     responses:
 *       200:
 *         description: OTP sent for password recovery
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/OtpSentResponse"
 */

/**
 * @swagger
 * /auth/password/recover:
 *   post:
 *     summary: Recover account by setting a new password using OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/ResetPasswordRequest"
 *     responses:
 *       200:
 *         description: Password updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/AuthResponse"
 */

/**
 * @swagger
 * /auth/admin/sign-in:
 *   post:
 *     summary: Authenticate admin account with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/AdminSignInRequest"
 *     responses:
 *       200:
 *         description: Admin authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/AuthResponse"
 */

/**
 * @swagger
 * /auth/admin/sign-up:
 *   post:
 *     summary: Create an admin account (admin role only)
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, email, password, role]
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, sous-admin]
 *     responses:
 *       201:
 *         description: Admin account created
 */
export default router;
