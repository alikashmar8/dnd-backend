import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ModuleRef } from '@nestjs/core';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../enums/user-role.enum';
import { DeviceToken, DeviceTokenStatus } from './entities/device-token.entity';
import { RegisterDto, LoginDto } from './auth.dto';
import { ChatService } from '../chat/chat.service';
import { ChatMessage } from '../chat/entities/chat-message.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepository: Repository<DeviceToken>,
    private readonly dataSource: DataSource,
    private readonly moduleRef: ModuleRef,
  ) {}

  async register(registerDto: RegisterDto, deviceInfo?: string) {
    const existingUser = await this.userRepository.findOne({
      where: { phone: registerDto.phone },
    });

    if (existingUser) {
      throw new UnauthorizedException('Phone number already exists');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;

      const hashedPassword = await bcrypt.hash(registerDto.password, 10);

      const user = manager.create(User, {
        email: registerDto.email || undefined,
        passwordHash: hashedPassword,
        name: registerDto.name,
        phone: registerDto.phone,
        role: UserRole.CUSTOMER,
      });
      await manager.save(user);

      const accessToken = this.generateAccessToken();
      const deviceToken = manager.create(DeviceToken, {
        userId: user.id,
        accessToken,
        deviceInfo: deviceInfo || null,
        fcmToken: registerDto.fcmToken || null,
        status: DeviceTokenStatus.ACTIVE,
        lastUsedAt: new Date(),
      });
      await manager.save(deviceToken);

      const chatService = this.moduleRef.get(ChatService, { strict: false });
      const supportUser = await chatService.findSupportTeamUser();
      const chat = await chatService.getOrCreateThreadWithManager(
        user.id,
        supportUser.id,
        manager,
      );

      const welcomeMessage = manager.create(ChatMessage, {
        chatId: chat.id,
        senderId: supportUser.id,
        text: 'Welcome to Dish & Dash! How can we help you today?',
        isRead: false,
      });
      await manager.save(welcomeMessage);

      await queryRunner.commitTransaction();

      return {
        access_token: accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          role: user.role,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async login(loginDto: LoginDto, deviceInfo?: string) {
    const user = await this.userRepository.findOne({
      where: { phone: loginDto.phone },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.generateAccessToken();
    const deviceToken = this.deviceTokenRepository.create({
      userId: user.id,
      accessToken,
      deviceInfo: deviceInfo || null,
      fcmToken: loginDto.fcmToken || null,
      status: DeviceTokenStatus.ACTIVE,
      lastUsedAt: new Date(),
    });

    await this.deviceTokenRepository.save(deviceToken);

    return {
      access_token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    };
  }

  private generateAccessToken(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15) +
      Date.now().toString(36)
    );
  }

  async validateUserByToken(accessToken: string): Promise<User> {
    const deviceToken = await this.deviceTokenRepository.findOne({
      where: { accessToken, status: DeviceTokenStatus.ACTIVE },
      relations: { user: true },
    });

    if (!deviceToken) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    deviceToken.lastUsedAt = new Date();
    await this.deviceTokenRepository.save(deviceToken);

    return deviceToken.user;
  }

  async logout(accessToken: string): Promise<void> {
    const deviceToken = await this.deviceTokenRepository.findOne({
      where: { accessToken },
    });

    if (deviceToken) {
      deviceToken.status = DeviceTokenStatus.INACTIVE;
      await this.deviceTokenRepository.save(deviceToken);
    }
  }
}
