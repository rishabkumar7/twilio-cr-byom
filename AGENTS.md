# AGENTS.md — AI Coding Agent Instructions

> Guidelines for GitHub Copilot, Cursor, Windsurf, and other AI coding agents working in this repository.

## Project Overview

**Twilio ConversationRelay BYOM (Bring Your Own Model)** — A FastAPI-based AI voice assistant that uses [Twilio ConversationRelay](https://www.twilio.com/docs/voice/twiml/connect/conversationrelay) to bridge phone calls with multiple LLM backends (OpenAI GPT, Google Gemini, AWS Bedrock/Amazon Nova). Users configure the assistant's AI model, personality, and TTS voice through a web UI, then interact via inbound or outbound phone calls.

### Key Technologies

- **Runtime**: Python 3.12
- **Framework**: FastAPI + Uvicorn
- **Templating**: Jinja2
- **AI SDKs**: `openai`, `google-genai`, `boto3` (AWS Bedrock)
- **Telephony**: Twilio Voice SDK (`twilio`), ConversationRelay (WebSocket-based)
- **TTS Providers**: Twilio (default), Google TTS, Amazon Polly, ElevenLabs
- **Frontend**: Vanilla HTML/CSS/JS (no build step)
- **Deployment**: Docker → Azure Container Apps (see `deploy.sh` / `DEPLOY-Azure-ACA.md`)

## Project Structure

```
├── main.py                  # FastAPI app — all routes, WebSocket handler, AI logic
├── requirements.txt         # Python dependencies (pip)
├── Dockerfile               # Python 3.12-slim container image
├── deploy.sh                # Interactive Azure Container Apps deployment script (bash)
├── DEPLOY-Azure-ACA.md      # Step-by-step Azure deployment guide
├── README.md                # Project documentation
├── templates/
│   └── index.html           # Jinja2 template — web configuration UI
├── static/
│   ├── script.js            # Frontend logic (config form, call form, QR code, TTS voice picker)
│   ├── style.css            # Dark-themed UI styles (CSS custom properties)
│   └── favicon.png          # Favicon
└── scripts/
    └── call_count.py        # CLI utility — count Twilio calls in a date range
```

### Single-File Backend

All server logic lives in `main.py`. There is no separate router, service, or model layer. When adding features, add them to `main.py` unless the change is large enough to warrant a new module.

## Architecture

```
                ┌──────────────┐
  Browser  ───▸│  GET /       │  Web config UI (Jinja2 + static JS/CSS)
                │  /api/config │  GET/POST JSON — read/update runtime config
                │  /api/call   │  POST — initiate outbound call via Twilio REST
                │  /api/phone-number │ GET — return configured Twilio number
                └──────┬───────┘
                       │
  Twilio  ────▸│  GET|POST /twiml │  Returns TwiML <Connect><ConversationRelay>
                └──────┬───────┘
                       │ WebSocket upgrade
                       ▼
                │  WS /ws      │  Real-time voice ↔ LLM conversation
                │              │  Messages: setup → prompt → text response
                └──────────────┘
                       │
            ┌──────────┼──────────────────┐
            ▼          ▼                  ▼
      OpenAI API  Google Gemini API  AWS Bedrock
   (gpt-4o-mini/  (gemini-2.5-pro/  (nova-micro/
     4o/4)          flash)            lite/pro)
```

### WebSocket Protocol (ConversationRelay)

Twilio sends JSON messages over `/ws`:

| Type        | Direction | Description                                    |
|-------------|-----------|------------------------------------------------|
| `setup`     | Twilio→App| Call connected; contains `callSid`             |
| `prompt`    | Twilio→App| User speech transcribed; contains `voicePrompt`|
| `text`      | App→Twilio| AI response text; set `last: true` for final   |
| `interrupt` | Twilio→App| User interrupted the assistant                 |

### In-Memory State

- `sessions` dict — per-call conversation history (keyed by `callSid`)
- `user_info` dict — outbound call metadata (name, phone)
- `current_config` dict — runtime AI/TTS configuration (global, not per-call)

**Important**: State is not persisted. A restart or new replica loses all active sessions. The app is designed to run as a single replica (`--max-replicas 1`).

## API Endpoints

| Method | Path               | Purpose                                      |
|--------|--------------------|----------------------------------------------|
| GET    | `/`                | Serve web UI (`templates/index.html`)        |
| GET    | `/api/config`      | Return current configuration JSON            |
| POST   | `/api/config`      | Update configuration (Pydantic `ConfigModel`)|
| GET    | `/api/phone-number`| Return the configured Twilio phone number    |
| POST   | `/api/call`        | Initiate outbound call (Pydantic `CallRequest`)|
| GET/POST| `/twiml`          | Return TwiML XML for Twilio webhook          |
| WS     | `/ws`              | WebSocket endpoint for ConversationRelay     |

## Configuration Model

The runtime configuration (`current_config`) has these fields:

| Field            | Type   | Default          | Description                              |
|------------------|--------|------------------|------------------------------------------|
| `aiModel`        | str    | `openai-gpt4o-mini` | LLM model identifier                 |
| `personality`    | str    | `helpful`        | Personality preset key                   |
| `customPrompt`   | str    | `""`             | Overrides personality if non-empty       |
| `ttsProvider`    | str    | `default`        | TTS engine: default, Google, amazon, ElevenLabs |
| `voiceId`        | str    | `""`             | Voice identifier for the TTS provider    |
| `elevenLabsModel`| str    | `flash_v2_5`     | ElevenLabs model variant                 |
| `speed`          | str    | `"1.1"`          | ElevenLabs speech speed (0.7–1.2)        |
| `stability`      | str    | `"0.5"`          | ElevenLabs voice stability (0.0–1.0)     |
| `similarity`     | str    | `"0.5"`          | ElevenLabs similarity boost (0.0–1.0)    |

## Environment Variables

| Variable              | Required | Description                                |
|-----------------------|----------|--------------------------------------------|
| `OPENAI_API_KEY`      | Yes      | OpenAI API key                             |
| `TWILIO_ACCOUNT_SID`  | Yes      | Twilio Account SID                         |
| `TWILIO_AUTH_TOKEN`    | Yes      | Twilio Auth Token                          |
| `TWILIO_PHONE_NUMBER`  | Yes     | Twilio phone number (E.164 format)         |
| `GEMINI_API_KEY` or `GOOGLE_API_KEY` | No | Google Gemini API key          |
| `AWS_REGION`          | No       | AWS region for Bedrock (default: `us-east-1`). Uses standard AWS credential chain (env vars, CLI profile, or IAM role) |
| `NGROK_URL`           | Yes      | Public hostname (without `https://`) for WebSocket URL |
| `PORT`                | No       | Server port (default: `8080`)              |

## Coding Conventions

- **No type annotations** on most functions — follow the existing style.
- **System prompts** include voice-specific instructions (spell out numbers, no emojis, no bullet points).
- **Async functions** for all route handlers and the AI response function.
- **Error handling**: AI failures return a friendly fallback string; call failures raise `HTTPException`.
- **TwiML generation**: Built as raw XML strings, not via a TwiML builder library.
- **Frontend**: Vanilla JS with `fetch()` for API calls. No framework, no bundler.

## Running Locally

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Create .env with required variables (see Environment Variables above)

# 3. Start ngrok
ngrok http 8080

# 4. Set NGROK_URL in .env to the ngrok hostname (without https://)

# 5. Run
python main.py

# 6. Configure Twilio webhook to https://<ngrok-url>/twiml
```

## Deployment

Deploy to Azure Container Apps using the interactive script:

```bash
./deploy.sh
```

Or follow the manual steps in `DEPLOY-Azure-ACA.md`. The Dockerfile uses `python:3.12-slim` and runs `python main.py` directly.

## Utility Scripts

- **`scripts/call_count.py`** — CLI tool to count inbound/outbound Twilio calls in a date range. Reads credentials from `.env`. Supports `--inbound`, `--outbound`, and `--status-breakdown` flags.

## Common Tasks for AI Agents

- **Add a new AI model**: Update `model_map` in the `ai_response()` function and add the option to the `<select>` in `templates/index.html`.
- **Add a new personality**: Add an entry to `PERSONALITY_PROMPTS` dict in `main.py` and a corresponding `<option>` in the HTML template.
- **Add a new TTS provider/voice**: Update `build_voice_attribute()` in `main.py` and add voice options in the `voiceOptions` object in `static/script.js`.
- **Add a new API endpoint**: Add a FastAPI route in `main.py`. Use Pydantic models for request bodies.
- **Modify the UI**: Edit `templates/index.html` for structure, `static/style.css` for styling, `static/script.js` for behavior.
