const ChessAI = (() => {
  const ALPHA_BETA_DEPTH = 5;
  let thinking = false;
  let timerId = null;
  let mode = "easy";

  function isThinking() {
    return thinking;
  }

  function cancel() {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
    thinking = false;
  }

  function setMode(nextMode) {
    if (nextMode === "minmax" || nextMode === "alphabeta") {
      mode = nextMode;
      return;
    }
    mode = "easy";
  }

  function getMode() {
    return mode;
  }

  function getPieceValue(piece) {
    if (!piece) return 0;
    const values = {
      p: 1,
      n: 3,
      b: 3,
      r: 5,
      q: 9,
      k: 100,
    };
    return values[piece[1]] || 0;
  }

  function getAllLegalMoves(gameState, color, getLegalMovesForPiece) {
    const allMoves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = gameState.board[r][c];
        if (!piece || piece[0] !== color) continue;

        const moves = getLegalMovesForPiece({ ...gameState, turn: color }, r, c);
        for (const move of moves) {
          allMoves.push({
            from: { row: r, col: c },
            to: { row: move.row, col: move.col },
            special: move.special,
          });
        }
      }
    }
    return allMoves;
  }

  function evaluateMaterial(gameState) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = gameState.board[r][c];
        if (!piece) continue;
        const value = getPieceValue(piece);
        score += piece[0] === "b" ? value : -value;
      }
    }
    return score;
  }

  function evaluateTerminal(gameState, getLegalMovesForPiece, isKingInCheck) {
    const currentColor = gameState.turn;
    const legalMoves = getAllLegalMoves(gameState, currentColor, getLegalMovesForPiece);
    if (legalMoves.length > 0) return null;

    if (!isKingInCheck(gameState.board, currentColor)) {
      return 0;
    }

    return currentColor === "b" ? -10000 : 10000;
  }

  function minimax(gameState, depth, getLegalMovesForPiece, applyMove, cloneState, isKingInCheck) {
    const terminalScore = evaluateTerminal(gameState, getLegalMovesForPiece, isKingInCheck);
    if (terminalScore !== null) return terminalScore;
    if (depth === 0) return evaluateMaterial(gameState);

    const currentColor = gameState.turn;
    const legalMoves = getAllLegalMoves(gameState, currentColor, getLegalMovesForPiece);

    if (currentColor === "b") {
      let best = -Infinity;
      for (const move of legalMoves) {
        const nextState = cloneState(gameState);
        applyMove(nextState, move);
        const score = minimax(
          nextState,
          depth - 1,
          getLegalMovesForPiece,
          applyMove,
          cloneState,
          isKingInCheck
        );
        if (score > best) best = score;
      }
      return best;
    }

    let best = Infinity;
    for (const move of legalMoves) {
      const nextState = cloneState(gameState);
      applyMove(nextState, move);
      const score = minimax(
        nextState,
        depth - 1,
        getLegalMovesForPiece,
        applyMove,
        cloneState,
        isKingInCheck
      );
      if (score < best) best = score;
    }
    return best;
  }

  function orderMoves(gameState, moves) {
    return [...moves].sort((a, b) => {
      const targetA = gameState.board[a.to.row][a.to.col];
      const targetB = gameState.board[b.to.row][b.to.col];
      const valueA = a.special === "enPassant" ? 1 : getPieceValue(targetA);
      const valueB = b.special === "enPassant" ? 1 : getPieceValue(targetB);
      return valueB - valueA;
    });
  }

  function minimaxAlphaBeta(
    gameState,
    depth,
    alpha,
    beta,
    getLegalMovesForPiece,
    applyMove,
    cloneState,
    isKingInCheck
  ) {
    const terminalScore = evaluateTerminal(gameState, getLegalMovesForPiece, isKingInCheck);
    if (terminalScore !== null) return terminalScore;
    if (depth === 0) return evaluateMaterial(gameState);

    const currentColor = gameState.turn;
    const legalMoves = orderMoves(
      gameState,
      getAllLegalMoves(gameState, currentColor, getLegalMovesForPiece)
    );

    if (currentColor === "b") {
      let best = -Infinity;
      for (const move of legalMoves) {
        const nextState = cloneState(gameState);
        applyMove(nextState, move);
        const score = minimaxAlphaBeta(
          nextState,
          depth - 1,
          alpha,
          beta,
          getLegalMovesForPiece,
          applyMove,
          cloneState,
          isKingInCheck
        );
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (beta <= alpha) break;
      }
      return best;
    }

    let best = Infinity;
    for (const move of legalMoves) {
      const nextState = cloneState(gameState);
      applyMove(nextState, move);
      const score = minimaxAlphaBeta(
        nextState,
        depth - 1,
        alpha,
        beta,
        getLegalMovesForPiece,
        applyMove,
        cloneState,
        isKingInCheck
      );
      if (score < best) best = score;
      if (best < beta) beta = best;
      if (beta <= alpha) break;
    }
    return best;
  }

  function chooseEasyMove(gameState, getLegalMovesForPiece) {
    const legalMoves = getAllLegalMoves(gameState, "b", getLegalMovesForPiece);
    if (legalMoves.length === 0) return null;

    let bestScore = -Infinity;
    let candidates = [];

    for (const move of legalMoves) {
      const targetPiece = gameState.board[move.to.row][move.to.col];
      let score = getPieceValue(targetPiece);
      if (move.special === "enPassant") {
        score = getPieceValue("wp");
      }

      if (score > bestScore) {
        bestScore = score;
        candidates = [move];
      } else if (score === bestScore) {
        candidates.push(move);
      }
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function chooseMinMaxMove(gameState, getLegalMovesForPiece, applyMove, cloneState, isKingInCheck) {
    const legalMoves = getAllLegalMoves(gameState, "b", getLegalMovesForPiece);
    if (legalMoves.length === 0) return null;

    let bestScore = -Infinity;
    let bestMoves = [];

    for (const move of legalMoves) {
      const nextState = cloneState(gameState);
      applyMove(nextState, move);
      const score = minimax(
        nextState,
        2,
        getLegalMovesForPiece,
        applyMove,
        cloneState,
        isKingInCheck
      );

      if (score > bestScore) {
        bestScore = score;
        bestMoves = [move];
      } else if (score === bestScore) {
        bestMoves.push(move);
      }
    }

    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  function chooseAlphaBetaMove(
    gameState,
    getLegalMovesForPiece,
    applyMove,
    cloneState,
    isKingInCheck
  ) {
    const legalMoves = getAllLegalMoves(gameState, "b", getLegalMovesForPiece);
    if (legalMoves.length === 0) return null;

    const orderedMoves = orderMoves(gameState, legalMoves);
    let bestScore = -Infinity;
    let bestMoves = [];
    let alpha = -Infinity;

    for (const move of orderedMoves) {
      const nextState = cloneState(gameState);
      applyMove(nextState, move);
      const score = minimaxAlphaBeta(
        nextState,
        ALPHA_BETA_DEPTH - 1,
        alpha,
        Infinity,
        getLegalMovesForPiece,
        applyMove,
        cloneState,
        isKingInCheck
      );

      if (score > bestScore) {
        bestScore = score;
        bestMoves = [move];
      } else if (score === bestScore) {
        bestMoves.push(move);
      }

      if (bestScore > alpha) alpha = bestScore;
    }

    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  function chooseMove(gameState, getLegalMovesForPiece, applyMove, cloneState, isKingInCheck) {
    if (mode === "alphabeta") {
      return chooseAlphaBetaMove(
        gameState,
        getLegalMovesForPiece,
        applyMove,
        cloneState,
        isKingInCheck
      );
    }
    if (mode === "minmax") {
      return chooseMinMaxMove(
        gameState,
        getLegalMovesForPiece,
        applyMove,
        cloneState,
        isKingInCheck
      );
    }
    return chooseEasyMove(gameState, getLegalMovesForPiece);
  }

  function playTurn({
    gameState,
    getLegalMovesForPiece,
    applyMove,
    cloneState,
    isKingInCheck,
    updateGameStatus,
    render,
  }) {
    if (gameState.finished || gameState.turn !== "b" || thinking) return;

    thinking = true;
    render();

    timerId = setTimeout(() => {
      const move = chooseMove(
        gameState,
        getLegalMovesForPiece,
        applyMove,
        cloneState,
        isKingInCheck
      );
      if (move) {
        applyMove(gameState, move);
      }

      updateGameStatus();
      thinking = false;
      timerId = null;
      render();
    }, mode === "alphabeta" ? 600 : mode === "minmax" ? 450 : 350);
  }

  return {
    isThinking,
    cancel,
    setMode,
    getMode,
    playTurn,
  };
})();
