import {
  IsOptional,
  IsString,
  Length,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class ResetPasswordDto {
  @ValidateIf((o: ResetPasswordDto) => !o.code)
  @IsString()
  token?: string;

  @ValidateIf((o: ResetPasswordDto) => !o.token)
  @IsString()
  @Length(6, 6)
  code?: string;

  /**
   * Email or phone of the user requesting the reset. Scopes the 6-digit code
   * lookup to a single user so a code can never match another user's token.
   */
  @ValidateIf((o: ResetPasswordDto) => !o.token)
  @IsOptional()
  @IsString()
  identifier?: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
