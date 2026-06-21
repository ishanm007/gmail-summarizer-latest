import express from "express";
import { getUnreadEmails } from "../services/gmailService";
import { summarizeEmails } from "../services/openaiService";

const router = express.Router();

router.get("/dashboard", async (req, res) => {
  try {
    const result = await getUnreadEmails(1, 10);
    const emails = Array.isArray(result) ? (result[0]?.emails || []) : (result.emails || []);

    const summary = await summarizeEmails(emails);

    res.json({
      success: true,
      unreadCount: emails.length,
      summary,
      emails,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to load dashboard"
    });
  }
});

export default router;