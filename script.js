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
    botDiv.innerHTML = '<div class="thinking-indicator"><span></span><span></span><span></span></div>';
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
                ...lepsaChatExtras(),
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
        let sources = [];
        let sawFirstDelta = false;
        let generatedImagesHtml = "";

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

                if (obj.status) {
                    botDiv.innerHTML = generatedImagesHtml + '<div class="tool-status-line"><span class="tool-status-dot"></span>' + obj.status + '</div>';
                    messages.scrollTop = messages.scrollHeight;
                } else if (obj.image) {
                    const safePrompt = (obj.image.prompt || "Generated image").replace(/"/g, "&quot;");
                    generatedImagesHtml += '<div class="generated-image-wrap"><img src="' + obj.image.url + '" alt="' + safePrompt + '" class="generated-image" onerror="lepsaImgError(this)" onclick="openImageLightbox(this.src)"></div>';
                    botDiv.innerHTML = generatedImagesHtml + '<div class="tool-status-line"><span class="tool-status-dot"></span>Image ready...</div>';
                    messages.scrollTop = messages.scrollHeight;
                } else if (obj.meta) {
                    gotMeta = true;
                    finalCleanReply = obj.full_reply || liveText;
                    sources = obj.sources || [];
                    if (obj.conversation_id) {
                        const isNewConversation = currentConversationId !== obj.conversation_id;
                        currentConversationId = obj.conversation_id;
                        localStorage.setItem("lepsaLastConversationId", currentConversationId);
                        if (isNewConversation) loadConversationList();
                    }
                } else if (obj.delta) {
                    sawFirstDelta = true;
                    liveText += obj.delta;
                    botDiv.innerHTML = generatedImagesHtml + formatAIResponse(liveText) + '<span class="typing-cursor">●</span>';
                    messages.scrollTop = messages.scrollHeight;
                }
            }
        }

        const finalText = gotMeta ? finalCleanReply : liveText;
        if (finalText || generatedImagesHtml) {
            if (finalText) chatHistory.push({ role: "model", text: finalText, type: "bot" });
            botDiv.innerHTML = generatedImagesHtml + (finalText ? formatAIResponse(finalText) : "");
            if (sources && sources.length > 0) {
                botDiv.appendChild(buildSourcesBlock(sources));
            }
            finalizeMessageElement(botDiv);
        } else {
            botDiv.innerHTML = "⚠️ Server returned empty response.";
        }
    } catch (err) {
        botDiv.innerHTML = "⚠️ Network/Fetch Error: " + err.message;
    }
    messages.scrollTop = messages.scrollHeight;
}

window.openImageLightbox = function (src) {
    let overlay = document.getElementById("lepsaImageLightbox");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "lepsaImageLightbox";
        overlay.className = "image-lightbox-overlay";
        overlay.onclick = function () { overlay.style.display = "none"; };
        overlay.innerHTML = '<img id="lepsaLightboxImg" src="" alt="">';
        document.body.appendChild(overlay);
    }
    document.getElementById("lepsaLightboxImg").src = src;
    overlay.style.display = "flex";
};

function buildSourcesBlock(sources) {
    const wrap = document.createElement("div");
    wrap.className = "sources-block";

    const label = document.createElement("div");
    label.className = "sources-label";
    label.textContent = "🔍 Sources";
    wrap.appendChild(label);

    const list = document.createElement("div");
    list.className = "sources-list";
    sources.forEach(function (src) {
        const chip = document.createElement("a");
        chip.className = "source-chip";
        chip.href = src.url || "#";
        chip.target = "_blank";
        chip.rel = "noopener noreferrer";
        chip.textContent = src.title || src.url || "Source";
        list.appendChild(chip);
    });
    wrap.appendChild(list);

    return wrap;
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
        const parsed = extractImageMarkers(text);
        div.innerHTML = parsed.imagesHtml + formatAIResponse(parsed.text);
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
    return div;
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
    let safe = String(text).replace(/\[Generated image:[^\]]*\]/gi, "").trim()
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

    closeSidebar();

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

        closeSidebar();
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
let voiceWatchdogTimer = null;
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

/* =========================================================
   WATCHDOG: agar "Listening" state me kuch der (9s) tak kuch na ho
   (na result, na error, na restart) — chahe koi bhi silent reason ho —
   mic ko force restart kar do. Ye Gemini/GPT jaisi reliability deta hai.
   ========================================================= */
function armVoiceWatchdog() {
    clearVoiceWatchdog();
    voiceWatchdogTimer = setTimeout(() => {
        if (lepsaVoiceActive && !isVoiceSending && (!currentAudio || currentAudio.paused)) {
            try { startLEPSAVoice(); } catch (e) {}
        }
    }, 9000);
}

function clearVoiceWatchdog() {
    if (voiceWatchdogTimer) {
        clearTimeout(voiceWatchdogTimer);
        voiceWatchdogTimer = null;
    }
}

function startLEPSAVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    stopCurrentAudio();
    lepsaVoiceActive = true;
    isVoiceSending = false;
    setLEPSAStatus("Listening...");
    armVoiceWatchdog();

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
        const err = event.error;

        if (err === "not-allowed" || err === "service-not-allowed") {
            updateVoiceModalStatus("Mic blocked", "Mic permission denied hai — Chrome settings me allow karo.");
            lepsaVoiceActive = false;
            return;
        }

        if (err === "audio-capture") {
            updateVoiceModalStatus("No mic found", "Koi microphone nahi mila.");
            return;
        }

        // no-speech / aborted / network — retry karo, ye normal hai
        if (lepsaVoiceActive && !isVoiceSending) {
            updateVoiceModalStatus("Listening...", "(" + err + ") — dobara try kar raha hu...");
            setTimeout(() => {
                if (lepsaVoiceActive && !isVoiceSending) {
                    try {
                        lepsaRecognizer.start();
                    } catch (e) {
                        updateVoiceModalStatus("Error", "Restart fail: " + e.message);
                    }
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
                    try {
                        lepsaRecognizer.start();
                    } catch (e) {
                        updateVoiceModalStatus("Error", "Restart fail: " + e.message);
                    }
                }
            }, 400);
        }
    };

    try {
        lepsaRecognizer.start();
    } catch (e) {
        updateVoiceModalStatus("Error", "Mic start fail: " + e.message);
    }
}

async function executeVoicePrompt(text) {
    if (!text.trim() || isVoiceSending) return;
    isVoiceSending = true;
    clearVoiceWatchdog();

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
                ...lepsaChatExtras(),
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
        isVoiceSending = false; // reply mil gaya — agle turn ke liye mic dobara arm karo

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
    clearVoiceWatchdog();
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

/* =========================================================
   MEMORY PANEL
   ========================================================= */
window.openMemoryPanel = async function () {
    const modal = document.getElementById("lepsaMemoryModal");
    const listEl = document.getElementById("memoryListContainer");
    if (!modal || !listEl) return;

    modal.style.display = "flex";
    listEl.innerHTML = '<div class="memory-empty-note">Load ho raha hai...</div>';

    try {
        const res = await fetch("chat.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "list_memory" })
        });
        const data = await res.json();
        const facts = data.memories || [];

        if (facts.length === 0) {
            listEl.innerHTML = '<div class="memory-empty-note">Abhi kuch yaad nahi hai — jaise jaise baat karoge, Lepsa important cheezein yaad rakhna shuru kar degi.</div>';
            return;
        }

        listEl.innerHTML = "";
        facts.forEach(function (f) {
            const item = document.createElement("div");
            item.className = "memory-fact-item";
            item.textContent = f.fact;
            listEl.appendChild(item);
        });
    } catch (e) {
        listEl.innerHTML = '<div class="memory-empty-note">Memory load nahi ho payi.</div>';
    }

    closeSidebar();
};

window.closeMemoryPanel = function () {
    const modal = document.getElementById("lepsaMemoryModal");
    if (modal) modal.style.display = "none";
};

window.clearAllMemory = async function () {
    const ok = await lepsaConfirm("Lepsa ki saari memory clear kar du? Ye undo nahi ho sakta.");
    if (!ok) return;

    try {
        await fetch("chat.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "clear_memory" })
        });
        lepsaToast("Memory clear ho gayi.");
        openMemoryPanel();
    } catch (e) {
        lepsaToast("Clear nahi ho paya, try again.");
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

window.triggerDocumentUpload = function () {
    const popup = document.getElementById("lepsaAttachPopup");
    if (popup) popup.classList.remove("show");
    const input = document.getElementById("documentInput");
    if (input) input.click();
};

window.handleDocumentSelected = async function (input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];

    if (file.size > 5 * 1024 * 1024) {
        lepsaToast("File 5MB se badi hai — chhoti file try karo.");
        input.value = "";
        return;
    }

    const messages = document.getElementById("messages");
    const welcomeMsg = document.getElementById("defaultWelcomeMessage");
    if (welcomeMsg) welcomeMsg.remove();
    const chips = document.getElementById("suggestionChips");
    if (chips) chips.remove();

    const statusDiv = addMessage("📄 " + file.name + " upload ho raha hai...", "bot", false);

    const reader = new FileReader();
    reader.onload = async function (e) {
        const base64 = e.target.result.split(",")[1];

        try {
            const res = await fetch("chat.php", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "upload_document",
                    filename: file.name,
                    file: base64,
                    conversation_id: currentConversationId
                })
            });
            const data = await res.json();

            if (data.success) {
                if (data.conversation_id) {
                    const isNewConversation = currentConversationId !== data.conversation_id;
                    currentConversationId = data.conversation_id;
                    localStorage.setItem("lepsaLastConversationId", currentConversationId);
                    if (isNewConversation) loadConversationList();
                }
                updateBotMessage(statusDiv, "📄 **" + file.name + "** upload ho gayi. Ab isi file ke baare me kuch bhi pooch sakte ho.");
                lepsaToast("Document ready — ab isse related sawaal pucho.");
            } else {
                updateBotMessage(statusDiv, "⚠️ " + (data.message || "Document process nahi ho payi."));
            }
        } catch (err) {
            updateBotMessage(statusDiv, "⚠️ Upload fail: " + err.message);
        }
        messages.scrollTop = messages.scrollHeight;
    };
    reader.readAsDataURL(file);
    input.value = "";
};

function updateBotMessage(element, text) {
    if (!element) return;
    element.innerHTML = formatAIResponse(text);
    finalizeMessageElement(element);
}

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
        updateVoiceModalStatus("Listening...", "Mic dobara start ho raha hai...");
        setTimeout(() => {
            if (lepsaVoiceActive && !isVoiceSending) {
                try {
                    startLEPSAVoice();
                } catch (e) {
                    updateVoiceModalStatus("Error", "Auto-restart fail: " + e.message);
                }
            }
        }, 300);
    } else if (!lepsaVoiceActive) {
        updateVoiceModalStatus("Stopped", "Voice mode band hai (lepsaVoiceActive = false).");
    } else if (isVoiceSending) {
        updateVoiceModalStatus("Stuck", "isVoiceSending abhi bhi true hai — restart nahi ho raha.");
    }
}

let speakToken = 0;
let currentAudioResolve = null;
const LEPSA_DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";

function getVoicePrefs() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem("lepsaVoicePrefs") || "{}"); } catch (e) {}
    return {
        id: p.id || LEPSA_DEFAULT_VOICE,
        name: p.name || "Rachel",
        speed: p.speed || 1.0,
        stability: (p.stability == null ? 0.45 : p.stability)
    };
}

function setVoicePrefs(patch) {
    const merged = Object.assign(getVoicePrefs(), patch);
    try { localStorage.setItem("lepsaVoicePrefs", JSON.stringify(merged)); } catch (e) {}
    if (window.refreshAccountLabels) refreshAccountLabels();
}

function splitForTTS(text, max) {
    const parts = text.replace(/\s+/g, " ").match(/[^.!?।\n]+[.!?।]*\s*/g) || [text];
    const chunks = [];
    let cur = "";
    parts.forEach(function (p) {
        if ((cur + p).length > max && cur) { chunks.push(cur.trim()); cur = p; }
        else cur += p;
    });
    if (cur.trim()) chunks.push(cur.trim());
    const out = [];
    chunks.forEach(function (c) {
        if (c.length > max) { (c.match(new RegExp(".{1," + max + "}", "g")) || [c]).forEach(function (x) { out.push(x); }); }
        else out.push(c);
    });
    return out;
}

async function ttsRequest(text, extra) {
    const v = getVoicePrefs();
    const res = await fetch("chat.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({
            action: "tts", text: text, voice_id: v.id, speed: v.speed, stability: v.stability
        }, extra || {}))
    });
    return await res.json();
}

function noteTtsResult(data) {
    window.lepsaTtsStatus = { engine: data.engine || "none", error: data.eleven_error || data.error || null };
    if (data.engine !== "elevenlabs" && !window._lepsaTtsWarned) {
        window._lepsaTtsWarned = true;
        lepsaToast("ElevenLabs nahi chali: " + String(data.eleven_error || data.error || "unknown").slice(0, 110), 6000);
    }
}

function playAudioData(data) {
    return new Promise(function (resolve) {
        const a = new Audio("data:" + (data.mimeType || "audio/mpeg") + ";base64," + data.audio);
        currentAudio = a;
        currentAudioResolve = resolve;
        a.onended = function () { resolve("ended"); };
        a.onerror = function () { resolve("error"); };
        a.play().catch(function () { resolve("blocked"); });
    });
}

function speakBrowser(text) {
    return new Promise(function (resolve) {
        if (!("speechSynthesis" in window)) { resolve(); return; }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "hi-IN";
        u.onend = u.onerror = function () { resolve(); };
        window.speechSynthesis.speak(u);
    });
}

async function speakNaturalVoice(text) {
    stopCurrentAudio();
    const token = ++speakToken;

    let cleanText = String(text || "")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/[*#_~`>•]/g, "")
        .trim()
        .slice(0, 1800);

    if (!cleanText) { onSpeechFinished(); return; }

    const orb = document.getElementById("modalVoiceOrb");
    if (orb) { orb.classList.remove("listening"); orb.classList.add("speaking"); }
    // Note: mic yahan automatically start NAHI karte (Android Chrome ka mic overlay playback rok deta hai).
    // Interrupt ke liye tapVoiceInterrupt() use hota hai.

    const chunks = splitForTTS(cleanText, 380).slice(0, 6);
    const ask = function (t) { return ttsRequest(t).catch(function (e) { return { success: false, error: String(e) }; }); };
    let pending = ask(chunks[0]);

    for (let i = 0; i < chunks.length; i++) {
        const data = await pending;
        if (token !== speakToken) return;
        if (i + 1 < chunks.length) pending = ask(chunks[i + 1]);   // agla chunk pehle se tayyar

        noteTtsResult(data);
        let result = "error";
        if (data.success && data.audio) result = await playAudioData(data);
        if (token !== speakToken) return;

        if (result !== "ended") {
            await speakBrowser(chunks[i]);
            if (token !== speakToken) return;
        }
    }
    if (token === speakToken) onSpeechFinished();
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
    speakToken++;
    if (currentAudio) {
        try {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        } catch (e) {}
        currentAudio = null;
    }
    if (currentAudioResolve) {
        const r = currentAudioResolve;
        currentAudioResolve = null;
        r("stopped");
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

window.filterMediaVault = async function (filterType, elem) {
    document.querySelectorAll(".sidebar .menu-item").forEach(m => m.classList.remove("active"));
    if (elem) elem.classList.add("active");

    closeSidebar();

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

    let filtered = vaultMediaList.filter(item => item.type === filterType);
    if (filterType === "image") {
        grid.innerHTML = "";
        emptyNotice.style.display = "none";
        const serverImgs = await fetchGeneratedImages();
        filtered = serverImgs.concat(filtered);
    }

    if (filtered.length === 0) {
        emptyNotice.style.display = "block";
    } else {
        emptyNotice.style.display = "none";
        filtered.forEach(item => {
            const card = document.createElement("div");
            card.className = "vault-item-card";
            card.innerHTML = `
                <img src="${item.url}" alt="${escAttr(item.title)}" onclick="openImageLightbox(this.src)">
                <div class="vault-item-name">${escAttr(item.title)}</div>
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
        

window.lepsaImgError = function (img) {
    const d = document.createElement("div");
    d.style.cssText = "color:#ff8a8a;font-size:13px;padding:6px 0";
    d.textContent = "⚠️ Image load nahi ho payi, dobara try karo.";
    img.replaceWith(d);
};


/* =====================================================
   Generated-image persistence helpers
===================================================== */
function escAttr(str) {
    return String(str == null ? "" : str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// "[[IMG:url|prompt]]" markers ko images me badalta hai
function extractImageMarkers(text) {
    let imagesHtml = "";
    const clean = String(text || "").replace(/\[\[IMG:([^|\]]*)\|([^\]]*)\]\]/g, function (_, url, prompt) {
        imagesHtml += '<div class="generated-image-wrap"><img src="' + escAttr(url) + '" alt="' + escAttr(prompt) +
            '" class="generated-image" onerror="lepsaImgError(this)" onclick="openImageLightbox(this.src)"></div>';
        return "";
    }).trim();
    return { text: clean, imagesHtml: imagesHtml };
}

async function fetchGeneratedImages() {
    try {
        const res = await fetch("chat.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "get_generated_images" })
        });
        const data = await res.json();
        return (data.images || []).map(function (i) {
            return { type: "image", title: i.title || "Generated image", url: i.url, date: i.date || "" };
        });
    } catch (e) { return []; }
}

/* =====================================================
   Sidebar — ChatGPT jaisa: bahar tap / swipe / Esc se band
===================================================== */
window.openSidebar = function () {
    const sb = document.getElementById("mainSidebar");
    const ov = document.getElementById("sidebarOverlay");
    if (sb) sb.classList.add("open");
    if (ov) ov.classList.add("active");
};
window.closeSidebar = function () {
    const sb = document.getElementById("mainSidebar");
    const ov = document.getElementById("sidebarOverlay");
    if (sb) sb.classList.remove("open");
    if (ov) { ov.classList.remove("active"); ov.classList.remove("open"); }
};
window.toggleMobileSidebar = function () {
    const sb = document.getElementById("mainSidebar");
    if (sb && sb.classList.contains("open")) closeSidebar(); else openSidebar();
};
document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSidebar(); });
(function () {
    let sx = 0, sy = 0, tracking = false;
    document.addEventListener("touchstart", function (e) {
        const t = e.touches[0]; sx = t.clientX; sy = t.clientY;
        const sb = document.getElementById("mainSidebar");
        tracking = !!(sb && (sb.classList.contains("open") || sx < 20));
    }, { passive: true });
    document.addEventListener("touchend", function (e) {
        if (!tracking) return;
        const t = e.changedTouches[0], dx = t.clientX - sx, dy = Math.abs(t.clientY - sy);
        const sb = document.getElementById("mainSidebar");
        if (!sb || dy > 60 || window.innerWidth > 700) return;
        if (sb.classList.contains("open") && dx < -60) closeSidebar();
        else if (!sb.classList.contains("open") && sx < 20 && dx > 70) openSidebar();
    }, { passive: true });
})();

/* =====================================================
   PREFERENCES (personalization + plugins) -> chat requests
===================================================== */
function getPrefs() {
    try { return Object.assign({ nickname: "", tone: "balanced", instructions: "" }, JSON.parse(localStorage.getItem("lepsaPrefs") || "{}")); }
    catch (e) { return { nickname: "", tone: "balanced", instructions: "" }; }
}
function getPlugins() {
    try { return Object.assign({ web: true, image: true, calc: true }, JSON.parse(localStorage.getItem("lepsaPlugins") || "{}")); }
    catch (e) { return { web: true, image: true, calc: true }; }
}
function lepsaChatExtras() {
    const p = getPrefs();
    return { custom_instructions: p.instructions || "", nickname: p.nickname || "", tone: p.tone || "balanced", plugins: getPlugins() };
}

/* =====================================================
   BOTTOM SHEET
===================================================== */
window.openSheet = function (title, html) {
    const sheet = document.getElementById("lepsaSheet");
    const back = document.getElementById("lepsaSheetBack");
    document.getElementById("lepsaSheetTitle").textContent = title;
    document.getElementById("lepsaSheetBody").innerHTML = html;
    document.getElementById("lepsaSheetBody").scrollTop = 0;
    back.classList.add("show");
    requestAnimationFrame(function () { sheet.classList.add("show"); });
};
window.closeSheet = function () {
    const sheet = document.getElementById("lepsaSheet");
    const back = document.getElementById("lepsaSheetBack");
    if (sheet) sheet.classList.remove("show");
    if (back) back.classList.remove("show");
    if (window._vsPreviewAudio) { try { window._vsPreviewAudio.pause(); } catch (e) {} }
    refreshAccountLabels();
};
document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });

/* =====================================================
   ACCOUNT PAGE v2
===================================================== */
const MODE_LABELS = { code: "Dev Core", business: "Voice Agent", study: "Exam Prep" };

window.refreshAccountLabels = function () {
    const set = function (id, v) { const el = document.getElementById(id); if (el) el.textContent = v; };
    const tone = getPrefs().tone || "balanced";
    set("accValTone", tone.charAt(0).toUpperCase() + tone.slice(1));
    set("accValVoice", getVoicePrefs().name);
    set("voiceChipName", getVoicePrefs().name);
    set("accValMode", MODE_LABELS[currentAppMode] || "Dev Core");
    const pl = getPlugins();
    set("accValPlugins", [pl.web, pl.image, pl.calc].filter(Boolean).length + " on");
};

window.refreshAccountStats = async function () {
    try {
        const res = await fetch("chat.php", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "account_stats" })
        });
        const d = await res.json();
        const set = function (id, v) { const el = document.getElementById(id); if (el) el.textContent = v; };
        set("accStatChats", d.chats ?? 0);
        set("accStatMemory", d.memories ?? 0);
        set("accStatImages", d.images ?? 0);
        set("accValMemory", (d.memories ?? 0) + " saved");
    } catch (e) {}
};

window.openAccountSettings = function () {
    const modal = document.getElementById("lepsaAccountModal");
    if (!modal) return;

    const name = sessionStorage.getItem("lepsaUserName") || "User";
    const email = sessionStorage.getItem("lepsaUserEmail") || "user@lepsa.ai";
    const set = function (id, v) { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("settingsProfileName", name);
    set("settingsProfileEmail", email);
    set("settingsEmailField", email);
    set("settingsProfileAvatar", name.charAt(0).toUpperCase());

    modal.style.display = "flex";
    refreshAccountLabels();
    refreshAccountStats();
};

window.accountAction = async function (name) {
    if (name === "personalization") return openPersonalizationSheet();
    if (name === "voice") return openVoiceStudio();
    if (name === "memory") return openMemoryPanel();
    if (name === "plugins") return openPluginsSheet();
    if (name === "workspace") return openWorkspaceSheet();
    if (name === "plan") return openPlanSheet();
    if (name === "email") {
        const email = sessionStorage.getItem("lepsaUserEmail") || "";
        try { await navigator.clipboard.writeText(email); lepsaToast("Email copy ho gaya ✓"); } catch (e) { lepsaToast(email); }
        return;
    }
    if (name === "clearMemory") {
        await clearAllMemory();
        refreshAccountStats();
        return;
    }
    if (name === "resetPrefs") {
        const ok = await lepsaConfirm("Voice, plugins aur personalization default par reset kar du?");
        if (!ok) return;
        ["lepsaPrefs", "lepsaPlugins", "lepsaVoicePrefs"].forEach(function (k) { localStorage.removeItem(k); });
        refreshAccountLabels();
        lepsaToast("Preferences reset ho gayi ✓");
    }
};

/* ---------- Personalization ---------- */
const TONES = [["balanced", "Balanced"], ["friendly", "Friendly"], ["professional", "Professional"], ["concise", "Concise"], ["detailed", "Detailed"]];
let _prefTone = "balanced";

window.openPersonalizationSheet = function () {
    const p = getPrefs();
    _prefTone = p.tone || "balanced";
    const chips = TONES.map(function (t) {
        return '<div class="sh-chip' + (t[0] === _prefTone ? " on" : "") + '" onclick="prefPickTone(this,\'' + t[0] + '\')">' + t[1] + '</div>';
    }).join("");
    openSheet("Personalization",
        '<div class="sh-label">Nickname</div>' +
        '<input id="prefNick" class="sh-input" maxlength="40" placeholder="Lepsa aapko kis naam se bulaye?" value="' + escAttr(p.nickname) + '">' +
        '<div class="sh-label">Reply tone</div><div class="sh-chips">' + chips + '</div>' +
        '<div class="sh-label">Custom instructions</div>' +
        '<textarea id="prefInstr" class="sh-textarea" maxlength="700" oninput="document.getElementById(\'prefCount\').textContent=this.value.length" placeholder="Jaise: Hamesha Hinglish me jawab do. Code me comments likho.">' + escAttr(p.instructions) + '</textarea>' +
        '<div class="sh-count"><span id="prefCount">' + (p.instructions || "").length + '</span>/700</div>' +
        '<button class="sh-btn" onclick="savePersonalization()">Save</button>');
};
window.prefPickTone = function (el, tone) {
    _prefTone = tone;
    el.parentNode.querySelectorAll(".sh-chip").forEach(function (c) { c.classList.remove("on"); });
    el.classList.add("on");
};
window.savePersonalization = function () {
    const p = {
        nickname: document.getElementById("prefNick").value.trim(),
        tone: _prefTone,
        instructions: document.getElementById("prefInstr").value.trim()
    };
    try { localStorage.setItem("lepsaPrefs", JSON.stringify(p)); } catch (e) {}
    closeSheet();
    lepsaToast("Personalization save ho gayi ✓");
};

/* ---------- Plugins ---------- */
window.openPluginsSheet = function () {
    const pl = getPlugins();
    const rows = [
        ["web", "🌐", "ic-cyan", "Web Search", "Live news, scores, prices"],
        ["image", "🎨", "ic-pink", "Image Generation", "Text se images banao"],
        ["calc", "🧮", "ic-amber", "Calculator", "Exact maths answers"]
    ].map(function (r) {
        return '<div class="sh-toggle-row"><span class="acc-ico ' + r[2] + '">' + r[1] + '</span>' +
            '<div class="acc-txt"><strong>' + r[3] + '</strong><small>' + r[4] + '</small></div>' +
            '<div class="sw' + (pl[r[0]] ? " on" : "") + '" onclick="togglePlugin(\'' + r[0] + '\',this)"></div></div>';
    }).join("");
    openSheet("Plugins", rows + '<div class="sh-count" style="text-align:left;margin-top:12px">Band karne par AI wo tool use nahi karegi.</div>');
};
window.togglePlugin = function (key, el) {
    const pl = getPlugins();
    pl[key] = !pl[key];
    try { localStorage.setItem("lepsaPlugins", JSON.stringify(pl)); } catch (e) {}
    el.classList.toggle("on", pl[key]);
    refreshAccountLabels();
};

/* ---------- Workspace ---------- */
window.openWorkspaceSheet = function () {
    const modes = [
        ["code", "💻", "ic-cyan", "Dev Core", "Coding, bugs, architecture"],
        ["business", "🎙️", "ic-pink", "Voice Agent", "Business, sales, clients"],
        ["study", "📚", "ic-green", "Exam Prep", "Notes, concepts, MCQs"]
    ].map(function (m) {
        return '<div class="sh-card' + (m[0] === currentAppMode ? " on" : "") + '" onclick="pickWorkspace(\'' + m[0] + '\')">' +
            '<span class="acc-ico ' + m[2] + '">' + m[1] + '</span>' +
            '<div class="acc-txt"><strong>' + m[3] + '</strong><small>' + m[4] + '</small></div>' +
            '<span class="sh-check">' + (m[0] === currentAppMode ? "✓" : "") + '</span></div>';
    }).join("");
    openSheet("Workspace", modes);
};
window.pickWorkspace = function (mode) {
    const btn = document.getElementById("modeBtn" + mode.charAt(0).toUpperCase() + mode.slice(1));
    setAppMode(mode, btn);
    closeSheet();
    lepsaToast("Workspace: " + MODE_LABELS[mode]);
};

/* ---------- Plan ---------- */
window.openPlanSheet = function () {
    const feats = ["Unlimited chats & memory", "Live web search", "AI image generation", "ElevenLabs premium voices", "Voice mode with multiple voices", "PDF & image understanding"];
    openSheet("Your plan",
        '<div class="acc-hero" style="margin:6px 0 12px;padding:20px 16px">' +
        '<div class="acc-plan-badge" style="margin:0">✦ LEPSA PRO CORE</div>' +
        '<div style="margin-top:10px;color:#22e07a;font-weight:700;font-size:14px">● Active</div></div>' +
        feats.map(function (f) { return '<div class="sh-feature"><b>✓</b><span>' + f + '</span></div>'; }).join(""));
};

/* =====================================================
   VOICE STUDIO
===================================================== */
let _voiceData = null;
const VS_GRADS = ["linear-gradient(135deg,#00eaff,#7a5cff)", "linear-gradient(135deg,#ff7ad9,#ffb86b)", "linear-gradient(135deg,#6bffb0,#00c2ff)",
    "linear-gradient(135deg,#ffd36b,#ff6b8a)", "linear-gradient(135deg,#b58cff,#5cd0ff)"];

function vsGrad(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return VS_GRADS[h % VS_GRADS.length];
}

window.openVoiceStudio = async function () {
    openSheet("Voice Studio", '<div class="vs-status"><span class="vs-dot"></span><div>Voices load ho rahi hain...</div></div>');
    try {
        if (!_voiceData) {
            const res = await fetch("chat.php", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "list_voices" })
            });
            _voiceData = await res.json();
        }
    } catch (e) {
        _voiceData = { voices: [], fallback: true, error: "Server se connect nahi hua" };
    }
    renderVoiceStudio();
};

function renderVoiceStudio() {
    const d = _voiceData || { voices: [] };
    const p = getVoicePrefs();
    const ok = !d.error;
    const status =
        '<div class="vs-status ' + (ok ? "ok" : "bad") + '" id="vsStatus"><span class="vs-dot"></span><div>' +
        (ok ? "<b>ElevenLabs connected</b><small>" + d.voices.length + " voices available</small>"
            : "<b>ElevenLabs problem</b><small>" + escAttr(d.error) + "</small>") + '</div></div>';

    const styles = [["Stable", 0.7], ["Natural", 0.45], ["Expressive", 0.25]].map(function (s) {
        return '<div class="sh-chip' + (Math.abs(p.stability - s[1]) < 0.01 ? " on" : "") + '" onclick="vsSetStyle(this,' + s[1] + ')">' + s[0] + '</div>';
    }).join("");

    const cards = d.voices.map(function (v, i) {
        const tags = [v.gender, v.accent, v.age, v.desc].filter(Boolean).slice(0, 3)
            .map(function (t) { return '<span class="vs-tag">' + escAttr(t) + '</span>'; }).join("");
        return '<div class="sh-card' + (v.id === p.id ? " on" : "") + '" data-i="' + i + '" onclick="vsSelectVoice(' + i + ')">' +
            '<div class="vs-avatar" style="background:' + vsGrad(v.name) + '">' + escAttr(v.name.charAt(0).toUpperCase()) + '</div>' +
            '<div class="acc-txt"><strong>' + escAttr(v.name) + '</strong><div class="vs-meta">' + tags + '</div></div>' +
            '<button class="vs-play" onclick="vsPreview(event,' + i + ')">▶</button>' +
            '<span class="sh-check">' + (v.id === p.id ? "✓" : "") + '</span></div>';
    }).join("");

    document.getElementById("lepsaSheetBody").innerHTML =
        status +
        '<div class="sh-label">Speed</div><div class="vs-range-row"><input class="vs-range" type="range" min="0.7" max="1.2" step="0.05" value="' + p.speed +
        '" oninput="vsSetSpeed(this.value)"><b id="vsSpeedVal">' + Number(p.speed).toFixed(2) + 'x</b></div>' +
        '<div class="sh-label">Style</div><div class="sh-chips">' + styles + '</div>' +
        '<button class="sh-btn ghost" onclick="vsTest()">🔊 Test current voice</button>' +
        '<div class="sh-label">Voices</div>' + cards;
}

window.vsSetSpeed = function (v) {
    setVoicePrefs({ speed: parseFloat(v) });
    const el = document.getElementById("vsSpeedVal");
    if (el) el.textContent = parseFloat(v).toFixed(2) + "x";
};
window.vsSetStyle = function (el, val) {
    setVoicePrefs({ stability: val });
    el.parentNode.querySelectorAll(".sh-chip").forEach(function (c) { c.classList.remove("on"); });
    el.classList.add("on");
};

const VS_SAMPLE = "Namaste! Main Lepsa hoon, aapki AI assistant. Bataiye, main aapki kaise madad kar sakti hoon?";

function vsPlayData(data) {
    stopCurrentAudio();
    if (window._vsPreviewAudio) { try { window._vsPreviewAudio.pause(); } catch (e) {} }
    const a = new Audio("data:" + (data.mimeType || "audio/mpeg") + ";base64," + data.audio);
    window._vsPreviewAudio = a;
    return a.play();
}

async function vsSpeakSample(voiceId, btn) {
    if (btn) { btn.classList.add("busy"); }
    const statusEl = document.getElementById("vsStatus");
    try {
        const data = await ttsRequest(VS_SAMPLE, voiceId ? { voice_id: voiceId } : {});
        if (data.success && data.audio) {
            await vsPlayData(data);
            if (statusEl) {
                const good = data.engine === "elevenlabs";
                statusEl.className = "vs-status " + (good ? "ok" : "bad");
                statusEl.innerHTML = '<span class="vs-dot"></span><div>' + (good
                    ? "<b>ElevenLabs working ✓</b><small>Premium voice se play hua</small>"
                    : "<b>Robotic fallback chala</b><small>" + escAttr(data.eleven_error || "ElevenLabs reply nahi di") + "</small>") + "</div>";
            }
        } else if (statusEl) {
            statusEl.className = "vs-status bad";
            statusEl.innerHTML = '<span class="vs-dot"></span><div><b>Voice fail</b><small>' + escAttr(data.error || data.eleven_error || "unknown") + "</small></div>";
        }
    } catch (e) {
        lepsaToast("Voice test fail: " + e.message);
    }
    if (btn) btn.classList.remove("busy");
}

window.vsTest = function () { vsSpeakSample(null, null); };

window.vsSelectVoice = function (i) {
    const v = (_voiceData.voices || [])[i];
    if (!v) return;
    setVoicePrefs({ id: v.id, name: v.name });
    document.querySelectorAll("#lepsaSheetBody .sh-card").forEach(function (c) {
        const on = parseInt(c.getAttribute("data-i"), 10) === i;
        c.classList.toggle("on", on);
        const chk = c.querySelector(".sh-check");
        if (chk) chk.textContent = on ? "✓" : "";
    });
    lepsaToast("Voice: " + v.name);
};

window.vsPreview = async function (e, i) {
    e.stopPropagation();
    const v = (_voiceData.voices || [])[i];
    if (!v) return;
    if (v.preview) {
        stopCurrentAudio();
        if (window._vsPreviewAudio) { try { window._vsPreviewAudio.pause(); } catch (x) {} }
        const a = new Audio(v.preview);
        window._vsPreviewAudio = a;
        a.play().catch(function () { vsSpeakSample(v.id, e.currentTarget); });
    } else {
        vsSpeakSample(v.id, e.currentTarget);
    }
};

document.addEventListener("DOMContentLoaded", function () { refreshAccountLabels(); });
