#!/bin/sh
export SUPABASE_URL="http://127.0.0.1:54323"
export DB_PASSWORD=postgres
export DB_NAME=postgres
export DB_USER=postgres
export S3_BUCKET=${S3_BUCKET:-ffmpeglab-assets}
export CONN_STRING="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:54322/postgres"
# Build DATABASE_URL
echo $S3_BUCKET

#SERVER .env
export DATABASE_URL="127.0.0.1"
export S3_BUCKET_ID="${S3_BUCKET}"
export S3_ACCESS_KEY="625729a08b95bf1b7ff351a663f3a23c"
export S3_SECRET_KEY="850181e4652dd023b7a98c58ae0d2d34bd487ee0cc3254aed6eda37307425907"
export S3_ENDPOINT="http://127.0.0.1:54321/storage/v1/s3"
export SUPABASE_SECRET_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q"
export S3_REGION=local
export DB_HOST="127.0.0.1"
export DB_PORT=54322  
export IS_RENDER_RUNNER="true"
export IS_LOGS_RUNNER="true"
export IS_FILE_RUNNER="true"
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE"

#SERVER .env
export SERVER_DIR="."
echo "DATABASE_URL=${DATABASE_URL}" >> $SERVER_DIR/.env;
echo "S3_BUCKET_ID=${S3_BUCKET}" >> $SERVER_DIR/.env;
echo "S3_ACCESS_KEY=${S3_PROTOCOL_ACCESS_KEY_ID}" >> $SERVER_DIR/.env;
echo "S3_SECRET_KEY=${S3_PROTOCOL_ACCESS_KEY_SECRET}" >> $SERVER_DIR/.env;
echo "S3_ENDPOINT=http://127.0.0.1:54321/storage/v1/s3" >> $SERVER_DIR/.env;
echo "S3_REGION=stub" >> $SERVER_DIR/.env;
echo "DB_PASSWORD='${DB_PASSWORD}'" >> $SERVER_DIR/.env;
echo "DB_USER='${DB_USER}'" >> $SERVER_DIR/.env;
echo "DB_NAME='${DB_NAME}'" >> $SERVER_DIR/.env;
echo "DB_HOST=0.0.0.0" >> $SERVER_DIR/.env;
echo "DB_PORT=54322" >> $SERVER_DIR/.env;
echo "SUPABASE_URL=${SUPABASE_URL}" >> $SERVER_DIR/.env;
echo "SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}" >> $SERVER_DIR/.env;
echo "SUPABASE_SECRET_KEY=${SUPABASE_SECRET_KEY}" >> $SERVER_DIR/.env;
cat .env
ls -1 .


echo -e "${BLUE}🔒 Setting RLS policies and bucket...${NC}"
PGPASSWORD="$DB_PASSWORD" psql "$CONN_STRING" <<EOF
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES
  ('${S3_BUCKET}', '${S3_BUCKET}', true, NULL, ARRAY['image/jpeg', 'image/png', 'video/mp4'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Allow authenticated uploads" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = '${S3_BUCKET}');
CREATE POLICY "Allow authenticated downloads" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = '${S3_BUCKET}');
CREATE POLICY "Allow authenticated updates" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = '${S3_BUCKET}');
CREATE POLICY "Allow authenticated deletes" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = '${S3_BUCKET}');
EOF
echo -e "${GREEN}✅ RLS policies and Bucket set.${NC}"
# Generate API key
API_KEY_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6")
export API_KEY="${API_KEY_SECRET}"
export API_HOST="http://localhost:3000"
export FFMPEG_PATH=$(which ffmpeg)
echo "API_KEY=${API_KEY_SECRET}" >> $SERVER_DIR/.env;
echo "API_HOST=http://localhost:3000" >> $SERVER_DIR/.env;

echo -e "${BLUE}💾 Inserting user and API key...${NC}"
PGPASSWORD="$DB_PASSWORD" psql "$CONN_STRING" <<EOF
-- Generate a single UUID for the service user
WITH new_user AS (
  INSERT INTO auth.users (
    id,
    instance_id,
    role,
    aud,
    email,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    encrypted_password,
    created_at,
    updated_at,
    last_sign_in_at,
    email_confirmed_at,
    confirmation_sent_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'worker@ffmpeglab.com',
    '{"provider":"email","providers":["email"]}',
    '{}',
    FALSE,
    crypt('user_password', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  )
  RETURNING id
),
new_identity AS (
  INSERT INTO auth.identities (
    id,
    provider_id,
    provider,
    user_id,
    identity_data,
    last_sign_in_at,
    created_at,
    updated_at
  )
  SELECT
    id,
    id,
    'email',
    id,
    json_build_object('sub', id),
    NOW(),
    NOW(),
    NOW()
  FROM new_user
)
INSERT INTO public.api_key (
  id,
  title,
  apikey,
  user_id,
  data,
  date
)
SELECT
  gen_random_uuid(),
  'Admin API Key',
  '${API_KEY}',
  id,
  '{"permissions": ["renders:*", "files:*", "pipelines:*"]}',
  CURRENT_DATE
FROM new_user
ON CONFLICT (apikey) DO NOTHING;
EOF
echo -e "${GREEN} Preparing ffmpeg...${NC}"
sudo apt-get install -y ffmpeg
export FFMPEG_PATH=$(which ffmpeg)
echo "${GREEN} Path to ffmpeg: ${FFMPEG_PATH}"

echo -e "${BLUE}💾 Installing python s3 sdk${NC}"
pip install boto3

echo -e "${GREEN} Preparing server...${NC}"

yarn
yarn build
yarn start:prod &
SERVER_PID=$!
sleep 5
./e2e/render.sh
./e2e/s3.sh
kill $SERVER_PID
echo -e "${GREEN}🎉 All E2E tests passed!${NC}"