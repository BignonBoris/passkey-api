import { Request, Response } from "express";
import {
  adminSignUpSchema,
  adminSignInSchema,
  checkPhoneSchema,
  forgotPasswordSchema,
  recoverPasswordSchema,
  signInSchema,
  signUpSchema,
} from "./authFlow.dto";
import { AuthFlowService } from "./authFlow.service";

export async function checkPhone(req: Request, res: Response) {
  const body = checkPhoneSchema.parse(req.body);
  const data = await AuthFlowService.checkPhone(body.phone, body.role);

  res.status(200).json({
    success: data.error ? false : true,
    message: data.error ? data.error : "Vérification téléphonique terminée",
    data,
  });
}

export async function signIn(req: Request, res: Response) {
  const body = signInSchema.parse(req.body);
  const result = await AuthFlowService.signIn(body.phone, body.role, body.password);

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
}

export async function signUp(req: Request, res: Response) {
  const body = signUpSchema.parse(req.body);
  const result = await AuthFlowService.signUp(body.phone, body.password, body.role);

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
}

// controllers/auth.controller.ts
export async function resendOtp(req: Request, res: Response) {
  try {
    const { phone, role } = req.body;

    if (!phone || !role) {
      return res.status(400).json({
        success: false,
        message: "Le numéro de téléphone et le rôle sont requis."
      });
    }

    const result = await AuthFlowService.resendOtp(phone, role);

    return res.status(result.status).json({
      success: result.success,
      message: result.message,
      data: result.data // Contient l'OTP seulement en DEV
    });
  } catch (error) {
    console.error("Erreur Resend OTP:", error);
    return res.status(500).json({ success: false, message: "Erreur interne du serveur." });
  }
}

export async function forgotPassword(req: Request, res: Response) {
  const body = forgotPasswordSchema.parse(req.body);
  const result = await AuthFlowService.forgotPassword(body.phone);

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
}

export async function recoverPassword(req: Request, res: Response) {
  const body = recoverPasswordSchema.parse(req.body);
  const result = await AuthFlowService.recoverPassword(body.phone, body.otp, body.newPassword);

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

export async function adminSignIn(req: Request, res: Response) {
  const body = adminSignInSchema.parse(req.body);
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
}

export async function adminSignUp(req: Request, res: Response) {
  const body = adminSignUpSchema.parse(req.body);
  const result = await AuthFlowService.adminSignUp({
    name: body.name,
    phone: body.phone,
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
}
