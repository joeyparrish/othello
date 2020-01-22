'use strict';

const grid = [];
const scoreElements = {};
let turn = 'white';

function init() {
  const peer = new Peer();
  peer.on('open', () => {
    peer.id;
  });

  scoreElements.black = createScore('black');
  scoreElements.white = createScore('white');
  createBoard();
  resetGame();

  window.resetButton.addEventListener('click', resetGame);
}

function createStone() {
  const xmlns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(xmlns, 'svg');
  svg.setAttributeNS(null, 'viewBox', '0 0 100 100');

  const circle = document.createElementNS(xmlns, 'circle');
  circle.classList.add('stone');
  circle.setAttributeNS(null, 'cx', '50');
  circle.setAttributeNS(null, 'cy', '50');
  circle.setAttributeNS(null, 'r', '45');
  svg.appendChild(circle);

  const indicator = document.createElementNS(xmlns, 'circle');
  indicator.classList.add('indicator');
  indicator.setAttributeNS(null, 'cx', '50');
  indicator.setAttributeNS(null, 'cy', '50');
  indicator.setAttributeNS(null, 'r', '15');
  svg.appendChild(indicator);

  return svg;
}

function createScore(color) {
  const span = document.createElement('span');
  span.classList.add('score-wrapper');
  window.score.appendChild(span);

  const stoneContainer = document.createElement('span');
  stoneContainer.classList.add('stone-container');
  stoneContainer.classList.add(color);
  span.appendChild(stoneContainer);

  const stone = createStone();
  stoneContainer.appendChild(stone);

  const msgContainer = document.createElement('div');
  msgContainer.classList.add('msg-container');
  stoneContainer.appendChild(msgContainer);

  const scoreSpan = document.createElement('span');
  scoreSpan.classList.add('score-text');
  span.appendChild(scoreSpan);

  scoreSpan.addEventListener('animationend', () => {
    scoreSpan.classList.remove('animated-text');
  });

  return {
    container: stoneContainer,
    scoreSpan,
  };
}

function createBoard() {
  for (let y = 0; y < 8; ++y) {
    const row = [];
    grid.push(row);

    for (let x = 0; x < 8; ++x) {
      const div = document.createElement('div');
      div.classList.add('square');
      div.dataset.x = x;
      div.dataset.y = y;
      div.addEventListener('click', onClick);
      div.addEventListener('animationend', markValidMoves);
      div.appendChild(createStone());
      window.board.appendChild(div);
      row.push(div);
    }
  }
}

function takeScore() {
  const scores = { black: 0, white: 0 };

  for (let y = 0; y < 8; ++y) {
    for (let x = 0; x < 8; ++x) {
      if (grid[y][x].classList.contains('black')) {
        scores.black += 1;
      }

      if (grid[y][x].classList.contains('white')) {
        scores.white += 1;
      }
    }
  }

  for (const color in scores) {
    scoreElements[color].scoreSpan.textContent = scores[color];
    scoreElements[color].scoreSpan.classList.remove('animated-text');
    scoreElements[color].scoreSpan.classList.add('animated-text');
  }

  if (scores.black + scores.white == 64) {
    // Full board!
    endGame();
  }
}

function endGame() {
  document.body.classList.add('gameOver');
  scoreElements.white.container.classList.remove('turn');
  scoreElements.black.container.classList.remove('turn');

  const black = window.board.querySelectorAll('.black').length;
  const white = window.board.querySelectorAll('.white').length;

  if (black > white) {
    scoreElements.black.container.classList.add('win');
  } else if (white > black) {
    scoreElements.white.container.classList.add('win');
  } else {
    scoreElements.black.container.classList.add('tie');
    scoreElements.white.container.classList.add('tie');
  }
}

function isGameOver() {
  return document.body.classList.contains('gameOver');
}

function resetGame() {
  console.log('Resetting game');

  document.body.classList.remove('gameOver');

  for (const color in scoreElements) {
    scoreElements[color].container.classList.remove('turn');
    scoreElements[color].container.classList.remove('win');
    scoreElements[color].container.classList.remove('tie');
  }

  for (const div of window.board.querySelectorAll('.square')) {
    div.classList.remove('black');
    div.classList.remove('white');
    div.classList.remove('last');
    div.classList.remove('flip');
    div.classList.remove('valid');
  }

  grid[3][3].classList.add('white');
  grid[3][4].classList.add('black');
  grid[4][3].classList.add('black');
  grid[4][4].classList.add('white');

  turn = 'white';
  takeScore();
  scoreElements[turn].container.classList.add('turn');
  markValidMoves();
}

function markValidMoves() {
  if (isGameOver()) {
    return;
  }

  if (window.board.querySelector('.black') == null ||
      window.board.querySelector('.white') == null) {
    // No pieces left!
    endGame();
    return;
  }

  for (let y = 0; y < 8; ++y) {
    for (let x = 0; x < 8; ++x) {
      if (isValidPlay(x, y, turn)) {
        grid[y][x].classList.add('valid');
      }
    }
  }

  if (window.board.querySelector('.valid') == null) {
    console.log('PASS', turn);
    scoreElements[turn].container.classList.add('pass');
    setTimeout(() => {
      scoreElements[turn].container.classList.remove('pass');
      nextTurn();
      markValidMoves();
    }, 1000);
  }
}

function unmarkValidMoves() {
  for (const div of window.board.querySelectorAll('.valid')) {
    div.classList.remove('valid');
  }
}

function nextTurn() {
  unmarkValidMoves();
  scoreElements[turn].container.classList.remove('turn');
  turn = oppositeColor(turn);
  console.log('TURN', turn);
  scoreElements[turn].container.classList.add('turn');
}

function *scanDirection(x, y, dx, dy, color) {
  x += dx;
  y += dy;

  for (; y >= 0 && y <= 7 && x >= 0 && x <= 7; y += dy, x += dx) {
    yield grid[y][x];
  }
}

function *allDirections() {
  for (const dx of [-1, 0, 1]) {
    for (const dy of [-1, 0, 1]) {
      // Never yield direction [0, 0] (in place)
      if (dx || dy) {
        yield [dx, dy];
      }
    }
  }
}

function isEmpty(div) {
  return !div.classList.contains('black') && !div.classList.contains('white');
}

function isColor(div, color) {
  return div.classList.contains(color);
}

function oppositeColor(color) {
  return color == 'white' ? 'black' : 'white';
}

function isValidInDirection(x, y, dx, dy, color) {
  let first = true;
  for (const div of scanDirection(x, y, dx, dy)) {
    if (first) {
      if (!isColor(div, oppositeColor(color))) {
        return false;
      }

      first = false;
    }

    if (isEmpty(div)) {
      return false;
    }

    if (isColor(div, color)) {
      return true;
    }
  }
  return false;
}

function isValidPlay(x, y, color) {
  if (!isEmpty(grid[y][x])) {
    return false;
  }

  for (const dx of [-1, 0, 1]) {
    for (const dy of [-1, 0, 1]) {
      if (isValidInDirection(x, y, dx, dy, color)) {
        return true;
      }
    }
  }

  return false;
}

function playStone(x, y, color) {
  if (!isValidPlay(x, y, color)) {
    console.log('invalid play', x, y, color);
    return false;
  }

  console.log('play', x, y, color);
  const playSquare = grid[y][x];
  playSquare.classList.add(color);

  const last = window.board.querySelector('.last');
  if (last) {
    last.classList.remove('last');
  }
  playSquare.classList.add('last');

  for (const [dx, dy] of allDirections()) {
    if (isValidInDirection(x, y, dx, dy, color)) {
      for (const div of scanDirection(x, y, dx, dy)) {
        if (isEmpty(div) || isColor(div, color)) {
          break;
        }

        div.classList.add('flip');
        div.classList.add(color);
        div.classList.remove(oppositeColor(color));
      }
    }
  }

  return true;
}

function onClick(event) {
  if (isGameOver()) {
    return;
  }

  const div = event.currentTarget;
  const {x, y} = div.dataset;
  const ok = playStone(parseInt(x), parseInt(y), turn);
  if (ok) {
    nextTurn();
    takeScore();
  }
}

document.addEventListener('DOMContentLoaded', init);
