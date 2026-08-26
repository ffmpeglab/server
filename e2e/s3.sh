#!/bin/bash
set -euo pipefail
# s3.sh — bash orchestrates the API, python verifies S3 access.

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
DEBUG=${DEBUG:-0}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

: "${API_HOST:?API_HOST not set}"
: "${API_KEY:?API_KEY not set}"

command -v jq     &> /dev/null || { echo -e "${RED}❌ jq required${NC}"; exit 1; }
command -v python3 &> /dev/null || { echo -e "${RED}❌ python3 required${NC}"; exit 1; }
python3 -c 'import boto3' 2>/dev/null \
  || { echo -e "${RED}❌ boto3 required: pip install boto3${NC}"; exit 1; }

call_api() {
    local method="$1"
    local endpoint="$2"
    local data="${3:-}"
    local url="${API_HOST}${endpoint}"
    local response_file
    local http_code
    response_file=$(mktemp)

    echo -e "${YELLOW}📡 ${method} ${url}${NC}" >&2

    if [[ -n "$data" ]]; then
        http_code=$(curl -s -w "%{http_code}" -o "$response_file" -X "$method" \
            -H "Authorization: Bearer ${API_KEY}" \
            -H "Content-Type: application/json" \
            -d "$data" "$url")
    else
        http_code=$(curl -s -w "%{http_code}" -o "$response_file" -X "$method" \
            -H "Authorization: Bearer ${API_KEY}" \
            -H "Content-Type: application/json" \
            "$url")
    fi

    [[ "$DEBUG" -eq 1 ]] && {
        echo -e "${YELLOW}🐞 HTTP ${http_code}:${NC}" >&2
        cat "$response_file" >&2
        echo >&2
    }

    if [[ ! "$http_code" =~ ^2[0-9][0-9]$ ]]; then
        echo -e "${RED}❌ Request failed: ${method} ${endpoint} → HTTP ${http_code}${NC}" >&2
        cat "$response_file" >&2
        rm -f "$response_file"
        exit 1
    fi

    cat "$response_file"
    rm -f "$response_file"
}

# ---- Security check: endpoint must reject unauthenticated requests ----
echo -e "${YELLOW}🚀 s3config E2E starting${NC}"

echo -e "${YELLOW}➡️  Checking endpoint requires auth...${NC}"
UNAUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${API_HOST}/files/s3config")
if [[ "$UNAUTH_CODE" =~ ^2[0-9][0-9]$ ]]; then
    echo -e "${RED}❌ SECURITY: /files/s3config responded ${UNAUTH_CODE} without an API key${NC}"
    exit 1
fi
if [[ ! "$UNAUTH_CODE" =~ ^(401|403|418)$ ]]; then
    echo -e "${RED}❌ unexpected unauth status ${UNAUTH_CODE} (expected 401/403/418)${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Unauthenticated request correctly rejected (${UNAUTH_CODE})${NC}"

# ---- Fetch the real config ----
echo -e "${YELLOW}➡️  Fetching s3config with API key...${NC}"
S3_CONFIG=$(call_api "GET" "/files/s3config")

# Required fields (including .userId)
for field in '.userId' '.bucketId' '.region' '.endpoint' \
             '.credentials.accessKeyId' '.credentials.secretAccessKey' '.credentials.sessionToken'; do
    VAL=$(jq -r "$field // empty" <<<"$S3_CONFIG")
    if [[ -z "$VAL" ]]; then
        echo -e "${RED}❌ field $field missing/empty in response:${NC}"
        jq '.' <<<"$S3_CONFIG"
        exit 1
    fi
done
echo -e "${GREEN}✅ All credential fields present${NC}"

# ---- Validate userId shape (must be a UUID) ----
USER_ID=$(jq -r '.userId' <<<"$S3_CONFIG")
if [[ ! "$USER_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
    echo -e "${RED}❌ userId does not look like an auth uid: '${USER_ID}'${NC}"
    exit 1
fi
echo -e "${GREEN}✅ userId present and well-formed: ${USER_ID}${NC}"

# ---- Hand off to Python ----
echo -e "${YELLOW}➡️  Verifying S3 roundtrip with returned credentials...${NC}"
jq '.' <<<"$S3_CONFIG" | python3 "$SCRIPT_DIR/e2e/s3.py"

echo -e "${GREEN}🎉 All s3config E2E tests passed!${NC}"