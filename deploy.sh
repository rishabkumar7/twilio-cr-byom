#!/usr/bin/env bash
set -euo pipefail

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command '$1' is not installed." >&2
    exit 1
  fi
}

prompt_with_default() {
  local prompt="$1"
  local default_value="$2"
  local user_value
  read -r -p "$prompt [$default_value]: " user_value
  if [[ -z "$user_value" ]]; then
    echo "$default_value"
  else
    echo "$user_value"
  fi
}

prompt_required_secret() {
  local prompt="$1"
  local value=""
  while [[ -z "$value" ]]; do
    read -r -s -p "$prompt: " value
    echo
    if [[ -z "$value" ]]; then
      echo "This value is required."
    fi
  done
  echo "$value"
}

prompt_optional_secret() {
  local prompt="$1"
  local value
  read -r -s -p "$prompt (optional, press Enter to skip): " value
  echo
  echo "$value"
}

merge_created_by_tag() {
  local resource_id="$1"
  local created_by="$2"
  az tag update \
    --resource-id "$resource_id" \
    --operation Merge \
    --tags "created_by=${created_by}" >/dev/null
}

acr_name_from_app() {
  local app_name="$1"
  local normalized
  normalized=$(echo "$app_name" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')
  if [[ ${#normalized} -lt 5 ]]; then
    normalized="${normalized}acr"
  fi
  normalized="${normalized:0:40}"
  echo "${normalized}$RANDOM"
}

echo "=== Twilio CR BYOM Azure Deployment (Container Apps) ==="

require_cmd az

if ! az account show >/dev/null 2>&1; then
  echo "No active Azure login found. Running 'az login'..."
  az login >/dev/null
fi

DEFAULT_CREATED_BY=$(az account show --query user.name -o tsv)
if [[ -z "$DEFAULT_CREATED_BY" ]]; then
  DEFAULT_CREATED_BY="azure-cli-user"
fi

RG=$(prompt_with_default "Resource group name" "rg-twilio-cr")
APP_NAME=$(prompt_with_default "Container app name" "twilio-cr-byom")
LOCATION=$(prompt_with_default "Azure location" "centralus")
ENV_NAME=$(prompt_with_default "Container Apps environment name" "cae-${APP_NAME}")
ACR=$(prompt_with_default "ACR name (must be globally unique, lowercase alphanumeric)" "$(acr_name_from_app "$APP_NAME")")
IMAGE=$(prompt_with_default "Image tag" "${APP_NAME}:$(date -u +%Y%m%d%H%M%S)")
CREATED_BY=$(prompt_with_default "created_by resource tag" "$DEFAULT_CREATED_BY")

echo
echo "Enter required application secrets:"
OPENAI_API_KEY=$(prompt_required_secret "OPENAI_API_KEY")
TWILIO_ACCOUNT_SID=$(prompt_required_secret "TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN=$(prompt_required_secret "TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER=$(prompt_required_secret "TWILIO_PHONE_NUMBER")
GEMINI_API_KEY=$(prompt_optional_secret "GEMINI_API_KEY")

echo
echo "Ensuring Azure Container Apps extension is installed..."
az extension add --name containerapp --upgrade >/dev/null

if ! az group show --name "$RG" >/dev/null 2>&1; then
  echo "Creating resource group '$RG' in '$LOCATION'..."
  az group create \
    --name "$RG" \
    --location "$LOCATION" \
    --tags "created_by=${CREATED_BY}" >/dev/null
else
  echo "Resource group '$RG' already exists. Applying required tag..."
  RG_ID=$(az group show --name "$RG" --query id -o tsv)
  merge_created_by_tag "$RG_ID" "$CREATED_BY"
fi

if ! az acr show --resource-group "$RG" --name "$ACR" >/dev/null 2>&1; then
  echo "Creating Azure Container Registry '$ACR'..."
  az acr create \
    --resource-group "$RG" \
    --name "$ACR" \
    --sku Basic \
    --admin-enabled true \
    --tags "created_by=${CREATED_BY}" >/dev/null
else
  echo "ACR '$ACR' already exists. Applying required tag..."
  ACR_ID=$(az acr show --resource-group "$RG" --name "$ACR" --query id -o tsv)
  merge_created_by_tag "$ACR_ID" "$CREATED_BY"
fi

echo "Building image '$IMAGE' in ACR '$ACR'..."
az acr build --registry "$ACR" --image "$IMAGE" .

if ! az containerapp env show --resource-group "$RG" --name "$ENV_NAME" >/dev/null 2>&1; then
  echo "Creating Container Apps environment '$ENV_NAME'..."
  az containerapp env create \
    --resource-group "$RG" \
    --name "$ENV_NAME" \
    --location "$LOCATION" \
    --tags "created_by=${CREATED_BY}" >/dev/null
else
  echo "Container Apps environment '$ENV_NAME' already exists. Applying required tag..."
  ENV_ID=$(az containerapp env show --resource-group "$RG" --name "$ENV_NAME" --query id -o tsv)
  merge_created_by_tag "$ENV_ID" "$CREATED_BY"
fi

ACR_SERVER="${ACR}.azurecr.io"
ACR_USERNAME=$(az acr credential show --name "$ACR" --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name "$ACR" --query 'passwords[0].value' -o tsv)

if az containerapp show --resource-group "$RG" --name "$APP_NAME" >/dev/null 2>&1; then
  echo "Container app '$APP_NAME' already exists. Applying required tag..."
  APP_ID=$(az containerapp show --resource-group "$RG" --name "$APP_NAME" --query id -o tsv)
  merge_created_by_tag "$APP_ID" "$CREATED_BY"

  echo "Updating image and ingress..."
  az containerapp update \
    --resource-group "$RG" \
    --name "$APP_NAME" \
    --image "${ACR_SERVER}/${IMAGE}" \
    --set-env-vars PORT=8080 >/dev/null

  az containerapp ingress enable \
    --resource-group "$RG" \
    --name "$APP_NAME" \
    --type external \
    --target-port 8080 >/dev/null

  az containerapp registry set \
    --resource-group "$RG" \
    --name "$APP_NAME" \
    --server "$ACR_SERVER" \
    --username "$ACR_USERNAME" \
    --password "$ACR_PASSWORD" >/dev/null
else
  echo "Creating container app '$APP_NAME'..."
  az containerapp create \
    --resource-group "$RG" \
    --name "$APP_NAME" \
    --environment "$ENV_NAME" \
    --image "${ACR_SERVER}/${IMAGE}" \
    --target-port 8080 \
    --ingress external \
    --registry-server "$ACR_SERVER" \
    --registry-username "$ACR_USERNAME" \
    --registry-password "$ACR_PASSWORD" \
    --tags "created_by=${CREATED_BY}" >/dev/null
fi

echo "Setting application secrets..."
secret_args=(
  "openai=${OPENAI_API_KEY}"
  "twilio-sid=${TWILIO_ACCOUNT_SID}"
  "twilio-token=${TWILIO_AUTH_TOKEN}"
  "twilio-phone=${TWILIO_PHONE_NUMBER}"
)

if [[ -n "$GEMINI_API_KEY" ]]; then
  secret_args+=("gemini=${GEMINI_API_KEY}")
fi

az containerapp secret set \
  --resource-group "$RG" \
  --name "$APP_NAME" \
  --secrets "${secret_args[@]}" >/dev/null

FQDN=$(az containerapp show --resource-group "$RG" --name "$APP_NAME" --query properties.configuration.ingress.fqdn -o tsv)

echo "Applying runtime environment variables..."
az containerapp update \
  --resource-group "$RG" \
  --name "$APP_NAME" \
  --set-env-vars \
    PORT=8080 \
    NGROK_URL="$FQDN" \
    OPENAI_API_KEY=secretref:openai \
    TWILIO_ACCOUNT_SID=secretref:twilio-sid \
    TWILIO_AUTH_TOKEN=secretref:twilio-token \
    TWILIO_PHONE_NUMBER=secretref:twilio-phone >/dev/null

if [[ -n "$GEMINI_API_KEY" ]]; then
  az containerapp update \
    --resource-group "$RG" \
    --name "$APP_NAME" \
    --set-env-vars GEMINI_API_KEY=secretref:gemini >/dev/null
fi

echo "Setting replica scale to 1/1 for in-memory session safety..."
az containerapp update --resource-group "$RG" --name "$APP_NAME" --min-replicas 1 --max-replicas 1 >/dev/null

echo
echo "Deployment complete."
echo "App URL: https://${FQDN}"
echo "Twilio webhook URL: https://${FQDN}/twiml"
echo
echo "Quick checks:"
echo "  curl -i https://${FQDN}/"
echo "  curl -i https://${FQDN}/api/config"
echo "  curl -i https://${FQDN}/twiml"
