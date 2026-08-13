import type { _Object, Owner } from '@aws-sdk/client-s3';
import { ApiProperty } from '@nestjs/swagger';
// Express
export class FileUploadDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file: any;
}

export class FileResponseDto {
  @ApiProperty({ type: 'string', format: 'url' })
  link: string;
}

export class FileObject implements _Object {
  @ApiProperty()
  Key: string;
  @ApiProperty()
  LastModified: Date;
  @ApiProperty()
  ETag: string;
  @ApiProperty()
  Size: number;
}

export class FileListDto {
  @ApiProperty({ type: FileObject, isArray: true })
  list: FileObject[];
}
