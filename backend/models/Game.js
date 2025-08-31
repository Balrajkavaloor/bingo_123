const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  roomName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  players: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    username: String,
    isReady: {
      type: Boolean,
      default: false
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    isHost: {
      type: Boolean,
      default: false
    }
  }],
  maxPlayers: {
    type: Number,
    default: 4,
    min: 2,
    max: 8
  },
  status: {
    type: String,
    enum: ['waiting', 'starting', 'active', 'completed', 'cancelled'],
    default: 'waiting'
  },
  gameType: {
    type: String,
    enum: ['public', 'private'],
    default: 'public'
  },
  password: {
    type: String,
    default: null
  },
  bingoBoard: {
    type: [[Number]],
    default: null
  },
  calledNumbers: [{
    number: Number,
    calledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    calledAt: {
      type: Date,
      default: Date.now
    }
  }],
  winner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  gameSettings: {
    winPattern: {
      type: String,
      enum: ['line', 'full', 'corners', 'diagonal'],
      default: 'line'
    },
    autoStart: {
      type: Boolean,
      default: false
    },
    countdownDuration: {
      type: Number,
      default: 10
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  startedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Generate unique room code
gameSchema.methods.generateRoomCode = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Add player to room
gameSchema.methods.addPlayer = function(userId, username) {
  if (this.players.length >= this.maxPlayers) {
    throw new Error('Room is full');
  }
  
  if (this.players.some(p => p.user.toString() === userId.toString())) {
    throw new Error('Player already in room');
  }
  
  this.players.push({
    user: userId,
    username: username,
    isReady: false,
    isHost: this.players.length === 0
  });
  
  return this.save();
};

// Remove player from room
gameSchema.methods.removePlayer = function(userId) {
  this.players = this.players.filter(p => p.user.toString() !== userId.toString());
  
  // If no players left, mark as cancelled
  if (this.players.length === 0) {
    this.status = 'cancelled';
  }
  
  // If host left, assign new host
  if (this.players.length > 0 && !this.players.some(p => p.isHost)) {
    this.players[0].isHost = true;
  }
  
  return this.save();
};

// Set player ready status
gameSchema.methods.setPlayerReady = function(userId, isReady) {
  const player = this.players.find(p => p.user.toString() === userId.toString());
  if (player) {
    player.isReady = isReady;
  }
  return this.save();
};

// Check if all players are ready
gameSchema.methods.allPlayersReady = function() {
  return this.players.length >= 2 && this.players.every(p => p.isReady);
};

// Start game
gameSchema.methods.startGame = function() {
  if (!this.allPlayersReady()) {
    throw new Error('Not all players are ready');
  }
  
  this.status = 'starting';
  this.startedAt = new Date();
  
  // Generate bingo boards for all players
  this.generateBingoBoards();
  
  return this.save();
};

// Generate bingo boards
gameSchema.methods.generateBingoBoards = function() {
  // Create a 5x5 board with numbers 1-25
  const numbers = [];
  for (let i = 1; i <= 25; i++) {
    numbers.push(i);
  }
  
  // Shuffle the numbers
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }
  
  // Create 5x5 board
  this.bingoBoard = [];
  for (let i = 0; i < 5; i++) {
    const row = [];
    for (let j = 0; j < 5; j++) {
      row.push(numbers[i * 5 + j]);
    }
    this.bingoBoard.push(row);
  }
};

// Pre-save middleware
gameSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Generate room code if not exists
  if (!this.roomCode) {
    this.roomCode = this.generateRoomCode();
  }
  
  next();
});

// Indexes
gameSchema.index({ roomCode: 1 });
gameSchema.index({ status: 1 });
gameSchema.index({ creator: 1 });
gameSchema.index({ 'players.user': 1 });
gameSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Game', gameSchema);
