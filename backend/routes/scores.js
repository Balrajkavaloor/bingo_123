const express = require('express');
const Score = require('../models/Score');
const User = require('../models/User');
const router = express.Router();

// Get weekly leaderboard
router.get('/weekly', async (req, res) => {
  try {
    const { week, year } = req.query;
    
    const currentDate = new Date();
    const currentWeek = week || getWeekNumber(currentDate);
    const currentYear = year || currentDate.getFullYear();

    const leaderboard = await Score.getWeeklyLeaderboard(currentWeek, currentYear);

    res.json({
      leaderboard,
      week: currentWeek,
      year: currentYear
    });

  } catch (error) {
    console.error('Get weekly leaderboard error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get monthly leaderboard
router.get('/monthly', async (req, res) => {
  try {
    const { month, year } = req.query;
    
    const currentDate = new Date();
    const currentMonth = month || (currentDate.getMonth() + 1);
    const currentYear = year || currentDate.getFullYear();

    const leaderboard = await Score.getMonthlyLeaderboard(currentMonth, currentYear);

    res.json({
      leaderboard,
      month: currentMonth,
      year: currentYear
    });

  } catch (error) {
    console.error('Get monthly leaderboard error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get overall leaderboard
router.get('/overall', async (req, res) => {
  try {
    const leaderboard = await Score.getOverallLeaderboard();

    res.json({
      leaderboard
    });

  } catch (error) {
    console.error('Get overall leaderboard error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get user's score history
router.get('/history', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const scores = await Score.find({ user: req.user._id })
      .populate('game', 'createdAt duration')
      .populate('opponent', 'username')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Score.countDocuments({ user: req.user._id });

    res.json({
      scores,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Get score history error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get user's statistics
router.get('/stats', async (req, res) => {
  try {
    const { period = 'all' } = req.query;
    
    let matchQuery = { user: req.user._id };
    
    if (period === 'week') {
      const currentDate = new Date();
      const weekStart = new Date(currentDate);
      weekStart.setDate(currentDate.getDate() - currentDate.getDay());
      weekStart.setHours(0, 0, 0, 0);
      
      matchQuery.createdAt = { $gte: weekStart };
    } else if (period === 'month') {
      const currentDate = new Date();
      const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      
      matchQuery.createdAt = { $gte: monthStart };
    }

    const stats = await Score.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalGames: { $sum: 1 },
          totalWins: { $sum: { $cond: ['$isWinner', 1, 0] } },
          totalScore: { $sum: '$score' },
          totalLinesCompleted: { $sum: '$linesCompleted' },
          averageScore: { $avg: '$score' },
          averageLines: { $avg: '$linesCompleted' },
          bestScore: { $max: '$score' },
          totalGameTime: { $sum: '$gameDuration' }
        }
      }
    ]);

    const result = stats[0] || {
      totalGames: 0,
      totalWins: 0,
      totalScore: 0,
      totalLinesCompleted: 0,
      averageScore: 0,
      averageLines: 0,
      bestScore: 0,
      totalGameTime: 0
    };

    result.winRate = result.totalGames > 0 ? ((result.totalWins / result.totalGames) * 100).toFixed(1) : 0;
    result.averageScore = Math.round(result.averageScore * 10) / 10;
    result.averageLines = Math.round(result.averageLines * 10) / 10;

    res.json({ stats: result });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get recent scores for all users (for activity feed)
router.get('/recent', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const recentScores = await Score.find()
      .populate('user', 'username avatar')
      .populate('opponent', 'username')
      .populate('game', 'createdAt')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({ recentScores });

  } catch (error) {
    console.error('Get recent scores error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get top players by category
router.get('/top-players', async (req, res) => {
  try {
    const { category = 'score', limit = 10 } = req.query;

    let sortField = 'totalScore';
    let groupField = 'totalScore';

    switch (category) {
      case 'wins':
        sortField = 'totalWins';
        groupField = 'totalWins';
        break;
      case 'games':
        sortField = 'totalGames';
        groupField = 'totalGames';
        break;
      case 'lines':
        sortField = 'totalLinesCompleted';
        groupField = 'totalLinesCompleted';
        break;
      case 'winrate':
        sortField = 'winRate';
        groupField = { $multiply: [{ $divide: ['$totalWins', '$totalGames'] }, 100] };
        break;
      default:
        sortField = 'totalScore';
        groupField = 'totalScore';
    }

    const topPlayers = await Score.aggregate([
      {
        $group: {
          _id: '$user',
          totalScore: { $sum: '$score' },
          totalWins: { $sum: { $cond: ['$isWinner', 1, 0] } },
          totalGames: { $sum: 1 },
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
          avatar: '$user.avatar',
          totalScore: 1,
          totalWins: 1,
          totalGames: 1,
          totalLinesCompleted: 1,
          winRate: {
            $cond: [
              { $eq: ['$totalGames', 0] },
              0,
              { $multiply: [{ $divide: ['$totalWins', '$totalGames'] }, 100] }
            ]
          }
        }
      },
      {
        $sort: { [sortField]: -1 }
      },
      {
        $limit: parseInt(limit)
      }
    ]);

    res.json({ topPlayers, category });

  } catch (error) {
    console.error('Get top players error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Helper function to get week number
function getWeekNumber(date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

module.exports = router;
