import { ApiKey } from './model/apikey.entity';
import { Item } from './model/item.entity';
import { LogPiece } from './model/logpiece.entity';
import { Pipeline } from './model/pipeline.entity';
import { Render } from './model/render.entity';
import { Role } from './model/roles.entity';
import { Users } from './model/user.entity';
export const config = {
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [Render, ApiKey, LogPiece, Pipeline, Item, Role, Users],
    synchronize: false,
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
    task: process.env.TASK_QUEUE || 'task',
    name: process.env.RENDER_QUEUE || 'render',
    logs: process.env.LOGS_QUEUE || 'logs',
    file: process.env.FILE_QUEUE || 'file',
    isTaskRunner: process.env.IS_TASK_RUNNER === 'true' ? true : false,
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
  tenantSecretKey: process.env.TENANT_SECRET_KEY as string,
  tenantUserId: process.env.TENANT_USER_ID as string,
  tenantId: process.env.TENANT_ID as string,
  supabaseHost: process.env.SUPABASE_URL as string,
  supabaseWorkerLogin: process.env.TENANT_WORKER_LOGIN as string,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY as string,
  platformHost: process.env.PLATFORM_HOST as string,
  platformAccessToken: process.env.PLATFORM_ACCESS_TOKEN as string,
  supabaseProjectId: process.env.SUPABASE_PROJECT_ID as string,
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY as string,
  supabaseJWKUrl: process.env.SUPABASE_JWKS_URL as string,
  publicBucket: process.env.S3_PUBLIC_BUCKET_ID || 'public',
  webAppHost: process.env.WEBAPP_HOST as string,
  otariApiKey: process.env.OTARI_API_KEY as string,
  otariHost: process.env.OTARI_HOST || 'https://eu.api.otari.ai',
  otariSystemPrompt:
    process.env.OTARI_SYSTEM_PROMPT ||
    'output only a git patch file which can be directly applied to the repo, without anything else',
  git: {
    httpsToken: process.env.GIT_HTTPS_TOKEN as string,
    cloneTimeoutMs: parseInt(process.env.GIT_CLONE_TIMEOUT_MS || '300000', 10),
    maxRepoBytes: parseInt(
      process.env.GIT_MAX_REPO_BYTES || String(500 * 1024 * 1024),
      10,
    ),
  },
};

export const supabaseEnv = {
  url: process.env.SUPABASE_URL as string,
  publishableKeys: {
    default: process.env.SUPABASE_PUBLISHABLE_KEY as string,
  },
  secretKeys: { default: config.supabaseSecretKey },
  jwks:
    typeof process.env.SUPABASE_JWKS_URL === 'string'
      ? new URL(process.env.SUPABASE_JWKS_URL)
      : undefined,
};
