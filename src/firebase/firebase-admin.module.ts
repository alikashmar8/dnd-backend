import { Global, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  App,
  initializeApp,
  getApps,
  deleteApp,
  cert,
} from 'firebase-admin/app';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const FIREBASE_ADMIN = 'FIREBASE_ADMIN';
export type FirebaseApp = App | null;

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: FIREBASE_ADMIN,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): FirebaseApp => {
        const logger = new Logger('FirebaseAdminModule');

        // Deterministic: a single [DEFAULT] app. If anything already created
        // one, reuse it instead of crashing or double-initializing.
        const existing = getApps()[0];
        if (existing) {
          logger.log('Reusing already-initialized Firebase app');
          return existing;
        }

        let serviceAccount: Record<string, string> | undefined;
        const firebase = configService.get('firebase') as Record<
          string,
          string | undefined
        >;

        const serviceAccountPath = firebase?.serviceAccountPath as string;
        if (serviceAccountPath && existsSync(resolve(serviceAccountPath))) {
          try {
            serviceAccount = JSON.parse(
              readFileSync(resolve(serviceAccountPath), 'utf8'),
            ) as Record<string, string>;
          } catch (error) {
            logger.error(
              `Failed to load service account from ${serviceAccountPath}:`,
              error,
            );
          }
        }

        if (
          !serviceAccount &&
          firebase?.projectId &&
          firebase?.clientEmail &&
          firebase?.privateKey
        ) {
          serviceAccount = {
            project_id: firebase.projectId,
            client_email: firebase.clientEmail,
            private_key: firebase.privateKey.replace(/\\n/g, '\n'),
          };
        }

        if (!serviceAccount) {
          // Never silently degrade. Surface the problem at startup so the
          // deployment knows push notifications are not going to work.
          const message =
            'Firebase credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH ' +
            'or FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY in the environment. ' +
            'Push notifications will be unavailable.';
          logger.error(message);
          throw new Error(message);
        }

        try {
          const app = initializeApp({
            credential: cert(serviceAccount),
          });
          logger.log('Firebase Admin initialized successfully');
          return app;
        } catch (error) {
          logger.error('Failed to initialize Firebase Admin:', error);
          throw error;
        }
      },
    },
  ],
  exports: [FIREBASE_ADMIN],
})
export class FirebaseAdminModule implements OnApplicationShutdown {
  onApplicationShutdown() {
    // Best-effort cleanup; firebase-admin apps are not strictly required to
    // be deleted on shutdown.
    for (const app of getApps()) {
      deleteApp(app).catch(() => undefined);
    }
  }
}
