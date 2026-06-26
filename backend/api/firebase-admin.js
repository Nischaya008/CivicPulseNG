/**
 * Firebase Admin SDK Initialization
 * 
 * Provides server-side Firestore access for verification,
 * notifications, and analytics operations.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let adminApp = null;
let adminDb = null;

function initializeAdmin() {
  if (adminApp) return { adminApp, adminDb };

  try {
    // Option 1: Service account JSON file path
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    
    // Option 2: Service account JSON as env var string
    const serviceAccountJSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    let credential;

    if (serviceAccountPath) {
      const resolvedPath = path.resolve(path.dirname(__dirname), serviceAccountPath);
      if (fs.existsSync(resolvedPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
        credential = cert(serviceAccount);
        console.log('Firebase Admin: Using service account from file ✓');
      } else {
        console.warn(`Firebase Admin: Service account file not found at ${resolvedPath}`);
      }
    } else if (serviceAccountJSON) {
      const serviceAccount = JSON.parse(serviceAccountJSON);
      credential = cert(serviceAccount);
      console.log('Firebase Admin: Using service account from env var ✓');
    }

    if (credential) {
      adminApp = initializeApp({ credential });
    } else {
      // Fallback: try Application Default Credentials (for Cloud Run, etc.)
      console.warn('Firebase Admin: No explicit credentials found. Trying application default credentials...');
      adminApp = initializeApp();
    }

    adminDb = getFirestore(adminApp);
    
    // Firestore settings for better performance
    adminDb.settings({ ignoreUndefinedProperties: true });

    console.log('Firebase Admin SDK initialized ✓');
  } catch (err) {
    console.error('Firebase Admin initialization failed:', err.message);
    console.warn('Backend will operate in limited mode without server-side Firestore access.');
    adminDb = null;
  }

  return { adminApp, adminDb };
}

// Initialize on import
const { adminDb: db } = initializeAdmin();

export { db as adminDb };

