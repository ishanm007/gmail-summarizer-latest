import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { oauth2Client } from "../config/google";

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export async function attachUserMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.cookies?.userId as string | undefined;
    if (!userId) {
      return next();
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return next();

    // attach user to request
    req.user = user;

    // if user has refresh token, set oauth2 client credentials for downstream Google API calls
    if (user.refreshToken) {
      oauth2Client.setCredentials({ refresh_token: user.refreshToken });
    }
  } catch (err) {
    console.error("attachUserMiddleware error", err);
  }

  return next();
}
