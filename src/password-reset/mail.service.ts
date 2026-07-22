import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initialize();
  }

  private initialize() {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<string>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!host || !port || !user || !pass) {
      this.logger.warn('SMTP not configured. Email sending disabled.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: parseInt(port, 10),
      secure: parseInt(port, 10) === 465,
      auth: { user, pass },
    });
  }

  async sendResetEmail(
    to: string,
    token: string,
    code: string,
  ): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('SMTP not configured, skipping email');
      return false;
    }

    const fromName =
      this.configService.get<string>('SMTP_FROM_NAME') || 'Dish & Dash';
    const fromEmail =
      this.configService.get<string>('SMTP_FROM') || 'noreply@dishanddash.com';
    const resetUrl = `${this.configService.get<string>('PASSWORD_RESET_URL') || ''}?token=${token}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Password Reset</h2>
        <p>Click the link below to reset your password. This link expires in 30 minutes.</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Reset Password
        </a>
        <p>Or enter this code in the app: <strong>${code}</strong></p>
        <p style="color: #666; font-size: 12px;">If you didn't request this, ignore this email.</p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject: 'Password Reset - Dish & Dash',
        html,
      });
      return true;
    } catch (error) {
      this.logger.error('Failed to send email:', error);
      return false;
    }
  }
}
