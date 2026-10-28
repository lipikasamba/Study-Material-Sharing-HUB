(() => {
  "use strict";
  const API_BASE = (window.STUDYHUB_API_URL || "http://localhost:3000/api").replace(/\/+$/, "");
  const $ = (selector) => document.querySelector(selector);
  const els = {
    grid: $("#materialsGrid"), empty: $("#emptyState"), count: $("#resultsCount"),
    search: $("#searchInput"), subjectFilter: $("#subjectFilter"), typeFilter: $("#typeFilter"),
    dialog: $("#materialDialog"), form: $("#materialForm"), formMessage: $("#formMessage"),
    id: $("#materialId"), title: $("#titleInput"), subject: $("#subjectInput"),
    type: $("#materialTypeInput"), url: $("#urlInput"), description: $("#descriptionInput"),
    author: $("#authorInput"), submit: $("#submitBtn"), toast: $("#toast")
  };
  let materials = [];
  let toastTimer;

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
  }
  function formatDate(value) {
    if (!value) return "Recently added";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Recently added" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
  }
  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3000);
  }
  function setFormMessage(message, kind = "error") {
    els.formMessage.textContent = message;
    els.formMessage.className = `form-message ${kind}`;
  }
  function clearFormMessage() {
    els.formMessage.textContent = "";
    els.formMessage.className = "form-message hidden";
  }
  async function api(path = "", options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } catch {
      throw new Error("Could not reach the StudyHub API. Check that the backend is running.");
    }
    let payload;
    try { payload = await response.json(); } catch { payload = {}; }
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
    return payload;
  }
  function showLoading() {
    els.grid.classList.remove("hidden");
    els.empty.classList.add("hidden");
    els.grid.innerHTML = '<div class="loading-state"><span class="spinner"></span><p>Finding helpful resources…</p></div>';
    els.count.textContent = "Loading materials…";
  }
  function renderSubjects() {
    const current = els.subjectFilter.value;
    const subjects = [...new Set(materials.map((m) => m.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    els.subjectFilter.innerHTML = '<option value="">All subjects</option>' + subjects.map((s) => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join("");
    if (subjects.includes(current)) els.subjectFilter.value = current;
  }
  function visibleMaterials() {
    const query = els.search.value.trim().toLowerCase();
    const subject = els.subjectFilter.value;
    const type = els.typeFilter.value;
    return materials.filter((m) => {
      const haystack = [m.title, m.subject, m.description, m.author, m.type].join(" ").toLowerCase();
      return (!query || haystack.includes(query)) && (!subject || m.subject === subject) && (!type || m.type === type);
    });
  }
  function cardHTML(m) {
    const typeClass = m.type === "Notes" ? "notes" : m.type === "Past Papers" ? "papers" : "";
    const description = m.description || "No description provided. Open the resource to learn more.";
    const author = m.author ? `Shared by ${escapeHTML(m.author)}` : "Shared by a student";
    return `<article class="material-card">
      <div class="card-top"><span class="type-badge ${typeClass}">${escapeHTML(m.type)}</span><span class="card-date">${escapeHTML(formatDate(m.created_at))}</span></div>
      <p class="card-subject">${escapeHTML(m.subject)}</p><h3>${escapeHTML(m.title)}</h3><p class="card-description">${escapeHTML(description)}</p>
      <div class="card-bottom"><span class="author">${author}</span><div class="card-actions"><button class="text-action edit-action" type="button" data-action="edit" data-id="${escapeHTML(m.id)}">Edit</button><button class="text-action danger delete-action" type="button" data-action="delete" data-id="${escapeHTML(m.id)}">Delete</button><a class="text-action" href="${escapeHTML(m.url)}" target="_blank" rel="noopener noreferrer">Open ↗</a></div></div>
    </article>`;
  }
  function render() {
    const filtered = visibleMaterials();
    els.count.textContent = `${filtered.length} ${filtered.length === 1 ? "resource" : "resources"} found`;
    if (!filtered.length) {
      els.grid.classList.add("hidden");
      els.empty.classList.remove("hidden");
      return;
    }
    els.empty.classList.add("hidden");
    els.grid.classList.remove("hidden");
    els.grid.innerHTML = filtered.map(cardHTML).join("");
  }
  async function loadMaterials() {
    showLoading();
    try {
      const data = await api("/materials");
      materials = data.data;
      renderSubjects();
      render();
    } catch (error) {
      els.grid.classList.remove("hidden");
      els.grid.innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><h3>We couldn't load the library</h3><p>${escapeHTML(error.message)}</p><button class="button button-primary" id="retryBtn" type="button">Try again</button></div>`;
      els.count.textContent = "Library unavailable";
      $("#retryBtn")?.addEventListener("click", loadMaterials);
    }
  }
  function openCreate() {
    els.form.reset();
    els.id.value = "";
    $("#modalEyebrow").textContent = "GIVE KNOWLEDGE A HOME";
    $("#modalTitle").textContent = "Share a resource";
    els.submit.innerHTML = 'Publish resource <span aria-hidden="true">↗</span>';
    clearFormMessage();
    els.dialog.showModal();
  }
  function openEdit(id) {
    const material = materials.find((item) => item.id === id);
    if (!material) return showToast("That resource is no longer available. Refresh and try again.");
    els.id.value = material.id;
    els.title.value = material.title;
    els.subject.value = material.subject;
    els.type.value = material.type;
    els.url.value = material.url;
    els.description.value = material.description || "";
    els.author.value = material.author || "";
    $("#modalEyebrow").textContent = "KEEP THIS RESOURCE USEFUL";
    $("#modalTitle").textContent = "Edit resource";
    els.submit.innerHTML = 'Save changes <span aria-hidden="true">✓</span>';
    clearFormMessage();
    els.dialog.showModal();
  }
  function validateForm() {
    const title = els.title.value.trim(), subject = els.subject.value.trim(), url = els.url.value.trim();
    if (!title || !subject || !url) return "Please complete the title, subject, and resource link.";
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) return "The resource link must start with http:// or https://.";
    } catch { return "Enter a valid resource URL, including https://."; }
    if (title.length > 120 || subject.length > 80 || els.author.value.trim().length > 80 || els.description.value.trim().length > 1000) return "One or more fields exceed the allowed length.";
    return "";
  }
  els.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormMessage();
    const validation = validateForm();
    if (validation) return setFormMessage(validation);
    const id = els.id.value;
    const body = {
      title: els.title.value.trim(), subject: els.subject.value.trim(),
      type: els.type.value, url: els.url.value.trim(),
      description: els.description.value.trim(), author: els.author.value.trim()
    };
    els.submit.disabled = true;
    els.submit.textContent = id ? "Saving…" : "Publishing…";
    try {
      await api(id ? `/materials/${encodeURIComponent(id)}` : "/materials", {
        method: id ? "PUT" : "POST", body: JSON.stringify(body)
      });
      els.dialog.close();
      showToast(id ? "Resource updated successfully." : "Resource shared successfully.");
      await loadMaterials();
    } catch (error) {
      setFormMessage(error.message);
    } finally {
      els.submit.disabled = false;
      els.submit.innerHTML = id ? 'Save changes <span aria-hidden="true">✓</span>' : 'Publish resource <span aria-hidden="true">↗</span>';
    }
  });
  els.grid.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === "edit") return openEdit(id);
    if (action === "delete") {
      const item = materials.find((m) => m.id === id);
      if (!item || !window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
      button.disabled = true;
      try {
        await api(`/materials/${encodeURIComponent(id)}`, { method: "DELETE" });
        showToast("Resource deleted.");
        await loadMaterials();
      } catch (error) {
        showToast(error.message);
        button.disabled = false;
      }
    }
  });
  $("#shareTopBtn").addEventListener("click", openCreate);
  $("#shareHeroBtn").addEventListener("click", openCreate);
  $("#shareBottomBtn").addEventListener("click", openCreate);
  $("#emptyShareBtn").addEventListener("click", openCreate);
  $("#closeModalBtn").addEventListener("click", () => els.dialog.close());
  $("#cancelBtn").addEventListener("click", () => els.dialog.close());
  els.dialog.addEventListener("click", (event) => {
    if (event.target === els.dialog) els.dialog.close();
  });
  $("#refreshBtn").addEventListener("click", loadMaterials);
  els.search.addEventListener("input", render);
  els.subjectFilter.addEventListener("change", render);
  els.typeFilter.addEventListener("change", render);
  $("#year").textContent = new Date().getFullYear();
  loadMaterials();
})();
