import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm/dist/typeorm.module';
import { AuthService } from '../auth/auth.service';
import { DeviceToken } from '../auth/entities/device-token.entity';
import { User } from '../users/entities/user.entity';
import { FilesController } from './files.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceToken, User])],
  controllers: [FilesController],
  providers: [AuthService],
})
export class FilesModule {}
