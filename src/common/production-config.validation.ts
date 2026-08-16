import { Logger } from '@nestjs/common';

/**
 * Production-only startup validation.
 *
 * Fail-fast rules (mirroring the Firebase fail-fast precedent in
 * `FirebaseAdminModule`): a production deployment must not silently start
 * without the secrets the platform depends on, because the affected features
 * would degrade with no log until runtime.
 *
 *  - Storage: production uses AWS S3 with static credentials (the S3 client is
 *    constructed with explicit `credentials`, so empty values cannot fall back
 *    to an instance role chain — every upload would fail at runtime).
 *  - Password reset: with neither SMTP nor Twilio configured, reset codes can
 *    never be delivered, silently disabling the forgot-password flow.
 *
 * Anything that would block startup is collected and reported at once so the
 * operator sees the full list on the first boot attempt.
 */
export function validateProductionConfig(): void {
  const logger = new Logger('ProductionConfigValidation');

  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const errors: string[] = [];

  const storageAccessKey = process.env.STORAGE_ACCESS_KEY_ID?.trim();
  const storageSecretKey = process.env.STORAGE_SECRET_ACCESS_KEY?.trim();
  if (!storageAccessKey || !storageSecretKey) {
    errors.push(
      'STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY are required in ' +
        'production (static credentials — the S3 client does not support the ' +
        'instance-role chain).',
    );
  }

  const smtpHost = process.env.SMTP_HOST?.trim();
  const twilioSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  if (!smtpHost && !twilioSid) {
    errors.push(
      'At least one password-reset delivery channel is required in ' +
        'production: SMTP_HOST (email) or TWILIO_ACCOUNT_SID (SMS). Without ' +
        'either, reset codes can never be delivered.',
    );
  }

  if (errors.length > 0) {
    logger.error(
      'Production configuration validation failed:\n  - ' +
        errors.join('\n  - '),
    );
    throw new Error(
      'Refusing to start in production: missing required configuration. ' +
        errors.join(' '),
    );
  }

  const assetBaseUrl = process.env.ASSET_BASE_URL?.trim();
  if (!assetBaseUrl) {
    logger.warn(
      'ASSET_BASE_URL is not set. Image URLs will be returned as bare object ' +
        'keys (legacy absolute URLs still resolve). Set it to the CloudFront ' +
        'distribution in front of the private S3 bucket.',
    );
  }

  logger.log('Production configuration validation passed.');
}
