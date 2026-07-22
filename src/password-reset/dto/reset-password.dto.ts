import { IsString, Length, MinLength, ValidateIf } from 'class-validator';

export class ResetPasswordDto {
  @ValidateIf((o: ResetPasswordDto) => !o.code)
  @IsString()
  token?: string;

  @ValidateIf((o: ResetPasswordDto) => !o.token)
  @IsString()
  @Length(6, 6)
  code?: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
