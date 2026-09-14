/* =========================================================
   LEPSA AI - COMPLETE SCRIPT
   Chat + Voice Input + Gemini Live Voice
   ========================================================= */


/* =========================================================
   CHAT HISTORY
   ========================================================= */

let chatHistory = [];

try {
    chatHistory = JSON.parse(
        localStorage.getItem("geminiChatHistory") || "[]"
    );
} catch (error) {
    chatHistory = [];
}


/* =========================================================
   PAGE LOAD
   ========================================================= */

window.addEventListener("DOMContentLoaded", function () {

    chatHistory.forEach(function (message) {

        if (
            message &&
            message.text &&
            message.type
        ) {
            addMessage(
                message.text,
                message.type,
                false
            );
        }

    });


    const input =
        document.getElementById("messageInput");


    if (input) {

        input.addEventListener(
            "keydown",
            function (event) {

                if (
                    event.key === "Enter" &&
                    !event.shiftKey
                ) {

                    event.preventDefault();

                    sendMessage();

                }

            }
        );

    }

});


/* =========================================================
   SEND NORMAL CHAT MESSAGE
   ========================================================= */

async function sendMessage() {

    const input =
        document.getElementById("messageInput");


    if (!input) return;


    const text =
        input.value.trim();


    if (!text) return;


    addMessage(
        text,
        "user",
        false
    );


    input.value = "";


    chatHistory.push({

        role: "user",

        text: text,

        type: "user"

    });


    saveHistory();


    try {

        const response =
            await fetch(
                "chat.php",
                {

                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        message: text,

                        history: chatHistory

                    })

                }
            );


        const data =
            await response.json();


        if (data.reply) {

            addMessage(
                data.reply,
                "bot",
                true
            );


            chatHistory.push({

                role: "model",

                text: data.reply,

                type: "bot"

            });


            saveHistory();

        } else {

            addMessage(
                "AI se response nahi mila.",
                "bot",
                false
            );

        }


    } catch (error) {

        console.error(
            "Chat error:",
            error
        );


        addMessage(
            "Server se connection nahi ho pa raha.",
            "bot",
            false
        );

    }

}


/* =========================================================
   ADD MESSAGE
   ========================================================= */

function addMessage(
    text,
    type,
    typing
) {

    const messages =
        document.getElementById("messages");


    if (!messages) return;


    const div =
        document.createElement("div");


    div.className =
        "message " + type;


    messages.appendChild(div);


    if (type === "user") {

        div.textContent = text;

    }

    else if (typing) {

        typeMessage(
            div,
            text
        );

    }

    else {

        div.innerHTML =
            formatAIResponse(text);

    }


    messages.scrollTop =
        messages.scrollHeight;

}


/* =========================================================
   TYPING EFFECT
   ========================================================= */

function typeMessage(
    element,
    text
) {

    let index = 0;

    const speed = 3;


    function type() {

        if (
            index <
            text.length
        ) {

            index++;


            element.innerHTML =
                formatAIResponse(
                    text.substring(
                        0,
                        index
                    )
                );


            const messages =
                document.getElementById(
                    "messages"
                );


            if (messages) {

                messages.scrollTop =
                    messages.scrollHeight;

            }


            setTimeout(
                type,
                speed
            );

        }

    }


    type();

}


/* =========================================================
   AI RESPONSE FORMAT
   ========================================================= */

function formatAIResponse(text) {

    let safe =
        String(text)
            .replace(
                /&/g,
                "&amp;"
            )
            .replace(
                /</g,
                "&lt;"
            )
            .replace(
                />/g,
                "&gt;"
            );


    safe =
        safe.replace(
            /```(\w+)?\n?([\s\S]*?)```/g,
            function (
                match,
                language,
                code
            ) {

                return (
                    '<pre class="code-block">' +
                    '<code>' +
                    code.trim() +
                    '</code></pre>'
                );

            }
        );


    safe =
        safe.replace(
            /\*\*(.*?)\*\*/g,
            "<strong>$1</strong>"
        );


    safe =
        safe.replace(
            /\*(.*?)\*/g,
            "<em>$1</em>"
        );


    safe =
        safe.replace(
            /^### (.*)$/gm,
            "<h4>$1</h4>"
        );


    safe =
        safe.replace(
            /^## (.*)$/gm,
            "<h3>$1</h3>"
        );


    safe =
        safe.replace(
            /^# (.*)$/gm,
            "<h2>$1</h2>"
        );


    safe =
        safe.replace(
            /^[•*-] (.*)$/gm,
            "• $1"
        );


    safe =
        safe.replace(
            /\n/g,
            "<br>"
        );


    return safe;

}


/* =========================================================
   SAVE HISTORY
   ========================================================= */

function saveHistory() {

    try {

        localStorage.setItem(
            "geminiChatHistory",
            JSON.stringify(
                chatHistory
            )
        );

    } catch (error) {

        console.error(
            "History error:",
            error
        );

    }

}


/* =========================================================
   NEW CHAT (INSTANT - NO POPUP)
   ========================================================= */

window.newChat = function () {
    localStorage.removeItem("geminiChatHistory");
    location.reload();
};




/* =========================================================
   NORMAL VOICE INPUT
   ========================================================= */

let recognition = null;

let isListening = false;


window.startVoice = function () {

    const input =
        document.getElementById(
            "messageInput"
        );


    const micButton =
        document.querySelector(
            ".mic-button"
        );


    if (!input) {

        alert(
            "Message input nahi mila."
        );

        return;

    }


    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;


    if (!SpeechRecognition) {

        alert(
            "Chrome me voice input supported nahi hai."
        );

        return;

    }


    if (
        isListening &&
        recognition
    ) {

        recognition.stop();

        return;

    }


    recognition =
        new SpeechRecognition();


    recognition.lang =
        "hi-IN";


    recognition.continuous =
        false;


    recognition.interimResults =
        true;


    recognition.maxAlternatives =
        1;


    recognition.onstart =
        function () {

            isListening =
                true;


            if (micButton) {

                micButton.classList.add(
                    "listening"
                );

            }

        };


    recognition.onresult =
        function (event) {

            let transcript = "";


            for (
                let i =
                    event.resultIndex;

                i <
                    event.results.length;

                i++
            ) {

                transcript +=
                    event.results[i][0]
                        .transcript;

            }


            transcript =
                transcript.trim();


            if (transcript) {

                input.value =
                    transcript;


                input.dispatchEvent(
                    new Event(
                        "input",
                        {
                            bubbles: true
                        }
                    )
                );

            }

        };


    recognition.onerror =
        function (event) {

            console.error(
                "Voice error:",
                event.error
            );


            isListening =
                false;


            if (micButton) {

                micButton.classList.remove(
                    "listening"
                );

            }


            if (
                event.error ===
                "not-allowed"
            ) {

                alert(
                    "Microphone permission denied hai."
                );

            }

            else if (
                event.error ===
                "no-speech"
            ) {

                alert(
                    "Voice detect nahi hui."
                );

            }

        };


    recognition.onend =
        function () {

            isListening =
                false;


            if (micButton) {

                micButton.classList.remove(
                    "listening"
                );

            }

        };


    try {

        recognition.start();

    } catch (error) {

        console.error(
            "Voice start error:",
            error
        );

    }

};


/* =========================================================
   NORMAL SPEECH SYNTHESIS
   ========================================================= */

function speakReply(text) {

    if (
        !("speechSynthesis" in window)
    ) {
        return;
    }


    speechSynthesis.cancel();


    const speech =
        new SpeechSynthesisUtterance(
            text
        );


    speech.lang =
        "hi-IN";


    speech.rate =
        1;


    speech.pitch =
        1;


    speech.volume =
        1;


    const micButton =
        document.querySelector(
            ".mic-button"
        );


    speech.onstart =
        function () {

            if (micButton) {

                micButton.classList.add(
                    "speaking"
                );

            }

        };


    speech.onend =
        function () {

            if (micButton) {

                micButton.classList.remove(
                    "speaking"
                );

            }

        };


    speechSynthesis.speak(
        speech
    );

}


/* =========================================================
   GEMINI TTS
   ========================================================= */

async function speakGeminiReply(text) {

    if (
        !text ||
        !text.trim()
    ) {
        return;
    }


    try {

        const response =
            await fetch(
                "chat.php",
                {

                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        action: "tts",

                        text: text

                    })

                }
            );


        const data =
            await response.json();


        if (
            !data.success ||
            !data.audio
        ) {

            console.error(
                "TTS error:",
                data.error
            );

            return;

        }


        await playGeminiPCM(
            data.audio,
            data.mimeType
        );


    } catch (error) {

        console.error(
            "Gemini TTS error:",
            error
        );

    }

}


/* =========================================================
   PLAY GEMINI TTS AUDIO
   ========================================================= */

async function playGeminiPCM(
    base64Audio,
    mimeType
) {

    try {

        const binary =
            atob(base64Audio);


        const pcmData =
            new Uint8Array(
                binary.length
            );


        for (
            let i = 0;
            i < binary.length;
            i++
        ) {

            pcmData[i] =
                binary.charCodeAt(i);

        }


        const wavBuffer =
            createWavFile(
                pcmData,
                24000,
                1,
                16
            );


        const blob =
            new Blob(
                [wavBuffer],
                {
                    type:
                        "audio/wav"
                }
            );


        const url =
            URL.createObjectURL(
                blob
            );


        const audio =
            new Audio(url);


        audio.volume =
            1;


        audio.onended =
            function () {

                URL.revokeObjectURL(
                    url
                );

            };


        await audio.play();


    } catch (error) {

        console.error(
            "PCM error:",
            error
        );

    }

}


/* =========================================================
   CREATE WAV
   ========================================================= */

function createWavFile(
    pcmData,
    sampleRate,
    channels,
    bitsPerSample
) {

    const blockAlign =
        channels *
        bitsPerSample /
        8;


    const byteRate =
        sampleRate *
        blockAlign;


    const buffer =
        new ArrayBuffer(
            44 +
            pcmData.length
        );


    const view =
        new DataView(
            buffer
        );


    function writeString(
        offset,
        string
    ) {

        for (
            let i = 0;
            i < string.length;
            i++
        ) {

            view.setUint8(
                offset + i,
                string.charCodeAt(i)
            );

        }

    }


    writeString(
        0,
        "RIFF"
    );


    view.setUint32(
        4,
        36 + pcmData.length,
        true
    );


    writeString(
        8,
        "WAVE"
    );


    writeString(
        12,
        "fmt "
    );


    view.setUint32(
        16,
        16,
        true
    );


    view.setUint16(
        20,
        1,
        true
    );


    view.setUint16(
        22,
        channels,
        true
    );


    view.setUint32(
        24,
        sampleRate,
        true
    );


    view.setUint32(
        28,
        byteRate,
        true
    );


    view.setUint16(
        32,
        blockAlign,
        true
    );


    view.setUint16(
        34,
        bitsPerSample,
        true
    );


    writeString(
        36,
        "data"
    );


    view.setUint32(
        40,
        pcmData.length,
        true
    );


    new Uint8Array(
        buffer,
        44
    ).set(
        pcmData
    );


    return buffer;

}


/* =========================================================
   LIVE UI STATUS
========================================================= */

function setLEPSAStatus(text) {
    const status = document.querySelector(".status");
    if (status) status.textContent = "● " + text;
}

/* =========================================================
   GEMINI LIVE
   ========================================================= */

let liveActive =
    false;

let liveSocket =
    null;

let liveAudioContext =
    null;

let liveMediaStream =
    null;

let liveMicSource =
    null;

let liveProcessor =
    null;

let liveSetupComplete =
    false;

let liveNextPlayTime =
    0;

let liveAudioSources =
    [];


/* =========================================================
   LIVE BUTTON
   ========================================================= */

/* =========================================================
   STABLE VOICE-TO-VOICE ASSISTANT (FAST ZERO-LATENCY)
   ========================================================= */

let lepsaVoiceActive = false;
let lepsaRecognizer = null;
 
  // Hardware pop/click sound ko rokne ke liye audio stream active rakhein
let audioHardwareKeeper = null;

function keepAudioHardwareAwake() {
    if (!audioHardwareKeeper) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            gain.gain.value = 0.00001; // Insan ke kaan ko sunai nahi dega
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            audioHardwareKeeper = ctx;
        } catch (e) {}
    }
}


// Bulletproof Natural Voice Engine
function speakFastReply(text) {
    if (!('speechSynthesis' in window)) {
        console.error("SpeechSynthesis support nahi hai.");
        return;
    }

    window.speechSynthesis.cancel();

    // Symbols aur tags saaf karein
    let cleanText = text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[*#_~`>]/g, '')
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Available voices check karein
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
        const bestVoice = voices.find(v => 
            v.name.includes("Google हिन्दी") || 
            v.name.includes("Google Hindi") || 
            v.name.includes("Swara") || 
            v.name.includes("Madhur") ||
            v.lang === "hi-IN"
        ) || voices.find(v => 
            v.name.includes("India") || 
            v.lang === "en-IN"
        );

        if (bestVoice) {
            utterance.voice = bestVoice;
        }
    }

    utterance.lang = "hi-IN";
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const micButton = document.querySelector(".mic-button");

    utterance.onstart = function () {
        if (micButton) {
            micButton.classList.remove("listening");
            micButton.classList.add("speaking");
        }
        setLEPSAStatus("Speaking...");
    };

            utterance.onend = function () {
        if (micButton) micButton.classList.remove("speaking");

        const modal = document.getElementById("lepsaVoiceModal");
        const isModalOpen = modal && modal.style.display === "flex";

        if (isModalOpen) {
            // Turant start karne ki jagah status update karein
            updateVoiceModalStatus("Listening...", "Boliye, sun raha hu...");
            
            // Thoda smooth delay dekar start karein taaki beep/speaker pop na kare
            setTimeout(function () {
                if (modal.style.display === "flex") {
                    startLEPSAVoice();
                }
            }, 800);
        } else {
            setLEPSAStatus("Online");
            lepsaVoiceActive = false;
        }
    };
    
    

    utterance.onerror = function (e) {
        console.error("Speech Error:", e);
        if (micButton) micButton.classList.remove("speaking");
        setLEPSAStatus("Online");
        lepsaVoiceActive = false;
    };

    // Chrome audio policy ke liye resume zaroori hai
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
}



/* =========================================================
   GEMINI-STYLE SEPARATE VOICE CONTROLLER
   ========================================================= */

window.toggleLEPSALive = function () {
    openVoiceMode();
};

window.openVoiceMode = function () {
    keepAudioHardwareAwake();
    const modal = document.getElementById("lepsaVoiceModal");
    if (modal) {
        modal.style.display = "flex";
    }
    updateVoiceModalStatus("Listening...", "Boliye, sun raha hu...");
    startLEPSAVoice();
};

window.closeVoiceMode = function () {
    const modal = document.getElementById("lepsaVoiceModal");
    if (modal) {
        modal.style.display = "none";
    }
    stopLEPSAVoice();
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
};

function updateVoiceModalStatus(status, text) {
    const statusLabel = document.getElementById("voiceStatusText");
    const textLabel = document.getElementById("voiceLiveText");
    const orb = document.getElementById("modalVoiceOrb");

    if (statusLabel) statusLabel.textContent = status;
    if (textLabel && text) textLabel.textContent = text;

    if (orb) {
        if (status === "Listening...") {
            orb.classList.add("listening");
        } else {
            orb.classList.remove("listening");
        }
    }
}


function startLEPSAVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Aapke browser me voice recognition support nahi hai. Chrome browser use karein.");
        return;
    }

    // Agar pehle se kuch bol raha ho to rok do
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }

    lepsaVoiceActive = true;
    const micButton = document.querySelector(".mic-button");
    if (micButton) micButton.classList.add("listening");
    setLEPSAStatus("Listening...");

    lepsaRecognizer = new SpeechRecognition();
    lepsaRecognizer.lang = "hi-IN";
    lepsaRecognizer.continuous = false;
    lepsaRecognizer.interimResults = false;

    lepsaRecognizer.onresult = async function (event) {
        const text = event.results[0][0].transcript.trim();
        if (!text) return;

        // User ka bolna screen par add karein
        addMessage(text, "user", false);
        updateVoiceModalStatus("Thinking...", "Aapne kaha: " + text);
        
        chatHistory.push({ role: "user", text: text, type: "user" });
        saveHistory();

        if (micButton) {
            micButton.classList.remove("listening");
        }
        setLEPSAStatus("Thinking...");

        try {
            // Gemini API se direct answer mangwayein
                        // Voice ke liye short aur natural prompt instruction
            const voiceContext = [
                ...chatHistory,
                {
                    role: "user",
                    text: text + " (Note for voice: Answer concisely in natural speaking tone, 2-3 lines only, avoid special symbols/bullet points)"
                }
            ];

            const response = await fetch("chat.php", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    message: text, 
                    history: voiceContext 
                })
            });
            

            const data = await response.json();
            const reply = data.reply || "Koi response nahi mila.";

            // Text screen par dikhayein
            addMessage(reply, "bot", true);
            chatHistory.push({ role: "model", text: reply, type: "bot" });
            saveHistory();

            // Turant aawaz me bolna shuru karein (No delay)
            updateVoiceModalStatus("Speaking...", reply);
            
            speakFastReply(reply);

        } catch (err) {
            console.error(err);
            addMessage("Server error aa gaya.", "bot", false);
            if (micButton) micButton.classList.remove("speaking");
            setLEPSAStatus("Online");
            lepsaVoiceActive = false;
        }
    };

    lepsaRecognizer.onerror = function (event) {
        console.error("Mic error:", event.error);
        stopLEPSAVoice();
    };

    lepsaRecognizer.onend = function () {
        if (!document.querySelector(".mic-button.speaking")) {
            stopLEPSAVoice();
        }
    };

    try {
        lepsaRecognizer.start();
    } catch (e) {
        console.error(e);
        stopLEPSAVoice();
    }
}

function stopLEPSAVoice() {
    lepsaVoiceActive = false;
    if (lepsaRecognizer) {
        try { lepsaRecognizer.stop(); } catch (e) {}
        lepsaRecognizer = null;
    }
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
    const micButton = document.querySelector(".mic-button");
    if (micButton) {
        micButton.classList.remove("listening");
        micButton.classList.remove("speaking");
    }
    setLEPSAStatus("Online");
}




/* =========================================================
   START LIVE
   ========================================================= */

async function startLEPSALive() {

    if (liveActive) {
        return;
    }


    try {

        liveActive =
            true;

        setLEPSAStatus("Connecting...");

        liveSetupComplete =
            false;


        const micButton =
            document.querySelector(
                ".mic-button"
            );


        if (micButton) {

            micButton.classList.add(
                "listening"
            );

        }


        liveAudioContext =
            new (
                window.AudioContext ||
                window.webkitAudioContext
            )();


        await liveAudioContext.resume();

        
                     /* GET KEY FROM BACKEND */
        const response = await fetch("live-token.php", { cache: "no-store" });

        if (!response.ok) {
            throw new Error("Token HTTP error: " + response.status);
        }

        const data = await response.json();

        if (!data.success || !data.key) {
            throw new Error(data.error || "API key nahi mili.");
        }

        const apiKey = data.key;

        /* WEBSOCKET WITH VALID V1ALPHA ENDPOINT */
        const wsUrl = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=" + encodeURIComponent(apiKey);

        liveSocket = new WebSocket(wsUrl);
        
           

        /* =================================================
           SOCKET OPEN
           ================================================= */

        liveSocket.onopen =
            function () {

                /*
                 * AUDIO configuration is supplied by
                 * live-token.php.
                 *
                 * Only model is sent here.
                 */

                const setupMessage = {
    setup: {
        model: "models/gemini-2.0-flash",
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName: "Aoede"
                    }
                }
            }
        },
        systemInstruction: {
            parts: [
                {
                    text: "You are LEPSA AI, a fast real-time voice assistant. Talk naturally and concisely in Hindi and English."
                }
            ]
        }
    }
};



                liveSocket.send(
                    JSON.stringify(
                        setupMessage
                    )
                );


                console.log("LEPSA Live setup sent.");
                setLEPSAStatus("Waiting for Live API...");

            };


        /* =================================================
           SERVER MESSAGE
           ================================================= */
         liveSocket.onmessage =
            async function (event) {

                try {

                    const message =
                        JSON.parse(
                            event.data
                        );


                    console.log(
                        "Gemini Live:",
                        message
                    );


                    /* ERROR */

                    if (
                        message.error
                    ) {

                        console.error("Gemini error:", message.error);
                        setLEPSAStatus("Live error");


                        alert(
                            "Gemini Live error:\n\n" +
                            (
                                message.error.message ||
                                JSON.stringify(
                                    message.error
                                )
                            )
                        );


                        return;

                    }


                    /* SETUP COMPLETE */

                    if (
                        message.setupComplete
                    ) {

                        liveSetupComplete =
                            true;


                        console.log("Live setup complete.");
                        setLEPSAStatus("Listening...");


                        await startLiveMicrophone();


                        return;

                    }


                    if (
                        !message.serverContent
                    ) {

                        return;

                    }


                    const content =
                        message.serverContent;


                    /* AI AUDIO */

                    if (
                        content.modelTurn &&
                        content.modelTurn.parts
                    ) {

                      for (
                            const part
                            of content.modelTurn.parts
                        ) {

                            if (
                                part.inlineData &&
                                part.inlineData.data
                            ) {

                                await playLivePCM(
                                    part.inlineData.data
                                );

                            }

                        }

                    }


                    /* INTERRUPTION */

                    if (
                        content.interrupted
                    ) {

                        stopLivePlayback();

                    }

                } catch (error) {

                    console.error(
                        "Live message error:",
                        error
                    );

                }

            };


        /* SOCKET ERROR */

        liveSocket.onerror =
    function (error) {

        console.error(
            "LEPSA WebSocket ERROR:",
            error
        );

        setLEPSAStatus(
            "WebSocket error"
        );

    };


        /* SOCKET CLOSE */

        liveSocket.onclose =
    function (event) {

        console.error(
            "LEPSA WebSocket CLOSED",
            {
                code: event.code,
                reason: event.reason,
                wasClean: event.wasClean
            }
        );

        setLEPSAStatus(
            "Socket closed: " + event.code
        );

        alert(
            "LEPSA Live connection closed.\n\n" +
            "Code: " + event.code + "\n" +
            "Reason: " +
            (event.reason || "No reason provided") +
            "\n\n" +
            "Ab ye exact code dekhkar problem fix karenge."
        );

        liveActive = false;
        liveSetupComplete = false;

        stopLiveMicrophone();
        stopLivePlayback();

        const button =
            document.querySelector(
                ".mic-button"
            );

        if (button) {

            button.classList.remove(
                "listening"
            );

            button.classList.remove(
                "speaking"
            );

        }

    };
                    

  


    } catch (error) {

        console.error(
            "LEPSA Live error:",
            error
        );


        liveActive =
            false;


        liveSetupComplete =
            false;


        stopLiveMicrophone();

        stopLivePlayback();


        const button =
            document.querySelector(
                ".mic-button"
            );


        if (button) {

            button.classList.remove(
                "listening"
            );

            button.classList.remove(
                "speaking"
            );

        }


        alert(
            "Live Assistant start nahi hua:\n\n" +
            error.message
        );

    }

}


/* =========================================================
   LIVE MICROPHONE
   ========================================================= */

async function startLiveMicrophone() {

    if (
        !liveSetupComplete
    ) {

        return;

    }


    try {

        liveMediaStream =
            await navigator.mediaDevices
                .getUserMedia(
                    {
                        audio: {
                            channelCount: 1,
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        }
                    }
                );


        liveMicSource =
            liveAudioContext
                .createMediaStreamSource(
                    liveMediaStream
                );


        liveProcessor =
            liveAudioContext
                .createScriptProcessor(
                    4096,
                    1,
                    1
                );


        liveProcessor.onaudioprocess =
            function (event) {

                if (
                    !liveActive ||
                    !liveSetupComplete ||
                    !liveSocket ||
                    liveSocket.readyState !==
                        WebSocket.OPEN
                ) {

                    return;

                }


                const input =
                    event.inputBuffer
                        .getChannelData(
                            0
                        );


                const pcm16 =
                    convertFloat32ToPCM16(
                        input,
                        liveAudioContext.sampleRate,
                        16000
                    );


                const base64 =
                    arrayBufferToBase64(
                        pcm16.buffer
                    );


                liveSocket.send(
                    JSON.stringify(
                        {

                            realtimeInput: {

                                audio: {

                                    data:
                                        base64,

                                    mimeType:
                                        "audio/pcm;rate=16000"

                                }

                            }

                        }
                    )
                );

            };


        liveMicSource.connect(
            liveProcessor
        );


        const silentGain =
            liveAudioContext
                .createGain();


        silentGain.gain.value =
            0;


        liveProcessor.connect(
            silentGain
        );


        silentGain.connect(
            liveAudioContext.destination
        );


        console.log("LEPSA Live microphone started.");
        setLEPSAStatus("Listening...");


    } catch (error) {

        console.error(
            "Microphone error:",
            error
        );


        alert(
            "Microphone start nahi hua:\n\n" +
            error.message
        );


        stopLEPSALive();

    }

}


/* =========================================================
   FLOAT32 TO PCM16
   ========================================================= */

function convertFloat32ToPCM16(
    input,
    inputSampleRate,
    targetSampleRate
) {

    if (
        inputSampleRate ===
        targetSampleRate
    ) {

        const output =
            new Int16Array(
                input.length
            );


        for (
            let i = 0;
            i < input.length;
            i++
        ) {

            const sample =
                Math.max(
                    -1,
                    Math.min(
                        1,
                        input[i]
                    )
                );


            output[i] =
                sample < 0
                    ? sample * 32768
                    : sample * 32767;

        }


        return output;

    }


    const ratio =
        inputSampleRate /
        targetSampleRate;


    const newLength =
        Math.round(
            input.length /
            ratio
        );


    const output =
        new Int16Array(
            newLength
        );


    let resultIndex =
        0;


    let bufferIndex =
        0;


    while (
        resultIndex <
        output.length
    ) {

        const nextIndex =
            Math.round(
                (resultIndex + 1) *
                ratio
            );


        let sum =
            0;


        let count =
            0;


        for (
            let i =
                bufferIndex;

            i <
                nextIndex &&
            i <
                input.length;

            i++
        ) {

            sum +=
                input[i];

            count++;

        }


        const sample =
            count
                ? sum / count
                : 0;


        const value =
            Math.max(
                -1,
                Math.min(
                    1,
                    sample
                )
            );


        output[resultIndex] =
            value < 0
                ? value * 32768
                : value * 32767;


        resultIndex++;

        bufferIndex =
            nextIndex;

    }


    return output;

}


/* =========================================================
   ARRAY BUFFER TO BASE64
   ========================================================= */

function arrayBufferToBase64(
    buffer
) {

    const bytes =
        new Uint8Array(
            buffer
        );


    let binary =
        "";


    const chunkSize =
        0x8000;


    for (
        let i = 0;
        i < bytes.length;
        i += chunkSize
    ) {

        const chunk =
            bytes.subarray(
                i,
                Math.min(
                    i + chunkSize,
                    bytes.length
                )
            );


        binary +=
            String.fromCharCode(
                ...chunk
            );

    }


    return btoa(
        binary
    );

}


/* =========================================================
   BASE64 TO INT16
   ========================================================= */

function base64ToInt16(
    base64
) {

    const binary =
        atob(base64);


    const bytes =
        new Uint8Array(
            binary.length
        );


    for (
        let i = 0;
        i < binary.length;
        i++
    ) {

        bytes[i] =
            binary.charCodeAt(i);

    }


    return new Int16Array(
        bytes.buffer
    );

}


/* =========================================================
   PLAY LIVE PCM
   ========================================================= */

async function playLivePCM(
    base64Audio
) {

    if (
        !liveAudioContext
    ) {

        return;

    }


    try {

        if (
            liveAudioContext.state ===
            "suspended"
        ) {

            await liveAudioContext.resume();

        }


        const pcm16 =
            base64ToInt16(
                base64Audio
            );


        const sampleRate =
            24000;


        const audioBuffer =
            liveAudioContext
                .createBuffer(
                    1,
                    pcm16.length,
                    sampleRate
                );


        const channelData =
            audioBuffer.getChannelData(
                0
            );


        for (
            let i = 0;
            i < pcm16.length;
            i++
        ) {

            channelData[i] =
                pcm16[i] / 32768;

        }


        const source =
            liveAudioContext
                .createBufferSource();


        source.buffer =
            audioBuffer;


        source.connect(
            liveAudioContext.destination
        );


        const now =
            liveAudioContext.currentTime;


        if (
            liveNextPlayTime <
            now
        ) {

            liveNextPlayTime =
                now;

        }


        source.start(
            liveNextPlayTime
        );


        liveNextPlayTime +=
            audioBuffer.duration;


        liveAudioSources.push(
            source
        );


        const button =
            document.querySelector(
                ".mic-button"
            );


        if (button) {

            button.classList.add(
                "speaking"
            );

        }


        source.onended =
              function () {

                const index =
                    liveAudioSources.indexOf(
                        source
                    );


                if (
                    index !== -1
                ) {

                    liveAudioSources.splice(
                        index,
                        1
                    );

                }


                if (
                    liveAudioSources.length ===
                        0 &&
                    button
                ) {

                    button.classList.remove(
                        "speaking"
                    );

                }

            };


    } catch (error) {

        console.error(
            "Live audio error:",
            error
        );

    }

}


/* =========================================================
   STOP LIVE PLAYBACK
   ========================================================= */

function stopLivePlayback() {

    liveNextPlayTime =
        0;


    liveAudioSources.forEach(
        function (source) {

            try {

                source.stop();

            } catch (error) {}

        }
    );


    liveAudioSources =
        [];


    const button =
        document.querySelector(
            ".mic-button"
        );


    if (button) {

        button.classList.remove(
            "speaking"
        );

    }

}


/* =========================================================
   STOP LIVE MICROPHONE
   ========================================================= */

function stopLiveMicrophone() {

    if (
        liveProcessor
    ) {

        try {

            liveProcessor.disconnect();

        } catch (error) {}


        liveProcessor =
            null;

    }


    if (
        liveMicSource
    ) {

        try {

            liveMicSource.disconnect();

        } catch (error) {}


        liveMicSource =
            null;

    }


    if (
        liveMediaStream
    ) {

        liveMediaStream
            .getTracks()
            .forEach(
                function (track) {

                    track.stop();

                }
            );


        liveMediaStream =
            null;

    }

}


/* =========================================================
   STOP LIVE ASSISTANT
   ========================================================= */

function stopLEPSALive() {

    liveActive =
        false;


    liveSetupComplete =
        false;


    stopLiveMicrophone();

    stopLivePlayback();


    if (
        liveSocket
    ) {

        try {

            if (
                liveSocket.readyState ===
                    WebSocket.OPEN ||

                liveSocket.readyState ===
                    WebSocket.CONNECTING
            ) {

                liveSocket.close();

            }

        } catch (error) {

            console.error(
                "Socket close error:",
                error
            );

        }


        liveSocket =
            null;

    }


    if (
        liveAudioContext
    ) {

        try {

            liveAudioContext.close();

        } catch (error) {}


        liveAudioContext =
            null;

    }


    const button =
        document.querySelector(
            ".mic-button"
        );


    if (button) {

        button.classList.remove(
            "listening"
        );

        button.classList.remove(
            "speaking"
        );

    }

}


/* =====================================================
   LEPSA HEADER MENU
===================================================== */

window.toggleHeaderMenu = function () {

    const menu =
        document.getElementById("headerMenu");

    if (!menu) return;

    menu.classList.toggle("show");
};


window.closeHeaderMenu = function () {

    const menu =
        document.getElementById("headerMenu");

    if (!menu) return;

    menu.classList.remove("show");
};


/* Close menu when clicking outside */

document.addEventListener(
    "click",
    function (event) {

        const wrap =
            document.querySelector(
                ".header-menu-wrap"
            );

        if (!wrap) return;

        if (!wrap.contains(event.target)) {

            closeHeaderMenu();

        }

    }
);


/* =====================================================
   SHARE CURRENT CHAT
===================================================== */

window.shareCurrentChat = async function () {

    const messages =
        document.getElementById("messages");

    if (!messages) return;

    const text =
        messages.innerText.trim();

    if (!text) {

        alert("There is no message to share.");

        return;
    }


    const shareText =
        "LEPSA AI Chat\n\n" + text;


    try {

        if (
            navigator.share
        ) {

            await navigator.share({

                title: "LEPSA AI",

                text: shareText

            });

        } else if (
            navigator.clipboard
        ) {

            await navigator.clipboard.writeText(
                shareText
            );

            alert(
                "Chat copied to clipboard."
            );

        } else {

            alert(
                "Sharing is not supported on this browser."
            );

        }

    } catch (error) {

        console.log(
            "Share cancelled or failed:",
            error
        );

    }
};


/* =====================================================
   PIN CHAT
===================================================== */

window.pinCurrentChat = function () {

    try {

        localStorage.setItem(
            "lepsaPinnedChat",
            JSON.stringify(chatHistory)
        );

        alert(
            "📌 Chat pinned successfully."
        );

    } catch (error) {

        console.error(
            "Pin error:",
            error
        );

        alert(
            "Unable to pin this chat."
        );

    }
};


/* =====================================================
   ADD TO HOME SCREEN
===================================================== */

let deferredInstallPrompt = null;


window.addEventListener(
    "beforeinstallprompt",
    function (event) {

        event.preventDefault();

        deferredInstallPrompt = event;

        console.log(
            "LEPSA install prompt ready."
        );

    }
);


window.addToHomeScreen = async function () {

    /*
     * Android Chrome / supported browsers
     */

    if (deferredInstallPrompt) {

        deferredInstallPrompt.prompt();

        const result =
            await deferredInstallPrompt.userChoice;

        console.log(
            "Install result:",
            result.outcome
        );

        deferredInstallPrompt = null;

        return;
    }


    /*
     * If already installed
     */

    if (
        window.matchMedia(
            "(display-mode: standalone)"
        ).matches
    ) {

        alert(
            "LEPSA is already on your Home Screen."
        );

        return;
    }


    /*
     * Browser doesn't expose
     * automatic install prompt.
     */

    alert(
        "Browser menu ⋮ खोलें और 'Add to Home screen' चुनें."
    );

};
/* =====================================================
   ATTACHMENT FUNCTIONS
===================================================== */

window.toggleAttachMenu = function () {
    const menu = document.getElementById("attachMenu");
    if (!menu) return;

    menu.classList.toggle("show");
};

window.closeAttachMenu = function () {
    const menu = document.getElementById("attachMenu");
    if (!menu) return;

    menu.classList.remove("show");
};

window.openCamera = function () {
    const input = document.getElementById("cameraInput");
    if (input) {
        input.click();
    }
};

window.openPhotos = function () {
    const input = document.getElementById("photoInput");
    if (input) {
        input.click();
    }
};

window.openFiles = function () {
    const input = document.getElementById("fileInput");
    if (input) {
        input.click();
    }
};
// =====================================
// LEPSA VOICE ORB
// =====================================

const voiceButton = document.getElementById("voiceButton");

if (voiceButton) {

    voiceButton.addEventListener("click", () => {

        voiceButton.classList.toggle("listening");

        const isListening =
            voiceButton.classList.contains("listening");

        voiceButton.setAttribute(
            "aria-label",
            isListening
                ? "Stop voice chat"
                : "Start voice chat"
        );

    });

}

    window.selectedEngine = "fast";

function switchEngine(mode, btn) {
    window.selectedEngine = mode;
    document.querySelectorAll(".mode-chip").forEach(el => el.classList.remove("active"));
    btn.classList.add("active");

    const status = mode === "pro" ? "Deep Think Mode Active" : "Fast Engine Active";
    setLEPSAStatus(status);
}

// Dynamic toggle between Send and Live Voice button
document.addEventListener("DOMContentLoaded", function() {
    const input = document.getElementById("messageInput");
    const orb = document.getElementById("actionOrbIcon");
    const send = document.getElementById("actionSendIcon");

    if (input) {
        input.addEventListener("input", function() {
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
    if (input && input.value.trim().length > 0) {
        sendMessage();
        const orb = document.getElementById("actionOrbIcon");
        const send = document.getElementById("actionSendIcon");
        if (orb) orb.style.display = "flex";
        if (send) send.style.display = "none";
    } else {
        toggleLEPSALive();
    }
}
