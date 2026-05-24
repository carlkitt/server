const cloudinary = require('cloudinary').v2;

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Function to upload base64 image to Cloudinary
const uploadBase64Image = async (base64String, filename) => {
  try {
    // If missing Cloudinary credentials, log warning and return null
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      console.warn('Cloudinary credentials not configured. Using fallback.');
      return null;
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(`data:image/jpeg;base64,${base64String}`, {
      public_id: filename,
      folder: 'skilllink/posts',
      resource_type: 'auto',
    });

    return result.secure_url;
  } catch (err) {
    console.error('Error uploading to Cloudinary:', err);
    return null;
  }
};

module.exports = {
  uploadBase64Image,
  cloudinary,
};
