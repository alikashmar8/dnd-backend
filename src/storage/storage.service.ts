import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Express } from 'express';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly endpoint?: string;
  private readonly signedUrlExpiry: number;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('storage.region', 'us-east-1');
    this.bucket = this.configService.get<string>(
      'storage.bucket',
      'dnd-uploads',
    );
    this.endpoint = this.configService.get<string>('storage.endpoint');
    this.signedUrlExpiry = this.configService.get<number>(
      'storage.signedUrlExpiry',
      900,
    );

    const accessKeyId = this.configService.get<string>(
      'storage.accessKeyId',
      '',
    );
    const secretAccessKey = this.configService.get<string>(
      'storage.secretAccessKey',
      '',
    );
    const useSsl = this.configService.get<boolean>('storage.useSsl', true);
    const forcePathStyle = this.configService.get<boolean>(
      'storage.forcePathStyle',
      false,
    );

    this.s3 = new S3Client({
      region: this.region,
      endpoint: this.endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle,
      ...(useSsl ? {} : { tls: false }),
    });

    this.logger.log(
      `Storage initialized — bucket="${this.bucket}" endpoint="${this.endpoint || 'AWS S3'}" signedUrlExpiry=${this.signedUrlExpiry}s`,
    );
  }

  async getPresignedUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.s3, command, {
      expiresIn: this.signedUrlExpiry,
    });
  }

  async getPresignedUrls(keys: string[]): Promise<Record<string, string>> {
    const entries = await Promise.all(
      keys.map(async (key) => {
        const url = await this.getPresignedUrl(key);
        return [key, url] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  async upload(file: Express.Multer.File, folder: string): Promise<string> {
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${folder}/${Date.now()}-${sanitizedName}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return key;
  }

  async delete(key: string): Promise<void> {
    try {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.error(`Failed to delete file: ${key}`, error);
    }
  }
}
