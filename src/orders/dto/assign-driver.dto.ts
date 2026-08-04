import { IsNotEmpty, IsNumberString } from 'class-validator';

export class AssignDriverDto {
  @IsNumberString()
  @IsNotEmpty()
  driverId!: string;
}
