const API_URL = 'https://contract-analysis-api-production-226b.up.railway.app';

let conversationHistory = [];
let conversationId = null;  // Track conversation for context
let userDocuments = [];

// ============ AUTH FUNCTIONS ============

function showLogin() {
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('signup-section').classList.add('hidden');
    document.getElementById('auth-message').textContent = '';
}

function showSignup() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('signup-section').classList.remove('hidden');
    document.getElementById('auth-message').textContent = '';
}

function showMessage(text, isError = false) {
    const messageDiv = document.getElementById('auth-message');
    messageDiv.textContent = text;
    messageDiv.className = isError ? 'message error' : 'message success';
}

async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.access_token);
            localStorage.setItem('user_email', data.email);
            
            showMessage('Login successful!');
            
            setTimeout(() => {
                document.getElementById('auth-screen').classList.add('hidden');
                document.getElementById('chat-screen').classList.remove('hidden');
                initChat();
            }, 1000);
        } else {
            showMessage(data.detail || 'Login failed', true);
        }
    } catch (error) {
        showMessage('Network error. Please try again.', true);
    }
}

async function handleSignup(event) {
    event.preventDefault();
    
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    
    try {
        const response = await fetch(`${API_URL}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage('Account created! Please login.');
            
            setTimeout(() => {
                showLogin();
                document.getElementById('login-email').value = email;
            }, 1500);
        } else {
            showMessage(data.detail || 'Signup failed', true);
        }
    } catch (error) {
        showMessage('Network error. Please try again.', true);
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.clear();
        conversationHistory = [];
        conversationId = null;
        userDocuments = [];
        location.reload();
    }
}

// ============ CHAT INITIALIZATION ============

function initChat() {
    const email = localStorage.getItem('user_email');
    document.getElementById('user-email-display').textContent = email;

    generateUserAvatar(email);

    loadUserDocuments();

    const input = document.getElementById('message-input');
    input.addEventListener('input', () => {
        document.getElementById('send-btn').disabled = !input.value.trim();
    });
}


// ============ SETTINGS SIDEBAR ============

function toggleSettings() {
    const sidebar = document.getElementById('settings-sidebar');
    const overlay = document.getElementById('settings-overlay');
    
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
    
    if (sidebar.classList.contains('open')) {
        loadUserDocuments();
    }
}

// ============ DOCUMENT MANAGEMENT ============

async function loadUserDocuments() {
    const token = localStorage.getItem('token');
    const listDiv = document.getElementById('documents-list');
    
    listDiv.innerHTML = '<p class="loading-text">Loading...</p>';
    
    try {
        const response = await fetch(`${API_URL}/my-contracts`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            userDocuments = data.contracts || [];
            
            if (data.total === 0) {
                listDiv.innerHTML = '<p class="loading-text">No documents yet. Upload one to get started!</p>';
            } else {
                listDiv.innerHTML = data.contracts.map(doc => `
                   <div class="document-item">
                        <span class="document-name" title="${doc.filename}">
                            <img src="images/document.png" class="doc-icon" alt="Document">
                            ${doc.filename}
                        </span>

                        <button class="delete-doc-btn" 
                                onclick="deleteDocument(${doc.id}, '${doc.filename.replace(/'/g, "\\'")}')"
                                title="Delete">
                            <img src="images/delete.png" class="delete-icon" alt="Delete">
                        </button>
                    </div>
                `).join('');
            }
        }
    } catch (error) {
        listDiv.innerHTML = '<p class="loading-text">Error loading documents</p>';
    }
}

async function deleteDocument(docId, filename) {
    if (!confirm(`Delete "${filename}"?`)) return;
    
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_URL}/contracts/${docId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            addSystemMessage(`📄 Document "${filename}" deleted`);
            loadUserDocuments();
            
            // Clear conversation if deleted document was being queried
            conversationHistory = [];
            conversationId = null;
        } else {
            alert('Failed to delete document');
        }
    } catch (error) {
        alert('Error deleting document');
    }
}

async function deleteAllDocuments() {
    if (!confirm('Delete ALL documents? This cannot be undone!')) return;
    
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_URL}/my-contracts/all`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            addSystemMessage('🗑️ All documents deleted');
            loadUserDocuments();
            userDocuments = [];
            
            // Clear conversation
            conversationHistory = [];
            conversationId = null;
        } else {
            alert('Failed to delete documents');
        }
    } catch (error) {
        alert('Error deleting documents');
    }
}

// ============ FILE UPLOAD WITH PROGRESS ============

function showUploadProgress(filename) {
    const messagesDiv = document.getElementById('messages');
    
    // Remove welcome message if exists
    const welcome = messagesDiv.querySelector('.welcome-message');
    if (welcome) welcome.remove();
    
    const progressDiv = document.createElement('div');
    progressDiv.className = 'upload-progress-container';
    progressDiv.id = 'upload-progress';
    progressDiv.innerHTML = `
        <div class="upload-progress-header">
            📤 Uploading "${escapeHtml(filename)}"
        </div>
        <div class="upload-progress-status">
            Processing document (extracting text, chunking, generating embeddings)
        </div>
        <div class="upload-progress-bar">
            <div class="upload-progress-fill"></div>
        </div>
        <div class="upload-progress-time">
            This usually takes 10-20 seconds...
        </div>
    `;
    
    messagesDiv.appendChild(progressDiv);
    scrollToBottom();
    
    return progressDiv;
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        addSystemMessage('❌ Please upload a PDF file only', true);
        event.target.value = '';
        return;
    }
    
    const token = localStorage.getItem('token');
    
    // Show progress bar
    const progressElement = showUploadProgress(file.name);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        // Set longer timeout for large files
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout
        
        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Remove progress bar
        if (progressElement) progressElement.remove();
        
        const data = await response.json();
        
        if (response.ok) {
            addSystemMessage(`✅ "${file.name}" uploaded successfully! (${data.num_chunks} chunks processed)`);
            
            // Reload documents
            await loadUserDocuments();
            
            // Clear conversation for new document
            conversationHistory = [];
            conversationId = null;
            addSystemMessage('💬 New conversation started for this document');
        } else {
            addSystemMessage(`❌ Upload failed: ${data.detail}`, true);
        }
    } catch (error) {
        // Remove progress bar
        if (progressElement) progressElement.remove();
        
        if (error.name === 'AbortError') {
            addSystemMessage(`⏱️ Upload is taking longer than expected. The document may still be processing. Check "My Documents" in a moment.`, false);
            // Still try to reload documents after a delay
            setTimeout(() => loadUserDocuments(), 10000);
        } else {
            addSystemMessage('❌ Upload error. Please check your connection and try again.', true);
        }
    }
    
    // Reset file input
    event.target.value = '';
}

// ============ CHAT INTERFACE ============

function addUserMessage(text) {
    const messagesDiv = document.getElementById('messages');
    
    // Remove welcome message if exists
    const welcome = messagesDiv.querySelector('.welcome-message');
    if (welcome) welcome.remove();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-bubble user-message';
    messageDiv.innerHTML = `
        <div class="message-content">${escapeHtml(text)}</div>
        <div class="message-time">${getCurrentTime()}</div>
    `;
    
    messagesDiv.appendChild(messageDiv);
    scrollToBottom();
}

function addAIMessage(text, sources = null) {
    const messagesDiv = document.getElementById('messages');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-bubble ai-message';
    
    // Handle different response formats
    let displayText = text;
    
    // If text is an object or array, extract the actual text
    if (typeof text === 'object') {
        if (Array.isArray(text)) {
            // If it's an array, try to get text from first element
            displayText = text[0]?.text || text[0]?.content || JSON.stringify(text);
        } else if (text.text) {
            displayText = text.text;
        } else if (text.content) {
            displayText = text.content;
        } else {
            displayText = JSON.stringify(text);
        }
    }
    
    let sourcesHTML = '';
    if (sources && sources.length > 0) {
        sourcesHTML = `
            <div class="sources">
                <div class="sources-title">📚 Sources:</div>
                ${sources.map((s, i) => `
                    <div class="source-item">
                        ${i + 1}. Chunk ${s.chunk_index} (Relevance: ${((s.similarity_score || s.hybrid_score || s.rerank_score || 0) * 100).toFixed(0)}%)
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    messageDiv.innerHTML = `
        <div class="message-content">${formatText(displayText)}</div>
        ${sourcesHTML}
        <div class="message-time">${getCurrentTime()}</div>
    `;
    
    messagesDiv.appendChild(messageDiv);
    scrollToBottom();
}

function addSystemMessage(text, isError = false) {
    const messagesDiv = document.getElementById('messages');
    
    // Remove welcome message if exists
    const welcome = messagesDiv.querySelector('.welcome-message');
    if (welcome) welcome.remove();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'file-upload-message';
    if (isError) {
        messageDiv.style.background = '#fee2e2';
        messageDiv.style.color = '#991b1b';
    }
    messageDiv.textContent = text;
    
    messagesDiv.appendChild(messageDiv);
    scrollToBottom();
    
    return messageDiv;
}

function showTypingIndicator() {
    const messagesDiv = document.getElementById('messages');
    
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = '<span></span><span></span><span></span>';
    
    messagesDiv.appendChild(typingDiv);
    scrollToBottom();
}

function hideTypingIndicator() {
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.remove();
}

// ============ SEND MESSAGE (WITH CONVERSATION CONTEXT) ============

async function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();

    if (!message) return;

    input.value = '';
    document.getElementById('send-btn').disabled = true;
    autoResize(input);

    // Display user message
    addUserMessage(message);

    // Add to conversation history
    conversationHistory.push({ role: 'user', content: message });

    showTypingIndicator();

    const token = localStorage.getItem('token');

    let retries = 0;
    const maxRetries = 2;

    while (retries < maxRetries) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

            const response = await fetch(`${API_URL}/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    // NO contract_id needed! Smart agent handles it
                    question: message,
                    conversation_history: conversationHistory.slice(-20), // Last 20 messages
                    conversation_id: conversationId
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const data = await response.json();

            hideTypingIndicator();

            if (response.ok) {
                // Save conversation ID for context
                if (!conversationId && data.conversation_id) {
                    conversationId = data.conversation_id;
                    console.log('📝 Conversation started:', conversationId);
                }

                // Handle different response formats
                let answer = data.answer;
                if (typeof answer === 'object') {
                    if (Array.isArray(answer)) {
                        answer = answer[0]?.text || answer[0]?.content || JSON.stringify(answer);
                    } else {
                        answer = answer.text || answer.content || JSON.stringify(answer);
                    }
                }

                addAIMessage(answer, data.sources);

                // Add to conversation history
                conversationHistory.push({
                    role: 'assistant',
                    content: answer
                });

                return; // Success!

            } else {
                if (retries < maxRetries - 1) {
                    console.log(`Retry ${retries + 1}/${maxRetries}`);
                    retries++;
                    showTypingIndicator(); // Show again for retry
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
                    continue;
                } else {
                    addAIMessage(`❌ Error: ${data.detail || 'Failed to get response'}`, null);
                    return;
                }
            }

        } catch (error) {
            if (error.name === 'AbortError' && retries < maxRetries - 1) {
                console.log(`Timeout, retrying... (${retries + 1}/${maxRetries})`);
                retries++;
                showTypingIndicator(); // Show again for retry
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            } else {
                hideTypingIndicator();
                addAIMessage('❌ Service is waking up. Please try again in a moment.', null);
                console.error('Error:', error);
                return;
            }
        }
    }
}


// ============ UTILITY FUNCTIONS ============

function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

function scrollToBottom() {
    const container = document.querySelector('.chat-container');
    setTimeout(() => {
        container.scrollTop = container.scrollHeight;
    }, 100);
}

function getCurrentTime() {
    return new Date().toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatText(text) {
    // Convert newlines to <br> and preserve formatting
    return escapeHtml(text)
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Bold **text**
}

// ============ INITIALIZATION ============
function generateUserAvatar(email) {
    const firstLetter = email.charAt(0).toUpperCase();

    const avatar = document.querySelector('.avatar');
    const avatarLarge = document.querySelector('.avatar-large');

    const color = stringToColor(email);

    if (avatar) {
        avatar.textContent = firstLetter;
        avatar.style.background = color;
    }

    if (avatarLarge) {
        avatarLarge.textContent = firstLetter;
        avatarLarge.style.background = color;
    }
}

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const h = hash % 360;
    return `hsl(${h}, 65%, 45%)`;
}

window.onload = function() {
    const token = localStorage.getItem('token');
    
    if (token) {
        // Already logged in
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('chat-screen').classList.remove('hidden');
        initChat();
    } else {
        // Show login screen
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('chat-screen').classList.add('hidden');
    }
};