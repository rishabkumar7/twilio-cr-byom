document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('configForm');
    const callForm = document.getElementById('callForm');
    const statusElement = document.getElementById('status');
    const currentModelElement = document.getElementById('currentModel');
    const currentPersonalityElement = document.getElementById('currentPersonality');
    const callStatusElement = document.getElementById('callStatus');
    const callButton = document.getElementById('callButton');

    // Load current configuration on page load
    loadCurrentConfig();

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
            phoneNumber: formData.get('phoneNumber')
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
                updateCallStatus(`Call initiated! You should receive a call shortly at ${callData.phoneNumber}`, 'success');
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
});