const express = require("express");
const authRouter = express.Router();
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const otpGenerator = require("otp-generator");
const nodemailer = require("nodemailer");
const OTPSchema = require("../models/otp_model");

const User = require("../models/user_model");
const auth = require("../middlewares/auth_middleware");
const AdminAuthPin = require("../models/admin_auth_pin_model");
var expiryDate = Date.now() + 120000;
let transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    type: "OAuth2",
    user: "adedayoniyio@gmail.com",
    pass: "pass",
    clientId: process.env.OAUTH_CLIENT_ID,
    clientSecret: process.env.OAUTH_CLIENT_SECRET,
    refreshToken: process.env.OAUTH_REFRESH_TOKEN,
  },
  tls: {
    rejectUnauthorized: false,
  },
});
const code = otpGenerator.generate(6, {
  lowerCaseAlphabets: false,
  upperCaseAlphabets: false,
  upperCase: false,
  specialChars: false,
  alphabets: false,
  digits: true,
});
authRouter.post("/api/createUser", async (req, res) => {
  try {
    const { fullname, username, email, password } = req.body;
    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(400).json({
        status: false,
        message: "User already exists",
      });
    }
    const hashedPassword = await bcryptjs.hash(password, 8);
    let user = new User({
      fullname,
      username,
      email,
      password: hashedPassword,
    });
    user = await user.save();
    return res.status(201).json({
      message: "User created successfully",
      message: user,
    });
  } catch (e) {
    return res.status(500).json({
      message: `Unable to create user. Please try again.\n Error:${e}`,
    });
  }
});
authRouter.post("/api/signUpVerification", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    let mailOptions = {
      from: "adedayoniyio@gmail.com",
      to: email,
      subject: "OTP To Complete Your Signup",
      html: `<html> <h1>Hi,</h1> <br/><p style="color:grey; font-size:1.2em">Please use the below OTP code to complete your account setup on My App</p><br><br><h1 style="color:orange">${code}</h1></html>`,
    };
    console.log(`DATE: ${expiryDate}`);
    await transporter.sendMail(mailOptions);
    await OTPSchema.create({
      email: email,
      otp: code,
      expiry: expiryDate,
    });
    setTimeout(async () => {
      await OTPSchema.deleteOne({ email: email, otp: code });
      console.log("OTP deleted successfully");
    }, expiryDate - Date.now());

    return res.status(200).json({
      message: "OTP has been sent to the provided email.",
    });
  } catch (e) {
    return res.status(500).json({
      message: `Unknown error occured:${e}`,
    });
  }
});
authRouter.post("/api/verifyOtp", async (req, res) => {
  try {
    const { email, otpCode } = req.body;
    const otpData = await OTPSchema.findOne({ email });
    console.log(`Otp expiry is: ${otpData.expiry}`);
    if (otpData) {
      const otpExpiry = otpData.expiry;
      if (Date.now() > otpExpiry) {
        return res.status(400).json({
          status: "failed",
          message: "Sorry this otp has expired!",
        });
      } else {
        const rOtp = otpData.otp;
        console.log(`OTP code is: ${otpExpiry}`);
        if (otpCode == rOtp) {
          return res.status(200).json({
            status: "success",
            message: "OTP successfully confirmed!. Please Login",
          });
        } else {
          return res
            .status(400)
            .json({ message: "Wrong OTP code. Please try again" });
        }
      }
    } else {
      return res.status(400).json({ message: "User no otp" });
    }
  } catch (e) {
    res
      .status(500)
      .json({ message: "Cannot verify otp at this moment. Try Again" });
  }
});

authRouter.post("/api/login", async (req, res) => {
  try {
    const { username, password, deviceToken } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(409).json({
        status: false,
        message: "This user does not exist",
      });
    }
    const isMatch = await bcryptjs.compare(password, user.password);
    if (!isMatch) {
      return res.status(409).json({
        status: false,
        message: "Incorrect password",
      });
    }
    const token = await jwt.sign({ id: user._id }, process.env.TOKEN_STRING);
    await User.findOneAndUpdate(
      { username },
      { deviceToken: deviceToken },
      { new: true }
    );
    res.status(201).json({
      token,
      ...user._doc,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

authRouter.post("/checkToken", auth, async (req, res) => {
  const token = req.header("x-auth-token");
  if (token) {
    try {
      const { id } = jwt.verify(token, process.env.TOKEN_STRING);
      const user = await User.findById(id);
      if (user) {
        return res.json(true);
      }
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  }
  return res.json(false);
});

authRouter.get("/", auth, async (req, res) => {
  const user = await User.findById(req.user);
  res.json({ ...user._doc, token: req.token });
});

authRouter.post("/api/forgortPassword", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    let mailOptions = {
      from: "adedayoniyio@gmail.com",
      to: email,
      subject: "OTP To Change Your Password",
      html: `<html> <h1>Hi,</h1> <br/><p style="color:grey; font-size:1.2em">Please use the below OTP code to change your password</p><br><br><h1 style="color:orange">${code}</h1></html>`,
    };

    console.log(`DATE: ${expiryDate}`);

    await transporter.sendMail(mailOptions);
    await OTPSchema.create({
      email: email,
      otp: code,
      expiry: expiryDate,
    });
    setTimeout(async () => {
      // Delete the document with the matching email and otp
      await OTPSchema.deleteOne({ email: email, otp: code });
      console.log("OTP deleted successfully");
    }, expiryDate - Date.now());

    return res.status(200).json({
      message: "OTP has been sent to the provided email.",
    });
  } catch (e) {
    return res.status(500).json({
      message: `Unknown error occured:${e}`,
    });
  }
});

// This endpoint should only be used once the forgort password returns a 200 OK
authRouter.post("/api/changePassword/:email", async (req, res) => {
  try {
    const { email } = req.params.email;
    const { password, confirmPassword } = req.body;
    const hashedPassword = await bcryptjs.hash(password, 8);
    const hashedConfirmPassword = await bcryptjs.hash(confirmPassword, 8);
    const isMatch = await bcryptjs.compare(
      hashedPassword,
      hashedConfirmPassword
    );
    if (!isMatch) {
      res.status(400).json({ message: "Passwords do not match" });
    }
    await User.findOneAndUpdate({ email }, { password: hashedPassword });
    res.status(200).json({ message: "Password changed successfully" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

authRouter.get("/api/getUsername/:username", auth, async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username });
    if (!user) {
      return res
        .status(200)
        .json({ message: `${username} username is available` });
    }
    res.status(400).json({ message: "This username has been taken" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

authRouter.get(
  "/api/getUsernameFortransfer/:username",
  auth,
  async (req, res) => {
    try {
      const { username } = req.params;
      const user = await User.findOne({ username });
      if (user) {
        return res.status(200).json({ message: user.fullname });
      }
      res
        .status(400)
        .json({ message: "Invalid username, please check and try again" });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

authRouter.post("/api/createLoginPin/:username", auth, async (req, res) => {
  try {
    const { username } = req.params;
    const { pin } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: `User ${username} is not found` });
    }
    const pinEncrypt = await bcryptjs.hash(pin, 8);
    await User.findOneAndUpdate({ username }, { pin: pinEncrypt });
    res.status(200).json({ message: "Pin created successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

authRouter.post("/api/loginUsingPin/:username", auth, async (req, res) => {
  try {
    const { username } = req.params;
    const { pin } = req.body;
    const user = await User.findOne({ username });
    const isPinCorrect = await bcryptjs.compare(pin, user.pin);
    if (!isPinCorrect) {
      return res.status(400).json({ message: "Incorrect Pin. Try again!" });
    }
    res.status(200).json({ message: "Login Successful" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

authRouter.post("/api/changePin/:username", auth, async (req, res) => {
  try {
    const { username } = req.params;
    const { oldPin, newPin } = req.body;
    const user = await User.findOne({ username });
    const isPinCorrect = await bcryptjs.compare(oldPin, user.pin);
    if (!isPinCorrect) {
      return res.status(400).json({ message: "Incorrect Pin. Try again!" });
    }

    const encryptNewPin = await bcryptjs.hash(newPin, 8);
    await User.findOneAndUpdate(
      { username },
      {
        pin: encryptNewPin,
      }
    );

    res.status(200).json({ message: "Pin changed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

authRouter.post("/admin/loginAdmin", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User Not Found" });
    }
    if (user.type != "admin" && user.type != "agent") {
      return res.status(401).json({ message: "Access Denied!" });
    }
    const isMatch = await bcryptjs.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ massage: "Incorrect Password" });
    }
    const token = await jwt.sign({ id: user._id }, process.env.TOKEN_STRING);

    res.status(200).json({
      token,
      ...user._doc,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

authRouter.post("/admin/createAuthorizationPin", async (req, res) => {
  try {
    const { adminAuthPin, admin } = req.body;
    const hashedPin = await bcryptjs.hash(adminAuthPin, 8);
    const newPin = new AdminAuthPin({
      admin: admin,
      pin: hashedPin,
    });
    await newPin.save();
    res.status(200).json({ message: "Admin Auth Pin Created Successfully" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

authRouter.post("/admin/changeAdminAuthPin", async (req, res) => {
  try {
    const { oldAdminAuthPin, newAdminAuthPin, admin } = req.body;
    const adminUsername = await AdminAuthPin.findOne({ admin: admin });
    if (!adminUsername) {
      return res.status(400).json({ message: "Admin Not found" });
    }
    const isMatch = await bcryptjs.compare(oldAdminAuthPin, adminUsername.pin);
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Incorrect Old Authorization Pin" });
    }
    await AdminAuthPin.findOneAndUpdate({ pin: newAdminAuthPin });
    res.status(200).json({ message: "Admin Auth Pin Updated Successfully" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});
module.exports = authRouter;
