import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsPhoneNumber()
  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  fcmToken?: string;
}

export class LoginDto {
  @IsPhoneNumber()
  phone!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  fcmToken?: string;
}
