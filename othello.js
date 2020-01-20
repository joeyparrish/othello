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

      div.addEventListener('click', () => {
        if (div.classList.contains('white') ||
            div.classList.contains('black')) {
          div.classList.add('flip');
          div.classList.toggle('white');
          div.classList.toggle('black');
        } else {
          div.classList.add('white');
        }
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
