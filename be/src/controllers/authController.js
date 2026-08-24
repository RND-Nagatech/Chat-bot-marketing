const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const mapAuthUser = (user) => {
  const kodeSales = user.kode_sales || user._id.toString();
  const namaSales = user.nama_sales && user.nama_sales !== '-' ? user.nama_sales : user.email;

  return {
    id: kodeSales,
    user_id: user._id,
    email: user.email,
    nama_sales: namaSales,
    kode_sales: kodeSales
  };
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const authUser = mapAuthUser(user);
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        nama_sales: authUser.nama_sales,
        kode_sales: authUser.kode_sales,
        salesId: authUser.kode_sales
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    logger.info(`User logged in: ${email}`);

    res.json({
      success: true,
      token,
      user: authUser
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.register = async (req, res) => {
  try {
    const { email, password, nama_sales: namaSales, kode_sales: kodeSales } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    const user = new User({
      email,
      password,
      nama_sales: (namaSales || email).toString().trim(),
      kode_sales: kodeSales ? kodeSales.toString().trim() : undefined
    });
    await user.save();

    const authUser = mapAuthUser(user);
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        nama_sales: authUser.nama_sales,
        kode_sales: authUser.kode_sales,
        salesId: authUser.kode_sales
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    logger.info(`New user registered: ${email}`);

    res.status(201).json({
      success: true,
      token,
      user: authUser
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};
