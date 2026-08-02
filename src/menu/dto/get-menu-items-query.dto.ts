import { IsOptional, IsString, IsIn, IsEnum, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { MealType } from '../../enums/meal-type.enum.js';

export class GetMenuItemsQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(MealType)
  type?: MealType;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['<25', '25-45', '>45'])
  price?: string;

  @IsOptional()
  @IsIn(['4.3+', '4.6+'])
  rating?: string;

  @IsOptional()
  @IsIn(['20', '30', '45'])
  prepTime?: string;

  @IsOptional()
  @IsString()
  dietary?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  restaurantId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;
}
