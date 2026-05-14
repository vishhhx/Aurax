import { compare, hash, genSalt } from "bcrypt";

export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = await genSalt(10);
  const hashedPassword = await hash(password, saltRounds);
  return hashedPassword;
};

export const comparePassword = async (
  password: string,
  hashedPassword: string,
): Promise<boolean> => {
  return await compare(password, hashedPassword);
};
