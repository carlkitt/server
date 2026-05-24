const mongoose = require('mongoose');

const LocationSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], default: 'Point' },
  coordinates: { type: [Number], default: [0, 0] } // [lng, lat]
});

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  password: { type: String, required: true },
  skills: [{ type: String }],
  profilePicture: { type: String },
  coverPhoto: { type: String },
  bio: { type: String },
  location: { type: LocationSchema, index: '2dsphere' },
  locationName: { type: String }, // Store the location name separately
  rating: { type: Number, default: 5 },
  verified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
