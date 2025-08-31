const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Game = require('../models/Game');

const handleSocketConnection = (io) => {
  // Store connected users
  const connectedUsers = new Map();

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.userId = user._id;
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.user.username} (${socket.userId})`);

    // Update user's online status
    await User.findByIdAndUpdate(socket.userId, {
      isOnline: true,
      lastActive: new Date()
    });

    // Store user connection
    connectedUsers.set(socket.userId.toString(), {
      socketId: socket.id,
      user: socket.user
    });

    // Join user's personal room
    socket.join(`user_${socket.userId}`);

    // Emit user connected event
    socket.broadcast.emit('user-connected', {
      userId: socket.userId,
      username: socket.user.username,
      avatar: socket.user.avatar
    });

    // Handle joining a game room
    socket.on('join-game', async (gameId) => {
      try {
        const game = await Game.findById(gameId)
          .populate('creator', 'username avatar')
          .populate('opponent', 'username avatar');

        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        // Check if user is part of this game
        if (game.creator._id.toString() !== socket.userId.toString() && 
            game.opponent._id.toString() !== socket.userId.toString()) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        socket.join(`game_${gameId}`);
        socket.currentGameId = gameId;

        // Emit game joined event
        socket.emit('game-joined', {
          game,
          message: 'Successfully joined game'
        });

        // Notify other players in the game
        socket.to(`game_${gameId}`).emit('player-joined-game', {
          userId: socket.userId,
          username: socket.user.username,
          avatar: socket.user.avatar
        });

      } catch (error) {
        console.error('Join game error:', error);
        socket.emit('error', { message: 'Failed to join game' });
      }
    });

    // Handle leaving a game room
    socket.on('leave-game', (gameId) => {
      socket.leave(`game_${gameId}`);
      socket.currentGameId = null;

      socket.to(`game_${gameId}`).emit('player-left-game', {
        userId: socket.userId,
        username: socket.user.username
      });
    });

    // Handle game invitation
    socket.on('send-invitation', async (data) => {
      try {
        const { opponentId, gameId } = data;

        // Check if opponent is online
        const opponentConnection = connectedUsers.get(opponentId);
        
        if (opponentConnection) {
          // Send invitation to opponent
          io.to(opponentConnection.socketId).emit('game-invitation', {
            gameId,
            from: {
              userId: socket.userId,
              username: socket.user.username,
              avatar: socket.user.avatar
            }
          });
        }

        socket.emit('invitation-sent', {
          message: 'Invitation sent successfully'
        });

      } catch (error) {
        console.error('Send invitation error:', error);
        socket.emit('error', { message: 'Failed to send invitation' });
      }
    });

    // Handle responding to invitation
    socket.on('respond-to-invitation', async (data) => {
      try {
        const { gameId, accepted } = data;

        const game = await Game.findById(gameId);
        
        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        if (game.opponent.toString() !== socket.userId.toString()) {
          socket.emit('error', { message: 'Not authorized' });
          return;
        }

        if (accepted) {
          // Start the game
          game.status = 'active';
          game.invitationAccepted = true;
          game.startedAt = new Date();
          await game.save();

          // Notify both players
          const creatorConnection = connectedUsers.get(game.creator.toString());
          if (creatorConnection) {
            io.to(creatorConnection.socketId).emit('invitation-accepted', {
              gameId,
              opponent: {
                userId: socket.userId,
                username: socket.user.username,
                avatar: socket.user.avatar
              }
            });
          }

          // Join game room
          socket.join(`game_${gameId}`);
          socket.currentGameId = gameId;

          // Emit game started event
          io.to(`game_${gameId}`).emit('game-started', {
            game,
            message: 'Game has started!'
          });

        } else {
          // Decline invitation
          game.status = 'cancelled';
          await game.save();

          // Notify creator
          const creatorConnection = connectedUsers.get(game.creator.toString());
          if (creatorConnection) {
            io.to(creatorConnection.socketId).emit('invitation-declined', {
              gameId,
              opponent: {
                userId: socket.userId,
                username: socket.user.username
              }
            });
          }
        }

      } catch (error) {
        console.error('Respond to invitation error:', error);
        socket.emit('error', { message: 'Failed to respond to invitation' });
      }
    });

    // Handle calling a number
    socket.on('call-number', async (data) => {
      try {
        const { gameId, number } = data;

        const game = await Game.findById(gameId);

        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        if (game.status !== 'active') {
          socket.emit('error', { message: 'Game is not active' });
          return;
        }

        if (!game.isUserTurn(socket.userId)) {
          socket.emit('error', { message: 'It is not your turn' });
          return;
        }

        // Call the number
        const numberCalled = game.callNumber(number, socket.userId);
        
        if (!numberCalled) {
          socket.emit('error', { message: 'Number has already been called' });
          return;
        }

        await game.save();

        // Emit number called event to all players in the game
        io.to(`game_${gameId}`).emit('number-called', {
          number,
          calledBy: {
            userId: socket.userId,
            username: socket.user.username
          },
          calledNumbers: game.gameData.calledNumbers,
          currentTurn: game.gameData.currentTurn
        });

      } catch (error) {
        console.error('Call number error:', error);
        socket.emit('error', { message: 'Failed to call number' });
      }
    });

    // Handle game chat
    socket.on('game-message', (data) => {
      const { gameId, message } = data;

      if (socket.currentGameId === gameId) {
        io.to(`game_${gameId}`).emit('game-message', {
          userId: socket.userId,
          username: socket.user.username,
          message,
          timestamp: new Date()
        });
      }
    });

    // Handle typing indicator
    socket.on('typing', (data) => {
      const { gameId, isTyping } = data;

      if (socket.currentGameId === gameId) {
        socket.to(`game_${gameId}`).emit('typing', {
          userId: socket.userId,
          username: socket.user.username,
          isTyping
        });
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.user.username} (${socket.userId})`);

      // Remove from connected users
      connectedUsers.delete(socket.userId.toString());

      // Update user's online status
      await User.findByIdAndUpdate(socket.userId, {
        isOnline: false,
        lastActive: new Date()
      });

      // Notify other users
      socket.broadcast.emit('user-disconnected', {
        userId: socket.userId,
        username: socket.user.username
      });

      // Leave game room if in one
      if (socket.currentGameId) {
        socket.to(`game_${socket.currentGameId}`).emit('player-left-game', {
          userId: socket.userId,
          username: socket.user.username
        });
      }
    });
  });

  // Return connected users for other parts of the application
  return {
    getConnectedUsers: () => connectedUsers,
    emitToUser: (userId, event, data) => {
      const userConnection = connectedUsers.get(userId.toString());
      if (userConnection) {
        io.to(userConnection.socketId).emit(event, data);
      }
    },
    emitToGame: (gameId, event, data) => {
      io.to(`game_${gameId}`).emit(event, data);
    }
  };
};

module.exports = { handleSocketConnection };
