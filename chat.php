<?php

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

require_once __DIR__ . "/config.php";

$openRouterKey = defined('OPENROUTER_API_KEY') ? OPENROUTER_API_KEY : "";
$elevenLabsKey = defined('ELEVENLABS_API_KEY') ? ELEVENLABS_API_KEY : "";

// =====================================================
// CRASH-PROOF SESSION & USER CREDIT CHECK
// =====================================================

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
$userId = $_SESSION["user_id"] ?? null;

$dbFile = __DIR__ . "/lepsa_users.sqlite";
$db = null;
$memoryFacts = [];

if ($userId && file_exists($dbFile)) {
    try {
        $db = new SQLite3($dbFile);
        $stmt = @$db->prepare("SELECT credits, tier FROM users WHERE id = :id LIMIT 1");
        if ($stmt) {
            $stmt->bindValue(":id", $userId, SQLITE3_INTEGER);
            $res = $stmt->execute();
            $userRow = $res ? $res->fetchArray(SQLITE3_ASSOC) : null;

            if ($userRow && isset($userRow["credits"]) && intval($userRow["credits"]) <= 0 && ($userRow["tier"] ?? 'free') === 'free') {
                echo json_encode([
                    "success" => false,
                    "reply" => "⚠️ Aapke daily free credits khatam ho gaye hain! Naya plan upgrade karein."
                ], JSON_UNESCAPED_UNICODE);
                exit;
            }
        }

        // ---- MEMORY: table (agar na ho to bana do) ----
        $db->exec("
            CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                fact TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ");

        // ---- CONVERSATION HISTORY: tables (agar na ho to bana do) ----
        $db->exec("
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL DEFAULT 'New Chat',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ");
        $db->exec("
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ");

        // ---- MEMORY: is user ki purani saved facts load karo ----
        $memStmt = @$db->prepare("SELECT fact FROM memories WHERE user_id = :id ORDER BY id DESC LIMIT 40");
        if ($memStmt) {
            $memStmt->bindValue(":id", $userId, SQLITE3_INTEGER);
            $memRes = $memStmt->execute();
            if ($memRes) {
                while ($row = $memRes->fetchArray(SQLITE3_ASSOC)) {
                    $memoryFacts[] = $row["fact"];
                }
            }
        }
        $memoryFacts = array_reverse($memoryFacts); // purani se nayi order

    } catch (Exception $e) {
        // Safe bypass
    }
}

/* =====================================================
   READ INPUT REQUEST
===================================================== */

$rawInput = file_get_contents("php://input");
$input = json_decode($rawInput, true);

if (!is_array($input)) {
    echo json_encode([
        "success" => false,
        "reply" => "⚠️ Invalid request format received."
    ]);
    exit;
}

/* =====================================================
   TTS HANDLER (ELEVENLABS TURBO + GOOGLE FALLBACK)
===================================================== */

if (($input["action"] ?? "") === "tts") {
    $ttsText = trim($input["text"] ?? "");
    $ttsText = mb_substr($ttsText, 0, 250, "UTF-8");

    if ($ttsText === "") {
        echo json_encode(["success" => false, "error" => "Text is empty."]);
        exit;
    }

    $elevenError = null;

    if (!empty($elevenLabsKey)) {
        $voiceId = "21m00Tcm4TlvDq8ikWAM"; // Rachel Multilingual
        $url = "https://api.elevenlabs.io/v1/text-to-speech/" . $voiceId . "?optimize_streaming_latency=4";

        $payload = json_encode([
            "text" => $ttsText,
            "model_id" => "eleven_turbo_v2_5",
            "voice_settings" => [
                "stability" => 0.45,
                "similarity_boost" => 0.8,
                "style" => 0.0,
                "use_speaker_boost" => true
            ]
        ]);

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Content-Type: application/json",
            "Accept: audio/mpeg",
            "xi-api-key: " . trim($elevenLabsKey)
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_BINARYTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);

        $audioData = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($httpCode === 200 && !empty($audioData) && strpos($audioData, "{") !== 0) {
            echo json_encode([
                "success" => true,
                "audio" => base64_encode($audioData),
                "mimeType" => "audio/mpeg",
                "engine" => "elevenlabs"
            ]);
            exit;
        }

        $errResponse = json_decode($audioData, true);
        $detail = $errResponse["detail"]["message"] ?? $errResponse["detail"] ?? $curlErr ?? ("HTTP Code: " . $httpCode);
        $elevenError = is_array($detail) ? json_encode($detail) : $detail;
    } else {
        $elevenError = "ELEVENLABS_API_KEY missing in config.php";
    }

    // Google TTS Fallback
    $gUrl = "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=hi&q=" . urlencode(mb_substr($ttsText, 0, 200, "UTF-8"));

    $ch = curl_init($gUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_BINARYTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    curl_setopt($ch, CURLOPT_TIMEOUT, 12);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Referer: https://translate.google.com/"
    ]);
    $gAudio = curl_exec($ch);
    $gHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $gCurlErr = curl_error($ch);
    curl_close($ch);

    if ($gHttpCode === 200 && !empty($gAudio)) {
        echo json_encode([
            "success" => true,
            "audio" => base64_encode($gAudio),
            "mimeType" => "audio/mpeg",
            "engine" => "google_fallback",
            "debug_eleven_error" => $elevenError
        ]);
    } else {
        echo json_encode([
            "success" => false,
            "error" => "TTS Failed. ElevenLabs Error: " . $elevenError . " | Google: " . $gCurlErr
        ]);
    }
    exit;
}

/* =====================================================
   MEMORY: list / clear (user control & transparency)
===================================================== */

if (($input["action"] ?? "") === "list_memory") {
    $facts = [];
    if ($userId && $db) {
        $stmt = @$db->prepare("SELECT id, fact, created_at FROM memories WHERE user_id = :id ORDER BY id DESC");
        if ($stmt) {
            $stmt->bindValue(":id", $userId, SQLITE3_INTEGER);
            $res = $stmt->execute();
            if ($res) {
                while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
                    $facts[] = $row;
                }
            }
        }
    }
    echo json_encode(["success" => true, "memories" => $facts]);
    exit;
}

if (($input["action"] ?? "") === "clear_memory") {
    if ($userId && $db) {
        @$db->exec("DELETE FROM memories WHERE user_id = " . intval($userId));
    }
    echo json_encode(["success" => true]);
    exit;
}

/* =====================================================
   CONVERSATION HISTORY: list / get / new / delete / rename
===================================================== */

if (($input["action"] ?? "") === "list_conversations") {
    $convos = [];
    if ($userId && $db) {
        $stmt = @$db->prepare("SELECT id, title, updated_at FROM conversations WHERE user_id = :id ORDER BY updated_at DESC LIMIT 100");
        if ($stmt) {
            $stmt->bindValue(":id", $userId, SQLITE3_INTEGER);
            $res = $stmt->execute();
            if ($res) {
                while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
                    $convos[] = $row;
                }
            }
        }
    }
    echo json_encode(["success" => true, "conversations" => $convos]);
    exit;
}

if (($input["action"] ?? "") === "get_conversation") {
    $convId = intval($input["conversation_id"] ?? 0);
    $msgs = [];
    if ($userId && $db && $convId > 0) {
        // Ownership check — sirf apni hi conversation access kar sake
        $ownStmt = @$db->prepare("SELECT id FROM conversations WHERE id = :cid AND user_id = :uid LIMIT 1");
        $ownStmt->bindValue(":cid", $convId, SQLITE3_INTEGER);
        $ownStmt->bindValue(":uid", $userId, SQLITE3_INTEGER);
        $ownRes = $ownStmt->execute();
        if ($ownRes && $ownRes->fetchArray(SQLITE3_ASSOC)) {
            $stmt = @$db->prepare("SELECT role, content FROM chat_messages WHERE conversation_id = :cid ORDER BY id ASC");
            $stmt->bindValue(":cid", $convId, SQLITE3_INTEGER);
            $res = $stmt->execute();
            if ($res) {
                while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
                    $msgs[] = $row;
                }
            }
        }
    }
    echo json_encode(["success" => true, "messages" => $msgs]);
    exit;
}

if (($input["action"] ?? "") === "delete_conversation") {
    $convId = intval($input["conversation_id"] ?? 0);
    if ($userId && $db && $convId > 0) {
        $ownStmt = @$db->prepare("SELECT id FROM conversations WHERE id = :cid AND user_id = :uid LIMIT 1");
        $ownStmt->bindValue(":cid", $convId, SQLITE3_INTEGER);
        $ownStmt->bindValue(":uid", $userId, SQLITE3_INTEGER);
        $ownRes = $ownStmt->execute();
        if ($ownRes && $ownRes->fetchArray(SQLITE3_ASSOC)) {
            @$db->exec("DELETE FROM chat_messages WHERE conversation_id = " . $convId);
            @$db->exec("DELETE FROM conversations WHERE id = " . $convId);
        }
    }
    echo json_encode(["success" => true]);
    exit;
}

if (($input["action"] ?? "") === "rename_conversation") {
    $convId = intval($input["conversation_id"] ?? 0);
    $newTitle = trim(mb_substr($input["title"] ?? "", 0, 60, "UTF-8"));
    if ($userId && $db && $convId > 0 && $newTitle !== "") {
        $stmt = @$db->prepare("UPDATE conversations SET title = :t WHERE id = :cid AND user_id = :uid");
        if ($stmt) {
            $stmt->bindValue(":t", $newTitle, SQLITE3_TEXT);
            $stmt->bindValue(":cid", $convId, SQLITE3_INTEGER);
            $stmt->bindValue(":uid", $userId, SQLITE3_INTEGER);
            @$stmt->execute();
        }
    }
    echo json_encode(["success" => true]);
    exit;
}

/* =====================================================
   OPENROUTER KEY VALIDATION
===================================================== */

if (empty($openRouterKey)) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "reply" => "⚠️ OPENROUTER_API_KEY config.php mein missing hai."
    ]);
    exit;
}

/* =====================================================
   PRO CORE INTELLIGENCE & LANGUAGE MIRRORING
===================================================== */

$appMode = trim($input["app_mode"] ?? "code");
$isVoiceMode = ($input["mode"] ?? "") === "voice";

$systemInstruction = "
You are LEPSA AI, a cutting-edge, elite AI assistant created and owned by Saurav.

STRICT LANGUAGE MATCHING RULES:
1. MATCH THE USER'S EXACT LANGUAGE & SCRIPT:
   - If user asks in English -> Respond ONLY in natural, fluent, professional English. Never translate into Hindi.
   - If user asks in Hinglish (Roman script Hindi like 'kya kar rahe ho', 'kaise ho', 'mera code check karo') -> Respond ONLY in natural Hinglish using the Latin/Roman English alphabet. NEVER use Devanagari Hindi script for Hinglish queries.
   - If user asks in Devanagari script (हिंदी) -> Respond in polite, grammatically correct Hindi script.
2. NEVER use literal or broken translations. Speak naturally like an expert human colleague.
3. Be confident, precise, direct, and zero-fluff.
";

if ($appMode === "code") {
    $systemInstruction .= "\nCORE: SOFTWARE & SYSTEMS ARCHITECT
- Write clean, production-grade, secure code (Python, C++, JS, PHP, SQL).
- Point out bugs immediately, provide fixed code inside markdown, and state time/space complexity.";
} elseif ($appMode === "business") {
    $systemInstruction .= "\nCORE: B2B SALES & CLIENT CONSULTANT
- Deliver persuasive, polite, and executive-level business communication.
- Focus on answering customer queries, taking appointment details, and resolving pain points.";
} elseif ($appMode === "study") {
    $systemInstruction .= "\nCORE: ACADEMIC & COMPETITIVE EXAM MENTOR
- Break down complex engineering, science, and exam concepts with intuitive mental models.
- Give crisp formula revisions and end with a quick practice question.";
}

if ($isVoiceMode) {
    $systemInstruction .= "\nVOICE CONVERSATION ACTIVE:
- Limit response to 2 to 3 natural spoken sentences matching user tongue (English or Hinglish).
- Strictly NO markdown formatting, asterisks, bullet points, or code blocks.";
}

/* =====================================================
   MEMORY: purani saved facts context me do + naye facts
   save karne ka tareeka batao
===================================================== */

if (!empty($memoryFacts)) {
    $systemInstruction .= "\n\nWHAT YOU REMEMBER ABOUT THIS USER (use naturally, don't recite the list):\n";
    foreach ($memoryFacts as $fact) {
        $systemInstruction .= "- " . $fact . "\n";
    }
}

if ($userId) {
    $systemInstruction .= "\n\nMEMORY SAVING RULE:
If the user shares a durable personal fact worth remembering for future chats (their name, profession, city, a strong preference, an ongoing project, a goal) — and it is NOT already in the remembered list above — append ONE short line at the very end of your reply in this exact hidden format:
[MEMORY]short fact in third person, under 15 words[/MEMORY]
Only do this for genuinely new, important, durable facts. Do NOT do this for casual chat, questions, or one-off requests. Never mention this tag to the user, never explain it — it is invisible to them.";
}

/* =====================================================
   REAL-TIME SEARCH ENGINE (DuckDuckGo API)
===================================================== */

function fetchWebResults($query) {
    $cleanQuery = urlencode(trim($query));
    $url = "https://api.duckduckgo.com/?q={$cleanQuery}&format=json&no_html=1&skip_disambig=1";

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 6);
    curl_setopt($ch, CURLOPT_USERAGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    $res = curl_exec($ch);
    curl_close($ch);

    if (!$res) return ["context" => "", "sources" => []];

    $data = json_decode($res, true);
    $context = "";
    $sources = [];

    if (!empty($data["AbstractText"])) {
        $context .= $data["AbstractText"] . "\n";
        if (!empty($data["AbstractURL"])) {
            $sources[] = [
                "title" => $data["Heading"] ?: "Primary Source",
                "url" => $data["AbstractURL"]
            ];
        }
    }

    if (!empty($data["RelatedTopics"]) && is_array($data["RelatedTopics"])) {
        $count = 0;
        foreach ($data["RelatedTopics"] as $topic) {
            if (isset($topic["Text"]) && isset($topic["FirstURL"])) {
                $context .= "- " . $topic["Text"] . "\n";
                $sources[] = [
                    "title" => mb_substr($topic["Text"], 0, 30) . "...",
                    "url" => $topic["FirstURL"]
                ];
                $count++;
                if ($count >= 3) break;
            }
        }
    }

    return [
        "context" => trim($context),
        "sources" => $sources
    ];
}

/* =====================================================
   CONVERSATION PAYLOAD
===================================================== */

$message = trim($input["message"] ?? "");
$history = $input["history"] ?? [];
$imageBase64 = trim($input["image"] ?? "");

if ($message === "" && $imageBase64 === "") {
    echo json_encode([
        "success" => false,
        "reply" => "Please enter a message."
    ]);
    exit;
}

/* =====================================================
   CONVERSATION HISTORY: is message ko kis conversation me
   save karna hai — existing ya nayi bana do
===================================================== */

$conversationId = null;

if ($userId && $db) {
    $requestedConvId = intval($input["conversation_id"] ?? 0);

    if ($requestedConvId > 0) {
        $ownStmt = @$db->prepare("SELECT id FROM conversations WHERE id = :cid AND user_id = :uid LIMIT 1");
        $ownStmt->bindValue(":cid", $requestedConvId, SQLITE3_INTEGER);
        $ownStmt->bindValue(":uid", $userId, SQLITE3_INTEGER);
        $ownRes = $ownStmt->execute();
        if ($ownRes && $ownRes->fetchArray(SQLITE3_ASSOC)) {
            $conversationId = $requestedConvId;
        }
    }

    if ($conversationId === null) {
        $autoTitle = $message !== "" ? mb_substr($message, 0, 40, "UTF-8") : "New Chat";
        $titleStmt = @$db->prepare("INSERT INTO conversations (user_id, title) VALUES (:uid, :title)");
        if ($titleStmt) {
            $titleStmt->bindValue(":uid", $userId, SQLITE3_INTEGER);
            $titleStmt->bindValue(":title", $autoTitle, SQLITE3_TEXT);
            $titleStmt->execute();
            $conversationId = $db->lastInsertRowID();
        }
    }

    if ($conversationId) {
        $saveUserMsg = @$db->prepare("INSERT INTO chat_messages (conversation_id, role, content) VALUES (:cid, 'user', :content)");
        if ($saveUserMsg) {
            $saveUserMsg->bindValue(":cid", $conversationId, SQLITE3_INTEGER);
            $saveUserMsg->bindValue(":content", ($message !== "" ? $message : "[Image attached]"), SQLITE3_TEXT);
            @$saveUserMsg->execute();
        }
        @$db->exec("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = " . intval($conversationId));
    }
}

$searchSources = [];
$searchTriggers = ['latest', 'aaj', 'today', 'current', 'news', 'update', 'price', 'rate', 'who is', 'kon hai', 'kab'];
$needsSearch = false;
$lowerMsg = strtolower($message);

foreach ($searchTriggers as $trig) {
    if (strpos($lowerMsg, $trig) !== false) {
        $needsSearch = true;
        break;
    }
}

if ($needsSearch) {
    $webData = fetchWebResults($message);
    if (!empty($webData["context"])) {
        $systemInstruction .= "\n\nLIVE WEB CONTEXT:\n" . $webData["context"] . "\nUse this up-to-date web information to answer.";
        $searchSources = $webData["sources"];
    }
}

$contents = [];

if (is_array($history)) {
    foreach ($history as $item) {
        if (!is_array($item)) continue;
        $text = trim((string)($item["text"] ?? ""));
        if ($text === "") continue;

        $role = in_array(($item["role"] ?? ""), ["model", "bot", "assistant"]) ? "assistant" : "user";
        $contents[] = [
            "role" => $role,
            "content" => $text
        ];
    }
}

if ($imageBase64 !== "") {
    $imgMimeType = trim($input["mimeType"] ?? "image/jpeg");
    if (strpos($imgMimeType, "image/") !== 0) $imgMimeType = "image/jpeg";

    $contents[] = [
        "role" => "user",
        "content" => [
            ["type" => "text", "text" => ($message !== "" ? $message : "Is image ko dhyan se dekho aur batao ismein kya hai. Agar koi sawaal ho to us hisaab se jawab do.")],
            ["type" => "image_url", "image_url" => ["url" => "data:" . $imgMimeType . ";base64," . $imageBase64]]
        ]
    ];
} elseif ($message !== "") {
    $contents[] = [
        "role" => "user",
        "content" => $message
    ];
}

/* =====================================================
   OPENROUTER ENGINE
===================================================== */

function callOpenRouter($apiKey, $contents, $systemInstruction) {
    $url = "https://openrouter.ai/api/v1/chat/completions";

    $messages = array_merge(
        [["role" => "system", "content" => $systemInstruction]],
        $contents
    );

    // Primary Engine: Google Gemini 2.0 Flash
    $payload = [
        "model" => "google/gemini-2.0-flash-exp:free",
        "messages" => $messages,
        "temperature" => 0.65,
        "max_tokens" => 1500
    ];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Content-Type: application/json",
        "Authorization: Bearer " . trim($apiKey),
        "HTTP-Referer: http://127.1.1.0:8080",
        "X-Title: LEPSA AI"
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 12);
    curl_setopt($ch, CURLOPT_TIMEOUT, 25);

    $result = curl_exec($ch);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($result !== false && empty($curlErr)) {
        $res = json_decode($result, true);
        if (isset($res["choices"][0]["message"]["content"])) {
            return [
                "success" => true,
                "reply" => $res["choices"][0]["message"]["content"]
            ];
        }
    }

    // Secondary Engine: LLaMA 3.3 70B Instruct
    return fallbackLlama($apiKey, $messages);
}

function fallbackLlama($apiKey, $messages) {
    $url = "https://openrouter.ai/api/v1/chat/completions";

    $payload = [
        "model" => "gemini-2.5-flash",
        "messages" => $messages,
        "temperature" => 0.65,
        "max_tokens" => 1200
    ];

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Content-Type: application/json",
        "Authorization: Bearer " . trim($apiKey),
        "HTTP-Referer: http://127.1.1.0:8080",
        "X-Title: LEPSA AI"
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 12);
    curl_setopt($ch, CURLOPT_TIMEOUT, 25);

    $result = curl_exec($ch);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($result === false || !empty($curlErr)) {
        return [
            "success" => false,
            "reply" => "⚠️ Server connection failed: " . $curlErr
        ];
    }

    $res = json_decode($result, true);
    if (isset($res["choices"][0]["message"]["content"])) {
        return [
            "success" => true,
            "reply" => $res["choices"][0]["message"]["content"]
        ];
    }

    $errMsg = $res["error"]["message"] ?? "AI service temporarily unavailable.";
    return [
        "success" => false,
        "reply" => "⚠️ " . $errMsg
    ];
}

/* =====================================================
   STREAMING ENGINE (Server-Sent Events)
   [MEMORY] tag ko live output me kabhi nahi dikhata — jaise hi
   tag ka start detect hota hai, stream wahi se aage chup ho jaata hai.
===================================================== */

function streamOpenRouterAndSave($apiKey, $contents, $systemInstruction, $userId, $db, $conversationId, $searchSources) {
    header("Content-Type: text/event-stream");
    header("Cache-Control: no-cache");
    header("X-Accel-Buffering: no");
    header("Connection: keep-alive");
    while (ob_get_level() > 0) { @ob_end_flush(); }
    @ini_set("zlib.output_compression", "0");

    $messages = array_merge(
        [["role" => "system", "content" => $systemInstruction]],
        $contents
    );

    $fullReply = "";
    $sentText = "";
    $memoryTagStarted = false;
    $gotAnyContent = false;

    $emit = function ($textChunk) {
        if ($textChunk === "") return;
        echo "data: " . json_encode(["delta" => $textChunk], JSON_UNESCAPED_UNICODE) . "\n\n";
        @ob_flush();
        @flush();
    };

    $processDelta = function ($delta) use (&$fullReply, &$sentText, &$memoryTagStarted, $emit) {
        $fullReply .= $delta;
        if ($memoryTagStarted) return;

        $unsent = substr($fullReply, strlen($sentText));
        $tagPos = strpos($unsent, "[MEMORY]");

        if ($tagPos !== false) {
            $safePart = substr($unsent, 0, $tagPos);
            if ($safePart !== "") { $emit($safePart); $sentText .= $safePart; }
            $memoryTagStarted = true;
            return;
        }

        // Last ~15 chars hold back karo — taaki "[MEMORY]" tag chunk-boundary
        // pe split ho to bhi kabhi screen pe flash na ho.
        $holdBack = 15;
        if (strlen($unsent) > $holdBack) {
            $safePart = substr($unsent, 0, strlen($unsent) - $holdBack);
            $emit($safePart);
            $sentText .= $safePart;
        }
    };

    $runStream = function ($model, $maxTokens) use ($apiKey, $messages, $processDelta, &$gotAnyContent) {
        $lineBuffer = "";
        $writeCallback = function ($ch, $data) use (&$lineBuffer, $processDelta, &$gotAnyContent) {
            $lineBuffer .= $data;
            $lines = explode("\n", $lineBuffer);
            $lineBuffer = array_pop($lines);

            foreach ($lines as $line) {
                $line = trim($line);
                if ($line === "" || strpos($line, "data:") !== 0) continue;
                $jsonPart = trim(substr($line, 5));
                if ($jsonPart === "[DONE]") continue;
                $obj = json_decode($jsonPart, true);
                if (isset($obj["choices"][0]["delta"]["content"])) {
                    $gotAnyContent = true;
                    $processDelta($obj["choices"][0]["delta"]["content"]);
                }
            }
            return strlen($data);
        };

        $ch = curl_init("https://openrouter.ai/api/v1/chat/completions");
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Content-Type: application/json",
            "Authorization: Bearer " . trim($apiKey),
            "HTTP-Referer: http://127.1.1.0:8080",
            "X-Title: LEPSA AI"
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
            "model" => $model,
            "messages" => $messages,
            "temperature" => 0.65,
            "max_tokens" => $maxTokens,
            "stream" => true
        ]));
        curl_setopt($ch, CURLOPT_WRITEFUNCTION, $writeCallback);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 12);
        curl_setopt($ch, CURLOPT_TIMEOUT, 45);
        curl_exec($ch);
        curl_close($ch);
    };

    // Primary: Gemini 2.0 Flash (streaming)
    $runStream("google/gemini-2.0-flash-exp:free", 1500);

    // Kuch bhi nahi mila to fallback model bhi stream karke try karo
    if (!$gotAnyContent) {
        $runStream("gemini-2.5-flash", 1200);
    }

    // Agar fir bhi kuch nahi mila
    if (!$gotAnyContent) {
        $errMsg = "⚠️ AI service temporarily unavailable.";
        $emit($errMsg);
        $fullReply = $errMsg;
        $sentText = $errMsg;
    }

    // Bacha hua safe text (holdBack wala) flush kar do
    if (!$memoryTagStarted) {
        $unsent = substr($fullReply, strlen($sentText));
        if ($unsent !== "") { $emit($unsent); $sentText .= $unsent; }
    }

    // ---- Ab poora clean reply nikaalo (MEMORY tag stripped) ----
    $cleanReply = $fullReply;
    if (preg_match_all('/\[MEMORY\](.*?)\[\/MEMORY\]/is', $fullReply, $matches)) {
        if ($userId && $db && !empty($matches[1])) {
            $insertStmt = @$db->prepare("INSERT INTO memories (user_id, fact) VALUES (:uid, :fact)");
            if ($insertStmt) {
                foreach ($matches[1] as $newFact) {
                    $newFact = trim(mb_substr(trim($newFact), 0, 200, "UTF-8"));
                    if ($newFact === "") continue;
                    $insertStmt->bindValue(":uid", $userId, SQLITE3_INTEGER);
                    $insertStmt->bindValue(":fact", $newFact, SQLITE3_TEXT);
                    @$insertStmt->execute();
                    $insertStmt->reset();
                }
            }
        }
        $cleanReply = trim(preg_replace('/\[MEMORY\](.*?)\[\/MEMORY\]/is', '', $fullReply));
    }

    if ($conversationId && $db && $cleanReply !== "") {
        $saveBotMsg = @$db->prepare("INSERT INTO chat_messages (conversation_id, role, content) VALUES (:cid, 'assistant', :content)");
        if ($saveBotMsg) {
            $saveBotMsg->bindValue(":cid", $conversationId, SQLITE3_INTEGER);
            $saveBotMsg->bindValue(":content", $cleanReply, SQLITE3_TEXT);
            @$saveBotMsg->execute();
        }
    }

    if ($userId && $db && $cleanReply !== "") {
        try {
            @$db->exec("UPDATE users SET credits = credits - 1 WHERE id = " . intval($userId) . " AND credits > 0");
        } catch (Exception $ex) {}
    }

    // Final meta event — conversation_id, sources, poora clean text (frontend
    // history array ke liye) — stream khatam hone ke baad.
    echo "data: " . json_encode([
        "meta" => true,
        "conversation_id" => $conversationId,
        "sources" => $searchSources,
        "full_reply" => $cleanReply
    ], JSON_UNESCAPED_UNICODE) . "\n\n";
    @ob_flush(); @flush();

    echo "data: [DONE]\n\n";
    @ob_flush(); @flush();
}

/* =====================================================
   EXECUTE, DEDUCT CREDIT & RETURN JSON
===================================================== */

if (!$isVoiceMode) {
    // TEXT CHAT: real-time streaming (Step 3)
    streamOpenRouterAndSave($openRouterKey, $contents, $systemInstruction, $userId, $db, $conversationId, $searchSources);
    exit;
}

// VOICE MODE: poora reply ek saath chahiye (TTS ke liye), isliye streaming nahi
$response = callOpenRouter($openRouterKey, $contents, $systemInstruction);

// ---- MEMORY: naye facts save karo, aur tag ko reply se hata do ----
if (!empty($response["reply"])) {
    if (preg_match_all('/\[MEMORY\](.*?)\[\/MEMORY\]/is', $response["reply"], $matches)) {
        if ($userId && $db && !empty($matches[1])) {
            $insertStmt = @$db->prepare("INSERT INTO memories (user_id, fact) VALUES (:uid, :fact)");
            if ($insertStmt) {
                foreach ($matches[1] as $newFact) {
                    $newFact = trim(mb_substr(trim($newFact), 0, 200, "UTF-8"));
                    if ($newFact === "") continue;
                    $insertStmt->bindValue(":uid", $userId, SQLITE3_INTEGER);
                    $insertStmt->bindValue(":fact", $newFact, SQLITE3_TEXT);
                    @$insertStmt->execute();
                    $insertStmt->reset();
                }
            }
        }
        $response["reply"] = trim(preg_replace('/\[MEMORY\](.*?)\[\/MEMORY\]/is', '', $response["reply"]));
    }
}

// ---- CONVERSATION HISTORY: AI ka reply bhi save kar do ----
if ($conversationId && $db && !empty($response["reply"]) && ($response["success"] ?? false)) {
    $saveBotMsg = @$db->prepare("INSERT INTO chat_messages (conversation_id, role, content) VALUES (:cid, 'assistant', :content)");
    if ($saveBotMsg) {
        $saveBotMsg->bindValue(":cid", $conversationId, SQLITE3_INTEGER);
        $saveBotMsg->bindValue(":content", $response["reply"], SQLITE3_TEXT);
        @$saveBotMsg->execute();
    }
}

if ($userId && $db && !empty($response["reply"]) && ($response["success"] ?? false)) {
    try {
        @$db->exec("UPDATE users SET credits = credits - 1 WHERE id = " . intval($userId) . " AND credits > 0");
    } catch (Exception $ex) {}
}

$response["sources"] = $searchSources;
$response["conversation_id"] = $conversationId;

echo json_encode($response, JSON_UNESCAPED_UNICODE);
exit;
