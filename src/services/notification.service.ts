import * as admin from 'firebase-admin';

const serviceAccount = require('../../firebase-service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

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
    const response = await admin.messaging().send(message);
    console.log('FCM sent successfully:', response);
    return response;
  } catch (error) {
    console.error('FCM send error:', error);
    return null;
  }
};
