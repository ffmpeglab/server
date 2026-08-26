-- supabase/tests/database/test_init_db.sql
BEGIN;
SELECT plan(93);

---------------------------------------------------------------
-- 1. Extensions
---------------------------------------------------------------
SELECT has_extension('pgmq');
SELECT has_extension('uuid-ossp');

---------------------------------------------------------------
-- 2. Tables exist
---------------------------------------------------------------
-- SELECT has_table('public', 'api_key');
-- SELECT has_table('public', 'log_piece');
-- SELECT has_table('public', 'pipeline');
-- SELECT has_table('public', 'render');

---------------------------------------------------------------
-- 3. Columns, types, defaults, nullability
---------------------------------------------------------------
-- api_key
SELECT has_column('api_key', 'id');
SELECT has_column('api_key', 'title');
SELECT has_column('api_key', 'apikey');
SELECT has_column('api_key', 'user_id');
SELECT has_column('api_key', 'data');
SELECT has_column('api_key', 'date');
SELECT col_type_is('api_key', 'id', 'uuid');
SELECT col_type_is('api_key', 'apikey', 'character varying(200)');
SELECT col_not_null('api_key', 'id');
SELECT col_not_null('api_key', 'title');
SELECT col_not_null('api_key', 'apikey');
SELECT col_not_null('api_key', 'user_id');
SELECT col_not_null('api_key', 'data');
SELECT col_not_null('api_key', 'date');
SELECT col_default_is('api_key', 'id', 'uuid_generate_v4()');

-- log_piece
SELECT has_column('log_piece', 'id');
SELECT has_column('log_piece', 'date');
SELECT has_column('log_piece', 'logs');
SELECT has_column('log_piece', 'render');
SELECT has_column('log_piece', 'user_id');
SELECT col_type_is('log_piece', 'id', 'uuid');
SELECT col_not_null('log_piece', 'id');
SELECT col_not_null('log_piece', 'date');
SELECT col_not_null('log_piece', 'logs');
SELECT col_not_null('log_piece', 'render');
SELECT col_not_null('log_piece', 'user_id');
SELECT col_default_is('log_piece', 'id', 'uuid_generate_v4()');

-- pipeline
SELECT has_column('pipeline', 'id');
SELECT has_column('pipeline', 'title');
SELECT has_column('pipeline', 'status');
SELECT has_column('pipeline', 'user_id');
SELECT has_column('pipeline', 'downsql');
SELECT has_column('pipeline', 'upsql');
SELECT has_column('pipeline', 'yml');
SELECT has_column('pipeline', 'date');
SELECT has_column('pipeline', 'version');
SELECT has_column('pipeline', 'updated');
SELECT col_type_is('pipeline', 'id', 'uuid');
SELECT col_type_is('pipeline', 'version', 'integer');
SELECT col_type_is('pipeline', 'updated', 'timestamp without time zone');
SELECT col_not_null('pipeline', 'id');
SELECT col_not_null('pipeline', 'title');
SELECT col_not_null('pipeline', 'status');
SELECT col_not_null('pipeline', 'user_id');
SELECT col_not_null('pipeline', 'downsql');
SELECT col_not_null('pipeline', 'upsql');
SELECT col_not_null('pipeline', 'yml');
SELECT col_not_null('pipeline', 'date');
SELECT col_not_null('pipeline', 'version');
SELECT col_not_null('pipeline', 'updated');
SELECT col_default_is('pipeline', 'id', 'uuid_generate_v4()');
SELECT col_default_is('pipeline', 'updated', 'now()');

-- render
SELECT has_column('render', 'id');
SELECT has_column('render', 'title');
SELECT has_column('render', 'project');
SELECT has_column('render', 'status');
SELECT has_column('render', 'public');
SELECT has_column('render', 'user_id');
SELECT has_column('render', 'progress');
SELECT has_column('render', 'logs');
SELECT has_column('render', 'data');
SELECT has_column('render', 'result');
SELECT has_column('render', 'date');
SELECT col_type_is('render', 'id', 'uuid');
SELECT col_type_is('render', 'progress', 'integer');
SELECT col_type_is('render', 'date', 'timestamp without time zone');
SELECT col_not_null('render', 'id');
SELECT col_not_null('render', 'title');
SELECT col_not_null('render', 'project');
SELECT col_not_null('render', 'status');
SELECT col_not_null('render', 'public');
SELECT col_not_null('render', 'user_id');
SELECT col_not_null('render', 'progress');
SELECT col_not_null('render', 'logs');
SELECT col_not_null('render', 'data');
SELECT col_not_null('render', 'result');
SELECT col_not_null('render', 'date');
SELECT col_default_is('render', 'id', 'uuid_generate_v4()');
SELECT col_default_is('render', 'date', 'now()');

---------------------------------------------------------------
-- 4. Primary keys & unique constraints
---------------------------------------------------------------
SELECT col_is_pk('api_key', 'id');
SELECT col_is_pk('log_piece', 'id');
SELECT col_is_pk('pipeline', 'id');
SELECT col_is_pk('render', 'id');
SELECT col_is_unique('api_key', 'apikey');

---------------------------------------------------------------
-- 5. Indexes (including unique constraint)
---------------------------------------------------------------
SELECT indexes_are('api_key', ARRAY[
    'PK_b1bd840641b8acbaad89c3d8d11',
    'IDX_b1bd840641b8acbaad89c3d8d1',
    'IDX_3105fa6c448e8846c395244f43',
    'IDX_6a0830f03e537b239a53269b27',
    'IDX_be67c65f46bf4a4cacaf31c60f',
    'UQ_3105fa6c448e8846c395244f438'
]);
SELECT indexes_are('log_piece', ARRAY[
    'PK_78574b2254e7b99ce0771a70009',
    'IDX_32565a216e335ed743410fa770',
    'IDX_33ffe08322582439ec109ad3c1',
    'IDX_1328cc0f4c80cc998ab96c7383'
]);
SELECT indexes_are('pipeline', ARRAY[
    'PK_df8aedd50509192d995535d68cd',
    'IDX_df8aedd50509192d995535d68c',
    'IDX_044b4cbf9b8efa4d15e9d76110',
    'IDX_c7307813538ef39d59a9fdb485'
]);
SELECT indexes_are('render', ARRAY[
    'PK_ca7fc35bdf60b33c9778f5e7c85',
    'IDX_ca7fc35bdf60b33c9778f5e7c8',
    'IDX_e320d150d8f0119e9dda0167a9',
    'IDX_094c1eb759b086be91b6656883',
    'IDX_1640c5627c5d3141a6eb5caa40',
    'IDX_58c6b1221195ef87c2c4d62c84'
]);

---------------------------------------------------------------
-- 6. PGMQ queues (test via meta table only)
---------------------------------------------------------------
-- We no longer check q_* tables directly; they are internal.
-- The presence of the queues in pgmq.meta is enough.
SELECT results_eq(
  'SELECT queue_name::text FROM pgmq.meta WHERE queue_name IN (''renders'',''render'',''file'',''logs'') ORDER BY queue_name',
  ARRAY['file','logs','render','renders'],
  'All four queues exist in meta'
);

-- Smoke test: enqueue and read
SELECT lives_ok(
  'SELECT pgmq.send(''logs'', ''{"test":true}''::jsonb)',
  'can enqueue into logs queue'
);
SELECT is(
  (SELECT count(*)::int FROM pgmq.q_logs WHERE message->>'test' = 'true'),
  1,
  'enqueued message readable from q_logs'
);
DELETE FROM pgmq.q_logs;

---------------------------------------------------------------
-- Finish
---------------------------------------------------------------
SELECT * FROM finish();
ROLLBACK;