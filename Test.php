<?php

header("Content-Type: text/plain; charset=UTF-8");

$url = "https://generativelanguage.googleapis.com";

$ch = curl_init($url);

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);

/*
 * No CURLOPT_CAINFO here.
 * Let PHP/cURL use its normal CA certificate store.
 */

$result = curl_exec($ch);

$error = curl_error($ch);

$code = curl_getinfo(
    $ch,
    CURLINFO_HTTP_CODE
);

curl_close($ch);

echo "SECURE HTTPS TEST\n";
echo "=================\n\n";

echo "HTTP Code: " . $code . "\n";

if ($result !== false) {

    echo "CURL: WORKING\n";
    echo "✅ Secure PHP connection to Google is working.";

} else {

    echo "CURL: FAILED\n";
    echo "❌ Error: " . $error;
}

?>