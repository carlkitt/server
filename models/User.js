const mongoose = require('mongoose');

const LocationSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], default: 'Point' },
  coordinates: { type: [Number], default: [0, 0] } // [lng, lat]
});

const UserSchema = new mongoose.Schema({
  // ── Core ───────────────────────────────────────────────────────────────
  name:             { type: String, required: true },
  username:         { type: String, required: true, unique: true },
  email:            { type: String, required: true, unique: true },
  password:         { type: String, required: true },
  profilePicture:   { type: String },
  coverPhoto:       { type: String },
  verified:         { type: Boolean, default: false },

  // ── Personal details ───────────────────────────────────────────────────
  bio:                  { type: String },
  phone:                { type: String },
  website:              { type: String },
  gender:               { type: String },
  relationshipStatus:   { type: String },
  birthday:             { type: Date },
  languages:            { type: String },
  interests:            { type: String },

  // ── Location ───────────────────────────────────────────────────────────
  location:     { type: LocationSchema, index: '2dsphere' },
  locationName: { type: String },
  hometown:     { type: String },

  // ── Education ──────────────────────────────────────────────────────────
  educationSchool: { type: String },
  educationLevel:  { type: String },
  educationYear:   { type: String },

  // ── Work ───────────────────────────────────────────────────────────────
  employer:  { type: String },
  jobTitle:  { type: String },

  // ── Skills & ratings ───────────────────────────────────────────────────
  skills:  [{ type: String }],
  rating:  { type: Number, default: 5 },

  // ── Social graph ───────────────────────────────────────────────────────
  followersCount: { type: Number, default: 0 },
  followingCount: { type: Number, default: 0 },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  createdAt: { type: Date, default: Date.now }
});

// ── Virtual: profile completion percentage ─────────────────────────────────
UserSchema.virtual('completionPercent').get(function () {
  const fields = [
    this.bio, this.phone, this.website, this.gender, this.relationshipStatus,
    this.birthday, this.languages, this.interests,
    this.locationName, this.hometown,
    this.educationSchool, this.educationLevel,
    this.employer, this.jobTitle,
  ];
  const skillsFilled = this.skills && this.skills.length > 0 ? 1 : 0;
  const filled = fields.filter(f => f !== undefined && f !== null && f !== '').length + skillsFilled;
  return Math.round((filled / (fields.length + 1)) * 100);
});

UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', UserSchema);