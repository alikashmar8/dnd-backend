import { IsEmail, IsPhoneNumber, IsString, ValidateIf } from 'class-validator';

export class ForgotPasswordDto {
  @ValidateIf((o: ForgotPasswordDto) => !o.phone)
  @IsEmail()
  email?: string;

  @ValidateIf((o: ForgotPasswordDto) => !o.email)
  @IsPhoneNumber()
  @IsString()
  phone?: string;
}
