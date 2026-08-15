const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, USER_STATUS } = require('../utils/constants');

const userSchema = new mongoose.Schema(
  {
    // null only for a PLATFORM_ADMIN, who sits above all tenants.
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // `select: false` so a stray `User.find()` can never serialise the hash.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), required: true },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
    },
    lastLoginAt: { type: Date, default: null },

    // Only the hash of the emailed token is kept.
    resetTokenHash: { type: String, default: null, select: false },
    resetTokenExpiresAt: { type: Date, default: null, select: false },
    inviteTokenHash: { type: String, default: null, select: false },
    inviteTokenExpiresAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

// The members list is always "this org's users", so lead with organization.
userSchema.index({ organization: 1, role: 1 });
userSchema.index({ organization: 1, createdAt: -1 });

userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
};

userSchema.methods.checkPassword = function checkPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    status: this.status,
    organization: this.organization,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
