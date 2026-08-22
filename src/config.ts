import { ApiKey } from './model/apikey.entity';
import { LogPiece } from './model/logpiece.entity';
import { Pipeline } from './model/pipeline.entity';
import { Render } from './model/render.entity';
export const config = {
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [Render, ApiKey, LogPiece, Pipeline],
    synchronize: process.env.DB_MIGRATION_ENABLED === 'true' ? true : false,
  },
  queue: {
    db: {
      host: process.env.QUEUE_DB_HOST,
      port: parseInt(process.env.QUEUE_DB_PORT || '5432', 10),
      username: process.env.QUEUE_DB_USER,
      user: process.env.QUEUE_DB_USER,
      password: process.env.QUEUE_DB_PASSWORD,
      database: process.env.QUEUE_DB_NAME,
    },
    name: process.env.RENDER_QUEUE || 'render',
    logs: process.env.LOGS_QUEUE || 'logs',
    file: process.env.FILE_QUEUE || 'file',
    isRenderRunner: process.env.IS_RENDER_RUNNER === 'true' ? true : false,
    isLogsRunner: process.env.IS_LOGS_RUNNER === 'true' ? true : false,
    isFileRunner: process.env.IS_FILE_RUNNER === 'true' ? true : false,
  },
  s3: {
    bucketId: process.env.S3_BUCKET_ID || 'prod',
    region: process.env.S3_REGION as string,
    endpoint: process.env.S3_ENDPOINT as string,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY as string,
      secretAccessKey: process.env.S3_SECRET_KEY as string,
    },
  },
  ffmpeg: {
    path: process.env.FFMPEG_PATH as string,
  },
  maxUploadSize: process.env.MAX_UPLOAD_SIZE || 52428800000,
  pipelinesEnabled: process.env.PIPELINES_API_ENABLED === 'true',
  documentDir: process.env.DOCUMENT_DIRECTORY || '/tmp/ffmpeglab',
  isSupabasePlatform: process.env.IS_SUPABASE_PLATFORM === 'true',
  tenantServiceKey: process.env.TENANT_SERVICE_KEY as string,
  tenantUserId: process.env.TENANT_USER_ID as string,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY as string,
  platformHost: process.env.PLATFORM_HOST as string,
};
