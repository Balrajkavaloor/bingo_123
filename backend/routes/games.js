const express = require('express');
const router = express.Router();
const Game = require('../models/Game');
const User = require('../models/User');
const Score = require('../models/Score');
const { authenticateToken: auth } = require('../middleware/auth');

// Get all public rooms
router.get('/rooms', async (req, res) => {
  try {
    const rooms = await Game.find({ 
      status: 'waiting', 
      gameType: 'public' 
    })
    .populate('creator', 'username')
    .populate('players.user', 'username')
    .select('roomCode roomName creator players maxPlayers status createdAt')
    .sort({ createdAt: -1 })
    .limit(20);

    res.json({
      success: true,
      rooms: rooms.map(room => ({
        ...room.toObject(),
        playerCount: room.players.length,
        isFull: room.players.length >= room.maxPlayers
      }))
    });
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rooms'
    });
  }
});

// Create a new room
router.post('/rooms', auth, async (req, res) => {
  try {
    const { roomName, maxPlayers = 4, gameType = 'public', password = null, gameSettings = {} } = req.body;

    if (!roomName || roomName.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Room name must be at least 3 characters long'
      });
    }

    if (maxPlayers < 2 || maxPlayers > 8) {
      return res.status(400).json({
        success: false,
        error: 'Max players must be between 2 and 8'
      });
    }

    const game = new Game({
      roomName: roomName.trim(),
      creator: req.user._id,
      maxPlayers,
      gameType,
      password: password || null,
      gameSettings: {
        winPattern: gameSettings.winPattern || 'line',
        autoStart: gameSettings.autoStart || false,
        countdownDuration: gameSettings.countdownDuration || 10,
        ...gameSettings
      }
    });

    // Add creator as first player
    await game.addPlayer(req.user._id, req.user.username);

    await game.save();

    // Emit room created event
    if (req.io) {
      req.io.emit('roomCreated', {
        room: {
          ...game.toObject(),
          playerCount: game.players.length,
          isFull: game.players.length >= game.maxPlayers
        }
      });
    }

    res.status(201).json({
      success: true,
      room: {
        ...game.toObject(),
        playerCount: game.players.length,
        isFull: game.players.length >= game.maxPlayers
      }
    });

  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create room'
    });
  }
});

// Join a room
router.post('/rooms/:roomCode/join', auth, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { password } = req.body;

    const game = await Game.findOne({ roomCode: roomCode.toUpperCase() })
      .populate('creator', 'username')
      .populate('players.user', 'username');

    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }

    if (game.status !== 'waiting') {
      return res.status(400).json({
        success: false,
        error: 'Room is not accepting players'
      });
    }

    if (game.players.length >= game.maxPlayers) {
      return res.status(400).json({
        success: false,
        error: 'Room is full'
      });
    }

    if (game.gameType === 'private' && game.password && game.password !== password) {
      return res.status(401).json({
        success: false,
        error: 'Incorrect password'
      });
    }

    if (game.players.some(p => p.user.toString() === req.user._id.toString())) {
      return res.status(400).json({
        success: false,
        error: 'You are already in this room'
      });
    }

    // Add player to room
    await game.addPlayer(req.user._id, req.user.username);

    // Emit player joined event
    if (req.io) {
      req.io.to(roomCode).emit('playerJoined', {
        roomCode,
        player: {
          user: req.user._id,
          username: req.user.username,
          isReady: false,
          isHost: false
        },
        playerCount: game.players.length,
        isFull: game.players.length >= game.maxPlayers
      });
    }

    res.json({
      success: true,
      room: {
        ...game.toObject(),
        playerCount: game.players.length,
        isFull: game.players.length >= game.maxPlayers
      }
    });

  } catch (error) {
    console.error('Join room error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to join room'
    });
  }
});

// Leave a room
router.post('/rooms/:roomCode/leave', auth, async (req, res) => {
  try {
    const { roomCode } = req.params;

    const game = await Game.findOne({ roomCode: roomCode.toUpperCase() });

    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }

    if (!game.players.some(p => p.user.toString() === req.user._id.toString())) {
      return res.status(400).json({
        success: false,
        error: 'You are not in this room'
      });
    }

    // Remove player from room
    await game.removePlayer(req.user._id);

    // Emit player left event
    if (req.io) {
      req.io.to(roomCode).emit('playerLeft', {
        roomCode,
        userId: req.user._id,
        username: req.user.username,
        playerCount: game.players.length,
        isFull: game.players.length >= game.maxPlayers
      });
    }

    res.json({
      success: true,
      message: 'Left room successfully'
    });

  } catch (error) {
    console.error('Leave room error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to leave room'
    });
  }
});

// Set player ready status
router.post('/rooms/:roomCode/ready', auth, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { isReady } = req.body;

    const game = await Game.findOne({ roomCode: roomCode.toUpperCase() });

    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }

    if (!game.players.some(p => p.user.toString() === req.user._id.toString())) {
      return res.status(400).json({
        success: false,
        error: 'You are not in this room'
      });
    }

    // Set player ready status
    await game.setPlayerReady(req.user._id, isReady);

    // Emit player ready status changed
    if (req.io) {
      req.io.to(roomCode).emit('playerReadyStatusChanged', {
        roomCode,
        userId: req.user._id,
        isReady,
        allPlayersReady: game.allPlayersReady()
      });
    }

    res.json({
      success: true,
      isReady,
      allPlayersReady: game.allPlayersReady()
    });

  } catch (error) {
    console.error('Set ready status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set ready status'
    });
  }
});

// Start game (host only)
router.post('/rooms/:roomCode/start', auth, async (req, res) => {
  try {
    const { roomCode } = req.params;

    const game = await Game.findOne({ roomCode: roomCode.toUpperCase() });

    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }

    const player = game.players.find(p => p.user.toString() === req.user._id.toString());
    if (!player || !player.isHost) {
      return res.status(403).json({
        success: false,
        error: 'Only the host can start the game'
      });
    }

    if (!game.allPlayersReady()) {
      return res.status(400).json({
        success: false,
        error: 'Not all players are ready'
      });
    }

    // Start the game
    await game.startGame();

    // Emit game started event
    if (req.io) {
      req.io.to(roomCode).emit('gameStarted', {
        roomCode,
        game: game.toObject()
      });
    }

    res.json({
      success: true,
      game: game.toObject()
    });

  } catch (error) {
    console.error('Start game error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start game'
    });
  }
});

// Get room details
router.get('/rooms/:roomCode', async (req, res) => {
  try {
    const { roomCode } = req.params;

    const game = await Game.findOne({ roomCode: roomCode.toUpperCase() })
      .populate('creator', 'username')
      .populate('players.user', 'username');

    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }

    res.json({
      success: true,
      room: {
        ...game.toObject(),
        playerCount: game.players.length,
        isFull: game.players.length >= game.maxPlayers
      }
    });

  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch room'
    });
  }
});

// Get user's active games
router.get('/my-games', auth, async (req, res) => {
  try {
    const games = await Game.find({
      'players.user': req.user._id,
      status: { $in: ['waiting', 'starting', 'active'] }
    })
    .populate('creator', 'username')
    .populate('players.user', 'username')
    .sort({ updatedAt: -1 });

    res.json({
      success: true,
      games: games.map(game => ({
        ...game.toObject(),
        playerCount: game.players.length,
        isFull: game.players.length >= game.maxPlayers
      }))
    });

  } catch (error) {
    console.error('Get my games error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch games'
    });
  }
});

// Get all games (for admin)
router.get('/', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const games = await Game.find()
      .populate('creator', 'username')
      .populate('players.user', 'username')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      games: games.map(game => ({
        ...game.toObject(),
        playerCount: game.players.length,
        isFull: game.players.length >= game.maxPlayers
      }))
    });

  } catch (error) {
    console.error('Get all games error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch games'
    });
  }
});

// Call a number (during active game)
router.post('/rooms/:roomCode/call-number', auth, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { number } = req.body;

    if (!number || number < 1 || number > 75) {
      return res.status(400).json({
        success: false,
        error: 'Invalid number (must be 1-75)'
      });
    }

    const game = await Game.findOne({ roomCode: roomCode.toUpperCase() });

    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }

    if (game.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Game is not active'
      });
    }

    if (!game.players.some(p => p.user.toString() === req.user._id.toString())) {
      return res.status(400).json({
        success: false,
        error: 'You are not in this game'
      });
    }

    // Check if number already called
    if (game.calledNumbers.some(cn => cn.number === number)) {
      return res.status(400).json({
        success: false,
        error: 'Number already called'
      });
    }

    // Add called number
    game.calledNumbers.push({
      number,
      calledBy: req.user._id,
      calledAt: new Date()
    });

    await game.save();

    // Emit number called event
    if (req.io) {
      req.io.to(roomCode).emit('numberCalled', {
        roomCode,
        number,
        calledBy: req.user._id,
        calledAt: new Date()
      });
    }

    res.json({
      success: true,
      calledNumber: {
        number,
        calledBy: req.user._id,
        calledAt: new Date()
      }
    });

  } catch (error) {
    console.error('Call number error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to call number'
    });
  }
});

// Check for winner
router.post('/rooms/:roomCode/check-win', auth, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { board } = req.body;

    if (!board || !Array.isArray(board)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid board data'
      });
    }

    const game = await Game.findOne({ roomCode: roomCode.toUpperCase() });

    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }

    if (game.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Game is not active'
      });
    }

    if (!game.players.some(p => p.user.toString() === req.user._id.toString())) {
      return res.status(400).json({
        success: false,
        error: 'You are not in this game'
      });
    }

    // Check win condition based on game settings
    const isWinner = checkWinCondition(board, game.calledNumbers.map(cn => cn.number), game.gameSettings.winPattern);

    if (isWinner) {
      // End the game
      game.status = 'completed';
      game.winner = req.user._id;
      game.completedAt = new Date();
      await game.save();

      // Update user stats
      const winner = await User.findById(req.user._id);
      const opponent = game.players.find(p => p.user.toString() !== req.user._id.toString());
      
      if (winner && opponent) {
        await winner.updateGameStats(true, 5); // Assuming 5 lines completed for win
        
        // Create score records
        const winnerScore = new Score({
          user: winner._id,
          game: game._id,
          score: 100,
          linesCompleted: 5,
          isWinner: true
        });
        
        const opponentScore = new Score({
          user: opponent.user,
          game: game._id,
          score: 50,
          linesCompleted: 3,
          isWinner: false
        });
        
        await winnerScore.save();
        await opponentScore.save();

        // Emit game completed event
        if (req.io) {
          req.io.to(roomCode).emit('gameCompleted', {
            roomCode,
            winner: req.user._id,
            winnerUsername: req.user.username,
            game: game.toObject()
          });
        }
      }

      res.json({
        success: true,
        isWinner: true,
        game: game.toObject()
      });
    } else {
      res.json({
        success: true,
        isWinner: false
      });
    }

  } catch (error) {
    console.error('Check win error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check win condition'
    });
  }
});

// Update room settings (host only)
router.put('/rooms/:roomCode/settings', auth, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { maxPlayers, gameSettings } = req.body;

    const game = await Game.findOne({ roomCode: roomCode.toUpperCase() });

    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }

    const player = game.players.find(p => p.user.toString() === req.user._id.toString());
    if (!player || !player.isHost) {
      return res.status(403).json({
        success: false,
        error: 'Only the host can update room settings'
      });
    }

    // Update game settings
    if (maxPlayers && maxPlayers >= game.players.length && maxPlayers <= 8) {
      game.maxPlayers = maxPlayers;
    }

    if (gameSettings) {
      game.gameSettings = { ...game.gameSettings, ...gameSettings };
    }

    await game.save();

    // Emit settings updated to all players
    if (req.io) {
      req.io.to(roomCode).emit('roomSettingsUpdated', {
        roomCode,
        settings: game.gameSettings,
        maxPlayers: game.maxPlayers,
        updatedBy: req.user.username
      });
    }

    res.json({
      success: true,
      room: {
        ...game.toObject(),
        playerCount: game.players.length,
        isFull: game.players.length >= game.maxPlayers
      }
    });

  } catch (error) {
    console.error('Update room settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update room settings'
    });
  }
});

// Helper function to check win condition
function checkWinCondition(board, calledNumbers, winPattern) {
  switch (winPattern) {
    case 'line':
      return checkLineWin(board, calledNumbers);
    case 'full':
      return checkFullWin(board, calledNumbers);
    case 'corners':
      return checkCornersWin(board, calledNumbers);
    case 'diagonal':
      return checkDiagonalWin(board, calledNumbers);
    default:
      return checkLineWin(board, calledNumbers);
  }
}

function checkLineWin(board, calledNumbers) {
  // Check rows
  for (let i = 0; i < 5; i++) {
    if (board[i].every(num => calledNumbers.includes(num))) {
      return true;
    }
  }
  
  // Check columns
  for (let j = 0; j < 5; j++) {
    if (board.every(row => calledNumbers.includes(row[j]))) {
      return true;
    }
  }
  
  return false;
}

function checkFullWin(board, calledNumbers) {
  return board.every(row => 
    row.every(num => calledNumbers.includes(num))
  );
}

function checkCornersWin(board, calledNumbers) {
  const corners = [
    board[0][0], board[0][4], 
    board[4][0], board[4][4]
  ];
  return corners.every(num => calledNumbers.includes(num));
}

function checkDiagonalWin(board, calledNumbers) {
  // Main diagonal
  const mainDiagonal = [board[0][0], board[1][1], board[2][2], board[3][3], board[4][4]];
  if (mainDiagonal.every(num => calledNumbers.includes(num))) {
    return true;
  }
  
  // Anti-diagonal
  const antiDiagonal = [board[0][4], board[1][3], board[2][2], board[3][1], board[4][0]];
  return antiDiagonal.every(num => calledNumbers.includes(num));
}

module.exports = router;
