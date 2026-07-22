import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../common/guards/auth.guard';
import { StorageService } from '../storage/storage.service';

@Controller()
export class FilesController {
  constructor(private readonly storageService: StorageService) {}

  @Get('files/:key/signed-url')
  async getSignedUrl(@Param('key') key: string) {
    const url = await this.storageService.getPresignedUrl(key);
    return { url };
  }

  @Post('files/signed-urls')
  async getSignedUrls(@Body() body: { keys: string[] }) {
    const urls = await this.storageService.getPresignedUrls(body.keys);
    return { urls };
  }

  @Post('upload')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
  ) {
    if (!file) {
      return { key: '', url: '' };
    }
    const key = await this.storageService.upload(file, folder || 'uploads');
    const url = await this.storageService.getPresignedUrl(key);
    return { key, url };
  }
}
