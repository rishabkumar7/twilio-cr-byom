# AI Voice Assistant with Web Configuration

This project creates an intelligent voice assistant that uses [Twilio Voice](https://www.twilio.com/docs/voice) and [ConversationRelay](https://www.twilio.com/docs/voice/twiml/connect/conversationrelay) with multiple AI models including [OpenAI API](https://platform.openai.com/docs/api-reference/introduction) and [Google Gemini](https://ai.google.dev/). The assistant can engage in natural two-way conversations over phone calls with configurable personalities and AI models.

## Overview

This application provides:
- **Web Configuration Interface**: Select AI models (OpenAI GPT-4o, GPT-4, Gemini) and personality types
- **Inbound Calls**: Users can call your Twilio number to interact with the AI assistant
- **Outbound Calls**: Initiate calls to users directly from the web interface
- **Multiple AI Models**: Support for OpenAI GPT models and Google Gemini
- **Personality Customization**: Choose from 8 different personality types or create custom prompts
- **Real-time Configuration**: Changes apply immediately to new calls

## Prerequisites

- [Python 3.10+](https://www.python.org/downloads/)
- A Twilio Account: Sign up for a [free trial here](https://www.twilio.com/try-twilio)
- A Twilio Number with Voice Capabilities: [Instructions to purchase a number](https://support.twilio.com/hc/en-us/articles/223180928-How-to-Buy-a-Twilio-Phone-Number)
- **Required**: OpenAI Account and API Key: Visit [OpenAI's platform](https://platform.openai.com/api-keys)
- **Optional**: Google AI Studio Account and API Key: Visit [Google AI Studio](https://aistudio.google.com/app/apikey) for Gemini models
- ngrok for local development: [Download ngrok](https://ngrok.com/)

## Installation

1.  Clone this repository
    ```bash
    git clone <repository-url>
    cd twilio-cr-ai
    ```

2.  Install the required dependencies:
    ```bash
    pip install -r requirements.txt
    ```

3.  Configure your environment variables:
    ```bash
    cp .env.example .env
    ```
    
    Edit the `.env` file with your credentials:
    ```env
    # Required - OpenAI API Configuration
    OPENAI_API_KEY=your_openai_api_key_here
    
    # Required - Twilio Configuration
    TWILIO_ACCOUNT_SID=your_twilio_account_sid
    TWILIO_AUTH_TOKEN=your_twilio_auth_token
    TWILIO_PHONE_NUMBER=+1234567890
    
    # Optional - Google Gemini API Configuration
    GEMINI_API_KEY=your_gemini_api_key_here
    
    # Required - Ngrok Configuration (without https://)
    NGROK_URL=your-ngrok-url.ngrok.io
    ```

## Usage

### Setup and Start the Server

1.  Start ngrok to expose your local server:
    ```bash
    ngrok http 8080
    ```

2.  Update the `NGROK_URL` in your `.env` file with the new URL from ngrok (without https://)
    ```env
    NGROK_URL=abc123.ngrok.io
    ```
    
3.  Run the application:
    ```bash
    python main.py
    ```

4.  Configure your Twilio phone number webhook:
    - Go to [Twilio Console > Phone Numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming)
    - Select your phone number
    - Set the webhook URL to: `https://your-ngrok-url.ngrok.io/twiml`

### Using the Web Interface

1.  Open your browser and go to: `http://localhost:8080`

2.  **Configure AI Settings:**
    - Select your preferred AI model (OpenAI GPT-4o, GPT-4, or Gemini)
    - Choose a personality type (Helpful, Friendly, Professional, Creative, etc.)
    - Optionally, add a custom system prompt
    - Click "Save Configuration"

3.  **Make Outbound Calls:**
    - Enter the recipient's name and phone number (include country code)
    - Click "Call Me Now"
    - The system will call the specified number with your configured AI assistant

4.  **Receive Inbound Calls:**
    - Users can call your Twilio number directly
    - They'll interact with the AI using your current configuration settings
    
### Count Calls to Your Twilio Number

Use the helper script to count calls to/from your configured Twilio number in a time range.

Requirements: `.env` must have `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER`.

Examples:

```bash
# All calls (inbound + outbound) during January (UTC) — default
python scripts/call_count.py --start 2025-01-01 --end 2025-01-31

# Inbound only or outbound only
python scripts/call_count.py --start 2025-01-01 --end 2025-01-31 --inbound
python scripts/call_count.py --start 2025-01-01 --end 2025-01-31 --outbound

# Specific window using ISO-8601 with Z/offset
python scripts/call_count.py --start 2025-01-01T00:00 --end 2025-01-01T12:00Z

# Include a per-status breakdown
python scripts/call_count.py --start 2025-01-01 --end 2025-01-31 --status-breakdown
```

Notes:
- Dates are interpreted as UTC unless you include a timezone offset or `Z`.
- Default counts both inbound and outbound.
- `--inbound` counts only calls where `to` equals your Twilio number.
- `--outbound` counts only calls where `from` equals your Twilio number.

## How It Works

### Inbound Calls
1.  User calls your Twilio number
2.  Twilio requests TwiML from `/twiml` endpoint
3.  TwiML instructs Twilio to connect to WebSocket at `/ws`
4.  Voice input is sent to the server via WebSocket
5.  Server sends input to the configured AI model (OpenAI/Gemini)
6.  AI response is sent back to Twilio and converted to speech
7.  Conversation continues until call ends

### Outbound Calls
1.  User enters name and phone number on web interface
2.  Server uses Twilio API to initiate call
3.  When recipient answers, they hear a personalized greeting
4.  Same WebSocket flow as inbound calls for conversation

### AI Model Selection
- **OpenAI Models**: GPT-4o Mini (default), GPT-4o, GPT-4
- **Google Gemini**: Gemini Pro, Gemini Flash
- Models are switched dynamically based on web configuration

## Project Structure

```
twilio-cr-ai/
├── main.py              # Main FastAPI application with AI model integration
├── templates/
│   └── index.html       # Web configuration interface
├── static/
│   ├── style.css        # Web interface styling
│   └── script.js        # Frontend JavaScript for configuration and calls
├── requirements.txt     # Python dependencies
├── .env                 # Environment variables (create from .env.example)
├── .env.example         # Template for environment variables
└── README.md           # This file
```

## Available Personality Types

- **Helpful**: A standard helpful assistant
- **Friendly**: Enthusiastic and supportive companion  
- **Professional**: Clear, structured, authoritative advisor
- **Creative**: Imaginative thinker who explores possibilities
- **Witty**: Conversationalist with humor and clever wordplay
- **Empathetic**: Understanding listener with emotional support
- **Technical**: Expert at explaining complex concepts clearly
- **Casual**: Relaxed, informal, easy-to-talk-to friend

## Troubleshooting

### Common Issues

1. **"Twilio configuration incomplete" error**
   - Ensure all Twilio environment variables are set in `.env`
   - Check that your Twilio credentials are correct

2. **AI model not working**
   - Verify API keys are correctly set
   - For Gemini models, ensure `GEMINI_API_KEY` is configured

3. **Calls not connecting**
   - Confirm ngrok is running and URL is updated in `.env`
   - Check Twilio webhook configuration
   - Ensure phone numbers include country codes

4. **Web interface not loading**
   - Confirm server is running on port 8080
   - Check that `templates/` and `static/` directories exist

### Getting Help

- Check [Twilio Documentation](https://www.twilio.com/docs) for Twilio-specific issues
- Visit [OpenAI Documentation](https://platform.openai.com/docs) for API-related questions
- Review [Gemini API Documentation](https://ai.google.dev/docs) for Gemini model issues
