import * as admin from 'firebase-admin';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { emitSocketFallback, SocketFallbackOptions } from '@/realtime/socket.instance';

type ServiceAccountConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

type NotificationDeliveryResult = {
  delivered: boolean;
  channel: 'fcm' | 'socket' | 'none';
  response: string | null;
};

type PushFallbackOptions = SocketFallbackOptions & {
  timeoutMs?: number;
};

function normalizeEnvValue(value: string | undefined): string {
  return String(value ?? '').trim();
}

function resolveServiceAccountFromEnv(): ServiceAccountConfig | null {
  const projectId = normalizeEnvValue(process.env.FIREBASE_PROJECT_ID);
  const clientEmail = normalizeEnvValue(process.env.FIREBASE_CLIENT_EMAIL);
  const privateKey = normalizeEnvValue(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n');

  if (!projectId && !clientEmail && !privateKey) {
    return null;
  }

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin credentials are incomplete. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.'
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

function resolveServiceAccountFromFile(): ServiceAccountConfig | null {
  const configuredPath = normalizeEnvValue(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const fallbackPath = path.resolve(__dirname, '../../firebase-service-account.json');
  const credentialPath = configuredPath || fallbackPath;

  if (!fs.existsSync(credentialPath)) {
    return null;
  }

  const parsed = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
  return {
    projectId: normalizeEnvValue(parsed.project_id),
    clientEmail: normalizeEnvValue(parsed.client_email),
    privateKey: normalizeEnvValue(parsed.private_key).replace(/\\n/g, '\n'),
  };
}

function resolveFirebaseCredential(): admin.credential.Credential {
  const serviceAccount = resolveServiceAccountFromEnv() ?? resolveServiceAccountFromFile();

  if (!serviceAccount) {
    throw new Error(
      'Firebase Admin credentials are missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY, or point GOOGLE_APPLICATION_CREDENTIALS to a valid service-account JSON file.'
    );
  }

  if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw new Error('Firebase Admin credentials are invalid. Check project ID, client email, and private key.');
  }

  return admin.credential.cert(serviceAccount);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: resolveFirebaseCredential(),
  });
}

function normalizeToken(token: string | null | undefined): string {
  return (token ?? '').toString().trim();
}

async function sendWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`FCM timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function fallbackToSocket(options?: PushFallbackOptions | null): NotificationDeliveryResult {
  const emitted = emitSocketFallback(options);
  return {
    delivered: emitted,
    channel: emitted ? 'socket' : 'none',
    response: null,
  };
}

export const sendNotificationToDriver = async (
  token: string,
  title: string,
  body: string,
  data: any = {},
  fallback?: PushFallbackOptions
) => {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken || normalizedToken === 'undefined' || normalizedToken === 'null') {
    console.warn('FCM ignored: empty or invalid token');
    return fallbackToSocket(fallback);
  }

  const message = {
    notification: {
      title,
      body,
    },
    data,
    token: normalizedToken,
  };

  try {
    const response = await sendWithTimeout(admin.messaging().send(message), fallback?.timeoutMs ?? 8000);
    console.log('FCM sent successfully:', response);
    return {
      delivered: true,
      channel: 'fcm' as const,
      response,
    };
  } catch (error) {
    console.error('FCM send error:', error);
    return fallbackToSocket(fallback);
  }
};

export const sendPushNotification = async (
  token: string,
  title: string,
  body: string,
  data: Record<string, string> = {},
  fallback?: PushFallbackOptions
) => {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken || normalizedToken === 'undefined' || normalizedToken === 'null') {
    console.warn('FCM ignored: empty or invalid token');
    return fallbackToSocket(fallback);
  }

  const message = {
    notification: {
      title,
      body,
    },
    data,
    token: normalizedToken,
  };

  try {
    const response = await sendWithTimeout(admin.messaging().send(message), fallback?.timeoutMs ?? 8000);
    console.log('FCM sent successfully:', response);
    return {
      delivered: true,
      channel: 'fcm' as const,
      response,
    };
  } catch (error) {
    console.error('FCM send error:', error);
    return fallbackToSocket(fallback);
  }
};

export const sendSmsNotification = async (phone: string, message: string) => {
  const normalizedPhone = normalizeToken(phone);
  const normalizedMessage = (message ?? '').toString().trim();
  const smsApiUrl = normalizeToken(process.env.SMS_API_URL);
  const smsApiKey = normalizeToken(process.env.SMS_API_KEY);
  const senderId = normalizeToken(process.env.SMS_SENDER_ID) || 'PassKey';

  if (!normalizedPhone || !normalizedMessage) {
    console.warn('SMS ignored: missing phone or message');
    return null;
  }

  if (!smsApiUrl || !smsApiKey) {
    console.warn('SMS skipped: SMS_API_URL or SMS_API_KEY not configured');
    return null;
  }

  try {
    const response = await axios.post(
      smsApiUrl,
      {
        to: normalizedPhone,
        from: senderId,
        message: normalizedMessage,
      },
      {
        headers: {
          Authorization: `Bearer ${smsApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log('SMS sent successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('SMS send error:', error);
    return null;
  }
};
