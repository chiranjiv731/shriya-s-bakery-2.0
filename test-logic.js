/* Node test for the pure logic in site.js: totals, sanitising and pickup slots. */
const S = require("./site.js");
let fails = 0;

function eq(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got ${a}\n        want ${e}`}`);
}

/* ---- totals ---- */
eq("total of sourdough + 2 chai", S.totalOf({ sourdough: 1, chai: 2 }), 340 + 90 + 90);
eq("count of same basket", S.countOf({ sourdough: 1, chai: 2 }), 3);
eq("empty basket total", S.totalOf({}), 0);
eq("money formats with rupee and grouping", S.money(2400), "\u20B92,400");

/* ---- sanitising bad storage values ---- */
eq("drops unknown, zero, negative, fractional",
   S.sanitise({ sourdough: 2.9, bogus: 3, chai: 0, rye: -1, brownie: 500 }),
   { sourdough: 2, brownie: 99 });
eq("handles null", S.sanitise(null), {});

/* ---- day-dependent helpers, found by scanning rather than hardcoded ---- */
const base = new Date(2026, 2, 9, 12, 0, 0); // Mon 9 Mar 2026
function dayNamed(target) {
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    if (d.getDay() === target) return d;
  }
}
const monday = dayNamed(1), wednesday = dayNamed(3), saturday = dayNamed(6), sunday = dayNamed(0);

eq("Monday is closed", S.hoursFor(S.isoDate(monday)), null);
eq("Monday has no slots", S.slotsFor(S.isoDate(monday), monday), []);
eq("Wednesday hours", S.hoursFor(S.isoDate(wednesday)), { from: 7, to: 19 });
eq("Saturday hours", S.hoursFor(S.isoDate(saturday)), { from: 7, to: 16 });
eq("Sunday hours", S.hoursFor(S.isoDate(sunday)), { from: 7, to: 16 });

const wed = S.slotsFor(S.isoDate(wednesday), new Date(wednesday.getTime() - 5 * 86400000));
eq("Wednesday slot count (12 hrs, half-hourly)", wed.length, 24);
eq("first Wednesday slot", wed[0], "07:00");
eq("last Wednesday slot", wed[wed.length - 1], "18:30");

const sat = S.slotsFor(S.isoDate(saturday), new Date(saturday.getTime() - 2 * 86400000));
eq("Saturday slot count (9 hrs)", sat.length, 18);
eq("last Saturday slot", sat[sat.length - 1], "15:30");

/* ---- one hour's notice on the same day ---- */
const sameDay = new Date(wednesday);
sameDay.setHours(10, 0, 0, 0);
const todaySlots = S.slotsFor(S.isoDate(wednesday), sameDay);
eq("today at 10:00 starts at 11:00", todaySlots[0], "11:00");
eq("today at 10:00 drops earlier slots", todaySlots.length, 16);

const late = new Date(wednesday);
late.setHours(18, 45, 0, 0);
eq("after the last slot, none left today", S.slotsFor(S.isoDate(wednesday), late), []);

/* ---- catalog integrity ---- */
const slugs = Object.keys(S.CATALOG);
eq("catalog has 18 products", slugs.length, 18);
const badPrice = slugs.filter((k) => !Number.isInteger(S.CATALOG[k].price) || S.CATALOG[k].price <= 0);
eq("every product has a positive integer price", badPrice, []);

console.log(fails ? `\n${fails} FAILING` : "\nall logic tests passed");
process.exit(fails ? 1 : 0);
