const express = require('express');
const Game = require('../models/Game');
const User = require('../models/User');
const Score = require('../models/Score');
const router = express.Router();

// Generate Bingo board
const generateBingoBoard = () => {
  const board = [];
  
  // Generate numbers 1-25 (excluding 13 for FREE space)
  const allNumbers = [];
  for (let i = 1; i <= 25; i++) {
    if (i !== 13) { // Skip 13 for FREE space
      allNumbers.push(i);
    }
  }
  
  // Shuffle the numbers
  for (let i = allNumbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allNumbers[i], allNumbers[j]] = [allNumbers[j], allNumbers[i]];
  }
  
  // Generate 5x5 board
  let numberIndex = 0;
  for (let i = 0; i < 5; i++) {
    const row = [];
    for (let j = 0; j < 5; j++) {
      if (i === 2 && j === 2) {
        row.push('FREE'); // Center space
      } else {
        row.push(allNumbers[numberIndex++]);
      }
    }
    board.push(row);
  }
  return board;
};

// Create a new game
router.post('/', async (req, res) => {
  try {
    const { opponentId, gameType = 'multiplayer' } = req.body;

    if (gameType === 'multiplayer' && !opponentId) {
      return res.status(400).json({
        error: 'Opponent ID is required for multiplayer games'
      });
    }

    // Check if opponent exists
    if (opponentId) {
      const opponent = await User.findById(opponentId);
      if (!opponent) {
        return res.status(404).json({
          error: 'Opponent not found'
        });
      }

      // Check if there's already an active game between these users
      const existingGame = await Game.findOne({
        $or: [
          { creator: req.user._id, opponent: opponentId },
          { creator: opponentId, opponent: req.user._id }
        ],
        status: { $in: ['pending', 'active'] }
      });

      if (existingGame) {
        return res.status(400).json({
          error: 'There is already an active game with this opponent'
        });
      }
    }

    // Generate shared board for both players
    const sharedBoard = generateBingoBoard();

    const gameData = {
      creator: req.user._id,
      opponent: opponentId || req.user._id, // For solo games, opponent is the same as creator
      gameType,
      gameData: {
        creatorBoard: sharedBoard,
        opponentBoard: sharedBoard,
        calledNumbers: [],
        currentTurn: 'creator',
        creatorCompletedLines: 0,
        opponentCompletedLines: 0
      }
    };

    const game = new Game(gameData);
    await game.save();

    // Populate user details
    await game.populate([
      { path: 'creator', select: 'username avatar' },
      { path: 'opponent', select: 'username avatar' }
    ]);

    res.status(201).json({
      message: 'Game created successfully',
      game
    });

  } catch (error) {
    console.error('Create game error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get all games for current user
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = {
      $or: [
        { creator: req.user._id },
        { opponent: req.user._id }
      ]
    };

    if (status) {
      query.status = status;
    }

    const games = await Game.find(query)
      .populate('creator', 'username avatar')
      .populate('opponent', 'username avatar')
      .populate('winner', 'username')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Game.countDocuments(query);

    res.json({
      games,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Get games error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get specific game
router.get('/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await Game.findById(gameId)
      .populate('creator', 'username avatar')
      .populate('opponent', 'username avatar')
      .populate('winner', 'username');

    if (!game) {
      return res.status(404).json({
        error: 'Game not found'
      });
    }

    // Check if user is part of this game
    if (game.creator._id.toString() !== req.user._id.toString() && 
        game.opponent._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: 'Access denied. You are not part of this game.'
      });
    }

    res.json({ game });

  } catch (error) {
    console.error('Get game error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Join a game (accept invitation)
router.post('/:gameId/join', async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await Game.findById(gameId);

    if (!game) {
      return res.status(404).json({
        error: 'Game not found'
      });
    }

    if (!game.canJoin(req.user._id)) {
      return res.status(400).json({
        error: 'Cannot join this game'
      });
    }

    // Start the game
    game.status = 'active';
    game.invitationAccepted = true;
    game.startedAt = new Date();
    await game.save();

    await game.populate([
      { path: 'creator', select: 'username avatar' },
      { path: 'opponent', select: 'username avatar' }
    ]);

    res.json({
      message: 'Game started successfully',
      game
    });

  } catch (error) {
    console.error('Join game error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Call a number in the game
router.post('/:gameId/call-number', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { number } = req.body;

    const game = await Game.findById(gameId);

    if (!game) {
      return res.status(404).json({
        error: 'Game not found'
      });
    }

    if (game.status !== 'active') {
      return res.status(400).json({
        error: 'Game is not active'
      });
    }

    if (!game.isUserTurn(req.user._id)) {
      return res.status(400).json({
        error: 'It is not your turn'
      });
    }

    // Validate number
    if (typeof number !== 'number' || number < 1 || number > 25) {
      return res.status(400).json({
        error: 'Invalid number. Must be between 1 and 25.'
      });
    }

    // Call the number
    const numberCalled = game.callNumber(number, req.user._id);
    
    if (!numberCalled) {
      return res.status(400).json({
        error: 'Number has already been called'
      });
    }

    // Update completed lines for both players
    const creatorLines = game.checkWinCondition(game.gameData.creatorBoard, game.gameData.calledNumbers) ? 5 : 0;
    const opponentLines = game.checkWinCondition(game.gameData.opponentBoard, game.gameData.calledNumbers) ? 5 : 0;

    game.gameData.creatorCompletedLines = creatorLines;
    game.gameData.opponentCompletedLines = opponentLines;

    // Check for winner
    let winner = null;
    if (creatorLines >= 5) {
      winner = game.creator;
    } else if (opponentLines >= 5) {
      winner = game.opponent;
    }

    if (winner) {
      game.endGame(winner);
      
      // Update user statistics
      const creatorUser = await User.findById(game.creator);
      const opponentUser = await User.findById(game.opponent);
      
      if (creatorUser && opponentUser) {
        creatorUser.updateGameStats(winner.toString() === creatorUser._id.toString(), creatorLines);
        opponentUser.updateGameStats(winner.toString() === opponentUser._id.toString(), opponentLines);
        
        await creatorUser.save();
        await opponentUser.save();
      }

      // Create score records
      const creatorScore = new Score({
        user: game.creator,
        game: game._id,
        isWinner: winner.toString() === game.creator.toString(),
        linesCompleted: creatorLines,
        gameType: game.gameType,
        opponent: game.opponent,
        gameDuration: game.duration,
        numbersCalled: game.gameData.calledNumbers.length
      });

      const opponentScore = new Score({
        user: game.opponent,
        game: game._id,
        isWinner: winner.toString() === game.opponent.toString(),
        linesCompleted: opponentLines,
        gameType: game.gameType,
        opponent: game.creator,
        gameDuration: game.duration,
        numbersCalled: game.gameData.calledNumbers.length
      });

      await creatorScore.save();
      await opponentScore.save();
    }

    await game.save();

    await game.populate([
      { path: 'creator', select: 'username avatar' },
      { path: 'opponent', select: 'username avatar' },
      { path: 'winner', select: 'username' }
    ]);

    res.json({
      message: 'Number called successfully',
      game,
      winner: winner ? { _id: winner, username: game.creator._id.toString() === winner.toString() ? game.creator.username : game.opponent.username } : null
    });

  } catch (error) {
    console.error('Call number error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Decline game invitation
router.post('/:gameId/decline', async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await Game.findById(gameId);

    if (!game) {
      return res.status(404).json({
        error: 'Game not found'
      });
    }

    if (game.opponent.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: 'You can only decline games where you are the opponent'
      });
    }

    if (game.status !== 'pending') {
      return res.status(400).json({
        error: 'Game is not pending'
      });
    }

    game.status = 'cancelled';
    await game.save();

    res.json({
      message: 'Game invitation declined',
      game
    });

  } catch (error) {
    console.error('Decline game error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Cancel a game
router.post('/:gameId/cancel', async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await Game.findById(gameId);

    if (!game) {
      return res.status(404).json({
        error: 'Game not found'
      });
    }

    if (game.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: 'Only the creator can cancel a game'
      });
    }

    if (game.status === 'completed') {
      return res.status(400).json({
        error: 'Cannot cancel a completed game'
      });
    }

    game.status = 'cancelled';
    await game.save();

    res.json({
      message: 'Game cancelled successfully',
      game
    });

  } catch (error) {
    console.error('Cancel game error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;
