import { ValidationPipe } from '@nestjs/common';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { AssetUrlInterceptor } from './common/interceptors/asset-url.interceptor';
import { TypeOrmExceptionFilter } from './common/filters/typeorm-exception.filter';
import { LocaleMiddleware } from './common/middleware/locale.middleware';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { StorageService } from './storage/storage.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api');

  // Locale middleware (parses Accept-Language header)
  app.use(new LocaleMiddleware().use.bind(new LocaleMiddleware()));

  // Request logging middleware
  app.use(
    new RequestLoggerMiddleware().use.bind(new RequestLoggerMiddleware()),
  );

  // CORS configuration
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filters
  app.useGlobalFilters(new TypeOrmExceptionFilter());

  // Global serializer interceptor so entity decorators (e.g. @Exclude() on
  // User.passwordHash) are honored in every response.
  //
  // AssetUrlInterceptor is registered first (outermost) so it runs AFTER the
  // serializer has turned entities into plain objects, and rewrites storage
  // image keys into absolute public URLs (CloudFront / public MinIO bucket).
  app.useGlobalInterceptors(
    new AssetUrlInterceptor(app.get(StorageService)),
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
