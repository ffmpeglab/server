import "reflect-metadata"
import { DataSource } from "typeorm"
import { ApiKey } from "./model/apikey.entity"
import { LogPiece } from "./model/logpiece.entity"
import { Pipeline } from "./model/pipeline.entity"
import { Render } from "./model/render.entity"

export const AppDataSource = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST,
    port: 5432,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    synchronize: false,
    logging: false,
    entities: [ApiKey, LogPiece, Pipeline, Render],
    migrations: [],
    subscribers: [],
})
