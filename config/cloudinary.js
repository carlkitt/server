const cloudinary = require('cloudinary').v2;

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Function to upload base64 image to Cloudinary
const uploadBase64Image = async (base64String, filename, mimeType = 'image/jpeg') => {
  try {
    // Normalize and log MIME type with detailed debugging
    console.log(`📤 Received MIME type: "${mimeType}" (type: ${typeof mimeType})`);
    if (mimeType) {
      console.log(`📤 MIME type length: ${mimeType.length}, charCodes: ${Array.from(mimeType).map(c => c.codePointAt(0)).join(',')}`);
    }
    
    const normalizedMimeType = mimeType ? mimeType.toLowerCase().trim() : 'image/jpeg';
    console.log(`📤 Normalized MIME type: "${normalizedMimeType}"`);
    console.log(`📤 After normalization length: ${normalizedMimeType.length}`);
    
    // Check Cloudinary credentials
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('❌ Cloudinary credentials not configured');
      console.error('   CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? '✓' : '✗');
      console.error('   API_KEY:', process.env.CLOUDINARY_API_KEY ? '✓' : '✗');
      console.error('   API_SECRET:', process.env.CLOUDINARY_API_SECRET ? '✓' : '✗');
      throw new Error('Cloudinary credentials missing');
    }

    // Validate MIME type
    const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
    console.log(`📋 Checking if "${normalizedMimeType}" is in:`, validMimeTypes);
    if (!validMimeTypes.includes(normalizedMimeType)) {
      console.error(`❌ Invalid MIME type: "${normalizedMimeType}"`);
      console.error(`📋 Character codes:`, Array.from(normalizedMimeType).map((c, i) => `${i}:${c}(${c.codePointAt(0)})`).join(' '));
      console.error(`📋 Allowed types:`, validMimeTypes);
      throw new Error(`Invalid image format. Allowed: ${validMimeTypes.join(', ')}`);
    }

    console.log(`📤 Uploading to Cloudinary with filename: ${filename}`);
    console.log(`📤 MIME type: ${normalizedMimeType}`);
    console.log(`📤 Cloud name: ${process.env.CLOUDINARY_CLOUD_NAME}`);

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(`data:${normalizedMimeType};base64,${base64String}`, {
      public_id: filename,
      folder: 'skilllink/profiles',
      resource_type: 'auto',
    });

    if (!result?.secure_url) {
      console.error('❌ Cloudinary upload returned invalid response:', result);
      throw new Error('Invalid Cloudinary response');
    }

    console.log(`✅ Successfully uploaded to Cloudinary: ${result.secure_url}`);

    // Return the full result object (not just the string)
    return result;
  } catch (err) {
    console.error('❌ Cloudinary upload error:');
    console.error('   Message:', err.message);
    console.error('   Status Code:', err.statusCode || 'N/A');
    console.error('   HTTP Status:', err.http_code || 'N/A');
    console.error('   Full error:', JSON.stringify(err, null, 2));
    throw err; // Re-throw so controller can handle it
  }
};

module.exports = {
  uploadBase64Image,
  cloudinary,
};
