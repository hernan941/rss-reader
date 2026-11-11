(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const body = document.body;

  // Las transiciones (chevron, sidebar) solo se activan tras la primera interacción: nada se anima al cargar.
  const enableAnim = () => body.classList.add("anim");
  addEventListener("pointerdown", enableAnim, { once: true, capture: true });
  addEventListener("keydown", enableAnim, { once: true, capture: true });

  // ---------- Menú móvil ----------
  $("#menu")?.addEventListener("click", () => body.classList.toggle("menu-open"));
  $("#scrim")?.addEventListener("click", () => body.classList.remove("menu-open"));

  // ---------- Favicons: si uno no carga, queda la inicial de la fuente ----------
  document.addEventListener("error", (e) => {
    if (e.target.matches?.("img.favicon")) e.target.remove();
  }, true);
  $$("img.favicon").forEach((img) => { if (img.complete && !img.naturalWidth) img.remove(); });

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

  // ---------- Carpetas: el estado abierto/cerrado se guarda en una cookie (lo lee el servidor) ----------
  const saveFolders = () => {
    const closed = $$("details.folder").filter((d) => !d.open).map((d) => d.dataset.folder);
    document.cookie = `folders_closed=${encodeURIComponent(JSON.stringify(closed))}; path=/; max-age=31536000; samesite=lax`;
  };
  $$("details.folder").forEach((d) => d.addEventListener("toggle", saveFolders));

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
    if (!e.target.closest(".entry-main")) return;
    // Ctrl/Cmd/Mayús + clic sigue abriendo el original en otra pestaña.
    if (e.ctrlKey || e.metaKey || e.shiftKey) return setRead(entry, true);
    e.preventDefault();
    openPreview(entry);
  });
  document.addEventListener("auxclick", (e) => {
    const entry = e.target.closest(".entry");
    if (entry && e.button === 1 && e.target.closest(".entry-main")) setRead(entry, true);
  });

  // ---------- Vista previa: decidir antes de ir al artículo ----------
  const preview = $("#preview");
  let shown = null;

  function renderPreview() {
    const link = shown.querySelector(".entry-main").getAttribute("href");
    const summary = ($(".sum", shown)?.textContent ?? "").trim();
    const image = shown.dataset.image || "";
    $("#preview-source").textContent = $(".source", shown).textContent;
    $("#preview-when").textContent = $(".when", shown).textContent;
    $("#preview-title").textContent = $(".title", shown).textContent;

    // Imagen principal (p. ej. tiras de cómic): completa, sin recortar; si falla, se quita.
    const media = $("#preview-media");
    media.replaceChildren();
    if (image) {
      const img = document.createElement("img");
      img.className = "preview-img";
      img.referrerPolicy = "no-referrer";
      img.loading = "eager";
      img.alt = $(".title", shown).textContent;
      img.addEventListener("error", () => img.remove());
      img.src = image;
      media.append(img);
    }

    // Resumen: "\n\n" separa párrafos y "\n" es salto de línea. Solo DOM/textContent (texto no confiable).
    const text = $("#preview-summary");
    text.replaceChildren();
    if (summary) {
      for (const para of summary.split(/\n{2,}/)) {
        const p = document.createElement("p");
        para.split("\n").forEach((line, i) => {
          if (i) p.append(document.createElement("br"));
          p.append(document.createTextNode(line));
        });
        text.append(p);
      }
    } else if (!image) {
      const p = document.createElement("p");
      p.textContent = "Este artículo no trae resumen en su feed.";
      text.append(p);
    }
    text.classList.toggle("none", !summary);
    $(".drawer-body", preview).scrollTop = 0;
    const open = $("#preview-link");
    open.hidden = !link;
    if (link) open.href = link;
    $("#preview-star").textContent = shown.classList.contains("starred") ? "Quitar de guardados" : "Guardar";
    $("#preview-read").textContent = shown.classList.contains("read") ? "Marcar no leído" : "Marcar leído";
  }

  function openPreview(entry) {
    shown = entry;
    focusEntry(entry);
    setRead(entry, true);
    renderPreview();
    if (!preview.open) preview.showModal();
    const open = $("#preview-link");
    (open.hidden ? $("#preview-close") : open).focus({ preventScroll: true });
  }

  $("#preview-close")?.addEventListener("click", () => preview.close());
  preview?.addEventListener("click", (e) => { if (e.target === preview) preview.close(); });
  $("#preview-star")?.addEventListener("click", () => { toggleStar(shown); renderPreview(); });
  $("#preview-read")?.addEventListener("click", () => { setRead(shown, !shown.classList.contains("read")); renderPreview(); });

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

  // ---------- Diálogos ----------
  const dlg = $("#dlg");
  const folderNames = () => $$("#add-feed-folder option").map((o) => o.value).filter(Boolean);

  // Diálogo genérico. Con `choices` muestra un <select> (sin carpeta / existentes / nueva…).
  const ask = (title, label, value = "", choices = null) =>
    new Promise((resolve) => {
      const input = $("#dlg-input"), sel = $("#dlg-select");
      $("#dlg-title").textContent = title;
      $("#dlg-label").textContent = label;
      input.value = choices ? "" : value;
      sel.hidden = !choices;
      $("#dlg-label").htmlFor = choices ? "dlg-select" : "dlg-input";
      const sync = () => {
        input.hidden = !!choices && sel.value !== "__new__";
        input.required = !input.hidden;
        if (choices && !input.hidden) input.focus();
      };
      if (choices) {
        sel.replaceChildren();
        const opts = [["", "Sin carpeta"], ...choices.map((n) => [n, n]), ["__new__", "Nueva carpeta…"]];
        for (const [v, t] of opts) sel.append(new Option(t, v));
        sel.value = choices.includes(value) ? value : "";
        sel.onchange = sync;
      }
      sync();
      dlg.returnValue = "";
      dlg.addEventListener("close", () => {
        if (dlg.returnValue !== "ok") return resolve(null);
        resolve(choices && sel.value !== "__new__" ? sel.value : input.value);
      }, { once: true });
      dlg.showModal();
      (choices ? sel : input).focus();
      if (!choices) input.select();
    });
  $("#dlg-cancel")?.addEventListener("click", () => dlg.close("cancel"));

  // Cerrar con "Cancelar" o haciendo clic fuera de cualquier .dialog
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return e.target.closest("dialog").close();
    if (e.target.matches?.("dialog.dialog")) e.target.close("cancel");
  });

  function openAddFeed(folder = "") {
    closeMenu();
    const d = $("#add-feed");
    $("input[name=back]", d).value = here();
    $("#add-feed-url").value = "";
    const sel = $("#add-feed-folder");
    sel.value = folder;
    if (sel.value !== folder) sel.value = "";
    const btn = $("button[type=submit]", d);
    btn.disabled = false;
    $("span", btn).textContent = "Agregar";
    d.showModal();
    $("#add-feed-url").focus();
  }
  function openAddFolder() {
    closeMenu();
    const d = $("#add-folder");
    $("input[name=back]", d).value = here();
    $("#add-folder-name").value = "";
    d.showModal();
    $("#add-folder-name").focus();
  }
  function importOpml() {
    closeMenu();
    $("#opml-form input[type=file]")?.click();
  }
  function exportOpml() {
    const a = document.createElement("a");
    a.href = "/opml";
    a.download = "feeds.opml";
    body.append(a);
    a.click();
    a.remove();
  }

  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add-feed]");
    if (add) return openAddFeed(add.dataset.folder || "");
    if (e.target.closest("[data-import]")) importOpml();
  });

  const ACTIONS = {
    add: () => [
      ["Fuente", () => openAddFeed()],
      ["Carpeta", () => openAddFolder()],
    ],
    account: (d) => [
      ["Importar OPML…", importOpml],
      ["Exportar OPML", exportOpml],
      ...(d.admin ? [["Administración", () => { location.href = "/admin"; }]] : []),
      null,
      ["Cerrar sesión", () => postForm("/logout")],
    ],
    feed: (d) => [
      ["Marcar como leído", () => postForm("/read-all", { feed: d.id, back: here() })],
      ["Renombrar…", async () => {
        const name = await ask("Renombrar fuente", "Nombre", d.name);
        if (name !== null) postForm(`/feeds/${d.id}/rename`, { name, back: here() });
      }],
      ["Mover a carpeta…", async () => {
        const folder = await ask("Mover a carpeta", "Carpeta", d.folder, folderNames());
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
        const to = await ask("Renombrar carpeta", "Nombre", d.name);
        if (to) postForm("/folders/rename", { from: d.name, to });
      }],
      null,
      ["Eliminar carpeta", () => {
        if (confirm(`¿Eliminar la carpeta “${d.name}”? Sus fuentes no se borran: quedan sin carpeta.`)) {
          postForm("/folders/delete", { name: d.name });
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
    const r = btn.getBoundingClientRect();
    const account = btn.dataset.kind === "account";
    if (account) menu.style.minWidth = r.width + "px";
    body.append(menu);
    const w = menu.offsetWidth, h = menu.offsetHeight;
    const x = account ? r.left : r.right - w;
    menu.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + "px";
    menu.style.top = (r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4) + "px";
    $("button", menu)?.focus();
  }

  document.addEventListener("click", (e) => {
    const plus = e.target.closest(".row-add");
    if (plus) {
      e.preventDefault(); e.stopPropagation(); // dentro de <summary> no debe plegar la carpeta
      return openAddFeed(plus.dataset.folder);
    }
    const btn = e.target.closest(".row-menu");
    if (btn) {
      e.preventDefault(); e.stopPropagation(); // dentro de <summary> no debe plegar la carpeta
      return menu && menuBtn === btn ? closeMenu() : openMenu(btn);
    }
    if (menu && !e.target.closest(".menu")) closeMenu();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
    if (menu && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const items = $$("button", menu);
      const i = items.indexOf(document.activeElement);
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
    }
  });
  addEventListener("resize", closeMenu);
  $("#sidebar")?.addEventListener("scroll", closeMenu);
  $(".feeds")?.addEventListener("scroll", closeMenu);

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
    if (e.metaKey || e.ctrlKey || e.altKey || $("dialog.dialog[open]") || /input|textarea|select/i.test(e.target.tagName)) return;
    const list = $$(".entry");
    const i = current ? list.indexOf(current) : -1;
    if (preview?.open) {
      if (e.key === "j" && list[i + 1]) openPreview(list[i + 1]);
      if (e.key === "k" && i > 0) openPreview(list[i - 1]);
      if (e.key === "s") { toggleStar(shown); renderPreview(); }
      if (e.key === "m") { setRead(shown, !shown.classList.contains("read")); renderPreview(); }
      if (e.key === "v") $("#preview-link").click();
      return;
    }
    switch (e.key) {
      case "j": focusEntry(list[i + 1] ?? list[0]); if (i + 2 >= list.length) $(".more")?.click(); break;
      case "k": focusEntry(list[Math.max(0, i - 1)]); break;
      case "o": case "Enter": if (current) $(".entry-main", current).click(); break;
      case "v": if (current) { setRead(current, true); window.open($(".entry-main", current).href, "_blank", "noopener"); } break;
      case "s": if (current) toggleStar(current); break;
      case "m": if (current) setRead(current, !current.classList.contains("read")); break;
      case "/": e.preventDefault(); openAddFeed(); break;
    }
  });
})();
