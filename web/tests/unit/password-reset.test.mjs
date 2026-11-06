// تست واحد بخش ۵۶: قاعده‌های تغییر رمز از پنل (چه کسی، کدام قانون رمز، تکرار) و جمله‌ی ساعت اداری در پیام ارجاع.
import { readFileSync } from "node:fs";
import { OFFICE_HOURS_NOTE, withOfficeHours } from "../../src/lib/ai/handoff-note.ts";
import { RESET_MSG, RESET_PERMISSION, resetAllowed, resetPasswordError } from "../../src/lib/auth/password-reset-core.ts";

let fails = 0,
  n = 0;
const ok = (c, m) => {
  n++;
  if (!c) {
    fails++;
    console.log("FAIL " + m);
  }
};

// ---------- چه کسی ----------
ok(resetAllowed("customer", true, false) === null && resetAllowed("staff", true, false) === null, "main admin: customers and staff");
ok(resetAllowed("customer", false, true) === null, "expert with customers.reset_password: customers");
ok(resetAllowed("staff", false, true) === RESET_MSG.staffOnlyAdmin, "expert with the permission: never staff");
ok(resetAllowed("customer", false, false) === RESET_MSG.noPermission && resetAllowed("staff", false, false) === RESET_MSG.staffOnlyAdmin, "no permission → denied");

// ---------- قانون رمز ----------
ok(resetPasswordError("customer", "abc1234", "abc1234") === "رمز باید حداقل ۸ کاراکتر باشد.", "customer: signup rule (8+)");
ok(resetPasswordError("customer", "abcd1234", "abcd1234") === null, "customer: 8 chars ok");
ok(resetPasswordError("staff", "abcd1234", "abcd1234")?.includes("حداقل ۱۲ کاراکتر"), "staff: panel rule (12+, mixed)");
ok(resetPasswordError("staff", "Strong-Pass-123", "Strong-Pass-123") === null, "staff: strong ok");
ok(resetPasswordError("staff", "strong-pass-123", "strong-pass-123")?.includes("حرف بزرگ"), "staff: needs uppercase");
ok(
  resetPasswordError("customer", "abcd1234", "abcd1235") === RESET_MSG.mismatch && resetPasswordError("staff", "Strong-Pass-123", "Strong-Pass-124") === RESET_MSG.mismatch,
  "mismatch rejected",
);
ok(resetPasswordError("customer", "", "") !== null, "empty rejected");
ok(
  Object.values(RESET_MSG).every((m) => /[آ-ی]/.test(m)),
  "messages in Persian",
);

// ---------- دسترسی در seed ----------
const seed = JSON.parse(readFileSync(new URL("../../src/db/seed-data.json", import.meta.url), "utf8"));
const perm = seed.permissions.find((p) => p.key === RESET_PERMISSION);
ok(perm && perm.groupKey === "customers" && /تغییر رمز مشتری/.test(perm.nameFa), "seed: customers.reset_password in group customers");
ok(seed.rolePermissions.admin === "*" && !JSON.stringify(seed.rolePermissions.expert).includes(RESET_PERMISSION), "admin has it; expert not by default");
const svc = readFileSync(new URL("../../src/lib/auth/password-reset.ts", import.meta.url), "utf8");
ok(/revokeAllSessions\(o\.targetId, self \? o\.actor\.sessionId : undefined\)/.test(svc), "sessions closed; own session kept when changing own password");
ok(/delete\(loginAttempts\)/.test(svc) && /success, false/.test(svc), "temporary login lock cleared");
ok(!/password: o\.password|passwordHash:.*after|after: \{[^}]*password/.test(svc.replace(/passwordHash: await hashPassword\(o\.password\)/, "")), "password never logged");

// ---------- ساعت اداری ----------
const H = "پیام شما به کارشناس یارچین سپرده شد؛ به‌زودی همین‌جا پاسخ می‌دهد.";
ok(OFFICE_HOURS_NOTE === "کارشناسان یارچین در ساعت اداری پاسخ می‌دهند.", "exact sentence");
ok(withOfficeHours(H) === `${H} ${OFFICE_HOURS_NOTE}`, "appended at the end, text unchanged");
ok(withOfficeHours(withOfficeHours(H)) === withOfficeHours(H), "not repeated");
const agent = readFileSync(new URL("../../src/lib/ai/agent.ts", import.meta.url), "utf8");
ok(
  (agent.match(/withOfficeHours\(RESTRICTED_TEXT\)/g) ?? []).length === 2 && /withOfficeHours\(opts\.replacement \? GUARD_REPLACEMENT : HANDOFF_TEXT\)/.test(agent),
  "all hand-off messages get it (rules, model, lead score, caps, guard)",
);
ok(agent.includes(`export const HANDOFF_TEXT = "${H}"`), "original hand-off text unchanged");
const prompt = readFileSync(new URL("../../src/lib/ai/prompt.ts", import.meta.url), "utf8");
ok(!prompt.includes("ساعت اداری"), "prompt untouched");

console.log(`${n - fails}/${n} passed`);
process.exitCode = fails ? 1 : 0;
