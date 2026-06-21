import fs from "fs";
import path from "path";

const TOKEN_PATH = path.join(process.cwd(), "tokens.json");

export function saveTokens(tokens: any) {
  fs.writeFileSync(
    TOKEN_PATH,
    JSON.stringify(tokens, null, 2)
  );
}

export function loadTokens() {
  if (!fs.existsSync(TOKEN_PATH)) {
    return null;
  }

  const data = fs.readFileSync(TOKEN_PATH, "utf8");
  return JSON.parse(data);
}