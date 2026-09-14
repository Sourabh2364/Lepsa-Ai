<?php
// LEPSA AI — Configuration
// Render Environment Variables se dynamic key uthayega, warna fallback constant use karega

$envKey = getenv('GEMINI_API_KEY');

define('GEMINI_API_KEY', $envKey ? $envKey : "PASTE_NEW_GEMINI_API_KEY_HERE");
?>
