import "dotenv/config";

import pgvector from "@prisma/orm-extension-pgvector/runtime";
import postgres from "@prisma/orm-postgres/runtime";

import type { Contract } from "./contract.d";
import contractJson from "./contract.json" with { type: "json" };

export const db = postgres<Contract>({
  contractJson,
  extensions: [pgvector],
  url: process.env["DATABASE_URL"]!,
});