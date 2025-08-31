const express = require('express');
const User = require('../models/User');
const { generateToken, generateRefreshToken, verifyRefreshToken } = require('../middleware/auth');
const router = express.Router();

// Rate limiting for auth endpoints
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs for auth
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // limit each IP to 3 login attempts per windowMs
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Register new user
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, username } = req.body;

    // Validation
    if (!email || !password || !username) {
      return res.status(400).json({
        error: 'Please provide email, password, and username'
      });
    }

    // Enhanced email validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Please enter a valid email address'
      });
    }

    // Enhanced username validation
    const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        error: 'Username must be 3-20 characters long and contain only letters, numbers, underscores, and hyphens'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({
        error: existingUser.email === email.toLowerCase() 
          ? 'Email already registered' 
          : 'Username already taken'
      });
    }

    // Create new user
    const user = new User({
      email: email.toLowerCase(),
      password,
      username
    });

    await user.save();

    // Generate tokens
    const accessToken = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    
    // Add refresh token to user
    user.addRefreshToken(refreshToken, req.headers['user-agent'] || 'Unknown');
    await user.save();

    // Return user data (without password)
    const userResponse = {
      _id: user._id,
      email: user.email,
      username: user.username,
      avatar: user.avatar,
      role: user.role,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      gamesLost: user.gamesLost,
      totalLinesCompleted: user.totalLinesCompleted,
      averageLinesPerGame: user.averageLinesPerGame,
      achievementLevel: user.achievementLevel,
      winRate: user.winRate,
      createdAt: user.createdAt
    };

    res.status(201).json({
      message: 'User registered successfully',
      accessToken,
      refreshToken,
      user: userResponse
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        error: 'Validation failed',
        details: validationErrors
      });
    }
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        error: `${field} already exists`
      });
    }

    res.status(500).json({
      error: 'Internal server error during registration'
    });
  }
});

// Login user - CRITICAL: This route should NEVER create users, only authenticate existing ones
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, username, ...otherFields } = req.body;

    // SECURITY CHECK: Prevent any registration-like data in login
    if (username || Object.keys(otherFields).length > 0) {
      console.error('SECURITY ALERT: Login route received registration data:', { username, otherFields });
      return res.status(400).json({
        error: 'Invalid request. This endpoint is for login only.'
      });
    }

    console.log('Login attempt:', { email: email?.substring(0, 10) + '...', hasPassword: !!password });

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        error: 'Please provide email and password'
      });
    }

    // Enhanced email validation for login
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Please enter a valid email address'
      });
    }

    // Find user by email (case-insensitive) - ONLY EXISTING USERS
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.log('Login failed: User not found for email:', email);
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    // CRITICAL SECURITY CHECK: Ensure this is an existing user, not a new one
    if (user.isNew || !user._id) {
      console.error('SECURITY ALERT: Found invalid user object in login:', user);
      return res.status(500).json({
        error: 'Account security issue. Please contact support.'
      });
    }

    console.log('User found:', { userId: user._id, username: user.username, hasPassword: !!user.password });

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        error: 'Account is deactivated. Please contact support.'
      });
    }

    // Verify password exists and is hashed
    if (!user.password || user.password.length < 10) {
      console.error('User has invalid password hash:', { userId: user._id, passwordLength: user.password?.length });
      return res.status(500).json({
        error: 'Account security issue. Please contact support.'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      console.log('Login failed: Invalid password for user:', user._id);
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    console.log('Login successful for user:', user._id);

    // Update online status
    user.isOnline = true;
    user.lastActive = new Date();
    
    // Generate tokens
    const accessToken = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    
    // Add refresh token to user
    user.addRefreshToken(refreshToken, req.headers['user-agent'] || 'Unknown');
    await user.save();

    // Return user data (without password)
    const userResponse = {
      _id: user._id,
      email: user.email,
      username: user.username,
      avatar: user.avatar,
      role: user.role,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      gamesLost: user.gamesLost,
      totalLinesCompleted: user.totalLinesCompleted,
      averageLinesPerGame: user.averageLinesPerGame,
      achievementLevel: user.achievementLevel,
      winRate: user.winRate,
      createdAt: user.createdAt
    };

    res.json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: userResponse
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal server error during login'
    });
  }
});

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Refresh token is required'
      });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    
    // Find user
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Invalid refresh token'
      });
    }

    // Check if refresh token exists in user's tokens
    const tokenExists = user.refreshTokens.some(rt => rt.token === refreshToken);
    if (!tokenExists) {
      return res.status(401).json({
        error: 'Invalid refresh token'
      });
    }

    // Generate new tokens
    const newAccessToken = generateToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);
    
    // Remove old refresh token and add new one
    user.removeRefreshToken(refreshToken);
    user.addRefreshToken(newRefreshToken, req.headers['user-agent'] || 'Unknown');
    await user.save();

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({
      error: 'Invalid refresh token'
    });
  }
});

// Get current user profile
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        error: 'No token provided'
      });
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        error: 'Account is deactivated'
      });
    }

    res.json({
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        role: user.role,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
        gamesPlayed: user.gamesPlayed,
        gamesWon: user.gamesWon,
        gamesLost: user.gamesLost,
        totalLinesCompleted: user.totalLinesCompleted,
        averageLinesPerGame: user.averageLinesPerGame,
        achievementLevel: user.achievementLevel,
        winRate: user.winRate,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Logout user
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      try {
        const decoded = verifyRefreshToken(refreshToken);
        
        // Remove refresh token from user
        await User.findByIdAndUpdate(decoded.userId, {
          $pull: { refreshTokens: { token: refreshToken } }
        });
      } catch (error) {
        // Token might be invalid, continue with logout
        console.log('Invalid refresh token during logout:', error.message);
      }
    }

    res.json({
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Internal server error during logout'
    });
  }
});

// Logout from all devices
router.post('/logout-all', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (token) {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Clear all refresh tokens and update online status
      await User.findByIdAndUpdate(decoded.userId, {
        refreshTokens: [],
        isOnline: false,
        lastActive: new Date()
      });
    }

    res.json({
      message: 'Logged out from all devices'
    });

  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({
      error: 'Internal server error during logout'
    });
  }
});

module.exports = router;
