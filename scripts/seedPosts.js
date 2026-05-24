const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Post = require('../models/Post');

async function seedPosts() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing posts
    await Post.deleteMany({});
    console.log('🗑️  Cleared existing posts');

    // Find the first user
    const user = await User.findOne();
    if (!user) {
      console.log('❌ No user found. Please seed users first.');
      process.exit(1);
    }

    console.log(`📝 Creating posts for user: ${user.name}`);

    // Create some sample posts
    const posts = await Post.insertMany([
      {
        userId: user._id,
        type: 'skill',
        content: 'I specialize in electrical work including home wiring and panel upgrades. 10 years of experience!',
        images: ['https://via.placeholder.com/500x400?text=Electrical+Work'],
        skills: ['Home Wiring', 'Panel Upgrade', 'LED Installation'],
        location: 'New York, NY',
        likes: [],
        comments: [],
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      },
      {
        userId: user._id,
        type: 'wanted',
        content: 'Looking for a professional plumber to fix leaking pipes in my bathroom.',
        images: [],
        skills: ['Plumbing'],
        location: 'Brooklyn, NY',
        likes: [],
        comments: [],
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000) // 5 hours ago
      },
      {
        userId: user._id,
        type: 'availability',
        content: 'Available for freelance carpentry work. Can do custom furniture, repairs, and renovations.',
        images: ['https://via.placeholder.com/500x400?text=Carpentry'],
        skills: ['Carpentry', 'Custom Furniture', 'Renovations'],
        location: 'Manhattan, NY',
        likes: [],
        comments: [],
        createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000) // 1 hour ago
      },
      {
        userId: user._id,
        type: 'announcement',
        content: '🎉 New workshop opening next month! Learn basic electrical skills from professionals.',
        images: ['https://via.placeholder.com/500x400?text=Workshop'],
        skills: ['Electrical', 'Training'],
        location: 'Queens, NY',
        likes: [],
        comments: [],
        createdAt: new Date() // just now
      }
    ]);

    console.log(`✅ Created ${posts.length} test posts`);
    
    // Display posts
    const allPosts = await Post.find().populate('userId', 'name username avatar email');
    console.log('\n📋 All Posts:');
    allPosts.forEach((post, i) => {
      console.log(`\n${i + 1}. ${post.userId.name} (@${post.userId.username})`);
      console.log(`   Type: ${post.type}`);
      console.log(`   Content: ${post.content.substring(0, 50)}...`);
      console.log(`   Skills: ${post.skills.join(', ')}`);
      console.log(`   Location: ${post.location}`);
      console.log(`   Images: ${post.images.length}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

seedPosts();

