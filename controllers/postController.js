const Post = require('../models/Post');
const fs = require('fs');
const path = require('path');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Function to save base64 image and return URL
const saveBase64Image = (base64String, filename) => {
  try {
    // Remove data URI prefix if present
    const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const filepath = path.join(uploadsDir, filename);
    fs.writeFileSync(filepath, buffer);
    return `/uploads/${filename}`;
  } catch (err) {
    console.error('Error saving image:', err);
    return null;
  }
};

exports.createPost = async (req, res) => {
  try {
    const { type, content, images, location, skills } = req.body;
    
    // Process images - save base64 images to disk
    const imageUrls = [];
    if (Array.isArray(images) && images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        const timestamp = Date.now();
        const filename = `post_${req.userId}_${timestamp}_${i}.jpg`;
        const imageUrl = saveBase64Image(images[i], filename);
        if (imageUrl) {
          imageUrls.push(imageUrl);
        }
      }
    }
    
    const skillArray = Array.isArray(skills) ? skills : [];
    const post = new Post({ 
      userId: req.userId, 
      type, 
      content, 
      images: imageUrls,
      skills: skillArray,
      location 
    });
    await post.save();
    
    // Populate user data before sending response
    await post.populate('userId', 'name username avatar email');
    
    res.status(201).json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
};

exports.listPosts = async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('userId', 'name username avatar email') // Populate user data
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};
