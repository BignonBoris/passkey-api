import * as admin from 'firebase-admin';
import fs from "fs";
import path from "path";

type ServiceAccount = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function loadServiceAccount(): ServiceAccount | null {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (fromEnv) {
    try {
      return JSON.parse(fromEnv);
    } catch (_error) {
      console.warn("Invalid FIREBASE_SERVICE_ACCOUNT_JSON value");
    }
  }

  const serviceAccountPath = path.resolve(process.cwd(), "firebase-service-account.json");
  if (fs.existsSync(serviceAccountPath)) {
    try {
      const raw = fs.readFileSync(serviceAccountPath, "utf-8");
      return JSON.parse(raw);
    } catch (_error) {
      console.warn("Unable to parse firebase-service-account.json");
    }
  }

  return null;
}

function initFirebase() {
  if (admin.apps.length) return;

  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    console.warn("Firebase not configured: push notifications disabled");
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  });
}

initFirebase();

function normalizeToken(token: string | null | undefined): string {
  return (token ?? '').toString().trim();
}

export const sendNotificationToDriver = async (
  token: string,
  title: string,
  body: string,
  data: any = {}
) => {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken || normalizedToken === 'undefined' || normalizedToken === 'null') {
    console.warn('FCM ignored: empty or invalid token');
    return null;
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
    if (!admin.apps.length) {
      console.warn("FCM ignored: Firebase not initialized");
      return null;
    }
    const response = await admin.messaging().send(message);
    console.log('FCM sent successfully:', response);
    return response;
  } catch (error) {
    console.error('FCM send error:', error);
    return null;
  }
};

export const sendPushNotification = async (
  token: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
) => {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken || normalizedToken === 'undefined' || normalizedToken === 'null') {
    console.warn('FCM ignored: empty or invalid token');
    return null;
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
    if (!admin.apps.length) {
      console.warn("FCM ignored: Firebase not initialized");
      return null;
    }
    const response = await admin.messaging().send(message);
    console.log('FCM sent successfully:', response);
    return response;
  } catch (error) {
    console.error('FCM send error:', error);
    return null;
  }
};
