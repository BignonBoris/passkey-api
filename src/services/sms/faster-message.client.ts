import axios, { AxiosInstance, AxiosError } from 'axios';
import "dotenv/config";

// Types basés sur la documentation de FasterMessage
export interface FasterMessagePayload {
  from: string; // senderID
  to: string; // Destinataire avec indicatif
  text: string; // Message
  sendAt?: string;
  accents?: boolean | "1" | "true";
  messageId?: string;
  dlr_url?: string;
}

export interface FasterMessageResponse {
  status: boolean;
  code: string;
  description: string;
  from?: string;
  to?: string;
  text?: string;
  smsCount?: number;
  messageId?: string;
  uuid?: string;
  sendAt?: string;
  createdAt?: string;
  message?: string;
  reference?: string;
  batchId?: string;
  priority?: number;
  iso?: string;
  country?: string;
  cc?: number;
  operator?: string;
  mcc?: string;
  mnc?: string;
}

export class FasterMessageClient {
  private readonly client: AxiosInstance;
  private readonly defaultSenderId: string;

  constructor() {
    const apiKey = process.env.FASTERMESSAGE_API_KEY;
    this.defaultSenderId = process.env.FASTERMESSAGE_SENDER_ID || 'FASTERMSG';

    if (!apiKey) {
      console.warn("[FasterMessage] ⚠️ FASTERMESSAGE_API_KEY non définie dans l'environnement !");
    } else {
      console.log(`[FasterMessage] ✅ Clé API chargée (Type: ${apiKey.startsWith('c801') ? 'Correct' : 'Inattendu'}, Longueur: ${apiKey.length})`);
    }

    // Authentification par clé API via header x-api-key (méthode 3 de la doc FasterMessage)
    this.client = axios.create({
      baseURL: 'https://api.fastermessage.com/v1/sms',
      timeout: 10000,
      headers: {
        'x-api-key': apiKey || '',
        'Content-Type': 'application/json',
      },
    });
  }


  /**
   * Envoie un SMS en utilisant l'API FasterMessage
   * @param to Numéro du destinaire avec indicatif (ex: 22967082429)
   * @param text Le message à envoyer (recommandé moins de 3 pages)
   * @param from (Optionnel) SenderID, 11 caractères max
   */
  public async sendSms(to: string, text: string, from?: string): Promise<FasterMessageResponse> {
    const payload: FasterMessagePayload & { apiKey?: string } = {
      apiKey: process.env.FASTERMESSAGE_API_KEY,
      from: from || this.defaultSenderId,
      to: this.formatPhoneNumber(to),
      text,
      accents: true 
    };

    try {
      const response = await this.client.post<FasterMessageResponse>('/send', payload);
      const data = response.data;
      
      // La documentation spécifie que data.status est true en cas de soumission réussie
      if (!data.status) {
        console.error(`[FasterMessage] Détails erreur API:`, JSON.stringify(data, null, 2));
      }
      
      return data;
    } catch (error: any) {
      if (error instanceof AxiosError && error.response) {
        // Erreur HTTP (4xx, 5xx) renvoyée par FasterMessage
        console.error(`Erreur HTTP FasterMessage: ${error.response.status} -`, error.response.data);
        return {
          status: false,
          code: error.response.data?.code || "HTTP_ERROR",
          description: error.response.data?.description || error.message
        };
      }
      
      // Autre erreur (ex: Timeout, réseau)
      console.error('Erreur inattendue FasterMessageClient:', error);
      return {
        status: false,
        code: "INTERNAL_ERROR",
        description: "Une erreur interne a empêché l'appel à l'API SMS."
      };
    }
  }

  /**
   * Formate numéros pour garantie le format requis (sans +, espace etc.)
   */
  private formatPhoneNumber(phone: string): string {
    // Retire le +, les espaces et les tirets. Transforme "+229 67 08 24 29" en "22967082429"
    return phone.replace(/[+\s-]/g, '');
  }
}
