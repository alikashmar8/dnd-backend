import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { SerializeInterceptor } from './interceptors/serialize.interceptor';

@Global()
@Module({
  imports: [AuthModule],
  providers: [AuthGuard, RolesGuard, SerializeInterceptor],
  exports: [AuthGuard, RolesGuard, SerializeInterceptor],
})
export class CommonModule {}
