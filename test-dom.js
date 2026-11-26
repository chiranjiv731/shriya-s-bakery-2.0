/* End-to-end DOM test: loads the real pages, runs site.js, drives the basket and
   the pickup checkout the way a visitor would. */
const fs = require("fs");
const { JSDOM } = require("jsdom");

const SITE = "http://127.0.0.1:8123/";
let fails = 0;

function check(label, cond, detail) {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${cond ? "" : `  -> ${detail}`}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function boot(page, seedBasket) {
  const html = fs.readFileSync(page, "utf8");
  const dom = new JSDOM(html, { url: SITE + page, runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;

  w.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {} });
  w.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe(el) { this.cb([{ isIntersecting: true, target: el }], this); }
    unobserve() {}
    disconnect() {}
  };
  w.Element.prototype.scrollIntoView = function () {};
  w.Element.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0 };
  };

  if (seedBasket) w.localStorage.setItem("shirya.basket", JSON.stringify(seedBasket));

  const errors = [];
  w.addEventListener("error", (e) => errors.push(e.message));
  try {
    w.eval(fs.readFileSync("site.js", "utf8"));
  } catch (e) {
    errors.push(e.message);
  }
  return { w, d: w.document, errors };
}

const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

async function main() {
  /* -------------------------------------------------- 1. adding from the menu */
  {
    const { w, d, errors } = boot("menu.html");
    check("menu page runs site.js without errors", errors.length === 0, errors.join("; "));

    const addBtns = d.querySelectorAll("[data-add]");
    check("menu has 18 add buttons", addBtns.length === 18, addBtns.length);

    const badge = d.querySelector("[data-cart-count]");
    check("badge starts hidden at zero", badge.hidden === true && badge.textContent === "0", badge.outerHTML);

    click(w, d.querySelector('[data-add="sourdough"]'));
    check("adding sourdough writes the basket",
          JSON.parse(w.localStorage.getItem("shirya.basket")).sourdough === 1, w.localStorage.getItem("shirya.basket"));
    check("badge shows 1", badge.textContent === "1" && badge.hidden === false, badge.textContent);
    check("button flips to Added", d.querySelector('[data-add="sourdough"] .add-label').textContent === "Added",
          d.querySelector('[data-add="sourdough"] .add-label').textContent);

    click(w, d.querySelector('[data-add="sourdough"]'));
    click(w, d.querySelector('[data-add="chai"]'));
    const stored2 = JSON.parse(w.localStorage.getItem("shirya.basket"));
    check("second sourdough and a chai recorded", stored2.sourdough === 2 && stored2.chai === 1, JSON.stringify(stored2));

    click(w, d.querySelector("[data-cart-open]"));
    await sleep(40); // the drawer animates open on the next frame
    const drawer = d.getElementById("cart-drawer");
    check("drawer opens", drawer.classList.contains("open") && drawer.getAttribute("aria-hidden") === "false", drawer.className);
    check("overlay is shown", d.getElementById("cart-overlay").hidden === false);
    check("drawer lists 2 lines", d.querySelectorAll("#cart-list .cart-line").length === 2,
          d.querySelectorAll("#cart-list .cart-line").length);
    check("drawer subtotal = 2x340 + 90 = 770", d.getElementById("cart-subtotal").textContent === "\u20B9770",
          d.getElementById("cart-subtotal").textContent);
    check("body scroll locked while open", d.body.classList.contains("no-scroll"), d.body.className);

    click(w, d.querySelector('[data-inc="chai"]'));
    check("+ increments chai to 2", d.getElementById("cart-subtotal").textContent === "\u20B9860",
          d.getElementById("cart-subtotal").textContent);

    click(w, d.querySelector('[data-dec="chai"]'));
    click(w, d.querySelector('[data-dec="chai"]'));
    check("removing the last chai drops the line", d.querySelectorAll("#cart-list .cart-line").length === 1,
          d.querySelectorAll("#cart-list .cart-line").length);
    check("basket storage has no chai key", !("chai" in JSON.parse(w.localStorage.getItem("shirya.basket"))),
          w.localStorage.getItem("shirya.basket"));

    click(w, d.querySelector("[data-cart-close]"));
    await sleep(300);
    check("drawer closes", !drawer.classList.contains("open"), drawer.className);
    check("overlay hidden again", d.getElementById("cart-overlay").hidden === true);
  }

  /* ----------------------------------------- 2. empty basket cannot be ordered */
  {
    const { w, d } = boot("order.html");
    check("place-order disabled with empty basket", d.getElementById("place-order").disabled === true,
          d.getElementById("place-order").disabled);
    check("empty notice shown", d.getElementById("order-empty").hidden === false);
    check("summary total is zero", d.getElementById("summary-total").textContent === "\u20B90",
          d.getElementById("summary-total").textContent);
  }

  /* --------------------------------------------------- 3. full pickup order flow */
  {
    const { w, d, errors } = boot("order.html", { "morning-bun": 2, "sourdough": 1 });
    check("order page runs site.js without errors", errors.length === 0, errors.join("; "));

    const dateEl = d.getElementById("pickup-date");
    const defaultSlots = d.querySelectorAll("#slot-wrap .slot");
    check("default date offers slots", defaultSlots.length > 0, `${defaultSlots.length} slots on ${dateEl.value}`);

    check("summary lists both products", d.querySelectorAll("#summary-list li").length === 2,
          d.querySelectorAll("#summary-list li").length);
    check("summary total = 2x180 + 340 = 700", d.getElementById("summary-total").textContent === "\u20B9700",
          d.getElementById("summary-total").textContent);
    check("place-order enabled with items", d.getElementById("place-order").disabled === false);

    const firstSlot = defaultSlots[0];
    click(w, firstSlot);
    check("slot marks itself pressed", firstSlot.getAttribute("aria-pressed") === "true");
    check("hidden field carries the time", d.getElementById("pickup-time").value === firstSlot.textContent,
          d.getElementById("pickup-time").value);

    const form = d.getElementById("order-form");
    form.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
    check("no confirmation without details", d.getElementById("confirm").hidden === true);
    check("name field flagged invalid", d.getElementById("pickup-name").getAttribute("aria-invalid") === "true");

    const set = (id, v) => { d.getElementById(id).value = v; };
    set("pickup-name", "Ritu Mehta");
    set("pickup-phone", "+91 98200 00000");
    set("pickup-email", "ritu@example.com");
    set("pickup-notes", "Sliced please.");
    form.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));

    const confirm = d.getElementById("confirm");
    check("confirmation appears", confirm.hidden === false);
    check("order form is hidden", d.getElementById("order-root").hidden === true);

    const code = d.getElementById("confirm-code").textContent;
    check("order code looks right", /^SB-[A-Z0-9]{4}$/.test(code), code);
    check("confirmation shows the name", d.getElementById("confirm-name").textContent === "Ritu Mehta",
          d.getElementById("confirm-name").textContent);
    check("confirmation shows the total", d.getElementById("confirm-total").textContent === "\u20B9700",
          d.getElementById("confirm-total").textContent);
    check("confirmation lists the basket", d.getElementById("confirm-items").textContent.includes("Cardamom Morning Bun"),
          d.getElementById("confirm-items").textContent);

    check("basket cleared after ordering", w.localStorage.getItem("shirya.basket") === "{}",
          w.localStorage.getItem("shirya.basket"));
    const orders = JSON.parse(w.localStorage.getItem("shirya.orders"));
    check("order saved with time and total",
          orders.length === 1 && orders[0].total === 700 && orders[0].when.endsWith(firstSlot.textContent),
          JSON.stringify(orders[0] && orders[0].when));
  }

  /* ----------------------------------------------------- 4. Monday is not offered */
  {
    const { w, d } = boot("order.html", { chai: 1 });
    const dateEl = d.getElementById("pickup-date");
    const min = new Date(dateEl.min + "T00:00:00");
    const monday = new Date(min);
    while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1);

    dateEl.value = iso(monday);
    dateEl.dispatchEvent(new w.Event("change", { bubbles: true }));
    check("Monday offers no slots", d.querySelectorAll("#slot-wrap .slot").length === 0,
          d.querySelectorAll("#slot-wrap .slot").length);
    check("Monday explains why", /closed on Mondays/.test(d.getElementById("slot-note").textContent),
          d.getElementById("slot-note").textContent);

    // and switching to an open day brings them back
    const tuesday = new Date(monday);
    tuesday.setDate(tuesday.getDate() + 1);
    dateEl.value = iso(tuesday);
    dateEl.dispatchEvent(new w.Event("change", { bubbles: true }));
    check("Tuesday restores slots", d.querySelectorAll("#slot-wrap .slot").length > 0,
          d.querySelectorAll("#slot-wrap .slot").length);
  }

  /* ------------------------------- 5. the default date skips closed days entirely */
  {
    const w = boot("order.html").w;
    const S = w.Shirya;
    const mondayNoon = new Date(2026, 2, 9, 12, 0, 0); // Mon 9 Mar 2026
    check("firstOpenDate skips Monday", S.hoursFor(S.firstOpenDate(mondayNoon, 14)) !== null,
          S.firstOpenDate(mondayNoon, 14));
    const mondayLate = new Date(2026, 2, 9, 20, 0, 0);
    check("firstOpenDate skips a closed evening", S.firstOpenDate(mondayLate, 14) === "2026-03-10",
          S.firstOpenDate(mondayLate, 14));
    const sundayEvening = new Date(2026, 2, 15, 18, 0, 0); // Sun, shuts at 16:00
    check("firstOpenDate skips Sunday evening", S.firstOpenDate(sundayEvening, 14) === "2026-03-17",
          S.firstOpenDate(sundayEvening, 14));
  }

  /* --------------------------------------------- 6. home page wiring and safety */
  {
    const { w, d, errors } = boot("index.html");
    check("home page runs site.js without errors", errors.length === 0, errors.join("; "));
    check("hero image is present", !!d.querySelector(".arch img"));
    check("add buttons match the catalog",
          Array.from(d.querySelectorAll("[data-add]")).every((b) => w.Shirya.CATALOG[b.getAttribute("data-add")]),
          Array.from(d.querySelectorAll("[data-add]")).map((b) => b.getAttribute("data-add")).join(","));
    check("reveal elements are marked visible", d.querySelectorAll(".reveal.in").length > 0,
          d.querySelectorAll(".reveal.in").length);
    check("tilt elements are wired", d.querySelectorAll("[data-tilt]").length > 0,
          d.querySelectorAll("[data-tilt]").length);
  }

  console.log(fails ? `\n${fails} FAILING` : "\nall DOM tests passed");
  process.exit(fails ? 1 : 0);
}

main();
