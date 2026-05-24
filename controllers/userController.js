const User = require('../models/User');

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
