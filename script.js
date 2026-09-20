/* =========================================================
   LEPSA AI - COMPLETE ENGINE (PRO MARKET CORE + TTS ENGINE)
   ========================================================= */

let selectedImageData = null;
let chatHistory = [];
let currentConversationId = null;
let currentAppMode = localStorage.getItem("lepsaCurrentAppMode") || "code";

const MODE_SUGGESTIONS = {
    code: [
        { label: "Debug Segmentation Fault / Null Pointer 🐞", prompt: "Debug this error and give the corrected code: " },
        { label: "Create REST API in PHP ⚡", prompt: "Write a clean REST API script in PHP with input validation." },
        { label: "Optimize Python Function Complexity ⏱️", prompt: "How can I optimize this algorithm's time and space complexity?" }
    ],
    business: [
        { label: "Customer Greeting Script 🎙️", prompt: "Create a natural greeting for a business voice assistant." },
        { label: "Handle Pricing Objection 💼", prompt: "How to respond politely when a client says the service is too expensive?" },
        { label: "Lead Capture Pitch 🎯", prompt: "Give a 3-sentence script to collect phone and email from a visitor." }
    ],
    study: [
        { label: "Explain Operating System Deadlock 🧠", prompt: "Explain Deadlock and Banker's Algorithm with a real-life analogy." },
        { label: "Generate 5 Science MCQs 📝", prompt: "Create 5 tricky multiple-choice questions for General Science exam." },
        { label: "Physics Formula Cheat-Sheet ⚡", prompt: "Give the top 5 core formulas in Thermodynamics with unit breakdown." }
    ]
};

// Purana single-blob localStorage history ab use nahi hota —
// har conversation ab server (SQLite) me alag se save hoti hai.
// Sirf "last open conversation" ka pointer yahan rakha jaata hai.

window.addEventListener("DOMContentLoaded", function () {
    // Mode Switcher Initialization
    const savedModeBtn = document.getElementById("modeBtn" + currentAppMode.charAt(0).toUpperCase() + currentAppMode.slice(1));
    if (savedModeBtn) {
        setAppMode(currentAppMode, savedModeBtn);
    } else {
        renderSuggestionChips();
    }

    loadConversationList();

    const lastConvId = localStorage.getItem("lepsaLastConversationId");
    if (lastConvId) {
        loadConversation(parseInt(lastConvId, 10));
    }

    const input = document.getElementById("messageInput");
    if (input) {
        input.addEventListener("input", function () {
            this.style.height = "auto";
            this.style.height = Math.min(this.scrollHeight, 120) + "px";
        });

        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
                this.style.height = "auto";
            }
        });
    }
});

/* =========================================================
   MARKET MODE SWITCHER & CHIPS
   ========================================================= */
window.setAppMode = function (mode, btn) {
    currentAppMode = mode;
    localStorage.setItem("lepsaCurrentAppMode", mode);

    document.querySelectorAll(".mode-switch-group .mode-chip").forEach(el => el.classList.remove("active"));
    if (btn) btn.classList.add("active");

    renderSuggestionChips();
    setLEPSAStatus(mode.toUpperCase() + " Core Active");
};

function renderSuggestionChips() {
    const container = document.getElementById("suggestionChips");
    if (!container) return;

    const list = MODE_SUGGESTIONS[currentAppMode] || MODE_SUGGESTIONS.code;
    container.innerHTML = list.map(item => `
        <button type="button" class="sug-chip" onclick="useSuggestion('${item.prompt.replace(/'/g, "\\'")}')">
            ${item.label}
        </button>
    `).join("");
}

/* =========================================================
   SEND MESSAGE HANDLER (WITH REAL ERROR REPORTING)
   ========================================================= */
async function sendMessage() {
    const input = document.getElementById("messageInput");
    if (!input) return;

    const text = input.value.trim();
    if (!text && !selectedImageData) return;

    const displayText = text || "📷 [Image Attached]";
    addMessage(displayText, "user", false);

    const welcomeMsg = document.getElementById("defaultWelcomeMessage");
    if (welcomeMsg) welcomeMsg.remove();

    const chips = document.getElementById("suggestionChips");
    if (chips) chips.remove();

    input.value = "";
    input.placeholder = "Ask LEPSA anything...";

    chatHistory.push({ role: "user", text: displayText, type: "user" });
    saveHistory();

    const messages = document.getElementById("messages");
    const botDiv = document.createElement("div");
    botDiv.className = "message bot";
    botDiv.innerHTML = '<span class="typing-cursor">●</span>';
    messages.appendChild(botDiv);
    messages.scrollTop = messages.scrollHeight;

    const currentImage = selectedImageData ? selectedImageData.base64 : "";
    const currentMime = selectedImageData ? selectedImageData.mimeType : "";
    selectedImageData = null;
    const previewBox = document.getElementById("imagePreviewContainer");
    if (previewBox) previewBox.style.display = "none";

    try {
        const response = await fetch("chat.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: text,
                history: chatHistory.slice(-4),
                image: currentImage,
                mimeType: currentMime,
                app_mode: currentAppMode,
                conversation_id: currentConversationId
            })
        });

        if (!response.ok || !response.body) {
            const rawResponse = await response.text();
            botDiv.innerHTML = "⚠️ Server Error:<br><pre style='white-space:pre-wrap; font-size:12px; color:#ff7070;'>" + rawResponse.slice(0, 400) + "</pre>";
            messages.scrollTop = messages.scrollHeight;
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = "";
        let liveText = "";
        let finalCleanReply = "";
        let gotMeta = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const events = sseBuffer.split("\n\n");
            sseBuffer = events.pop(); // incomplete event ka last part agle read tak rakho

            for (const evt of events) {
                const line = evt.trim();
                if (!line.startsWith("data:")) continue;
                const payload = line.slice(5).trim();
                if (payload === "[DONE]") continue;

                let obj;
                try { obj = JSON.parse(payload); } catch (e) { continue; }

                if (obj.meta) {
                    gotMeta = true;
                    finalCleanReply = obj.full_reply || liveText;
                    if (obj.conversation_id) {
                        const isNewConversation = currentConversationId !== obj.conversation_id;
                        currentConversationId = obj.conversation_id;
                        localStorage.setItem("lepsaLastConversationId", currentConversationId);
                        if (isNewConversation) loadConversationList();
                    }
                } else if (obj.delta) {
                    liveText += obj.delta;
                    botDiv.innerHTML = formatAIResponse(liveText) + '<span class="typing-cursor">●</span>';
                    messages.scrollTop = messages.scrollHeight;
                }
            }
        }

        const finalText = gotMeta ? finalCleanReply : liveText;
        if (finalText) {
            chatHistory.push({ role: "model", text: finalText, type: "bot" });
            botDiv.innerHTML = formatAIResponse(finalText);
            finalizeMessageElement(botDiv);
        } else {
            botDiv.innerHTML = "⚠️ Server returned empty response.";
        }
    } catch (err) {
        botDiv.innerHTML = "⚠️ Network/Fetch Error: " + err.message;
    }
    messages.scrollTop = messages.scrollHeight;
}


/* =========================================================
   UI DISPLAY & ACTION BAR
   ========================================================= */
function addMessage(text, type, typing) {
    const messages = document.getElementById("messages");
    if (!messages) return;

    const div = document.createElement("div");
    div.className = "message " + type;

    if (type === "user") {
        div.textContent = text;
    } else {
        div.innerHTML = formatAIResponse(text);
        setupCodeCopyButtons(div);

        const actionBar = document.createElement("div");
        actionBar.className = "msg-action-bar";
        actionBar.innerHTML = `
            <button type="button" class="msg-act-icon-btn" onclick="copyBotReply(this)" title="Copy">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button type="button" class="msg-act-icon-btn" onclick="speakBotReply(this)" title="Read aloud">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
            </button>
            <button type="button" class="msg-act-icon-btn" onclick="openMsgMoreMenu(event, this)" title="More options">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle><circle cx="5" cy="12" r="1.5"></circle></svg>
            </button>
        `;
        div.appendChild(actionBar);
    }

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

function finalizeMessageElement(element, callback) {
    setupCodeCopyButtons(element);

    const actionBar = document.createElement("div");
    actionBar.className = "msg-action-bar";
    actionBar.innerHTML = `
        <button type="button" class="msg-act-icon-btn" onclick="copyBotReply(this)" title="Copy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
        <button type="button" class="msg-act-icon-btn" onclick="speakBotReply(this)" title="Read aloud">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
        </button>
        <button type="button" class="msg-act-icon-btn" onclick="openMsgMoreMenu(event, this)" title="More options">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle><circle cx="5" cy="12" r="1.5"></circle></svg>
        </button>
    `;
    element.appendChild(actionBar);
    if (callback) callback();
}

function typeOutResponse(element, fullText, callback) {
    let index = 0;
    const speed = 12;
    const chunkSize = 3;
    const messages = document.getElementById("messages");

    function renderNextChunk() {
        if (index < fullText.length) {
            index += chunkSize;
            const currentSubText = fullText.slice(0, index);
            element.innerHTML = formatAIResponse(currentSubText) + '<span class="typing-cursor">●</span>';
            if (messages) messages.scrollTop = messages.scrollHeight;
            setTimeout(renderNextChunk, speed);
        } else {
            element.innerHTML = formatAIResponse(fullText);
            finalizeMessageElement(element, callback);
        }
    }

    renderNextChunk();
}

/* =========================================================
   TEXT FORMATTING
   ========================================================= */
function formatAIResponse(text) {
    let safe = String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Code blocks ko pehle nikaal ke placeholder rakh do, taaki list/paragraph
    // logic unke andar ke content ko chhede nahi.
    const codeBlocks = [];
    safe = safe.replace(/```(\w+)?\n?([\s\S]*?)```/g, function (match, lang, code) {
        const language = lang || "code";
        codeBlocks.push(`
            <div class="code-wrapper">
                <div class="code-header">
                    <span class="code-lang">${language}</span>
                    <button type="button" class="copy-code-btn" data-code="${encodeURIComponent(code.trim())}">Copy</button>
                </div>
                <pre><code class="language-${language}">${code.trim()}</code></pre>
            </div>
        `);
        return `%%CODEBLOCK${codeBlocks.length - 1}%%`;
    });

    safe = safe.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/\*(.*?)\*/g, "<em>$1</em>");

    const lines = safe.split("\n");
    let html = "";
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed === "") { i++; continue; }

        if (/^%%CODEBLOCK\d+%%$/.test(trimmed)) {
            html += trimmed;
            i++; continue;
        }
        if (/^###\s+/.test(trimmed)) {
            html += "<h4>" + trimmed.replace(/^###\s+/, "") + "</h4>";
            i++; continue;
        }
        if (/^##\s+/.test(trimmed)) {
            html += "<h3>" + trimmed.replace(/^##\s+/, "") + "</h3>";
            i++; continue;
        }
        if (/^#\s+/.test(trimmed)) {
            html += "<h2>" + trimmed.replace(/^#\s+/, "") + "</h2>";
            i++; continue;
        }

        // Numbered list — consecutive "1. ..." lines ek <ol> me
        if (/^\d+[.)]\s+/.test(trimmed)) {
            let items = "";
            while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
                items += "<li>" + lines[i].trim().replace(/^\d+[.)]\s+/, "") + "</li>";
                i++;
            }
            html += "<ol>" + items + "</ol>";
            continue;
        }

        // Bullet list — consecutive "- / • / *" lines ek <ul> me
        if (/^[•\-*]\s+/.test(trimmed)) {
            let items = "";
            while (i < lines.length && /^[•\-*]\s+/.test(lines[i].trim())) {
                items += "<li>" + lines[i].trim().replace(/^[•\-*]\s+/, "") + "</li>";
                i++;
            }
            html += "<ul>" + items + "</ul>";
            continue;
        }

        html += "<p>" + trimmed + "</p>";
        i++;
    }

    html = html.replace(/%%CODEBLOCK(\d+)%%/g, function (m, idx) {
        return codeBlocks[parseInt(idx, 10)];
    });

    return html;
}

function setupCodeCopyButtons(container) {
    container.querySelectorAll(".copy-code-btn").forEach(btn => {
        btn.onclick = function () {
            const rawCode = decodeURIComponent(this.getAttribute("data-code"));
            navigator.clipboard.writeText(rawCode).then(() => {
                const originalText = this.textContent;
                this.textContent = "Copied! ✓";
                setTimeout(() => { this.textContent = originalText; }, 2000);
            });
        };
    });
}

function saveHistory() {
    try {
        localStorage.setItem("geminiChatHistory", JSON.stringify(chatHistory));
    } catch (e) {}
}

window.newChat = function () {
    currentConversationId = null;
    chatHistory = [];
    localStorage.removeItem("lepsaLastConversationId");

    const messages = document.getElementById("messages");
    if (messages) messages.innerHTML = "";

    renderSuggestionChips();

    const sidebar = document.getElementById("mainSidebar");
    const overlay = document.getElementById("sidebarOverlay");
    if (sidebar) sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("open");

    highlightActiveConversation(null);
};

/* =========================================================
   CONVERSATION HISTORY (server-backed, multi-chat)
   ========================================================= */

/* =========================================================
   CUSTOM CONFIRM & TOAST (Chrome ke native popup ki jagah)
   ========================================================= */
function lepsaConfirm(message) {
    return new Promise(function (resolve) {
        const overlay = document.getElementById("lepsaConfirmOverlay");
        const msgEl = document.getElementById("lepsaConfirmMsg");
        const okBtn = document.getElementById("lepsaConfirmOkBtn");
        const cancelBtn = document.getElementById("lepsaConfirmCancelBtn");
        if (!overlay || !msgEl || !okBtn || !cancelBtn) {
            resolve(window.confirm(message)); // fallback agar modal na mile
            return;
        }

        msgEl.textContent = message;
        overlay.style.display = "flex";

        function cleanup(result) {
            overlay.style.display = "none";
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            resolve(result);
        }

        okBtn.onclick = function () { cleanup(true); };
        cancelBtn.onclick = function () { cleanup(false); };
    });
}

window.lepsaToast = function (message, duration) {
    const container = document.getElementById("lepsaToastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "lepsa-toast";
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(function () {
        toast.classList.add("hide");
        setTimeout(function () { toast.remove(); }, 250);
    }, duration || 2200);
};

async function loadConversationList() {
    const listEl = document.getElementById("conversationList");
    if (!listEl) return;

    try {
        const res = await fetch("chat.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "list_conversations" })
        });

        if (!res.ok) {
            listEl.innerHTML = '<div class="conversation-empty-note">Server error (HTTP ' + res.status + ')</div>';
            return;
        }

        const rawText = await res.text();
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            listEl.innerHTML = '<div class="conversation-empty-note">Bad response: ' + rawText.slice(0, 80).replace(/</g, "&lt;") + '</div>';
            return;
        }

        const conversations = data.conversations || [];

        if (conversations.length === 0) {
            listEl.innerHTML = '<div class="conversation-empty-note">Abhi koi chat save nahi hui — pehla message bhejo.</div>';
            return;
        }

        listEl.innerHTML = "";
        conversations.forEach(function (conv) {
            const item = document.createElement("div");
            item.className = "conversation-item" + (conv.id == currentConversationId ? " active" : "");
            item.dataset.convId = conv.id;
            item.onclick = function () { loadConversation(conv.id); };

            const title = document.createElement("span");
            title.className = "conversation-item-title";
            title.textContent = conv.title || "New Chat";

            const delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "conversation-delete-btn";
            delBtn.title = "Delete";
            delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
            delBtn.onclick = function (e) {
                e.stopPropagation();
                deleteConversation(conv.id);
            };

            item.appendChild(title);
            item.appendChild(delBtn);
            listEl.appendChild(item);
        });
    } catch (e) {
        listEl.innerHTML = '<div class="conversation-empty-note">Chats load nahi ho payi: ' + (e.message || e).toString().slice(0, 80) + '</div>';
    }
}

async function loadConversation(convId) {
    try {
        const res = await fetch("chat.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "get_conversation", conversation_id: convId })
        });
        const data = await res.json();
        const msgs = data.messages || [];

        if (msgs.length === 0 && !data.success) return;

        currentConversationId = convId;
        localStorage.setItem("lepsaLastConversationId", convId);

        const messages = document.getElementById("messages");
        if (messages) messages.innerHTML = "";
        chatHistory = [];

        msgs.forEach(function (m) {
            const type = m.role === "assistant" ? "bot" : "user";
            addMessage(m.content, type, false);
            chatHistory.push({ role: m.role === "assistant" ? "model" : "user", text: m.content, type: type });
        });

        highlightActiveConversation(convId);

        const sidebar = document.getElementById("mainSidebar");
        const overlay = document.getElementById("sidebarOverlay");
        if (sidebar) sidebar.classList.remove("open");
        if (overlay) overlay.classList.remove("open");
    } catch (e) {}
}

async function deleteConversation(convId) {
    const ok = await lepsaConfirm("Ye chat delete kar du?");
    if (!ok) return;

    try {
        await fetch("chat.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete_conversation", conversation_id: convId })
        });
    } catch (e) {}

    if (currentConversationId == convId) {
        newChat();
    }
    loadConversationList();
}

function highlightActiveConversation(convId) {
    document.querySelectorAll(".conversation-item").forEach(function (el) {
        el.classList.toggle("active", el.dataset.convId == convId);
    });
}

/* =========================================================
   INLINE INPUT MIC (KEYBOARD REPLACEMENT)
   ========================================================= */
let dictationRecognizer = null;
let isDictating = false;

window.startVoice = function () {
    const input = document.getElementById("messageInput");
    if (!input) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        lepsaToast("Chrome browser me voice mic use karein.");
        return;
    }

    if (isDictating && dictationRecognizer) {
        dictationRecognizer.stop();
        return;
    }

    dictationRecognizer = new SpeechRecognition();
    dictationRecognizer.lang = "hi-IN";
    dictationRecognizer.continuous = false;
    dictationRecognizer.interimResults = false;

    dictationRecognizer.onstart = function () {
        isDictating = true;
    };

    dictationRecognizer.onresult = function (event) {
        let text = "";
        for (let i = 0; i < event.results.length; i++) {
            text += event.results[i][0].transcript + " ";
        }
        text = text.trim();
        if (text) {
            input.value = text;
            input.dispatchEvent(new Event("input", { bubbles: true }));
        }
    };

    dictationRecognizer.onerror = function () {
        isDictating = false;
    };

    dictationRecognizer.onend = function () {
        isDictating = false;
    };

    try { dictationRecognizer.start(); } catch (e) {}
};

function setLEPSAStatus(text) {
    const status = document.querySelector(".status");
    if (status) status.textContent = "● " + text;
}

/* =========================================================
   LIVE VOICE ENGINE (FULL-SENTENCE STT & DISPATCH)
   ========================================================= */
let lepsaVoiceActive = false;
let lepsaRecognizer = null;
let isVoiceSending = false;
let voiceMuted = false;
let bargeInRecognizer = null;

window.toggleLEPSALive = function () { openVoiceMode(); };

window.openVoiceMode = function () {
    const modal = document.getElementById("lepsaVoiceModal");
    if (modal) modal.style.display = "flex";
    voiceMuted = false;
    const muteBtn = document.getElementById("voiceMuteBtn");
    if (muteBtn) muteBtn.classList.remove("muted");
    updateVoiceModalStatus("Listening...", "Boliye, sun raha hu...");
    startLEPSAVoice();
};

window.closeVoiceMode = function () {
    const modal = document.getElementById("lepsaVoiceModal");
    if (modal) modal.style.display = "none";
    stopLEPSAVoice();
};

function updateVoiceModalStatus(status, text) {
    const statusLabel = document.getElementById("voiceStatusText");
    const textLabel = document.getElementById("voiceLiveText");
    const orb = document.getElementById("modalVoiceOrb");

    if (statusLabel) statusLabel.textContent = (status === "Speaking...") ? "Speaking... (tap to stop)" : status;
    if (textLabel && text) textLabel.textContent = text;
    if (orb) {
        if (status === "Listening...") {
            orb.classList.add("listening");
            orb.classList.remove("speaking");
        } else if (status === "Speaking...") {
            orb.classList.add("speaking");
            orb.classList.remove("listening");
        } else {
            orb.classList.remove("listening");
            orb.classList.remove("speaking");
        }
    }
}

function startLEPSAVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    stopCurrentAudio();
    lepsaVoiceActive = true;
    isVoiceSending = false;
    setLEPSAStatus("Listening...");

    if (lepsaRecognizer) {
        try {
            lepsaRecognizer.onend = null;
            lepsaRecognizer.onerror = null;
            lepsaRecognizer.abort();
        } catch (e) {}
    }

    lepsaRecognizer = new SpeechRecognition();
    lepsaRecognizer.lang = "hi-IN";
    lepsaRecognizer.continuous = false;
    lepsaRecognizer.interimResults = false;

    let fullCollectedSentence = "";

    lepsaRecognizer.onstart = function () {
        updateVoiceModalStatus("Listening...", "Boliye, sun raha hu...");
    };

    lepsaRecognizer.onresult = function (event) {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) {
            if (event.results[i] && event.results[i][0]) {
                transcript += event.results[i][0].transcript + " ";
            }
        }
        fullCollectedSentence = transcript.trim();
    };

    lepsaRecognizer.onerror = function (event) {
        if (event.error === "no-speech" && lepsaVoiceActive && !isVoiceSending) {
            setTimeout(() => {
                if (lepsaVoiceActive && !isVoiceSending) {
                    try { lepsaRecognizer.start(); } catch (e) {}
                }
            }, 600);
        }
    };

    lepsaRecognizer.onend = function () {
        if (!lepsaVoiceActive || isVoiceSending) return;

        if (fullCollectedSentence && fullCollectedSentence.length > 1) {
            const promptText = fullCollectedSentence;
            fullCollectedSentence = "";
            executeVoicePrompt(promptText);
        } else if (lepsaVoiceActive) {
            setTimeout(() => {
                if (lepsaVoiceActive && !isVoiceSending) {
                    try { lepsaRecognizer.start(); } catch (e) {}
                }
            }, 400);
        }
    };

    try {
        lepsaRecognizer.start();
    } catch (e) {}
}

async function executeVoicePrompt(text) {
    if (!text.trim() || isVoiceSending) return;
    isVoiceSending = true;

    if (lepsaRecognizer) {
        try {
            lepsaRecognizer.onend = null;
            lepsaRecognizer.abort();
        } catch (e) {}
    }

    addMessage(text, "user", false);
    updateVoiceModalStatus("Thinking...", "Aapne kaha: " + text);

    chatHistory.push({ role: "user", text: text, type: "user" });
    saveHistory();
    setLEPSAStatus("Thinking...");

    try {
        const response = await fetch("chat.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: text,
                history: chatHistory.slice(-4),
                mode: "voice",
                app_mode: currentAppMode,
                conversation_id: currentConversationId
            })
        });

        const data = await response.json();
        const reply = data.reply || "Koi response nahi mila.";

        if (data.conversation_id) {
            const isNewConversation = currentConversationId !== data.conversation_id;
            currentConversationId = data.conversation_id;
            localStorage.setItem("lepsaLastConversationId", currentConversationId);
            if (isNewConversation) loadConversationList();
        }

        addMessage(reply, "bot", false);
        chatHistory.push({ role: "model", text: reply, type: "bot" });

        updateVoiceModalStatus("Speaking...", reply);
        speakNaturalVoice(reply);

    } catch (err) {
        addMessage("Server connection error.", "bot", false);
        setLEPSAStatus("Online");
        isVoiceSending = false;

        const modal = document.getElementById("lepsaVoiceModal");
        if (modal && modal.style.display === "flex") {
            setTimeout(startLEPSAVoice, 500);
        }
    }
}

function stopLEPSAVoice() {
    lepsaVoiceActive = false;
    isVoiceSending = false;
    stopBargeInListener();
    stopCurrentAudio();
    if (lepsaRecognizer) {
        try {
            lepsaRecognizer.onend = null;
            lepsaRecognizer.onerror = null;
            lepsaRecognizer.abort();
        } catch (e) {}
        lepsaRecognizer = null;
    }
    setLEPSAStatus("Online");
}

/* =========================================================
   BARGE-IN: agar AI bol raha ho aur user bolna shuru kare,
   turant TTS rok kar sunna shuru kar do (Gemini Voice mode jaisa)
   ========================================================= */
function startBargeInListener() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition || voiceMuted) return;

    stopBargeInListener();

    bargeInRecognizer = new SpeechRecognition();
    bargeInRecognizer.lang = "hi-IN";
    bargeInRecognizer.continuous = true;
    bargeInRecognizer.interimResults = true;

    bargeInRecognizer.onresult = function (event) {
        // Koi bhi speech detect hote hi (interim ho ya final) — interrupt karo
        const heardSomething = event.results && event.results.length > 0 &&
            event.results[event.results.length - 1][0].transcript.trim().length > 0;

        if (heardSomething && currentAudio && !currentAudio.paused) {
            stopBargeInListener();
            stopCurrentAudio();
            const orb = document.getElementById("modalVoiceOrb");
            if (orb) {
                orb.classList.remove("speaking");
                orb.classList.add("listening");
            }
            updateVoiceModalStatus("Listening...", "Suna, boliye...");
            setLEPSAStatus("Listening...");
            if (lepsaVoiceActive) startLEPSAVoice();
        }
    };

    bargeInRecognizer.onerror = function () {};

    bargeInRecognizer.onend = function () {
        // Browser continuous mode kabhi-kabhi khud ruk jaata hai — jab tak AI bol raha hai, restart karte raho
        if (lepsaVoiceActive && currentAudio && !currentAudio.paused && !voiceMuted) {
            try { bargeInRecognizer.start(); } catch (e) {}
        }
    };

    try { bargeInRecognizer.start(); } catch (e) {}
}

function stopBargeInListener() {
    if (bargeInRecognizer) {
        try {
            bargeInRecognizer.onend = null;
            bargeInRecognizer.onresult = null;
            bargeInRecognizer.onerror = null;
            bargeInRecognizer.abort();
        } catch (e) {}
        bargeInRecognizer = null;
    }
}

window.tapVoiceInterrupt = function () {
    // Ye sirf tab kaam karta hai jab AI bol raha ho — direct tap (user
    // gesture) hone ki wajah se yahan mic start karna Android par safe hai.
    if (currentAudio && !currentAudio.paused) {
        stopCurrentAudio();
        const orb = document.getElementById("modalVoiceOrb");
        if (orb) {
            orb.classList.remove("speaking");
            orb.classList.add("listening");
        }
        updateVoiceModalStatus("Listening...", "Boliye...");
        setLEPSAStatus("Listening...");
        if (lepsaVoiceActive && !voiceMuted) startLEPSAVoice();
    }
};

window.toggleVoiceMute = function () {
    voiceMuted = !voiceMuted;
    const btn = document.getElementById("voiceMuteBtn");
    if (btn) btn.classList.toggle("muted", voiceMuted);

    if (voiceMuted) {
        stopBargeInListener();
        if (lepsaRecognizer) {
            try { lepsaRecognizer.onend = null; lepsaRecognizer.abort(); } catch (e) {}
        }
        updateVoiceModalStatus("Muted", "Mic band hai — tap karke wapas on karo");
    } else if (lepsaVoiceActive) {
        if (currentAudio && !currentAudio.paused) {
            startBargeInListener();
        } else {
            startLEPSAVoice();
        }
    }
};

window.triggerVoiceCamera = function () {
    closeVoiceMode();
    setTimeout(() => {
        const input = document.getElementById("cameraInput");
        if (input) input.click();
    }, 300);
};

window.triggerVoiceUpload = function () {
    closeVoiceMode();
    setTimeout(() => {
        const input = document.getElementById("galleryInput");
        if (input) input.click();
    }, 300);
};

/* =========================================================
   TTS SPEECH ENGINE (ELEVENLABS + FALLBACKS)
   ========================================================= */
let currentAudio = null;

function onSpeechFinished() {
    stopBargeInListener();
    stopCurrentAudio();
    const orb = document.getElementById("modalVoiceOrb");
    if (orb) {
        orb.classList.remove("speaking");
        if (lepsaVoiceActive) {
            orb.classList.add("listening");
        }
    }
    setLEPSAStatus("Online");

    if (lepsaVoiceActive && !isVoiceSending) {
        setTimeout(() => {
            if (lepsaVoiceActive && !isVoiceSending) {
                try { startLEPSAVoice(); } catch (e) {}
            }
        }, 300);
    }
}

async function speakNaturalVoice(text) {
    stopCurrentAudio();

    let cleanText = text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/[*#_~`>•-]/g, '')
        .trim();

    if (!cleanText) {
        onSpeechFinished();
        return;
    }

    const orb = document.getElementById("modalVoiceOrb");
    if (orb) {
        orb.classList.remove("listening");
        orb.classList.add("speaking");
    }
    // Note: mic yahan automatically start NAHI karte — Android Chrome me bina
    // tap ke SpeechRecognition start karne se Google ka apna mic overlay khul
    // jaata hai jo khud hi playback ko interrupt kar deta hai. Iski jagah tap
    // karke interrupt karo (tapVoiceInterrupt) — wo reliable hai.

    try {
        const res = await fetch("chat.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "tts",
                text: cleanText.slice(0, 250)
            })
        });

        const data = await res.json();

        if (data.success && data.audio) {
            const audioSrc = `data:${data.mimeType || 'audio/mpeg'};base64,${data.audio}`;
            currentAudio = new Audio(audioSrc);

            currentAudio.onended = function () {
                onSpeechFinished();
            };

            currentAudio.onerror = function (e) {
                console.error("Audio playback failed, switching to fallback:", e);
                fallbackBrowserTTS(cleanText);
            };

            try {
                await currentAudio.play();
            } catch (playError) {
                console.warn("Autoplay block issue, using fallback:", playError);
                fallbackBrowserTTS(cleanText);
            }
        } else {
            console.error("TTS Server Error:", data.error || "No audio returned");
            fallbackBrowserTTS(cleanText);
        }
    } catch (err) {
        console.error("Fetch TTS request failed:", err);
        fallbackBrowserTTS(cleanText);
    }
}

function fallbackBrowserTTS(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "hi-IN";
        utterance.onend = onSpeechFinished;
        utterance.onerror = onSpeechFinished;
        window.speechSynthesis.speak(utterance);
    } else {
        onSpeechFinished();
    }
}

function stopCurrentAudio() {
    if (currentAudio) {
        try {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        } catch (e) {}
        currentAudio = null;
    }
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
}

/* =========================================================
   APP UI CONTROLS & EVENT LISTENERS
   ========================================================= */
document.addEventListener("DOMContentLoaded", function () {
    const input = document.getElementById("messageInput");
    const orb = document.getElementById("actionOrbIcon");
    const send = document.getElementById("actionSendIcon");

    if (input) {
        input.addEventListener("input", function () {
            if (this.value.trim().length > 0) {
                if (orb) orb.style.display = "none";
                if (send) send.style.display = "block";
            } else {
                if (orb) orb.style.display = "flex";
                if (send) send.style.display = "none";
            }
        });
    }
});

function handleMainAction() {
    const input = document.getElementById("messageInput");
    const hasText = input && input.value.trim().length > 0;
    const hasImage = !!selectedImageData;

    if (hasText || hasImage) {
        sendMessage();
        const orb = document.getElementById("actionOrbIcon");
        const send = document.getElementById("actionSendIcon");
        if (orb) orb.style.display = "flex";
        if (send) send.style.display = "none";
    } else {
        toggleLEPSALive();
    }
}

window.useSuggestion = function (text) {
    const input = document.getElementById("messageInput");
    if (input) {
        input.value = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        sendMessage();
    }
    const chips = document.getElementById("suggestionChips");
    if (chips) chips.style.display = "none";
};

window.copyBotReply = function (btn) {
    const messageDiv = btn.closest(".message.bot");
    if (!messageDiv) return;

    const clone = messageDiv.cloneNode(true);
    const actions = clone.querySelector(".msg-action-bar");
    if (actions) actions.remove();

    const textToCopy = clone.innerText.trim();
    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span>✓</span> Copied';
        setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
    });
};

window.speakBotReply = function (btn) {
    const messageDiv = btn.closest(".message.bot");
    if (!messageDiv) return;

    const clone = messageDiv.cloneNode(true);
    const actions = clone.querySelector(".msg-action-bar");
    if (actions) actions.remove();

    speakNaturalVoice(clone.innerText.trim());
};

window.regenerateLastReply = function () {
    if (chatHistory.length === 0) return;

    let lastUserMessage = "";
    for (let i = chatHistory.length - 1; i >= 0; i--) {
        if (chatHistory[i].role === "user") {
            lastUserMessage = chatHistory[i].text;
            break;
        }
    }

    if (!lastUserMessage) return;

    const input = document.getElementById("messageInput");
    if (input) {
        input.value = lastUserMessage.replace(/^📷 \[Image Attached\]\s*/, "");
        sendMessage();
    }
};

window.openAccountSettings = function () {
    const modal = document.getElementById("lepsaAccountModal");
    if (!modal) return;

    const name = sessionStorage.getItem("lepsaUserName") || "User";
    const email = sessionStorage.getItem("lepsaUserEmail") || "user@lepsa.ai";

    const nameEl = document.getElementById("settingsProfileName");
    const emailEl = document.getElementById("settingsProfileEmail");
    const emailField = document.getElementById("settingsEmailField");
    const avatarEl = document.getElementById("settingsProfileAvatar");

    if (nameEl) nameEl.textContent = name;
    if (emailEl) emailEl.textContent = email;
    if (emailField) emailField.textContent = email;
    if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase();

    modal.style.display = "flex";
};

window.closeAccountSettings = function () {
    const modal = document.getElementById("lepsaAccountModal");
    if (modal) modal.style.display = "none";
};

document.querySelectorAll(".settings-item").forEach(item => {
    item.addEventListener("click", function () {
        const label = this.querySelector(".s-label, strong")?.innerText || "Option";

        if (label === "Upgrade plan") {
            lepsaToast("LEPSA AI Pro Tier is active for this account.");
        } else if (label === "Voice Model") {
            lepsaToast("Voice Model: Natural Conversational Core.");
        } else if (label === "Memory") {
            lepsaToast("Context Window: Active thread memory enabled.");
        } else {
            this.style.opacity = "0.6";
            setTimeout(() => { this.style.opacity = "1"; }, 150);
        }
    });
});

let activeTargetBotMsg = null;

window.openMsgMoreMenu = function (e, btn) {
    e.stopPropagation();
    activeTargetBotMsg = btn.closest(".message.bot");

    const menu = document.getElementById("msgMoreMenu");
    if (!menu) return;

    const timeEl = document.getElementById("popupTimestamp");
    if (timeEl) {
        const now = new Date();
        timeEl.textContent = now.toLocaleDateString('en-US', { weekday: 'short' }) + ", " + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const rect = btn.getBoundingClientRect();
    menu.style.display = "block";
    menu.style.left = Math.min(rect.left, window.innerWidth - 230) + "px";
    menu.style.top = (rect.top - menu.offsetHeight - 8) + "px";
};

window.branchNewChat = function () {
    closeMsgMoreMenu();
    if (!activeTargetBotMsg) return;

    const clone = activeTargetBotMsg.cloneNode(true);
    clone.querySelector(".msg-action-bar")?.remove();
    const promptText = clone.innerText.trim();

    newChat();
    setTimeout(() => {
        const input = document.getElementById("messageInput");
        if (input) {
            input.value = "Context from previous chat: " + promptText.slice(0, 60) + "...";
        }
    }, 300);
};

window.triggerRetryFromMenu = function () {
    closeMsgMoreMenu();
    regenerateLastReply();
};

function closeMsgMoreMenu() {
    const menu = document.getElementById("msgMoreMenu");
    if (menu) menu.style.display = "none";
}

document.addEventListener("click", function (e) {
    if (!e.target.closest("#msgMoreMenu")) {
        closeMsgMoreMenu();
    }
});

let vaultMediaList = [];
try {
    vaultMediaList = JSON.parse(localStorage.getItem("lepsaVaultMedia") || "[]");
} catch (e) { vaultMediaList = []; }

const originalHandleImageSelected = window.handleImageSelected;
window.handleImageSelected = function (input) {
    if (originalHandleImageSelected) originalHandleImageSelected(input);
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = function (e) {
            vaultMediaList.unshift({
                type: "image",
                title: file.name,
                url: e.target.result,
                date: new Date().toLocaleDateString()
            });
            try { localStorage.setItem("lepsaVaultMedia", JSON.stringify(vaultMediaList.slice(0, 30))); } catch (e) {}
        };
        reader.readAsDataURL(file);
    }
};

window.filterMediaVault = function (filterType, elem) {
    document.querySelectorAll(".sidebar .menu-item").forEach(m => m.classList.remove("active"));
    if (elem) elem.classList.add("active");

    const sidebar = document.getElementById("mainSidebar");
    const overlay = document.getElementById("sidebarOverlay");
    if (sidebar && sidebar.classList.contains("open")) {
        sidebar.classList.remove("open");
        if (overlay) overlay.classList.remove("active");
    }

    if (filterType === "all") {
        closeMediaVault();
        return;
    }

    const modal = document.getElementById("lepsaMediaVaultModal");
    const grid = document.getElementById("vaultMediaGrid");
    const title = document.getElementById("vaultModalTitle");
    const emptyNotice = document.getElementById("vaultEmptyNotice");

    if (!modal || !grid) return;

    title.textContent = filterType === "image" ? "Images Vault" : "Videos Vault";
    grid.innerHTML = "";

    const filtered = vaultMediaList.filter(item => item.type === filterType);

    if (filtered.length === 0) {
        emptyNotice.style.display = "block";
    } else {
        emptyNotice.style.display = "none";
        filtered.forEach(item => {
            const card = document.createElement("div");
            card.className = "vault-item-card";
            card.innerHTML = `
                <img src="${item.url}" alt="${item.title}">
                <div class="vault-item-name">${item.title}</div>
            `;
            grid.appendChild(card);
        });
    }

    modal.style.display = "flex";
};

window.closeMediaVault = function () {
    const modal = document.getElementById("lepsaMediaVaultModal");
    if (modal) modal.style.display = "none";
};
        