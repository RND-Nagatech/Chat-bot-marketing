const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  nama_sales: {
    type: String,
    default: '-',
    trim: true,
    uppercase: true
  },
  kode_sales: {
    type: String,
    trim: true,
    uppercase: true
  }
}, {
  timestamps: true
});

userSchema.index({ kode_sales: 1 }, { unique: true, sparse: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema, 'tm_user');
