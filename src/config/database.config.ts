import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = registerAs(
  'database',
  (): TypeOrmModuleOptions => {
    const isProd = process.env.NODE_ENV === 'production';
    const sslEnabled = process.env.DB_SSL
      ? process.env.DB_SSL === 'true'
      : isProd;

    return {
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_DATABASE || 'dnd_db',
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],
      synchronize: process.env.NODE_ENV === 'development',
      // logging: process.env.NODE_ENV === 'development',
      logging: false,
      // TLS defaults ON in production and verifies certificates unless the
      // operator explicitly opts out (managed providers like RDS/Aurora use
      // self-signed certs, so they set DB_SSL_REJECT_UNAUTHORIZED=false).
      ssl: sslEnabled
        ? {
            rejectUnauthorized:
              process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' ? false : true,
          }
        : false,
    };
  },
);
