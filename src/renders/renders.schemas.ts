import * as z from 'zod';
import {
  CodeSelection,
  FFMpegOutputType,
  FFMpegPreset,
  SpeedValue,
  XFade,
} from '../types';

// ---------- Primitives (MediaUtils) ----------

export const zPositionParams = z.object({
  top: z.number(),
  bottom: z.number(),
  left: z.number(),
  right: z.number(),
});

export const zResize = z.object({ x: z.number(), y: z.number() });

export const zRGB = z.object({
  r: z.number(),
  g: z.number(),
  b: z.number(),
});

export const zGitRepo = z.object({
  ref: z.string(),
  path: z.string(),
  platform: z.string(),
  repoFullName: z.string(),
});

// ---------- EditorProjectConfiguration ----------

export const zEditorProjectConfiguration = z.object({
  length: z.number(),
  width: z.number(),
  height: z.number(),
  lastUpdated: z.number(),
  start: z.number().optional(),
  end: z.number().optional(),
  outputFilePath: z.string().optional(),
  compressionLevel: z.number(),
  framerate: z.number().optional(),
  opacity: z.number().optional(),
  aspectRatio: z.string().optional(),
  preset: z.nativeEnum(FFMpegPreset),
  output: z.nativeEnum(FFMpegOutputType),
  code: z.string().optional(),
  selectedCode: z.nativeEnum(CodeSelection).optional(),
  gitRepo: zGitRepo.optional(),
});

// ---------- EncoderProjectEncoding ----------

export const zEncoderProjectEncoding = z.object({
  outputFilePath: z.string().optional(),
  compressionLevel: z.number(),
  width: z.number(),
  height: z.number(),
  crf: z.number(),
  preset: z.nativeEnum(FFMpegPreset),
  output: z.nativeEnum(FFMpegOutputType),
  code: z.array(z.string()).optional(),
  lastUpdated: z.number().optional(),
  start: z.number().optional(),
  end: z.number().optional(),
  soundVolume: z.number().optional(),
  opacity: z.number().optional(),
  reverse: z.literal(true).optional(),
  speed: z.nativeEnum(SpeedValue).optional(),
  transitionIn: z.nativeEnum(XFade).optional(),
  transitionOut: z.nativeEnum(XFade).optional(),
  transitionInDuration: z.number().optional(),
  transitionOutDuration: z.number().optional(),
  pan: zPositionParams.optional(),
  crop: zPositionParams.optional(),
  resize: zResize.optional(),
  color: zRGB.optional(),
  scale: z.number().optional(),
  backgroundColor: z.string().optional(),
});

// ---------- EncoderProject (Media + encoding/key/bucket) ----------

const zMediaBase = z.object({
  id: z.string(),
  uri: z.string().optional(),
  url: z.string().optional(),
  date: z.number(),
  folderId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  filename: z.string(),
  fileType: z.string(),
  userId: z.string(),
  size: z.number().optional(),
  type: z.string().optional(),
  hasCloud: z.boolean().optional(),
  hasAudio: z.boolean().optional(),
  width: z.number(),
  height: z.number(),
  orderId: z.number().optional(),
  duration: z.number().optional(),
  isCopy: z.string().optional(),
  filePath: z.string().optional(),
  isVideo: z.boolean().optional(),
  isAudio: z.boolean().optional(),
  isTextFile: z.string().optional(),
  isReplace: z.boolean().optional(),
});

export const zEncoderProject = zMediaBase
  .extend({
    encoding: zEncoderProjectEncoding,
    key: z.string().optional(),
    bucket: z.string().optional(),
  })
  .passthrough();

// ---------- EditorLayerParams ----------

export const zEditorLayerParams = z.object({
  muted: z.boolean().optional(),
  videoDisabled: z.boolean().optional(),
  isCommentLayer: z.boolean().optional(),
});

// ---------- EditorLayer (Folder + isEditorLayer + editor + media) ----------
// `Folder` isn't visible here, so we validate the fields the service / renderer
// actually consume and pass the rest through.

export const zEditorLayer = z
  .object({
    id: z.string().describe('Layer id'),
    title: z.string().describe('Layer title'),
    isEditorLayer: z.boolean().optional(),
    editor: zEditorLayerParams,
    media: z.array(zEncoderProject).default([]),
  })
  .passthrough();

// ---------- EditorProject (Folder + editor) ----------
// writeRender needs project.id and project.title; renderer needs project.editor.

export const zEditorProject = z
  .object({
    id: z.string().describe('Project id'),
    title: z.string().describe('Project title'),
    editor: zEditorProjectConfiguration,
  })
  .passthrough();

// ---------- RenderData (create_render input) ----------

export const zRenderData = z.object({
  project: zEditorProject,
  layers: z.array(zEditorLayer).describe('Timeline layers, bottom → top'),
  public: z.boolean().optional(),
});

// ---------- Inferred types ----------

export type RenderDataInput = z.infer<typeof zRenderData>;
export type EditorProjectInput = z.infer<typeof zEditorProject>;
export type EditorLayerInput = z.infer<typeof zEditorLayer>;
