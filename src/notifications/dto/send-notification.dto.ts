import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class SendNotificationDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsString()
  @IsOptional()
  data?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;
}
