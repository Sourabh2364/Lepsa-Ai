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

$apiKey = defined('GEMINI_API_KEY') ? GEMINI_API_KEY : ($GEMINI_API_KEY ?? "");
$ttsApiKey = $apiKey;

/* =========================
   API KEY CHECK
========================= */

if (
    $apiKey === "" ||
    $apiKey === "PASTE_NEW_GEMINI_API_KEY_HERE"
) {
    http_response_code(500);

    echo json_encode([
        "success" => false,
        "reply" => "⚠️ Gemini API key is not configured. Please put your new API key in config.php."
    ]);

    exit;
}

/* =========================
   MODEL (ORIGINAL RETAINED)
========================= */

$models = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash"
];

/* =========================
   SYSTEM INSTRUCTION
========================= */

$systemInstruction = "
You are LEPSA AI, a highly capable, reliable and helpful AI assistant.

IDENTITY:
- Your name is LEPSA AI.
- LEPSA is the AI application and brand created by its owner.
- The underlying AI technology is provided through the Gemini API.
- Do not claim that LEPSA itself is Google Gemini.

OWNER:
- The owner and creator of this LEPSA application is Saurav.
- When appropriate, address the owner by their name.
- If someone asks who created or owns LEPSA, say that Saurav is the creator and owner of this application.
- Do not reveal or invent ownership information about other people.

GOALS:
- Understand the user's actual question.
- Use conversation history when provided.
- Give accurate and useful answers.
- Do not invent facts.
- If uncertain, clearly say so.
- Explain difficult topics simply when appropriate.
- Use step-by-step explanations when useful.
- Do not unnecessarily repeat information.
- Stay relevant to the user's question.
- For programming questions, provide practical and correct code.
- For mathematics, calculate carefully.
- Prioritize correctness over guessing.
- Be helpful, respectful and clear.
- Adapt explanations to the user's level.

CONVERSATION:
- Use previous messages when they are provided as conversation history.
- Maintain context naturally.
- If the answer depends on missing information, ask a relevant question instead of guessing.

SAFETY AND ACCURACY:
- Never intentionally provide false information.
- Do not pretend to know something you do not know.
- Clearly distinguish facts from assumptions.
";

/* =========================
   READ REQUEST
========================= */

$rawInput = file_get_contents("php://input");
$input = json_decode($rawInput, true);

if (!is_array($input)) {
    echo json_encode([
        "success" => false,
        "reply" => "⚠️ Invalid request received."
    ]);
    exit;
}

$message = trim($input["message"] ?? "");
$history = $input["history"] ?? [];

/* =========================
   TTS REQUEST
========================= */

if (($input["action"] ?? "") === "tts") {
    $ttsText = trim($input["text"] ?? "");

    if ($ttsText === "") {
        echo json_encode([
            "success" => false,
            "error" => "No text for voice."
        ]);
        exit;
    }

    $ttsResult = callGeminiTTS($ttsText, $ttsApiKey);

    if ($ttsResult["success"]) {
        echo json_encode([
            "success" => true,
            "audio" => $ttsResult["audio"],
            "mimeType" => $ttsResult["mimeType"]
        ]);
    } else {
        echo json_encode([
            "success" => false,
            "error" => "TTS error",
            "details" => $ttsResult["error"] ?? ""
        ]);
    }
    exit;
}

/* =========================
   EMPTY MESSAGE
========================= */

if ($message === "") {
    echo json_encode([
        "success" => false,
        "reply" => "Please enter a message."
    ]);
    exit;
}

/* =========================
   BUILD CONVERSATION
========================= */

$contents = [];

if (is_array($history)) {
    foreach ($history as $item) {
        if (!isset($item["role"]) || !isset($item["text"])) {
            continue;
        }

        $role = $item["role"];
        if ($role !== "user" && $role !== "model") {
            continue;
        }

        $text = trim((string)$item["text"]);
        if ($text === "") {
            continue;
        }

        $contents[] = [
            "role" => $role,
            "parts" => [
                ["text" => $text]
            ]
        ];
    }
}

$contents[] = [
    "role" => "user",
    "parts" => [
        ["text" => $message]
    ]
];

/* =========================
   GEMINI FUNCTION
========================= */

function callGemini($model, $apiKey, $contents, $systemInstruction) {
    $url = "https://generativelanguage.googleapis.com/v1beta/models/" . $model . ":generateContent";

    $data = [
        "systemInstruction" => [
            "parts" => [
                ["text" => $systemInstruction]
            ]
        ],
        "contents" => $contents,
        "generationConfig" => [
            "thinkingConfig" => [
                "thinkingLevel" => "medium"
            ]
        ]
    ];

    $jsonData = json_encode($data, JSON_UNESCAPED_UNICODE);

    if ($jsonData === false) {
        return [
            "success" => false,
            "retry" => false,
            "code" => 0,
            "error" => "Could not create JSON request."
        ];
    }

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Content-Type: application/json",
        "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
        "x-goog-api-key: " . $apiKey
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonData);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

    // cacert missing hone par fallback SSL bypass
    if (file_exists(__DIR__ . "/cacert.pem")) {
        curl_setopt($ch, CURLOPT_CAINFO, __DIR__ . "/cacert.pem");
    } else {
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    }

    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);

    $result = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($result === false) {
        return [
            "success" => false,
            "retry" => false,
            "code" => 0,
            "error" => $curlError
        ];
    }

    $response = json_decode($result, true);

    if (isset($response["candidates"][0]["content"]["parts"][0]["text"])) {
        return [
            "success" => true,
            "reply" => $response["candidates"][0]["content"]["parts"][0]["text"]
        ];
    }

    $googleError = $response["error"]["message"] ?? "Unknown Gemini API error.";

    return [
        "success" => false,
        "retry" => false,
        "code" => $httpCode,
        "error" => $googleError
    ];
}

/* =========================
   GEMINI TTS FUNCTION
========================= */

function callGeminiTTS($text, $apiKey) {
    $model = "gemini-3.1-flash-tts-preview";
    $url = "https://generativelanguage.googleapis.com/v1beta/models/" . $model . ":generateContent";

    $data = [
        "contents" => [
            [
                "parts" => [
                    [
                        "text" => "Speak naturally, clearly and smoothly. Use a friendly conversational Indian voice. Pronounce Hindi and English words clearly. Do not sound robotic.\n\nText to speak:\n" . $text
                    ]
                ]
            ]
        ],
        "generationConfig" => [
            "responseModalities" => ["AUDIO"],
            "speechConfig" => [
                "voiceConfig" => [
                    "prebuiltVoiceConfig" => [
                        "voiceName" => "Kore"
                    ]
                ],
                "languageCode" => "hi-IN"
            ]
        ]
    ];

    $jsonData = json_encode($data, JSON_UNESCAPED_UNICODE);

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Content-Type: application/json",
        "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
        "x-goog-api-key: " . $apiKey
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonData);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

    if (file_exists(__DIR__ . "/cacert.pem")) {
        curl_setopt($ch, CURLOPT_CAINFO, __DIR__ . "/cacert.pem");
    } else {
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    }

    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);

    $result = curl_exec($ch);
    $curlError = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($result === false) {
        return [
            "success" => false,
            "error" => $curlError
        ];
    }

    $response = json_decode($result, true);
    $audio = $response["candidates"][0]["content"]["parts"][0]["inlineData"]["data"] ?? null;

    if (!$audio) {
        $errorMessage = $response["error"]["message"] ?? "Unknown TTS error.";
        return [
            "success" => false,
            "code" => $httpCode,
            "error" => $errorMessage
        ];
    }

    return [
        "success" => true,
        "audio" => $audio,
        "mimeType" => "audio/pcm;rate=24000"
    ];
}

/* =========================
   CALL GEMINI WITH FALLBACK
========================= */

$lastResult = null;

foreach ($models as $model) {
    for ($attempt = 0; $attempt < 2; $attempt++) {
        $result = callGemini($model, $apiKey, $contents, $systemInstruction);
        $lastResult = $result;

        if ($result["success"]) {
            echo json_encode([
                "success" => true,
                "reply" => $result["reply"]
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $code = $result["code"] ?? 0;

        if ($code == 429 || $code == 500 || $code == 502 || $code == 503 || $code == 504) {
            if ($attempt === 0) {
                sleep(1);
                continue;
            }
            break;
        }
        break;
    }
}

/* =========================
   FINAL ERROR
========================= */

$code = $lastResult["code"] ?? 0;
$error = $lastResult["error"] ?? "Unknown Gemini API error.";

if ($code == 400) {
    $reply = "⚠️ Gemini request error.\n\n" . $error;
} elseif ($code == 401) {
    $reply = "⚠️ Gemini API key authentication failed.\n\n" . $error;
} elseif ($code == 403) {
    $reply = "⚠️ Gemini API access was denied.\n\n" . $error;
} elseif ($code == 404) {
    $reply = "⚠️ Gemini model or API endpoint was not found.\n\n" . $error;
} elseif ($code == 429) {
    $reply = "⚠️ Gemini API quota/rate limit reached.\n\n" . $error;
} elseif ($code == 500 || $code == 502 || $code == 503 || $code == 504) {
    $reply = "⚠️ Gemini is temporarily busy. Please try again in a moment.";
} elseif ($code == 0) {
    $reply = "⚠️ Server connection error.\n\n" . $error;
} else {
    $reply = "⚠️ Gemini API error (HTTP " . $code . ").\n\n" . $error;
}

echo json_encode([
    "success" => false,
    "reply" => $reply,
    "error" => $error,
    "httpCode" => $code
], JSON_UNESCAPED_UNICODE);

exit;
