import { IsInt, Min } from 'class-validator';

export class CreateChatDto {
  @IsInt()
  @Min(1)
  participantId!: number;
}
