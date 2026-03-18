#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

# Auto-add local gcloud installation path when available.
if [[ -d "${HOME}/.local/google-cloud-sdk/bin" ]]; then
  export PATH="${HOME}/.local/google-cloud-sdk/bin:${PATH}"
fi

if [[ -f ".env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing command: $1" >&2
    exit 1
  }
}

need_cmd gcloud

: "${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
: "${GCP_REGION:=asia-northeast3}"
: "${SERVICE_NAME_API:=stagepilot-api}"
: "${GEMINI_MODEL:=gemini-3.1-pro-preview}"
: "${GEMINI_FALLBACK_MODEL:=gemini-2.5-flash}"
: "${GEMINI_HTTP_TIMEOUT_MS:=8000}"
: "${STAGEPILOT_REQUEST_BODY_TIMEOUT_MS:=10000}"
: "${FIRESTORE_DATABASE:=(default)}"
: "${DEPLOYMENT_TRACK:=standard}"
: "${PILOT_DISTRICT_1:=강북구}"
: "${PILOT_DISTRICT_2:=중랑구}"
: "${SLA_URGENT_MINUTES:=120}"
: "${SLA_NORMAL_HOURS:=24}"
: "${BENCHMARK_CASES:=24}"
: "${USE_GPU:=0}"
: "${OPENCLAW_ENABLED:=}"
: "${OPENCLAW_CHANNEL:=}"
: "${OPENCLAW_WEBHOOK_URL:=}"
: "${OPENCLAW_WEBHOOK_TIMEOUT_MS:=}"

current_service_env() {
  local key="$1"
  gcloud run services describe "${SERVICE_NAME_API}" \
    --project "${GCP_PROJECT_ID}" \
    --region "${GCP_REGION}" \
    --format=json 2>/dev/null | \
    python3 -c '
import json, sys
key = sys.argv[1]
try:
    data = json.load(sys.stdin)
except Exception:
    raise SystemExit(0)
for item in data.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [{}])[0].get("env", []):
    if item.get("name") == key and isinstance(item.get("value"), str):
        print(item["value"])
        break
' "$key"
}

if [[ -z "${OPENCLAW_ENABLED}" ]]; then
  OPENCLAW_ENABLED="$(current_service_env OPENCLAW_ENABLED)"
fi
if [[ -z "${OPENCLAW_CHANNEL}" ]]; then
  OPENCLAW_CHANNEL="$(current_service_env OPENCLAW_CHANNEL)"
fi
if [[ -z "${OPENCLAW_WEBHOOK_URL}" ]]; then
  OPENCLAW_WEBHOOK_URL="$(current_service_env OPENCLAW_WEBHOOK_URL)"
fi
if [[ -z "${OPENCLAW_WEBHOOK_TIMEOUT_MS}" ]]; then
  OPENCLAW_WEBHOOK_TIMEOUT_MS="$(current_service_env OPENCLAW_WEBHOOK_TIMEOUT_MS)"
fi

: "${OPENCLAW_ENABLED:=0}"
: "${OPENCLAW_CHANNEL:=telegram}"
: "${OPENCLAW_WEBHOOK_URL:=}"
: "${OPENCLAW_WEBHOOK_TIMEOUT_MS:=5000}"

if [[ "${USE_GPU}" != "0" ]]; then
  echo "USE_GPU must be 0 for this project." >&2
  exit 1
fi

RUNTIME_SA="${RUNTIME_SA:-stagepilot-runner@${GCP_PROJECT_ID}.iam.gserviceaccount.com}"

echo "[deploy-stagepilot] project=${GCP_PROJECT_ID}"
echo "[deploy-stagepilot] region=${GCP_REGION}"
echo "[deploy-stagepilot] service=${SERVICE_NAME_API}"
echo "[deploy-stagepilot] runtime_sa=${RUNTIME_SA}"
echo "[deploy-stagepilot] model=${GEMINI_MODEL}"
echo "[deploy-stagepilot] gemini_fallback_model=${GEMINI_FALLBACK_MODEL}"
echo "[deploy-stagepilot] gemini_timeout_ms=${GEMINI_HTTP_TIMEOUT_MS}"
echo "[deploy-stagepilot] request_body_timeout_ms=${STAGEPILOT_REQUEST_BODY_TIMEOUT_MS}"
echo "[deploy-stagepilot] openclaw_enabled=${OPENCLAW_ENABLED}"
echo "[deploy-stagepilot] openclaw_channel=${OPENCLAW_CHANNEL}"
echo "[deploy-stagepilot] openclaw_webhook_url=${OPENCLAW_WEBHOOK_URL:+configured}"

gcloud run deploy "${SERVICE_NAME_API}" \
  --source . \
  --project "${GCP_PROJECT_ID}" \
  --region "${GCP_REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --service-account "${RUNTIME_SA}" \
  --port 8080 \
  --cpu 1 \
  --memory 1Gi \
  --min-instances 0 \
  --max-instances 3 \
  --execution-environment gen2 \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest" \
  --set-env-vars "APP_ENV=prod,LOG_LEVEL=info,USE_GPU=0,GEMINI_MODEL=${GEMINI_MODEL},GEMINI_FALLBACK_MODEL=${GEMINI_FALLBACK_MODEL},GEMINI_HTTP_TIMEOUT_MS=${GEMINI_HTTP_TIMEOUT_MS},STAGEPILOT_REQUEST_BODY_TIMEOUT_MS=${STAGEPILOT_REQUEST_BODY_TIMEOUT_MS},FIRESTORE_DATABASE=${FIRESTORE_DATABASE},DEPLOYMENT_TRACK=${DEPLOYMENT_TRACK},PILOT_DISTRICT_1=${PILOT_DISTRICT_1},PILOT_DISTRICT_2=${PILOT_DISTRICT_2},SLA_URGENT_MINUTES=${SLA_URGENT_MINUTES},SLA_NORMAL_HOURS=${SLA_NORMAL_HOURS},BENCHMARK_CASES=${BENCHMARK_CASES},OPENCLAW_ENABLED=${OPENCLAW_ENABLED},OPENCLAW_CHANNEL=${OPENCLAW_CHANNEL},OPENCLAW_WEBHOOK_URL=${OPENCLAW_WEBHOOK_URL},OPENCLAW_WEBHOOK_TIMEOUT_MS=${OPENCLAW_WEBHOOK_TIMEOUT_MS}"

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME_API}" \
  --project "${GCP_PROJECT_ID}" \
  --region "${GCP_REGION}" \
  --format='value(status.url)')"

echo "[deploy-stagepilot] deployed_url=${SERVICE_URL}"
echo "[deploy-stagepilot] health_check: curl -s ${SERVICE_URL}/health | jq"
