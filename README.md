# FFmpegLab Server & SDK

![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Evolu](https://img.shields.io/badge/Evolu-FF6B6B?style=for-the-badge&logo=evolu&logoColor=white)
![FFmpeg](https://img.shields.io/badge/FFmpeg-007808?style=for-the-badge&logo=ffmpeg&logoColor=white)
![Deno](https://img.shields.io/badge/Deno-000000?style=for-the-badge&logo=deno&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)

FFmpegLab is an ecosystem for automated media processing. This repository contains:

- **FFmpegLab Server** – the API backend with render job management, runners, and Supabase integration.
- **YAML Transpiler** – a declarative tool that converts YAML pipeline definitions into PostgreSQL migrations (SQL triggers, buckets, pgmq).
- **TypeScript SDK** – a client library for interacting with the FFmpegLab API.

---

## Quick Start

### Server

The automatic script installs Supabase and FFmpegLab:

```bash
curl -sSL https://ffmpeglab.com/sh/install.sh | bash
```

The server will be available at `http://localhost:3000`.

### YAML Transpiler

For declarative pipeline definitions, download the transpiler:

```bash
curl -O https://raw.githubusercontent.com/ffmpeglab/server/main/sdk/yaml/transpiler.ts
curl -O https://raw.githubusercontent.com/ffmpeglab/server/main/sdk/yaml/svg.ts
```

Then generate a migration from a YAML file:

```bash
deno run --allow-read --allow-write transpiler.ts video-pipeline.yaml ./supabase/migrations --svg
```

See the [YAML Transpiler section](#yaml-transpiler) for full details.

---

## Project Structure

```
.
├── sdk/
│   ├── ts/                       # TypeScript SDK
│   │   ├── src/                  # SDK source code
│   │   └── README.md             # SDK documentation
│   ├── yaml/                     # YAML transpiler & examples
│   │   ├── examples/             # Ready-to-use pipeline templates
│   │   ├── transpiler.ts         # Main transpiler script
│   │   ├── svg.ts                # SVG graph generator
│   │   └── README.md             # Transpiler documentation
│   └── ...
├── src/                          # Server source code
│   ├── models/                   # TypeORM models (Render, ApiKey, LogPiece)
│   ├── ffmpeg/                   # FFmpeg encoding logic
│   └── renders/                  # Render processing service
├── migrations/                   # Database migrations
├── docker-compose.yml            # Docker setup with all services
├── package.json                  # Node.js dependencies
└── README.md                     # This file
```

---

## Services

The server runs as multiple services (runners) that can be scaled independently.

| Service | Description | Port |
|---------|-------------|------|
| `api` | Main API server | 3000 |
| `render-runner` | Executes FFmpeg rendering jobs | - |
| `logs-runner` | Processes logs | - |

---

## Powered by Supabase

FFmpegLab Server is built on **Supabase** — the open-source Firebase alternative — as a **full-cycle provider** for all backend services:

| Service | Provider | Description |
|---------|----------|-------------|
| **PostgreSQL** | Supabase | Primary database with Row Level Security (RLS) |
| **pgmq** | Supabase | Job queue for asynchronous render processing |
| **S3-compatible Storage** | Supabase | File storage for media assets and rendered output |
| **REST API** | Supabase | Auto-generated REST API with JWT authentication |
| **API Keys** | Supabase | User-managed API keys with role-based access |
| **Logs** | Supabase | Centralized storage of FFmpegLab runner stdout from the ffmpeg execution |

### Database Schema & Models

The server uses TypeORM with models defined in `src/models/`:

| Model | Description |
|-------|-------------|
| `Render` | Render job tracking and status |
| `ApiKey` | API key management with permissions |
| `LogPiece` | FFmpeg runner stdout from the ffmpeg execution |

---

## Configuration

### Minimal `.env` file

```env
# Database
DB_HOST=postgres
DB_USER=postgres
DB_PORT=5432
DB_PASSWORD=your_password
DB_NAME=ffmpeglab

# S3 Storage (required for file-runner)
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
S3_REGION=us-east-1
S3_ENDPOINT=https://s3.amazonaws.com
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DB_HOST` | PostgreSQL host | Yes |
| `DB_USER` | PostgreSQL user | Yes |
| `DB_PASSWORD` | PostgreSQL password | Yes |
| `DB_NAME` | PostgreSQL database name | Yes |
| `S3_ACCESS_KEY` | S3 access key | For file-runner |
| `S3_SECRET_KEY` | S3 secret key | For file-runner |
| `DB_MIGRATION_ENABLED` | Auto-run migrations | No (default: false) |
| `IS_RENDER_RUNNER` | Enable render runner mode | For render-runner |
| `IS_FILE_RUNNER` | Enable file runner mode | For file-runner |
| `IS_LOGS_RUNNER` | Enable logs runner mode | For logs-runner |

---

## API Reference

Full API documentation: **[api.ffmpeglab.com/api](https://api.ffmpeglab.com/api)**

### Request/Response Objects

All schemas are defined in the OpenAPI specification. Key models from `src/models/`:

| Schema | Model | Description | Link |
|--------|-------|-------------|------|
| `EditorProjectConfiguration` | `Project` | Full editor project configuration | [View](https://api.ffmpeglab.com/api#/components/schemas/EditorProjectConfiguration) |
| `EditorProject` | `Project` | Project metadata | [View](https://api.ffmpeglab.com/api#/components/schemas/EditorProject) |
| `RenderData` | `Render` | Render job data | [View](https://api.ffmpeglab.com/api#/components/schemas/RenderData) |
| `RenderDto` | `Render` | Render data transfer object | [View](https://api.ffmpeglab.com/api#/components/schemas/RenderDto) |
| `RunDto` | `Render` | Run execution request | [View](https://api.ffmpeglab.com/api#/components/schemas/RunDto) |
| `RenderResponse` | `Render` | API response for render operations | [View](https://api.ffmpeglab.com/api#/components/schemas/RenderResponse) |
| `EditorLayer` | `Project` | Individual editor layer | [View](https://api.ffmpeglab.com/api#/components/schemas/EditorLayer) |
| `EncoderProject` | `Project` | Encoder project configuration | [View](https://api.ffmpeglab.com/api#/components/schemas/EncoderProject) |
| `Media` | `Project` | Media file metadata | [View](https://api.ffmpeglab.com/api#/components/schemas/Media) |

### Common Endpoints

| Method | Endpoint | Description | Model |
|--------|----------|-------------|-------|
| `GET` | `/` | Health check | - |
| `GET` | `/renders` | List all renders | `Render[]` |
| `POST` | `/renders` | Create a render job | `Render` |
| `GET` | `/renders/{id}` | Get render by ID | `Render` |
| `PUT` | `/renders/run` | Trigger render execution | `RunDto` |

---

## Usage Examples

### cURL (from `example.sh`)

This example creates a render, triggers it, and polls the status:

```bash
# Create a render
RENDER=$(curl -X POST ${API_HOST}/renders \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "project": {
      "id": "myproject",
      "title": "myproject",
      "editor": {
        "code": "-i $MEDIA_1 -movflags +faststart -y $OUTPUT_PATH",
        "selectedCode": "custom"
      }
    },
    "layers": [
      {
        "id": "layer1",
        "media": [
          {
            "id": "media1",
            "url": "https://www.ffmpeglab.com/media/zoompan.mp4",
            "folderId":"myfolder",
            "filename":"zoompan.mp4",
            "encoding":{}
          }
        ],
        "editor":{}
      }
    ]
  }')

RENDER_ID=$(echo "${RENDER}" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"\(.*\)"/\1/')
echo "RENDER_ID: ${RENDER_ID}"

# Trigger the render
RUN=$(curl -X PUT $API_HOST/renders/run \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"id\": \"$RENDER_ID\"}")

# Poll the status
curl -X GET $API_HOST/renders/${RENDER_ID} \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json"

sleep 3

curl -X GET $API_HOST/renders/${RENDER_ID} \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json"
```

### TypeScript SDK

The TypeScript SDK provides a typed client for the FFmpegLab API.

**Installation**

```bash
npm install ffmpeglab-sdk
```

**Usage**

```ts
import * as ffmpeglab from 'ffmpeglab-sdk';

const mediaUrl = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4';

const clientConfig = new ffmpeglab.Configuration({
  accessToken: 'API_KEY',
  basePath: 'https://api.ffmpeglab.com',
});

const client = new ffmpeglab.RendersApi(clientConfig);

// Create a render
client.rendersControllerCreate({
  renderDto: {
    project: {
      id: 'myproject',
      title: 'myproject',
      editor: {
        code: '-i $MEDIA_1 -movflags +faststart -y $OUTPUT_PATH',
        selectedCode: 'custom'
      }
    },
    layers: [
      {
        id: 'layer1',
        media: [
          {
            id: 'media1',
            url: mediaUrl,
            folderId: "myfolder",
            filename: "zoompan.mp4",
            encoding: {}
          }
        ],
        editor: {}
      }
    ]
  }
})
.then((render) => client.rendersControllerRunRender({
  runDto: { id: render.id }
}))
.then(() => console.log('Render completed successfully!'));
```

For full SDK documentation, see the [TypeScript SDK README](./sdk/ts/README.md) and the [API reference](https://github.com/ffmpeglab/server/blob/main/sdk/ts/docs/RendersApi.md).

---

## YAML Transpiler

The YAML transpiler (located in `sdk/yaml/`) enables **declarative pipeline definitions** for media processing. You describe your pipeline in a YAML file – buckets, steps, triggers, and FFmpeg commands – and the transpiler generates a complete PostgreSQL migration (idempotent SQL with triggers and RLS policies) for Supabase.

### Features

- **Declarative syntax** – define steps, triggers, and storage in clean YAML.
- **Automatic SQL generation** – produces migrations for Supabase Storage and pgmq.
- **Visual SVG graphs** – generate a diagram of your pipeline with `--svg`.
- **Sequential & parallel steps** – use `next_bucket` for chaining or `keep: true` for direct output.
- **Per‑run grouping** – all outputs for a single upload are stored under a unique `runId` folder.

### Examples

Ready‑to‑use pipeline templates are provided in [`sdk/yaml/examples/`](./sdk/yaml/examples/):

| Pipeline | File | Description |
|----------|------|-------------|
| **Audio Processing** | `audio.yaml` / `audio.svg` | Sequential audio processing (podcast) |
| **Video Onboarding** | `video.yaml` / `video.svg` | Parallel video & image processing |
| **Whisper Subtitles** | `whisper-subtitles.yaml` / `whisper-subtitles.svg` | AI subtitle generation |
| **DNN Labeling** | `dnn-labeling.yaml` / `dnn-labeling.svg` | Object detection & classification |
| **DNN Upscaling** | `dnn-upscale.yaml` / `dnn-upscale.svg` | AI super‑resolution upscaling |

### Usage

```bash
# Generate migration and SVG
deno run --allow-read --allow-write sdk/yaml/transpiler.ts sdk/yaml/examples/video.yaml ./supabase/migrations --svg
```

For full documentation, see the [transpiler README](./sdk/yaml/README.md).

---

## Build from Source

```bash
npm install
npm run build
npm start
```

---

## License

MIT

---

## Links

- **Website**: [ffmpeglab.com](https://ffmpeglab.com)
- **API Docs**: [api.ffmpeglab.com/api](https://api.ffmpeglab.com/api)
- **GitHub**: [github.com/ffmpeglab/server](https://github.com/ffmpeglab/server)
- **Examples**: [sdk/yaml/examples/](./sdk/yaml/examples/)
- **TypeScript SDK**: [sdk/ts/](./sdk/ts/)

---

**Open source and self‑hostable. Powered by Supabase, Evolu & FFmpeg.**