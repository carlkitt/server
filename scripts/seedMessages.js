const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

async function seedMessages() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    // Clear existing data
    await User.deleteMany({});
    await Conversation.deleteMany({});
    await Message.deleteMany({});

    // Create test users
    const user1 = await User.create({
      name: 'John Doe',
      username: 'johndoe',
      email: 'john@example.com',
      password: 'hashedpassword123', // In real app, this would be hashed
      phone: '+1234567890',
      skills: ['Plumbing', 'Electrical'],
      rating: 4.5,
      verified: true
    });

    const user2 = await User.create({
      name: 'Maria Garcia',
      username: 'mariagarcia',
      email: 'maria@example.com',
      password: 'hashedpassword123',
      phone: '+0987654321',
      skills: ['Carpentry', 'Design'],
      rating: 4.8,
      verified: true
    });

    const user3 = await User.create({
      name: 'Alex Chen',
      username: 'alexchen',
      email: 'alex@example.com',
      password: 'hashedpassword123',
      phone: '+1122334455',
      skills: ['Web Development', 'Design'],
      rating: 4.7,
      verified: true
    });

    console.log('Users created:', user1.name, user2.name, user3.name);

    // Create conversation 1 first
    const conv1 = await Conversation.create({
      members: [user1._id, user2._id],
      updatedAt: new Date(Date.now() - 5 * 60000)
    });

    // Then create messages with conversationId
    const msg1 = await Message.create({
      conversationId: conv1._id,
      senderId: user1._id,
      text: 'Can you help with plumbing?',
      seen: false,
      createdAt: new Date(Date.now() - 5 * 60000)
    });

    const msg2 = await Message.create({
      conversationId: conv1._id,
      senderId: user2._id,
      text: 'Yes, I\'d be happy to help! What\'s the issue?',
      seen: true,
      createdAt: new Date(Date.now() - 3 * 60000)
    });

    // Update conversation with last message
    await Conversation.findByIdAndUpdate(conv1._id, { lastMessage: msg2._id });

    console.log('Conversation 1 created');

    // Create conversation 2
    const conv2 = await Conversation.create({
      members: [user1._id, user3._id],
      updatedAt: new Date(Date.now() - 60 * 60000)
    });

    const msg3 = await Message.create({
      conversationId: conv2._id,
      senderId: user3._id,
      text: 'Yes, I\'m available tomorrow',
      seen: false,
      createdAt: new Date(Date.now() - 60 * 60000)
    });

    await Conversation.findByIdAndUpdate(conv2._id, { lastMessage: msg3._id });

    console.log('Conversation 2 created');

    // Create conversation 3
    const conv3 = await Conversation.create({
      members: [user1._id, user3._id],
      updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60000)
    });

    const msg4 = await Message.create({
      conversationId: conv3._id,
      senderId: user3._id,
      text: 'What\'s your rate?',
      seen: false,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60000)
    });

    await Conversation.findByIdAndUpdate(conv3._id, { lastMessage: msg4._id });

    console.log('\n✅ Seed data created successfully!');
    console.log('Test users:');
    console.log(`- ${user1.name} (@${user1.username}) - email: ${user1.email}`);
    console.log(`- ${user2.name} (@${user2.username}) - email: ${user2.email}`);
    console.log(`- ${user3.name} (@${user3.username}) - email: ${user3.email}`);
    console.log('\n3 conversations with messages created!');

    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err.message);
    process.exit(1);
  }
}

seedMessages();
