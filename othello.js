'use strict';

// 2D array of game board squares, y-coordinate first.
const grid = [];
// Score container and scoreSpan elements, indexed by color (white/black).
const scoreElements = {};

// Whose turn it is, either 'white' or 'black'.
let turn;
// A timer used when someone has to pass.
let passTimerId = null;
// True while the flip animation is in-progress.
let animatingFlip = false;
// True if the game is over.
let gameOver = false;
// The number of consecutive passes.  Game over at 2.
let passCount = 0;

// True if we're playing a P2P game.
let remoteGame = false;
// A PeerJS object.
let peer = null;
// A PeerJS Connection object.
let conn = null;
// PeerJS Connections for game observers.
const observers = [];
// A PeerJS Call object.
let call = null;
// The color of the local player, either 'white' or 'black'.
let myColor = null;
// A MediaStream object for the local WebRTC feed.
let localStream = null;

// Neither white nor black, so it is never your turn if you're an observer.
const OBSERVER_COLOR = 'blue';

const urlParameters = new Map();
if (location.search) {
  const pairs = location.search.substr(1).split('&');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    urlParameters.set(key, value);
  }
}
const withVideo = !urlParameters.has('novideo');
const tableId = urlParameters.get('tableid');

function init() {
  // Create the score board.
  scoreElements.black = createScore('black');
  scoreElements.white = createScore('white');

  // Create the game board.
  createBoard();

  // When the reset button is clicked, reset the game.
  window.resetButton.addEventListener('click', () => {
    if (remoteGame) {
      // In a P2P game, send a reset message over the data connection to the
      // peer.
      broadcast({reset: true});
    }

    resetGame();
  });

  if (tableId) {
    // Setup RTC right away.
    setupRtc();
    // Hide the reset button until we're connected.
    window.resetButton.classList.add('hide');
  } else {
    // Set the initial board state.
    resetGame();

    // When the P2P button is clicked, set up the WebRTC components.
    window.remoteButton.addEventListener('click', () => {
      // Hide the P2P button and show the P2P components.
      window.remoteButton.classList.remove('show');
      window.p2pContainer.classList.add('show');
      window.idContainer.classList.add('show');
      if (withVideo) {
        window.videoContainer.classList.add('show');
      }

      // Setup RTC.
      setupRtc();
    });
  }

  // When the online/offline state changes, update the UI.  Then set the
  // initial state.
  window.addEventListener('online', onOnlineStatusChanged);
  window.addEventListener('offline', onOnlineStatusChanged);
  onOnlineStatusChanged();

  // When the local ID field is clicked, copy it to the clipboard.
  window.myId.addEventListener('click', () => {
    window.myId.select();
    document.execCommand("copy");
  });

  // When the user presses enter on the remote ID field, try to connect to the
  // specified peer.
  window.joinPeer.addEventListener('keypress', (event) => {
    if (event.keyCode == 13) {
      // Initiate a data connection first.
      const peerId = window.joinPeer.value.trim();
      connectToPeer(peerId);
    }
  });

  // When the mute button is clicked, toggle the mute status of both video
  // feeds.  The mute button is necessary for the remote feed because it cannot
  // be muted on Android using the volume rocker only.  The mute button is
  // necessary for the local feed because it is the only way for the user to
  // control their own privacy if they need to.
  window.muteButton.addEventListener('click', () => {
    const newState = !window.friend.muted;

    // Mute the outgoing stream.
    if (localStream) {
      for (const track of localStream.getAudioTracks()) {
        track.enabled = newState;
      }
    }

    // Mute the incoming stream.
    window.friend.muted = newState;

    // Update the button state.
    window.muteButton.setAttribute('muted', newState);
  });

  // When the close button is clicked, close the P2P connections.
  window.closeRtcButton.addEventListener('click', closeRtc);

  // Register a service-worker so that the game will work offline.
  if (navigator.serviceWorker) {
    navigator.serviceWorker.register('service-worker.js');
  }
}

function broadcast(data) {
  conn.send(data);

  // Forward this game event to all observers.
  for (const observer of observers) {
    if (observer.open) {
      observer.send(data);
    }
  }
}

// Initiate a connection to a peer.  This is done you enter a friend's ID or
// when using a table ID from the URL.
function connectToPeer(peerId, color) {
  conn = peer.connect(peerId);

  window.joinPeer.value = '(connecting...)';
  window.joinPeer.disabled = true;

  conn.on('open', () => {
    // If we're calling someone else, we will play 'white'.
    onConnection(color || 'white');

    if (withVideo) {
      // Then try to establish a video call.
      call = peer.call(window.joinPeer.value.trim(), localStream);
      onCall();
    }
  });
}

// Set up WebRTC-based P2P game.
async function setupRtc() {
  if (withVideo) {
    // Initialize the video to be unmuted.
    window.friend.muted = false;
    window.muteButton.setAttribute('muted', window.friend.muted);

    // Get a local media stream from the user's camera & mic.
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: 500,
        height: 500,
        facingMode: 'user',
      },
      audio: true,
    });

    // Attach the local stream to the "me" video.
    window.me.srcObject = localStream;
  }

  // Connect to PeerJS.
  window.myId.value = '(connecting...)';
  window.myId.disabled = true;

  if (tableId) {
    window.tableStatus.textContent = 'Connecting...';
    window.tableStatus.classList.add('show');
    registerWithPeerJs('othello-table-' + tableId, 0);
  } else {
    registerWithPeerJs(generateRandomId());
  }
}

function registerWithPeerJs(id, counter) {
  const options = {};
  if (urlParameters.has('peerserver')) {
    options.host = urlParameters.get('peerserver');
  }

  peer = new Peer(counter ? id + '-' + counter : id, options);
  peer.on('open', () => {
    // When we know our own ID, fill in that part of the UI.
    window.myId.value = peer.id;
    window.myId.disabled = false;

    if (tableId && counter) {
      if (counter > 1) {
        connectToPeer(id, OBSERVER_COLOR);  // So it's never your turn
      } else {
        connectToPeer(id);
      }
    } else {
      window.tableStatus.textContent = 'Waiting for opponent...';
    }
  });

  peer.on('call', (callArg) => {
    // When a call comes in, answer it with the local stream.
    call = callArg;
    call.answer(localStream);
    onCall();
  });

  peer.on('connection', (connArg) => {
    // When a data connection comes in, answer it.
    if (!conn || !conn.open) {
      // If it's the first connection, assign the first player to 'black'.
      conn = connArg;
      onConnection('black');
      if (tableId) {
        // Finally set up the initial game.
        resetGame();
      }
    } else {
      // Otherwise, add it to the observer list.
      observers.push(connArg);
    }

    // Wait for the data channel to be open, then send the full game state.
    connArg.on('open', () => {
      sendFullGameState(connArg);
    });
  });

  peer.on('error', (error) => {
    // If an error occurs, log it and show an error message.
    console.log('PEER ERROR', error);

    if (tableId && error.type == 'unavailable-id' && counter < 10) {
      setTimeout(() => {
        registerWithPeerJs(id, counter + 1);
      }, 1000);
    } else {
      window.tableStatus.textContent = 'Table full?';
      window.joinPeer.value = '(ERROR!)';
      setTimeout(() => {
        window.joinPeer.value = '';
        window.joinPeer.disabled = false;
      }, 5000);
    }
  });
}

// Stop the local stream, close all connections, and reset the game state.
function closeRtc() {
  if (conn) {
    conn.close();
  }

  if (call) {
    call.close();
  }

  if (peer) {
    peer.destroy();
  }

  if (localStream) {
    for (const track of localStream.getTracks()) {
      track.stop();
    }
  }

  peer = null;
  conn = null;
  remoteGame = false;
  myColor = null;
  localStream = null;

  window.myId.value = '';
  window.friend.srcObject = null;
  window.me.srcObject = null;

  onOnlineStatusChanged();  // To compute whether to show the remote button.

  // Hide the P2P components.
  window.p2pContainer.classList.remove('show');

  // Reset the game state.
  resetGame();
}

// Create and return an SVG object representing the game stone.
function createStone() {
  const xmlns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(xmlns, 'svg');
  svg.setAttributeNS(null, 'viewBox', '0 0 100 100');

  // The circle of the stone itself.
  const circle = document.createElementNS(xmlns, 'circle');
  circle.classList.add('stone');
  circle.setAttributeNS(null, 'cx', '50');
  circle.setAttributeNS(null, 'cy', '50');
  circle.setAttributeNS(null, 'r', '45');
  svg.appendChild(circle);

  // A smaller circle inside and on top of the stone, to indicate "last play"
  // or "valid play" states.
  const indicator = document.createElementNS(xmlns, 'circle');
  indicator.classList.add('indicator');
  indicator.setAttributeNS(null, 'cx', '50');
  indicator.setAttributeNS(null, 'cy', '50');
  indicator.setAttributeNS(null, 'r', '15');
  svg.appendChild(indicator);

  return svg;
}

// Create and return score container elements for the given color.
function createScore(color) {
  // The container for this player's score.
  const span = document.createElement('span');
  span.classList.add('score-wrapper');
  window.scoreBoard.appendChild(span);

  // The container for the stone in the score board.
  const stoneContainer = document.createElement('span');
  stoneContainer.classList.add('stone-container');
  stoneContainer.classList.add(color);
  span.appendChild(stoneContainer);

  // The stone itself.
  const stone = createStone();
  stoneContainer.appendChild(stone);

  // Add a message container on top of the stone.
  const msgContainer = document.createElement('div');
  msgContainer.classList.add('msg-container');
  stoneContainer.appendChild(msgContainer);

  // A span to contain the actual numerical score.
  const scoreSpan = document.createElement('span');
  scoreSpan.classList.add('score-text');
  span.appendChild(scoreSpan);

  // When the animation on the score text is over, remove the animation class,
  // so that it can be added again when the score changes.
  scoreSpan.addEventListener('animationend', () => {
    scoreSpan.classList.remove('animated-text');
  });

  // Return the container and score span.
  return {
    container: stoneContainer,
    scoreSpan,
  };
}

// Create the game board and its squares.
function createBoard() {
  // The 8x8 grid of squares first.
  for (let y = 0; y < 8; ++y) {
    const row = [];
    grid.push(row);

    for (let x = 0; x < 8; ++x) {
      // Create a square element.
      const div = document.createElement('div');
      div.classList.add('square');
      div.classList.add('stone-container');

      // Store the grid coordinates on the element.
      div.dataset.x = x;
      div.dataset.y = y;

      // When the square is clicked, invoke this callback.
      div.addEventListener('click', onClick);

      // When the flip animation ends, update the flip state and mark the valid
      // moves for the next player.
      div.addEventListener('animationend', () => {
        animatingFlip = false;
        markValidMoves();
      });

      // Add the stone itself, which will not show up until a black or white
      // class is added to the square.
      div.appendChild(createStone());

      // Add the square to the DOM and to the 2D array.
      window.gameBoard.appendChild(div);
      row.push(div);
    }
  }

  // Add the spots on the inner board corners.
  for (let x = 0; x < 4; ++x) {
    const spot = document.createElement('div');
    spot.classList.add('spot');
    spot.id = 'spot-' + x;
    window.gameBoard.appendChild(spot);
  }
}

// Count the stones on the board and update the score text.
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
    scoreElements[color].scoreSpan.classList.add('animated-text');
  }

  // If the board is full, the game is over.
  if (scores.black + scores.white == 64) {
    endGame();
  }
}

// End the game and update the UI to match.
function endGame() {
  gameOver = true;

  // It's nobody's turn.
  scoreElements.white.container.classList.remove('turn');
  scoreElements.black.container.classList.remove('turn');

  // Count the score and update state for the winner or for a tie.
  const black = window.gameBoard.querySelectorAll('.black').length;
  const white = window.gameBoard.querySelectorAll('.white').length;

  if (black > white) {
    scoreElements.black.container.classList.add('win');
  } else if (white > black) {
    scoreElements.white.container.classList.add('win');
  } else {
    scoreElements.black.container.classList.add('tie');
    scoreElements.white.container.classList.add('tie');
  }
}

// Reset the game state.
function resetGame() {
  console.log('Resetting game');

  gameOver = false;

  // Remove any state classes from the score board.
  for (const color in scoreElements) {
    scoreElements[color].container.classList.remove('turn');
    scoreElements[color].container.classList.remove('win');
    scoreElements[color].container.classList.remove('tie');
    scoreElements[color].container.classList.remove('bailed');
  }

  // Remove any state classes from the game board.
  for (const div of window.gameBoard.querySelectorAll('.square')) {
    div.classList.remove('black');
    div.classList.remove('white');
    div.classList.remove('last');
    div.classList.remove('flip');
    div.classList.remove('valid');
  }

  // Set the initial 4 stones.
  grid[3][3].classList.add('white');
  grid[3][4].classList.add('black');
  grid[4][3].classList.add('black');
  grid[4][4].classList.add('white');

  // Black always goes first.
  // https://www.worldothello.org/about/about-othello/othello-rules
  turn = 'black';
  passCount = 0;
  // Update the score.
  takeScore();
  // Indicate that it's the first player's turn.
  scoreElements[turn].container.classList.add('turn');
  // Mark the valid moves for the first player.
  markValidMoves();
}

function markValidMoves() {
  // If the game is over, don't do anything.
  if (gameOver) {
    return;
  }

  // If we're showing someone must pass, don't do anything.
  if (passTimerId != null) {
    return;
  }

  // If someone is out of pieces, the game is over.
  if (window.gameBoard.querySelector('.black') == null ||
      window.gameBoard.querySelector('.white') == null) {
    endGame();
    return;
  }

  // If both players had to pass, nobody can move and the game is over.
  if (passCount >= 2) {
    endGame();
    return;
  }

  // In a P2P game, don't show the valid move indicators when it's the other
  // player's turn.
  if (remoteGame && turn != myColor) {
    unmarkValidMoves();
    return;
  }

  // Find and mark all the valid moves in the game board.
  for (let y = 0; y < 8; ++y) {
    for (let x = 0; x < 8; ++x) {
      if (isValidPlay(x, y, turn)) {
        grid[y][x].classList.add('valid');
      }
    }
  }

  // If there are no valid moves, then the current player must pass.
  if (window.gameBoard.querySelector('.valid') == null) {
    if (remoteGame) {
      // In a P2P game, send a message over the data connection that you've
      // passed.
      broadcast({pass: true});
    }

    passCount++;
    onPass();
  } else {
    passCount = 0;
  }
}

// Signal when a user must pass.
function onPass() {
  console.log('pass', turn);

  // Indicate the pass in the UI.
  scoreElements[turn].container.classList.add('pass');

  // If there's already a timer for this, cancel it.
  if (passTimerId != null) {
    clearTimeout(passTimerId);
  }

  // Set a timer to remove the "pass" indicator and move to the next player's
  // turn.
  passTimerId = setTimeout(() => {
    // The timer is over, so wipe out the ID.
    passTimerId = null;

    // Stop the "pass" indication in the UI.
    scoreElements[turn].container.classList.remove('pass');

    // Move on to the next turn and mark the valid moves.
    nextTurn();
    markValidMoves();
  }, 1000);  // The timer lasts 1 second.
}

// Clear the "valid move" indicators on the board.
function unmarkValidMoves() {
  for (const div of window.gameBoard.querySelectorAll('.valid')) {
    div.classList.remove('valid');
  }
}

// Set state for the next player's turn.
function nextTurn() {
  unmarkValidMoves();
  scoreElements[turn].container.classList.remove('turn');
  turn = oppositeColor(turn);
  scoreElements[turn].container.classList.add('turn');
}

// A generator that yields board squares starting at x,y and moving in the
// direction dx,dy, excluding the starting position at x,y.
function *scanDirection(x, y, dx, dy) {
  x += dx;
  y += dy;

  for (; y >= 0 && y <= 7 && x >= 0 && x <= 7; y += dy, x += dx) {
    yield grid[y][x];
  }
}

// A generator which yields all 8 directions as dx,dy vectors.
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

// True if the square is empty.
function isEmpty(div) {
  return !div.classList.contains('black') && !div.classList.contains('white');
}

// True if the square belongs to that player.
function isColor(div, color) {
  return div.classList.contains(color);
}

// Returns the opposite of a player's color.
function oppositeColor(color) {
  return color == 'white' ? 'black' : 'white';
}

// Returns true if square x,y would be a valid play for player "color" in the
// direction dx,dy.
function isValidInDirection(x, y, dx, dy, color) {
  let first = true;

  for (const div of scanDirection(x, y, dx, dy)) {
    // If the first square in direction dx,dy is not the opposite player's,
    // then this is not a valid play based on that direction.
    if (first) {
      if (!isColor(div, oppositeColor(color))) {
        return false;
      }

      first = false;
    }

    // If the next square is empty, we failed to find another stone in our
    // color, so this is not a valid play based on that direction.
    if (isEmpty(div)) {
      return false;
    }

    // Once we find a stone of our own color after some number of the
    // opponent's stones, this is a valid play in this direction.
    if (isColor(div, color)) {
      return true;
    }
  }

  // If we reach the end of the board without finding our own color, this is
  // not a valid play based on that direction.
  return false;
}

// True if the square x,y would be a valid play for "color".
function isValidPlay(x, y, color) {
  // If it's not empty, it's not a valid play.
  if (!isEmpty(grid[y][x])) {
    return false;
  }

  // A valid play at x,y must be able to flip stones in some direction.
  for (const [dx, dy] of allDirections()) {
    if (isValidInDirection(x, y, dx, dy, color)) {
      return true;
    }
  }

  return false;
}

// Play a stone of the given color at the x,y coordinates.
function playStone(x, y, color) {
  // Ignore clicks on invalid squares.
  if (!isValidPlay(x, y, color)) {
    console.log('invalid play', x, y, color);
    return false;
  }

  // In a P2P game, for your own plays, send info about this play over the data
  // connection to your peers.
  if (remoteGame && color == myColor) {
    broadcast({x, y, color});
  }

  // Place the stone by adding the relevant color class.
  console.log('play', x, y, color);
  const playSquare = grid[y][x];
  playSquare.classList.add(color);

  // Remove the "last play" indicator if there's one out there.
  const last = window.gameBoard.querySelector('.last');
  if (last) {
    last.classList.remove('last');
  }
  // Add the "last play" indicator to this newly-played square.
  playSquare.classList.add('last');

  // Flip over the opponent's pieces in every valid direction.
  for (const [dx, dy] of allDirections()) {
    if (isValidInDirection(x, y, dx, dy, color)) {
      for (const div of scanDirection(x, y, dx, dy)) {
        // Stop on your own color.
        if (isColor(div, color)) {
          break;
        }

        // Use the "flip" class to start the animation, and change the color
        // class to the new color.
        div.classList.add('flip');
        div.classList.add(color);
        div.classList.remove(oppositeColor(color));
      }
    }
  }

  // Set this flag to indicate that we're animating the flip now.
  animatingFlip = true;
  return true;
}

// Called when a square is clicked.
function onClick(event) {
  // Ignore if the game is over.
  if (gameOver) {
    return;
  }

  // Ignore if it's a P2P game and not my turn.
  if (remoteGame && turn != myColor) {
    return;
  }

  // Ignore if we're still animating the last move.
  if (animatingFlip) {
    return;
  }

  // Find the coordinates of the clicked square.
  const div = event.currentTarget;
  const {x, y} = div.dataset;  // NOTE: strings, not ints

  // Try to play a stone here.
  const ok = playStone(parseInt(x), parseInt(y), turn);
  // If the play was valid, update the score and switch turns.
  if (ok) {
    takeScore();
    nextTurn();
  }
}

// Called when a data connection is established.
function onConnection(color) {
  myColor = color;
  remoteGame = true;

  if (color == OBSERVER_COLOR) {
    window.tableStatus.textContent = 'Connected (observer)';
  } else {
    window.tableStatus.textContent = 'Connected';

    // Finally show the reset button.
    window.resetButton.classList.remove('hide');
  }

  window.joinPeer.value = conn.peer;
  window.joinPeer.disabled = true;

  conn.on('data', onRemoteData);
  conn.on('close', () => {
    // When the connection is closed, remove turn indicator, win state, and tie
    // state, then mark the other player as having bailed.
    for (const color in scoreElements) {
      scoreElements[color].container.classList.remove('turn');
      scoreElements[color].container.classList.remove('win');
      scoreElements[color].container.classList.remove('tie');
    }
    scoreElements[oppositeColor(myColor)].container.classList.add('bailed');
    window.tableStatus.textContent = 'Disconnected';

    // Mark the game as over, and remove all "valid move" indicators.
    gameOver = true;
    unmarkValidMoves();

    window.joinPeer.disabled = false;
  });

  if (withVideo) {
    // When connected, hide the P2P IDs, which we don't need any more.
    window.idContainer.classList.remove('show');
  }
}

function onCall() {
  // When a call is established, put the remote stream up on the "friend" video
  // element.
  call.on('stream', (remoteStream) => {
    window.friend.srcObject = remoteStream;
  });
}

// Called when a data message comes from the remote peer in a P2P game.
function onRemoteData(data) {
  console.log('remote data', data);

  // Forward this incoming game event to all observers.
  for (const observer of observers) {
    if (observer.open) {
      observer.send(data);
    }
  }

  // The peer clicked the "reset" button.
  if (data.reset) {
    resetGame();
    return;
  }

  // The peer had to pass.
  if (data.pass) {
    onPass();
    return;
  }

  // The full game state when we initially join the game.
  if (data.state) {
    ingestFullGameState(data.state);
    return;
  }

  // Otherwise, it's a play.
  const ok = playStone(data.x, data.y, data.color);
  // If the play was valid, update the score and switch turns.
  if (ok) {
    nextTurn();
    takeScore();
  }
}

// Called when someone connects to the first player (second player or observer)
function sendFullGameState(someConnection) {
  const state = {
    grid: [],
    scores: {},
    turn,
    gameOver,
    passCount,
  };

  for (const row of grid) {
    const rowState = [];
    for (const square of row) {
      rowState.push(square.className);
    }
    state.grid.push(rowState);
  }

  for (const color in scoreElements) {
    const elements = scoreElements[color];
    const scoreState = {
      classes: elements.container.className,
      points: elements.scoreSpan.textContent,
    };
    state.scores[color] = scoreState;
  }

  console.log('SENDING FULL STATE', state);
  someConnection.send({state});
}

// Called when someone connects to the first player (second player or observer)
// VERY TRUSTING
// The other player should be a friend, who you are looking at on video chat.
// And you also have access to the "reset" button, so if they cheat you, reset.
function ingestFullGameState(state) {
  console.log('RECEIVING FULL STATE', state);

  for (let y = 0; y < 8; ++y) {
    for (let x = 0; x < 8; ++x) {
      grid[y][x].className = state.grid[y][x];
    }
  }

  for (const color in scoreElements) {
    const elements = scoreElements[color];
    elements.container.className = state.scores[color].classes;
    elements.scoreSpan.textContent = state.scores[color].points;
  }

  turn = state.turn;
  gameOver = state.gameOver;
  passCount = state.passCount;

  // The "valid" moves for the other person don't show for me, and vice-versa.
  // So after ingesting the game state, including the "valid" markers for the
  // other person, compute the valid moves for ourselves.
  markValidMoves();
}

// Called when the online/offline status changes.
function onOnlineStatusChanged() {
  // Hide or show the offline ribbon.
  if (navigator.onLine) {
    window.offlineRibbon.classList.remove('show');
  } else {
    window.offlineRibbon.classList.add('show');
  }

  // If we have the peerjs library loaded, and we have a camera, and we're
  // online, and we're not connected yet... show the P2P button.
  if (window.Peer && navigator.mediaDevices && navigator.onLine && !peer) {
    window.remoteButton.classList.add('show');
  } else {
    window.remoteButton.classList.remove('show');
  }
}

// PeerJS IDs are too long to tell someone without copy/paste.  The ID should
// be short and easy to get right.  No confusing characters like l/1/I, 0/O/o.
// How about all numbers?  With dashes in it?  It's similar to a phone number,
// and the lack of letters will make it clear that 0 is 0 and not o/O.
// It's gross how much effort this is in JavaScript.  Did I do this wrong?
function generateRandomId() {
  const randomBuffer = crypto.getRandomValues(new Uint8Array(4)).buffer;
  const rand32 = (new DataView(randomBuffer)).getUint32();
  // scale 2^32 down to 10^10 (9-digit number)
  let idNumber = Math.floor((rand32 / 0x100000000) * 1e10);
  // break it up into 3 groups of 3 digits
  const idParts = []
  for (let i = 0; i < 3; ++i) {
    const part = idNumber % 1000;
    idNumber = (idNumber - part) / 1000;

    let partString = part.toString();
    while (partString.length < 3) {
      partString = '0' + partString;
    }
    idParts.push(partString);
  }
  return idParts.join('-');
}
