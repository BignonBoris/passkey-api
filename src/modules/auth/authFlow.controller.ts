import { Request, Response } from "express";
import axios from "axios";
import {
  adminSignUpSchema,
  adminSignInSchema,
  checkPhoneSchema,
  forgotPasswordSchema,
  recoverPasswordSchema,
  validateRecoveryOtpSchema,
  signInSchema,
  signUpSchema,
} from "./authFlow.dto";
import { AuthFlowService } from "./authFlow.service";
import { catchAsync } from "../../utils/catchAsync";

export const checkPhone = catchAsync(async (req: Request, res: Response) => {
  const body = checkPhoneSchema.parse(req.body);
  const data = await AuthFlowService.checkPhone(body.phone, body.role);

  res.status(200).json({
    success: data.error ? false : true,
    message: data.error ? data.error : "Vérification téléphonique terminée",
    data,
  });
});

export const signIn = catchAsync(async (req: Request, res: Response) => {
  const body = signInSchema.parse(req.body);
  const result = await AuthFlowService.signIn(
    body.phone,
    body.role,
    body.password
  );

  if (!result.success) {
    return res.status(result.status).json({
      success: false,
      message: result.message,
    });
  }

  return res.status(result.status).json({
    success: true,
    message: result.message,
    data: result.data,
  });
});

export const signUp = catchAsync(async (req: Request, res: Response) => {
  const body = signUpSchema.parse(req.body);
  const result = await AuthFlowService.signUp(
    body.phone,
    body.password,
    body.role
  );

  if (!result.success) {
    return res.status(result.status).json({
      success: false,
      message: result.message,
    });
  }

  return res.status(result.status).json({
    success: true,
    message: result.message,
    data: result.data,
  });
});

export const resendOtp = catchAsync(async (req: Request, res: Response) => {
  const { phone, role } = req.body;

  if (!phone || !role) {
    return res.status(400).json({
      success: false,
      message: "Le numéro de téléphone et le rôle sont requis.",
    });
  }

  const result = await AuthFlowService.resendOtp(phone, role);

  return res.status(result.status).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

export const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const body = forgotPasswordSchema.parse(req.body);
  const result = await AuthFlowService.forgotPassword(body.phone, body.role);
  if (!result.success) {
    return res.status(result.status).json({
      success: false,
      message: result.message,
    });
  }

  return res.status(result.status).json({
    success: true,
    message: result.message,
    data: result.data,
  });
});

export const validateRecoveryOtp = catchAsync(
  async (req: Request, res: Response) => {
    const body = validateRecoveryOtpSchema.parse(req.body);
    const result = await AuthFlowService.validateRecoveryOtp(
      body.phone,
      body.otp
    );

    if (!result.success) {
      return res.status(result.status).json({
        success: false,
        message: result.message,
      });
    }

    return res.status(result.status).json({
      success: true,
      message: result.message,
    });
  }
);

export const recoverPassword = catchAsync(
  async (req: Request, res: Response) => {
    const body = recoverPasswordSchema.parse(req.body);
    const result = await AuthFlowService.recoverPassword(
      body.phone,
      body.otp,
      body.newPassword
    );

    if (!result.success) {
      return res.status(result.status).json({
        success: false,
        message: result.message,
      });
    }

    return res.status(result.status).json({
      success: true,
      message: result.message,
    });
  }
);

export const adminSignIn = catchAsync(async (req: Request, res: Response) => {
  const body = adminSignInSchema.parse(req.body);

  // Verification reCAPTCHA
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  if (secretKey) {
    if (!body.captchaToken) {
      return res.status(400).json({
        success: false,
        message: "Vérification reCAPTCHA requise.",
      });
    }

    try {
      const verifyRes = await axios.post(
        `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${body.captchaToken}`
      );

      if (!verifyRes.data.success) {
        return res.status(400).json({
          success: false,
          message: "Échec de la vérification reCAPTCHA.",
        });
      }
    } catch (err) {
      console.error("error during recaptcha verification", err);
      return res.status(500).json({
        success: false,
        message: "Erreur lors de la vérification reCAPTCHA.",
      });
    }
  }

  const result = await AuthFlowService.adminSignIn(body.email, body.password);

  if (!result.success) {
    return res.status(result.status).json({
      success: false,
      message: result.message,
    });
  }

  return res.status(result.status).json({
    success: true,
    message: result.message,
    data: result.data,
  });
});

export const adminSignUp = catchAsync(async (req: Request, res: Response) => {
  const body = adminSignUpSchema.parse(req.body);
  const result = await AuthFlowService.adminSignUp({
    name: body.name,
    email: body.email,
    password: body.password,
    role: body.role,
  });

  if (!result.success) {
    return res.status(result.status).json({
      success: false,
      message: result.message,
    });
  }

  return res.status(result.status).json({
    success: true,
    message: result.message,
    data: result.data,
  });
});
