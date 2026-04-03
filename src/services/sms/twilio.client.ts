import { Twilio } from "twilio";
import "dotenv/config";

export interface TwilioResponse {
  status: boolean;
  messageId?: string;
  error?: string;
}

export class TwilioClient {
  private readonly client: Twilio;
  private readonly from: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.from = process.env.TWILIO_PHONE_NUMBER || "";

    if (!accountSid || !authToken) {
      console.warn("[Twilio] Identifiants manquants dans l'environnement !");
    }

    this.client = new Twilio(accountSid || "", authToken || "");
    
    if (accountSid) {
      console.log(`[Twilio] ✅ Client initialisé (AccountSID: ${accountSid.substring(0, 5)}...)`);
    }
  }

  /**
   * Envoie un SMS via Twilio
   * @param to Numéro du destinataire (format international +229...)
   * @param text Le message à envoyer
   */
  public async sendSms(to: string, text: string): Promise<TwilioResponse> {
    try {
      console.log(`[Twilio] tentative d'envoi à ${to}...`);
      
      const message = await this.client.messages.create({
        body: text,
        from: this.from,
        to: to.startsWith("+") ? to : `+${to}`, // Twilio requiert le +
      });

      console.log(`[Twilio] ✅ Message envoyé. SID: ${message.sid}`);
      
      return {
        status: true,
        messageId: message.sid,
      };
    } catch (error: any) {
      console.error(`[Twilio] ❌ Erreur d'envoi :`, error.message);
      return {
        status: false,
        error: error.message,
      };
    }
  }
}
