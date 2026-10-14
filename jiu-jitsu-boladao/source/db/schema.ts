import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";

export const lessons = sqliteTable("lessons", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  module: text("module").notNull(),
  status: text("status").notNull(),
  publishedAt: text("published_at"),
  videoKey: text("video_key"),
});

export const invites = sqliteTable("invites", {
  email: text("email").notNull(),
  course: text("course").notNull(),
  createdAt: text("created_at").notNull(),
  tokenHash: text("token_hash"),
  claimedBy: text("claimed_by"),
}, table => [primaryKey({ columns: [table.email, table.course] })]);

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordSalt: text("password_salt").notNull(),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone").notNull(),
  cpfDigest: text("cpf_digest").notNull().unique(),
  role: text("role").notNull().default("student"),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
});

export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: integer("reset_at").notNull(),
});

export const resetTokens = sqliteTable("reset_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
});

export const progress = sqliteTable("progress", {
  userId: text("user_id").notNull(),
  lessonId: text("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
}, table => [primaryKey({ columns: [table.userId, table.lessonId] })]);

export const setup = sqliteTable("setup", {
  key: text("key").primaryKey(),
});

export const coursePrices = sqliteTable("course_prices", {
  course: text("course").primaryKey(),
  amountCents: integer("amount_cents").notNull(),
});

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  providerOrderId: text("provider_order_id").unique(),
  checkoutUrl: text("checkout_url"),
  status: text("status").notNull().default("creating"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  paidAt: text("paid_at"),
}, table => [index("orders_account_status_idx").on(table.accountId, table.status)]);

export const siteContent = sqliteTable("site_content", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
