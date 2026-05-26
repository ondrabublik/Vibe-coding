<?php
session_start();

// Check if form was submitted
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = isset($_POST['username']) ? trim($_POST['username']) : '';
    $password = isset($_POST['password']) ? $_POST['password'] : '';

    // Validate input
    if (empty($username) || empty($password)) {
        header("Location: index.php?error=Username and password are required");
        exit();
    }

    $authenticated = false;

    // First: check users.json if exists
    $usersFile = __DIR__ . '/users.json';
    if (file_exists($usersFile)) {
        $data = file_get_contents($usersFile);
        $users = json_decode($data, true) ?: [];
        foreach ($users as $u) {
            if (isset($u['username']) && strcasecmp($u['username'], $username) === 0) {
                if (isset($u['password_hash']) && password_verify($password, $u['password_hash'])) {
                    $authenticated = true;
                    break;
                }
            }
        }
    }

    // Fallback to the original demo credentials for convenience
    if (!$authenticated) {
        $valid_username = 'user';
        $valid_password = 'password123';
        if ($username === $valid_username && $password === $valid_password) {
            $authenticated = true;
        }
    }

    if ($authenticated) {
        // Set session variables
        $_SESSION['username'] = $username;
        $_SESSION['login_time'] = date('Y-m-d H:i:s');

        // Redirect to dashboard
        header("Location: dashboard.php");
        exit();
    } else {
        // Redirect back to login with error
        header("Location: index.php?error=Invalid username or password");
        exit();
    }
} else {
    // If accessed directly, redirect to login
    header("Location: index.php");
    exit();
}
?>
