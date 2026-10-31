import { ApiProperty } from '@nestjs/swagger';

export class Folder {
  @ApiProperty()
  id: string;
  @ApiProperty()
  userId: string;
  @ApiProperty()
  title: string;
  @ApiProperty()
  date: number;
  @ApiProperty()
  folderId?: string;
  @ApiProperty()
  orderId: number;
}

export enum Permission {
  rw = 'rw',
  w = 'w',
  r = 'r',
}
