import { config } from '../../config';
import { Media } from '../../types';

export const processFileName = (filename: string) =>
  filename?.replace(/[^a-zA-Z0-9_.-]/g, '') || '';

export const getFileId = (media: Media) =>
  `${processFileName(media.id)}_${processFileName(media.filename || media.title)}`;

export const documentDir = () => config.documentDir;
