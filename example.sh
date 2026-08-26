#!/bin/bash
set -euo pipefail
# export DEBUG=1 
# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Enable debug output if DEBUG env var is set
DEBUG=${DEBUG:-0}

# Ensure required env vars
: "${API_HOST:?API_HOST not set}"
: "${API_KEY:?API_KEY not set}"

# Ensure jq and ffprobe are available
if ! command -v jq &> /dev/null; then
    echo -e "${RED}❌ jq not found. Please install jq.${NC}"
    exit 1
fi
if ! command -v ffprobe &> /dev/null; then
    echo -e "${RED}❌ ffprobe not found. Please install ffmpeg.${NC}"
    exit 1
fi

# Helper: call API and check HTTP status (2xx = success)
call_api() {
    local method="$1"
    local endpoint="$2"
    local data="${3:-}"
    local url="${API_HOST}${endpoint}"
    local response_file=$(mktemp)
    local http_code

    echo -e "${YELLOW}📡 ${method} ${url}${NC}" >&2

    if [[ -n "$data" ]]; then
        http_code=$(curl -s -w "%{http_code}" -o "$response_file" -X "$method" \
            -H "Authorization: Bearer ${API_KEY}" \
            -H "Content-Type: application/json" \
            -d "$data" "$url" 2>/dev/null)
    else
        http_code=$(curl -s -w "%{http_code}" -o "$response_file" -X "$method" \
            -H "Authorization: Bearer ${API_KEY}" \
            -H "Content-Type: application/json" \
            "$url" 2>/dev/null)
    fi

    # Debug: print response body if DEBUG=1
    if [[ "$DEBUG" -eq 1 ]]; then
        echo -e "${YELLOW}🐞 DEBUG: Response body (${http_code}):${NC}" >&2
        cat "$response_file" >&2
        echo "" >&2
    fi

    # Check for 2xx status
    if [[ ! "$http_code" =~ ^2[0-9][0-9]$ ]]; then
        echo -e "${RED}❌ Request failed: ${method} ${endpoint} → HTTP ${http_code}${NC}" >&2
        echo -e "${RED}Response body:${NC}" >&2
        cat "$response_file" >&2
        rm -f "$response_file"
        exit 1
    fi

    # Output the response body
    cat "$response_file"
    rm -f "$response_file"
}

# Helper: extract JSON value with jq, fallback to empty string
extract_json() {
    local json="$1"
    local key="$2"
    # Check if the input is valid JSON
    if echo "$json" | jq empty 2>/dev/null; then
        echo "$json" | jq -r "$key // empty" 2>/dev/null || echo ""
    else
        # If not JSON, try to treat as plain ID (if key is ".id")
        if [[ "$key" == ".id" ]]; then
            # Check if it's a simple UUID-like string
            if [[ "$json" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
                echo "$json"
            else
                echo ""
            fi
        else
            echo ""
        fi
    fi
}

# Helper: get duration in seconds using ffprobe
get_duration() {
    local url="$1"
    local duration
    duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$url" 2>/dev/null)
    if [[ -z "$duration" ]]; then
        echo -e "${RED}❌ Failed to get duration from: $url${NC}" >&2
        exit 1
    fi
    echo "$duration"
}

echo -e "${YELLOW}🚀 Starting E2E test...${NC}"

# 1. Create a render
echo -e "${YELLOW}➡️  Creating render...${NC}"
CREATE_PAYLOAD='{
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
                    "folderId": "myfolder",
                    "filename": "zoompan.mp4",
                    "encoding": {}
                }
            ],
            "editor": {}
        }
    ]
}'
RESPONSE=$(call_api "POST" "/renders" "$CREATE_PAYLOAD")
RENDER_ID=$(extract_json "$RESPONSE" ".id")
if [[ -z "$RENDER_ID" || "$RENDER_ID" == "null" ]]; then
    echo -e "${RED}❌ Failed to extract render ID from response:${NC}"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    exit 1
fi
echo -e "${GREEN}✅ Render created with ID: ${RENDER_ID}${NC}"

# 2. Trigger the render (run)
echo -e "${YELLOW}➡️  Running render...${NC}"
RUN_PAYLOAD="{\"id\": \"$RENDER_ID\"}"
call_api "PUT" "/renders/run" "$RUN_PAYLOAD" > /dev/null
echo -e "${GREEN}✅ Render started${NC}"

# 3. Poll for completion
echo -e "${YELLOW}⏳ Waiting for render to finish...${NC}"
MAX_ATTEMPTS=30
ATTEMPT=0
while true; do
    ATTEMPT=$((ATTEMPT + 1))
    if [[ $ATTEMPT -gt $MAX_ATTEMPTS ]]; then
        echo -e "${RED}❌ Timeout waiting for render to complete${NC}"
        exit 1
    fi

    STATUS_RESPONSE=$(call_api "GET" "/renders/${RENDER_ID}")
    STATUS=$(extract_json "$STATUS_RESPONSE" ".status")
    echo -e "  ⏳ Attempt ${ATTEMPT}: status = ${STATUS}"

    if [[ "$STATUS" == "done" ]]; then
        echo -e "${GREEN}✅ Render completed successfully${NC}"
        break
    elif [[ "$STATUS" == "failed" ]]; then
        echo -e "${RED}❌ Render failed${NC}"
        echo "$STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$STATUS_RESPONSE"
        exit 1
    fi
    sleep 3
done

# 4. Verify final response contains result.url
echo -e "${YELLOW}🔍 Checking final response for result.url...${NC}"
RESULT_URL=$(extract_json "$STATUS_RESPONSE" ".result.url")
if [[ -z "$RESULT_URL" || "$RESULT_URL" == "null" ]]; then
    echo -e "${RED}❌ result.url missing or empty in final response:${NC}"
    echo "$STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$STATUS_RESPONSE"
    exit 1
fi
echo -e "${GREEN}✅ result.url found: ${RESULT_URL}${NC}"

# 5. Compare durations of input and output
INPUT_URL="https://www.ffmpeglab.com/media/zoompan.mp4"
echo -e "${YELLOW}🔍 Getting input duration...${NC}"
INPUT_DUR=$(get_duration "$INPUT_URL")
echo -e "   Input duration: ${INPUT_DUR}s"

echo -e "${YELLOW}🔍 Getting output duration...${NC}"
OUTPUT_DUR=$(get_duration "$RESULT_URL")
echo -e "   Output duration: ${OUTPUT_DUR}s"

# Compare with tolerance (0.1 seconds)
TOLERANCE=0.1
DIFF=$(echo "$INPUT_DUR - $OUTPUT_DUR" | bc -l 2>/dev/null || echo "0")
if [[ -z "$DIFF" ]]; then
    DIFF=$(awk "BEGIN {print $INPUT_DUR - $OUTPUT_DUR}")
fi
ABS_DIFF=$(echo "$DIFF" | awk '{print ($1 < 0) ? -$1 : $1}')
if (( $(echo "$ABS_DIFF > $TOLERANCE" | bc -l) )); then
    echo -e "${RED}❌ Duration mismatch: input=${INPUT_DUR}s, output=${OUTPUT_DUR}s (diff=${ABS_DIFF}s)${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Durations match (within ${TOLERANCE}s tolerance)${NC}"
fi

# 6. (Optional) Try downloading the file to ensure accessibility
echo -e "${YELLOW}🌐 Downloading result file...${NC}"
HTTP_FILE=$(curl -s -o /dev/null -w "%{http_code}" "$RESULT_URL")
if [[ "$HTTP_FILE" -ne 200 ]]; then
    echo -e "${RED}❌ Failed to download result file (HTTP ${HTTP_FILE})${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Result file accessible${NC}"

echo -e "${GREEN}🎉 All E2E tests passed!${NC}"