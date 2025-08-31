const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username cannot exceed 20 characters'],
    maxlength: [20, 'Username cannot exceed 20 characters']
  },
  avatar: {
    type: String,
    default: ''
  },
  // Role-based access control
  role: {
    type: String,
    enum: ['user', 'moderator', 'admin'],
    default: 'user'
  },
  // Account status
  isActive: {
    type: Boolean,
    default: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  // Password reset
  passwordResetToken: String,
  passwordResetExpires: Date,
  // Refresh tokens
  refreshTokens: [{
    token: String,
    expiresAt: Date,
    deviceInfo: String
  }],
  // Game statistics
  gamesPlayed: {
    type: Number,
    default: 0
  },
  gamesWon: {
    type: Number,
    default: 0
  },
  gamesLost: {
    type: Number,
    default: 0
  },
  totalLinesCompleted: {
    type: Number,
    default: 0
  },
  averageLinesPerGame: {
    type: Number,
    default: 0
  },
  // Weekly and monthly stats
  weeklyWins: {
    type: Number,
    default: 0
  },
  monthlyWins: {
    type: Number,
    default: 0
  },
  // Achievement tracking
  achievementLevel: {
    type: String,
    enum: ['Bingo Rookie', 'Bingo Player', 'Bingo Pro', 'Bingo Expert', 'Bingo Master'],
    default: 'Bingo Rookie'
  },
  // Activity tracking
  lastActive: {
    type: Date,
    default: Date.now
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  // Game preferences
  preferredGameMode: {
    type: String,
    enum: ['solo', 'multiplayer'],
    default: 'multiplayer'
  }
}, {
  timestamps: true
});

// Indexes for better performance
userSchema.index({ isOnline: 1 });
userSchema.index({ lastActive: -1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to add refresh token
userSchema.methods.addRefreshToken = function(token, deviceInfo = 'Unknown') {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now
  
  this.refreshTokens.push({
    token,
    expiresAt,
    deviceInfo
  });
  
  // Keep only last 5 refresh tokens
  if (this.refreshTokens.length > 5) {
    this.refreshTokens = this.refreshTokens.slice(-5);
  }
};

// Method to remove refresh token
userSchema.methods.removeRefreshToken = function(token) {
  this.refreshTokens = this.refreshTokens.filter(rt => rt.token !== token);
};

// Method to clear expired refresh tokens
userSchema.methods.clearExpiredRefreshTokens = function() {
  const now = new Date();
  this.refreshTokens = this.refreshTokens.filter(rt => rt.expiresAt > now);
};

// Method to update achievement level
userSchema.methods.updateAchievementLevel = function() {
  if (this.gamesWon >= 100) {
    this.achievementLevel = 'Bingo Master';
  } else if (this.gamesWon >= 50) {
    this.achievementLevel = 'Bingo Expert';
  } else if (this.gamesWon >= 25) {
    this.achievementLevel = 'Bingo Pro';
  } else if (this.gamesWon >= 10) {
    this.achievementLevel = 'Bingo Player';
  } else {
    this.achievementLevel = 'Bingo Rookie';
  }
};

// Method to calculate average lines per game
userSchema.methods.calculateAverageLines = function() {
  this.averageLinesPerGame = this.gamesPlayed > 0 
    ? Math.round((this.totalLinesCompleted / this.gamesPlayed) * 10) / 10 
    : 0;
};

// Method to update game statistics
userSchema.methods.updateGameStats = function(isWinner, linesCompleted) {
  this.gamesPlayed += 1;
  this.totalLinesCompleted += linesCompleted;
  
  if (isWinner) {
    this.gamesWon += 1;
  } else {
    this.gamesLost += 1;
  }
  
  this.calculateAverageLines();
  this.updateAchievementLevel();
  this.lastActive = new Date();
};

// Virtual for win rate
userSchema.virtual('winRate').get(function() {
  return this.gamesPlayed > 0 ? ((this.gamesWon / this.gamesPlayed) * 100).toFixed(1) : 0;
});

// Ensure virtual fields are serialized
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
