<?php
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $description = trim($_POST['description']);
    $imageName = "";

    if (isset($_FILES['photo']) && $_FILES['photo']['error'] === UPLOAD_ERR_OK) {
        $ext = pathinfo($_FILES['photo']['name'], PATHINFO_EXTENSION);
        $imageName = uniqid() . '.' . $ext;
        move_uploaded_file($_FILES['photo']['tmp_name'], "uploads/" . $imageName);
    }

    if ($description && $imageName) {
        $items = [];
        if (file_exists("data.json")) {
            $items = json_decode(file_get_contents("data.json"), true);
        }
        $items[] = ['description' => $description, 'image' => $imageName];
        file_put_contents("data.json", json_encode($items, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        header("Location: admin.php?success=1");
        exit;
    }
}
?>
<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<title>Admin – Přidat výrobek</title>
<style>
body { font-family: Arial; max-width: 600px; margin: auto; background: #f2f2f2; }
form { background: white; padding: 20px; margin-top: 20px; border-radius: 10px; box-shadow: 0 0 5px #ccc; }
input, textarea, button { display: block; width: 100%; margin: 10px 0; padding: 8px; font-size: 16px; }
button { background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; }
button:hover { background: #218838; }
</style>
</head>
<body>
<h1>Přidat výrobek</h1>

<?php if (isset($_GET['success'])): ?>
<p style="color: green;">Výrobek byl úspěšně přidán!</p>
<?php endif; ?>

<form method="post" enctype="multipart/form-data">
    <label for="photo">Fotka výrobku:</label>
    <input type="file" name="photo" accept="image/*" capture="camera" required>

    <label for="description">Popis výrobku:</label>
    <textarea name="description" rows="4" placeholder="Např. Keramická miska od dětí z 3.B" required></textarea>

    <button type="submit">Přidat</button>
</form>

<p><a href="index.php">← Zpět na e-shop</a></p>
</body>
</html>
