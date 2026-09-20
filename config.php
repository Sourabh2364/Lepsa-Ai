<?php
/**
 * LEPSA AI - Configuration Template
 * 
 * GitHub par upload karne ke liye demo file.
 * Render ya live server par keys Environment Variables se load hongi.
 */

// OpenRouter API Key (Llama / Text Engine)
$openRouter = getenv('OPENROUTER_API_KEY') ?: 'YOUR_OPENROUTER_API_KEY_HERE';

// Gemini API Key (Alternative Core / Audio Engine)
$gemini = getenv('GEMINI_API_KEY') ?: 'YOUR_GEMINI_API_KEY_HERE';

// ElevenLabs API Key (Natural Voice Engine)
$elevenLabs = getenv('ELEVENLABS_API_KEY') ?: 'YOUR_ELEVENLABS_API_KEY_HERE';

define('OPENROUTER_API_KEY', $openRouter);
define('GEMINI_API_KEY', $gemini);
define('ELEVENLABS_API_KEY', $elevenLabs);
