import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import {
  FileInterceptor,
} from '@nestjs/platform-express';

import {
  AuthGuard,
} from '../common/guards/auth.guard';

import {
  StorageService,
} from '../storage/storage.service';

const MAX_FILE_SIZE =
  5 * 1024 * 1024;

const ALLOWED_MIME_TYPES =
  new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ]);

const ALLOWED_EXTENSIONS =
  /\.(jpe?g|png|webp|gif)$/i;

const ALLOWED_FOLDERS =
  new Set([
    'uploads',
    'menu',
    'shop',
    'ads',
    'avatars',
  ]);

@Controller()
export class FilesController {
  constructor(
    private readonly storageService:
      StorageService,
  ) {}

  @Get(
    'files/:key/signed-url',
  )
  @UseGuards(AuthGuard)
  async getSignedUrl(
    @Param('key') key: string,
  ) {
    const url =
      await this.storageService
        .getPresignedUrl(key);

    return { url };
  }

  @Post(
    'files/signed-urls',
  )
  @UseGuards(AuthGuard)
  async getSignedUrls(
    @Body()
    body: {
      keys: string[];
    },
  ) {
    const urls =
      await this.storageService
        .getPresignedUrls(
          body.keys,
        );

    return { urls };
  }

  @Post('upload')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor(
      'file',
      {
        limits: {
          fileSize:
            MAX_FILE_SIZE,
        },

        fileFilter: (
          _req,
          file,
          cb,
        ) => {
          console.log(
            'UPLOAD FILE:',
            {
              originalname:
                file.originalname,

              mimetype:
                file.mimetype,
            },
          );

          if (
            !ALLOWED_MIME_TYPES.has(
              file.mimetype,
            )
          ) {
            return cb(
              new BadRequestException(
                'Only image uploads are allowed (jpeg, png, webp, gif)',
              ),
              false,
            );
          }

          if (
            !ALLOWED_EXTENSIONS.test(
              file.originalname,
            )
          ) {
            return cb(
              new BadRequestException(
                'File extension is not allowed',
              ),
              false,
            );
          }

          cb(
            null,
            true,
          );
        },
      },
    ),
  )
  async upload(
    @UploadedFile()
    file: Express.Multer.File,

    @Body('folder')
    folder?: string,
  ) {
    console.log(
      '================================',
    );

    console.log(
      'FILE UPLOAD REQUEST',
    );

    console.log(
      'Folder:',
      folder,
    );

    console.log(
      'File:',
      file
        ? {
            originalname:
              file.originalname,

            mimetype:
              file.mimetype,

            size:
              file.size,
          }
        : null,
    );

    console.log(
      '================================',
    );

    if (!file) {
      throw new BadRequestException(
        'No file was uploaded',
      );
    }

    const targetFolder =
      folder &&
      ALLOWED_FOLDERS.has(
        folder,
      )
        ? folder
        : 'uploads';

    const key =
      await this.storageService.upload(
        file,
        targetFolder,
      );

    console.log(
      'UPLOADED KEY:',
      key,
    );

    const url =
      await this.storageService
        .getPresignedUrl(
          key,
        );

    console.log(
      'SIGNED URL CREATED',
    );

    return {
      key,
      url,
    };
  }
}