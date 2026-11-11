import { ApiProperty } from '@nestjs/swagger';

import type { EditorLayer, EditorProject, Media } from '../types';

import {
  EditorLayer as EditorLayerClass,
  EditorProject as EditorProjectClass,
} from '../types';

import type { ChatCompletion } from '@mozilla-ai/otari';

export class Task {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  prompt: string;

  @ApiProperty()
  response: ChatCompletion;

  @ApiProperty()
  error: string;

  @ApiProperty()
  model: string;

  @ApiProperty()
  projectId: string;

  @ApiProperty()
  renderId: string;

  @ApiProperty()
  commentId: string;

  @ApiProperty({ type: EditorProjectClass })
  project: EditorProject;

  @ApiProperty({ type: EditorLayerClass, isArray: true })
  layers: EditorLayer[];

  @ApiProperty()
  result: Media;
}
