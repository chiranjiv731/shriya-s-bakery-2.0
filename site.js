/* Shirya's Bakery -- basket, pickup flow and page motion.
   Loaded on every page. The pricing and scheduling maths is exported so it can
   be tested in Node; everything touching the DOM is guarded on `document`. */
(function (root) {
  "use strict";

  /* ---------------------------------------------------------------- catalog */

  var CATALOG = {
    "sourdough":         { name: "Country Sourdough",        price: 340, img: "/assets/img/sourdough.jpg" },
    "rye":               { name: "Seeded Rye & Molasses",    price: 380, img: "/assets/img/rye.jpg" },
    "fougasse":          { name: "Olive & Rosemary Fougasse", price: 260, img: "/assets/img/fougasse.jpg" },
    "milk-bread":        { name: "Milk Bread, Pullman",      price: 300, img: "/assets/img/milk-bread.jpg" },
    "morning-bun":       { name: "Cardamom Morning Bun",     price: 180, img: "/assets/img/morning-bun.jpg" },
    "croissant":         { name: "Butter Croissant",         price: 150, img: "/assets/img/croissant.jpg" },
    "kouign-amann":      { name: "Kouign-amann",             price: 200, img: "/assets/img/kouign-amann.jpg" },
    "pain-au-chocolat":  { name: "Pain au Chocolat",         price: 170, img: "/assets/img/pain-au-chocolat.jpg" },
    "pistachio-cake":    { name: "Pistachio & Rose Cake",    price: 260, img: "/assets/img/pistachio-cake.jpg" },
    "basque-cheesecake": { name: "Burnt Basque Cheesecake",  price: 280, img: "/assets/img/basque-cheesecake.jpg" },
    "brownie":           { name: "Chocolate Rye Brownie",    price: 160, img: "/assets/img/brownie.jpg" },
    "almond-orange-cake":{ name: "Almond & Orange Cake",     price: 220, img: "/assets/img/almond-orange-cake.jpg" },
    "focaccia":          { name: "Honey & Sea Salt Focaccia", price: 220, img: "/assets/img/focaccia.jpg" },
    "spinach-roll":      { name: "Spinach & Feta Roll",      price: 190, img: "/assets/img/spinach-roll.jpg" },
    "grilled-cheese":    { name: "Sourdough Grilled Cheese", price: 260, img: "/assets/img/grilled-cheese.jpg" },
    "coffee":            { name: "Filter Coffee",            price: 120, img: "/assets/img/coffee.jpg" },
    "chai":              { name: "Cardamom Chai",            price:  90, img: "/assets/img/chai.jpg" },
    "lassi":             { name: "Salted Lassi",             price: 130, img: "/assets/img/lassi.jpg" }
  };

  var KEY = "shirya.basket";
  var ORDERS = "shirya.orders";

  /* -------------------------------------------------------------- pure logic */

  function money(n) {
    return "\u20B9" + Number(n).toLocaleString("en-IN");
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function isoDate(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  /* Opening hours for a given day: null means closed. */
  function hoursFor(dateStr) {
    var p = dateStr.split("-").map(Number);
    var day = new Date(p[0], p[1] - 1, p[2]).getDay(); // 0 Sun .. 1 Mon
    if (day === 1) return null;
    return (day === 0 || day === 6) ? { from: 7, to: 16 } : { from: 7, to: 19 };
  }

  /* Collectable slots in 30-minute steps, minus anything inside the next hour. */
  function slotsFor(dateStr, now) {
    var hrs = hoursFor(dateStr);
    if (!hrs) return [];
    var isToday = dateStr === isoDate(now);
    var cutoff = now.getTime() + 60 * 60 * 1000;
    var out = [];
    for (var h = hrs.from; h < hrs.to; h++) {
      for (var m = 0; m < 60; m += 30) {
        var slot = new Date(dateStr + "T00:00:00");
        slot.setHours(h, m, 0, 0);
        if (isToday && slot.getTime() < cutoff) continue;
        out.push(pad(h) + ":" + (m === 0 ? "00" : "30"));
      }
    }
    return out;
  }

  /* First day in the next `days` that actually has a collectable slot -- so the
     date picker never opens on a Monday or on a day we have already closed. */
  function firstOpenDate(now, days) {
    for (var i = 0; i < (days || 14); i++) {
      var d = new Date(now.getTime() + i * 86400000);
      var s = isoDate(d);
      if (slotsFor(s, now).length) return s;
    }
    return isoDate(now);
  }

  function countOf(basket) {
    return Object.keys(basket).reduce(function (n, k) { return n + basket[k]; }, 0);
  }

  function totalOf(basket) {
    return Object.keys(basket).reduce(function (n, k) {
      return n + (CATALOG[k] ? CATALOG[k].price * basket[k] : 0);
    }, 0);
  }

  /* Keep only known products, whole quantities, within range. */
  function sanitise(raw) {
    var out = {};
    if (!raw || typeof raw !== "object") return out;
    Object.keys(raw).forEach(function (k) {
      var q = Math.floor(Number(raw[k]));
      if (CATALOG[k] && q > 0) out[k] = Math.min(q, 99);
    });
    return out;
  }

  var API = {
    CATALOG: CATALOG, money: money, hoursFor: hoursFor, slotsFor: slotsFor,
    firstOpenDate: firstOpenDate, countOf: countOf, totalOf: totalOf,
    sanitise: sanitise, isoDate: isoDate
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (root) root.Shirya = API;

  if (typeof document === "undefined") return; // Node: pure functions only

  /* ------------------------------------------------------------- basket state */

  function read() {
    try {
      return sanitise(JSON.parse(localStorage.getItem(KEY) || "{}"));
    } catch (e) {
      return {};
    }
  }

  function write(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* private mode -- basket just won't persist */
    }
  }

  var basket = read();

  /* ------------------------------------------------------------------ markup */

  document.body.insertAdjacentHTML("beforeend",
    '<div class="cart-overlay" id="cart-overlay" hidden></div>' +
    '<aside class="cart-drawer" id="cart-drawer" role="dialog" aria-modal="true" ' +
    'aria-labelledby="cart-title" aria-hidden="true">' +
      '<div class="cart-head">' +
        '<h2 id="cart-title">Your basket</h2>' +
        '<button class="cart-close" type="button" data-cart-close aria-label="Close basket">\u00D7</button>' +
      '</div>' +
      '<ul class="cart-list" id="cart-list"></ul>' +
      '<div class="cart-foot">' +
        '<div class="row"><span>Subtotal</span><strong id="cart-subtotal">\u20B90</strong></div>' +
        '<a class="btn btn-primary btn-block" href="/order.html" id="cart-checkout">Choose a pickup time</a>' +
        '<p class="form-note" style="margin-top: var(--space-3);">Pay at the counter when you collect. ' +
        'Nothing is charged now.</p>' +
      '</div>' +
    '</aside>' +
    '<div class="toast" id="toast" role="status" aria-live="polite">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>' +
      '<span id="toast-text"></span>' +
    '</div>');

  var drawer = document.getElementById("cart-drawer");
  var overlay = document.getElementById("cart-overlay");
  var listEl = document.getElementById("cart-list");
  var subtotalEl = document.getElementById("cart-subtotal");
  var checkoutEl = document.getElementById("cart-checkout");
  var toastEl = document.getElementById("toast");
  var toastText = document.getElementById("toast-text");
  var lastFocus = null;

  function renderDrawer() {
    var keys = Object.keys(basket);
    listEl.innerHTML = "";

    if (!keys.length) {
      listEl.innerHTML =
        '<li class="cart-empty">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
          'stroke-linecap="round" aria-hidden="true"><path d="M4 8h16l-1.5 11a2 2 0 0 1-2 1.8h-9A2 2 0 0 1 5.5 19Z"/>' +
          '<path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>' +
          'Nothing in the basket yet.<br>Have a look at <a href="/menu.html">the menu</a>.' +
        '</li>';
    } else {
      keys.forEach(function (slug) {
        var item = CATALOG[slug];
        var li = document.createElement("li");
        li.className = "cart-line";
        li.innerHTML =
          '<img src="' + item.img + '" alt="" loading="lazy" width="56" height="56">' +
          '<div><div class="cart-line-name">' + item.name + '</div>' +
          '<div class="cart-line-price">' + money(item.price) + ' each</div></div>' +
          '<div class="qty">' +
            '<button type="button" data-dec="' + slug + '" aria-label="One fewer ' + item.name + '">\u2212</button>' +
            '<span aria-live="polite">' + basket[slug] + '</span>' +
            '<button type="button" data-inc="' + slug + '" aria-label="One more ' + item.name + '">+</button>' +
          '</div>';
        listEl.appendChild(li);
      });
    }

    subtotalEl.textContent = money(totalOf(basket));
    checkoutEl.style.pointerEvents = keys.length ? "" : "none";
    checkoutEl.style.opacity = keys.length ? "" : "0.5";
    checkoutEl.setAttribute("aria-disabled", keys.length ? "false" : "true");

    document.querySelectorAll("[data-cart-count]").forEach(function (el) {
      var n = countOf(basket);
      el.textContent = n;
      el.classList.toggle("bump", n > 0);
      el.hidden = n === 0;
    });
  }

  function openDrawer() {
    lastFocus = document.activeElement;
    renderDrawer();
    overlay.hidden = false;
    requestAnimationFrame(function () {
      overlay.classList.add("open");
      drawer.classList.add("open");
    });
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    drawer.querySelector("[data-cart-close]").focus();
  }

  function closeDrawer() {
    overlay.classList.remove("open");
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
    setTimeout(function () { overlay.hidden = true; }, 260);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  var toastTimer;
  function toast(msg) {
    toastText.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
  }

  function add(slug) {
    if (!CATALOG[slug]) return;
    basket[slug] = Math.min((basket[slug] || 0) + 1, 99);
    write(basket);
    renderDrawer();
    toast(CATALOG[slug].name + " added to your basket");
  }

  /* ------------------------------------------------------------------- events */

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-add], [data-cart-open], [data-cart-close], [data-inc], [data-dec]");
    if (!t) return;

    if (t.hasAttribute("data-add")) {
      e.preventDefault();
      add(t.getAttribute("data-add"));
      t.classList.add("added");
      var label = t.querySelector(".add-label");
      if (label) {
        var original = label.textContent;
        label.textContent = "Added";
        setTimeout(function () {
          label.textContent = original;
          t.classList.remove("added");
        }, 1400);
      }
      return;
    }

    if (t.hasAttribute("data-inc")) {
      var inc = t.getAttribute("data-inc");
      basket[inc] = Math.min((basket[inc] || 0) + 1, 99);
      write(basket); renderDrawer(); return;
    }

    if (t.hasAttribute("data-dec")) {
      var dec = t.getAttribute("data-dec");
      basket[dec] = (basket[dec] || 0) - 1;
      if (basket[dec] <= 0) delete basket[dec];
      write(basket); renderDrawer(); return;
    }

    if (t.hasAttribute("data-cart-open")) { e.preventDefault(); openDrawer(); return; }
    if (t.hasAttribute("data-cart-close")) { e.preventDefault(); closeDrawer(); }
  });

  overlay.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && drawer.classList.contains("open")) closeDrawer();
    if (e.key === "Tab" && drawer.classList.contains("open")) {
      var focusable = drawer.querySelectorAll("button, a[href]");
      if (!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  renderDrawer();

  /* --------------------------------------------------------- order page logic */

  if (document.getElementById("order-root")) initOrder();

  function initOrder() {
    var form = document.getElementById("order-form");
    var emptyEl = document.getElementById("order-empty");
    var summaryList = document.getElementById("summary-list");
    var summaryTotal = document.getElementById("summary-total");
    var dateEl = document.getElementById("pickup-date");
    var slotWrap = document.getElementById("slot-wrap");
    var slotNote = document.getElementById("slot-note");
    var confirmEl = document.getElementById("confirm");
    var placeBtn = document.getElementById("place-order");
    var hiddenTime = document.getElementById("pickup-time");
    var orderRoot = document.getElementById("order-root");

    var now = new Date();
    dateEl.min = isoDate(now);
    dateEl.max = isoDate(new Date(now.getTime() + 13 * 86400000));
    // Default to the next day we can actually bake for, not blindly to today.
    dateEl.value = firstOpenDate(now, 14);

    var chosenDate = dateEl.value;
    var chosenTime = "";

    function prettyDate(str) {
      var p = str.split("-").map(Number);
      return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString("en-GB", {
        weekday: "long", day: "numeric", month: "long"
      });
    }

    function buildSlots() {
      slotWrap.innerHTML = "";
      chosenTime = "";
      hiddenTime.value = "";

      if (!hoursFor(chosenDate)) {
        slotNote.textContent = "We're closed on Mondays \u2014 the ovens need a rest too. Pick another day.";
        return;
      }

      var slots = slotsFor(chosenDate, new Date());
      slots.forEach(function (label) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "slot";
        b.textContent = label;
        b.setAttribute("aria-pressed", "false");
        b.setAttribute("data-slot", label);
        slotWrap.appendChild(b);
      });

      slotNote.textContent = slots.length
        ? "All times are for collection at the counter on Alder Lane."
        : "No slots left today \u2014 try tomorrow, or ring us on +91 22 4000 1998.";
    }

    slotWrap.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-slot]");
      if (!btn) return;
      slotWrap.querySelectorAll("[data-slot]").forEach(function (b) {
        b.setAttribute("aria-pressed", "false");
      });
      btn.setAttribute("aria-pressed", "true");
      chosenTime = btn.getAttribute("data-slot");
      hiddenTime.value = chosenTime;
    });

    dateEl.addEventListener("change", function () {
      chosenDate = dateEl.value;
      buildSlots();
    });

    function renderSummary() {
      var keys = Object.keys(basket);
      summaryList.innerHTML = "";
      emptyEl.hidden = keys.length > 0;
      placeBtn.disabled = keys.length === 0;
      summaryTotal.textContent = money(totalOf(basket));

      keys.forEach(function (slug) {
        var item = CATALOG[slug];
        var li = document.createElement("li");
        li.innerHTML =
          '<span>' + item.name + '</span>' +
          '<span class="summary-qty">\u00D7' + basket[slug] + '</span>' +
          '<span class="tabular-nums">' + money(item.price * basket[slug]) + '</span>';
        summaryList.appendChild(li);
      });
    }

    buildSlots();
    renderSummary();

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      if (!Object.keys(basket).length) {
        toast("Your basket is empty \u2014 add something from the menu first.");
        return;
      }
      if (!chosenTime) {
        slotNote.textContent = "Pick a collection time to carry on.";
        slotWrap.scrollIntoView({ block: "center" });
        return;
      }

      var name = document.getElementById("pickup-name");
      var phone = document.getElementById("pickup-phone");
      var email = document.getElementById("pickup-email");
      var ok = true;

      [[name, name.value.trim().length >= 2],
       [phone, /^[0-9+\-\s()]{7,}$/.test(phone.value.trim())],
       [email, /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())]
      ].forEach(function (pair) {
        pair[0].setAttribute("aria-invalid", pair[1] ? "false" : "true");
        if (!pair[1]) ok = false;
      });

      if (!ok) {
        toast("Please check your name, phone and email.");
        form.querySelector('[aria-invalid="true"]').focus();
        return;
      }

      var order = {
        code: "SB-" + Math.random().toString(36).slice(2, 6).toUpperCase(),
        when: chosenDate + " " + chosenTime,
        pretty: prettyDate(chosenDate) + " at " + chosenTime,
        name: name.value.trim(),
        phone: phone.value.trim(),
        email: email.value.trim(),
        notes: document.getElementById("pickup-notes").value.trim(),
        items: JSON.parse(JSON.stringify(basket)),
        total: totalOf(basket)
      };

      try {
        var all = JSON.parse(localStorage.getItem(ORDERS) || "[]");
        all.push(order);
        localStorage.setItem(ORDERS, JSON.stringify(all));
      } catch (err) { /* not fatal */ }

      document.getElementById("confirm-code").textContent = order.code;
      document.getElementById("confirm-when").textContent = order.pretty;
      document.getElementById("confirm-name").textContent = order.name;
      document.getElementById("confirm-total").textContent = money(order.total);
      document.getElementById("confirm-items").textContent =
        Object.keys(order.items).map(function (s) {
          return order.items[s] + "\u00D7 " + CATALOG[s].name;
        }).join(", ");

      basket = {};
      write(basket);
      renderDrawer();
      orderRoot.hidden = true;
      confirmEl.hidden = false;
      confirmEl.scrollIntoView({ block: "start" });
    });
  }

  /* ------------------------------------------------------------- page motion */

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  var bar = document.querySelector(".progress");
  if (bar) {
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        var p = h > 0 ? Math.min(window.scrollY / h, 1) : 0;
        bar.style.setProperty("--progress", p.toFixed(4));
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
  }

  var revealEls = document.querySelectorAll(".reveal");
  if (revealEls.length) {
    if (reduce || !("IntersectionObserver" in window)) {
      revealEls.forEach(function (el) { el.classList.add("in"); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
      revealEls.forEach(function (el) { io.observe(el); });
    }
  }

  if (!reduce && canHover) {
    document.querySelectorAll("[data-tilt]").forEach(function (el) {
      var max = parseFloat(el.getAttribute("data-tilt")) || 5;
      var raf = null;
      var target = { x: 0, y: 0 };

      function apply() {
        el.style.setProperty("--rx", target.x.toFixed(2) + "deg");
        el.style.setProperty("--ry", target.y.toFixed(2) + "deg");
        el.style.setProperty("--tilt-x", target.x.toFixed(2) + "deg");
        el.style.setProperty("--tilt-y", target.y.toFixed(2) + "deg");
        raf = null;
      }

      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        target.y = px * max * 2;
        target.x = -py * max * 2;
        if (!raf) raf = requestAnimationFrame(apply);
      });

      el.addEventListener("pointerleave", function () {
        target.x = 0; target.y = 0;
        if (!raf) raf = requestAnimationFrame(apply);
      });
    });
  }

  var parallax = document.querySelector("[data-parallax]");
  if (parallax && !reduce) {
    var pRaf = null;
    window.addEventListener("scroll", function () {
      if (pRaf) return;
      pRaf = requestAnimationFrame(function () {
        var y = Math.min(window.scrollY, 700);
        parallax.style.transform = "translateY(" + (y * 0.06).toFixed(1) + "px)";
        pRaf = null;
      });
    }, { passive: true });
  }

  window.addEventListener("storage", function (e) {
    if (e.key === KEY) { basket = read(); renderDrawer(); }
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
