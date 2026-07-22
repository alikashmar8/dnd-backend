import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import TwilioClient from 'twilio';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private twilioClient: TwilioClient.Twilio | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initialize();
  }

  private initialize() {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');

    if (!accountSid || !authToken) {
      this.logger.warn('Twilio not configured. SMS sending disabled.');
      return;
    }

    try {
      this.twilioClient = TwilioClient(accountSid, authToken);
    } catch {
      this.logger.warn('Failed to initialize Twilio client.');
    }
  }

  async sendResetSms(to: string, code: string): Promise<boolean> {
    if (!this.twilioClient) {
      this.logger.warn('Twilio not configured, skipping SMS');
      return false;
    }

    const from = this.configService.get<string>('TWILIO_FROM_NUMBER');
    if (!from) {
      this.logger.warn('TWILIO_FROM_NUMBER not set, skipping SMS');
      return false;
    }

    try {
      await this.twilioClient.messages.create({
        body: `Dish & Dash: your password reset code is ${code}. Valid for 30 min.`,
        from,
        to,
      });
      return true;
    } catch (error) {
      this.logger.error('Failed to send SMS:', error);
      return false;
    }
  }
}
