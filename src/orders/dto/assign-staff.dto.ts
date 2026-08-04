import { IsNotEmpty, IsNumberString } from 'class-validator';

export class AssignStaffDto {
  @IsNumberString()
  @IsNotEmpty()
  staffId!: string;
}
