import { ApiProperty } from '@nestjs/swagger';

import { ModelObject } from '@mozilla-ai/otari';

export class RunTaskDto {
  @ApiProperty()
  id: string;
}

export class ModelObjectDto implements ModelObject {
  @ApiProperty()
  created: number;
  @ApiProperty()
  id: string;
  @ApiProperty()
  ownedBy: string;
  @ApiProperty()
  object?: string | undefined;
}
