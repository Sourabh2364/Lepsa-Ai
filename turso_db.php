<?php
/* =====================================================
   TURSO DB WRAPPER
   SQLite3 jaisa hi interface deta hai (prepare/bindValue/
   execute/fetchArray/exec/lastInsertRowID) — peeche se Turso
   ke HTTP API (Hrana over HTTP, /v2/pipeline) ko call karta hai.
   Isse auth.php/chat.php ka business logic bina bade change ke
   kaam karta rehta hai — bas naya SQLite3($dbFile) ki jagah
   naya TursoDB($url, $token) ban jaata hai.
===================================================== */

// SQLite3 extension ke constants — agar extension load nahi hai to bhi
// purana code (jo SQLITE3_INTEGER, SQLITE3_TEXT use karta hai) crash na ho.
if (!defined('SQLITE3_INTEGER')) define('SQLITE3_INTEGER', 1);
if (!defined('SQLITE3_FLOAT'))   define('SQLITE3_FLOAT', 2);
if (!defined('SQLITE3_TEXT'))    define('SQLITE3_TEXT', 3);
if (!defined('SQLITE3_BLOB'))    define('SQLITE3_BLOB', 4);
if (!defined('SQLITE3_NULL'))    define('SQLITE3_NULL', 5);
if (!defined('SQLITE3_ASSOC'))   define('SQLITE3_ASSOC', 1);
if (!defined('SQLITE3_NUM'))     define('SQLITE3_NUM', 2);
if (!defined('SQLITE3_BOTH'))    define('SQLITE3_BOTH', 3);

class TursoDB {
    private $baseUrl;
    private $authToken;
    public $lastInsertId = 0;
    public $lastError = "";

    public $lastHttpCode = 0;
    public $lastRawResponse = "";

    public function __construct($databaseUrl, $authToken) {
        // "libsql://xxx.turso.io" ya "https://xxx.turso.io" dono chalega
        $url = preg_replace('#^libsql://#', 'https://', trim($databaseUrl));
        $this->baseUrl = rtrim($url, '/');
        $this->authToken = trim($authToken);

        if ($this->baseUrl === "" || $this->authToken === "") {
            throw new Exception("Database URL ya Auth Token khaali hai — config.php check karo.");
        }

        // Connection test — agar credentials galat hain to yahi turant pata chal jaye
        $test = $this->rawQuery([["type" => "execute", "stmt" => ["sql" => "SELECT 1"]]]);

        $hasError = ($test === null)
            || isset($test["error"])
            || (isset($test["results"][0]["type"]) && $test["results"][0]["type"] === "error");

        if ($hasError) {
            $detail = "HTTP " . $this->lastHttpCode . " — " . $this->lastError . " | Raw: " . substr($this->lastRawResponse, 0, 300);
            throw new Exception("Turso connection failed: " . $detail);
        }
    }

    public function exec($sql) {
        $result = $this->rawQuery([["type" => "execute", "stmt" => ["sql" => $sql]]]);
        $this->captureLastInsert($result);
        return $result !== null && !isset($result["results"][0]["response"]["error"]) && !isset($result["error"]);
    }

    public function prepare($sql) {
        return new TursoStatement($this, $sql);
    }

    public function lastInsertRowID() {
        return $this->lastInsertId;
    }

    public function captureLastInsert($rawResponse) {
        if (isset($rawResponse["results"][0]["response"]["result"]["last_insert_rowid"])) {
            $id = $rawResponse["results"][0]["response"]["result"]["last_insert_rowid"];
            if ($id !== null) $this->lastInsertId = intval($id);
        }
    }

    public function rawQuery($requests) {
        $requests[] = ["type" => "close"];

        $ch = curl_init($this->baseUrl . "/v2/pipeline");
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Authorization: Bearer " . $this->authToken,
            "Content-Type: application/json"
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(["requests" => $requests]));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 8);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);

        $res = curl_exec($ch);
        $curlErr = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $this->lastHttpCode = $httpCode;
        $this->lastRawResponse = ($res === false) ? "" : $res;

        if ($res === false) {
            $this->lastError = "Network error: " . $curlErr;
            return null;
        }

        $decoded = json_decode($res, true);
        if ($decoded === null) {
            $this->lastError = "Invalid (non-JSON) response — raw: " . substr($res, 0, 300);
            return null;
        }

        // Top-level error (jaise auth fail) ya pehle result ke andar ka error — dono cases handle karo
        if (isset($decoded["error"])) {
            $this->lastError = is_array($decoded["error"]) ? ($decoded["error"]["message"] ?? json_encode($decoded["error"])) : $decoded["error"];
        } elseif (isset($decoded["results"][0]["type"]) && $decoded["results"][0]["type"] === "error") {
            $this->lastError = $decoded["results"][0]["error"]["message"] ?? "Turso query error.";
        }

        return $decoded;
    }
}

class TursoStatement {
    private $db;
    private $sql;
    private $namedArgs = [];

    public function __construct($db, $sql) {
        $this->db = $db;
        $this->sql = $sql;
    }

    // SQLite3Stmt::bindValue($param, $value, $type) — $type hum ignore karte
    // hain, PHP value se khud detect kar lete hain.
    public function bindValue($param, $value, $type = null) {
        $name = ltrim($param, ':@$');
        $tursoType = "text";
        $strValue = (string)$value;

        if ($value === null) {
            $tursoType = "null";
            $strValue = null;
        } elseif (is_int($value) || $type === SQLITE3_INTEGER) {
            $tursoType = "integer";
            $strValue = (string)intval($value);
        } elseif (is_float($value) || $type === SQLITE3_FLOAT) {
            $tursoType = "float";
            $strValue = (string)$value;
        }

        $this->namedArgs[$name] = ["name" => $name, "value" => ["type" => $tursoType, "value" => $strValue]];
        return true;
    }

    public function execute() {
        $requests = [[
            "type" => "execute",
            "stmt" => [
                "sql" => $this->sql,
                "named_args" => array_values($this->namedArgs)
            ]
        ]];

        $result = $this->db->rawQuery($requests);
        $this->db->captureLastInsert($result);
        return new TursoResult($result);
    }

    public function reset() {
        $this->namedArgs = [];
        return true;
    }
}

class TursoResult {
    private $cols = [];
    private $rows = [];
    private $pos = 0;
    public $affectedRows = 0;

    public function __construct($rawResponse) {
        $result = $rawResponse["results"][0]["response"]["result"] ?? null;
        if ($result) {
            foreach (($result["cols"] ?? []) as $c) {
                $this->cols[] = $c["name"];
            }
            $this->rows = $result["rows"] ?? [];
            $this->affectedRows = $result["affected_row_count"] ?? 0;
        }
    }

    // SQLite3Result::fetchArray(SQLITE3_ASSOC) jaisa hi behave karta hai
    public function fetchArray($mode = SQLITE3_ASSOC) {
        if ($this->pos >= count($this->rows)) return false;
        $row = $this->rows[$this->pos];
        $this->pos++;

        $assoc = [];
        foreach ($this->cols as $i => $colName) {
            $cell = $row[$i] ?? null;
            $val = null;
            if ($cell) {
                if (($cell["type"] ?? "") === "null") {
                    $val = null;
                } elseif (($cell["type"] ?? "") === "integer") {
                    $val = intval($cell["value"]);
                } elseif (($cell["type"] ?? "") === "float") {
                    $val = floatval($cell["value"]);
                } else {
                    $val = $cell["value"] ?? null;
                }
            }
            $assoc[$colName] = $val;
        }
        return $assoc;
    }
}
