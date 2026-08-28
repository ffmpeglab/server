// transpiler.ts – FFmpegLab YAML → Supabase Migration (runId in render.project, no created_at)
// Deno ready: deno run --allow-read --allow-write transpiler.ts <yaml> [output-dir]

import { parse as parseYaml } from 'yaml';
import { pipelineToSVG } from './svg.ts';

// ----------------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------------

interface Bucket {
  name: string;
  public: boolean;
  allowed_mime_types?: string[];
  file_size_limit?: number;
}

interface RlsPolicy {
  name: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  role: 'authenticated' | 'anon' | 'service_role' | string;
  condition: string;
}

interface EditorConfig {
  width?: number;
  height?: number;
  length?: number;
  compressionLevel?: number;
  preset?: string;
  output?: string;
  code?: string;
  selectedCode?: string;
  framerate?: number;
  aspectRatio?: string;
  opacity?: number;
  start?: number;
  end?: number;
  outputFilePath?: string;
}

interface StepTrigger {
  name: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE';
  table: string;
  condition: string;
}

interface Step {
  id: string;
  trigger: StepTrigger;
  command: string;
  inputs: string[];
  outputs: string[];
  output_path: string;
  editor?: EditorConfig;
  next_bucket?: string;
  keep?: boolean;
  template?: string;
  source?: Record<string, any>;
  wait_for?: string[];
}

interface StorageConfig {
  buckets: Bucket[];
  rls_policies: RlsPolicy[];
  output_bucket: string;
}

interface RenderConfig {
  project_name: string;
  status: string;
  public: boolean;
}

interface RunIdConfig {
  mode?: 'random' | 'deterministic';
  template?: string;
}

interface Config {
  name: string;
  description?: string;
  version?: string;
  pipelineId?: string;
  runId?: RunIdConfig;
  storage: StorageConfig;
  steps: Step[];
  render: RenderConfig;
  editor?: EditorConfig;
}

// ----------------------------------------------------------------------------
// PARSER
// ----------------------------------------------------------------------------

function parseYAML(text: string): Config {
  const data = parseYaml(text) as any;
  if (!data.storage || !data.steps || !data.render) {
    throw new Error(
      'Invalid YAML: missing required fields (storage, steps, render)',
    );
  }
  if (!data.storage.output_bucket) {
    throw new Error('Invalid YAML: missing storage.output_bucket');
  }
  if (!data.pipelineId) {
    data.pipelineId = data.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }
  if (!data.runId) data.runId = {};
  if (!data.runId.mode) data.runId.mode = 'random';
  if (!data.runId.template) data.runId.template = '{uuid}';

  for (const step of data.steps) {
    if (!step.trigger || !step.trigger.name || !step.trigger.condition) {
      throw new Error(`Step ${step.id} is missing a valid trigger definition`);
    }
    if (!step.command) {
      throw new Error(`Step ${step.id} is missing a command`);
    }
    if (!step.output_path) {
      throw new Error(`Step ${step.id} is missing output_path`);
    }
  }
  return data as Config;
}

// ----------------------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------------------

function escapeSqlString(str: string): string {
  return str.replace(/'/g, "''");
}

function buildPipelineJson(config: Config): string {
  const steps = config.steps.map((s) => {
    const step: any = {
      id: s.id,
      command: s.command.trim(),
      inputs: s.inputs,
      outputs: s.outputs,
      output_path: s.output_path,
      next_bucket: s.next_bucket || null,
      keep: s.keep || false,
    };
    if (s.editor) step.editor = s.editor;
    if (s.trigger) step.trigger = s.trigger;
    if (s.template) step.template = s.template;
    if (s.source) step.source = s.source;
    if (s.wait_for) step.wait_for = s.wait_for;
    return step;
  });
  const jsonStr = JSON.stringify(steps, null, 2);
  return `'${jsonStr.replace(/'/g, "''")}'::jsonb`;
}

function buildGlobalEditorJson(config: Config): string {
  const editor = config.editor || {};
  const jsonStr = JSON.stringify(editor);
  return `'${jsonStr.replace(/'/g, "''")}'::jsonb`;
}

function buildStepEditorJson(
  step: Step,
  globalEditor: EditorConfig | undefined,
): string {
  const merged = {
    width: step.editor?.width ?? globalEditor?.width ?? 0,
    height: step.editor?.height ?? globalEditor?.height ?? 0,
    length: step.editor?.length ?? globalEditor?.length ?? 0,
    compressionLevel:
      step.editor?.compressionLevel ?? globalEditor?.compressionLevel ?? 23,
    preset: step.editor?.preset ?? globalEditor?.preset ?? 'medium',
    output: step.editor?.output ?? globalEditor?.output ?? 'mp4',
    selectedCode:
      step.editor?.selectedCode ?? globalEditor?.selectedCode ?? 'custom',
    code: step.command.trim(),
    framerate: step.editor?.framerate ?? globalEditor?.framerate ?? 30,
    aspectRatio:
      step.editor?.aspectRatio ?? globalEditor?.aspectRatio ?? '16:9',
    opacity: step.editor?.opacity ?? globalEditor?.opacity ?? 1.0,
    start: step.editor?.start ?? globalEditor?.start ?? 0,
    end: step.editor?.end ?? globalEditor?.end ?? 0,
    outputFilePath:
      step.editor?.outputFilePath ?? globalEditor?.outputFilePath ?? null,
  };
  const jsonStr = JSON.stringify(merged);
  return `'${jsonStr.replace(/'/g, "''")}'::jsonb`;
}

function buildRunIdExpression(config: Config): string {
  const mode = config.runId?.mode || 'random';
  const template = config.runId?.template || '{uuid}';
  const escapedTemplate = template.replace(/'/g, "''");
  let expr = `'${escapedTemplate}'`;

  if (mode === 'deterministic') {
    const hashExpr = `md5(NEW.bucket_id || ':' || NEW.name)`;
    expr = `replace(${expr}, '{uuid}', ${hashExpr})`;
    expr = `replace(${expr}, '{hash}', ${hashExpr})`;
  } else {
    expr = `replace(${expr}, '{uuid}', gen_random_uuid()::text)`;
    expr = `replace(${expr}, '{hash}', gen_random_uuid()::text)`;
  }

  expr = `replace(${expr}, '{baseFilename}', COALESCE(v_base_filename, ''))`;
  expr = `replace(${expr}, '{timestamp}', to_char(now(), 'YYYYMMDD_HH24MISS'))`;
  return expr;
}

function buildWaitForCondition(step: Step): string {
  if (!step.wait_for || step.wait_for.length === 0) return '';
  const conditions = step.wait_for.map((pattern) => {
    const sqlPattern = pattern.replace(/\*/g, '%').replace(/\?/g, '_');
    return `EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = NEW.bucket_id AND name LIKE '${sqlPattern}')`;
  });
  return conditions.join(' AND ');
}

// ----------------------------------------------------------------------------
// GENERATORS
// ----------------------------------------------------------------------------

function generateUpMigration(config: Config): string {
  const {
    storage,
    steps,
    render,
    name,
    description,
    editor: globalEditor,
    pipelineId,
  } = config;
  const outputBucket = storage.output_bucket;
  const runIdExpression = buildRunIdExpression(config);
  const firstStepId = steps[0]?.id;

  const lines: string[] = [];

  lines.push('-- ============================================================');
  lines.push(`-- MIGRATION UP: ${name}`);
  if (description) lines.push(`-- ${description}`);
  lines.push('-- ============================================================');
  lines.push('');
  lines.push('BEGIN;');

  if (storage.buckets.length > 0) {
    lines.push('-- Create storage buckets (idempotent)');
    const bucketValues = storage.buckets
      .map((b) => {
        const mimeTypes = b.allowed_mime_types
          ? `ARRAY[${b.allowed_mime_types.map((m) => `'${m}'`).join(', ')}]`
          : 'NULL';
        return `('${b.name}', '${b.name}', ${b.public}, ${b.file_size_limit ?? 'NULL'}, ${mimeTypes})`;
      })
      .join(',\n  ');
    lines.push(`INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES
  ${bucketValues}
ON CONFLICT (id) DO NOTHING;`);
    lines.push('');
  }

  if (storage.rls_policies.length > 0) {
    lines.push('-- RLS policies for storage.objects');
    for (const policy of storage.rls_policies) {
      lines.push(`DROP POLICY IF EXISTS "${policy.name}" ON storage.objects;`);
      const command = policy.operation === 'ALL' ? 'ALL' : policy.operation;

      let usingPart = '';
      let checkPart = '';

      if (policy.operation === 'INSERT') {
        if (policy.condition) {
          checkPart = `WITH CHECK (${policy.condition})`;
        }
      } else if (
        policy.operation === 'SELECT' ||
        policy.operation === 'DELETE'
      ) {
        if (policy.condition) {
          usingPart = `USING (${policy.condition})`;
        }
      } else {
        if (policy.condition) {
          usingPart = `USING (${policy.condition})`;
          checkPart = `WITH CHECK (${policy.condition})`;
        }
      }

      const parts = [
        `CREATE POLICY "${policy.name}" ON storage.objects`,
        `  FOR ${command}`,
        `  TO ${policy.role}`,
      ];
      if (usingPart) parts.push(`  ${usingPart}`);
      if (checkPart) parts.push(`  ${checkPart}`);
      lines.push(parts.join('\n') + ';');
    }
    lines.push('');
  }

  const pipelineJson = buildPipelineJson(config);
  const globalEditorJson = buildGlobalEditorJson(config);
  const renderStatus = render.status;
  const renderPublic = render.public;

  for (const step of steps) {
    const triggerName = step.trigger.name;
    let condition = step.trigger.condition;
    const event = step.trigger.event || 'INSERT';
    const table = step.trigger.table || 'storage.objects';
    const outputPath = step.output_path;
    const stepEditorJson = buildStepEditorJson(step, globalEditor);
    const isFirstStep = step.id === firstStepId;

    const waitCondition = buildWaitForCondition(step);
    if (waitCondition) {
      condition = `${condition} AND (${waitCondition})`;
    }

    lines.push(`-- Step: ${step.id} (keep: ${step.keep || false})`);
    if (step.template) lines.push(`-- Template: ${step.template}`);
    if (step.source) lines.push(`-- Source: ${JSON.stringify(step.source)}`);
    if (step.wait_for) lines.push(`-- Wait for: ${step.wait_for.join(', ')}`);

    lines.push(`-- Trigger function: ${triggerName}`);
    lines.push(`DROP FUNCTION IF EXISTS ${triggerName}() CASCADE;`);

    let runIdRetrievalSql = '';
    if (isFirstStep) {
      runIdRetrievalSql = `v_run_id := ${runIdExpression};`;
    } else {
      runIdRetrievalSql = `
  -- Look up runId from the project column of the render that produced this input file
  SELECT project INTO v_run_id
  FROM render
  WHERE (data::jsonb)->'layers'->0->'media'->0->>'bucket' = NEW.bucket_id
    AND (data::jsonb)->'layers'->0->'media'->0->>'key' = NEW.name
  LIMIT 1;
  IF v_run_id IS NULL THEN
    v_run_id := ${runIdExpression};
  END IF;`;
    }

    lines.push(`CREATE OR REPLACE FUNCTION ${triggerName}() RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_render_id UUID;
  v_run_id TEXT;
  v_data JSONB;
  v_output_path TEXT;
  v_base_filename TEXT;
  v_pipeline_id TEXT := '${pipelineId}';
  v_template_data JSONB;
  v_source_data JSONB;
BEGIN
  IF NOT (${condition}) THEN
    RETURN NEW;
  END IF;

  v_user_id := (storage.foldername(NEW.name))[1]::UUID;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid user_id in path: %', NEW.name;
  END IF;

  v_base_filename := split_part(
    split_part(NEW.name, '/', array_length(string_to_array(NEW.name, '/'), 1)),
    '.',
    1
  );

  -- Determine runId: first step generates new, subsequent steps look up from render.project
  ${runIdRetrievalSql}

  v_output_path := replace('${outputPath}', '{{userId}}', v_user_id::text);
  v_output_path := replace(v_output_path, '{{baseFilename}}', v_base_filename);
  v_output_path := replace(v_output_path, '{{pipelineId}}', v_pipeline_id);
  v_output_path := replace(v_output_path, '{{runId}}', v_run_id);

  v_data := jsonb_build_object(
    'project', jsonb_build_object(
      'id', v_pipeline_id || '-' || '${step.id}',
      'title', v_pipeline_id || '-' || '${step.id}',
      'editor', ${stepEditorJson}
    ),
    'layers', jsonb_build_array(
      jsonb_build_object(
        'id', 'layer1',
        'editor', jsonb_build_object(),
        'media', jsonb_build_array(
          jsonb_build_object(
            'id', 'media1',
            'bucket', NEW.bucket_id,
            'key', NEW.name,
            'folderId', gen_random_uuid()::text,
            'filename', split_part(NEW.name, '/', array_length(string_to_array(NEW.name, '/'), 1)),
            'encoding', jsonb_build_object()
          )
        )
      )
    ),
    'runId', v_run_id
  );

  ${
    step.template
      ? `
  SELECT data::jsonb INTO v_template_data FROM render WHERE id = '${step.template}'::uuid;
  IF v_template_data IS NOT NULL THEN
    v_data := jsonb_build_object(
      'project', COALESCE(v_template_data->'project', v_data->'project'),
      'layers', COALESCE(v_template_data->'layers', v_data->'layers'),
      'runId', COALESCE(v_template_data->>'runId', v_run_id)
    );
  END IF;
  `
      : ''
  }

  ${
    step.source
      ? `
  v_source_data := jsonb_build_object(
    'bucket', '${step.source.bucket || ''}',
    'key', '${step.source.key || ''}',
    'renderId', '${step.source.renderId || ''}'
  );
  v_data := jsonb_set(v_data, '{layers,0,media,0}', v_source_data || v_data->'layers'->0->'media'->0);
  `
      : ''
  }

  INSERT INTO render (id, title, project, status, public, user_id, progress, logs, data, result)
  VALUES (
    gen_random_uuid(),
    v_pipeline_id || '-' || '${step.id}',
    v_run_id,
    '${renderStatus}',
    ${renderPublic},
    v_user_id,
    0,
    '',
    v_data::text,
    '{}'
  )
  RETURNING id INTO v_render_id;

  PERFORM pgmq.send(
    'render',
    jsonb_build_object(
      'jobName', 'render',
      'data', jsonb_build_object(
        'userId', v_user_id::text,
        'renderId', v_render_id::text,
        'bucket', CASE
          WHEN ${step.keep || false} THEN '${outputBucket}'
          ELSE COALESCE('${step.next_bucket || ''}', '${outputBucket}')
        END,
        'runId', v_run_id,
        'outputPath', v_output_path
      )
    ),
    jsonb_build_object(
      'messageId', gen_random_uuid()::text
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;`);
    lines.push('');

    lines.push(`-- Trigger on ${table}`);
    lines.push(`DROP TRIGGER IF EXISTS ${triggerName}_trigger ON ${table};`);
    lines.push(`CREATE TRIGGER ${triggerName}_trigger
  AFTER ${event} ON ${table}
  FOR EACH ROW
  EXECUTE FUNCTION ${triggerName}();`);
    lines.push('');
  }

  lines.push('COMMIT;');
  lines.push('');

  return lines.join('\n');
}

function generateDownMigration(config: Config): string {
  const { storage, steps, name } = config;

  const lines: string[] = [];

  lines.push('-- ============================================================');
  lines.push(`-- MIGRATION DOWN: ${name}`);
  lines.push('-- ============================================================');
  lines.push('');
  lines.push('BEGIN;');

  for (const step of steps) {
    const triggerName = step.trigger.name;
    const table = step.trigger.table || 'storage.objects';
    lines.push(`DROP TRIGGER IF EXISTS ${triggerName}_trigger ON ${table};`);
    lines.push(`DROP FUNCTION IF EXISTS ${triggerName}() CASCADE;`);
  }

  if (storage.rls_policies.length > 0) {
    lines.push('-- Drop RLS policies');
    for (const policy of storage.rls_policies) {
      lines.push(`DROP POLICY IF EXISTS "${policy.name}" ON storage.objects;`);
    }
  }

  lines.push(
    '-- Buckets are preserved to avoid data loss. Delete them manually if needed.',
  );
  lines.push(
    '-- render table and queue are managed by FFmpegLab server, not dropped here',
  );
  lines.push('');
  lines.push('COMMIT;');

  return lines.join('\n');
}

// ----------------------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------------------

export function generateMigrationsFromYaml(yamlText: string): {
  up: string;
  down: string;
} {
  const config = parseYAML(yamlText);
  return {
    up: generateUpMigration(config),
    down: generateDownMigration(config),
  };
}

export async function generateMigrationsFromFile(
  yamlPath: string,
  outputDir: string = './supabase/migrations',
): Promise<{ upPath: string; downPath: string }> {
  const yamlText = await Deno.readTextFile(yamlPath);
  const { up, down } = generateMigrationsFromYaml(yamlText);

  await Deno.mkdir(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 14);
  const config = parseYAML(yamlText);
  const baseName = config.name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  const upPath = `${outputDir}/${timestamp}_${baseName}.sql`;
  const downPath = `${outputDir}/${timestamp}_${baseName}_down.sql`;

  await Deno.writeTextFile(upPath, up);
  await Deno.writeTextFile(downPath, down);

  return { upPath, downPath };
}

// ----------------------------------------------------------------------------
// CLI
// ----------------------------------------------------------------------------
if (import.meta.main) {
  const args = Deno.args;
  if (args.length < 1) {
    console.error(
      'Usage: deno run --allow-read --allow-write transpiler.ts <yaml-file> [output-dir] [--svg]',
    );
    Deno.exit(1);
  }

  const yamlPath = args[0];
  const outputDir = args[1] || './supabase/migrations';
  const generateSvg = args.includes('--svg');

  try {
    const yamlText = await Deno.readTextFile(yamlPath);
    const config = parseYAML(yamlText);

    const { up, down } = generateMigrationsFromYaml(yamlText);

    await Deno.mkdir(outputDir, { recursive: true });

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:.]/g, '')
      .slice(0, 14);
    const baseName = config.name
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    const upPath = `${outputDir}/${timestamp}_${baseName}.sql`;
    const downPath = `${outputDir}/${timestamp}_${baseName}_down.sql`;

    await Deno.writeTextFile(upPath, up);
    await Deno.writeTextFile(downPath, down);

    console.log(`✅ Migration files created:`);
    console.log(`   UP:   ${upPath}`);
    console.log(`   DOWN: ${downPath}`);

    if (generateSvg) {
      const svg = pipelineToSVG(config, {
        theme: 'dark',
        background: 'transparent',
      });
      const svgPath = `${outputDir}/${timestamp}_${baseName}.svg`;
      await Deno.writeTextFile(svgPath, svg);
      console.log(`   SVG:  ${svgPath}`);
    }
  } catch (err) {
    console.error('❌ Error:', err);
    Deno.exit(1);
  }
}
