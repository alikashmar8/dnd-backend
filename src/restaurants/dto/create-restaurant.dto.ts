import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MealType } from '../../enums/meal-type.enum';
import { CreateAddressDto } from '../../addresses/dto/create-address.dto';

export class CreateRestaurantDto {
  @IsString()
  name!: string;

  @IsEnum(MealType)
  mealType!: MealType;

  @IsString()
  logoImage!: string;

  @IsNumber()
  @Min(1)
  deliveryMinutes!: number;

  @IsString()
  priceLevel!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ValidateNested()
  @Type(() => CreateAddressDto)
  address!: CreateAddressDto;
}
