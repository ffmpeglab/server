import { ApiProperty } from '@nestjs/swagger';

export class S3Credentials {
  @ApiProperty()
  accessKeyId: string;
  @ApiProperty()
  secretAccessKey: string;
  @ApiProperty()
  sessionToken: string;
}

export class S3Config {
  @ApiProperty()
  bucketId: string;
  @ApiProperty()
  region: string;
  @ApiProperty()
  endpoint: string;
  @ApiProperty()
  userId: string;
  @ApiProperty({ type: S3Credentials })
  credentials: S3Credentials;
}

export enum FileTypeApi {
  PNG = 'PNG',
  JPEG = 'JPEG',
  IMG = 'IMG',
  JPG = 'JPG',
  GIF = 'GIF',
  TXT = 'TXT',
  PDF = 'PDF',
  DOC = 'DOC',
  DOCX = 'DOCX',
  XLS = 'XLS',
  XLSX = 'XLSX',
  PPT = 'PPT',
  PPTX = 'PPTX',
  AAC = 'AAC',
  MP3 = 'MP3',
  AVI = 'AVI',
  M4A = 'M4A',
  MP4 = 'MP4',
  MOV = 'MOV',
  PCM = 'PCM',
  PROTO = 'PROTO',
  IPS = 'IPS',
  MKV = 'MKV',
}

export const ImageFormats = [
  FileTypeApi.IMG,
  FileTypeApi.JPEG,
  FileTypeApi.GIF,
  FileTypeApi.JPG,
  FileTypeApi.PNG,
];

export const MediaFormats = [
  FileTypeApi.AVI,
  FileTypeApi.M4A,
  FileTypeApi.MOV,
  FileTypeApi.MP3,
  FileTypeApi.AAC,
  FileTypeApi.PCM,
];

export const DocumentFormats = [
  FileTypeApi.DOC,
  FileTypeApi.DOCX,
  FileTypeApi.PDF,
  FileTypeApi.XLS,
  FileTypeApi.XLSX,
  FileTypeApi.PPT,
  FileTypeApi.PPTX,
];

export interface PickerAssetExtension {
  name: string;
  fileType: FileTypeApi;
  mimeType: keyof typeof fileTypesApi;
  size: number;
  fileSize: number;
  duration?: number;
}

export const fileTypesApi = {
  'image/png': FileTypeApi.PNG,
  'image/jpeg': FileTypeApi.JPEG,
  'image/jpg': FileTypeApi.JPG,
  'image/gif': FileTypeApi.GIF,
  'text/plain': FileTypeApi.TXT,
  // NOT SUPPORTED BY WEB
  'video/x-msvideo': FileTypeApi.AVI,
  'audio/mpeg': FileTypeApi.MP3,
  'audio/aac': FileTypeApi.AAC,
  'audio/mp4': FileTypeApi.M4A,
  'audio/mp3': FileTypeApi.MP3,
  'video/mp4': FileTypeApi.MP4,
  'video/x-matroska': FileTypeApi.MKV,
  'video/matroska': FileTypeApi.MKV,
  'video/*': FileTypeApi.MKV,
  'video/mkv': FileTypeApi.MKV,
  'video/quicktime': FileTypeApi.MOV,
  // NOT SUPPORTED BY WEB
  'application/pdf': FileTypeApi.PDF,
  'application/vnd.ms-excel': FileTypeApi.XLS,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    FileTypeApi.XLSX,
  'application/msword': FileTypeApi.DOC,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    FileTypeApi.DOCX,
  'application/vnd.ms-powerpoint': FileTypeApi.PPT,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    FileTypeApi.PPTX,
};
