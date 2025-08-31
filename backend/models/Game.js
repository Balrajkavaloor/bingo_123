const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  opponent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'cancelled'],
    default: 'pending'
  },
  winner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  gameType: {
    type: String,
    enum: ['solo', 'multiplayer'],
    default: 'multiplayer'
  },
  gameData: {
    creatorBoard: {
      type: [[mongoose.Schema.Types.Mixed]], // Can contain numbers or 'FREE'
      default: []
    },
    opponentBoard: {
      type: [[mongoose.Schema.Types.Mixed]], // Can contain numbers or 'FREE'
      default: []
    },
    calledNumbers: {
      type: [Number],
      default: []
    },
    currentTurn: {
      type: String,
      enum: ['creator', 'opponent'],
      default: 'creator'
    },
    creatorCompletedLines: {
      type: Number,
      default: 0
    },
    opponentCompletedLines: {
      type: Number,
      default: 0
    },
    lastCalledNumber: {
      type: Number
    },
    lastCalledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  // Game statistics
  creatorScore: {
    type: Number,
    default: 0
  },
  opponentScore: {
    type: Number,
    default: 0
  },
  // Game timing
  startedAt: Date,
  completedAt: Date,
  duration: Number, // in minutes
  // Game settings
  requiredLines: {
    type: Number,
    default: 5
  },
  maxNumbers: {
    type: Number,
    default: 25
  },
  // Invitation details
  invitationAccepted: {
    type: Boolean,
    default: false
  },
  invitationExpiresAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    }
  }
}, {
  timestamps: true
});

// Indexes for better performance
gameSchema.index({ creator: 1, opponent: 1, status: 1 });
gameSchema.index({ status: 1 });
gameSchema.index({ createdAt: -1 });
gameSchema.index({ 'gameData.currentTurn': 1 });

// Compound index to ensure only one active game per user pair
gameSchema.index(
  { creator: 1, opponent: 1, status: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { status: { $in: ['pending', 'active'] } }
  }
);

// Method to check if game is expired
gameSchema.methods.isExpired = function() {
  return this.status === 'pending' && this.invitationExpiresAt < new Date();
};

// Method to check if user can join game
gameSchema.methods.canJoin = function(userId) {
  return (
    this.status === 'pending' &&
    !this.isExpired() &&
    (this.creator.toString() === userId.toString() || 
     this.opponent.toString() === userId.toString())
  );
};

// Method to check if it's user's turn
gameSchema.methods.isUserTurn = function(userId) {
  if (this.status !== 'active') return false;
  
  const isCreator = this.creator.toString() === userId.toString();
  const isOpponent = this.opponent.toString() === userId.toString();
  
  if (isCreator && this.gameData.currentTurn === 'creator') return true;
  if (isOpponent && this.gameData.currentTurn === 'opponent') return true;
  
  return false;
};

// Method to get opponent
gameSchema.methods.getOpponent = function(userId) {
  if (this.creator.toString() === userId.toString()) {
    return this.opponent;
  }
  return this.creator;
};

// Method to call a number
gameSchema.methods.callNumber = function(number, calledBy) {
  if (!this.gameData.calledNumbers.includes(number)) {
    this.gameData.calledNumbers.push(number);
    this.gameData.lastCalledNumber = number;
    this.gameData.lastCalledBy = calledBy;
    
    // Switch turns
    this.gameData.currentTurn = this.gameData.currentTurn === 'creator' ? 'opponent' : 'creator';
    
    return true;
  }
  return false;
};

// Method to check win condition
gameSchema.methods.checkWinCondition = function(board, calledNumbers) {
  let completedLines = 0;
  
  // Check rows
  for (let i = 0; i < 5; i++) {
    if (board[i].every(num => num === 'FREE' || calledNumbers.includes(num))) {
      completedLines++;
    }
  }
  
  // Check columns
  for (let j = 0; j < 5; j++) {
    if (board.every(row => row[j] === 'FREE' || calledNumbers.includes(row[j]))) {
      completedLines++;
    }
  }
  
  // Check diagonals
  if ((board[0][0] === 'FREE' || calledNumbers.includes(board[0][0])) &&
      (board[1][1] === 'FREE' || calledNumbers.includes(board[1][1])) &&
      (board[2][2] === 'FREE' || calledNumbers.includes(board[2][2])) &&
      (board[3][3] === 'FREE' || calledNumbers.includes(board[3][3])) &&
      (board[4][4] === 'FREE' || calledNumbers.includes(board[4][4]))) {
    completedLines++;
  }
  
  if ((board[0][4] === 'FREE' || calledNumbers.includes(board[0][4])) &&
      (board[1][3] === 'FREE' || calledNumbers.includes(board[1][3])) &&
      (board[2][2] === 'FREE' || calledNumbers.includes(board[2][2])) &&
      (board[3][1] === 'FREE' || calledNumbers.includes(board[3][1])) &&
      (board[4][0] === 'FREE' || calledNumbers.includes(board[4][0]))) {
    completedLines++;
  }
  
  return completedLines >= this.requiredLines;
};

// Method to end game
gameSchema.methods.endGame = function(winnerId) {
  this.status = 'completed';
  this.winner = winnerId;
  this.completedAt = new Date();
  
  if (this.startedAt) {
    this.duration = Math.round((this.completedAt - this.startedAt) / (1000 * 60));
  }
};

// Pre-save middleware to handle game expiration
gameSchema.pre('save', function(next) {
  if (this.isExpired() && this.status === 'pending') {
    this.status = 'cancelled';
  }
  next();
});

module.exports = mongoose.model('Game', gameSchema);
