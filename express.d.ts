import "express";

declare global {
  namespace Express {
    interface User {
      userId: string;
      name: string;
      email: string;
    }

    interface Request {
      user: User;
    }
  }
}

export {};
