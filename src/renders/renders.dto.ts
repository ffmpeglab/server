import { ApiProperty } from '@nestjs/swagger';

import type { EditorLayer, EditorProject } from '../types';

import {
  EditorLayer as EditorLayerClass,
  EditorProject as EditorProjectClass,
} from '../types';
import { LogPiece } from '../model/logpiece.entity';

export class RenderDto {
  @ApiProperty({ type: EditorProjectClass })
  project: EditorProject;

  @ApiProperty({ type: EditorLayerClass, isArray: true })
  layers: EditorLayer[];
}

export class RunDto {
  @ApiProperty()
  id: string;
}

export class LogsResponse {
  @ApiProperty({ type: LogPiece, isArray: true })
  logs: LogPiece[];
}
