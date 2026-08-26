import { ApiProperty } from '@nestjs/swagger';
import { Folder } from './Folder';
export * from './MediaUtils';
import {
  CodeSelection,
  FFMpegOutputType,
  FFMpegPreset,
  PositionParams,
  Resize,
  RGB,
  SpeedValue,
  XFade,
} from './MediaUtils';
import type { XFADE } from './MediaUtils';
export const defaultVideoDuration = 5;
export type MinimalMedia = Pick<
  Media,
  | 'id'
  | 'duration'
  | 'filename'
  | 'width'
  | 'height'
  | 'title'
  | 'filePath'
  | 'url'
  | 'userId'
>;

export class Media {
  @ApiProperty()
  id: string;
  @ApiProperty()
  uri?: string;
  @ApiProperty()
  url?: string;
  @ApiProperty()
  date: number;
  @ApiProperty()
  folderId: string;
  @ApiProperty()
  title: string;
  @ApiProperty()
  description?: string;
  @ApiProperty()
  filename: string;
  @ApiProperty()
  fileType: string;
  @ApiProperty()
  userId: string;
  @ApiProperty()
  size?: number;
  @ApiProperty()
  type?: string;
  @ApiProperty()
  hasCloud?: boolean;
  @ApiProperty()
  hasAudio?: boolean;
  @ApiProperty()
  width: number;
  @ApiProperty()
  height: number;
  @ApiProperty()
  orderId?: number;
  @ApiProperty()
  duration?: number;
  @ApiProperty()
  isCopy?: string;
  filePath?: string;
  @ApiProperty()
  isVideo?: boolean;
  @ApiProperty()
  isAudio?: boolean;
  @ApiProperty()
  isTextFile?: string;
  @ApiProperty()
  isReplace?: boolean;
}

export class EditorProjectConfiguration {
  @ApiProperty()
  length: number;
  @ApiProperty()
  width: number;
  @ApiProperty()
  height: number;
  @ApiProperty()
  lastUpdated: number;
  @ApiProperty()
  start?: number;
  @ApiProperty()
  end?: number;
  @ApiProperty()
  outputFilePath?: string;
  @ApiProperty()
  compressionLevel: number;
  @ApiProperty()
  framerate?: number;
  @ApiProperty()
  opacity?: number;
  @ApiProperty()
  aspectRatio?: string;
  @ApiProperty({ enum: FFMpegPreset })
  preset: FFMpegPreset;
  @ApiProperty({ enum: FFMpegOutputType })
  output: FFMpegOutputType;
  @ApiProperty()
  code?: string;
  @ApiProperty({ enum: CodeSelection })
  selectedCode?: CodeSelection;
}

export class EditorProject extends Folder {
  @ApiProperty()
  editor: EditorProjectConfiguration;
}

export class EditorLayerParams {
  @ApiProperty()
  muted?: boolean;
  @ApiProperty()
  videoDisabled?: boolean;
  @ApiProperty()
  isCommentLayer?: boolean;
}

export class EncoderProjectEncoding {
  @ApiProperty()
  outputFilePath?: string;
  @ApiProperty()
  compressionLevel: number;
  @ApiProperty()
  width: number;
  @ApiProperty()
  height: number;
  @ApiProperty()
  crf: number;
  @ApiProperty({ enum: FFMpegPreset })
  preset: FFMpegPreset;
  @ApiProperty({ enum: FFMpegOutputType })
  output: FFMpegOutputType;
  @ApiProperty()
  code?: string[];
  @ApiProperty()
  lastUpdated?: number;
  @ApiProperty()
  start?: number;
  @ApiProperty()
  end?: number;
  @ApiProperty()
  soundVolume?: number;
  @ApiProperty()
  opacity?: number;
  @ApiProperty()
  reverse?: true;
  @ApiProperty({ enum: SpeedValue })
  speed?: SpeedValue;
  @ApiProperty({ enum: XFade })
  transitionIn?: XFADE;
  @ApiProperty({ enum: XFade })
  transitionOut?: XFADE;
  @ApiProperty()
  transitionInDuration?: number;
  @ApiProperty()
  transitionOutDuration?: number;
  @ApiProperty({ type: PositionParams })
  pan?: PositionParams;
  @ApiProperty({ type: PositionParams })
  crop?: PositionParams;
  @ApiProperty({ type: Resize })
  resize?: Resize;
  @ApiProperty({ type: RGB })
  color?: RGB;
  @ApiProperty()
  scale?: number;
}
export class EncoderProject extends Media {
  @ApiProperty({ type: EncoderProjectEncoding })
  encoding: EncoderProjectEncoding;
  key?: string;
  bucket?: string;
}
export class EditorLayer extends Folder {
  @ApiProperty()
  isEditorLayer?: boolean;
  @ApiProperty({ type: EditorLayerParams })
  editor: EditorLayerParams;
  @ApiProperty({ type: EncoderProject, isArray: true })
  media: EncoderProject[];
}

export class RenderData {
  @ApiProperty({ type: EditorProject })
  project: EditorProject;
  @ApiProperty({ type: [EditorLayer] })
  layers: EditorLayer[];
}

export class RenderResponse {
  @ApiProperty()
  id: string;
  @ApiProperty()
  title: string;
  @ApiProperty()
  project: string;
  @ApiProperty()
  status: string;
  @ApiProperty()
  public: boolean;
  @ApiProperty()
  user_id: string;
  @ApiProperty()
  progress: number;
  @ApiProperty()
  logs: string;
  @ApiProperty({ type: RenderData })
  data: RenderData;
  @ApiProperty({ type: Media })
  result: Media;
}
