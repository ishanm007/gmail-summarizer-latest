import express from "express";
import { google } from "googleapis";
import { upsertUser } from "../services/userService";
import { oauth2Client } from "../config/google";
import { saveTokens } from "../utils/tokenstorage";
import { upsertAccount } from "../services/accountService";

const router = express.Router();

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",

  // Allows reading + modifying Gmail messages.
  // Needed for archiving/removing blocked newsletter emails from Inbox.
  "https://www.googleapis.com/auth/gmail.modify",

  // Needed for creating Gmail filters, so future emails from an unsubscribed sender
  // skip the Inbox and do not show inside this app.
  "https://www.googleapis.com/auth/gmail.settings.basic",
];

router.get("/google", (req, res) => {
  const consent =
    req.query.consent === "1" || req.query.consent === "true" ? "1" : "0";

  const state = Buffer.from(JSON.stringify({ consent })).toString("base64");

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    include_granted_scopes: true,
    state,
  });

  res.redirect(url);
});

router.get("/google/callback", async (req, res) => {
  try {
    const code = req.query.code as string;

    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);

    saveTokens(tokens);

    const oauth2 = google.oauth2({
      version: "v2",
      auth: oauth2Client,
    });

    const userInfo = await oauth2.userinfo.get();

    const email = userInfo.data.email!;
    const providerAccountId = userInfo.data.id || email;
    const name = userInfo.data.name || userInfo.data.given_name || null;
    const picture = userInfo.data.picture || null;

    let aiConsent = false;
    try {
      const raw = req.query.state as string | undefined;
      if (raw) {
        const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
        aiConsent = parsed?.consent === "1";
      }
    } catch {
      // ignore invalid state
    }

    const user = await upsertUser({
      email,
      refreshToken: tokens.refresh_token || undefined,
      aiConsent,
      name,
      picture,
    });

    await upsertAccount({
      userId: user.id,
      provider: "google",
      providerAccountId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    });

    res.cookie("userId", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });

    res.redirect(process.env.FRONTEND_URL || "http://localhost:3000");
  } catch (error) {
    console.error("AUTH ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Authentication failed",
    });
  }
});

router.get("/me", async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: (user as any).name || null,
        picture: (user as any).picture || null,
        aiConsent: (user as any).aiConsent,
        plan: user.plan,
      },
    });
  } catch (err) {
    console.error("/me error", err);
    return res.status(500).json({
      success: false,
      message: "Failed to get user",
    });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("userId");
  return res.json({ success: true, message: "Logged out" });
});

export default router;
