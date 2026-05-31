const User = require('../models/User');
const { uploadBase64Image } = require('../config/cloudinary');
const notificationController = require('./notificationController');

exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ msg: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const updates = req.body;
    delete updates.password;
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, username, bio, phone, location, locationName, skills } = req.body;
    const userId = req.userId; // From auth middleware

    console.log('📝 updateProfile request body:', JSON.stringify(req.body, null, 2));
    console.log(`   locationName received: "${locationName}"`);
    console.log(`   location received: "${location}"`);

    // Validate input
    if (!name || !username) {
      return res.status(400).json({ message: 'Name and username are required' });
    }

    // Check if username is already taken by another user
    const existingUser = await User.findOne({ 
      username: username,
      _id: { $ne: userId }
    });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    // Prepare update object
    const updateData = {
      name,
      username,
      bio: bio || '',
      phone: phone || '',
      skills: skills || []
    };

    // Parse location if provided
    // Expected format: "lat,lng"
    if (location) {
      const coords = location.split(',').map(coord => parseFloat(coord.trim()));
      const lat = coords[0];
      const lng = coords[1];
      
      console.log(`📍 Parsing location: ${location}`);
      console.log(`   Coords: lat=${lat}, lng=${lng}`);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        updateData.location = {
          type: 'Point',
          coordinates: [lng, lat] // GeoJSON format: [longitude, latitude]
        };
        console.log(`✅ Location coordinates saved: ${JSON.stringify(updateData.location)}`);
      } else {
        console.log(`❌ Invalid coordinates: lat=${lat}, lng=${lng}`);
      }
    }

    // Save location name if provided
    if (locationName && locationName.trim()) {
      updateData.locationName = locationName.trim();
      console.log(`✅ Location name saved: ${locationName}`);
    }

    console.log('📦 updateData before save:', JSON.stringify(updateData, null, 2));

    // Update user profile
    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log(`✅ Profile updated for user ${userId}`);
    console.log('✅ User after update:', JSON.stringify(user, null, 2));
    res.json(user);
  } catch (err) {
    console.error('updateProfile error:', err);
    res.status(500).json({ message: 'Failed to update profile' });
  }
};

exports.uploadAvatar = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const userId = req.userId; // From auth middleware
    console.log(`📸 uploadAvatar request from user ${userId}`);

    // Convert buffer to base64
    const base64 = req.file.buffer.toString('base64');
    const filename = `avatar_${userId}_${Date.now()}`;

    // Upload to Cloudinary
    console.log(`⬆️ Uploading to Cloudinary with filename: ${filename}`);
    const result = await uploadBase64Image(base64, filename);
    
    if (!result || !result.secure_url) {
      console.error('❌ Cloudinary upload failed:', result);
      return res.status(500).json({ message: 'Failed to upload image to Cloudinary' });
    }

    console.log(`✅ Cloudinary upload successful: ${result.secure_url}`);

    // Update user's profile picture in database
    const user = await User.findByIdAndUpdate(
      userId,
      { profilePicture: result.secure_url },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log(`✅ User profile picture updated in database`);
    res.json(user);
  } catch (err) {
    console.error('uploadAvatar error:', err);
    res.status(500).json({ message: 'Failed to upload avatar' });
  }
};

exports.uploadCoverPhoto = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const userId = req.userId; // From auth middleware
    console.log(`🖼️ uploadCoverPhoto request from user ${userId}`);

    // Convert buffer to base64
    const base64 = req.file.buffer.toString('base64');
    const filename = `cover_${userId}_${Date.now()}`;

    // Upload to Cloudinary
    console.log(`⬆️ Uploading to Cloudinary with filename: ${filename}`);
    const result = await uploadBase64Image(base64, filename);
    
    if (!result || !result.secure_url) {
      console.error('❌ Cloudinary upload failed:', result);
      return res.status(500).json({ message: 'Failed to upload image to Cloudinary' });
    }

    console.log(`✅ Cloudinary upload successful: ${result.secure_url}`);

    // Update user's cover photo in database
    const user = await User.findByIdAndUpdate(
      userId,
      { coverPhoto: result.secure_url },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log(`✅ User cover photo updated in database`);
    res.json(user);
  } catch (err) {
    console.error('uploadCoverPhoto error:', err);
    res.status(500).json({ message: 'Failed to upload cover photo' });
  }
};

exports.followUser = async (req, res) => {
  try {
    const currentUserId = req.userId; // User making the request
    const { id: targetUserId } = req.params; // User to follow

    if (currentUserId === targetUserId) {
      return res.status(400).json({ message: 'Cannot follow yourself' });
    }

    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findById(targetUserId);

    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Initialize arrays if they don't exist
    if (!currentUser.following) currentUser.following = [];
    if (!targetUser.followers) targetUser.followers = [];

    // Check if already following
    if (currentUser.following.some(id => id.toString() === targetUserId)) {
      return res.status(400).json({ message: 'Already following this user' });
    }

    // Add to following list
    currentUser.following.push(targetUserId);
    currentUser.followingCount = currentUser.following.length;

    // Add to followers list
    targetUser.followers.push(currentUserId);
    targetUser.followersCount = targetUser.followers.length;

    await currentUser.save();
    await targetUser.save();

    // Create notification
    await notificationController.notifyFollow(targetUserId, currentUserId);

    res.json({ message: 'User followed successfully' });
  } catch (err) {
    console.error('followUser error:', err);
    res.status(500).json({ message: 'Failed to follow user' });
  }
};

exports.unfollowUser = async (req, res) => {
  try {
    const currentUserId = req.userId;
    const { id: targetUserId } = req.params;

    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findById(targetUserId);

    if (!currentUser) {
      return res.status(404).json({ message: 'Current user not found' });
    }

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Initialize arrays if they don't exist
    if (!currentUser.following) currentUser.following = [];
    if (!targetUser.followers) targetUser.followers = [];

    // Remove from following list
    currentUser.following = currentUser.following.filter(id => id.toString() !== targetUserId);
    currentUser.followingCount = currentUser.following.length;

    // Remove from followers list
    targetUser.followers = targetUser.followers.filter(id => id.toString() !== currentUserId);
    targetUser.followersCount = targetUser.followers.length;

    await currentUser.save();
    await targetUser.save();

    res.json({ message: 'User unfollowed successfully' });
  } catch (err) {
    console.error('unfollowUser error:', err);
    res.status(500).json({ message: 'Failed to unfollow user' });
  }
};

exports.isFollowing = async (req, res) => {
  try {
    const currentUserId = req.userId;
    const { id: targetUserId } = req.params;

    const currentUser = await User.findById(currentUserId);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isFollowing = currentUser.following && currentUser.following.length > 0
      ? currentUser.following.some(id => id.toString() === targetUserId)
      : false;

    res.json({ isFollowing });
  } catch (err) {
    console.error('isFollowing error:', err);
    res.status(500).json({ message: 'Failed to check follow status' });
  }
};

