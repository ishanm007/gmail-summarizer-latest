import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth";
import gmailRoutes from "./routes/gmail";
import cookieParser from "cookie-parser";
import { attachUserMiddleware } from "./middleware/authMiddleware";
import { oauth2Client } from "./config/google";
import { loadTokens } from "./utils/tokenstorage";
import dashboardRoutes from "./routes/dashboard";

dotenv.config();
const savedTokens = loadTokens();

if (savedTokens) {
  oauth2Client.setCredentials(savedTokens);
  console.log("✅ Saved Google tokens loaded");
}

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  }),
);

app.use(cookieParser());
app.use(express.json());
app.use(attachUserMiddleware);

// Auth routes
app.use("/auth", authRoutes);

// Main API routes.
// Keep root mounting for your current frontend: /emails, /usage, /onboarding/profile, etc.
app.use("/", gmailRoutes);
app.use("/", dashboardRoutes);

// Also expose the same app routes under /api so the frontend can safely fallback
// if you later decide to use NEXT_PUBLIC_API_URL=http://localhost:5000/api.
app.use("/api", gmailRoutes);
app.use("/api", dashboardRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "🚀 Gmail Summarizer API Running",
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
  });
});

// JSON 404 fallback so the frontend never receives Express HTML error pages.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

const initialPort = Number(process.env.PORT) || 5000;
const MAX_PORT_ATTEMPTS = 5;

function listenOnPort(port: number, attemptsLeft: number) {
  const server = app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
  });

  server.on("error", (error: any) => {
    if (error && error.code === "EADDRINUSE") {
      console.warn(
        `Port ${port} in use. ${
          attemptsLeft - 1 > 0 ? `Trying ${port + 1}...` : "No more attempts."
        }`,
      );

      try {
        (server as any).close?.();
      } catch (_) {}

      if (attemptsLeft > 1) {
        listenOnPort(port + 1, attemptsLeft - 1);
      } else {
        console.error("Failed to bind to a port after multiple attempts. Exiting.");
        process.exit(1);
      }
    } else {
      console.error("SERVER ERROR:", error);
    }
  });
}

listenOnPort(initialPort, MAX_PORT_ATTEMPTS);
