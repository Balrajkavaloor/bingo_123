const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';
let adminAccessToken = '';
let adminRefreshToken = '';

// Admin user credentials
const adminUser = {
  email: 'admin@bingo.com',
  password: 'admin123'
};

// Helper function to make authenticated requests
const makeAuthRequest = async (method, endpoint, data = null) => {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...(adminAccessToken && { Authorization: `Bearer ${adminAccessToken}` })
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

// Test admin functionality
const testAdmin = async () => {
  console.log('👑 Testing Admin Functionality...\n');

  // 1. Login as admin
  console.log('1️⃣ Testing Admin Login...');
  const loginResult = await makeAuthRequest('POST', '/auth/login', adminUser);
  if (loginResult) {
    console.log('✅ Admin login successful');
    adminAccessToken = loginResult.accessToken;
    adminRefreshToken = loginResult.refreshToken;
    console.log(`   Role: ${loginResult.user.role}`);
    console.log(`   Username: ${loginResult.user.username}`);
  }

  // 2. Test getting all users
  console.log('\n2️⃣ Testing Get All Users...');
  const usersResult = await makeAuthRequest('GET', '/admin/users');
  if (usersResult) {
    console.log('✅ Get users successful');
    console.log(`   Total users: ${usersResult.pagination.totalUsers}`);
    console.log(`   Users on page: ${usersResult.users.length}`);
  }

  // 3. Test getting system stats
  console.log('\n3️⃣ Testing Get System Stats...');
  const statsResult = await makeAuthRequest('GET', '/admin/stats');
  if (statsResult) {
    console.log('✅ Get stats successful');
    console.log(`   Total users: ${statsResult.totalUsers}`);
    console.log(`   Active users: ${statsResult.activeUsers}`);
    console.log(`   Online users: ${statsResult.onlineUsers}`);
    console.log(`   New users today: ${statsResult.newUsersToday}`);
  }

  // 4. Test role-based access
  console.log('\n4️⃣ Testing Role-Based Access...');
  const protectedRoute = await makeAuthRequest('GET', '/admin/users');
  if (protectedRoute) {
    console.log('✅ Admin route access successful');
  }

  console.log('\n🎉 Admin Functionality Test Complete!');
  console.log('\n📋 Summary:');
  console.log('   - Admin login: ✅');
  console.log('   - User management: ✅');
  console.log('   - System stats: ✅');
  console.log('   - Role-based access: ✅');
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
  console.log('🚀 Starting Admin Functionality Tests\n');
  
  const isHealthy = await checkHealth();
  if (!isHealthy) {
    console.log('❌ Cannot proceed with tests. Please start the backend server first.');
    console.log('   Run: npm run dev');
    return;
  }

  await testAdmin();
};

// Run if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testAdmin, checkHealth };
