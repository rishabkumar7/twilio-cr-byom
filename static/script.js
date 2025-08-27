document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('configForm');
    const callForm = document.getElementById('callForm');
    const statusElement = document.getElementById('status');
    const currentModelElement = document.getElementById('currentModel');
    const currentPersonalityElement = document.getElementById('currentPersonality');
    const callStatusElement = document.getElementById('callStatus');
    const callButton = document.getElementById('callButton');
    const phoneInput = document.getElementById('phoneNumber');

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

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(form);
        const config = {
            aiModel: formData.get('aiModel'),
            personality: formData.get('personality'),
            customPrompt: formData.get('customPrompt')
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