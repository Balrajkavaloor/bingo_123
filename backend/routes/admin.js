const express = require('express');
const User = require('../models/User');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

// All admin routes require admin role
router.use(requireAdmin);

// Get all users (admin only)
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', role = '', status = '' } = req.query;
    
    const query = {};
    
    // Search by username or email
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filter by role
    if (role) {
      query.role = role;
    }
    
    // Filter by status
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }
    
    const skip = (page - 1) * limit;
    
    const users = await User.find(query)
      .select('-password -refreshTokens')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(query);
    
    res.json({
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
        usersPerPage: parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get user by ID (admin only)
router.get('/users/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password -refreshTokens');
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
    
    res.json({ user });
    
  } catch (error) {
    console.error('Admin get user error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Update user role (admin only)
router.patch('/users/:userId/role', async (req, res) => {
  try {
    const { role } = req.body;
    
    if (!role || !['user', 'moderator', 'admin'].includes(role)) {
      return res.status(400).json({
        error: 'Valid role is required (user, moderator, admin)'
      });
    }
    
    // Prevent admin from changing their own role
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({
        error: 'Cannot change your own role'
      });
    }
    
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { role },
      { new: true, runValidators: true }
    ).select('-password -refreshTokens');
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
    
    res.json({
      message: 'User role updated successfully',
      user
    });
    
  } catch (error) {
    console.error('Admin update user role error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Toggle user account status (admin only)
router.patch('/users/:userId/status', async (req, res) => {
  try {
    const { isActive } = req.body;
    
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        error: 'isActive must be a boolean value'
      });
    }
    
    // Prevent admin from deactivating their own account
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({
        error: 'Cannot deactivate your own account'
      });
    }
    
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { 
        isActive,
        isOnline: false,
        lastActive: new Date()
      },
      { new: true, runValidators: true }
    ).select('-password -refreshTokens');
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
    
    res.json({
      message: `User account ${isActive ? 'activated' : 'deactivated'} successfully`,
      user
    });
    
  } catch (error) {
    console.error('Admin toggle user status error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Delete user (admin only)
router.delete('/users/:userId', async (req, res) => {
  try {
    // Prevent admin from deleting their own account
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({
        error: 'Cannot delete your own account'
      });
    }
    
    const user = await User.findByIdAndDelete(req.params.userId);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
    
    res.json({
      message: 'User deleted successfully'
    });
    
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get system statistics (admin only)
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const onlineUsers = await User.countDocuments({ isOnline: true });
    const newUsersToday = await User.countDocuments({
      createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
    });
    
    const roleStats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const achievementStats = await User.aggregate([
      {
        $group: {
          _id: '$achievementLevel',
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json({
      totalUsers,
      activeUsers,
      onlineUsers,
      newUsersToday,
      roleStats,
      achievementStats
    });
    
  } catch (error) {
    console.error('Admin get stats error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;
