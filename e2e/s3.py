#!/usr/bin/env python3
"""Verifies S3 credentials from environment variables.

Expects:
  S3_ENDPOINT, S3_REGION, S3_BUCKET_ID, S3_USER_ID,
  S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_SESSION_TOKEN

Asserts:
  1. creds accepted by endpoint
  2. put/get/head/delete roundtrip INSIDE userId/ prefix, byte-exact
  3. ⚠️ writes OUTSIDE the prefix are denied (tenant isolation)
"""
import os
import sys
import uuid

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


def fail(msg: str) -> None:
    print(f"❌ {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    endpoint = os.environ.get("S3_ENDPOINT")
    region = os.environ.get("S3_REGION")
    bucket = os.environ.get("S3_BUCKET_ID")
    user_id = os.environ.get("S3_USER_ID")
    access_key = os.environ.get("S3_ACCESS_KEY_ID")
    secret_key = os.environ.get("S3_SECRET_ACCESS_KEY")
    session_token = os.environ.get("S3_SESSION_TOKEN")

    if not all([endpoint, region, bucket, user_id, access_key, secret_key]):
        fail(
            "Missing required env vars:\n"
            f"  S3_ENDPOINT={endpoint!r}\n"
            f"  S3_REGION={region!r}\n"
            f"  S3_BUCKET_ID={bucket!r}\n"
            f"  S3_USER_ID={user_id!r}\n"
            f"  S3_ACCESS_KEY_ID={access_key!r}\n"
            f"  S3_SECRET_ACCESS_KEY={secret_key!r}"
        )

    if not session_token or session_token in ("null", "undefined"):
        fail("S3_SESSION_TOKEN is missing or literal null/undefined – "
             "this indicates the supabase signInWithPassword error path")

    prefix = user_id.rstrip("/") + "/"
    print(f"✅ Config valid (bucket={bucket}, prefix={prefix})")

    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        aws_session_token=session_token,
        config=Config(s3={"addressing_style": "path"}),
    )

    # 1. Creds accepted at all
    try:
        s3.list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=1)
    except ClientError as e:
        fail(f"list_objects_v2 failed ({e.response['Error']['Code']}): session credentials rejected")
    print("✅ Session credentials accepted by endpoint")

    # 2. Roundtrip strictly inside the tenant prefix
    key = f"{prefix}.e2e-verify/{uuid.uuid4()}.txt"
    payload = b"ffmpeglab-e2e-" + uuid.uuid4().bytes

    try:
        s3.put_object(Bucket=bucket, Key=key, Body=payload, ContentType="text/plain")
        body = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
    except ClientError as e:
        fail(f"in-prefix roundtrip failed: {e}")

    if body != payload:
        fail(f"content mismatch writing {len(payload)} bytes, read back different bytes")
    head = s3.head_object(Bucket=bucket, Key=key)
    print(f"✅ Roundtrip ok inside prefix: {key} ({len(payload)} bytes, etag={head['ETag']})")

    # 3. Isolation: outside-prefix write must DENY
    escape_key = f".e2e-escape-{uuid.uuid4()}.txt"
    try:
        s3.put_object(Bucket=bucket, Key=escape_key, Body=b"x")
        fail(
            f"SECURITY: wrote OUTSIDE tenant prefix as {escape_key} — "
            "credentials are not scoped to userId/"
        )
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("AccessDenied", "403"):
            print(f"✅ Outside-prefix write correctly denied ({code})")
        else:
            fail(f"outside-prefix write failed with unexpected error {code}: {e}")

    # Cleanup of the in-prefix object
    try:
        s3.delete_object(Bucket=bucket, Key=key)
        remaining = s3.list_objects_v2(Bucket=bucket, Prefix=key, MaxKeys=1)
        if remaining.get("KeyCount", 0) != 0:
            fail("delete reported success but object still listed")
    except ClientError as e:
        fail(f"cleanup delete failed: {e}")
    print("✅ cleanup ok")


if __name__ == "__main__":
    main()