<?php
session_start();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: index.php');
    exit();
}

$username = isset($_POST['username']) ? trim($_POST['username']) : '';
$password = isset($_POST['password']) ? $_POST['password'] : '';
$password_confirm = isset($_POST['password_confirm']) ? $_POST['password_confirm'] : '';

if (empty($username) || empty($password) || empty($password_confirm)) {
    header('Location: index.php?reg_error=All fields are required');
    exit();
}

if ($password !== $password_confirm) {
    header('Location: index.php?reg_error=Passwords do not match');
    exit();
}

// Basic username validation
if (!preg_match('/^[A-Za-z0-9_\-]{3,20}$/', $username)) {
    header('Location: index.php?reg_error=Username must be 3-20 chars: letters, numbers, - or _');
    exit();
}

$usersFile = __DIR__ . '/users.json';
$users = [];
if (file_exists($usersFile)) {
    $data = file_get_contents($usersFile);
    $users = json_decode($data, true) ?: [];
}

// check existing username (case-insensitive)
foreach ($users as $u) {
    if (strcasecmp($u['username'], $username) === 0) {
        header('Location: index.php?reg_error=Username already taken');
        exit();
    }
}

// hash password
$passwordHash = password_hash($password, PASSWORD_DEFAULT);

$users[] = [
    'username' => $username,
    'password_hash' => $passwordHash,
    'created_at' => date('Y-m-d H:i:s')
];

if (file_put_contents($usersFile, json_encode($users, JSON_PRETTY_PRINT)) === false) {
    header('Location: index.php?reg_error=Failed to save user');
    exit();
}

// auto-login newly registered user
$_SESSION['username'] = $username;
$_SESSION['login_time'] = date('Y-m-d H:i:s');

header('Location: dashboard.php');
exit();
?>
