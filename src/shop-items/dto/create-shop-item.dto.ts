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

  @IsOptional()
  @IsString()
  nameAr?: string;

  @IsString()
  unit!: string;

  @IsOptional()
  @IsString()
  unitAr?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  descriptionAr?: string;

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
  @IsArray()
  @IsString({ each: true })
  dietaryTagsAr?: string[];

  @IsOptional()
  @IsBoolean()
  available?: boolean;
}
