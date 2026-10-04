<?php
// Browser me kholo: yourdomain.com/pollinations_test.php  — test ke baad DELETE kar dena.
require_once __DIR__ . "/config.php";
header("Content-Type: text/plain; charset=utf-8");

$key = defined('POLLINATIONS_API_KEY') ? trim(POLLINATIONS_API_KEY) : "";
echo "Key set: " . ($key !== "" ? "yes (prefix " . substr($key, 0, 3) . ", length " . strlen($key) . ")" : "NO") . "\n";
echo "curl enabled: " . (function_exists('curl_init') ? "yes" : "NO") . "\n";
echo "generated_images writable: " . (is_writable(__DIR__) || is_writable(__DIR__ . "/generated_images") ? "yes" : "NO") . "\n\n";

$ch = curl_init("https://gen.pollinations.ai/image/a%20red%20apple?width=512&height=512&seed=1");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT => 120,
    CURLOPT_HTTPHEADER => ["Authorization: Bearer " . $key],
]);
$data = curl_exec($ch);
echo "HTTP: " . curl_getinfo($ch, CURLINFO_HTTP_CODE) . "\n";
echo "Type: " . curl_getinfo($ch, CURLINFO_CONTENT_TYPE) . "\n";
echo "curl error: " . curl_error($ch) . "\n";
echo "Size: " . strlen((string)$data) . " bytes\n";
if (stripos(curl_getinfo($ch, CURLINFO_CONTENT_TYPE), "image/") !== 0) {
    echo "Body: " . substr((string)$data, 0, 500) . "\n";
}
