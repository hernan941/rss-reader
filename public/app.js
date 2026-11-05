(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const body = document.body;

  // ---------- Menú móvil ----------
  $("#menu")?.addEventListener("click", () => body.classList.toggle("menu-open"));
  $("#scrim")?.addEventListener("click", () => body.classList.remove("menu-open"));

  // ---------- Formularios: estado "ocupado" ----------
  document.addEventListener("submit", (e) => {
    const confirmMsg = e.target.dataset?.confirm;
    if (confirmMsg && !confirm(confirmMsg)) return e.preventDefault();
    const busy = e.target.dataset?.busy;
    if (!busy) return;
    const btn = $("button[type=submit]", e.target);
    if (!btn) return;
    // Se deshabilita después del envío para no cancelarlo.
    setTimeout(() => {
      btn.disabled = true;
      const label = $("span", btn);
      if (label) label.textContent = busy;
    });
  });

  // Importar OPML: enviar al elegir archivo
  $("#opml-form input[type=file]")?.addEventListener("change", (e) => {
    if (e.target.files.length) e.target.form.submit();
  });

  // ---------- Carpetas: recordar abiertas/cerradas ----------
  const store = {
    get() { try { return JSON.parse(localStorage.getItem("folders") || "{}"); } catch { return {}; } },
    set(v) { try { localStorage.setItem("folders", JSON.stringify(v)); } catch {} },
  };
  const closed = store.get();
  $$("details.folder").forEach((d) => {
    if (closed[d.dataset.folder] && !$(".row.active", d) && !d.querySelector("summary.active")) d.open = false;
    d.addEventListener("toggle", () => {
      const s = store.get();
      if (d.open) delete s[d.dataset.folder]; else s[d.dataset.folder] = 1;
      store.set(s);
    });
  });

  // ---------- Contadores ----------
  const bump = (entry, delta) => {
    const feed = entry.dataset.feed;
    const els = [$("[data-total-unread]"), $(`[data-feed-count="${feed}"]`)];
    const folder = $(`[data-feed-count="${feed}"]`)?.closest("details.folder");
    if (folder) els.push($("summary .count", folder));
    for (const el of els) {
      if (el) el.textContent = Math.max(0, (parseInt(el.textContent) || 0) + delta) || "";
    }
  };

  // ---------- Acciones sobre artículos ----------
  const send = (id, action, value) =>
    fetch(`/entries/${id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
      keepalive: true,
    }).catch(() => {});

  function setRead(entry, value) {
    if (entry.classList.contains("read") === value) return;
    entry.classList.toggle("read", value);
    bump(entry, value ? -1 : 1);
    send(entry.dataset.id, "read", value);
  }
  function toggleStar(entry) {
    const value = !entry.classList.contains("starred");
    entry.classList.toggle("starred", value);
    send(entry.dataset.id, "star", value);
  }

  document.addEventListener("click", (e) => {
    const entry = e.target.closest(".entry");
    if (!entry) return;
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "star") return toggleStar(entry);
    if (act === "read") return setRead(entry, !entry.classList.contains("read"));
    if (e.target.closest(".entry-main")) setRead(entry, true);
  });
  document.addEventListener("auxclick", (e) => {
    const entry = e.target.closest(".entry");
    if (entry && e.button === 1 && e.target.closest(".entry-main")) setRead(entry, true);
  });

  // ---------- Cargar más ----------
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".more");
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = "Cargando…";
    try {
      const res = await fetch(btn.dataset.href + "&partial=1");
      if (!res.ok) throw new Error();
      btn.insertAdjacentHTML("afterend", await res.text());
      btn.remove();
    } catch {
      btn.disabled = false;
      btn.textContent = "Error, reintentar";
    }
  });

  // ---------- Menú de acciones de la barra lateral ----------
  const here = () => location.pathname + location.search;

  function postForm(action, fields = {}) {
    const f = document.createElement("form");
    f.method = "post";
    f.action = action;
    for (const [k, v] of Object.entries(fields)) {
      const i = document.createElement("input");
      i.type = "hidden"; i.name = k; i.value = v;
      f.append(i);
    }
    body.append(f);
    f.submit();
  }

  const dlg = $("#dlg");
  const ask = (label, value = "") =>
    new Promise((resolve) => {
      $("#dlg-label").textContent = label;
      const input = $("#dlg-input");
      input.value = value;
      dlg.returnValue = "";
      dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok" ? input.value : null), { once: true });
      dlg.showModal();
      input.select();
    });
  $("#dlg-cancel")?.addEventListener("click", () => dlg.close("cancel"));

  const ACTIONS = {
    feed: (d) => [
      ["Marcar como leído", () => postForm("/read-all", { feed: d.id, back: here() })],
      ["Renombrar…", async () => {
        const name = await ask("Nombre de la fuente", d.name);
        if (name !== null) postForm(`/feeds/${d.id}/rename`, { name, back: here() });
      }],
      ["Mover a carpeta…", async () => {
        const folder = await ask("Carpeta (déjalo vacío para quitarla)", d.folder);
        if (folder !== null) postForm(`/feeds/${d.id}/folder`, { folder, back: here() });
      }],
      null,
      ["Dejar de seguir", () => {
        if (confirm(`¿Dejar de seguir “${d.name}”?`)) postForm(`/feeds/${d.id}/unfollow`);
      }, true],
    ],
    folder: (d) => [
      ["Marcar carpeta como leída", () => postForm("/read-all", { folder: d.name, back: here() })],
      ["Renombrar carpeta…", async () => {
        const to = await ask("Nombre de la carpeta", d.name);
        if (to) postForm("/folders/rename", { from: d.name, to });
      }],
      null,
      ["Sacar las fuentes de la carpeta", () => {
        if (confirm(`Las fuentes de “${d.name}” se conservan, pero sin carpeta. ¿Continuar?`)) {
          postForm("/folders/rename", { from: d.name, to: "" });
        }
      }, true],
    ],
  };

  let menu = null, menuBtn = null;
  function closeMenu() {
    menu?.remove();
    menuBtn?.setAttribute("aria-expanded", "false");
    menu = menuBtn = null;
  }
  function openMenu(btn) {
    closeMenu();
    menuBtn = btn;
    btn.setAttribute("aria-expanded", "true");
    menu = document.createElement("div");
    menu.className = "menu";
    menu.setAttribute("role", "menu");
    for (const item of ACTIONS[btn.dataset.kind](btn.dataset)) {
      if (!item) { menu.append(document.createElement("hr")); continue; }
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = item[0];
      if (item[2]) b.className = "danger";
      b.addEventListener("click", () => { closeMenu(); item[1](); });
      menu.append(b);
    }
    body.append(menu);
    const r = btn.getBoundingClientRect();
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px";
    menu.style.top = (r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4) + "px";
    $("button", menu)?.focus();
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".row-menu");
    if (btn) {
      e.preventDefault(); e.stopPropagation(); // dentro de <summary> no debe plegar la carpeta
      return menu && menuBtn === btn ? closeMenu() : openMenu(btn);
    }
    if (menu && !e.target.closest(".menu")) closeMenu();
  }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  addEventListener("resize", closeMenu);
  $("#sidebar")?.addEventListener("scroll", closeMenu);

  // ---------- Atajos de teclado ----------
  let current = null;
  function focusEntry(el) {
    if (!el) return;
    current?.classList.remove("focus");
    current = el;
    el.classList.add("focus");
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || dlg?.open || /input|textarea/i.test(e.target.tagName)) return;
    const list = $$(".entry");
    const i = current ? list.indexOf(current) : -1;
    switch (e.key) {
      case "j": focusEntry(list[i + 1] ?? list[0]); if (i + 2 >= list.length) $(".more")?.click(); break;
      case "k": focusEntry(list[Math.max(0, i - 1)]); break;
      case "o": case "Enter": if (current) $(".entry-main", current).click(); break;
      case "s": if (current) toggleStar(current); break;
      case "m": if (current) setRead(current, !current.classList.contains("read")); break;
      case "/": e.preventDefault(); $(".add input[name=url]")?.focus(); break;
    }
  });
})();
