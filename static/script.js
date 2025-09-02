document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('configForm');
    const callForm = document.getElementById('callForm');
    const statusElement = document.getElementById('status');
    const currentModelElement = document.getElementById('currentModel');
    const currentPersonalityElement = document.getElementById('currentPersonality');
    const callStatusElement = document.getElementById('callStatus');
    const callButton = document.getElementById('callButton');
    const phoneInput = document.getElementById('phoneNumber');
    const ttsProviderSelect = document.getElementById('ttsProvider');
    const voiceIdSelect = document.getElementById('voiceId');
    const elevenLabsOptions = document.getElementById('elevenLabsOptions');

    // Voice options for different TTS providers
    const voiceOptions = {
        'Google': [
            { id: 'en-US-Wavenet-D', name: 'English (US) - Male (Wavenet-D)' },
            { id: 'en-US-Wavenet-F', name: 'English (US) - Female (Wavenet-F)' },
            { id: 'en-US-Wavenet-A', name: 'English (US) - Male (Wavenet-A)' },
            { id: 'en-US-Wavenet-C', name: 'English (US) - Female (Wavenet-C)' },
            { id: 'en-GB-Wavenet-A', name: 'English (UK) - Female (Wavenet-A)' },
            { id: 'en-GB-Wavenet-B', name: 'English (UK) - Male (Wavenet-B)' }
        ],
        'amazon': [
            { id: 'Ruth-Generative', name: 'Ruth - Female (US)' },
            { id: 'Matthew', name: 'Matthew - Male (US)' },
            { id: 'Kimberly', name: 'Kimberly - Female (US)' },
            { id: 'Justin', name: 'Justin - Male (US)' },
            { id: 'Amy', name: 'Amy - Female (UK)' },
            { id: 'Brian', name: 'Brian - Male (UK)' }
        ],
        'ElevenLabs': [
            { id: 'SaqYcK3ZpDKBAImA8AdW', name: 'Jane Doe - Female (US)' },
            { id: 'UgBBYS2sOqTuMpoF3BR0', name: 'Mark - Male (US)' },
            { id: 'OYTbf65OHHFELVut7v2H', name: 'Hope - Female (US)' },
            { id: 'EkK5I93UQWFDigLMpZcX', name: 'James - Male (US)' },
            { id: 'ZF6FPAbjXT4488VcRRnw', name: 'Amelia - Female (UK)' },
            { id: 'G17SuINrv2H9FC6nvetn', name: 'Christopher - Male (UK)' }
        ]
    };

    // Load current configuration on page load
    loadCurrentConfig();

    // Add phone number masking on input
    let originalPhoneNumber = '';
    phoneInput.addEventListener('input', function(e) {
        const cursorPosition = e.target.selectionStart;
        const inputValue = e.target.value;
        
        // If user is deleting or the input is shorter, update original
        if (inputValue.length <= originalPhoneNumber.length) {
            originalPhoneNumber = inputValue;
        } else {
            // User is adding characters, add to original
            const newChars = inputValue.slice(originalPhoneNumber.length);
            originalPhoneNumber += newChars.replace(/\*/g, ''); // Remove any asterisks
        }
        
        // Show masked version if more than 6 characters
        if (originalPhoneNumber.length > 6) {
            const masked = maskPhoneNumber(originalPhoneNumber);
            if (e.target.value !== masked) {
                e.target.value = masked;
                // Try to maintain cursor position
                e.target.setSelectionRange(cursorPosition, cursorPosition);
            }
        }
    });

    // Store original number for form submission
    phoneInput.addEventListener('focus', function() {
        if (originalPhoneNumber && originalPhoneNumber.length > 6) {
            this.value = originalPhoneNumber;
        }
    });

    phoneInput.addEventListener('blur', function() {
        if (originalPhoneNumber && originalPhoneNumber.length > 6) {
            this.value = maskPhoneNumber(originalPhoneNumber);
        }
    });

    // Handle TTS provider selection
    ttsProviderSelect.addEventListener('change', function() {
        const selectedProvider = this.value;
        updateVoiceOptions(selectedProvider);
        
        // Show/hide ElevenLabs options
        if (selectedProvider === 'ElevenLabs') {
            elevenLabsOptions.style.display = 'block';
        } else {
            elevenLabsOptions.style.display = 'none';
        }
    });

    // Update voice selection based on TTS provider
    function updateVoiceOptions(provider) {
        const voiceSelect = voiceIdSelect;
        const voiceHelp = document.getElementById('voiceHelp');
        
        // Clear existing options
        voiceSelect.innerHTML = '<option value="">Default Voice</option>';
        
        if (provider && provider !== 'default' && voiceOptions[provider]) {
            voiceOptions[provider].forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.id;
                option.textContent = voice.name;
                voiceSelect.appendChild(option);
            });
            voiceHelp.textContent = `Select a ${provider} voice`;
        } else {
            voiceHelp.textContent = 'Select a TTS provider first to see available voices';
        }
    }

    // Handle range slider updates for ElevenLabs
    ['speed', 'stability', 'similarity'].forEach(param => {
        const slider = document.getElementById(param);
        const display = document.getElementById(param + 'Value');
        
        slider.addEventListener('input', function() {
            display.textContent = this.value;
        });
    });

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(form);
        const config = {
            aiModel: formData.get('aiModel'),
            personality: formData.get('personality'),
            customPrompt: formData.get('customPrompt'),
            ttsProvider: formData.get('ttsProvider'),
            voiceId: formData.get('voiceId'),
            elevenLabsModel: formData.get('elevenLabsModel'),
            speed: formData.get('speed'),
            stability: formData.get('stability'),
            similarity: formData.get('similarity')
        };

        // Update status
        updateStatus('Saving configuration...', 'status-saving');

        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(config)
            });

            if (response.ok) {
                const result = await response.json();
                updateStatus('Configuration saved successfully!', 'status-saved');
                updateCurrentConfig(config);
            } else {
                throw new Error('Failed to save configuration');
            }
        } catch (error) {
            console.error('Error saving configuration:', error);
            updateStatus('Error saving configuration', 'status-error');
        }
    });

    async function loadCurrentConfig() {
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                const config = await response.json();
                updateCurrentConfig(config);
                updateStatus('Configuration loaded', 'status-ready');
                
                // Pre-fill form with current config
                if (config.aiModel) {
                    document.getElementById('aiModel').value = config.aiModel;
                }
                if (config.personality) {
                    document.getElementById('personality').value = config.personality;
                }
                if (config.customPrompt) {
                    document.getElementById('customPrompt').value = config.customPrompt;
                }
                if (config.ttsProvider) {
                    document.getElementById('ttsProvider').value = config.ttsProvider;
                    updateVoiceOptions(config.ttsProvider);
                    
                    if (config.ttsProvider === 'ElevenLabs') {
                        elevenLabsOptions.style.display = 'block';
                        if (config.elevenLabsModel) document.getElementById('elevenLabsModel').value = config.elevenLabsModel;
                        if (config.speed) {
                            document.getElementById('speed').value = config.speed;
                            document.getElementById('speedValue').textContent = config.speed;
                        }
                        if (config.stability) {
                            document.getElementById('stability').value = config.stability;
                            document.getElementById('stabilityValue').textContent = config.stability;
                        }
                        if (config.similarity) {
                            document.getElementById('similarity').value = config.similarity;
                            document.getElementById('similarityValue').textContent = config.similarity;
                        }
                    }
                }
                if (config.voiceId) {
                    document.getElementById('voiceId').value = config.voiceId;
                }
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
            updateStatus('Ready to configure', 'status-ready');
        }
    }

    function updateCurrentConfig(config) {
        currentModelElement.textContent = config.aiModel || 'Not set';
        currentPersonalityElement.textContent = config.personality || 'Not set';
    }

    function updateStatus(message, className) {
        statusElement.textContent = message;
        statusElement.className = className;
    }

    // Handle call form submission
    callForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(callForm);
        const callData = {
            name: formData.get('userName'),
            phoneNumber: originalPhoneNumber || formData.get('phoneNumber') // Use original unmasked number
        };

        // Validate phone number format
        if (!callData.phoneNumber.startsWith('+')) {
            updateCallStatus('Please include country code (e.g., +1 for US)', 'error');
            return;
        }

        // Update UI
        callButton.disabled = true;
        updateCallStatus('Initiating call...', 'calling');

        try {
            const response = await fetch('/api/call', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(callData)
            });

            const result = await response.json();

            if (response.ok) {
                const maskedNumber = maskPhoneNumber(callData.phoneNumber);
                updateCallStatus(`Call initiated! You should receive a call shortly at ${maskedNumber}`, 'success');
            } else {
                throw new Error(result.detail || 'Failed to initiate call');
            }
        } catch (error) {
            console.error('Error initiating call:', error);
            updateCallStatus(`Error: ${error.message}`, 'error');
        } finally {
            callButton.disabled = false;
        }
    });

    function updateCallStatus(message, className) {
        callStatusElement.textContent = message;
        callStatusElement.className = `call-status ${className}`;
    }

    function maskPhoneNumber(phoneNumber) {
        if (!phoneNumber || phoneNumber.length < 6) return phoneNumber;
        
        // Show first 3 characters and last 3 characters
        const start = phoneNumber.substring(0, 3);
        const end = phoneNumber.substring(phoneNumber.length - 3);
        const middle = '*'.repeat(Math.max(0, phoneNumber.length - 6));
        
        return start + middle + end;
    }
});