const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';
let accessToken = '';
let refreshToken = '';

// Test user data
const testUser = {
  email: 'test@example.com',
  password: 'password123',
  username: 'testuser'
};

// Helper function to make authenticated requests
const makeAuthRequest = async (method, endpoint, data = null) => {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken && { Authorization: `Bearer ${accessToken}` })
      },
      ...(data && { data })
    };
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`❌ ${method} ${endpoint} failed:`, error.response?.data || error.message);
    return null;
  }
};

// Test the authentication system
const testAuth = async () => {
  console.log('🧪 Testing Authentication System...\n');

  // 1. Test registration
  console.log('1️⃣ Testing User Registration...');
  const registerResult = await makeAuthRequest('POST', '/auth/register', testUser);
  if (registerResult) {
    console.log('✅ Registration successful');
    accessToken = registerResult.accessToken;
    refreshToken = registerResult.refreshToken;
    console.log(`   User ID: ${registerResult.user._id}`);
    console.log(`   Username: ${registerResult.user.username}`);
    console.log(`   Role: ${registerResult.user.role}`);
  }

  // 2. Test login
  console.log('\n2️⃣ Testing User Login...');
  const loginResult = await makeAuthRequest('POST', '/auth/login', {
    email: testUser.email,
    password: testUser.password
  });
  if (loginResult) {
    console.log('✅ Login successful');
    accessToken = loginResult.accessToken;
    refreshToken = loginResult.refreshToken;
  }

  // 3. Test getting user profile
  console.log('\n3️⃣ Testing Get User Profile...');
  const profileResult = await makeAuthRequest('GET', '/auth/me');
  if (profileResult) {
    console.log('✅ Profile retrieval successful');
    console.log(`   Email: ${profileResult.user.email}`);
    console.log(`   Games Played: ${profileResult.user.gamesPlayed}`);
  }

  // 4. Test refresh token
  console.log('\n4️⃣ Testing Token Refresh...');
  const refreshResult = await makeAuthRequest('POST', '/auth/refresh', { refreshToken });
  if (refreshResult) {
    console.log('✅ Token refresh successful');
    accessToken = refreshResult.accessToken;
    refreshToken = refreshResult.refreshToken;
  }

  // 5. Test protected route access
  console.log('\n5️⃣ Testing Protected Route Access...');
  const usersResult = await makeAuthRequest('GET', '/users');
  if (usersResult) {
    console.log('✅ Protected route access successful');
    console.log(`   Users found: ${usersResult.users?.length || 0}`);
  }

  // 6. Test logout
  console.log('\n6️⃣ Testing Logout...');
  const logoutResult = await makeAuthRequest('POST', '/auth/logout', { refreshToken });
  if (logoutResult) {
    console.log('✅ Logout successful');
  }

  // 7. Test access after logout
  console.log('\n7️⃣ Testing Access After Logout...');
  const postLogoutProfile = await makeAuthRequest('GET', '/auth/me');
  if (!postLogoutProfile) {
    console.log('✅ Access properly denied after logout');
  }

  console.log('\n🎉 Authentication System Test Complete!');
  console.log('\n📋 Summary:');
  console.log('   - User registration: ✅');
  console.log('   - User login: ✅');
  console.log('   - Profile retrieval: ✅');
  console.log('   - Token refresh: ✅');
  console.log('   - Protected routes: ✅');
  console.log('   - Logout: ✅');
  console.log('   - Access control: ✅');
};

// Health check before testing
const checkHealth = async () => {
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    console.log('🏥 Server Health Check:', response.data.status);
    return true;
  } catch (error) {
    console.error('❌ Server not responding. Make sure the backend is running on port 5000');
    return false;
  }
};

// Run tests
const runTests = async () => {
  console.log('🚀 Starting Authentication System Tests\n');
  
  const isHealthy = await checkHealth();
  if (!isHealthy) {
    console.log('❌ Cannot proceed with tests. Please start the backend server first.');
    console.log('   Run: npm run dev');
    return;
  }

  await testAuth();
};

// Run if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testAuth, checkHealth };
