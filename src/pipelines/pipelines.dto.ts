import { ApiParam, ApiProperty } from '@nestjs/swagger';
import { Pipeline } from '../model/pipeline.entity';

export class UpdatePipelineDto implements Omit<
  Pipeline,
  'user_id' | 'date' | 'updated' | 'version'
> {
  @ApiProperty()
  title: string;
  @ApiProperty()
  downsql: string;
  @ApiProperty()
  upsql: string;
  @ApiProperty()
  yml: string;
  @ApiProperty()
  id: string;
  @ApiProperty()
  status: string;
}

export class CreatePipelineDto implements Omit<
  UpdatePipelineDto,
  'id' | 'status'
> {
  @ApiProperty()
  title: string;
  @ApiProperty()
  downsql: string;
  @ApiProperty()
  upsql: string;
  @ApiProperty()
  yml: string;
}

export class TranspilerRequest {
  @ApiProperty()
  yml: string;
}

export class TranspilerResponse {
  @ApiProperty()
  files: { [key: string]: string };
}
