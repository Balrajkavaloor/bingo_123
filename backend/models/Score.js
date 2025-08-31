const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  game: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true
  },
  // Game results
  isWinner: {
    type: Boolean,
    required: true
  },
  linesCompleted: {
    type: Number,
    default: 0
  },
  score: {
    type: Number,
    default: 0
  },
  // Game details
  gameType: {
    type: String,
    enum: ['solo', 'multiplayer'],
    required: true
  },
  opponent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Timing
  gameDuration: {
    type: Number, // in minutes
    default: 0
  },
  // Performance metrics
  numbersCalled: {
    type: Number,
    default: 0
  },
  accuracy: {
    type: Number, // percentage of correct calls
    default: 0
  },
  // Weekly/Monthly tracking
  week: {
    type: Number, // week number of the year
    required: true
  },
  month: {
    type: Number, // month number (1-12)
    required: true
  },
  year: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

// Indexes for better performance
scoreSchema.index({ user: 1, createdAt: -1 });
scoreSchema.index({ user: 1, week: 1, year: 1 });
scoreSchema.index({ user: 1, month: 1, year: 1 });
scoreSchema.index({ isWinner: 1, createdAt: -1 });
scoreSchema.index({ score: -1, createdAt: -1 });

// Compound indexes for leaderboards
scoreSchema.index({ week: 1, year: 1, score: -1 });
scoreSchema.index({ month: 1, year: 1, score: -1 });
scoreSchema.index({ year: 1, score: -1 });

// Method to calculate score based on performance
scoreSchema.methods.calculateScore = function() {
  let baseScore = 0;
  
  // Base score for winning
  if (this.isWinner) {
    baseScore += 100;
  }
  
  // Bonus for lines completed
  baseScore += this.linesCompleted * 10;
  
  // Bonus for accuracy
  if (this.accuracy > 80) {
    baseScore += 50;
  } else if (this.accuracy > 60) {
    baseScore += 25;
  }
  
  // Penalty for long games (encourage faster play)
  if (this.gameDuration > 30) {
    baseScore -= Math.floor(this.gameDuration / 10) * 5;
  }
  
  // Bonus for multiplayer games
  if (this.gameType === 'multiplayer') {
    baseScore += 25;
  }
  
  this.score = Math.max(0, baseScore);
  return this.score;
};

// Static method to get weekly leaderboard
scoreSchema.statics.getWeeklyLeaderboard = async function(week, year) {
  return this.aggregate([
    {
      $match: {
        week: week,
        year: year
      }
    },
    {
      $group: {
        _id: '$user',
        totalScore: { $sum: '$score' },
        gamesPlayed: { $sum: 1 },
        gamesWon: { $sum: { $cond: ['$isWinner', 1, 0] } },
        totalLinesCompleted: { $sum: '$linesCompleted' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $unwind: '$user'
    },
    {
      $project: {
        _id: 1,
        username: '$user.username',
        totalScore: 1,
        gamesPlayed: 1,
        gamesWon: 1,
        totalLinesCompleted: 1,
        winRate: {
          $cond: [
            { $eq: ['$gamesPlayed', 0] },
            0,
            { $multiply: [{ $divide: ['$gamesWon', '$gamesPlayed'] }, 100] }
          ]
        }
      }
    },
    {
      $sort: { totalScore: -1 }
    },
    {
      $limit: 10
    }
  ]);
};

// Static method to get monthly leaderboard
scoreSchema.statics.getMonthlyLeaderboard = async function(month, year) {
  return this.aggregate([
    {
      $match: {
        month: month,
        year: year
      }
    },
    {
      $group: {
        _id: '$user',
        totalScore: { $sum: '$score' },
        gamesPlayed: { $sum: 1 },
        gamesWon: { $sum: { $cond: ['$isWinner', 1, 0] } },
        totalLinesCompleted: { $sum: '$linesCompleted' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $unwind: '$user'
    },
    {
      $project: {
        _id: 1,
        username: '$user.username',
        totalScore: 1,
        gamesPlayed: 1,
        gamesWon: 1,
        totalLinesCompleted: 1,
        winRate: {
          $cond: [
            { $eq: ['$gamesPlayed', 0] },
            0,
            { $multiply: [{ $divide: ['$gamesWon', '$gamesPlayed'] }, 100] }
          ]
        }
      }
    },
    {
      $sort: { totalScore: -1 }
    },
    {
      $limit: 10
    }
  ]);
};

// Static method to get overall leaderboard
scoreSchema.statics.getOverallLeaderboard = async function() {
  return this.aggregate([
    {
      $group: {
        _id: '$user',
        totalScore: { $sum: '$score' },
        gamesPlayed: { $sum: 1 },
        gamesWon: { $sum: { $cond: ['$isWinner', 1, 0] } },
        totalLinesCompleted: { $sum: '$linesCompleted' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $unwind: '$user'
    },
    {
      $project: {
        _id: 1,
        username: '$user.username',
        totalScore: 1,
        gamesPlayed: 1,
        gamesWon: 1,
        totalLinesCompleted: 1,
        winRate: {
          $cond: [
            { $eq: ['$gamesPlayed', 0] },
            0,
            { $multiply: [{ $divide: ['$gamesWon', '$gamesPlayed'] }, 100] }
          ]
        }
      }
    },
    {
      $sort: { totalScore: -1 }
    },
    {
      $limit: 10
    }
  ]);
};

// Pre-save middleware to set week, month, year
scoreSchema.pre('save', function(next) {
  const date = new Date();
  this.week = getWeekNumber(date);
  this.month = date.getMonth() + 1;
  this.year = date.getFullYear();
  
  // Calculate score if not set
  if (!this.score) {
    this.calculateScore();
  }
  
  next();
});

// Helper function to get week number
function getWeekNumber(date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

module.exports = mongoose.model('Score', scoreSchema);
