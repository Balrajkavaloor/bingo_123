const express = require('express');
const User = require('../models/User');
const router = express.Router();

// Get all users (for game invitations)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    
    const query = {
      _id: { $ne: req.user._id } // Exclude current user
    };

    // Add search functionality
    if (search) {
      query.username = { $regex: search, $options: 'i' };
    }

    const users = await User.find(query)
      .select('username avatar gamesPlayed gamesWon achievementLevel isOnline lastActive')
      .sort({ isOnline: -1, lastActive: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await User.countDocuments(query);

    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get online users
router.get('/online', async (req, res) => {
  try {
    const onlineUsers = await User.find({ 
      isOnline: true,
      _id: { $ne: req.user._id }
    })
    .select('username avatar achievementLevel lastActive')
    .sort({ lastActive: -1 })
    .lean();

    res.json({ users: onlineUsers });

  } catch (error) {
    console.error('Get online users error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get user profile by ID
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('-password')
      .lean();

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    res.json({ user });

  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Update user profile
router.put('/profile', async (req, res) => {
  try {
    const { username, avatar, preferredGameMode } = req.body;
    const updates = {};

    // Validate and add updates
    if (username && username.length >= 3 && username.length <= 20) {
      // Check if username is already taken
      const existingUser = await User.findOne({ 
        username, 
        _id: { $ne: req.user._id } 
      });
      
      if (existingUser) {
        return res.status(400).json({
          error: 'Username already taken'
        });
      }
      
      updates.username = username;
    }

    if (avatar) {
      updates.avatar = avatar;
    }

    if (preferredGameMode && ['solo', 'multiplayer'].includes(preferredGameMode)) {
      updates.preferredGameMode = preferredGameMode;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No valid updates provided'
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get user statistics
router.get('/:userId/stats', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('gamesPlayed gamesWon gamesLost totalLinesCompleted averageLinesPerGame achievementLevel winRate')
      .lean();

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    res.json({ stats: user });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get current user stats
router.get('/stats', async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('gamesPlayed gamesWon gamesLost totalLinesCompleted averageLinesPerGame achievementLevel winRate')
      .lean();

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    res.json(user);

  } catch (error) {
    console.error('Get current user stats error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Search users
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const { limit = 10 } = req.query;

    if (query.length < 2) {
      return res.status(400).json({
        error: 'Search query must be at least 2 characters long'
      });
    }

    const users = await User.find({
      username: { $regex: query, $options: 'i' },
      _id: { $ne: req.user._id }
    })
    .select('username avatar gamesPlayed gamesWon achievementLevel isOnline')
    .limit(parseInt(limit))
    .sort({ isOnline: -1, gamesWon: -1 })
    .lean();

    res.json({ users });

  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;
