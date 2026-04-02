// services/sms.service.ts
export class SmsService {
    static async sendOtp(phone: string, code: string) {
        // Le format <#> et le Hash à la fin permettent l'auto-lecture par Android
        const appHash = "votre_hash_app"; // À générer avec l'outil de signature Android
        const message = `<#> Votre code de vérification PassKey est : ${code}.\n${appHash}`;

        console.log(`[SMS SENDER] Envoi à ${phone} : ${message}`);

        // Ici, intègre ton fournisseur (Twilio, Infobip, etc.)
        // await provider.send(phone, message);
    }
}