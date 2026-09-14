<?php
header("Content-Type: application/json; charset=UTF-8");
require_once __DIR__ . "/config.php";

if (!defined("GEMINI_API_KEY") || GEMINI_API_KEY === "" || GEMINI_API_KEY === "PASTE_NEW_GEMINI_API_KEY_HERE") {
    http_response_code(500);
    echo json_encode([
        "success" => false, 
        "error" => "Gemini API key is not configured in config.php."
    ]);
    exit;
}

echo json_encode([
    "success" => true,
    "key" => GEMINI_API_KEY
]);
exit;
?>



