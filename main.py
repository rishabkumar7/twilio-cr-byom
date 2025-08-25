import os
import json
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi import Request
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
import google.generativeai as genai
from twilio.rest import Client

# Load environment variables from .env file
load_dotenv()

# Configuration
PORT = int(os.getenv("PORT", "8080"))
DOMAIN = os.getenv("NGROK_URL")
WS_URL = f"wss://{DOMAIN}/ws"
WELCOME_GREETING = "Hi! I am a voice assistant powered by Twilio and AI. Ask me anything!"

def get_personalized_greeting(call_sid):
    """Get personalized greeting if user data is available"""
    if call_sid in user_info and "name" in user_info[call_sid]:
        name = user_info[call_sid]["name"]
        return f"Hi {name}! I am a voice assistant powered by Twilio and AI. Ask me anything!"
    return WELCOME_GREETING

# Default configuration
DEFAULT_CONFIG = {
    "aiModel": "openai-gpt4o-mini",
    "personality": "helpful",
    "customPrompt": ""
}

# Personality prompts
PERSONALITY_PROMPTS = {
    "helpful": "You are a helpful assistant. This conversation is being translated to voice, so answer carefully. When you respond, please spell out all numbers, for example twenty not 20. Do not include emojis in your responses. Do not include bullet points, asterisks, or special symbols.",
    "friendly": "You are a friendly and warm companion. You're enthusiastic and supportive in your responses. This conversation is being translated to voice, so answer carefully. When you respond, please spell out all numbers, for example twenty not 20. Do not include emojis in your responses.",
    "professional": "You are a professional advisor with expertise across many domains. You provide clear, structured, and authoritative responses. This conversation is being translated to voice, so answer carefully. When you respond, please spell out all numbers, for example twenty not 20. Do not include emojis in your responses.",
    "creative": "You are a creative thinker who approaches problems with imagination and innovation. You like to explore possibilities and think outside the box. This conversation is being translated to voice, so answer carefully. When you respond, please spell out all numbers, for example twenty not 20. Do not include emojis in your responses.",
    "witty": "You are a witty conversationalist with a good sense of humor. You enjoy clever wordplay and light banter while remaining helpful. This conversation is being translated to voice, so answer carefully. When you respond, please spell out all numbers, for example twenty not 20. Do not include emojis in your responses.",
    "empathetic": "You are an empathetic listener who shows understanding and compassion. You're particularly good at emotional support and active listening. This conversation is being translated to voice, so answer carefully. When you respond, please spell out all numbers, for example twenty not 20. Do not include emojis in your responses.",
    "technical": "You are a technical expert who excels at explaining complex concepts clearly. You provide detailed, accurate information with practical examples. This conversation is being translated to voice, so answer carefully. When you respond, please spell out all numbers, for example twenty not 20. Do not include emojis in your responses.",
    "casual": "You are a casual friend who speaks in a relaxed, informal manner. You're laid-back and easy to talk to. This conversation is being translated to voice, so answer carefully. When you respond, please spell out all numbers, for example twenty not 20. Do not include emojis in your responses."
}

# Initialize AI clients
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
if os.getenv("GEMINI_API_KEY"):
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# Initialize Twilio client
twilio_client = Client(os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN"))

# Store active sessions and current configuration
sessions = {}
user_info = {}  # Store user information for outbound calls
current_config = DEFAULT_CONFIG.copy()

# Pydantic models
class ConfigModel(BaseModel):
    aiModel: str
    personality: str
    customPrompt: str = ""

class CallRequest(BaseModel):
    name: str
    phoneNumber: str

# Create FastAPI app
app = FastAPI()

# Mount static files and templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

def get_system_prompt():
    """Get the current system prompt based on configuration"""
    if current_config["customPrompt"]:
        return current_config["customPrompt"]
    return PERSONALITY_PROMPTS.get(current_config["personality"], PERSONALITY_PROMPTS["helpful"])

async def ai_response(messages):
    """Get a response from the configured AI model"""
    try:
        if current_config["aiModel"].startswith("openai"):
            model_map = {
                "openai-gpt4o-mini": "gpt-4o-mini",
                "openai-gpt4o": "gpt-4o",
                "openai-gpt4": "gpt-4"
            }
            model = model_map.get(current_config["aiModel"], "gpt-4o-mini")
            
            completion = openai_client.chat.completions.create(
                model=model,
                messages=messages
            )
            return completion.choices[0].message.content
            
        elif current_config["aiModel"].startswith("gemini"):
            if not os.getenv("GEMINI_API_KEY"):
                raise Exception("Gemini API key not configured")
                
            model_map = {
                "gemini-pro": "gemini-pro",
                "gemini-flash": "gemini-1.5-flash"
            }
            model_name = model_map.get(current_config["aiModel"], "gemini-pro")
            
            model = genai.GenerativeModel(model_name)
            
            # Convert messages to Gemini format
            prompt = ""
            for msg in messages[1:]:  # Skip system message for now
                if msg["role"] == "user":
                    prompt += f"User: {msg['content']}\n"
                elif msg["role"] == "assistant":
                    prompt += f"Assistant: {msg['content']}\n"
            
            # Add system prompt as context
            full_prompt = f"System: {messages[0]['content']}\n\n{prompt}Assistant:"
            
            response = model.generate_content(full_prompt)
            return response.text
            
    except Exception as e:
        print(f"Error with AI response: {e}")
        return "I'm sorry, I'm having trouble processing your request right now."

# Web interface routes
@app.get("/")
async def web_interface(request: Request):
    """Serve the web configuration interface"""
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/config")
async def get_config():
    """Get current configuration"""
    return current_config

@app.post("/api/config")
async def update_config(config: ConfigModel):
    """Update configuration"""
    global current_config
    current_config = config.dict()
    return {"status": "success", "config": current_config}

@app.post("/api/call")
async def make_call(call_request: CallRequest):
    """Initiate an outbound call"""
    try:
        # Validate Twilio configuration
        if not os.getenv("TWILIO_ACCOUNT_SID") or not os.getenv("TWILIO_AUTH_TOKEN") or not os.getenv("TWILIO_PHONE_NUMBER"):
            raise HTTPException(status_code=500, detail="Twilio configuration incomplete. Please check your environment variables.")
        
        # Create the call
        call = twilio_client.calls.create(
            to=call_request.phoneNumber,
            from_=os.getenv("TWILIO_PHONE_NUMBER"),
            url=f"https://{DOMAIN}/twiml",
            method="GET"
        )
        
        # Store user info for personalized greeting
        user_info[call.sid] = {
            "name": call_request.name,
            "phone": call_request.phoneNumber
        }
        
        return {
            "status": "success", 
            "message": f"Call initiated to {call_request.phoneNumber}",
            "call_sid": call.sid
        }
        
    except Exception as e:
        print(f"Error making call: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to initiate call: {str(e)}")

@app.get("/twiml")
async def twiml_endpoint(request: Request):
    """Endpoint that returns TwiML for Twilio to connect to the WebSocket"""
    # Get CallSid from query parameters
    call_sid = request.query_params.get("CallSid")
    greeting = get_personalized_greeting(call_sid) if call_sid else WELCOME_GREETING
    
    print(f"TwiML request for CallSid: {call_sid}")
    
    xml_response = f"""<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Connect>
        <ConversationRelay url="{WS_URL}" welcomeGreeting="{greeting}" />
      </Connect>
    </Response>"""
    
    return Response(content=xml_response, media_type="text/xml")

@app.post("/twiml")
async def twiml_endpoint_post(request: Request):
    """Handle POST requests to /twiml endpoint"""
    return await twiml_endpoint(request)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time communication"""
    await websocket.accept()
    call_sid = None
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message["type"] == "setup":
                call_sid = message["callSid"]
                print(f"Setup for call: {call_sid}")
                websocket.call_sid = call_sid
                system_prompt = get_system_prompt()
                
                # Initialize conversation history
                sessions[call_sid] = [{"role": "system", "content": system_prompt}]
                
                print(f"Using AI model: {current_config['aiModel']}, Personality: {current_config['personality']}")
                
            elif message["type"] == "prompt":
                print(f"Processing prompt: {message['voicePrompt']}")
                conversation = sessions[websocket.call_sid]
                conversation.append({"role": "user", "content": message["voicePrompt"]})
                
                response = await ai_response(conversation)
                conversation.append({"role": "assistant", "content": response})
                
                await websocket.send_text(
                    json.dumps({
                        "type": "text",
                        "token": response,
                        "last": True
                    })
                )
                print(f"Sent response: {response}")
                
            elif message["type"] == "interrupt":
                print("Handling interruption.")
                
            else:
                print(f"Unknown message type received: {message['type']}")
                
    except WebSocketDisconnect:
        print("WebSocket connection closed")
        if call_sid:
            sessions.pop(call_sid, None)
            user_info.pop(call_sid, None)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
    print(f"Server running at http://localhost:{PORT} and {WS_URL}")