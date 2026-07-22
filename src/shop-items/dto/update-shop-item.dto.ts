import {
  IsBoolean,
  IsOptional,
  IsNumber,
  IsString,
  Min,
} from 'class-validator';

export class UpdateShopItemDto {
  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsNumber()
  categoryId?: number;
}
