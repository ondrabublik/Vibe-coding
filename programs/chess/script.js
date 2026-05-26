const PIECE_SYMBOLS = {
  p: "♟",
  r: "♜",
  n: "♞",
  b: "♝",
  q: "♛",
  k: "♚",
};

const HORDE_WHITE_FEN = "rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP w kq - 0 1";

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const capturedWhiteEl = document.getElementById("captured-white");
const capturedBlackEl = document.getElementById("captured-black");
const resetBtn = document.getElementById("reset");
const aiModeEl = document.getElementById("ai-mode");
const variantEl = document.getElementById("game-variant");

function keyRc(row, col) {
  return `${row},${col}`;
}

/** Lichess / standard Chess960 kam král/věž skončí (řádek vzadu pro danou barvu). */
function castlingGoals(color, wingKingSide) {
  if (wingKingSide) {
    return { kingCol: 6, rookCol: 5 };
  }
  return { kingCol: 2, rookCol: 3 };
}

function swapPieceColorCode(piece) {
  if (!piece) return null;
  const c = piece[0];
  const swapped = c === "w" ? "b" : "w";
  return `${swapped}${piece[1]}`;
}

function fenCharToPiece(ch) {
  if (ch >= "A" && ch <= "Z") {
    const t = ch.toLowerCase();
    const map = { p: "p", n: "n", b: "b", r: "r", q: "q", k: "k" };
    return map[t] ? `w${map[t]}` : null;
  }
  if (ch >= "a" && ch <= "z") {
    const map = { p: "p", n: "n", b: "b", r: "r", q: "q", k: "k" };
    return map[ch] ? `b${map[ch]}` : null;
  }
  return null;
}

function matrixFromFENPiecePlacement(piecePlacement) {
  const rows = piecePlacement.split("/");
  const board = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    const s = rows[r];
    for (let i = 0; i < s.length; i++) {
      const ch = s.charAt(i);
      if (ch >= "1" && ch <= "8") {
        const n = Number(ch);
        for (let k = 0; k < n; k++) row.push(null);
      } else {
        row.push(fenCharToPiece(ch));
      }
    }
    if (row.length !== 8) {
      throw new Error("Neplatna FEN rada.");
    }
    board.push(row);
  }
  return board;
}

function fenCastlingToRights(token) {
  const wKs = token.includes("K");
  const wQs = token.includes("Q");
  const bKs = token.includes("k");
  const bQs = token.includes("q");
  const none = token === "-" || token === "";
  const wBlocked = !(wKs || wQs);
  const bBlocked = !(bKs || bQs);
  return {
    w: {
      kingSide: !none && !wBlocked && wKs,
      queenSide: !none && !wBlocked && wQs,
    },
    b: {
      kingSide: !none && !bBlocked && bKs,
      queenSide: !none && !bBlocked && bQs,
    },
  };
}

/** Vertikální převrácení šachovnice + zámena barev (= horda nad, klasika dolů při klasickém pohledu uživatele). */
function hordeBwFromWB(boardWb) {
  const boardOut = [];
  for (let r = 0; r < 8; r++) {
    const rowOut = [];
    for (let c = 0; c < 8; c++) {
      const p = boardWb[7 - r][c];
      rowOut.push(p ? swapPieceColorCode(p) : null);
    }
    boardOut.push(rowOut);
  }
  const castlingRights = {
    w: { kingSide: true, queenSide: true },
    b: { kingSide: false, queenSide: false },
  };
  let hasAnyWK = false;
  let hasAnyWR = false;
  for (let c = 0; c < 8; c++) {
    const w = boardOut[7][c];
    if (w === "wr") hasAnyWR = true;
    if (w === "wk") hasAnyWK = true;
  }
  if (!hasAnyWR || !hasAnyWK) {
    castlingRights.w = { kingSide: false, queenSide: false };
  }

  return { board: boardOut, castlingRights, turn: "w" };
}

/** Náhodná platná řada Fischer Random (základní řada vzadu podle řádků 8 a 1 pro černého / bílého). */
function randomChess960BackRankPieces() {
  const names = ["B", "B", "N", "N", "R", "R", "Q", "K"];
  for (let tries = 0; tries < 2500; tries++) {
    const perm = [...names];
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    let bOdd = false;
    let bEven = false;
    let k = -1;
    const rookCols = [];
    for (let c = 0; c < 8; c++) {
      const p = perm[c];
      const odd = c % 2 === 1;
      if (p === "B") {
        if (odd) bOdd = true;
        else bEven = true;
      }
      if (p === "K") k = c;
      if (p === "R") rookCols.push(c);
    }
    if (!bOdd || !bEven || k < 0 || rookCols.length !== 2) continue;
    const r1 = rookCols[0];
    const r2 = rookCols[1];
    const rkMin = Math.min(r1, r2);
    const rkMax = Math.max(r1, r2);
    if (k > rkMin && k < rkMax) return perm;
  }
  return ["R", "N", "B", "Q", "K", "B", "N", "R"];
}

function fenNamesToWhiteRow(chars) {
  const mapChar = {
    R: "wr",
    N: "wn",
    B: "wb",
    Q: "wq",
    K: "wk",
  };
  return chars.map((ch) => mapChar[ch] || null);
}

function fenNamesToBlackRow(chars) {
  const mapChar = {
    R: "br",
    N: "bn",
    B: "bb",
    Q: "bq",
    K: "bk",
  };
  return chars.map((ch) => mapChar[ch] || null);
}

function emptyBoard() {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function buildChess960Board() {
  const backPieces = randomChess960BackRankPieces();
  const board = emptyBoard();
  board[0] = fenNamesToBlackRow(backPieces);
  board[1] = Array(8).fill("bp");
  board[6] = Array(8).fill("wp");
  board[7] = fenNamesToWhiteRow(backPieces);
  const castlingRights = {
    w: { kingSide: true, queenSide: true },
    b: { kingSide: true, queenSide: true },
  };
  return { board, castlingRights, turn: "w" };
}

function buildClassicBoardPayloadFixed() {
  const board = [
    ["br", "bn", "bb", "bq", "bk", "bb", "bn", "br"],
    ["bp", "bp", "bp", "bp", "bp", "bp", "bp", "bp"],
    ...Array.from({ length: 4 }, () => Array(8).fill(null)),
    ["wp", "wp", "wp", "wp", "wp", "wp", "wp", "wp"],
    ["wr", "wn", "wb", "wq", "wk", "wb", "wn", "wr"],
  ];
  return { board, castlingRights: fenCastlingToRights("KQkq"), turn: "w" };
}

function buildHordeWB() {
  const parts = HORDE_WHITE_FEN.split(/\s+/);
  const placement = parts[0];
  const castleTok = parts[2] ?? "-";
  const board = matrixFromFENPiecePlacement(placement);
  return { board, castlingRights: fenCastlingToRights(castleTok), turn: "w" };
}

function rookHomesFromBoard(board) {
  const homes = [];
  for (let c = 0; c < 8; c++) {
    const w = board[7][c];
    if (w === "wr") {
      const kc = board[7].indexOf("wk");
      let wing = null;
      if (kc !== -1) {
        wing = c > kc ? "kingSide" : "queenSide";
      }
      homes.push({
        row: 7,
        col: c,
        color: "w",
        wing: wing || "kingSide",
      });
    }
    const b = board[0][c];
    if (b === "br") {
      const kc = board[0].indexOf("bk");
      let wing = null;
      if (kc !== -1) {
        wing = c > kc ? "kingSide" : "queenSide";
      }
      homes.push({
        row: 0,
        col: c,
        color: "b",
        wing: wing || "kingSide",
      });
    }
  }
  /** Dvojice věží přiřad královskou / dámskou přes relativní pozici ke králi. */
  const fixWing = (row, color) => {
    const entries = homes.filter((h) => h.row === row && h.color === color);
    const kcRow = board[row].findIndex((p) => p === `${color}k`);
    if (entries.length !== 2 || kcRow < 0) return;
    entries.sort((a, b2) => a.col - b2.col);
    const [leftR, rightR] = entries;
    leftR.wing = "queenSide";
    rightR.wing = "kingSide";
    if (!(leftR.col < kcRow && rightR.col > kcRow)) return;
    if (kcRow <= leftR.col || kcRow >= rightR.col) return;
  };
  fixWing(7, "w");
  fixWing(0, "b");
  return homes;
}

function pawnDoubleEligibleFromBoard(board) {
  const set = new Set();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p[1] === "p") set.add(keyRc(r, c));
    }
  }
  return set;
}

function createInitialBoard(variantId) {
  if (variantId === "classic") return buildClassicBoardPayloadFixed().board;
  if (variantId === "chess960") return buildChess960Board().board;
  if (variantId === "horde_wb") return buildHordeWB().board;
  if (variantId === "horde_bw") {
    const wb = buildHordeWB();
    return hordeBwFromWB(wb.board).board;
  }
  return buildClassicBoardPayloadFixed().board;
}

function buildVariantPayload(variantId) {
  if (variantId === "classic") return buildClassicBoardPayloadFixed();
  if (variantId === "chess960") return buildChess960Board();
  if (variantId === "horde_wb") return buildHordeWB();
  if (variantId === "horde_bw") {
    const wb = buildHordeWB();
    return hordeBwFromWB(wb.board);
  }
  return buildClassicBoardPayloadFixed();
}

function createInitialState() {
  const variantId = variantEl?.value ?? "classic";
  const payload = buildVariantPayload(variantId);
  const board = payload.board;
  return {
    variantId,
    board,
    turn: payload.turn,
    capturedWhite: [],
    capturedBlack: [],
    finished: false,
    winner: null,
    castling: payload.castlingRights,
    enPassant: null,
    lastMoveFrom: null,
    rookHomes: rookHomesFromBoard(board),
    pawnDoubleEligible: pawnDoubleEligibleFromBoard(board),
    pawnDoubleConsumed: new Set(),
  };
}

let state = createInitialState();
let selected = null;
let legalTargets = [];

function getPieceSymbol(piece) {
  if (!piece) return "";
  return PIECE_SYMBOLS[piece[1]];
}

function renderCaptured(targetEl, pieces) {
  if (pieces.length === 0) {
    targetEl.textContent = "-";
    return;
  }

  targetEl.innerHTML = pieces
    .map((piece) => `<span class="piece-${piece[0]}">${getPieceSymbol(piece)}</span>`)
    .join(" ");
}

function colorHasKing(board, color) {
  return !!findKing(board, color);
}

function render() {
  boardEl.innerHTML = "";
  const canShowCheck =
    colorHasKing(state.board, state.turn);

  const inCheck = canShowCheck && isKingInCheck(state.board, state.turn);

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = document.createElement("button");
      square.className = "square";
      square.classList.add((r + c) % 2 === 0 ? "light" : "dark");
      square.dataset.row = String(r);
      square.dataset.col = String(c);
      const piece = state.board[r][c];
      square.textContent = piece ? getPieceSymbol(piece) : "";
      if (piece) {
        square.classList.add(`piece-${piece[0]}`);
      }

      if (selected && selected.row === r && selected.col === c) {
        square.classList.add("selected");
      }

      if (state.lastMoveFrom && state.lastMoveFrom.row === r && state.lastMoveFrom.col === c) {
        square.classList.add("last-move-from");
      }

      if (legalTargets.some((t) => t.row === r && t.col === c)) {
        square.classList.add("legal");
      }

      if (inCheck && piece === `${state.turn}k`) {
        square.classList.add("in-check");
      }

      square.addEventListener("click", onSquareClick);
      boardEl.appendChild(square);
    }
  }

  if (state.finished) {
    if (state.winner) {
      statusEl.textContent = `Konec hry. Vitez: ${state.winner === "w" ? "Bily" : "Cerny"}`;
    } else {
      statusEl.textContent = "Konec hry. Pat.";
    }
  } else if (ChessAI.isThinking()) {
    const modeLabel =
      ChessAI.getMode() === "alphabeta"
        ? "AI 3 (alfa-beta)"
        : ChessAI.getMode() === "minmax"
          ? "minmax"
          : "jednoduche AI";
    statusEl.textContent = `Na tahu: Cerny (${modeLabel} premysli...)`;
  } else {
    statusEl.textContent = `Na tahu: ${state.turn === "w" ? "Bily" : "Cerny"}${inCheck ? " (sach)" : ""}`;
  }

  renderCaptured(capturedWhiteEl, state.capturedWhite);
  renderCaptured(capturedBlackEl, state.capturedBlack);
}

function onSquareClick(event) {
  if (state.finished || ChessAI.isThinking() || state.turn !== "w") return;

  const row = Number(event.currentTarget.dataset.row);
  const col = Number(event.currentTarget.dataset.col);
  const clickedPiece = state.board[row][col];

  if (selected) {
    const move = legalTargets.find((t) => t.row === row && t.col === col);
    if (move) {
      applyMove(state, {
        from: selected,
        to: { row, col },
        special: move.special,
        castleMeta: move.castleMeta ?? null,
      });
      selected = null;
      legalTargets = [];
      updateGameStatus();
      render();
      maybePlayAiTurn();
      return;
    }
  }

  if (clickedPiece && clickedPiece[0] === "w") {
    selected = { row, col };
    legalTargets = getLegalMovesForPiece(state, row, col);
  } else {
    selected = null;
    legalTargets = [];
  }

  render();
}

function insideBoard(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function canPawnDoubleFrom(gameState, row, col) {
  const k = keyRc(row, col);
  if (!gameState.pawnDoubleEligible.has(k)) return false;
  if (gameState.pawnDoubleConsumed.has(k)) return false;
  return true;
}

function rookMayCastleThrough(board, color, rookRow, c1, c2) {
  const lo = Math.min(c1, c2);
  const hi = Math.max(c1, c2);
  for (let c = lo + 1; c < hi; c++) {
    const p = board[rookRow][c];
    if (!p) continue;
    if (p === `${color}k`) continue;
    return false;
  }
  return true;
}

function computeCastleMeta(gameState, color, kingsideAttempt) {
  const row = color === "w" ? 7 : 0;
  const enemy = color === "w" ? "b" : "w";
  const rights = gameState.castling[color];
  const board = gameState.board;
  if (!colorHasKing(board, color)) return null;
  if (isKingInCheck(board, color)) return null;

  const allow = kingsideAttempt ? rights.kingSide : rights.queenSide;
  if (!allow) return null;

  const kcFrom = boardRowKingCol(board, row, color);
  if (kcFrom < 0) return null;

  const goals = castlingGoals(color, kingsideAttempt);
  const kcTo = goals.kingCol;
  const rcTo = goals.rookCol;
  if (kcTo === kcFrom) return null;

  const rookCols = [];
  for (let x = 0; x < 8; x++) {
    const p = board[row][x];
    if (p === `${color}r`) rookCols.push(x);
  }
  const east = rookCols.filter((rc) => rc > kcFrom).sort((a, b2) => a - b2);
  const west = rookCols.filter((rc) => rc < kcFrom).sort((a, b2) => a - b2);
  const rookFromCol = kingsideAttempt ? east[east.length - 1] : west[0];
  if (rookFromCol === undefined) return null;

  if (board[row][kcTo]) return null;

  const step = kcTo > kcFrom ? 1 : -1;
  for (let scan = kcFrom + step; scan !== kcTo; scan += step) {
    if (board[row][scan]) return null;
    if (isSquareAttacked(board, row, scan, enemy)) return null;
  }
  if (isSquareAttacked(board, row, kcTo, enemy)) return null;

  if (!rookMayCastleThrough(board, color, row, rookFromCol, rcTo)) return null;

  if (board[row][rcTo]) return null;

  return {
    kingFromCol: kcFrom,
    kingToCol: kcTo,
    rookFrom: { row, col: rookFromCol },
    rookTo: { row, col: rcTo },
  };
}

function boardRowKingCol(board, row, color) {
  for (let c = 0; c < 8; c++) {
    if (board[row][c] === `${color}k`) return c;
  }
  return -1;
}

function getPseudoMovesForPiece(gameState, row, col, attackOnly = false) {
  const piece = gameState.board[row][col];
  if (!piece) return [];

  const color = piece[0];
  const type = piece[1];
  const enemy = color === "w" ? "b" : "w";
  const moves = [];

  if (type === "p") {
    const dir = color === "w" ? -1 : 1;
    const nextRow = row + dir;

    if (!attackOnly && insideBoard(nextRow, col) && !gameState.board[nextRow][col]) {
      moves.push({ row: nextRow, col });
      const doubleRow = row + 2 * dir;
      if (
        insideBoard(doubleRow, col) &&
        canPawnDoubleFrom(gameState, row, col) &&
        !gameState.board[doubleRow][col]
      ) {
        const mid = row + dir;
        if (!gameState.board[mid][col]) {
          moves.push({ row: doubleRow, col, special: "doublePawn" });
        }
      }
    }

    for (const dc of [-1, 1]) {
      const r = row + dir;
      const c = col + dc;
      if (!insideBoard(r, c)) continue;

      const target = gameState.board[r][c];
      if (target && target[0] === enemy) {
        moves.push({ row: r, col: c });
      }

      if (
        gameState.enPassant &&
        gameState.enPassant.row === r &&
        gameState.enPassant.col === c
      ) {
        moves.push({ row: r, col: c, special: "enPassant" });
      }

      if (attackOnly && !target) {
        moves.push({ row: r, col: c });
      }
    }
  } else if (type === "n") {
    const jumps = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1],
    ];
    for (const [dr, dc] of jumps) {
      const r = row + dr;
      const c = col + dc;
      if (!insideBoard(r, c)) continue;
      const target = gameState.board[r][c];
      if (!target || target[0] !== color) {
        moves.push({ row: r, col: c });
      }
    }
  } else if (type === "b" || type === "r" || type === "q") {
    const directions = [];
    if (type === "b" || type === "q") {
      directions.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    }
    if (type === "r" || type === "q") {
      directions.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    }

    for (const [dr, dc] of directions) {
      let r = row + dr;
      let c = col + dc;
      while (insideBoard(r, c)) {
        const target = gameState.board[r][c];
        if (!target) {
          moves.push({ row: r, col: c });
        } else {
          if (target[0] !== color) {
            moves.push({ row: r, col: c });
          }
          break;
        }
        r += dr;
        c += dc;
      }
    }
  } else if (type === "k") {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (!insideBoard(r, c)) continue;
        const target = gameState.board[r][c];
        if (!target || target[0] !== color) {
          moves.push({ row: r, col: c });
        }
      }
    }

    if (!attackOnly && colorHasKing(gameState.board, color)) {
      const kMetaKs = computeCastleMeta(gameState, color, true);
      if (kMetaKs && gameState.castling[color].kingSide) {
        moves.push({
          row,
          col: kMetaKs.kingToCol,
          special: "castleKingSide",
          castleMeta: kMetaKs,
        });
      }
      const kMetaQs = computeCastleMeta(gameState, color, false);
      if (kMetaQs && gameState.castling[color].queenSide) {
        moves.push({
          row,
          col: kMetaQs.kingToCol,
          special: "castleQueenSide",
          castleMeta: kMetaQs,
        });
      }
    }
  }

  return moves;
}

function cloneState(gameState) {
  return {
    variantId: gameState.variantId,
    board: gameState.board.map((row) => [...row]),
    turn: gameState.turn,
    capturedWhite: [...gameState.capturedWhite],
    capturedBlack: [...gameState.capturedBlack],
    finished: gameState.finished,
    winner: gameState.winner,
    castling: {
      w: { ...gameState.castling.w },
      b: { ...gameState.castling.b },
    },
    enPassant: gameState.enPassant ? { ...gameState.enPassant } : null,
    lastMoveFrom: gameState.lastMoveFrom ? { ...gameState.lastMoveFrom } : null,
    rookHomes: gameState.rookHomes.map((h) => ({ ...h })),
    pawnDoubleEligible: new Set(gameState.pawnDoubleEligible),
    pawnDoubleConsumed: new Set(gameState.pawnDoubleConsumed),
  };
}

function revokeCastlingByRookHome(gameState, row, col) {
  gameState.rookHomes.forEach((h) => {
    if (h.row === row && h.col === col) {
      if (h.wing === "kingSide") gameState.castling[h.color].kingSide = false;
      if (h.wing === "queenSide") gameState.castling[h.color].queenSide = false;
    }
  });
}

function revokeCastlingOnCapturedRook(gameState, row, col, capturedPiece) {
  if (!capturedPiece || capturedPiece[1] !== "r") return;
  const victim = capturedPiece[0];
  gameState.rookHomes.forEach((h) => {
    if (h.color === victim && h.row === row && h.col === col) {
      if (h.wing === "kingSide") gameState.castling[h.color].kingSide = false;
      if (h.wing === "queenSide") gameState.castling[h.color].queenSide = false;
    }
  });
}

function applyMove(gameState, move) {
  const piece = gameState.board[move.from.row][move.from.col];
  const color = piece[0];
  const enemy = color === "w" ? "b" : "w";
  let captured = gameState.board[move.to.row][move.to.col];

  gameState.enPassant = null;
  gameState.lastMoveFrom = { row: move.from.row, col: move.from.col };

  if (move.special === "enPassant") {
    const pawnRow = color === "w" ? move.to.row + 1 : move.to.row - 1;
    captured = gameState.board[pawnRow][move.to.col];
    gameState.board[pawnRow][move.to.col] = null;
  }

  if (captured) {
    if (captured[0] === "w") gameState.capturedWhite.push(captured);
    else gameState.capturedBlack.push(captured);
    revokeCastlingOnCapturedRook(gameState, move.to.row, move.to.col, captured);
  }

  if (piece[1] === "p") {
    const k = keyRc(move.from.row, move.from.col);
    if (gameState.pawnDoubleEligible.has(k)) {
      gameState.pawnDoubleConsumed.add(k);
    }
  }

  gameState.board[move.from.row][move.from.col] = null;
  gameState.board[move.to.row][move.to.col] = piece;

  if (piece[1] === "k") {
    gameState.castling[color].kingSide = false;
    gameState.castling[color].queenSide = false;

    if (
      move.special === "castleKingSide" ||
      move.special === "castleQueenSide"
    ) {
      const meta = move.castleMeta;
      if (meta) {
        const rf = meta.rookFrom;
        const rt = meta.rookTo;
        const rookPc = gameState.board[rf.row][rf.col];
        if (rookPc === `${color}r`) {
          gameState.board[rf.row][rf.col] = null;
          gameState.board[rt.row][rt.col] = rookPc;
        }
      }
    }
  }

  if (piece[1] === "r") {
    revokeCastlingByRookHome(gameState, move.from.row, move.from.col);
  }

  if (piece[1] === "p" && move.special === "doublePawn") {
    gameState.enPassant = {
      row: (move.from.row + move.to.row) / 2,
      col: move.from.col,
    };
  }

  if (piece[1] === "p") {
    const promotionRow = color === "w" ? 0 : 7;
    if (move.to.row === promotionRow) {
      gameState.board[move.to.row][move.to.col] = `${color}q`;
    }
  }

  gameState.turn = enemy;
}

function getLegalMovesForPiece(gameState, row, col) {
  const piece = gameState.board[row][col];
  if (!piece || piece[0] !== gameState.turn) return [];

  const pseudoMoves = getPseudoMovesForPiece(gameState, row, col, false);
  const legal = [];

  for (const target of pseudoMoves) {
    const clone = cloneState(gameState);
    applyMove(clone, {
      from: { row, col },
      to: { row: target.row, col: target.col },
      special: target.special,
      castleMeta: target.castleMeta ?? null,
    });

    const hasKingAfter = !!findKing(clone.board, piece[0]);
    if (hasKingAfter && isKingInCheck(clone.board, piece[0])) continue;
    legal.push(target);
  }

  return legal;
}

function isSquareAttacked(board, row, col, byColor) {
  const tempState = {
    board,
    castling: {
      w: { kingSide: false, queenSide: false },
      b: { kingSide: false, queenSide: false },
    },
    enPassant: null,
    pawnDoubleEligible: new Set(),
    pawnDoubleConsumed: new Set(),
  };

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece || piece[0] !== byColor) continue;
      const attacks = getPseudoMovesForPiece(tempState, r, c, true);
      if (attacks.some((a) => a.row === row && a.col === col)) {
        return true;
      }
    }
  }
  return false;
}

function findKing(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === `${color}k`) return { row: r, col: c };
    }
  }
  return null;
}

function isKingInCheck(board, color) {
  const kingPos = findKing(board, color);
  if (!kingPos) return false;
  const enemy = color === "w" ? "b" : "w";
  return isSquareAttacked(board, kingPos.row, kingPos.col, enemy);
}

function materialCount(board, colorLetter) {
  let n = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p[0] === colorLetter) n += 1;
    }
  }
  return n;
}

function maybeResolveHordeArmyWin() {
  if (state.variantId === "horde_wb") {
    if (materialCount(state.board, "w") === 0) {
      state.finished = true;
      state.winner = "b";
      resultEl.textContent = "Cerné vyhrané (horda zbílých znicena)";
      return true;
    }
  }
  if (state.variantId === "horde_bw") {
    if (materialCount(state.board, "b") === 0) {
      state.finished = true;
      state.winner = "w";
      resultEl.textContent = "Vyhrano (cerna horda znicena)";
      return true;
    }
  }
  return false;
}

function updateGameStatus() {
  if (maybeResolveHordeArmyWin()) return;

  const turnHasKing = colorHasKing(state.board, state.turn);
  const inCheck = turnHasKing && isKingInCheck(state.board, state.turn);
  const canMove = hasAnyLegalMove(state, state.turn);

  if (!canMove) {
    state.finished = true;
    if (!turnHasKing) {
      state.winner = null;
      resultEl.textContent = "Pat.";
      return;
    }
    if (inCheck) {
      state.winner = state.turn === "w" ? "b" : "w";
      resultEl.textContent = "Mat!";
    } else {
      state.winner = null;
      resultEl.textContent = "Pat!";
    }
  } else {
    state.finished = false;
    state.winner = null;
    resultEl.textContent = "";
  }
}

function hasAnyLegalMove(gameState, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = gameState.board[r][c];
      if (piece && piece[0] === color) {
        if (getLegalMovesForPiece({ ...gameState, turn: color }, r, c).length > 0) {
          return true;
        }
      }
    }
  }
  return false;
}

function maybePlayAiTurn() {
  ChessAI.playTurn({
    gameState: state,
    getLegalMovesForPiece,
    applyMove,
    cloneState,
    isKingInCheck,
    updateGameStatus,
    render,
  });
}

aiModeEl.addEventListener("change", (event) => {
  ChessAI.setMode(event.target.value);
});

resetBtn.addEventListener("click", () => {
  ChessAI.cancel();
  state = createInitialState();
  selected = null;
  legalTargets = [];
  resultEl.textContent = "";
  render();
});

if (variantEl) {
  variantEl.addEventListener("change", () => {
    ChessAI.cancel();
    state = createInitialState();
    selected = null;
    legalTargets = [];
    resultEl.textContent = "";
    render();
  });
}

ChessAI.setMode(aiModeEl.value);
render();
