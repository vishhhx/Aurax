import mongoose, { Schema, Document, model, Model } from "mongoose";

interface IAuth extends Document {
  email: string;
  passwordHash?: string;

  isEmailVerified: boolean;

  status: "ACTIVE" | "BLOCKED" | "SUSPENDED";

  twoFactorEnabled: boolean;

  refreshTokenHash?: string;

  failedLoginAttempts: number;

  lastLogin?: Date;

  provider: "local" | "google";
}

const authSchema = new Schema<IAuth>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please fill a valid email address",
      ],
    },

    passwordHash: {
      type: String,
      required: function (this: IAuth) {
        return this.provider === "local";
      },
      trim: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "BLOCKED", "SUSPENDED"],
      default: "ACTIVE",
    },

    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },

    refreshTokenHash: {
      type: String,
      default: null,
    },

    failedLoginAttempts: {
      type: Number,
      default: 0,
    },

    lastLogin: {
      type: Date,
      default: null,
    },

    provider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
  },
  {
    timestamps: true,
  },
);

export const AuthModel: Model<IAuth> =
  mongoose.models.Auth || model<IAuth>("Auth", authSchema);
