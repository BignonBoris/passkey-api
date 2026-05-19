import { FasterMessageClient } from './faster-message.client';
import { TwilioClient } from './twilio.client';

/**
 * Service centralisé pour l'envoi de SMS.
 * Supporte plusieurs fournisseurs (FasterMessage, Twilio).
 */
export class SmsService {
  private static readonly provider = process.env.SMS_PROVIDER || 'faster-message';
  private static readonly fmClient = new FasterMessageClient();
  private static readonly twilioClient = new TwilioClient();

  public static async sendSmsViaTwilio(phone: string, message: string): Promise<boolean> {
    try {
      console.log(`[SmsService] Debut envoi force (twilio) vers ${phone}...`);
      const res = await this.twilioClient.sendSms(phone, message);
      if (res.status) {
        console.log(`[SmsService] Message envoye avec succes via twilio a ${phone}.`);
        return true;
      }
      console.error(
        `[SmsService] Echec envoi via twilio vers ${phone}. Cause: ${res.error || 'unknown'}`,
      );
      return false;
    } catch (error) {
      console.error(`[SmsService] Erreur critique twilio lors de l'envoi a ${phone} :`, error);
      return false;
    }
  }

  /**
   * Envoie un SMS simple
   * @param phone Numéro de téléphone (format complet recommandé)
   * @param message Texte du SMS
   */
  public static async sendSms(phone: string, message: string): Promise<boolean> {
    try {
      console.log(`[SmsService] Début envoi (${this.provider}) vers ${phone}...`);
      
      let res: { status: boolean; error?: string; description?: string };

      if (this.provider === 'twilio') {
        res = await this.twilioClient.sendSms(phone, message);
      } else {
        const fmRes = await this.fmClient.sendSms(phone, message);
        res = { 
          status: fmRes.status, 
          description: fmRes.description || fmRes.code 
        };
      }
      
      if (res.status) {
        console.log(`[SmsService] ✅ Message envoyé avec succès à ${phone}.`);
        return true;
      } else {
        console.error(`[SmsService] ❌ Échec envoi vers ${phone} via ${this.provider}. Cause: ${res.description || res.error}`);
        return false;
      }
    } catch (error) {
      console.error(`[SmsService] ❌ Erreur critique lors de l'envoi à ${phone} :`, error);
      return false;
    }
  }

  /**
   * Envoie un mot de passe à usage unique (OTP)
   * @param phone Numéro de téléphone 
   * @param otp Code OTP généré
   */
  public static async sendOtp(phone: string, otp: string): Promise<boolean> {
    const message = `<#> PassKey: ${otp} est votre code de validation. Il expire dans 5 minutes. Ne le partagez avec personne.`;
    return await this.sendSms(phone, message);
  }
}
