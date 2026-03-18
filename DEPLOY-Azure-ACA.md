# Deploy to Azure Container Apps (WebSocket Ready)

This guide deploys this FastAPI app to Azure Container Apps with external HTTPS ingress so Twilio ConversationRelay can connect to `/ws` over `wss://`.

## Why Container Apps

- Supports long-lived HTTP connections and WebSockets.
- Exposes a public HTTPS endpoint suitable for Twilio webhooks.
- Works directly with your existing container image and `PORT=8080` app configuration.

## Prerequisites

- Azure subscription.
- Azure CLI installed.
- Docker installed (optional if using `az acr build`, which builds in Azure).
- Twilio credentials and phone number.
- OpenAI API key (required), Gemini API key (optional).

## Quick path: use deploy.sh

From the repository root, run:

```bash
./deploy.sh
```

The script prompts for resource group, app name, and location, then provisions Azure resources, builds the container image, configures secrets and env vars, and prints the public app URL.

If you prefer a fully manual walkthrough, follow the steps below.

## 1) Sign in and set variables

```bash
az login

# Change these values
RG="rg-twilio-cr"
LOCATION="centralus"
ACR="twiliocrbyom$RANDOM"
ENV_NAME="cae-twilio-cr"
APP_NAME="twilio-cr-byom"
IMAGE="twilio-cr-byom:latest"
```

## 2) Create resource group and registry

```bash
az group create -n "$RG" -l "$LOCATION"
az acr create -g "$RG" -n "$ACR" --sku Basic
```

## 3) Build image in ACR

Run from the repository root:

```bash
az acr build -r "$ACR" -t "$IMAGE" .
```

## 4) Create Container Apps environment

```bash
az containerapp env create -g "$RG" -n "$ENV_NAME" -l "$LOCATION"
```

## 5) Create Container App with external ingress

> `--ingress external` is required for public access and Twilio callbacks.

```bash
az containerapp create \
  -g "$RG" \
  -n "$APP_NAME" \
  --environment "$ENV_NAME" \
  --image "$ACR.azurecr.io/$IMAGE" \
  --target-port 8080 \
  --ingress external \
  --registry-server "$ACR.azurecr.io" \
  --query properties.configuration.ingress.fqdn -o tsv
```

Capture the returned FQDN:

```bash
FQDN=$(az containerapp show -g "$RG" -n "$APP_NAME" --query properties.configuration.ingress.fqdn -o tsv)
echo "$FQDN"
```

## 6) Set secrets and environment variables

```bash
# Required values
OPENAI_API_KEY="<your-openai-key>"
TWILIO_ACCOUNT_SID="<your-twilio-account-sid>"
TWILIO_AUTH_TOKEN="<your-twilio-auth-token>"
TWILIO_PHONE_NUMBER="<your-twilio-phone-number>"

# Optional
GEMINI_API_KEY="<your-gemini-key>"

az containerapp secret set \
  -g "$RG" \
  -n "$APP_NAME" \
  --secrets \
    openai="$OPENAI_API_KEY" \
    twilioSid="$TWILIO_ACCOUNT_SID" \
    twilioToken="$TWILIO_AUTH_TOKEN" \
    twilioPhone="$TWILIO_PHONE_NUMBER" \
    gemini="$GEMINI_API_KEY"

az containerapp update \
  -g "$RG" \
  -n "$APP_NAME" \
  --set-env-vars \
    PORT=8080 \
    NGROK_URL="$FQDN" \
    OPENAI_API_KEY=secretref:openai \
    TWILIO_ACCOUNT_SID=secretref:twilioSid \
    TWILIO_AUTH_TOKEN=secretref:twilioToken \
    TWILIO_PHONE_NUMBER=secretref:twilioPhone

# Only if you plan to use Gemini models
az containerapp update \
  -g "$RG" \
  -n "$APP_NAME" \
  --set-env-vars GEMINI_API_KEY=secretref:gemini
```

## 7) Configure scale for in-memory sessions

This app stores call session data in memory, so start with one replica:

```bash
az containerapp update -g "$RG" -n "$APP_NAME" --min-replicas 1 --max-replicas 1
```

## 8) Verify app and WebSocket endpoint

```bash
curl -i "https://$FQDN/"
curl -i "https://$FQDN/api/config"
curl -i "https://$FQDN/twiml"
```

Expected:
- `/` returns the HTML UI.
- `/api/config` returns JSON.
- `/twiml` returns XML with `ConversationRelay` and `url="wss://<fqdn>/ws"`.

## 9) Configure Twilio webhook

In Twilio Console for your number:
- Voice webhook URL: `https://<your-fqdn>/twiml`
- Method: `GET` (or `POST`, app supports both)

## Common issue: Blue 404 page in browser

If you see:
> Error 404 - This Container App is stopped or does not exist.

Most common cause: using an internal-only URL (often includes `.internal.`) or ingress is internal.

Check ingress and FQDN:

```bash
az containerapp show -g "$RG" -n "$APP_NAME" \
  --query "properties.configuration.ingress.{external:external,fqdn:fqdn,targetPort:targetPort}" -o json
```

If `external` is `false`, enable external ingress:

```bash
az containerapp ingress enable \
  -g "$RG" \
  -n "$APP_NAME" \
  --type external \
  --target-port 8080
```

Then set `NGROK_URL` again to the public FQDN and restart revision:

```bash
FQDN=$(az containerapp show -g "$RG" -n "$APP_NAME" --query properties.configuration.ingress.fqdn -o tsv)
az containerapp update -g "$RG" -n "$APP_NAME" --set-env-vars NGROK_URL="$FQDN"
```

## Useful operations

```bash
# Stream logs
az containerapp logs show -g "$RG" -n "$APP_NAME" --follow

# Show latest revision details
az containerapp revision list -g "$RG" -n "$APP_NAME" -o table

# Open app in browser
open "https://$FQDN"
```
