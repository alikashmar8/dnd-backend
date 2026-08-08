import { registerAs } from '@nestjs/config';

export const firebaseConfig = registerAs('firebase', () => {
  const isDev = process.env.NODE_ENV === 'development';

  return {
    // Service account JSON file (local dev). Either this OR the three
    // FCM_* vars below must be set for Firebase Admin to initialize.
    serviceAccountPath:
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
      (isDev
        ? __dirname + '/dish-and-dash-firebase-adminsdk-fbsvc-d75fcba161.json'
        : ''),
    projectId: process.env.FCM_PROJECT_ID,
    clientEmail: process.env.FCM_CLIENT_EMAIL,
    privateKey: process.env.FCM_PRIVATE_KEY,
  };
});
