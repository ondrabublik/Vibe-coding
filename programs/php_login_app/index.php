<?php
session_start();

// If user is already logged in, redirect to dashboard
if (isset($_SESSION['username'])) {
    header("Location: dashboard.php");
    exit();
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Home - PHP Login App</title>
    <link rel="stylesheet" href="style.css">
</head>
<body class="homepage">
    <!-- Navbar -->
    <nav class="navbar-main">
        <div class="navbar-container">
            <h1 class="navbar-logo">PHP Login App</h1>
            <div class="navbar-right">
                <button class="btn-login-nav" onclick="openLoginModal()">Login</button>
                <button class="btn-login-nav" onclick="openRegisterModal()">Register</button>
            </div>
        </div>
    </nav>

    <!-- Main Content -->
    <div class="homepage-content">
        <div class="hero-section">
            <h2>Welcome to Our Platform</h2>
            <p>Secure login and user authentication system</p>
            <button class="btn-primary" onclick="openLoginModal()">Get Started</button>
        </div>
    </div>

    <!-- Login Modal -->
    <div id="loginModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeLoginModal()">&times;</span>
            <h2>Login</h2>
            <?php
            // Display error message if login failed
            if (isset($_GET['error'])) {
                echo '<div class="error-message">' . htmlspecialchars($_GET['error']) . '</div>';
            }
            ?>
            <form action="login.php" method="POST">
                <div class="form-group">
                    <label for="username">Username:</label>
                    <input type="text" id="username" name="username" required>
                </div>
                <div class="form-group">
                    <label for="password">Password:</label>
                    <input type="password" id="password" name="password" required>
                </div>
                <button type="submit" class="btn-login">Login</button>
            </form>
            <p class="demo-info">Demo Credentials: <br>Username: <strong>user</strong> <br>Password: <strong>password123</strong></p>
        </div>
    </div>

    <!-- Register Modal -->
    <div id="registerModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeRegisterModal()">&times;</span>
            <h2>Register</h2>
            <?php
            if (isset($_GET['reg_error'])) {
                echo '<div class="error-message">' . htmlspecialchars($_GET['reg_error']) . '</div>';
            }
            if (isset($_GET['reg_success'])) {
                echo '<div class="success-message">' . htmlspecialchars($_GET['reg_success']) . '</div>';
            }
            ?>
            <form action="register.php" method="POST">
                <div class="form-group">
                    <label for="reg_username">Username:</label>
                    <input type="text" id="reg_username" name="username" required>
                </div>
                <div class="form-group">
                    <label for="reg_password">Password:</label>
                    <input type="password" id="reg_password" name="password" required>
                </div>
                <div class="form-group">
                    <label for="reg_password_confirm">Confirm Password:</label>
                    <input type="password" id="reg_password_confirm" name="password_confirm" required>
                </div>
                <button type="submit" class="btn-login">Register</button>
            </form>
            <p class="demo-info">Choose a unique username. Password will be stored securely (hashed).</p>
        </div>
    </div>

    <script>
        function openLoginModal() {
            document.getElementById('loginModal').style.display = 'block';
        }

        function closeLoginModal() {
            document.getElementById('loginModal').style.display = 'none';
        }

        function openRegisterModal() {
            document.getElementById('registerModal').style.display = 'block';
        }

        function closeRegisterModal() {
            document.getElementById('registerModal').style.display = 'none';
        }

        // Close modal when clicking outside of it
        window.onclick = function(event) {
            var loginModal = document.getElementById('loginModal');
            var regModal = document.getElementById('registerModal');
            if (event.target == loginModal) {
                loginModal.style.display = 'none';
            }
            if (event.target == regModal) {
                regModal.style.display = 'none';
            }
        }
    </script>
</body>
</html>
