create or replace function public.insert_vault_secret(secret_value text)
returns uuid
language plpgsql
security definer -- Elevates permissions to write to vault schema
as $$
declare
  current_user_id uuid;
begin
  -- 1. Grab the actual logged-in user's ID from the Supabase auth JWT context
  current_user_id := auth.uid();
  
  -- 2. Reject the request if the user is not authenticated
  if current_user_id is null then
    raise exception 'Not authorized';
  end if;

  -- 3. Automatically use their user ID as the secret name so they can't hijack other profiles
  return vault.create_secret(secret_value, current_user_id::text);
end;
$$;

create or replace function public.get_my_secret()
returns text
language plpgsql
security definer -- Elevates permissions to read from vault.decrypted_secrets
as $$
declare
  user_secret text;
begin
  -- 1. Get the authenticated user's ID from the request context
  -- 2. Find the secret where the name matches the user's ID string
  select decrypted_secret into user_secret
  from vault.decrypted_secrets
  where name = auth.uid()::text
  limit 1;

  -- 3. Return the secret (returns null if no secret exists)
  return user_secret;
end;
$$;

CREATE TABLE "api_key" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "apikey" character varying(200) NOT NULL, "user_id" uuid NOT NULL, "data" text NOT NULL, "date" TIMESTAMP NOT NULL, CONSTRAINT "UQ_3105fa6c448e8846c395244f438" UNIQUE ("apikey"), CONSTRAINT "PK_b1bd840641b8acbaad89c3d8d11" PRIMARY KEY ("id"));
CREATE INDEX "IDX_b1bd840641b8acbaad89c3d8d1" ON "api_key"  ("id") ;
CREATE INDEX "IDX_3105fa6c448e8846c395244f43" ON "api_key"  ("apikey") ;
CREATE INDEX "IDX_6a0830f03e537b239a53269b27" ON "api_key"  ("user_id") ;
CREATE INDEX "IDX_be67c65f46bf4a4cacaf31c60f" ON "api_key"  ("date") ;
CREATE TABLE "log_piece" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "date" TIMESTAMP NOT NULL, "logs" character varying NOT NULL, "render" uuid NOT NULL, "user_id" uuid NOT NULL, CONSTRAINT "PK_78574b2254e7b99ce0771a70009" PRIMARY KEY ("id"));
CREATE INDEX "IDX_32565a216e335ed743410fa770" ON "log_piece"  ("date") ;
CREATE INDEX "IDX_33ffe08322582439ec109ad3c1" ON "log_piece"  ("render") ;
CREATE INDEX "IDX_1328cc0f4c80cc998ab96c7383" ON "log_piece"  ("user_id") ;
CREATE TABLE "pipeline" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "status" character varying NOT NULL, "user_id" uuid NOT NULL, "downsql" character varying NOT NULL, "upsql" character varying NOT NULL, "yml" character varying NOT NULL, "date" TIMESTAMP NOT NULL, "version" integer NOT NULL, "updated" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_df8aedd50509192d995535d68cd" PRIMARY KEY ("id"));
CREATE INDEX "IDX_df8aedd50509192d995535d68c" ON "pipeline"  ("id") ;
CREATE INDEX "IDX_044b4cbf9b8efa4d15e9d76110" ON "pipeline"  ("user_id") ;
CREATE INDEX "IDX_c7307813538ef39d59a9fdb485" ON "pipeline"  ("date") ;
CREATE TABLE "render" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "project" character varying NOT NULL, "status" character varying NOT NULL, "public" boolean NOT NULL, "user_id" uuid NOT NULL, "progress" integer NOT NULL, "logs" character varying NOT NULL, "data" text NOT NULL, "result" text NOT NULL, "date" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ca7fc35bdf60b33c9778f5e7c85" PRIMARY KEY ("id"));
CREATE INDEX "IDX_ca7fc35bdf60b33c9778f5e7c8" ON "render"  ("id") ;
CREATE INDEX "IDX_e320d150d8f0119e9dda0167a9" ON "render"  ("project") ;
CREATE INDEX "IDX_094c1eb759b086be91b6656883" ON "render"  ("public") ;
CREATE INDEX "IDX_1640c5627c5d3141a6eb5caa40" ON "render"  ("user_id") ;
CREATE INDEX "IDX_58c6b1221195ef87c2c4d62c84" ON "render"  ("date") ;
SELECT pgmq.create('renders');
SELECT pgmq.create('render');
SELECT pgmq.create('file');
SELECT pgmq.create('logs');