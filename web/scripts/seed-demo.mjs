// داده‌ی آزمایشی سایت عمومی (دسته، محصول، کارخانه‌ی ساختگی، قیمت، عکس).
//   npm run db:seed-demo              ← داده‌ی demo قبلی را پاک و از نو می‌سازد
//   npm run db:seed-demo -- --remove  ← فقط همه‌ی داده‌ی demo را پاک می‌کند
// فقط ردیف‌های source = 'demo' را می‌سازد یا پاک می‌کند؛ به داده‌ی واقعی دست نمی‌زند.
// (قانون «قیمت‌ها پاک نمی‌شوند» برای داده‌ی واقعی است؛ قیمت‌های demo استثنا هستند.)
import pg from "pg";
import { categories, companies, products } from "./demo/demo-data.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL تنظیم نشده است.");
  process.exit(1);
}
const removeOnly = process.argv.includes("--remove");

async function removeDemo(c) {
  // هر چیزی که به محصول یا کارخانه‌ی demo وصل است هم پاک می‌شود، حتی اگر دستی در پنل اضافه شده باشد
  // (مثلاً قیمتی که کارشناس برای لیستینگ یک کارخانه‌ی demo ثبت کرده). وگرنه قیدهای RESTRICT جلوی پاک شدن را می‌گیرند.
  const has0004 = (await c.query(`select to_regclass('public.lead_time_observations') is not null as ok`)).rows[0].ok;
  const demoListings = `select pl.id from product_listings pl
      where pl.source = 'demo'
         or pl.product_id in (select id from products where source = 'demo')
         or pl.company_id in (select id from companies where source = 'demo')`;
  if (has0004) {
    await c.query(`delete from company_correspondence where source = 'demo' or company_id in (select id from companies where source = 'demo')`);
    await c.query(`delete from lead_time_observations where source = 'demo' or listing_id in (${demoListings})`);
  }
  await c.query(`delete from price_observations where source = 'demo' or listing_id in (${demoListings})`);
  await c.query(`delete from product_media where source = 'demo' or product_id in (select id from products where source = 'demo')`);
  await c.query(`delete from product_listings where id in (${demoListings})`);
  await c.query(`delete from products where source = 'demo'`);
  await c.query(`delete from companies where source = 'demo'`);
  // دسته‌ها از برگ به ریشه (والد با RESTRICT محافظت می‌شود)
  for (let i = 0; i < 50; i++) {
    const r = await c.query(
      `delete from categories c where c.source = 'demo'
         and not exists (select 1 from categories ch where ch.parent_id = c.id)`,
    );
    if (r.rowCount === 0) break;
  }
  const left = await c.query(`select count(*)::int as n from categories where source = 'demo'`);
  if (left.rows[0].n > 0) {
    throw new Error("بعضی دسته‌های demo زیرشاخه‌ی واقعی دارند و پاک نشدند. اول آن زیرشاخه‌ها را جابه‌جا کنید.");
  }
}

const daysAgo = (d) => new Date(Date.now() - d * 86400000);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("begin");
  await removeDemo(client);

  if (!removeOnly) {
    // اسلاگ تکراری با داده‌ی واقعی؟
    const clash = await client.query(
      `select slug from categories where slug = any($1) union all select slug from products where slug = any($2)`,
      [categories.map((x) => x.slug), products.map((x) => x.slug)],
    );
    if (clash.rows.length) throw new Error(`این slugها قبلاً برای داده‌ی واقعی استفاده شده‌اند: ${clash.rows.map((r) => r.slug).join(", ")}`);

    // ستون امتیاز از migration ۰۰۰۲ است؛ بدون آن اجرای seed-demo معنا ندارد (اول db:migrate)
    const col = await client.query(
      `select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'import_score'`,
    );
    if (!col.rowCount) throw new Error("ستون products.import_score نیست؛ اول npm run db:migrate را اجرا کنید.");

    // داده‌ی مخصوص migration ۰۰۰۴ (تماس، مکاتبه، پله‌ی زمان آماده‌سازی، وزن و کارتن) فقط اگر اجرا شده باشد
    const has0004 = (await client.query(`select to_regclass('public.lead_time_observations') is not null as ok`)).rows[0].ok;

    const catId = new Map();
    for (const cat of categories) {
      const { rows } = await client.query(
        `insert into categories (parent_id, slug, name_fa, name_en, description_fa, image, sort_order, source)
         values ($1,$2,$3,$4,$5,$6,$7,'demo') returning id`,
        [cat.parent ? catId.get(cat.parent) : null, cat.slug, cat.nameFa, cat.nameEn, cat.descriptionFa ?? null, cat.image, cat.sort],
      );
      catId.set(cat.slug, rows[0].id);
    }

    const coId = new Map();
    for (const co of companies) {
      const { rows } = await client.query(
        `insert into companies (company_type, name_en, country, province, city, address, source)
         values ($1,$2,'CN',$3,$4,$5,'demo') returning id`,
        [co.type, co.nameEn, co.province, co.city, `Demo Industrial Park, ${co.city}, ${co.province}, China`],
      );
      coId.set(co.key, rows[0].id);
      await client.query(
        `insert into company_external_ids (company_id, platform, external_id, url) values ($1,'alibaba',$2,$3)`,
        [rows[0].id, co.ext, `https://example.com/demo-supplier/${co.ext}`],
      );
      for (const slug of co.cats) {
        await client.query(`insert into company_categories (company_id, category_id) values ($1,$2)`, [rows[0].id, catId.get(slug)]);
      }
      if (has0004) {
        for (const ct of co.contacts ?? []) {
          await client.query(
            `insert into company_contacts (company_id, name, role, email, wechat, source) values ($1,$2,$3,$4,$5,'demo')`,
            [rows[0].id, ct.name, ct.role ?? null, ct.email ?? null, ct.wechat ?? null],
          );
        }
      }
    }

    let order = 0;
    for (const p of products) {
      order++;
      const { rows } = await client.query(
        `insert into products (slug, kind, category_id, title_fa, title_en, summary_fa, description_fa, specs, price_unit, hs_code,
                               import_score, status, published_at, source)
         values ($1,'combined',$2,$3,$4,$5,$6,$7,$8,$9,$10,'published',$11,'demo') returning id`,
        [p.slug, catId.get(p.category), p.titleFa, p.titleEn, p.summaryFa, p.descriptionFa, JSON.stringify(p.specs), p.priceUnit ?? "piece", p.hsCode, p.importScore ?? null, daysAgo(order)],
      );
      const productId = rows[0].id;
      if (has0004 && p.packing) {
        const k = p.packing;
        await client.query(
          `update products set unit_weight_kg=$2, units_per_carton=$3, carton_weight_kg=$4, carton_length_cm=$5, carton_width_cm=$6, carton_height_cm=$7 where id=$1`,
          [productId, k.unitWeightKg, k.unitsPerCarton, k.cartonWeightKg, k.cartonLengthCm, k.cartonWidthCm, k.cartonHeightCm],
        );
      }

      let sort = 0;
      for (const m of p.media) {
        await client.query(
          `insert into product_media (product_id, kind, storage_key, poster_key, width, height, alt_fa, sort_order, source)
           values ($1,$2,$3,$4,$5,$6,$7,$8,'demo')`,
          [productId, m.kind, m.key, m.poster ?? null, m.kind === "image" ? 800 : 640, m.kind === "image" ? 800 : 640, m.alt, sort++],
        );
      }

      for (const l of p.listings) {
        const { rows: lr } = await client.query(
          `insert into product_listings (product_id, company_id, external_url, title_en, moq, moq_unit, lead_time_days, source)
           values ($1,$2,$3,$4,$5,$6,$7,'demo') returning id`,
          [productId, coId.get(l.company), `https://example.com/demo-product/${p.slug}`, p.titleEn, l.moq, p.priceUnit ?? "piece", l.lead],
        );
        const batches = [...(l.old ? [[l.old, 40]] : []), [l.prices, 3]];
        for (const [tiers, ago] of batches) {
          const at = daysAgo(ago); // همه‌ی پله‌های یک نوبت، یک زمان
          for (const [minQty, maxQty, lo, hi] of tiers) {
            await client.query(
              `insert into price_observations (listing_id, observed_at, currency, unit, min_qty, max_qty, price_min, price_max, source)
               values ($1,$2,'USD',$3,$4,$5,$6,$7,'demo')`,
              [lr[0].id, at, p.priceUnit ?? "piece", minQty, maxQty, lo, hi],
            );
          }
        }
        if (has0004) {
          for (const [minQty, maxQty, days] of l.leadTiers ?? []) {
            await client.query(
              `insert into lead_time_observations (listing_id, observed_at, min_qty, max_qty, days, source) values ($1,$2,$3,$4,$5,'demo')`,
              [lr[0].id, daysAgo(3), minQty, maxQty, days],
            );
          }
        }
      }
    }
  }

  if (!removeOnly && (await client.query(`select to_regclass('public.company_correspondence') is not null as ok`)).rows[0].ok) {
    for (const co of companies) {
      for (const m of co.correspondence ?? []) {
        await client.query(
          `insert into company_correspondence (company_id, product_id, kind, channel, direction, body, occurred_at, source)
           select c.id, (select id from products where slug = $2 and source = 'demo'), $3, $4, $5, $6, $7, 'demo'
           from companies c join company_external_ids e on e.company_id = c.id and e.platform = 'alibaba' and e.external_id = $1
           where c.source = 'demo'`,
          [co.ext, m.product ?? null, m.kind, m.channel, m.direction, m.body, daysAgo(m.daysAgo)],
        );
      }
    }
  }

  await client.query(
    `insert into activity_log (actor_user_id, action, entity_type) values (null, $1, 'demo')`,
    [removeOnly ? "cli.demo_remove" : "cli.demo_seed"],
  );
  await client.query("commit");
  console.log(
    removeOnly
      ? "داده‌ی demo پاک شد."
      : `داده‌ی demo ساخته شد: ${categories.length} دسته، ${companies.length} کارخانه‌ی ساختگی، ${products.length} محصول.`,
  );
} catch (e) {
  await client.query("rollback");
  console.error("خطا:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
