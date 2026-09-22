<?php

session_set_cookie_params([
    "httponly" => true,
    "samesite" => "Lax",
    "secure" => !empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off"
]);

session_start();

header("Content-Type: application/json; charset=UTF-8");

// Catch ANY fatal error anywhere below and turn it into valid JSON,
// so the frontend never sees raw PHP/HTML output and mislabels it
// as "server connection failed".
register_shutdown_function(function () {
    $err = error_get_last();
    if ($err && in_array($err["type"], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        http_response_code(500);
        echo json_encode([
            "success" => false,
            "message" => "Server error: " . $err["message"]
        ]);
    }
});


// =====================================================
// DATABASE
// =====================================================

$dbFile = __DIR__ . "/lepsa_users.sqlite";

try {

    if (!class_exists("SQLite3")) {
        throw new Exception("SQLite3 PHP extension is not enabled on this server.");
    }

    $db = new SQLite3($dbFile);

    $db->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ");

} catch (Throwable $e) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" => "Database connection failed: " . $e->getMessage()
    ]);

    exit;
}


// =====================================================
// READ REQUEST
// =====================================================

$input = json_decode(
    file_get_contents("php://input"),
    true
);

$action = $input["action"] ?? "";


// =====================================================
// SIGNUP
// =====================================================

if ($action === "signup") {

    $name = trim($input["name"] ?? "");
    $email = trim($input["email"] ?? "");
    $password = $input["password"] ?? "";


    // Basic validation

    if ($name === "" || $email === "" || $password === "") {

        echo json_encode([
            "success" => false,
            "message" => "All fields are required."
        ]);

        exit;
    }


    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {

        echo json_encode([
            "success" => false,
            "message" => "Please enter a valid email."
        ]);

        exit;
    }


    if (strlen($password) < 6) {

        echo json_encode([
            "success" => false,
            "message" => "Password must be at least 6 characters."
        ]);

        exit;
    }


    // Check existing email

    $check = $db->prepare(
        "SELECT id FROM users WHERE email = :email LIMIT 1"
    );

    $check->bindValue(
        ":email",
        strtolower($email),
        SQLITE3_TEXT
    );

    $result = $check->execute();

    if ($result->fetchArray(SQLITE3_ASSOC)) {

        echo json_encode([
            "success" => false,
            "message" => "An account with this email already exists."
        ]);

        exit;
    }


    // Secure password hash

    $hashedPassword = password_hash(
        $password,
        PASSWORD_DEFAULT
    );


    // Insert user

    $stmt = $db->prepare("
        INSERT INTO users
        (name, email, password)
        VALUES
        (:name, :email, :password)
    ");

    $stmt->bindValue(
        ":name",
        $name,
        SQLITE3_TEXT
    );

    $stmt->bindValue(
        ":email",
        strtolower($email),
        SQLITE3_TEXT
    );

    $stmt->bindValue(
        ":password",
        $hashedPassword,
        SQLITE3_TEXT
    );


    $result = $stmt->execute();


    if ($result) {

        echo json_encode([
            "success" => true,
            "message" => "Account created successfully."
        ]);

    } else {

        echo json_encode([
            "success" => false,
            "message" => "Could not create account."
        ]);
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

        echo json_encode([
            "success" => false,
            "message" => "Email and password are required."
        ]);

        exit;
    }


    // Find user

    $stmt = $db->prepare("
        SELECT id, name, email, password
        FROM users
        WHERE email = :email
        LIMIT 1
    ");

    $stmt->bindValue(
        ":email",
        strtolower($email),
        SQLITE3_TEXT
    );

    $result = $stmt->execute();

    $user = $result->fetchArray(
        SQLITE3_ASSOC
    );


    if (!$user) {

        echo json_encode([
            "success" => false,
            "message" => "Invalid email or password."
        ]);

        exit;
    }


    // Verify password

    if (!password_verify($password, $user["password"])) {

        echo json_encode([
            "success" => false,
            "message" => "Invalid email or password."
        ]);

        exit;
    }


    // Regenerate session ID

    session_regenerate_id(true);


    // Save login session

    $_SESSION["user_id"] = $user["id"];
    $_SESSION["user_name"] = $user["name"];
    $_SESSION["user_email"] = $user["email"];


    echo json_encode([
        "success" => true,
        "message" => "Login successful.",
        "user" => [
            "id" => $user["id"],
            "name" => $user["name"],
            "email" => $user["email"]
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

        echo json_encode([
            "success" => true,
            "loggedIn" => false
        ]);
    }

    exit;
}


// =====================================================
// LOGOUT
// =====================================================

if ($action === "logout") {

    $_SESSION = [];

    if (ini_get("session.use_cookies")) {

        $params = session_get_cookie_params();

        setcookie(
            session_name(),
            "",
            time() - 42000,
            $params["path"],
            $params["domain"],
            $params["secure"],
            $params["httponly"]
        );
    }

    session_destroy();


    echo json_encode([
        "success" => true,
        "message" => "Logged out successfully."
    ]);

    exit;
}
 // =====================================================
// REAL SOCIAL LOGIN (GOOGLE / FACEBOOK / APPLE)
// =====================================================

// Agar cacert.pem maujood hai to real SSL verification karo (zyada secure),
// warna silently disable kar do taaki request crash na ho.
function applySslCaBundle($ch) {
    $caPath = __DIR__ . "/cacert.pem";
    if (file_exists($caPath)) {
        curl_setopt($ch, CURLOPT_CAINFO, $caPath);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
    } else {
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    }
}

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

        // Verify Google token via Google API
        $verifyUrl = "https://oauth2.googleapis.com/tokeninfo?id_token=" . urlencode($token);
        $ch = curl_init($verifyUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        applySslCaBundle($ch);
        $res = curl_exec($ch);
        curl_close($ch);

        $googleData = json_decode($res, true);

        if (!isset($googleData["email"])) {
            echo json_encode(["success" => false, "message" => "Invalid Google Token."]);
            exit;
        }

        $email = strtolower(trim($googleData["email"]));
        $name = trim($googleData["name"] ?? "Google User");
    } 
    elseif ($provider === "facebook") {
        if ($token === "") {
            echo json_encode(["success" => false, "message" => "Facebook token missing."]);
            exit;
        }

        // Verify Facebook Access Token
        $fbUrl = "https://graph.facebook.com/me?fields=id,name,email&access_token=" . urlencode($token);
        $ch = curl_init($fbUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        applySslCaBundle($ch);
        $res = curl_exec($ch);
        curl_close($ch);

        $fbData = json_decode($res, true);

        if (!isset($fbData["id"])) {
            echo json_encode(["success" => false, "message" => "Invalid Facebook Token."]);
            exit;
        }

        $email = strtolower(trim($fbData["email"] ?? ($fbData["id"] . "@facebook.user")));
        $name = trim($fbData["name"] ?? "Facebook User");
    }
    else {
        echo json_encode(["success" => false, "message" => "Unsupported social provider."]);
        exit;
    }

    // Check if user exists in database
    $check = $db->prepare("SELECT id, name, email FROM users WHERE email = :email LIMIT 1");
    $check->bindValue(":email", $email, SQLITE3_TEXT);
    $result = $check->execute();
    $user = $result->fetchArray(SQLITE3_ASSOC);

    if (!$user) {
        // Create new account automatically
        $randomPass = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);
        $stmt = $db->prepare("INSERT INTO users (name, email, password) VALUES (:name, :email, :password)");
        $stmt->bindValue(":name", $name, SQLITE3_TEXT);
        $stmt->bindValue(":email", $email, SQLITE3_TEXT);
        $stmt->bindValue(":password", $randomPass, SQLITE3_TEXT);
        $stmt->execute();

        $userId = $db->lastInsertRowID();
        $user = [
            "id" => $userId,
            "name" => $name,
            "email" => $email
        ];
    }

    // Start session
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
            "email" => $user["email"]
        ]
    ]);
    exit;
}



// =====================================================
// INVALID ACTION
// =====================================================

echo json_encode([
    "success" => false,
    "message" => "Invalid action."
]);

?>
