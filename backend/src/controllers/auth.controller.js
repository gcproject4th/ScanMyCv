import ApiError from "../utils/ApiError.js";
import { signToken, getCookieOptions } from "../utils/jwt.js";
import { ENV } from "../config/ENV.js";
import User from "../models/user.model.js";
import {
  getGoogleAuthUrl,
  getGoogleUserFromCode,
  getGitHubAuthUrl,
  getGitHubUserFromCode,
} from "../services/oauthService.js";

function issueSession(res, user, rememberMe = false) {
  const token = signToken(user._id, rememberMe);
  res.cookie(ENV.cookieName, token, getCookieOptions(rememberMe));
  return token;
}

async function handleOAuthUser({ provider, providerId, email, name, avatar }) {
  // 1. Check if user already exists by providerId
  const providerQuery =
    provider === "google" ? { googleId: providerId } : { githubId: providerId };
  let user = await User.findOne(providerQuery);

  if (!user) {
    // 2. Check if user exists by email (safe account linking)
    user = await User.findOne({ email });
    if (user) {
      if (provider === "google") user.googleId = providerId;
      if (provider === "github") user.githubId = providerId;
      if (!user.avatar && avatar) user.avatar = avatar;
      await user.save();
    } else {
      // 3. New user signup via OAuth
      user = new User({
        name,
        email,
        avatar: avatar || "",
        authProvider: provider,
        googleId: provider === "google" ? providerId : undefined,
        githubId: provider === "github" ? providerId : undefined,
      });
      await user.save();
    }
  } else {
    // User already exists with this provider ID; keep avatar up to date
    let modified = false;
    if (avatar && user.avatar !== avatar) {
      user.avatar = avatar;
      modified = true;
    }
    if (name && !user.name) {
      user.name = name;
      modified = true;
    }
    if (modified) {
      await user.save();
    }
  }

  return user;
}

const register = async (req, res) => {
  const { name, email, password } = req.body;
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw ApiError.conflict("Email already in use");
  }

  const passwordHash = await User.hashPassword(password);
  const user = new User({ name, email, password: passwordHash, authProvider: "local" });
  await user.save();
  const token = issueSession(res, user);
  res.status(201).json({ user, token });
};

const login = async (req, res) => {
  const { email, password, rememberMe = false } = req.body;
  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  // If user signed up via OAuth without a local password
  if (!user.password) {
    throw ApiError.unauthorized(
      `This account uses ${user.authProvider === "google" ? "Google" : user.authProvider === "github" ? "GitHub" : "OAuth"} sign-in. Please continue with your provider.`
    );
  }

  if (!(await user.comparePassword(password))) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const token = issueSession(res, user, Boolean(rememberMe));
  res.status(200).json({ user, token });
};

const logout = async (req, res) => {
  res.clearCookie(ENV.cookieName, {
    httpOnly: true,
    secure: ENV.isProd,
    sameSite: ENV.isProd ? "none" : "Lax",
    path: "/",
  });
  res.status(200).json({ message: "Logged out successfully" });
};

const getCurrentUser = async (req, res) => {
  res.status(200).json({ user: req.user });
};

const updateProfile = async (req, res) => {
  const { name, avatar } = req.body;
  if (name) req.user.name = name;
  if (avatar !== undefined) req.user.avatar = avatar;
  await req.user.save();
  res.status(200).json({ user: req.user });
};

const updatePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select("+password");
  if (!user) {
    throw ApiError.notFound("User not found");
  }

  // If user has no local password yet, allow setting one without currentPassword
  if (!user.password) {
    req.user.password = await User.hashPassword(newPassword);
    await req.user.save();
    return res.status(200).json({ message: "Password set successfully" });
  }

  if (!(await req.user.comparePassword(currentPassword))) {
    throw ApiError.unauthorized("Current password is incorrect");
  }

  req.user.password = await User.hashPassword(newPassword);
  await req.user.save();
  res.status(200).json({ message: "Password updated successfully" });
};

// --- Google OAuth Handlers ---
const googleAuthRedirect = (req, res) => {
  const state = req.query.state || "";
  const url = getGoogleAuthUrl(state);
  res.redirect(url);
};

const googleAuthCallback = async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    return res.redirect(
      `${ENV.clientUrl}/login?error=${encodeURIComponent(error || "Google login cancelled")}`
    );
  }

  try {
    const profile = await getGoogleUserFromCode(code);
    const user = await handleOAuthUser({
      provider: "google",
      providerId: profile.providerId,
      email: profile.email,
      name: profile.name,
      avatar: profile.avatar,
    });

    const token = issueSession(res, user);
    return res.redirect(`${ENV.clientUrl}/auth/callback?token=${token}`);
  } catch (err) {
    console.error("Google OAuth error:", err);
    return res.redirect(
      `${ENV.clientUrl}/login?error=${encodeURIComponent(err.message || "Failed to sign in with Google")}`
    );
  }
};

// --- GitHub OAuth Handlers ---
const githubAuthRedirect = (req, res) => {
  const state = req.query.state || "";
  const url = getGitHubAuthUrl(state);
  res.redirect(url);
};

const githubAuthCallback = async (req, res) => {
  const { code, error, error_description } = req.query;
  if (error || !code) {
    return res.redirect(
      `${ENV.clientUrl}/login?error=${encodeURIComponent(error_description || error || "GitHub login cancelled")}`
    );
  }

  try {
    const profile = await getGitHubUserFromCode(code);
    const user = await handleOAuthUser({
      provider: "github",
      providerId: profile.providerId,
      email: profile.email,
      name: profile.name,
      avatar: profile.avatar,
    });

    const token = issueSession(res, user);
    return res.redirect(`${ENV.clientUrl}/auth/callback?token=${token}`);
  } catch (err) {
    console.error("GitHub OAuth error:", err);
    return res.redirect(
      `${ENV.clientUrl}/login?error=${encodeURIComponent(err.message || "Failed to sign in with GitHub")}`
    );
  }
};

export {
  register,
  login,
  logout,
  getCurrentUser,
  updateProfile,
  updatePassword,
  googleAuthRedirect,
  googleAuthCallback,
  githubAuthRedirect,
  githubAuthCallback,
};
