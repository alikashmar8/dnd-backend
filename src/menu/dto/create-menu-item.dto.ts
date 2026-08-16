import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateMenuItemDto {
  @IsNumber()
  categoryId!: number;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  nameAr?: string;

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

  @IsNumber()
  @Min(1)
  prepTimeMinutes!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietaryTags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietaryTagsAr?: string[];

  @IsOptional()
  @IsNumber()
  restaurantId?: number;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsBoolean()
  isDailyDish?: boolean;

  @IsOptional()
  @IsBoolean()
  isHealthyItem?: boolean;
}
