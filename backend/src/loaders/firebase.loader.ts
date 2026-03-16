import * as admin from 'firebase-admin';
import { config } from '../config';
import { logger } from '../utils/logger';
import fs from 'fs';

let firebaseApp: admin.app.App | null = null;

export const initFirebase = (): void => {
  if (firebaseApp) return;

  const { serviceAccountPath, projectId } = config.firebase;

  // Priority 1: JSON file path (dev — mounted via docker-compose volume)
  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
      projectId,
    });
    logger.info('Firebase Admin initialized with service account file');
    return;
  }

  // Priority 2: Base64-encoded service account (production — set as env var)
  // Usage: FIREBASE_SERVICE_ACCOUNT_BASE64=$(base64 firebase-service-account.json)
  const base64Key = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (base64Key) {
    const decoded = JSON.parse(Buffer.from(base64Key, 'base64').toString('utf-8'));
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(decoded),
      projectId,
    });
    logger.info('Firebase Admin initialized with base64 service account');
    return;
  }

  // Priority 3: GOOGLE_APPLICATION_CREDENTIALS (GCP environments — auto-detected)
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    firebaseApp = admin.initializeApp({ projectId });
    logger.info('Firebase Admin initialized with GOOGLE_APPLICATION_CREDENTIALS');
    return;
  }

  // Dev fallback — skip Firebase
  if (config.env === 'development') {
    logger.warn('Firebase credentials not configured — phone auth will not work');
    return;
  }

  throw new Error('Firebase credentials not configured');
};

export const getFirebaseAuth = (): admin.auth.Auth => {
  if (!firebaseApp) {
    throw new Error('Firebase not initialized. Provide service account credentials.');
  }
  return admin.auth(firebaseApp);
};
