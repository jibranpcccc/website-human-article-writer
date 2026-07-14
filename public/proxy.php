<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: *");
header("Access-Control-Allow-Methods: *");
header("Content-Type: application/json");

// Allow preflight pre-requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Retrieve targets
$url = isset($_GET['url']) ? $_GET['url'] : null;
if (!$url) {
    http_response_code(400);
    echo json_encode(["error" => "Missing target url parameter."]);
    exit(1);
}

// Rebuild headers to forward securely
$headers = [];
$incomingHeaders = getallheaders();
foreach ($incomingHeaders as $name => $value) {
    $lowerName = strtolower($name);
    // Skip host, origin, and content-length headers to let Curl set them automatically
    if ($lowerName !== 'host' && $lowerName !== 'origin' && $lowerName !== 'content-length' && $lowerName !== 'accept-encoding') {
        $headers[] = "$name: $value";
    }
}

// Set up Curl request
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);

// Read raw input payload
$body = file_get_contents('php://input');
if ($body) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_TIMEOUT, 300); // 5-minute timeout for slow models

// Execute request
$response = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if (curl_errno($ch)) {
    $error_msg = curl_error($ch);
    http_response_code(500);
    echo json_encode(["error" => "CURL Error: " . $error_msg]);
} else {
    http_response_code($status);
    echo $response;
}

curl_close($ch);
?>
