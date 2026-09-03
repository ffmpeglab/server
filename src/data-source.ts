import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ApiKey } from './model/apikey.entity';
import { LogPiece } from './model/logpiece.entity';
import { Pipeline } from './model/pipeline.entity';
import { Render } from './model/render.entity';
import { Init1787055357610 } from './migrations/1787055357610-init';
import * as dotenv from 'dotenv';
dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: 5432,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: false,
  logging: false,
  schema: 'public',
  entities: [ApiKey, LogPiece, Pipeline, Render],
  migrations: [Init1787055357610],
  subscribers: [],
});
