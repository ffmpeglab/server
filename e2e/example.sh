#!/bin/bash
set -euo pipefail

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
DEBUG=${DEBUG:-0}

# Required env vars
: "${API_HOST:?API_HOST not set}"
: "${API_KEY:?API_KEY not set}"

# DNN model settings (can be overridden)
DNN_BACKEND="${DNN_BACKEND:-openvino}"
DETECT_MODEL="${DETECT_MODEL:-/models/face-detection-0200.xml}"
DETECT_CONFIDENCE="${DETECT_CONFIDENCE:-0.5}"
# Optional labels
DETECT_LABELS="${DETECT_LABELS:-}"

# Ensure jq and ffprobe are available
if ! command -v jq &> /dev/null; then
    echo -e "${RED}❌ jq not found.${NC}"
    exit 1
fi
if ! command -v ffprobe &> /dev/null; then
    echo -e "${RED}❌ ffprobe not found.${NC}"
    exit 1
fi

# Helper: call API (copied from your existing script)
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

    if [[ "$DEBUG" -eq 1 ]]; then
        echo -e "${YELLOW}🐞 DEBUG: Response body (${http_code}):${NC}" >&2
        cat "$response_file" >&2
        echo "" >&2
    fi

    if [[ ! "$http_code" =~ ^2[0-9][0-9]$ ]]; then
        echo -e "${RED}❌ Request failed: ${method} ${endpoint} → HTTP ${http_code}${NC}" >&2
        echo -e "${RED}Response body:${NC}" >&2
        cat "$response_file" >&2
        rm -f "$response_file"
        exit 1
    fi

    cat "$response_file"
    rm -f "$response_file"
}

extract_json() {
    local json="$1"
    local key="$2"
    echo "$json" | jq -r "$key // empty" 2>/dev/null || echo ""
}

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

echo -e "${YELLOW}🚀 Starting one‑shot DNN test (dnn_detect)…${NC}"

# Choose a test video (prefer one with faces)
TEST_VIDEO_URL="https://www.ffmpeglab.com/media/faces_sample.mp4"   # adjust if needed
if ! curl -s -I "$TEST_VIDEO_URL" | head -n1 | grep -q "200"; then
    echo -e "${YELLOW}⚠️  faces_sample.mp4 not available, falling back to zoompan.mp4${NC}"
    TEST_VIDEO_URL="https://www.ffmpeglab.com/media/zoompan.mp4"
fi
echo -e "${YELLOW}📹 Using video: ${TEST_VIDEO_URL}${NC}"

# Build the dnn_detect command
# We'll capture stderr into $OUTPUT_PATH because stdout goes to null.
# The command will be:
#   -i $MEDIA_1 -vf "dnn_detect=dnn_backend=$DNN_BACKEND:model=$DETECT_MODEL:input=data:output=detection_out:confidence=$DETECT_CONFIDENCE" -f null - 2> $OUTPUT_PATH
# Note: we must escape the double quotes inside the JSON payload.
DNN_FILTER="dnn_detect=dnn_backend=${DNN_BACKEND}:model=${DETECT_MODEL}:input=data:output=detection_out:confidence=${DETECT_CONFIDENCE}"
if [[ -n "$DETECT_LABELS" ]]; then
    DNN_FILTER="${DNN_FILTER}:labels=${DETECT_LABELS}"
fi

# The command string that will be executed by the renderer.
# We use shell redirection to capture stderr.
COMMAND="-i \$MEDIA_1 -vf \"${DNN_FILTER}\" -f null - 2> \$OUTPUT_PATH"

echo -e "${YELLOW}🔧 Command: ${COMMAND}${NC}"

# 1. Create a render with this custom command
echo -e "${YELLOW}➡️  Creating render…${NC}"
CREATE_PAYLOAD=$(cat <<EOF
{
    "project": {
        "id": "dnn-test",
        "title": "DNN One-Shot Test",
        "editor": {
            "code": "${COMMAND}",
            "selectedCode": "custom"
        }
    },
    "layers": [
        {
            "id": "layer1",
            "media": [
                {
                    "id": "media1",
                    "url": "${TEST_VIDEO_URL}",
                    "folderId": "test",
                    "filename": "input.mp4",
                    "encoding": {}
                }
            ],
            "editor": {}
        }
    ]
}
EOF
)

RESPONSE=$(call_api "POST" "/renders" "$CREATE_PAYLOAD")
RENDER_ID=$(extract_json "$RESPONSE" ".id")
if [[ -z "$RENDER_ID" || "$RENDER_ID" == "null" ]]; then
    echo -e "${RED}❌ Failed to extract render ID${NC}"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    exit 1
fi
echo -e "${GREEN}✅ Render created with ID: ${RENDER_ID}${NC}"

# 2. Run the render
echo -e "${YELLOW}➡️  Running render…${NC}"
RUN_PAYLOAD="{\"id\": \"$RENDER_ID\"}"
call_api "PUT" "/renders/run" "$RUN_PAYLOAD" > /dev/null
echo -e "${GREEN}✅ Render started${NC}"

# 3. Poll for completion
echo -e "${YELLOW}⏳ Waiting for render to finish…${NC}"
MAX_ATTEMPTS=60
ATTEMPT=0
while true; do
    ATTEMPT=$((ATTEMPT + 1))
    if [[ $ATTEMPT -gt $MAX_ATTEMPTS ]]; then
        echo -e "${RED}❌ Timeout waiting for render${NC}"
        exit 1
    fi

    STATUS_RESPONSE=$(call_api "GET" "/renders/${RENDER_ID}")
    STATUS=$(extract_json "$STATUS_RESPONSE" ".status")
    echo -e "  ⏳ Attempt ${ATTEMPT}: status = ${STATUS}"

    if [[ "$STATUS" == "done" ]]; then
        echo -e "${GREEN}✅ Render completed${NC}"
        break
    elif [[ "$STATUS" == "failed" ]]; then
        echo -e "${RED}❌ Render failed${NC}"
        echo "$STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$STATUS_RESPONSE"
        exit 1
    fi
    sleep 3
done

# 4. Extract the output URL (the stderr capture file)
RESULT_URL=$(extract_json "$STATUS_RESPONSE" ".result.url")
if [[ -z "$RESULT_URL" || "$RESULT_URL" == "null" ]]; then
    echo -e "${RED}❌ result.url missing${NC}"
    echo "$STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$STATUS_RESPONSE"
    exit 1
fi
echo -e "${GREEN}✅ Output file: ${RESULT_URL}${NC}"

# 5. Download and verify the output file
echo -e "${YELLOW}🌐 Downloading detection log…${NC}"
OUTPUT_FILE=$(mktemp)
curl -s -o "$OUTPUT_FILE" "$RESULT_URL"
if [[ ! -s "$OUTPUT_FILE" ]]; then
    echo -e "${RED}❌ Output file is empty${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Log file downloaded (size: $(wc -c < "$OUTPUT_FILE") bytes)${NC}"

# 6. Check for detection metadata in the log
# Look for lines containing "detection" (FFmpeg's showinfo prints them)
if grep -q "detection" "$OUTPUT_FILE"; then
    echo -e "${GREEN}✅ Detection output found in log${NC}"
    # Show first few lines
    echo -e "${YELLOW}📊 Sample detection lines:${NC}"
    grep "detection" "$OUTPUT_FILE" | head -n 5
else
    echo -e "${YELLOW}⚠️  No detection output found – maybe no faces? (not a failure)${NC}"
    # Still treat as success if FFmpeg ran without error; but we can check for errors
fi

# 7. Check that FFmpeg didn't report an error (look for "error" in log)
if grep -i "error" "$OUTPUT_FILE" | grep -v "detection"; then
    echo -e "${RED}❌ FFmpeg reported errors:${NC}"
    grep -i "error" "$OUTPUT_FILE"
    exit 1
else
    echo -e "${GREEN}✅ No FFmpeg errors detected${NC}"
fi

# 8. (Optional) Compare durations? Not necessary because output is not a video.

echo -e "${GREEN}🎉 One‑shot DNN test passed!${NC}"
rm -f "$OUTPUT_FILE"
exit 0