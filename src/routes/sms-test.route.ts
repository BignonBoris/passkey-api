import { Router, Request, Response } from "express";
import { SmsService } from "../services/sms/sms.service";

const router = Router();

/**
 * @swagger
 * /sms/send:
 *   post:
 *     summary: Envoi d'un SMS simple
 *     tags: [Sms]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, message]
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "+22961000000"
 *               message:
 *                 type: string
 *                 example: "Ceci est un test SMS"
 *     responses:
 *       200:
 *         description: SMS envoyé avec succès
 *       400:
 *         description: Paramètres manquants
 *       500:
 *         description: Erreur serveur
 */
router.post("/send", async (req: Request, res: Response) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    res.status(400).json({
      success: false,
      error: "Les champs 'phone' et 'message' sont obligatoires.",
    });
    return;
  }

  const success = await SmsService.sendSms(phone, message);

  if (success) {
    res.status(200).json({
      success: true,
      message: `SMS envoyé avec succès au ${phone}`,
    });
  } else {
    res.status(500).json({
      success: false,
      error: "Échec de l'envoi du SMS. Vérifiez les logs du serveur.",
    });
  }
});

/**
 * @swagger
 * /sms/send-otp:
 *   post:
 *     summary: Envoi d'un code OTP
 *     tags: [Sms]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, otp]
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "+22961000000"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: OTP envoyé avec succès
 *       400:
 *         description: Paramètres manquants
 *       500:
 *         description: Erreur serveur
 */
router.post("/send-otp", async (req: Request, res: Response) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    res.status(400).json({
      success: false,
      error: "Les champs 'phone' et 'otp' sont obligatoires.",
    });
    return;
  }

  const success = await SmsService.sendOtp(phone, otp);

  if (success) {
    res.status(200).json({
      success: true,
      message: `OTP envoyé avec succès au ${phone}`,
    });
  } else {
    res.status(500).json({
      success: false,
      error: "Échec de l'envoi de l'OTP. Vérifiez les logs du serveur.",
    });
  }
});

export default router;
