const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Game = require('../models/Game');

const setupSocketIO = (io) => {
  // Middleware to authenticate socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('_id username email role');
      
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = user;
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User ${socket.user.username} connected: ${socket.id}`);

    // Join user's active rooms
    socket.on('joinRooms', async () => {
      try {
        const activeGames = await Game.find({
          'players.user': socket.user._id,
          status: { $in: ['waiting', 'starting', 'active'] }
        });

        activeGames.forEach(game => {
          socket.join(game.roomCode);
          console.log(`User ${socket.user.username} joined room ${game.roomCode}`);
        });
      } catch (error) {
        console.error('Error joining rooms:', error);
      }
    });

    // Join a specific room
    socket.on('joinRoom', async (roomCode) => {
      try {
        const game = await Game.findOne({ roomCode: roomCode.toUpperCase() });
        
        if (!game) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        // Check if user is in the room
        if (!game.players.some(p => p.user.toString() === socket.user._id.toString())) {
          socket.emit('error', { message: 'You are not in this room' });
          return;
        }

        socket.join(roomCode);
        console.log(`User ${socket.user.username} joined room ${roomCode}`);

        // Notify other players in the room
        socket.to(roomCode).emit('playerJoinedRoom', {
          userId: socket.user._id,
          username: socket.user.username,
          timestamp: new Date()
        });

        // Send room info to the joining user
        socket.emit('roomJoined', {
          roomCode,
          message: `Joined room ${roomCode}`
        });

      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Leave a room
    socket.on('leaveRoom', async (roomCode) => {
      try {
        socket.leave(roomCode);
        console.log(`User ${socket.user.username} left room ${roomCode}`);

        // Notify other players in the room
        socket.to(roomCode).emit('playerLeftRoom', {
          userId: socket.user._id,
          username: socket.user.username,
          timestamp: new Date()
        });

      } catch (error) {
        console.error('Error leaving room:', error);
      }
    });

    // Handle player ready status
    socket.on('setReady', async (data) => {
      try {
        const { roomCode, isReady } = data;
        
        const game = await Game.findOne({ roomCode: roomCode.toUpperCase() });
        
        if (!game) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        if (!game.players.some(p => p.user.toString() === socket.user._id.toString())) {
          socket.emit('error', { message: 'You are not in this room' });
          return;
        }

        // Update player ready status
        await game.setPlayerReady(socket.user._id, isReady);

        // Emit to all players in the room
        io.to(roomCode).emit('playerReadyStatusChanged', {
          userId: socket.user._id,
          username: socket.user.username,
          isReady,
          allPlayersReady: game.allPlayersReady(),
          playerCount: game.players.length
        });

        console.log(`Player ${socket.user.username} ${isReady ? 'ready' : 'not ready'} in room ${roomCode}`);

      } catch (error) {
        console.error('Error setting ready status:', error);
        socket.emit('error', { message: 'Failed to set ready status' });
      }
    });

    // Handle game start request (host only)
    socket.on('startGame', async (roomCode) => {
      try {
        const game = await Game.findOne({ roomCode: roomCode.toUpperCase() });
        
        if (!game) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        const player = game.players.find(p => p.user.toString() === socket.user._id.toString());
        if (!player || !player.isHost) {
          socket.emit('error', { message: 'Only the host can start the game' });
          return;
        }

        if (!game.allPlayersReady()) {
          socket.emit('error', { message: 'Not all players are ready' });
          return;
        }

        // Start the game
        await game.startGame();

        // Emit game started to all players in the room
        io.to(roomCode).emit('gameStarted', {
          roomCode,
          game: game.toObject(),
          bingoBoard: game.bingoBoard,
          startedAt: game.startedAt
        });

        console.log(`Game started in room ${roomCode} by ${socket.user.username}`);

      } catch (error) {
        console.error('Error starting game:', error);
        socket.emit('error', { message: 'Failed to start game' });
      }
    });

    // Handle number calling
    socket.on('callNumber', async (data) => {
      try {
        const { roomCode, number } = data;
        
        if (!number || number < 1 || number > 75) {
          socket.emit('error', { message: 'Invalid number (must be 1-75)' });
          return;
        }

        const game = await Game.findOne({ roomCode: roomCode.toUpperCase() });
        
        if (!game) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        if (game.status !== 'active') {
          socket.emit('error', { message: 'Game is not active' });
          return;
        }

        if (!game.players.some(p => p.user.toString() === socket.user._id.toString())) {
          socket.emit('error', { message: 'You are not in this game' });
          return;
        }

        // Check if number already called
        if (game.calledNumbers.some(cn => cn.number === number)) {
          socket.emit('error', { message: 'Number already called' });
          return;
        }

        // Add called number
        game.calledNumbers.push({
          number,
          calledBy: socket.user._id,
          calledAt: new Date()
        });

        await game.save();

        // Emit to all players in the room
        io.to(roomCode).emit('numberCalled', {
          roomCode,
          number,
          calledBy: socket.user._id,
          calledByUsername: socket.user.username,
          calledAt: new Date(),
          totalCalled: game.calledNumbers.length
        });

        console.log(`Number ${number} called by ${socket.user.username} in room ${roomCode}`);

      } catch (error) {
        console.error('Error calling number:', error);
        socket.emit('error', { message: 'Failed to call number' });
      }
    });

    // Handle win check
    socket.on('checkWin', async (data) => {
      try {
        const { roomCode, board } = data;
        
        if (!board || !Array.isArray(board)) {
          socket.emit('error', { message: 'Invalid board data' });
          return;
        }

        const game = await Game.findOne({ roomCode: roomCode.toUpperCase() });
        
        if (!game) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        if (game.status !== 'active') {
          socket.emit('error', { message: 'Game is not active' });
          return;
        }

        if (!game.players.some(p => p.user.toString() === socket.user._id.toString())) {
          socket.emit('error', { message: 'You are not in this game' });
          return;
        }

        // Check win condition
        const isWinner = checkWinCondition(board, game.calledNumbers.map(cn => cn.number), game.gameSettings.winPattern);

        if (isWinner) {
          // End the game
          game.status = 'completed';
          game.winner = socket.user._id;
          game.completedAt = new Date();
          await game.save();

          // Update user stats
          const winner = await User.findById(socket.user._id);
          if (winner) {
            await winner.updateGameStats(true, 5);
            await winner.save();
          }

          // Emit game completed to all players
          io.to(roomCode).emit('gameCompleted', {
            roomCode,
            winner: socket.user._id,
            winnerUsername: socket.user.username,
            game: game.toObject(),
            completedAt: game.completedAt
          });

          console.log(`Game completed in room ${roomCode}. Winner: ${socket.user.username}`);
        } else {
          // Notify that no win yet
          socket.emit('winCheckResult', {
            isWinner: false,
            message: 'No win yet, keep playing!'
          });
        }

      } catch (error) {
        console.error('Error checking win:', error);
        socket.emit('error', { message: 'Failed to check win condition' });
      }
    });

    // Handle chat messages
    socket.on('sendMessage', async (data) => {
      try {
        const { roomCode, message } = data;
        
        if (!message || message.trim().length === 0) {
          return;
        }

        const game = await Game.findOne({ roomCode: roomCode.toUpperCase() });
        
        if (!game) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        if (!game.players.some(p => p.user.toString() === socket.user._id.toString())) {
          socket.emit('error', { message: 'You are not in this room' });
          return;
        }

        // Emit message to all players in the room
        io.to(roomCode).emit('newMessage', {
          roomCode,
          userId: socket.user._id,
          username: socket.user.username,
          message: message.trim(),
          timestamp: new Date()
        });

      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle room settings update (host only)
    socket.on('updateRoomSettings', async (data) => {
      try {
        const { roomCode, settings } = data;
        
        const game = await Game.findOne({ roomCode: roomCode.toUpperCase() });
        
        if (!game) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        const player = game.players.find(p => p.user.toString() === socket.user._id.toString());
        if (!player || !player.isHost) {
          socket.emit('error', { message: 'Only the host can update room settings' });
          return;
        }

        // Update game settings
        if (settings.maxPlayers && settings.maxPlayers >= game.players.length && settings.maxPlayers <= 8) {
          game.maxPlayers = settings.maxPlayers;
        }

        if (settings.gameSettings) {
          game.gameSettings = { ...game.gameSettings, ...settings.gameSettings };
        }

        await game.save();

        // Emit settings updated to all players
        io.to(roomCode).emit('roomSettingsUpdated', {
          roomCode,
          settings: game.gameSettings,
          maxPlayers: game.maxPlayers,
          updatedBy: socket.user.username
        });

        console.log(`Room settings updated in ${roomCode} by ${socket.user.username}`);

      } catch (error) {
        console.error('Error updating room settings:', error);
        socket.emit('error', { message: 'Failed to update room settings' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`User ${socket.user.username} disconnected: ${socket.id}`);
      
      // Leave all rooms
      socket.rooms.forEach(room => {
        if (room !== socket.id) {
          socket.to(room).emit('playerDisconnected', {
            userId: socket.user._id,
            username: socket.user.username,
            timestamp: new Date()
          });
        }
      });
    });
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

  return io;
};

module.exports = setupSocketIO;
