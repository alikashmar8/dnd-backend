import { IsNumber, IsOptional } from 'class-validator';

export class AssignUserDto {
  @IsNumber()
  @IsOptional()
  userId?: number;
}
