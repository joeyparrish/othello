const grid = [];

function init() {
  const peer = new Peer();
  peer.on('open', () => {
    peer.id;
  });

  setupBoard();
}

function setupBoard() {
  for (let y = 0; y < 8; ++y) {
    const row = [];
    grid.push(row);

    for (let x = 0; x < 8; ++x) {
      const div = document.createElement('div');
      div.classList.add('square');
      div.dataset['x'] = x;
      div.dataset['y'] = y;
      board.appendChild(div);
      row.push(div);

      const xmlns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(xmlns, 'svg');
      svg.setAttributeNS(null, 'viewBox', '0 0 100 100');
      div.appendChild(svg);

      const circle = document.createElementNS(xmlns, 'circle');
      circle.setAttributeNS(null, 'cx', '50');
      circle.setAttributeNS(null, 'cy', '50');
      circle.setAttributeNS(null, 'r', '45');
      svg.appendChild(circle);

      div.addEventListener('click', onClick);
    }
  }

  grid[3][3].classList.add('white');
  grid[3][4].classList.add('black');
  grid[4][4].classList.add('white');
  grid[4][3].classList.add('black');
}

function *iterateDirection(x, y, dx, dy, color) {
  // Don't try to iterate in place!
  if (!dx && !dy) {
    return;
  }

  x += dx;
  y += dy;

  for (; y >= 0 && y <= 7 && x >= 0 && x <= 7; y += dy, x += dx) {
    yield grid[y][x];
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
  for (const div of iterateDirection(x, y, dx, dy)) {
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
  x = parseInt(x);
  y = parseInt(y);

  if (!isValidPlay(x, y, color)) {
    console.log('invalid play', x, y, color);
    return;
  }

  console.log('play', x, y, color);
  grid[y][x].classList.add(color);

  for (const dx of [-1, 0, 1]) {
    for (const dy of [-1, 0, 1]) {
      if (isValidInDirection(x, y, dx, dy, color)) {
        for (const div of iterateDirection(x, y, dx, dy)) {
          if (isEmpty(div) || isColor(div, color)) {
            break;
          }

          div.classList.add('flip');
          div.classList.add(color);
          div.classList.remove(oppositeColor(color));
        }
      }
    }
  }
}

function onClick(event) {
  const div = event.currentTarget;
  const {x, y} = div.dataset;

  if (div.classList.contains('white') || div.classList.contains('black')) {
    div.classList.add('flip');
    div.classList.toggle('white');
    div.classList.toggle('black');
  } else {
    playStone(x, y, 'white');
  }
}

document.addEventListener('DOMContentLoaded', init);
