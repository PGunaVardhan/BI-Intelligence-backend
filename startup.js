// backend/startup.js - Debug helper to check setup
const fs = require('fs');
const path = require('path');

console.log('🚀 BI Intelligence Backend Startup Check\n');

// Check required directories
const requiredDirs = [
  'src',
  'src/routes',
  'src/services',
  'src/models',
  'src/models/qwen',
  'src/models/openai', 
  'src/models/claude',
  'src/models/deepseek',
  'src/config',
  'src/middleware',
  'src/utils',
  'uploads',
  'logs'
];

console.log('📁 Checking directories...');
requiredDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`✅ ${dir}`);
  } else {
    console.log(`❌ ${dir} - MISSING`);
    // Create missing directory
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✨ Created ${dir}`);
  }
});

// Check required files
const requiredFiles = [
  'src/server.js',
  'src/routes/files.js',
  'src/routes/chat.js', 
  'src/routes/models.js',
  'src/routes/health.js',
  'src/services/mcpBridge.js',
  'src/services/modelManager.js',
  'src/services/toolManager.js',
  'src/services/fileProcessor.js',
  'src/services/configManager.js',
  'src/models/qwen/qwenClient.js',
  'src/config/models.json',
  'src/config/tools.json',
  'src/config/mcp.json',
  'src/middleware/cors.js',
  'src/utils/logger.js',
  'src/utils/errorHandler.js',
  'package.json'
];

console.log('\n📄 Checking files...');
let missingFiles = [];
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    missingFiles.push(file);
  }
});

// Check package.json dependencies
console.log('\n📦 Checking package.json...');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const requiredDeps = [
    'express', 'cors', 'multer', 'socket.io', 'axios', 
    'dotenv', 'winston', 'joi'
  ];
  
  requiredDeps.forEach(dep => {
    if (packageJson.dependencies && packageJson.dependencies[dep]) {
      console.log(`✅ ${dep}`);
    } else {
      console.log(`❌ ${dep} - MISSING DEPENDENCY`);
    }
  });
} catch (error) {
  console.log('❌ package.json - ERROR READING');
}

// Check environment file
console.log('\n🔧 Checking environment...');
if (fs.existsSync('.env')) {
  console.log('✅ .env file exists');
} else {
  console.log('❌ .env file missing');
  console.log('💡 Create .env file with required variables');
}

// Summary
console.log('\n📋 SUMMARY');
if (missingFiles.length === 0) {
  console.log('🎉 All required files present!');
  console.log('\n🚀 Ready to start with: npm run dev');
} else {
  console.log(`❌ Missing ${missingFiles.length} files`);
  console.log('📝 Missing files:');
  missingFiles.forEach(file => console.log(`   - ${file}`));
}

console.log('\n💡 Next steps:');
console.log('1. Run: npm install');
console.log('2. Create .env file');
console.log('3. Add missing files');
console.log('4. Run: npm run dev');

console.log('\n🔍 If you get errors, check:');
console.log('- All files are in correct locations');
console.log('- All dependencies are installed');
console.log('- .env file has correct values');
console.log('- Docker container is running (if using tools)');