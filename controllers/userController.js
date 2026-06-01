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

// ── getMe ──────────────────────────────────────────────────────────────────
// Get current authenticated user's profile (used by refreshUser in AuthProvider)
exports.getMe = async (req, res) => {
  try {
    const userId = req.userId; // From auth middleware
    console.log(`📥 getMe called for user: ${userId}`);

    if (!userId) {
      console.error('❌ getMe: userId not found in request');
      return res.status(401).json({ msg: 'Unauthorized - no user ID' });
    }

    const user = await User.findById(userId).select('-password');
    if (!user) {
      console.error(`❌ getMe: User ${userId} not found in database`);
      return res.status(404).json({ msg: 'User not found' });
    }

    console.log(`✅ getMe: Successfully fetched user ${userId}`);
    res.json(user);
  } catch (err) {
    console.error('❌ getMe error:', err.message);
    res.status(500).json({ msg: 'Server error fetching user profile' });
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

// ── updateProfile ──────────────────────────────────────────────────────────
// Handles both the original "edit profile" fields AND the new extended
// personal-info fields from ProfileCompletionScreen.
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.userId; // From auth middleware

    const {
      // Original fields
      name, username, bio, phone, location, locationName, skills,
      // New extended fields
      website, gender, relationshipStatus, birthday,
      languages, interests, hometown,
      educationSchool, educationLevel, educationYear,
      employer, jobTitle,
    } = req.body;

    console.log('📝 updateProfile request body:', JSON.stringify(req.body, null, 2));

    // name + username are required only when sent (edit-profile flow)
    if (name !== undefined && !name) {
      return res.status(400).json({ message: 'Name cannot be empty' });
    }
    if (username !== undefined && !username) {
      return res.status(400).json({ message: 'Username cannot be empty' });
    }

    // Username uniqueness check
    if (username) {
      const existing = await User.findOne({ username, _id: { $ne: userId } });
      if (existing) {
        return res.status(400).json({ message: 'Username already taken' });
      }
    }

    // Build update object — only include keys that were actually sent
    const updateData = {};

    // ── Core ──────────────────────────────────────────────────────────────
    if (name       !== undefined) updateData.name     = name;
    if (username   !== undefined) updateData.username = username;
    if (skills     !== undefined) updateData.skills   = skills;

    // ── Personal ─────────────────────────────────────────────────────────
    if (bio                !== undefined) updateData.bio                = bio || '';
    if (phone              !== undefined) updateData.phone              = phone || '';
    if (website            !== undefined) updateData.website            = website || '';
    if (gender             !== undefined) updateData.gender             = gender || '';
    if (relationshipStatus !== undefined) updateData.relationshipStatus = relationshipStatus || '';
    if (languages          !== undefined) updateData.languages          = languages || '';
    if (interests          !== undefined) updateData.interests          = interests || '';
    if (birthday           !== undefined && birthday !== '') {
      updateData.birthday = new Date(birthday);
    }

    // ── Location ──────────────────────────────────────────────────────────
    if (locationName !== undefined) updateData.locationName = locationName.trim();
    if (hometown     !== undefined) updateData.hometown     = hometown || '';
    if (location) {
      const coords = location.split(',').map(c => parseFloat(c.trim()));
      const [lat, lng] = coords;
      if (!isNaN(lat) && !isNaN(lng)) {
        updateData.location = { type: 'Point', coordinates: [lng, lat] };
      }
    }

    // ── Education ─────────────────────────────────────────────────────────
    if (educationSchool !== undefined) updateData.educationSchool = educationSchool || '';
    if (educationLevel  !== undefined) updateData.educationLevel  = educationLevel  || '';
    if (educationYear   !== undefined) updateData.educationYear   = educationYear   || '';

    // ── Work ─────────────────────────────────────────────────────────────
    if (employer !== undefined) updateData.employer = employer || '';
    if (jobTitle !== undefined) updateData.jobTitle = jobTitle || '';

    console.log('📦 updateData:', JSON.stringify(updateData, null, 2));

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    console.log(`✅ Profile updated for user ${userId} — completion: ${user.completionPercent}%`);

    // ── Send profile-completion notification if this is the first time
    // the user fills in substantial personal info and completion crosses 30%
    const prevCompletion = req.body._prevCompletion; // optionally sent by client
    if (user.completionPercent >= 30 && (!prevCompletion || prevCompletion < 30)) {
      try {
        await notificationController.notifyProfileCompletion(userId, user.completionPercent);
      } catch (notifErr) {
        console.warn('Could not send profile-completion notification:', notifErr.message);
      }
    }

    res.json(user);
  } catch (err) {
    console.error('updateProfile error:', err);
    res.status(500).json({ message: 'Failed to update profile' });
  }
};

// ── uploadAvatar ───────────────────────────────────────────────────────────
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const userId = req.userId;
    const base64   = req.file.buffer.toString('base64');
    const filename = `avatar_${userId}_${Date.now()}`;
    const result   = await uploadBase64Image(base64, filename);
    if (!result?.secure_url) return res.status(500).json({ message: 'Cloudinary upload failed' });

    const user = await User.findByIdAndUpdate(
      userId, { profilePicture: result.secure_url }, { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user);
  } catch (err) {
    console.error('uploadAvatar error:', err);
    res.status(500).json({ message: 'Failed to upload avatar' });
  }
};

// ── uploadCoverPhoto ───────────────────────────────────────────────────────
exports.uploadCoverPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const userId = req.userId;
    const base64   = req.file.buffer.toString('base64');
    const filename = `cover_${userId}_${Date.now()}`;
    const result   = await uploadBase64Image(base64, filename);
    if (!result?.secure_url) return res.status(500).json({ message: 'Cloudinary upload failed' });

    const user = await User.findByIdAndUpdate(
      userId, { coverPhoto: result.secure_url }, { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user);
  } catch (err) {
    console.error('uploadCoverPhoto error:', err);
    res.status(500).json({ message: 'Failed to upload cover photo' });
  }
};

// ── followUser ─────────────────────────────────────────────────────────────
exports.followUser = async (req, res) => {
  try {
    const currentUserId  = req.userId;
    const { id: targetUserId } = req.params;

    if (currentUserId === targetUserId)
      return res.status(400).json({ message: 'Cannot follow yourself' });

    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(targetUserId),
    ]);
    if (!currentUser) return res.status(404).json({ message: 'Current user not found' });
    if (!targetUser)  return res.status(404).json({ message: 'User not found' });

    currentUser.following = currentUser.following || [];
    targetUser.followers  = targetUser.followers  || [];

    if (currentUser.following.some(id => id.toString() === targetUserId))
      return res.status(400).json({ message: 'Already following this user' });

    currentUser.following.push(targetUserId);
    currentUser.followingCount = currentUser.following.length;
    targetUser.followers.push(currentUserId);
    targetUser.followersCount = targetUser.followers.length;

    await Promise.all([currentUser.save(), targetUser.save()]);
    await notificationController.notifyFollow(targetUserId, currentUserId);

    res.json({ message: 'User followed successfully' });
  } catch (err) {
    console.error('followUser error:', err);
    res.status(500).json({ message: 'Failed to follow user' });
  }
};

// ── unfollowUser ───────────────────────────────────────────────────────────
exports.unfollowUser = async (req, res) => {
  try {
    const currentUserId        = req.userId;
    const { id: targetUserId } = req.params;

    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(targetUserId),
    ]);
    if (!currentUser) return res.status(404).json({ message: 'Current user not found' });
    if (!targetUser)  return res.status(404).json({ message: 'User not found' });

    currentUser.following = (currentUser.following || []).filter(id => id.toString() !== targetUserId);
    currentUser.followingCount = currentUser.following.length;
    targetUser.followers  = (targetUser.followers  || []).filter(id => id.toString() !== currentUserId);
    targetUser.followersCount  = targetUser.followers.length;

    await Promise.all([currentUser.save(), targetUser.save()]);
    res.json({ message: 'User unfollowed successfully' });
  } catch (err) {
    console.error('unfollowUser error:', err);
    res.status(500).json({ message: 'Failed to unfollow user' });
  }
};

// ── isFollowing ────────────────────────────────────────────────────────────
exports.isFollowing = async (req, res) => {
  try {
    const currentUserId        = req.userId;
    const { id: targetUserId } = req.params;

    const currentUser = await User.findById(currentUserId);
    if (!currentUser) return res.status(404).json({ message: 'User not found' });

    const isFollowing = (currentUser.following || []).some(id => id.toString() === targetUserId);
    res.json({ isFollowing });
  } catch (err) {
    console.error('isFollowing error:', err);
    res.status(500).json({ message: 'Failed to check follow status' });
  }
};