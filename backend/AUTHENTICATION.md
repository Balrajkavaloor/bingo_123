# Authentication System Documentation

## Overview

This backend implements a comprehensive JWT-based authentication system with role-based access control (RBAC), refresh tokens, and enhanced security features.

## Features

### 🔐 Core Authentication
- **JWT Access Tokens** (1 hour expiry)
- **Refresh Tokens** (7 days expiry)
- **Password Hashing** with bcrypt (12 salt rounds)
- **Role-based Access Control** (user, moderator, admin)

### 🛡️ Security Features
- **Rate Limiting** on authentication endpoints
- **CORS Protection** with configurable origins
- **Helmet Security Headers**
- **Input Validation** and sanitization
- **Account Status Management** (active/inactive)

### 📱 Session Management
- **Multi-device Support** (up to 5 refresh tokens per user)
- **Device Information Tracking**
- **Online Status Monitoring**
- **Last Active Timestamp**

## API Endpoints

### Authentication Routes (`/api/auth`)

#### POST `/api/auth/register`
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "username": "username"
}
```

**Response:**
```json
{
  "message": "User registered successfully",
  "accessToken": "jwt_access_token",
  "refreshToken": "jwt_refresh_token",
  "user": { /* user object */ }
}
```

#### POST `/api/auth/login`
Authenticate existing user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "accessToken": "jwt_access_token",
  "refreshToken": "jwt_refresh_token",
  "user": { /* user object */ }
}
```

#### POST `/api/auth/refresh`
Refresh access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "jwt_refresh_token"
}
```

**Response:**
```json
{
  "accessToken": "new_jwt_access_token",
  "refreshToken": "new_jwt_refresh_token"
}
```

#### GET `/api/auth/me`
Get current user profile (requires authentication).

**Headers:**
```
Authorization: Bearer <access_token>
```

#### POST `/api/auth/logout`
Logout from current device.

**Request Body:**
```json
{
  "refreshToken": "jwt_refresh_token"
}
```

#### POST `/api/auth/logout-all`
Logout from all devices (requires authentication).

**Headers:**
```
Authorization: Bearer <access_token>
```

### Admin Routes (`/api/admin`)

**Note:** All admin routes require admin role authentication.

#### GET `/api/admin/users`
Get all users with pagination and filtering.

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Users per page (default: 20)
- `search`: Search by username or email
- `role`: Filter by role (user, moderator, admin)
- `status`: Filter by status (active, inactive)

#### GET `/api/admin/users/:userId`
Get specific user details.

#### PATCH `/api/admin/users/:userId/role`
Update user role.

**Request Body:**
```json
{
  "role": "moderator"
}
```

#### PATCH `/api/admin/users/:userId/status`
Toggle user account status.

**Request Body:**
```json
{
  "isActive": false
}
```

#### DELETE `/api/admin/users/:userId`
Delete user account.

#### GET `/api/admin/stats`
Get system statistics.

## Middleware

### `authenticateToken`
Verifies JWT access token and adds user to request object.

**Usage:**
```javascript
const { authenticateToken } = require('../middleware/auth');
app.use('/protected-route', authenticateToken);
```

### `requireRole(roles)`
Role-based access control middleware.

**Usage:**
```javascript
const { requireRole } = require('../middleware/auth');
app.use('/admin-route', requireRole(['admin']));
app.use('/moderator-route', requireRole(['moderator', 'admin']));
```

### `requireAdmin`
Admin-only access middleware.

**Usage:**
```javascript
const { requireAdmin } = require('../middleware/auth');
app.use('/admin-route', requireAdmin);
```

## User Model Schema

```javascript
{
  email: String,           // Required, unique, validated
  password: String,        // Required, min 6 chars, hashed
  username: String,        // Required, unique, 3-20 chars
  avatar: String,          // Optional avatar URL
  role: String,            // user, moderator, admin
  isActive: Boolean,       // Account status
  emailVerified: Boolean,  // Email verification status
  refreshTokens: Array,    // Array of refresh tokens
  gamesPlayed: Number,     // Game statistics
  gamesWon: Number,
  gamesLost: Number,
  totalLinesCompleted: Number,
  averageLinesPerGame: Number,
  achievementLevel: String, // Bingo Rookie to Bingo Master
  lastActive: Date,        // Last activity timestamp
  isOnline: Boolean,       // Current online status
  preferredGameMode: String // solo or multiplayer
}
```

## Security Considerations

### Rate Limiting
- **General API**: 100 requests per 15 minutes per IP
- **Authentication**: 5 requests per 15 minutes per IP
- **Login**: 3 attempts per 15 minutes per IP

### Token Security
- **Access Tokens**: 1 hour expiry for security
- **Refresh Tokens**: 7 days expiry with device tracking
- **Maximum Devices**: 5 concurrent refresh tokens per user

### Password Security
- **Minimum Length**: 6 characters
- **Hashing**: bcrypt with 12 salt rounds
- **Validation**: Email format validation

## Environment Variables

```env
# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/bingo-game

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Server Configuration
PORT=5000
NODE_ENV=development

# Client URL for CORS
CLIENT_URL=http://localhost:3000
```

## Error Handling

The system provides detailed error messages for different scenarios:

- **400**: Validation errors, duplicate entries
- **401**: Authentication failures, expired tokens
- **403**: Insufficient permissions
- **404**: Resource not found
- **500**: Internal server errors

## Best Practices

### Frontend Integration
1. Store access tokens in memory (not localStorage)
2. Store refresh tokens securely (httpOnly cookies recommended)
3. Implement automatic token refresh before expiry
4. Handle 401 responses by redirecting to login

### Security
1. Always use HTTPS in production
2. Regularly rotate JWT secrets
3. Monitor failed authentication attempts
4. Implement account lockout for suspicious activity

### Token Management
1. Clear tokens on logout
2. Implement token blacklisting if needed
3. Monitor active sessions
4. Provide logout from all devices option

## Testing

Test the authentication endpoints using tools like Postman or curl:

```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","username":"testuser"}'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Protected route
curl -X GET http://localhost:5000/api/users \
  -H "Authorization: Bearer <access_token>"
```

## Troubleshooting

### Common Issues

1. **Token Expired**: Use refresh token endpoint
2. **CORS Errors**: Check CLIENT_URL configuration
3. **MongoDB Connection**: Verify MONGODB_URI
4. **Rate Limiting**: Wait for cooldown period

### Debug Mode

Set `NODE_ENV=development` for detailed error messages and logging.
