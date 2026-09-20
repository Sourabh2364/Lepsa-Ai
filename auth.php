<?php

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// =====================================================
// DATABASE INITIALIZATION & COLUMN MIGRATION
// =====================================================

$dbFile = __DIR__ . "/lepsa_users.sqlite";

try {
    $db = new SQLite3($dbFile);

    // 1. Create table with credits & tier
    $db->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            credits INTEGER DEFAULT 50,
            tier TEXT DEFAULT 'free',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ");

    // 2. Auto-fix existing table if columns missing
    $tableInfo = $db->query("PRAGMA table_info(users)");
    $cols = [];
    while ($c = $tableInfo->fetchArray(SQLITE3_ASSOC)) {
        $cols[] = $c['name'];
    }
    if (!in_array('credits', $cols)) {
        $db->exec("ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 50");
    }
    if (!in_array('tier', $cols)) {
        $db->exec("ALTER TABLE users ADD COLUMN tier TEXT DEFAULT 'free'");
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Database connection failed."
    ]);
    exit;
}

// =====================================================
// READ REQUEST
// =====================================================

$input = json_decode(file_get_contents("php://input"), true);
$action = $input["action"] ?? "";

// =====================================================
// SIGNUP
// =====================================================

if ($action === "signup") {
    $name = trim($input["name"] ?? "");
    $email = trim($input["email"] ?? "");
    $password = $input["password"] ?? "";

    if ($name === "" || $email === "" || $password === "") {
        echo json_encode(["success" => false, "message" => "All fields are required."]);
        exit;
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(["success" => false, "message" => "Please enter a valid email."]);
        exit;
    }

    if (strlen($password) < 6) {
        echo json_encode(["success" => false, "message" => "Password must be at least 6 characters."]);
        exit;
    }

    $check = $db->prepare("SELECT id FROM users WHERE email = :email LIMIT 1");
    $check->bindValue(":email", strtolower($email), SQLITE3_TEXT);
    $result = $check->execute();

    if ($result->fetchArray(SQLITE3_ASSOC)) {
        echo json_encode(["success" => false, "message" => "An account with this email already exists."]);
        exit;
    }

    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

    $stmt = $db->prepare("
        INSERT INTO users (name, email, password, credits, tier)
        VALUES (:name, :email, :password, 50, 'free')
    ");
    $stmt->bindValue(":name", $name, SQLITE3_TEXT);
    $stmt->bindValue(":email", strtolower($email), SQLITE3_TEXT);
    $stmt->bindValue(":password", $hashedPassword, SQLITE3_TEXT);

    if ($stmt->execute()) {
        echo json_encode(["success" => true, "message" => "Account created successfully."]);
    } else {
        echo json_encode(["success" => false, "message" => "Could not create account."]);
    }
    exit;
}

// =====================================================
// LOGIN
// =====================================================

if ($action === "login") {
    $email = trim($input["email"] ?? "");
    $password = $input["password"] ?? "";

    if ($email === "" || $password === "") {
        echo json_encode(["success" => false, "message" => "Email and password are required."]);
        exit;
    }

    $stmt = $db->prepare("SELECT id, name, email, password, credits, tier FROM users WHERE email = :email LIMIT 1");
    $stmt->bindValue(":email", strtolower($email), SQLITE3_TEXT);
    $result = $stmt->execute();
    $user = $result->fetchArray(SQLITE3_ASSOC);

    if (!$user || !password_verify($password, $user["password"])) {
        echo json_encode(["success" => false, "message" => "Invalid email or password."]);
        exit;
    }

    session_regenerate_id(true);
    $_SESSION["user_id"] = $user["id"];
    $_SESSION["user_name"] = $user["name"];
    $_SESSION["user_email"] = $user["email"];

    echo json_encode([
        "success" => true,
        "message" => "Login successful.",
        "user" => [
            "id" => $user["id"],
            "name" => $user["name"],
            "email" => $user["email"],
            "credits" => $user["credits"] ?? 50,
            "tier" => $user["tier"] ?? "free"
        ]
    ]);
    exit;
}

// =====================================================
// CHECK SESSION
// =====================================================

if ($action === "check") {
    if (isset($_SESSION["user_id"])) {
        echo json_encode([
            "success" => true,
            "loggedIn" => true,
            "user" => [
                "id" => $_SESSION["user_id"],
                "name" => $_SESSION["user_name"],
                "email" => $_SESSION["user_email"]
            ]
        ]);
    } else {
        echo json_encode(["success" => true, "loggedIn" => false]);
    }
    exit;
}

// =====================================================
// LOGOUT
// =====================================================

if ($action === "logout") {
    $_SESSION = [];
    session_destroy();
    echo json_encode(["success" => true, "message" => "Logged out successfully."]);
    exit;
}

// =====================================================
// SOCIAL LOGIN (GOOGLE / FACEBOOK)
// =====================================================

if ($action === "social_login") {
    $provider = trim($input["provider"] ?? "");
    $token = trim($input["token"] ?? "");
    $email = "";
    $name = "";

    if ($provider === "google") {
        if ($token === "") {
            echo json_encode(["success" => false, "message" => "Google token missing."]);
            exit;
        }

        $verifyUrl = "https://oauth2.googleapis.com/tokeninfo?id_token=" . urlencode($token);
        $ch = curl_init($verifyUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        $res = curl_exec($ch);
        curl_close($ch);

        $googleData = json_decode($res, true);
        if (!isset($googleData["email"])) {
            echo json_encode(["success" => false, "message" => "Invalid Google Token."]);
            exit;
        }

        $email = strtolower(trim($googleData["email"]));
        $name = trim($googleData["name"] ?? "Google User");
    } else {
        echo json_encode(["success" => false, "message" => "Unsupported provider."]);
        exit;
    }

    $check = $db->prepare("SELECT id, name, email, credits, tier FROM users WHERE email = :email LIMIT 1");
    $check->bindValue(":email", $email, SQLITE3_TEXT);
    $result = $check->execute();
    $user = $result->fetchArray(SQLITE3_ASSOC);

    if (!$user) {
        $randomPass = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);
        $stmt = $db->prepare("INSERT INTO users (name, email, password, credits, tier) VALUES (:name, :email, :password, 50, 'free')");
        $stmt->bindValue(":name", $name, SQLITE3_TEXT);
        $stmt->bindValue(":email", $email, SQLITE3_TEXT);
        $stmt->bindValue(":password", $randomPass, SQLITE3_TEXT);
        $stmt->execute();

        $userId = $db->lastInsertRowID();
        $user = [
            "id" => $userId,
            "name" => $name,
            "email" => $email,
            "credits" => 50,
            "tier" => "free"
        ];
    }

    session_regenerate_id(true);
    $_SESSION["user_id"] = $user["id"];
    $_SESSION["user_name"] = $user["name"];
    $_SESSION["user_email"] = $user["email"];

    echo json_encode([
        "success" => true,
        "message" => "Social login successful.",
        "user" => [
            "id" => $user["id"],
            "name" => $user["name"],
            "email" => $user["email"],
            "credits" => $user["credits"] ?? 50,
            "tier" => $user["tier"] ?? "free"
        ]
    ]);
    exit;
}

echo json_encode(["success" => false, "message" => "Invalid action."]);
exit;
?>
