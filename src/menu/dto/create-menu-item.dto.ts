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
  description?: string;

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
  @IsNumber()
  restaurantId?: number;

  @IsOptional()
  @IsBoolean()
  available?: boolean;
}
