/* ==========================================================
   Body Scent — script.js (shared by all pages)
   Each section runs only if its page's elements exist.
   ========================================================== */

(function () {
  "use strict";

  /* ---------- Config ---------- */
  var APPS_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbwhjY0DXEs1iQ6pmjSqd5iT77AFW78RfxjctfqmyjNGWGmlKblM9PFKKpvGtMIa4eO8TQ/exec";

  var SHEET_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vT9_bD72BBEj_Zm2D8uSOaqT-flJ-Rp20iuDxhnKd0_lDhWuQ6O3mfBpG2iy12p6wAex4Ioo6Z_yFig/pub?gid=0&single=true&output=csv";

  var MOODS = [
    { key: "all", label: "ทั้งหมด" },
    { key: "fresh", label: "Fresh" },
    { key: "sweet", label: "Sweet" },
    { key: "confident", label: "Confident" },
    { key: "romance", label: "Romance" }
  ];

  var TYPE_LABELS = { spray: "น้ำหอมฉีดตัว", rollon: "โรลออน" };

  /* ---------- Helpers ---------- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function formatPrice(n) {
    return Number(n).toLocaleString("th-TH");
  }

  /* ==========================================================
     1) product.html — #filter-bar, #product-list
     ========================================================== */
  function initProductPage() {
    var filterBar = document.getElementById("filter-bar");
    var list = document.getElementById("product-list");
    if (!filterBar || !list) return;

    var products = [];
    var validMoods = MOODS.map(function (m) { return m.key; });

    var params = new URLSearchParams(window.location.search);
    var initial = (params.get("mood") || "all").toLowerCase();
    var activeMood = validMoods.indexOf(initial) !== -1 ? initial : "all";

    function renderFilters() {
      filterBar.innerHTML = "";
      MOODS.forEach(function (m) {
        var btn = el("button", "filter-btn" + (m.key === activeMood ? " is-active" : ""));
        btn.type = "button";
        btn.setAttribute("data-mood", m.key);
        if (m.key !== "all") {
          btn.appendChild(el("span", "mood-dot mood-" + m.key));
        }
        btn.appendChild(document.createTextNode(m.label));
        btn.addEventListener("click", function () {
          activeMood = m.key;
          renderFilters();
          renderProducts();
        });
        filterBar.appendChild(btn);
      });
    }

    function buildCard(p) {
      var card = el("article", "product-card mood-" + p.mood);

      var imgWrap = el("div", "product-card__image");
      var img = document.createElement("img");
      img.src = p.image;
      img.alt = p.name;
      img.loading = "lazy";
      imgWrap.appendChild(img);

      var body = el("div", "product-card__body");

      var meta = el("div", "product-card__meta");
      meta.appendChild(el("span", "mood-dot"));
      meta.appendChild(el("span", "", p.mood));

      var title = el("h3", "product-card__title", p.name);
      var size = el("p", "product-card__desc", p.size ? "ขนาด " + p.size : TYPE_LABELS[p.type] || "");

      var footer = el("div", "product-card__footer");
      var price = el("span", "price", formatPrice(p.price));
      price.appendChild(el("small", "", "บาท"));

      var order = el("a", "btn btn--gold btn--sm", "สั่งซื้อ");
      order.href =
        "order.html?item=" + encodeURIComponent(p.name) +
        "&price=" + encodeURIComponent(p.price);

      footer.appendChild(price);
      footer.appendChild(order);

      body.appendChild(meta);
      body.appendChild(title);
      body.appendChild(size);
      body.appendChild(footer);

      card.appendChild(imgWrap);
      card.appendChild(body);
      return card;
    }

    function renderProducts() {
      list.innerHTML = "";
      var shown = products.filter(function (p) {
        return activeMood === "all" || p.mood === activeMood;
      });
      if (!shown.length) {
        list.appendChild(el("p", "text-center", "ไม่พบสินค้า"));
        return;
      }
      shown.forEach(function (p) { list.appendChild(buildCard(p)); });
    }

    renderFilters();
    list.appendChild(el("p", "text-center", "กำลังโหลดสินค้า..."));

    fetch("products.json")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        products = data;
        renderProducts();
      })
      .catch(function (err) {
        console.error(err);
        list.innerHTML = "";
        list.appendChild(el("p", "text-center", "โหลดสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
      });
  }

  /* ==========================================================
     2) order.html — #orderForm, #customerName, #contact,
        #items, #total, #note
     ========================================================== */
  function initOrderPage() {
    var form = document.getElementById("orderForm");
    if (!form) return;

    var itemsField = document.getElementById("items");
    var totalField = document.getElementById("total");

    // Auto-fill from URL parameters (both fields)
    var params = new URLSearchParams(window.location.search);
    var item = params.get("item");
    var price = params.get("price");
    if (itemsField && item) itemsField.value = item;
    if (totalField && price) totalField.value = price;

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var payload = {
        customerName: document.getElementById("customerName").value,
        contact: document.getElementById("contact").value,
        items: document.getElementById("items").value,
        total: document.getElementById("total").value,
        note: document.getElementById("note").value
      };

      fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      })
        .then(() => { window.location.href = "thankyou.html"; })
        .catch(error => {
          console.error(error);
          alert("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        });
    });
  }

  /* ==========================================================
     3) admin.html — #ordersTable tbody
     ========================================================== */

  // Minimal CSV parser: handles quoted fields, commas and newlines
  // inside quotes, and escaped quotes ("").
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;

    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

    for (var i = 0; i < text.length; i++) {
      var c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field); field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        rows.push(row); row = [];
      } else {
        field += c;
      }
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }

    return rows.filter(function (r) {
      return r.some(function (cell) { return cell.trim() !== ""; });
    });
  }

  function initAdminPage() {
    var tbody = document.querySelector("#ordersTable tbody");
    if (!tbody) return;

    var COLS = 6; // วันเวลา, ชื่อ, เบอร์/Line, รายการ, ยอดรวม, หมายเหตุ

    function message(text) {
      tbody.innerHTML = "";
      var tr = document.createElement("tr");
      var td = el("td", "text-center", text);
      td.colSpan = COLS;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    message("กำลังโหลดข้อมูล...");

    fetch(SHEET_CSV_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (text) {
        var rows = parseCSV(text);
        rows.shift(); // remove header row

        if (!rows.length) { message("ยังไม่มีรายการสั่งซื้อ"); return; }

        // Sheet is appended chronologically → reverse for newest first
        rows.reverse();

        tbody.innerHTML = "";
        rows.forEach(function (r) {
          var tr = document.createElement("tr");
          for (var i = 0; i < COLS; i++) {
            tr.appendChild(el("td", "", r[i] !== undefined ? r[i] : ""));
          }
          tbody.appendChild(tr);
        });
      })
      .catch(function (err) {
        console.error(err);
        message("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      });
  }

  /* ---------- Init ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    initProductPage();
    initOrderPage();
    initAdminPage();
  });
})();
