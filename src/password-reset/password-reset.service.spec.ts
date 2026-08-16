/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { FindOperator } from 'typeorm';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { User } from '../users/entities/user.entity';
import { DeviceToken } from '../auth/entities/device-token.entity';
import { MailService } from './mail.service';
import { SmsService } from './sms.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn().mockResolvedValue(true),
}));

const mockRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn((x) => x),
  save: jest.fn(),
  update: jest.fn(),
});

const mockConfigService = {
  get: jest.fn().mockReturnValue(30),
};

const mockMailService = {
  sendResetEmail: jest.fn().mockResolvedValue(true),
};

const mockSmsService = {
  sendResetSms: jest.fn().mockResolvedValue(true),
};

describe('PasswordResetService', () => {
  let service: PasswordResetService;
  let resetTokenRepository: any;
  let userRepository: any;
  let deviceTokenRepository: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        {
          provide: getRepositoryToken(PasswordResetToken),
          useFactory: mockRepo,
        },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: getRepositoryToken(DeviceToken), useFactory: mockRepo },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MailService, useValue: mockMailService },
        { provide: SmsService, useValue: mockSmsService },
      ],
    }).compile();

    service = module.get<PasswordResetService>(PasswordResetService);
    resetTokenRepository = module.get(getRepositoryToken(PasswordResetToken));
    userRepository = module.get(getRepositoryToken(User));
    deviceTokenRepository = module.get(getRepositoryToken(DeviceToken));
  });

  describe('requestReset', () => {
    it('returns a neutral message for an unknown account (no enumeration)', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.requestReset(undefined, '+96170000000');

      expect(result.message).toContain('If an account exists');
      expect(resetTokenRepository.save).not.toHaveBeenCalled();
      expect(mockSmsService.sendResetSms).not.toHaveBeenCalled();
    });

    it('stores a hashed token + code with an expiry when the user exists', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 7,
        phone: '+96170000000',
      });

      await service.requestReset(undefined, '+96170000000');

      const saved = resetTokenRepository.save.mock.calls[0][0];
      expect(saved.userId).toBe(7);
      expect(saved.code).toMatch(/^\d{6}$/);
      expect(saved.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(saved.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(mockSmsService.sendResetSms).toHaveBeenCalledWith(
        '+96170000000',
        saved.code,
      );
    });
  });

  describe('resetPassword', () => {
    it('rejects a reset without a new password', async () => {
      await expect(
        service.resetPassword('token', undefined, undefined, undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an invalid/unknown reset code', async () => {
      resetTokenRepository.findOne.mockResolvedValue(null);

      await expect(
        service.resetPassword(
          undefined,
          '123456',
          '+96170000000',
          'newPass123',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an expired reset token', async () => {
      resetTokenRepository.findOne.mockResolvedValue({
        userId: 7,
        used: false,
        expiresAt: new Date(Date.now() - 1000),
        user: { id: 7, passwordHash: 'old' },
      });

      await expect(
        service.resetPassword('some-token', undefined, undefined, 'newPass123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an already-used reset code', async () => {
      resetTokenRepository.findOne.mockResolvedValue(null);

      await expect(
        service.resetPassword(
          undefined,
          '123456',
          '+96170000000',
          'newPass123',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('scopes the code lookup to the requesting user (no cross-user reset)', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 7,
        phone: '+96170000000',
      });
      resetTokenRepository.findOne.mockResolvedValue({
        userId: 7,
        used: false,
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 7, passwordHash: 'old' },
      });

      await service.resetPassword(
        undefined,
        '123456',
        '+96170000000',
        'newPass123',
      );

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { phone: '+96170000000' },
      });
      expect(resetTokenRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 7, code: '123456', used: false },
        relations: { user: true },
      });
    });

    it('resets the password, marks the token used, and revokes active sessions', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 7,
        phone: '+96170000000',
      });
      resetTokenRepository.findOne.mockResolvedValue({
        userId: 7,
        used: false,
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 7, passwordHash: 'old' },
      });

      const result = await service.resetPassword(
        undefined,
        '123456',
        '+96170000000',
        'newPass123',
      );

      expect(result.message).toContain('reset successfully');
      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 7, passwordHash: 'hashed' }),
      );
      expect(resetTokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ used: true }),
      );
      expect(deviceTokenRepository.update).toHaveBeenCalledWith(
        { userId: 7, status: 'active' },
        { status: 'inactive' },
      );
    });
  });

  describe('changePassword', () => {
    it('revokes every active session except the one making the change', async () => {
      userRepository.findOne.mockResolvedValue({ id: 7, passwordHash: 'old' });

      await service.changePassword(
        7,
        'currentPass',
        'newPass123',
        'current-token',
      );

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 7, passwordHash: 'hashed' }),
      );
      const updateCall = deviceTokenRepository.update.mock.calls[0];
      expect(updateCall[0]).toEqual(
        expect.objectContaining({ userId: 7, status: 'active' }),
      );
      const accessToken = updateCall[0].accessToken;
      expect(accessToken).toBeInstanceOf(FindOperator);
      expect((accessToken as FindOperator<string>)._value).toBe(
        'current-token',
      );
    });
  });
});
