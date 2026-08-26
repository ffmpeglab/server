# scripts/e2e/s3_verify.py
"""Verifies temp S3 credentials from /files/s3config.

stdin JSON:
{
  "endpoint": "...", "region": "...", "bucketId": "...", "userId": "...",
  "credentials": {"accessKeyId","secretAccessKey","sessionToken"}
}
Asserts:
  1. creds accepted by endpoint
  2. put/get/head/delete roundtrip INSIDE userId/ prefix, byte-exact
  3. ⚠️ writes OUTSIDE the prefix are denied (tenant isolation)
"""
import json
import sys
import uuid

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


def fail(msg: str) -> None:
    print(f"❌ {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    try:
        cfg = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        fail(f"invalid s3config JSON on stdin: {e}")

    endpoint = cfg.get("endpoint")
    region = cfg.get("region")
    bucket = cfg.get("bucketId")
    user_id = cfg.get("userId")

    if not all([endpoint, region, bucket, user_id]):
        fail(f"missing fields: endpoint={endpoint!r} region={region!r} bucket={bucket!r} userId={user_id!r}")

    creds = cfg.get("credentials") or {}
    token = creds.get("sessionToken")
    if not token or token in ("null", "undefined"):
        fail("sessionToken missing or literal null/undefined — "
             "signature of the unchecked supabase signInWithPassword error path")

    # normalize trailing slash once
    prefix = user_id.rstrip("/") + "/"
    print(f"✅ Config valid (bucket={bucket}, prefix={prefix})")

    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=creds["accessKeyId"],
        aws_secret_access_key=creds["secretAccessKey"],
        aws_session_token=token,
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
    head = s3.head_object(Bucket=bucket, Key=key)  # raises if broken
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

    # cleanup of the in-prefix object
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
