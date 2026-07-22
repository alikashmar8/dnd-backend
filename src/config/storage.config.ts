import { registerAs } from '@nestjs/config';

export const storageConfig = registerAs('storage', () => {
  const isDev = process.env.NODE_ENV === 'development';

  return {
    env: process.env.NODE_ENV || 'development',
    driver: process.env.STORAGE_DRIVER || 's3',
    region: process.env.STORAGE_REGION || 'us-east-1',
    accessKeyId:
      process.env.STORAGE_ACCESS_KEY_ID || (isDev ? 'minioadmin' : ''),
    secretAccessKey:
      process.env.STORAGE_SECRET_ACCESS_KEY || (isDev ? 'minioadmin' : ''),
    bucket: process.env.STORAGE_BUCKET || 'dnd-uploads',
    endpoint: isDev
      ? process.env.STORAGE_ENDPOINT || 'http://localhost:9000'
      : undefined,
    useSsl: isDev ? false : true,
    forcePathStyle: isDev ? true : false,
    signedUrlExpiry: parseInt(
      process.env.STORAGE_SIGNED_URL_EXPIRY || '900',
      10,
    ),
  };
});
