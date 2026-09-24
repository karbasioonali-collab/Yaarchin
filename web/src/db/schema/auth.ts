// کاربر، نقش، دسترسی، تیم، نشست و ورود دومرحله‌ای.
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  inet,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_common";

// ---------- کاربر ----------
export const users = pgTable(
  "users",
  {
    id: id(),
    fullName: text("full_name").notNull(),
    // موبایل به‌شکل استاندارد 09xxxxxxxxx ذخیره می‌شود.
    mobile: text("mobile"),
    email: text("email"),
    // فقط هش (argon2id). برای کسی که فقط با پیامک وارد می‌شود خالی است.
    passwordHash: text("password_hash"),
    status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
    mobileVerifiedAt: timestamp("mobile_verified_at", { withTimezone: true }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    // فیلدهای متغیر آینده (ترجیحات، امتیاز مشتری و …)
    meta: jsonb("meta").notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_mobile_uq").on(t.mobile).where(sql`${t.mobile} is not null`),
    uniqueIndex("users_email_uq").on(sql`lower(${t.email})`).where(sql`${t.email} is not null`),
  ],
);

// ---------- نقش و دسترسی ----------
// نقش‌های سیستمی: admin، expert، customer، company (company برای فاز ۲).
export const roles = pgTable("roles", {
  id: id(),
  key: text("key").notNull().unique(),
  nameFa: text("name_fa").notNull(),
  nameEn: text("name_en").notNull(),
  description: text("description"),
  // نقش سیستمی حذف نمی‌شود.
  isSystem: boolean("is_system").notNull().default(false),
  // بدون استفاده از 2026-09-24 (ورود دومرحله‌ای حذف شد). ستون حذف نمی‌شود (بدون migration مخرب).
  requires2fa: boolean("requires_2fa").notNull().default(false),
  // دسترسی به پنل ادمین/کارشناس
  isStaff: boolean("is_staff").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// کلید دسترسی‌ها در کد تعریف می‌شود (src/lib/auth/permissions.ts) و با seed اینجا همگام می‌شود.
export const permissions = pgTable("permissions", {
  key: text("key").primaryKey(), // مثل companies.edit
  groupKey: text("group_key").notNull(), // مثل companies
  nameFa: text("name_fa").notNull(),
  description: text("description"),
  createdAt: createdAt(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissions.key, { onDelete: "cascade", onUpdate: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionKey] })],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] }), index("user_roles_role_idx").on(t.roleId)],
);

// ---------- تیم ----------
// kind: internal (کارشناس‌های یارچین)؛ در فاز ۲: company (کارمندان یک شرکت).
export const teams = pgTable("teams", {
  id: id(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("internal"),
  meta: jsonb("meta").notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleInTeam: text("role_in_team").notNull().default("member"), // member | lead
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index("team_members_user_idx").on(t.userId)],
);

// ---------- نشست ----------
// توکن خام فقط در کوکی است؛ اینجا فقط هش SHA-256 آن ذخیره می‌شود.
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256(token) به hex
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // بدون استفاده از 2026-09-24 (ورود دومرحله‌ای حذف شد). ستون حذف نمی‌شود.
    twoFactorVerifiedAt: timestamp("two_factor_verified_at", { withTimezone: true }),
    // ادمین «به‌جای مشتری» می‌بیند.
    impersonatingUserId: uuid("impersonating_user_id").references(() => users.id, { onDelete: "set null" }),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

// ---------- ورود دومرحله‌ای (TOTP) — بدون استفاده از 2026-09-24 ----------
// به درخواست مالک، ورود دومرحله‌ای از کد حذف شد. جدول‌ها برای پرهیز از migration مخرب
// می‌مانند و اگر دوباره لازم شد، قابل استفاده‌اند. docs/infoyaarchin.md بخش ۱۳.
export const userTotp = pgTable("user_totp", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // رمز TOTP با AES-256-GCM و کلید APP_ENCRYPTION_KEY رمز می‌شود.
  secretEncrypted: text("secret_encrypted").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  // جلوگیری از استفاده‌ی دوباره از یک کد
  lastUsedStep: bigint("last_used_step", { mode: "number" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userRecoveryCodes = pgTable(
  "user_recovery_codes",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("user_recovery_codes_user_idx").on(t.userId)],
);

// ---------- تلاش‌های ورود (برای محدودیت تعداد تلاش و امنیت) ----------
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    identifier: text("identifier").notNull(), // موبایل یا ایمیل واردشده
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    step: text("step").notNull(), // password | totp | sms
    success: boolean("success").notNull(),
    reason: text("reason"),
    ip: inet("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    index("login_attempts_identifier_idx").on(t.identifier, t.createdAt),
    index("login_attempts_ip_idx").on(t.ip, t.createdAt),
  ],
);
