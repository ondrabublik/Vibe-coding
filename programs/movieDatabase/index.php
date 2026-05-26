<?php
declare(strict_types=1);

session_start();
header('Content-Type: text/html; charset=utf-8');

const STORAGE_DIR = __DIR__ . DIRECTORY_SEPARATOR . 'data';
const STORAGE_FILE = STORAGE_DIR . DIRECTORY_SEPARATOR . 'profiles.txt';

if (!is_dir(STORAGE_DIR)) {
    mkdir(STORAGE_DIR, 0777, true);
}

if (!file_exists(STORAGE_FILE)) {
    file_put_contents(STORAGE_FILE, '');
}

function sanitizeUsername(string $username): string
{
    $username = trim($username);
    $username = function_exists('mb_substr')
        ? mb_substr($username, 0, 40)
        : substr($username, 0, 40);
    return preg_replace('/[^a-zA-Z0-9_\- ]/u', '', $username) ?? '';
}

function sanitizePassword(string $password): string
{
    $password = trim($password);
    return function_exists('mb_substr')
        ? mb_substr($password, 0, 120)
        : substr($password, 0, 120);
}

function loadProfiles(): array
{
    $raw = file_get_contents(STORAGE_FILE);
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [];
    }

    return $decoded;
}

function saveProfiles(array $profiles): bool
{
    $json = json_encode($profiles, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false) {
        return false;
    }

    return file_put_contents(STORAGE_FILE, $json, LOCK_EX) !== false;
}

function profileResponse(string $username, array $profile): void
{
    echo json_encode([
        'ok' => true,
        'username' => $username,
        'favorites' => $profile['favorites'] ?? [],
    ]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action'])) {
    header('Content-Type: application/json; charset=utf-8');

    $action = (string)$_GET['action'];
    $profiles = loadProfiles();

    if ($action === 'register') {
        $username = sanitizeUsername((string)($_POST['username'] ?? ''));
        $password = sanitizePassword((string)($_POST['password'] ?? ''));

        if ($username === '' || $password === '') {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'Zadej jmeno i heslo.']);
            exit;
        }

        if (isset($profiles[$username])) {
            http_response_code(409);
            echo json_encode(['ok' => false, 'message' => 'Uzivatel uz existuje.']);
            exit;
        }

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        if ($passwordHash === false) {
            http_response_code(500);
            echo json_encode(['ok' => false, 'message' => 'Nepodarilo se ulozit heslo.']);
            exit;
        }

        $profiles[$username] = [
            'password_hash' => $passwordHash,
            'favorites' => [],
        ];
        saveProfiles($profiles);
        $_SESSION['username'] = $username;
        profileResponse($username, $profiles[$username]);
        exit;
    }

    if ($action === 'login') {
        $username = sanitizeUsername((string)($_POST['username'] ?? ''));
        $password = sanitizePassword((string)($_POST['password'] ?? ''));

        if ($username === '' || $password === '' || !isset($profiles[$username])) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'message' => 'Neplatne jmeno nebo heslo.']);
            exit;
        }

        $passwordHash = (string)($profiles[$username]['password_hash'] ?? '');
        if ($passwordHash === '' || !password_verify($password, $passwordHash)) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'message' => 'Neplatne jmeno nebo heslo.']);
            exit;
        }

        $_SESSION['username'] = $username;
        profileResponse($username, $profiles[$username]);
        exit;
    }

    if ($action === 'session_status') {
        $username = sanitizeUsername((string)($_SESSION['username'] ?? ''));
        if ($username === '' || !isset($profiles[$username])) {
            echo json_encode(['ok' => false]);
            exit;
        }
        profileResponse($username, $profiles[$username]);
        exit;
    }

    if ($action === 'logout') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], (bool)$params['secure'], (bool)$params['httponly']);
        }
        session_destroy();
        echo json_encode(['ok' => true]);
        exit;
    }

    if ($action === 'add_favorite') {
        $username = sanitizeUsername((string)($_POST['username'] ?? ''));
        $movieTitle = trim((string)($_POST['movie_title'] ?? ''));
        $releaseDate = trim((string)($_POST['release_date'] ?? ''));
        $mediaType = trim((string)($_POST['media_type'] ?? 'movie'));
        $posterPath = trim((string)($_POST['poster_path'] ?? ''));
        $mediaId = (int)($_POST['media_id'] ?? 0);
        $overview = trim((string)($_POST['overview'] ?? ''));
        $voteAverage = (float)($_POST['vote_average'] ?? 0);

        if ($username === '' || $movieTitle === '' || !isset($profiles[$username])) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'Chybi uzivatel nebo nazev filmu.']);
            exit;
        }

        if (!isset($profiles[$username]['favorites']) || !is_array($profiles[$username]['favorites'])) {
            $profiles[$username]['favorites'] = [];
        }

        $favoriteId = md5($movieTitle . '|' . $releaseDate . '|' . ($mediaType === 'tv' ? 'tv' : 'movie'));
        $alreadyExists = false;
        foreach ($profiles[$username]['favorites'] as $favorite) {
            $favoriteType = ($favorite['media_type'] ?? 'movie') === 'tv' ? 'tv' : 'movie';
            $legacyId = md5(($favorite['title'] ?? '') . '|' . ($favorite['release_date'] ?? ''));
            $typedId = md5(($favorite['title'] ?? '') . '|' . ($favorite['release_date'] ?? '') . '|' . $favoriteType);
            if (($favorite['id'] ?? '') === $favoriteId || $legacyId === $favoriteId || $typedId === $favoriteId) {
                $alreadyExists = true;
                break;
            }
        }

        if (!$alreadyExists) {
            $profiles[$username]['favorites'][] = [
                'id' => $favoriteId,
                'title' => $movieTitle,
                'release_date' => $releaseDate,
                'media_type' => $mediaType === 'tv' ? 'tv' : 'movie',
                'poster_path' => $posterPath,
                'media_id' => $mediaId > 0 ? $mediaId : null,
                'overview' => $overview,
                'vote_average' => $voteAverage > 0 ? $voteAverage : 0,
            ];
            saveProfiles($profiles);
        }

        profileResponse($username, $profiles[$username]);
        exit;
    }

    if ($action === 'remove_favorite') {
        $username = sanitizeUsername((string)($_POST['username'] ?? ''));
        $movieTitle = trim((string)($_POST['movie_title'] ?? ''));
        $releaseDate = trim((string)($_POST['release_date'] ?? ''));
        $mediaType = trim((string)($_POST['media_type'] ?? 'movie'));

        if ($username === '' || $movieTitle === '' || !isset($profiles[$username])) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'Chybi uzivatel nebo nazev filmu.']);
            exit;
        }

        $safeType = $mediaType === 'tv' ? 'tv' : 'movie';
        $favoriteId = md5($movieTitle . '|' . $releaseDate . '|' . $safeType);
        $favorites = $profiles[$username]['favorites'] ?? [];
        $profiles[$username]['favorites'] = array_values(array_filter(
            $favorites,
            static function (array $favorite) use ($favoriteId, $movieTitle, $releaseDate, $safeType): bool {
                $favoriteType = ($favorite['media_type'] ?? 'movie') === 'tv' ? 'tv' : 'movie';
                $legacyId = md5(($favorite['title'] ?? '') . '|' . ($favorite['release_date'] ?? ''));
                $typedId = md5(($favorite['title'] ?? '') . '|' . ($favorite['release_date'] ?? '') . '|' . $favoriteType);
                $matchesByFields = ($favorite['title'] ?? '') === $movieTitle
                    && ($favorite['release_date'] ?? '') === $releaseDate
                    && $favoriteType === $safeType;
                return !((($favorite['id'] ?? '') === $favoriteId) || $legacyId === $favoriteId || $typedId === $favoriteId || $matchesByFields);
            }
        ));
        saveProfiles($profiles);

        profileResponse($username, $profiles[$username]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Neznama akce.']);
    exit;
}
?>
<!DOCTYPE html>
<html lang="cs">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Filmové novinky podle žánru</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header class="topbar">
        <div class="topbar-inner">
            <strong>Movie Database</strong>
            <div class="row">
                <span class="small" id="topbarUserInfo">Neprihlasen</span>
                <button id="showFavoritesBtn" type="button" style="display:none;">Oblibene</button>
                <button id="openLoginBtn" type="button">Log in</button>
                <button id="logoutBtn" type="button" style="display:none;">Log out</button>
            </div>
        </div>
    </header>

    <div class="auth-modal" id="authModal">
        <div class="auth-card">
            <h3 id="authTitle">Log in</h3>
            <form id="authForm">
                <input id="authUsername" name="username" type="text" placeholder="Jmeno" required>
                <input id="authPassword" name="password" type="password" placeholder="Heslo" required>
                <div class="auth-actions">
                    <button id="authSubmitBtn" type="submit">Prihlasit</button>
                    <button id="closeAuthBtn" type="button">Zavrit</button>
                </div>
            </form>
            <div class="auth-switch">
                <span id="authSwitchLabel">Nemate ucet?</span>
                <button class="link-button" id="switchAuthModeBtn" type="button">Registration</button>
            </div>
        </div>
    </div>

    <div class="detail-modal" id="movieDetailModal">
        <div class="detail-card">
            <button id="closeDetailBtn" type="button" class="detail-close">Zavrit</button>
            <div class="detail-layout">
                <img id="detailPoster" src="" alt="Plakat filmu">
                <div>
                    <h2 id="detailTitle"></h2>
                    <p class="meta" id="detailDate"></p>
                    <p class="meta" id="detailRating"></p>
                    <p class="meta" id="detailCountry"></p>
                    <p id="detailOverview"></p>
                    <button id="detailFavoriteBtn" type="button" class="secondary-btn" style="display:none;">Pridat do oblibenych</button>
                </div>
            </div>
        </div>
    </div>

    <div class="container">
        <h1>Filmové novinky podle žánru</h1>

        <section class="panel">
            <h2>Výběr filmů</h2>
            <div class="row">
                <select id="mediaType">
                    <option value="movie">Filmy</option>
                    <option value="tv">Serialy</option>
                </select>
                <select id="genre">
                    <option value="28">Akční</option>
                    <option value="35">Komedie</option>
                    <option value="18">Drama</option>
                    <option value="27">Horor</option>
                    <option value="878">Sci-Fi</option>
                </select>
                <select id="originCountry">
                    <option value="">Zeme puvodu: vse</option>
                    <option value="CZ">Cesko</option>
                    <option value="US">USA</option>
                    <option value="GB">Velka Britanie</option>
                    <option value="FR">Francie</option>
                    <option value="DE">Nemecko</option>
                    <option value="KR">Jizni Korea</option>
                    <option value="JP">Japonsko</option>
                    <option value="IN">Indie</option>
                </select>
                <button id="openYearFilterBtn" type="button" class="secondary-btn">Roky: vse</button>
                <div class="rating-filter" id="ratingFilter" title="Hodnoceni od">
                    <button type="button" class="star-btn" data-star="1">★</button>
                    <button type="button" class="star-btn" data-star="2">★</button>
                    <button type="button" class="star-btn" data-star="3">★</button>
                    <button type="button" class="star-btn" data-star="4">★</button>
                    <button type="button" class="star-btn" data-star="5">★</button>
                </div>
                <button id="showPopularBtn" type="button" class="secondary-btn">Oblibene</button>
                <button id="loadMoviesBtn" type="button">Načíst</button>
                <button id="clearFiltersBtn" type="button" class="secondary-btn">Vymazat filtry</button>
            </div>
        </section>

        <section id="movies"></section>
        <div class="pagination" id="pagination"></div>
    </div>

    <div class="detail-modal" id="yearModal">
        <div class="detail-card year-card">
            <h3>Vyber roky</h3>
            <div class="row">
                <label for="yearFromSelect">Od</label>
                <select id="yearFromSelect"></select>
                <label for="yearToSelect">Do</label>
                <select id="yearToSelect"></select>
            </div>
            <div class="auth-actions" style="margin-top: 12px;">
                <button id="applyYearFilterBtn" type="button">Pouzit</button>
                <button id="closeYearFilterBtn" type="button" class="secondary-btn">Zavrit</button>
            </div>
        </div>
    </div>

    <script>
    const API_KEY = "c0894634403c8265654b268ecd24cdca";
    const MIN_YEAR = 1980;
    const MAX_YEAR = 2026;
    const ITEMS_PER_PAGE = 27;
    const GENRES_BY_TYPE = {
        movie: [
            { id: "28", name: "Akcni" },
            { id: "35", name: "Komedie" },
            { id: "18", name: "Drama" },
            { id: "27", name: "Horor" },
            { id: "878", name: "Sci-Fi" },
            { id: "16", name: "Animovany film" }
        ],
        tv: [
            { id: "10759", name: "Akcni a dobrodruzne" },
            { id: "35", name: "Komedie" },
            { id: "18", name: "Drama" },
            { id: "9648", name: "Mysteriozni" },
            { id: "10765", name: "Sci-Fi a fantasy" },
            { id: "16", name: "Animovany serial" }
        ]
    };
    let currentUser = "";
    let currentFavorites = [];
    let showFavoritesOnly = false;
    let showPopularOnly = false;
    let selectedYearFrom = null;
    let selectedYearTo = null;
    let selectedStars = 0;
    let allFilteredResults = [];
    let currentPage = 1;
    let currentDiscoverMediaType = "movie";
    let currentDiscoverBaseQuery = "";
    let nextDiscoverPage = 1;
    let hasMoreDiscoverPages = false;
    let isFetchingDiscoverPage = false;
    let currentDetailMedia = null;
    let authMode = "login";

    function todayISO() {
        return new Date().toISOString().slice(0, 10);
    }

    async function postAction(action, payload) {
        const body = new URLSearchParams(payload);
        const response = await fetch(`index.php?action=${action}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body
        });
        return response.json();
    }

    function setAuthMode(mode) {
        authMode = mode;
        const isLogin = mode === "login";
        document.getElementById("authTitle").textContent = isLogin ? "Log in" : "Registration";
        document.getElementById("authSubmitBtn").textContent = isLogin ? "Prihlasit" : "Registrovat";
        document.getElementById("authSwitchLabel").textContent = isLogin ? "Nemate ucet?" : "Uz mate ucet?";
        document.getElementById("switchAuthModeBtn").textContent = isLogin ? "Registration" : "Log in";
    }

    function openAuthModal() {
        document.getElementById("authModal").classList.add("open");
    }

    function closeAuthModal() {
        document.getElementById("authModal").classList.remove("open");
    }

    async function fetchMediaDetail(mediaType, mediaId, language) {
        const safeType = mediaType === "tv" ? "tv" : "movie";
        const url = `https://api.themoviedb.org/3/${safeType}/${mediaId}?api_key=${API_KEY}&language=${language}`;
        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }
        return response.json();
    }

    async function fetchMediaByTitle(mediaType, title, language) {
        const safeType = mediaType === "tv" ? "tv" : "movie";
        const url = `https://api.themoviedb.org/3/search/${safeType}?api_key=${API_KEY}&language=${language}&query=${encodeURIComponent(title)}`;
        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }
        const data = await response.json();
        return (data.results && data.results[0]) ? data.results[0] : null;
    }

    function getMediaTitle(media) {
        return media.title || media.name || "Neznamy nazev";
    }

    function getMediaDate(media) {
        return media.release_date || media.first_air_date || "";
    }

    function extractCountry(media) {
        if (Array.isArray(media.origin_country) && media.origin_country.length > 0) {
            return media.origin_country.join(", ");
        }
        if (Array.isArray(media.production_countries) && media.production_countries.length > 0) {
            const names = media.production_countries
                .map((country) => country && (country.name || country.iso_3166_1))
                .filter(Boolean);
            if (names.length > 0) {
                return names.join(", ");
            }
        }
        return "";
    }

    async function resolveMediaOverview(media) {
        if (media.overview && media.overview.trim() !== "") {
            return media.overview;
        }

        if (media.id) {
            const enDetail = await fetchMediaDetail(media.media_type, media.id, "en-US");
            if (enDetail && enDetail.overview && enDetail.overview.trim() !== "") {
                return enDetail.overview;
            }
        }

        const fallbackSearch = await fetchMediaByTitle(media.media_type, getMediaTitle(media), "en-US");
        if (fallbackSearch && fallbackSearch.overview && fallbackSearch.overview.trim() !== "") {
            return fallbackSearch.overview;
        }

        return "Popis neni dostupny.";
    }

    async function resolveMediaCountry(media) {
        const direct = extractCountry(media);
        if (direct) {
            return direct;
        }

        if (media.id) {
            const detail = await fetchMediaDetail(media.media_type, media.id, "cs-CZ");
            const detailCountry = detail ? extractCountry(detail) : "";
            if (detailCountry) {
                return detailCountry;
            }
        }

        return "nezname";
    }

    async function openDetailModal(media) {
        currentDetailMedia = media;
        const poster = media.poster_path
            ? `https://image.tmdb.org/t/p/w500${media.poster_path}`
            : "https://via.placeholder.com/300x450?text=Bez+plakatu";

        document.getElementById("detailPoster").src = poster;
        document.getElementById("detailPoster").alt = getMediaTitle(media);
        document.getElementById("detailTitle").textContent = getMediaTitle(media);
        document.getElementById("detailDate").textContent = `Datum vydani: ${getMediaDate(media) || "nezname"}`;
        const rating = Number.parseFloat(media.vote_average || 0);
        document.getElementById("detailRating").textContent = `Hodnoceni: ${rating > 0 ? rating.toFixed(1) : "nezname"} / 10`;
        document.getElementById("detailCountry").textContent = "Zeme puvodu: nacitam...";
        document.getElementById("detailOverview").textContent = "Nacitam popis...";
        document.getElementById("movieDetailModal").classList.add("open");
        updateDetailFavoriteButton();

        const country = await resolveMediaCountry(media);
        document.getElementById("detailCountry").textContent = `Zeme puvodu: ${country}`;
        const overview = await resolveMediaOverview(media);
        document.getElementById("detailOverview").textContent = overview;
    }

    function closeDetailModal() {
        document.getElementById("movieDetailModal").classList.remove("open");
    }

    function updateDetailFavoriteButton() {
        const detailBtn = document.getElementById("detailFavoriteBtn");
        if (!currentUser || !currentDetailMedia) {
            detailBtn.style.display = "none";
            return;
        }

        const favorite = isFavoriteMovie(currentDetailMedia);
        detailBtn.style.display = "inline-block";
        detailBtn.textContent = favorite ? "Odebrat z oblibenych" : "Pridat do oblibenych";
        detailBtn.classList.toggle("remove-btn", favorite);
    }

    function openYearModal() {
        document.getElementById("yearModal").classList.add("open");
    }

    function closeYearModal() {
        document.getElementById("yearModal").classList.remove("open");
    }

    function updateYearButtonLabel() {
        const yearBtn = document.getElementById("openYearFilterBtn");
        if (selectedYearFrom && selectedYearTo) {
            yearBtn.textContent = `Roky: ${selectedYearFrom}-${selectedYearTo}`;
        } else {
            yearBtn.textContent = "Roky: vse";
        }
    }

    function updateStarFilterUI() {
        document.querySelectorAll(".star-btn").forEach((btn) => {
            const starValue = Number.parseInt(btn.getAttribute("data-star"), 10) || 0;
            btn.classList.toggle("active", starValue <= selectedStars);
        });
    }

    function starToMinRating(stars) {
        const map = {
            1: 2.0,
            2: 4.0,
            3: 6.0,
            4: 7.5,
            5: 9.0
        };
        return map[stars] ?? null;
    }

    function syncGenreOptionsByMediaType() {
        const mediaType = document.getElementById("mediaType").value === "tv" ? "tv" : "movie";
        const genreSelect = document.getElementById("genre");
        const genres = GENRES_BY_TYPE[mediaType] || GENRES_BY_TYPE.movie;

        genreSelect.innerHTML = "";
        genres.forEach((genre) => {
            const option = document.createElement("option");
            option.value = genre.id;
            option.textContent = genre.name;
            genreSelect.appendChild(option);
        });
    }

    function renderMoviesPage() {
        const moviesDiv = document.getElementById("movies");
        const paginationDiv = document.getElementById("pagination");
        moviesDiv.innerHTML = "";

        const totalPages = Math.max(1, Math.ceil(allFilteredResults.length / ITEMS_PER_PAGE));
        if (currentPage > totalPages) {
            currentPage = totalPages;
        }

        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        const pageItems = allFilteredResults.slice(start, start + ITEMS_PER_PAGE);

        pageItems.forEach((movie) => {
            const movieEl = document.createElement("article");
            movieEl.className = "movie";
            const favorite = isFavoriteMovie(movie);
            const title = getMediaTitle(movie);
            const mediaDate = getMediaDate(movie);
            const rating = Number.parseFloat(movie.vote_average || 0);
            const poster = movie.poster_path
                ? `https://image.tmdb.org/t/p/w200${movie.poster_path}`
                : "https://via.placeholder.com/90x130?text=Bez+plakatu";

            movieEl.innerHTML = `
                <img src="${poster}" alt="${title}">
                <div>
                    <h3>${favorite ? '<span class="favorite-star" title="Oblibeny film">★</span>' : ''}${title}</h3>
                    <p class="meta">Datum vydání: ${mediaDate || "nezname"} | Typ: ${movie.media_type === "tv" ? "serial" : "film"} | Hodnoceni: ${rating > 0 ? rating.toFixed(1) : "nezname"} / 10</p>
                    ${currentUser ? `
                        ${favorite
                            ? `<button class="secondary-btn remove-btn" type="button" data-action="remove">Odebrat z oblibenych</button>`
                            : `<button class="secondary-btn" type="button" data-action="add">Pridat mezi oblibene</button>`
                        }
                    ` : ""}
                </div>
            `;

            const favoriteButton = movieEl.querySelector("button");
            if (favoriteButton) {
                const action = favoriteButton.getAttribute("data-action");
                if (action === "remove") {
                    favoriteButton.addEventListener("click", (event) => {
                        event.stopPropagation();
                        removeFavorite(title, mediaDate, movie.media_type);
                    });
                } else {
                    favoriteButton.addEventListener("click", (event) => {
                        event.stopPropagation();
                        addFavorite(
                            title,
                            mediaDate,
                            movie.media_type,
                            movie.poster_path || "",
                            movie.id || null,
                            movie.overview || "",
                            Number.parseFloat(movie.vote_average || 0)
                        );
                    });
                }
            }

            movieEl.addEventListener("click", () => {
                openDetailModal(movie);
            });
            moviesDiv.appendChild(movieEl);
        });

        if (pageItems.length === 0) {
            moviesDiv.innerHTML = showFavoritesOnly
                ? "<p class='small'>Zatim nemas zadne oblibene polozky.</p>"
                : "<p class='small'>Pro zvolene filtry nebyly nalezeny zadne polozky.</p>";
        }

        paginationDiv.innerHTML = "";
        if (allFilteredResults.length > ITEMS_PER_PAGE || hasMoreDiscoverPages) {
            const prevBtn = document.createElement("button");
            prevBtn.type = "button";
            prevBtn.className = "secondary-btn";
            prevBtn.textContent = "Predchozi";
            prevBtn.disabled = currentPage === 1;
            prevBtn.addEventListener("click", () => {
                if (currentPage > 1) {
                    currentPage -= 1;
                    renderMoviesPage();
                }
            });

            const pageInfo = document.createElement("span");
            pageInfo.className = "small";
            pageInfo.textContent = hasMoreDiscoverPages
                ? `Strana ${currentPage} / ${totalPages}+`
                : `Strana ${currentPage} / ${totalPages}`;

            const nextBtn = document.createElement("button");
            nextBtn.type = "button";
            nextBtn.className = "secondary-btn";
            nextBtn.textContent = isFetchingDiscoverPage ? "Nacitam..." : "Dalsi";
            nextBtn.disabled = isFetchingDiscoverPage || (!hasMoreDiscoverPages && currentPage === totalPages);
            nextBtn.addEventListener("click", async () => {
                if (currentPage < totalPages) {
                    currentPage += 1;
                    renderMoviesPage();
                    return;
                }

                if (!hasMoreDiscoverPages) {
                    return;
                }

                await ensureItemsForPage(currentPage + 1);
                const newTotalPages = Math.max(1, Math.ceil(allFilteredResults.length / ITEMS_PER_PAGE));
                if (currentPage < newTotalPages) {
                    currentPage += 1;
                }
                renderMoviesPage();
            });

            paginationDiv.appendChild(prevBtn);
            paginationDiv.appendChild(pageInfo);
            paginationDiv.appendChild(nextBtn);
        }
    }

    function mediaMatchesFilters(movie, today, validYearFrom, validYearTo, minVoteAverage) {
        const mediaDate = getMediaDate(movie);
        if (!mediaDate || mediaDate > today) {
            return false;
        }
        const voteCount = Number.parseInt(String(movie.vote_count || 0), 10);
        if (voteCount <= 20) {
            return false;
        }
        const movieYear = Number.parseInt(mediaDate.slice(0, 4), 10);
        const movieRating = Number.parseFloat(movie.vote_average || 0);
        const yearFromOk = validYearFrom ? movieYear >= validYearFrom : true;
        const yearToOk = validYearTo ? movieYear <= validYearTo : true;
        const ratingOk = minVoteAverage !== null ? movieRating >= minVoteAverage : true;
        return yearFromOk && yearToOk && ratingOk;
    }

    async function fetchNextDiscoverPage(today, validYearFrom, validYearTo, minVoteAverage) {
        if (!hasMoreDiscoverPages || isFetchingDiscoverPage) {
            return;
        }

        isFetchingDiscoverPage = true;
        renderMoviesPage();
        try {
            const pageQuery = new URLSearchParams(currentDiscoverBaseQuery);
            pageQuery.set("page", String(nextDiscoverPage));
            const url = `https://api.themoviedb.org/3/discover/${currentDiscoverMediaType}?${pageQuery.toString()}`;
            const response = await fetch(url);
            const data = await response.json();

            const incoming = (data.results || []).map((media) => ({ ...media, media_type: currentDiscoverMediaType }));
            let filteredIncoming = incoming.filter((movie) => mediaMatchesFilters(movie, today, validYearFrom, validYearTo, minVoteAverage));
            if (showFavoritesOnly && currentUser) {
                filteredIncoming = filteredIncoming.filter((movie) => isFavoriteMovie(movie));
            }
            allFilteredResults.push(...filteredIncoming);

            nextDiscoverPage += 1;
            const totalPagesFromApi = Number.parseInt(String(data.total_pages || 0), 10);
            hasMoreDiscoverPages = totalPagesFromApi > 0 && nextDiscoverPage <= totalPagesFromApi;
        } finally {
            isFetchingDiscoverPage = false;
        }
    }

    async function ensureItemsForPage(targetPage) {
        const requiredItems = targetPage * ITEMS_PER_PAGE;
        const today = todayISO();
        const validYearFrom = selectedYearFrom;
        const validYearTo = selectedYearTo;
        const minVoteAverage = selectedStars > 0 ? starToMinRating(selectedStars) : null;

        while (allFilteredResults.length < requiredItems && hasMoreDiscoverPages) {
            await fetchNextDiscoverPage(today, validYearFrom, validYearTo, minVoteAverage);
        }
    }

    function updateTopbar() {
        const topbarInfo = document.getElementById("topbarUserInfo");
        const loginButton = document.getElementById("openLoginBtn");
        const logoutButton = document.getElementById("logoutBtn");
        const favoritesButton = document.getElementById("showFavoritesBtn");
        const popularButton = document.getElementById("showPopularBtn");

        if (currentUser) {
            topbarInfo.textContent = `Prihlasen: ${currentUser}`;
            loginButton.style.display = "none";
            logoutButton.style.display = "inline-block";
            favoritesButton.style.display = "inline-block";
            favoritesButton.classList.toggle("is-active", showFavoritesOnly);
            favoritesButton.textContent = showFavoritesOnly ? "Vsechny filmy" : "Oblibene";
        } else {
            topbarInfo.textContent = "Neprihlasen";
            loginButton.style.display = "inline-block";
            logoutButton.style.display = "none";
            favoritesButton.style.display = "none";
            if (showFavoritesOnly) {
                showFavoritesOnly = false;
            }
        }
        popularButton.classList.toggle("is-active", showPopularOnly);
        popularButton.textContent = showPopularOnly ? "Standardni poradi" : "Oblibene";
        updateDetailFavoriteButton();
    }

    function applyProfile(username, favorites) {
        currentUser = username;
        currentFavorites = Array.isArray(favorites) ? favorites : [];
        showFavoritesOnly = false;
        updateTopbar();
        loadMovies();
    }

    function isFavoriteMovie(movie) {
        const title = getMediaTitle(movie);
        const date = getMediaDate(movie);
        const type = movie.media_type === "tv" ? "tv" : "movie";
        return currentFavorites.some((favorite) =>
            favorite.title === title &&
            favorite.release_date === date &&
            (favorite.media_type || "movie") === type
        );
    }

    async function submitAuth(event) {
        event.preventDefault();
        const username = document.getElementById("authUsername").value.trim();
        const password = document.getElementById("authPassword").value;

        if (!username || !password) {
            alert("Vypln jmeno i heslo.");
            return;
        }

        const action = authMode === "login" ? "login" : "register";
        const result = await postAction(action, { username, password });
        if (!result.ok) {
            alert(result.message || "Autentizace selhala.");
            return;
        }

        applyProfile(result.username, result.favorites);
        closeAuthModal();
    }

    async function addFavorite(movieTitle, releaseDate, mediaType, posterPath = "", mediaId = null, overview = "", voteAverage = 0) {
        if (!currentUser) {
            alert("Nejdriv se prihlas.");
            return;
        }

        const result = await postAction("add_favorite", {
            username: currentUser,
            movie_title: movieTitle,
            release_date: releaseDate,
            media_type: mediaType,
            poster_path: posterPath,
            media_id: mediaId || "",
            overview,
            vote_average: voteAverage
        });

        if (!result.ok) {
            alert(result.message || "Nepodarilo se ulozit oblibeny film.");
            return;
        }

        currentFavorites = Array.isArray(result.favorites) ? result.favorites : currentFavorites;
        loadMovies();
    }

    async function removeFavorite(movieTitle, releaseDate, mediaType) {
        if (!currentUser) {
            return;
        }

        const result = await postAction("remove_favorite", {
            username: currentUser,
            movie_title: movieTitle,
            release_date: releaseDate,
            media_type: mediaType
        });

        if (!result.ok) {
            alert(result.message || "Nepodarilo se odebrat oblibeny film.");
            return;
        }

        currentFavorites = Array.isArray(result.favorites) ? result.favorites : currentFavorites;
        loadMovies();
    }

    async function loadMovies() {
        const mediaType = document.getElementById("mediaType").value === "tv" ? "tv" : "movie";
        const genreId = document.getElementById("genre").value;
        const originCountry = (document.getElementById("originCountry").value || "").trim().toUpperCase();
        const today = todayISO();
        const validYearFrom = selectedYearFrom;
        const validYearTo = selectedYearTo;
        const minVoteAverage = selectedStars > 0 ? starToMinRating(selectedStars) : null;

        if (showFavoritesOnly && currentUser) {
            allFilteredResults = currentFavorites.map((favorite) => ({
                id: favorite.media_id || null,
                title: favorite.title,
                name: favorite.title,
                release_date: favorite.release_date,
                first_air_date: favorite.release_date,
                media_type: favorite.media_type === "tv" ? "tv" : "movie",
                vote_average: Number.parseFloat(favorite.vote_average || 0),
                poster_path: favorite.poster_path || null,
                overview: favorite.overview || ""
            }));
            currentPage = 1;
            hasMoreDiscoverPages = false;
            isFetchingDiscoverPage = false;
            renderMoviesPage();
            return;
        }

        if (validYearFrom && validYearTo && validYearFrom > validYearTo) {
            alert("Rok od nesmi byt vetsi nez rok do.");
            return;
        }
        const baseQuery = new URLSearchParams({
            api_key: API_KEY,
            language: "cs-CZ",
            sort_by: showPopularOnly
                ? "popularity.desc"
                : (mediaType === "tv" ? "first_air_date.desc" : "release_date.desc"),
            with_genres: genreId,
        });
        if (originCountry) {
            baseQuery.set("with_origin_country", originCountry);
        }

        if (mediaType === "tv") {
            baseQuery.set("first_air_date.lte", validYearTo ? `${validYearTo}-12-31` : today);
            if (validYearFrom) {
                baseQuery.set("first_air_date.gte", `${validYearFrom}-01-01`);
            }
        } else {
            baseQuery.set("primary_release_date.lte", validYearTo ? `${validYearTo}-12-31` : today);
            baseQuery.set("release_date.lte", validYearTo ? `${validYearTo}-12-31` : today);
            if (validYearFrom) {
                baseQuery.set("primary_release_date.gte", `${validYearFrom}-01-01`);
                baseQuery.set("release_date.gte", `${validYearFrom}-01-01`);
            }
        }
        if (minVoteAverage !== null) {
            baseQuery.set("vote_average.gte", String(minVoteAverage));
        }
        baseQuery.set("vote_count.gte", "21");

        currentDiscoverMediaType = mediaType;
        currentDiscoverBaseQuery = baseQuery.toString();
        nextDiscoverPage = 1;
        hasMoreDiscoverPages = true;
        isFetchingDiscoverPage = false;
        allFilteredResults = [];
        currentPage = 1;

        await ensureItemsForPage(1);
        renderMoviesPage();
    }

    async function restoreSession() {
        const result = await postAction("session_status", {});
        if (result.ok) {
            applyProfile(result.username, result.favorites || []);
            return true;
        }
        currentUser = "";
        currentFavorites = [];
        updateTopbar();
        return false;
    }

    async function logout() {
        await postAction("logout", {});
        currentUser = "";
        currentFavorites = [];
        showFavoritesOnly = false;
        showPopularOnly = false;
        updateTopbar();
        loadMovies();
    }

    document.getElementById("openLoginBtn").addEventListener("click", () => {
        setAuthMode("login");
        openAuthModal();
    });
    document.getElementById("closeAuthBtn").addEventListener("click", closeAuthModal);
    document.getElementById("switchAuthModeBtn").addEventListener("click", () => {
        setAuthMode(authMode === "login" ? "register" : "login");
    });
    document.getElementById("authForm").addEventListener("submit", submitAuth);
    document.getElementById("logoutBtn").addEventListener("click", () => {
        logout();
    });
    document.getElementById("showFavoritesBtn").addEventListener("click", () => {
        showFavoritesOnly = !showFavoritesOnly;
        if (showFavoritesOnly) {
            showPopularOnly = false;
        }
        updateTopbar();
        loadMovies();
    });
    document.getElementById("showPopularBtn").addEventListener("click", () => {
        showPopularOnly = !showPopularOnly;
        if (showPopularOnly) {
            showFavoritesOnly = false;
        }
        updateTopbar();
        loadMovies();
    });
    document.getElementById("clearFiltersBtn").addEventListener("click", () => {
        selectedYearFrom = null;
        selectedYearTo = null;
        selectedStars = 0;
        document.getElementById("originCountry").value = "";
        showFavoritesOnly = false;
        showPopularOnly = false;
        updateYearButtonLabel();
        updateStarFilterUI();
        updateTopbar();
        loadMovies();
    });
    document.getElementById("openYearFilterBtn").addEventListener("click", openYearModal);
    document.getElementById("closeYearFilterBtn").addEventListener("click", closeYearModal);
    document.getElementById("applyYearFilterBtn").addEventListener("click", () => {
        const from = Number.parseInt(document.getElementById("yearFromSelect").value, 10);
        const to = Number.parseInt(document.getElementById("yearToSelect").value, 10);
        if (from > to) {
            alert("Rok od nesmi byt vetsi nez rok do.");
            return;
        }
        selectedYearFrom = from;
        selectedYearTo = to;
        updateYearButtonLabel();
        closeYearModal();
        loadMovies();
    });
    document.querySelectorAll(".star-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const star = Number.parseInt(btn.getAttribute("data-star"), 10) || 0;
            selectedStars = selectedStars === star ? 0 : star;
            updateStarFilterUI();
            loadMovies();
        });
    });
    document.getElementById("mediaType").addEventListener("change", () => {
        syncGenreOptionsByMediaType();
        loadMovies();
    });
    document.getElementById("loadMoviesBtn").addEventListener("click", loadMovies);
    document.getElementById("detailFavoriteBtn").addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!currentDetailMedia || !currentUser) {
            return;
        }
        const title = getMediaTitle(currentDetailMedia);
        const mediaDate = getMediaDate(currentDetailMedia);
        const mediaType = currentDetailMedia.media_type === "tv" ? "tv" : "movie";
        if (isFavoriteMovie(currentDetailMedia)) {
            await removeFavorite(title, mediaDate, mediaType);
        } else {
            await addFavorite(
                title,
                mediaDate,
                mediaType,
                currentDetailMedia.poster_path || "",
                currentDetailMedia.id || null,
                currentDetailMedia.overview || "",
                Number.parseFloat(currentDetailMedia.vote_average || 0)
            );
        }
        updateDetailFavoriteButton();
    });
    document.getElementById("closeDetailBtn").addEventListener("click", closeDetailModal);
    document.getElementById("movieDetailModal").addEventListener("click", (event) => {
        if (event.target.id === "movieDetailModal") {
            closeDetailModal();
        }
    });
    document.getElementById("yearModal").addEventListener("click", (event) => {
        if (event.target.id === "yearModal") {
            closeYearModal();
        }
    });

    const fromSelect = document.getElementById("yearFromSelect");
    const toSelect = document.getElementById("yearToSelect");
    for (let year = MIN_YEAR; year <= MAX_YEAR; year += 1) {
        const fromOption = document.createElement("option");
        fromOption.value = String(year);
        fromOption.textContent = String(year);
        fromSelect.appendChild(fromOption);
        const toOption = document.createElement("option");
        toOption.value = String(year);
        toOption.textContent = String(year);
        toSelect.appendChild(toOption);
    }
    fromSelect.value = String(MIN_YEAR);
    toSelect.value = String(MAX_YEAR);
    selectedYearFrom = MIN_YEAR;
    selectedYearTo = MAX_YEAR;
    syncGenreOptionsByMediaType();
    updateYearButtonLabel();
    updateStarFilterUI();
    updateTopbar();
    restoreSession().then((restored) => {
        if (!restored) {
            loadMovies();
        }
    });
    </script>
</body>
</html>
