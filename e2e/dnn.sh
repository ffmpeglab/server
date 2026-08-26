#!/bin/bash
set -euo pipefail

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

# Ensure jq and curl are available
if ! command -v jq &> /dev/null; then
    echo -e "${RED}❌ jq not found. Please install jq.${NC}"
    exit 1
fi
if ! command -v curl &> /dev/null; then
    echo -e "${RED}❌ curl not found.${NC}"
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

# Helper: extract JSON value with jq, fallback to empty string
extract_json() {
    local json="$1"
    local key="$2"
    echo "$json" | jq -r "$key // empty" 2>/dev/null || echo ""
}

# Helper: get duration in seconds using ffprobe (assumes ffprobe is available)
# If you're running this test outside the container, you may need to install ffprobe locally.
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

echo -e "${YELLOW}🚀 Starting DNN Pipeline E2E test...${NC}"

# ----- Pre‑flight check: ensure FFmpeg DNN filters are available (if inside container) -----
# This step is optional – if we're outside the container we might not have ffmpeg.
if command -v ffmpeg &> /dev/null; then
    echo -e "${YELLOW}🔍 Checking FFmpeg DNN filters...${NC}"
    if ffmpeg -filters 2>/dev/null | grep -q dnn_detect; then
        echo -e "${GREEN}✅ dnn_detect filter available${NC}"
    else
        echo -e "${RED}❌ dnn_detect filter NOT available – your FFmpeg lacks DNN support.${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  ffmpeg not found in PATH – skipping filter check (assumed inside container)${NC}"
fi

# ----- Choose a test video (with faces) -----
# Use a public-domain video that contains faces (e.g., from a sample repository).
# If you have a local video you prefer, change this URL.
TEST_VIDEO_URL="https://www.ffmpeglab.com/media/faces_sample.mp4"   # adjust to an actual URL with faces
# Fallback to zoompan if the above doesn't exist (but it may have no faces)
if ! curl -s -I "$TEST_VIDEO_URL" | head -n1 | grep -q "200"; then
    echo -e "${YELLOW}⚠️  faces_sample.mp4 not found, falling back to zoompan.mp4 (may have no faces)${NC}"
    TEST_VIDEO_URL="https://www.ffmpeglab.com/media/zoompan.mp4"
fi
echo -e "${YELLOW}📹 Using test video: ${TEST_VIDEO_URL}${NC}"

# ----- 1. Create a render using the 'video-labeling' pipeline -----
echo -e "${YELLOW}➡️  Creating render with pipeline 'video-labeling'...${NC}"
CREATE_PAYLOAD=$(cat <<EOF
{
    "pipelineId": "video-labeling",
    "inputs": [
        {
            "id": "INPUT_FILE",
            "url": "$TEST_VIDEO_URL",
            "folderId": "test",
            "filename": "input.mp4"
        }
    ]
}
EOF
)
RESPONSE=$(call_api "POST" "/renders" "$CREATE_PAYLOAD")
RENDER_ID=$(extract_json "$RESPONSE" ".id")
if [[ -z "$RENDER_ID" || "$RENDER_ID" == "null" ]]; then
    echo -e "${RED}❌ Failed to extract render ID from response:${NC}"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    exit 1
fi
echo -e "${GREEN}✅ Render created with ID: ${RENDER_ID}${NC}"

# ----- 2. Trigger the render (run) -----
echo -e "${YELLOW}➡️  Running render...${NC}"
RUN_PAYLOAD="{\"id\": \"$RENDER_ID\"}"
call_api "PUT" "/renders/run" "$RUN_PAYLOAD" > /dev/null
echo -e "${GREEN}✅ Render started${NC}"

# ----- 3. Poll for completion -----
echo -e "${YELLOW}⏳ Waiting for render to finish...${NC}"
MAX_ATTEMPTS=60   # give it up to ~3 minutes
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

# ----- 4. Extract output URLs from the render result -----
# The pipeline defines three outputs. The render's "result" might contain them.
# We'll look for a "results" array or top-level keys. Adapt to your actual response structure.
echo -e "${YELLOW}🔍 Extracting output files...${NC}"

# Try to get the outputs from the "result" field (assuming it's an object with keys)
# The pipeline YAML uses output_path patterns, so the final render should list them.
# If your API stores outputs under a "files" array, adjust accordingly.
OUTPUTS=$(extract_json "$STATUS_RESPONSE" ".result")
if [[ -z "$OUTPUTS" || "$OUTPUTS" == "null" ]]; then
    echo -e "${RED}❌ No result object found in render response.${NC}"
    echo "$STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$STATUS_RESPONSE"
    exit 1
fi

# Attempt to extract the three expected files. We'll assume they are stored as:
#   .result.detections, .result.classifications, .result.labeledVideo
# Adjust these keys to match your actual API response.
DETECTIONS_URL=$(extract_json "$STATUS_RESPONSE" ".result.detections")
CLASSIFICATIONS_URL=$(extract_json "$STATUS_RESPONSE" ".result.classifications")
LABELED_VIDEO_URL=$(extract_json "$STATUS_RESPONSE" ".result.labeledVideo")

# If the above fail, try to extract from a "files" array.
if [[ -z "$DETECTIONS_URL" || "$DETECTIONS_URL" == "null" ]]; then
    # Try to parse a "files" array: each element has "name" and "url"
    FILES_JSON=$(extract_json "$STATUS_RESPONSE" ".result.files")
    if [[ -n "$FILES_JSON" && "$FILES_JSON" != "null" ]]; then
        DETECTIONS_URL=$(echo "$FILES_JSON" | jq -r '.[] | select(.name | contains("detections")) | .url' 2>/dev/null)
        CLASSIFICATIONS_URL=$(echo "$FILES_JSON" | jq -r '.[] | select(.name | contains("classifications")) | .url' 2>/dev/null)
        LABELED_VIDEO_URL=$(echo "$FILES_JSON" | jq -r '.[] | select(.name | contains("labeled")) | .url' 2>/dev/null)
    fi
fi

# Check that we have at least the labeled video (the final output)
if [[ -z "$LABELED_VIDEO_URL" || "$LABELED_VIDEO_URL" == "null" ]]; then
    echo -e "${RED}❌ Could not find labeled video URL in render result.${NC}"
    echo "$STATUS_RESPONSE" | jq '.result' 2>/dev/null || echo "$STATUS_RESPONSE"
    exit 1
fi
echo -e "${GREEN}✅ Labeled video: ${LABELED_VIDEO_URL}${NC}"
if [[ -n "$DETECTIONS_URL" && "$DETECTIONS_URL" != "null" ]]; then
    echo -e "${GREEN}✅ Detections JSON: ${DETECTIONS_URL}${NC}"
fi
if [[ -n "$CLASSIFICATIONS_URL" && "$CLASSIFICATIONS_URL" != "null" ]]; then
    echo -e "${GREEN}✅ Classifications JSON: ${CLASSIFICATIONS_URL}${NC}"
fi

# ----- 5. Verify each output file is accessible and has content -----
echo -e "${YELLOW}🌐 Verifying output files...${NC}"

verify_file() {
    local url="$1"
    local description="$2"
    if [[ -z "$url" || "$url" == "null" ]]; then
        echo -e "${YELLOW}⚠️  No ${description} URL available (skip)${NC}"
        return 0
    fi
    # Check HTTP 200
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    if [[ "$http_code" -ne 200 ]]; then
        echo -e "${RED}❌ Failed to download ${description} (HTTP ${http_code})${NC}"
        exit 1
    fi
    # Check non‑empty
    local size
    size=$(curl -s -I "$url" | grep -i content-length | awk '{print $2}' | tr -d '\r')
    if [[ -z "$size" || "$size" -eq 0 ]]; then
        echo -e "${RED}❌ ${description} is empty (size 0)${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ ${description} accessible (size: ${size} bytes)${NC}"
}

verify_file "$LABELED_VIDEO_URL" "labeled video"
verify_file "$DETECTIONS_URL" "detections JSON"
verify_file "$CLASSIFICATIONS_URL" "classifications JSON"

# ----- 6. Validate JSON content (if JSON URLs exist) -----
validate_json() {
    local url="$1"
    local description="$2"
    if [[ -z "$url" || "$url" == "null" ]]; then
        return 0
    fi
    # Download and check if it's valid JSON
    local content
    content=$(curl -s "$url")
    if ! echo "$content" | jq empty 2>/dev/null; then
        echo -e "${RED}❌ ${description} is not valid JSON${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ ${description} is valid JSON${NC}"
    # Optionally, check that it contains detection data (e.g., array non‑empty)
    # For detections, we expect an array of objects with "bbox" etc.
    if [[ "$description" == *"detections"* ]]; then
        length=$(echo "$content" | jq 'length' 2>/dev/null || echo "0")
        if [[ "$length" -eq 0 ]]; then
            echo -e "${YELLOW}⚠️  Detections JSON has no entries (could be no faces)${NC}"
        else
            echo -e "${GREEN}✅ Detections JSON contains ${length} entries${NC}"
            # Show first detection as sample
            echo "$content" | jq '.[0]' 2>/dev/null || echo "  (sample not available)"
        fi
    fi
}

validate_json "$DETECTIONS_URL" "detections JSON"
validate_json "$CLASSIFICATIONS_URL" "classifications JSON"

# ----- 7. Compare durations (only for labeled video) -----
echo -e "${YELLOW}🔍 Comparing input and output durations...${NC}"
INPUT_DUR=$(get_duration "$TEST_VIDEO_URL")
echo -e "   Input duration: ${INPUT_DUR}s"
OUTPUT_DUR=$(get_duration "$LABELED_VIDEO_URL")
echo -e "   Output duration: ${OUTPUT_DUR}s"

TOLERANCE=0.5
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

# ----- All tests passed -----
echo -e "${GREEN}🎉 All DNN pipeline E2E tests passed!${NC}"
exit 0