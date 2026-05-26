<?php
$items = [];
if (file_exists("data.json")) {
    $items = json_decode(file_get_contents("data.json"), true);
}
?>
<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<title>Dětský e-shop</title>
<style>
body { font-family: Arial; max-width: 800px; margin: auto; background: #f8f8f8; }
h1 { text-align: center; }
.product { background: white; padding: 10px; margin: 10px 0; border-radius: 10px; box-shadow: 0 0 5px #ccc; }
.product img { width: 100%; max-height: 300px; object-fit: cover; border-radius: 10px; }
.description { margin-top: 8px; }
</style>
</head>
<body>
<h1>Výrobky dětí</h1>

<?php if (empty($items)): ?>
<p>Žádné výrobky zatím nebyly přidány.</p>
<?php else: ?>
    <?php foreach (array_reverse($items) as $item): ?>
        <div class="product">
            <img src="uploads/<?php echo htmlspecialchars($item['image']); ?>" alt="Výrobek">
            <div class="description"><?php echo nl2br(htmlspecialchars($item['description'])); ?></div>
        </div>
    <?php endforeach; ?>
<?php endif; ?>

</body>
</html>
