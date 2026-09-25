import { Checkbox, Field } from "@/components/ui/Field";
import { PASSWORD_HINT } from "@/lib/auth/password-policy.mjs";
import ui from "@/components/ui/ui.module.css";
import styles from "../panel.module.css";

type RoleOpt = { id: string; key: string; nameFa: string; description: string | null };

export function UserFields({
  allRoles,
  user,
  selectedRoleIds = [],
  withPassword,
  canGrantAdmin = false,
}: {
  allRoles: RoleOpt[];
  user?: { fullName: string; mobile: string | null; email: string | null; status: string };
  selectedRoleIds?: string[];
  withPassword?: boolean;
  // فقط ادمین نقش ادمین می‌دهد/می‌گیرد؛ برای بقیه این گزینه غیرفعال است (سرور هم رد می‌کند)
  canGrantAdmin?: boolean;
}) {
  return (
    <>
      <div className={styles.row}>
        <Field label="نام و نام خانوادگی" name="fullName" defaultValue={user?.fullName} required />
        <Field label="موبایل" name="mobile" defaultValue={user?.mobile ?? ""} ltr inputMode="tel" placeholder="09xxxxxxxxx" />
        <Field label="ایمیل" name="email" type="email" defaultValue={user?.email ?? ""} ltr />
      </div>
      <p className={ui.hint} style={{ margin: "-6px 0 0" }}>
        موبایل یا ایمیل، حداقل یکی لازم است (هر دو هم می‌شود). کاربر با هر کدام که ثبت شده باشد می‌تواند وارد شود.
      </p>
      {withPassword && (
        <Field
          label="رمز عبور"
          name="password"
          type="password"
          autoComplete="new-password"
          ltr
          hint={`برای ادمین و کارشناس اجباری است: ${PASSWORD_HINT} برای مشتری خالی بگذارید.`}
        />
      )}
      {user && (
        <label className={ui.field}>
          <span className={ui.label}>وضعیت</span>
          <select name="status" defaultValue={user.status} className={ui.select}>
            <option value="active">فعال</option>
            <option value="disabled">غیرفعال</option>
          </select>
        </label>
      )}
      <div>
        <div className={ui.label}>نقش‌ها</div>
        <div className={styles.checkGrid} style={{ marginTop: 8 }}>
          {allRoles.map((r) => {
            const locked = r.key === "admin" && !canGrantAdmin;
            return (
              <Checkbox
                key={r.id}
                name="roles"
                value={r.id}
                defaultChecked={selectedRoleIds.includes(r.id)}
                disabled={locked}
                label={
                  <>
                    {r.nameFa}
                    {r.description && <span className={styles.muted}> — {r.description}</span>}
                    {locked && <span className={styles.muted}> (فقط ادمین می‌تواند این نقش را بدهد یا بگیرد)</span>}
                  </>
                }
              />
            );
          })}
        </div>
      </div>
    </>
  );
}
