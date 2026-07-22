import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateShopItemDto {
  @IsNumber()
  categoryId!: number;

  @IsString()
  name!: string;

  @IsString()
  unit!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsString()
  image!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietaryTags?: string[];

  @IsOptional()
  @IsBoolean()
  available?: boolean;
}
