export type AccessUser = {
  name: string;
  role: "owner" | "finance" | "operations";
  code: string;
};

export const accessUsers: AccessUser[] = [
  { name: "Marios", role: "owner", code: "MARIOS-2026" },
  { name: "Charalambous", role: "finance", code: "CHAR-2026" },
  { name: "Colleague", role: "operations", code: "ZYPRUS-2026" },
];

export function findAccessUser(code: string): AccessUser | undefined {
  return accessUsers.find(
    (user) => user.code.toLowerCase() === code.trim().toLowerCase()
  );
}
