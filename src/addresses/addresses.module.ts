import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from '../auth/auth.service';
import { DeviceToken } from '../auth/entities/device-token.entity';
import { User } from '../users/entities/user.entity';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';
import { Address } from './entities/address.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Address, User, DeviceToken])],
  controllers: [AddressesController],
  providers: [AddressesService, AuthService],
  exports: [AddressesService],
})
export class AddressesModule {}
