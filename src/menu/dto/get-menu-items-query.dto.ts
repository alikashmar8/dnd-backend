import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { MealType } from '../../enums/meal-type.enum.js';

export class GetMenuItemsQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(MealType)
  type?: MealType;

  @IsOptional()
  @IsString()
  search?: string;

  /** Legacy bucket filter (kept for compatibility with existing clients). */
  @IsOptional()
  @IsIn(['<25', '25-45', '>45'])
  price?: string;

  @IsOptional()
  @IsIn(['4.3+', '4.6+'])
  rating?: string;

  /** Numeric price range filters (combined with any `price` bucket if both sent). */
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  maxPrice?: number;

  /** Numeric minimum rating filter, e.g. minRating=4 means rating >= 4. */
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(5)
  minRating?: number;

  @IsOptional()
  @IsIn(['20', '30', '45'])
  prepTime?: string;

  @IsOptional()
  @IsString()
  dietary?: string;

  @IsOptional()
  @IsIn(['newest', 'popular'])
  sort?: 'newest' | 'popular';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  restaurantId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  is_daily_dish?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  is_healthy_item?: boolean;
}
