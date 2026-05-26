<?php
session_start();

// Check if user is logged in
if (!isset($_SESSION['username'])) {
    header("Location: index.php?error=You must login first");
    exit();
}

$username = $_SESSION['username'];
$login_time = $_SESSION['login_time'];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard - PHP Login App</title>
    <link rel="stylesheet" href="style.css">
</head>
<body class="dashboard-page">
    <!-- Navbar -->
    <nav class="navbar-main">
        <div class="navbar-container">
            <h1 class="navbar-logo">PHP Login App</h1>
            <div class="navbar-right">
                <span class="user-info">Welcome, <strong><?php echo htmlspecialchars($username); ?></strong></span>
                <a href="logout.php" class="btn-logout">Logout</a>
            </div>
        </div>
    </nav>

    <!-- Main Content -->
    <div class="dashboard-container">
        <div class="dashboard-box">
            <div class="welcome-section">
                <h2>Welcome, <span class="username"><?php echo htmlspecialchars($username); ?></span>!</h2>
                <p>You have successfully logged in.</p>
            </div>

            <div class="info-section">
                <h3>Login Information</h3>
                <table class="info-table">
                    <tr>
                        <td><strong>Username:</strong></td>
                        <td><?php echo htmlspecialchars($username); ?></td>
                    </tr>
                    <tr>
                        <td><strong>Login Time:</strong></td>
                        <td><?php echo htmlspecialchars($login_time); ?></td>
                    </tr>
                    <tr>
                        <td><strong>Current Time:</strong></td>
                        <td><?php echo date('Y-m-d H:i:s'); ?></td>
                    </tr>
                </table>
            </div>

            <div class="content-section">
                <h3>What's Next?</h3>
                <p>This is your dashboard. You can add more content and features here as needed.</p>
                <ul>
                    <li>Display user profile information</li>
                    <li>Show user statistics</li>
                    <li>Provide navigation to other features</li>
                    <li>Display recent activities</li>
                </ul>
            </div>
        </div>
    </div>
</body>
</html>
