# Bingo Game Backend

A complete Node.js/Express backend for the Bingo Game with MongoDB integration, real-time Socket.IO communication, and comprehensive game management.

## Features

- **User Authentication**: JWT-based authentication with bcrypt password hashing
- **Real-time Gameplay**: Socket.IO for live game updates and chat
- **Game Management**: Create, join, and manage Bingo games
- **Leaderboards**: Weekly, monthly, and overall score tracking
- **User Statistics**: Comprehensive game statistics and achievements
- **MongoDB Integration**: Robust data persistence with Mongoose ODM
- **Security**: Rate limiting, CORS, and input validation

## Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM for MongoDB
- **Socket.IO** - Real-time communication
- **JWT** - Authentication
- **bcryptjs** - Password hashing
- **Helmet** - Security middleware
- **Morgan** - HTTP request logger

## Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   Create a `config.env` file in the root directory:
   ```env
   # MongoDB Connection
   MONGODB_URI=mongodb://localhost:27017/bingo-game
   
   # JWT Secret
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   
   # Server Configuration
   PORT=5000
   NODE_ENV=development
   
   # Client URL for CORS
   CLIENT_URL=http://localhost:3000
   ```

3. **Start MongoDB**:
   Make sure MongoDB is running on your system or use MongoDB Atlas.

4. **Run the server**:
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

## API Endpoints

### Authentication (`/api/auth`)

- `POST /register` - Register a new user
- `POST /login` - Login user
- `GET /me` - Get current user profile
- `POST /logout` - Logout user

### Users (`/api/users`)

- `GET /` - Get all users (for invitations)
- `GET /online` - Get online users
- `GET /:userId` - Get user profile
- `PUT /profile` - Update user profile
- `GET /:userId/stats` - Get user statistics
- `GET /search/:query` - Search users

### Games (`/api/games`)

- `POST /` - Create a new game
- `GET /` - Get user's games
- `GET /:gameId` - Get specific game
- `POST /:gameId/join` - Join a game
- `POST /:gameId/call-number` - Call a number in game
- `POST /:gameId/decline` - Decline game invitation
- `POST /:gameId/cancel` - Cancel a game

### Scores (`/api/scores`)

- `GET /weekly` - Get weekly leaderboard
- `GET /monthly` - Get monthly leaderboard
- `GET /overall` - Get overall leaderboard
- `GET /history` - Get user's score history
- `GET /stats` - Get user's statistics
- `GET /recent` - Get recent scores
- `GET /top-players` - Get top players by category

## Socket.IO Events

### Client to Server

- `join-game` - Join a game room
- `leave-game` - Leave a game room
- `send-invitation` - Send game invitation
- `respond-to-invitation` - Respond to invitation
- `call-number` - Call a number in game
- `game-message` - Send chat message
- `typing` - Typing indicator

### Server to Client

- `user-connected` - User connected to server
- `user-disconnected` - User disconnected from server
- `game-joined` - Successfully joined game
- `player-joined-game` - Another player joined game
- `player-left-game` - Player left game
- `game-invitation` - Received game invitation
- `invitation-accepted` - Invitation was accepted
- `invitation-declined` - Invitation was declined
- `game-started` - Game has started
- `number-called` - Number was called in game
- `game-message` - Chat message received
- `typing` - Typing indicator
- `error` - Error message

## Database Models

### User
- Authentication fields (email, password, username)
- Game statistics (games played, won, lost, lines completed)
- Achievement tracking
- Online status and activity

### Game
- Game participants (creator, opponent)
- Game state (pending, active, completed, cancelled)
- Game data (boards, called numbers, turns)
- Game settings and timing

### Score
- Game results and performance metrics
- Weekly/monthly tracking for leaderboards
- Score calculation based on performance

## Game Rules

- Traditional Bingo with 5x5 board (numbers 1-25)
- FREE space in the center (position 2,2)
- Players must complete 5 lines (rows, columns, or diagonals) to win
- Both players share the same board
- Turn-based gameplay
- Real-time updates via Socket.IO

## Security Features

- JWT authentication with token expiration
- Password hashing with bcrypt
- Rate limiting to prevent abuse
- Input validation and sanitization
- CORS configuration
- Helmet security headers

## Development

### Project Structure
```
backend/
├── models/          # Database models
├── routes/          # API routes
├── middleware/      # Custom middleware
├── socket/          # Socket.IO handlers
├── server.js        # Main server file
├── package.json     # Dependencies
└── config.env       # Environment variables
```

### Running Tests
```bash
npm test
```

### Environment Variables
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment (development/production)
- `CLIENT_URL` - Frontend URL for CORS

## Production Deployment

1. Set `NODE_ENV=production`
2. Use a strong JWT secret
3. Configure MongoDB Atlas or production MongoDB
4. Set up proper CORS origins
5. Use environment variables for sensitive data
6. Enable HTTPS in production

## Health Check

The server provides a health check endpoint:
```
GET /api/health
```

Returns server status, database connection, and timestamp.

## License

This project is licensed under the ISC License.
