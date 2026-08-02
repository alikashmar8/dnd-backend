import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateAddressDto {
  @IsNotEmpty()
  @IsString()
  title!: string;

  @IsNotEmpty()
  @IsString()
  city!: string;

  @IsNotEmpty()
  @IsString()
  street!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;
}
