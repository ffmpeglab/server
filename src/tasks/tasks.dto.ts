import { ApiProperty } from '@nestjs/swagger';

export class RunTaskDto {
  @ApiProperty()
  id: string;
}
