import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { MealType } from '../../enums/meal-type.enum.js';

export class GetRestaurantsQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(MealType)
  type?: MealType;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['$', '$$', '$$$'])
  priceLevel?: string;

  @IsOptional()
  @IsIn(['4.3+', '4.6+'])
  rating?: string;

  @IsOptional()
  @IsString()
  tags?: string;
}
