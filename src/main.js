(() => {
  "use strict";

  const STORAGE = {
    activePath: "markdownDocsPreview.activePath",
    activeProjectId: "markdownDocsPreview.activeProjectId",
    editorProduct: "markdownDocsPreview.editorProduct",
    openFolders: "markdownDocsPreview.openFolders",
    sidebarWidth: "markdownDocsPreview.sidebarWidth",
    theme: "markdownDocsPreview.theme",
    projects: "projects"
  };

  const DB = {
    name: "markdownDocsPreview",
    version: 1,
    store: "handles"
  };

  const PREVIEW_FILE = "Preview.html";
  const README_PATH = "README.md";
  const EDITORS = {
    vscode: {
      label: "VS Code",
      scheme: "vscode"
    },
    cursor: {
      label: "Cursor",
      scheme: "cursor"
    },
    windsurf: {
      label: "Windsurf",
      scheme: "windsurf"
    }
  };

  const elements = {
    navTree: document.getElementById("navTree"),
    brandHomeButton: document.getElementById("brandHomeButton"),
    brandSubtitle: document.getElementById("brandSubtitle"),
    toast: document.getElementById("toast"),
    markdownBody: document.getElementById("markdownBody"),
    breadcrumb: document.getElementById("breadcrumb"),
    contentScroll: document.getElementById("contentScroll"),
    pageSearch: document.getElementById("pageSearch"),
    searchButton: document.getElementById("searchButton"),
    expandTreeButton: document.getElementById("expandTreeButton"),
    collapseTreeButton: document.getElementById("collapseTreeButton"),
    projectMenuButton: document.getElementById("projectMenuButton"),
    projectDropdown: document.getElementById("projectDropdown"),
    projectList: document.getElementById("projectList"),
    chooseFolderButton: document.getElementById("chooseFolderButton"),
    reloadButton: document.getElementById("reloadButton"),
    themeButton: document.getElementById("themeButton"),
    copyPathButton: document.getElementById("copyPathButton"),
    editorSelect: document.getElementById("editorSelect"),
    openEditorButton: document.getElementById("openEditorButton"),
    topButton: document.getElementById("topButton"),
    resizer: document.getElementById("resizer")
  };

  let docs = [];
  const initialRoute = readHistoryRouteFromLocation();
  let activePath = normalizePath(initialRoute.path || sessionStorage.getItem(STORAGE.activePath) || localStorage.getItem(STORAGE.activePath) || README_PATH);
  let openFolders = loadOpenFolders();
  let pendingHash = initialRoute.hash;
  let rootDirectoryHandle = null;
  let rootDisplayName = "Markdown 文書";
  let rootReadmeTitle = "";
  let activeProjectId = initialRoute.projectId || sessionStorage.getItem(STORAGE.activeProjectId) || localStorage.getItem(STORAGE.activeProjectId) || "";
  let projectHistory = [];
  let objectUrls = [];
  let toastTimer = 0;

  boot();

  async function boot() {
    const storedTheme = localStorage.getItem(STORAGE.theme);
    if (storedTheme === "dark") {
      document.documentElement.dataset.theme = "dark";
    }

    const storedWidth = Number(localStorage.getItem(STORAGE.sidebarWidth));
    if (Number.isFinite(storedWidth) && storedWidth >= 240 && storedWidth <= 560) {
      document.documentElement.style.setProperty("--sidebar-width", `${storedWidth}px`);
    }

    const storedEditor = localStorage.getItem(STORAGE.editorProduct);
    if (storedEditor && EDITORS[storedEditor]) {
      elements.editorSelect.value = storedEditor;
    }

    bindEvents();
    await loadProjectHistory();
    updateEnvironmentHints();
    await refreshIndexAndLoad();
  }

  function updateEnvironmentHints() {
    elements.chooseFolderButton.hidden = !supportsFileSystemAccess();
    elements.projectMenuButton.hidden = !supportsFileSystemAccess();
    elements.projectMenuButton.classList.toggle("is-callout", !rootDirectoryHandle);
    elements.brandHomeButton.textContent = rootReadmeTitle || rootDisplayName || "Markdown 文書";
    elements.brandSubtitle.textContent = rootDirectoryHandle
      ? `${activeProjectDisplayPath()} / ${docs.length || 0}ページ`
      : "Project一覧から Markdown フォルダを選択";
    updateDocumentTitle();
    renderProjectList();
  }

  function updateDocumentTitle() {
    const projectTitle = rootReadmeTitle || rootDisplayName || "";
    document.title = projectTitle && rootDirectoryHandle
      ? `${projectTitle} - Markdown Viewer`
      : "Markdown Viewer";
  }

  function bindEvents() {
    elements.pageSearch.addEventListener("input", renderTree);
    elements.pageSearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runSearch();
      }
    });
    elements.searchButton.addEventListener("click", runSearch);
    elements.expandTreeButton.addEventListener("click", expandAllFolders);
    elements.collapseTreeButton.addEventListener("click", collapseAllFolders);
    elements.reloadButton.addEventListener("click", refreshIndexAndLoad);
    elements.projectMenuButton.addEventListener("click", toggleProjectDropdown);
    elements.chooseFolderButton.addEventListener("click", chooseMarkdownFolder);
    elements.themeButton.addEventListener("click", () => {
      toggleTheme();
    });
    elements.copyPathButton.addEventListener("click", copyActivePath);
    elements.editorSelect.addEventListener("change", () => {
      localStorage.setItem(STORAGE.editorProduct, selectedEditorId());
      updateEnvironmentHints();
    });
    elements.openEditorButton.addEventListener("click", openActivePathInEditor);
    elements.brandHomeButton.addEventListener("click", () => {
      if (docs.some((doc) => doc.path === README_PATH)) loadDoc(README_PATH);
    });
    elements.topButton.addEventListener("click", () => elements.contentScroll.scrollTo({ top: 0, behavior: "smooth" }));
    elements.contentScroll.addEventListener("scroll", updateTopButtonVisibility, { passive: true });
    window.addEventListener("popstate", async (event) => {
      const route = readHistoryRouteFromState(event.state);
      if (route.projectId && route.projectId !== activeProjectId && projectHistory.some((project) => project.id === route.projectId)) {
        activePath = route.path || README_PATH;
        pendingHash = route.hash;
        await openProjectFromHistory(route.projectId, { refresh: false });
        await refreshIndexAndLoad();
        return;
      }

      const nextPath = docs.some((doc) => doc.path === route.path) ? route.path : activePath || README_PATH;
      loadDoc(nextPath, { hash: route.path ? route.hash : "", history: "none" });
    });

    document.addEventListener("click", (event) => {
      if (elements.projectDropdown.hidden) return;
      if (elements.projectDropdown.contains(event.target) || elements.projectMenuButton.contains(event.target)) return;
      closeProjectDropdown();
    });

    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        elements.pageSearch.focus();
        elements.pageSearch.select();
      }
    });

    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE.editorProduct && event.newValue && EDITORS[event.newValue]) {
        elements.editorSelect.value = event.newValue;
        updateEnvironmentHints();
      }
    });

    bindResizer();
    updateTopButtonVisibility();
  }

  function updateTopButtonVisibility() {
    elements.topButton.classList.toggle("visible", elements.contentScroll.scrollTop > 120);
  }

  function loadOpenFolders() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE.openFolders) || "[]");
      if (Array.isArray(parsed)) return new Set(parsed.map(normalizePath).filter(Boolean));
      if (!parsed || typeof parsed !== "object") return new Set();

      return new Set(Object.entries(parsed)
        .map(([parentPath, folderName]) => normalizePath(parentPath ? `${parentPath}/${folderName}` : folderName))
        .filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function saveOpenFolders() {
    localStorage.setItem(STORAGE.openFolders, JSON.stringify(Array.from(openFolders).sort((a, b) => a.localeCompare(b, "ja"))));
  }

  function toggleProjectDropdown() {
    const nextHidden = !elements.projectDropdown.hidden;
    elements.projectDropdown.hidden = nextHidden;
    elements.projectMenuButton.setAttribute("aria-expanded", String(!nextHidden));
    if (!nextHidden) renderProjectList();
  }

  function closeProjectDropdown() {
    elements.projectDropdown.hidden = true;
    elements.projectMenuButton.setAttribute("aria-expanded", "false");
  }

  function renderProjectList() {
    if (!elements.projectList) return;

    const items = projectHistory.map((project) => {
      const active = project.id === activeProjectId ? " active" : "";
      const projectName = project.name || project.folderName || "Markdown 文書";
      const projectPath = projectDisplayPath(project);
      const projectDate = project.lastOpenedAt ? formatProjectDate(project.lastOpenedAt) : "履歴";
      return `
        <div class="project-item">
          <button class="project-open${active}" type="button" data-project-id="${escapeAttr(project.id)}">
            <span class="project-name">${escapeHtml(projectName)}</span>
            <span class="project-meta">
              <span class="project-path">${escapeHtml(projectPath)}</span>
              <span class="project-date">${escapeHtml(projectDate)}</span>
            </span>
          </button>
          <button class="project-remove" type="button" data-remove-project-id="${escapeAttr(project.id)}" aria-label="${escapeAttr(projectName)} を履歴から削除">×</button>
        </div>`;
    }).join("");

    elements.projectList.innerHTML = items || '<div class="empty-state">履歴はまだありません。</div>';

    elements.projectList.querySelectorAll("[data-project-id]").forEach((button) => {
      button.addEventListener("click", () => openProjectFromHistory(button.dataset.projectId, { resetToReadme: true }));
    });
    elements.projectList.querySelectorAll("[data-remove-project-id]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        removeProjectFromHistory(button.dataset.removeProjectId);
      });
    });
  }

  function formatProjectDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function activeProjectDisplayPath() {
    return projectDisplayPath(projectHistory.find((project) => project.id === activeProjectId)) || rootDisplayName || "Markdown 文書";
  }

  function projectDisplayPath(project) {
    if (!project) return rootDisplayName || "";
    const editorRootPath = project.editorRootPaths && project.editorRootPaths[selectedEditorId()];
    return editorRootPath || project.folderName || project.handle?.name || project.name || "";
  }

  function bindResizer() {
    let startX = 0;
    let startWidth = 0;
    let dragging = false;

    elements.resizer.addEventListener("pointerdown", (event) => {
      dragging = true;
      startX = event.clientX;
      startWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width"));
      elements.resizer.setPointerCapture(event.pointerId);
      document.body.style.userSelect = "none";
    });

    elements.resizer.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const next = Math.min(560, Math.max(240, startWidth + event.clientX - startX));
      document.documentElement.style.setProperty("--sidebar-width", `${next}px`);
      localStorage.setItem(STORAGE.sidebarWidth, String(Math.round(next)));
    });

    elements.resizer.addEventListener("pointerup", (event) => {
      dragging = false;
      document.body.style.userSelect = "";
      elements.resizer.releasePointerCapture(event.pointerId);
    });
  }

  async function refreshIndexAndLoad() {
    showToast("Markdown一覧を読み込み中...");
    try {
      const paths = await loadMarkdownIndex();
      docs = await Promise.all(paths.map(async (path) => ({ path, title: await loadDocTitle(path) })));
      docs.sort(compareDocs);
      rootReadmeTitle = await loadRootReadmeTitle();

      if (!docs.length) {
        throw new Error("Markdown ファイルが見つかりませんでした。");
      }

      if (!docs.some((doc) => doc.path === activePath)) {
        activePath = docs.some((doc) => doc.path === README_PATH) ? README_PATH : docs[0].path;
        pendingHash = "";
      }

      updateEnvironmentHints();
      renderTree();
      await loadDoc(activePath, { hash: pendingHash, history: "replace" });
    } catch (error) {
      updateEnvironmentHints();
      renderTree();
      renderLoadError(error);
    }
  }

  async function loadMarkdownIndex() {
    await ensureDirectoryHandle();
    return indexDirectoryMarkdownFiles(rootDirectoryHandle);
  }

  async function ensureDirectoryHandle() {
    if (rootDirectoryHandle) {
      await verifyDirectoryPermission(rootDirectoryHandle);
      return;
    }

    const activeProject = projectHistory.find((project) => project.id === activeProjectId) || projectHistory[0];
    if (activeProject) {
      await openProjectFromHistory(activeProject.id, { refresh: false });
      if (rootDirectoryHandle) return;
    }

    throw new Error("Markdown フォルダが未選択です。上部の「Project一覧」から対象フォルダを選んでください。");
  }

  async function chooseMarkdownFolder() {
    if (!supportsFileSystemAccess()) {
      showToast("このブラウザは File System Access API に対応していません", "error", 5000);
      return;
    }

    try {
      const handle = await window.showDirectoryPicker({
        id: "markdown-docs-preview",
        mode: "read"
      });
      await verifyDirectoryPermission(handle);
      const existingProject = await findProjectForHandle(handle);
      const fallbackName = handle.name || "Markdown 文書";
      const projectTitle = await loadRootReadmeTitleFromHandle(handle, fallbackName);
      await setActiveProject({
        ...(existingProject || {}),
        id: existingProject ? existingProject.id : createProjectId(),
        name: projectTitle,
        folderName: fallbackName,
        handle,
        lastOpenedAt: new Date().toISOString()
      }, { resetToReadme: true });
      pendingHash = "";
      closeProjectDropdown();
      await refreshIndexAndLoad();
    } catch (error) {
      if (error && error.name === "AbortError") return;
      showToast(`フォルダ選択に失敗しました: ${error.message || error}`, "error", 5000);
    }
  }

  async function findProjectForHandle(handle) {
    if (!handle || typeof handle.isSameEntry !== "function") return null;
    for (const project of projectHistory) {
      try {
        if (project.handle && await handle.isSameEntry(project.handle)) return project;
      } catch {
        // Ignore stale handles and keep scanning the rest of the history.
      }
    }
    return null;
  }

  async function openProjectFromHistory(projectId, options = {}) {
    const project = projectHistory.find((item) => item.id === projectId);
    if (!project) return;

    try {
      await verifyDirectoryPermission(project.handle);
      const fallbackName = project.folderName || project.name || "Markdown 文書";
      const projectTitle = await loadRootReadmeTitleFromHandle(project.handle, fallbackName);
      await setActiveProject({
        ...project,
        name: projectTitle,
        folderName: project.folderName || project.handle.name || project.name || "Markdown 文書",
        lastOpenedAt: new Date().toISOString()
      }, { resetToReadme: options.resetToReadme === true });
      closeProjectDropdown();
      if (options.refresh !== false) await refreshIndexAndLoad();
    } catch (error) {
      showToast(`${project.name || "Project"} を開けませんでした。履歴から削除して選び直してください`, "error", 5000);
    }
  }

  async function setActiveProject(project, options = {}) {
    rootDirectoryHandle = project.handle;
    rootDisplayName = project.folderName || project.handle?.name || project.name || "Markdown 文書";
    rootReadmeTitle = project.name || rootDisplayName;
    activeProjectId = project.id;
    sessionStorage.setItem(STORAGE.activeProjectId, activeProjectId);
    if (options.resetToReadme) {
      activePath = README_PATH;
      pendingHash = "";
      sessionStorage.setItem(STORAGE.activePath, activePath);
    }

    const nextHistory = [
      project,
      ...projectHistory.filter((item) => item.id !== project.id)
    ].slice(0, 12);
    projectHistory = nextHistory;
    await storeProjectHistory();
    updateEnvironmentHints();
  }

  async function removeProjectFromHistory(projectId) {
    projectHistory = projectHistory.filter((project) => project.id !== projectId);
    await storeProjectHistory();
    if (activeProjectId === projectId) {
      activeProjectId = "";
      rootDirectoryHandle = null;
      rootDisplayName = "Markdown 文書";
      rootReadmeTitle = "";
      docs = [];
      sessionStorage.removeItem(STORAGE.activeProjectId);
      elements.navTree.innerHTML = "";
      elements.markdownBody.innerHTML = '<div class="empty-state">Project一覧から Markdown フォルダを選んでください。</div>';
    }
    updateEnvironmentHints();
  }

  function createProjectId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function verifyDirectoryPermission(handle) {
    const options = { mode: "read" };
    if (handle.queryPermission && await handle.queryPermission(options) === "granted") return;
    if (handle.requestPermission && await handle.requestPermission(options) === "granted") return;
    throw new Error("選択フォルダの読み取り許可がありません。");
  }

  async function indexDirectoryMarkdownFiles(directoryHandle, basePath = "") {
    const paths = [];
    for await (const [name, handle] of directoryHandle.entries()) {
      if (!name || name.startsWith(".")) continue;
      const path = normalizePath(basePath ? `${basePath}/${name}` : name);
      if (handle.kind === "file") {
        if (/\.md$/i.test(name) && name !== PREVIEW_FILE) paths.push(path);
      } else if (handle.kind === "directory") {
        paths.push(...await indexDirectoryMarkdownFiles(handle, path));
      }
    }
    return Array.from(new Set(paths));
  }

  async function loadDocTitle(path) {
    try {
      const markdown = await readMarkdownFile(path);
      return extractTitleFromMarkdown(markdown) || titleFromPath(path);
    } catch {
      return titleFromPath(path);
    }
  }

  async function loadRootReadmeTitle() {
    if (!docs.some((doc) => doc.path === README_PATH)) return "";
    return loadRootReadmeTitleFromHandle(rootDirectoryHandle, rootDisplayName);
  }

  async function loadRootReadmeTitleFromHandle(handle, fallbackTitle) {
    if (!handle) return fallbackTitle || "";
    try {
      const readmeHandle = await getFileHandleByPath(handle, README_PATH);
      const file = await readmeHandle.getFile();
      const markdown = await file.text();
      return extractTitleFromMarkdown(markdown) || fallbackTitle || "";
    } catch {
      return fallbackTitle || "";
    }
  }

  function extractTitleFromMarkdown(markdown) {
    const match = String(markdown || "").match(/^#\s+(.+?)\s*$/m);
    return match ? stripInlineMarkdown(match[1]).trim() : "";
  }

  function stripInlineMarkdown(value) {
    return String(value || "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  }

  async function readMarkdownFile(path) {
    await ensureDirectoryHandle();
    const handle = await getFileHandleByPath(rootDirectoryHandle, path);
    const file = await handle.getFile();
    return file.text();
  }

  async function getFileHandleByPath(directoryHandle, path) {
    const parts = normalizePath(path).split("/").filter(Boolean);
    let current = directoryHandle;
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      if (index === parts.length - 1) return current.getFileHandle(part);
      current = await current.getDirectoryHandle(part);
    }
    throw new Error("ファイルパスが空です。");
  }

  async function loadDoc(path, options = {}) {
    activePath = normalizePath(path);
    pendingHash = normalizeHistoryHash(options.hash);
    sessionStorage.setItem(STORAGE.activePath, activePath);
    openBranchForPath(activePath);
    elements.breadcrumb.textContent = activePath;
    renderTree();
    showToast("読み込み中...");

    try {
      const markdown = await readMarkdownFile(activePath);
      revokeObjectUrls();
      elements.markdownBody.innerHTML = renderMarkdown(markdown);
      await resolveRenderedImages();
      bindRenderedLinks();
      hideToast();
      await renderMermaidDiagrams();
      syncHistory(activePath, pendingHash, options.history || "push");
      restoreScrollOrHash();
      updateTopButtonVisibility();
    } catch (error) {
      elements.markdownBody.innerHTML = `<div class="empty-state"><h2>読み込めませんでした</h2><p>${escapeHtml(error.message || String(error))}</p></div>`;
      showToast(`${activePath} の読み込みに失敗しました`, "error", 5000);
    }
  }

  function renderLoadError(error) {
    const message = error && error.message ? error.message : String(error);
    const folderButton = supportsFileSystemAccess()
      ? '<p><button class="button" type="button" data-choose-folder>Markdown フォルダを選択</button></p>'
      : '<p>このブラウザは File System Access API に対応していません。Chrome または Edge で開いてください。</p>';
    elements.markdownBody.innerHTML = `
      <div class="empty-state">
        <h2>Markdown を読み込めませんでした</h2>
        <p>${escapeHtml(message)}</p>
        ${folderButton}
        <p>一度開いたドキュメントフォルダはProject一覧に追加され、次回から Project一覧の履歴から再利用できます。</p>
      </div>`;
    elements.markdownBody.querySelector("[data-choose-folder]")?.addEventListener("click", chooseMarkdownFolder);
    showToast("Markdown 一覧を取得できませんでした", "error", 5000);
  }

  async function runSearch() {
    const query = elements.pageSearch.value.trim();
    if (!query) {
      renderTree();
      await loadDoc(activePath || README_PATH);
      return;
    }

    showToast("検索中...");
    const normalizedQuery = normalizeForSearch(query);
    const results = [];

    await Promise.all(docs.map(async (doc) => {
      try {
        const markdown = await readMarkdownFile(doc.path);
        const haystack = normalizeForSearch(`${doc.title}\n${doc.path}\n${markdown}`);
        if (!haystack.includes(normalizedQuery)) return;

        results.push({
          path: doc.path,
          title: doc.title,
          snippet: createSnippet(markdown, query)
        });
      } catch {
        // Ignore individual file failures so one bad document does not break search.
      }
    }));

    results.sort((a, b) => a.path.localeCompare(b.path, "ja"));
    elements.breadcrumb.textContent = `検索: ${query}`;
    elements.markdownBody.innerHTML = renderSearchResults(query, results);
    bindSearchResultLinks();
    elements.contentScroll.scrollTop = 0;
    updateTopButtonVisibility();
    hideToast();
  }

  function renderSearchResults(query, results) {
    const escapedQuery = escapeHtml(query);
    const items = results.map((result) => `
      <a class="result-item" href="${escapeAttr(result.path)}" data-path="${escapeAttr(result.path)}">
        <span class="result-title">${escapeHtml(result.title)}</span>
        <span class="result-path">${escapeHtml(result.path)}</span>
        <p class="result-snippet">${escapeHtml(result.snippet || "パスまたはタイトルに一致しました。")}</p>
      </a>`).join("");

    return `
      <div class="search-results">
        <h1>検索結果</h1>
        <p class="search-summary">ヒット: ${results.length}件</p>
        ${items || '<div class="empty-state"><strong>' + escapedQuery + '</strong> に一致するページはありませんでした。</div>'}
      </div>`;
  }

  function bindSearchResultLinks() {
    elements.markdownBody.querySelectorAll("a[data-path]").forEach((anchor) => {
      anchor.addEventListener("click", (event) => {
        event.preventDefault();
        loadDoc(anchor.dataset.path);
      });
    });
  }

  function createSnippet(markdown, query) {
    const compact = markdown
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#>*_`\[\]()-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const lowerCompact = compact.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerCompact.indexOf(lowerQuery);
    if (index < 0) return compact.slice(0, 160);
    const start = Math.max(0, index - 55);
    const end = Math.min(compact.length, index + query.length + 105);
    return `${start > 0 ? "..." : ""}${compact.slice(start, end)}${end < compact.length ? "..." : ""}`;
  }

  function normalizeForSearch(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, " ");
  }

  function renderTree() {
    const query = elements.pageSearch.value.trim().toLowerCase();
    const filteredDocs = visibleTreeDocs().sort(compareDocs);

    if (!filteredDocs.length) {
      elements.navTree.innerHTML = '<div class="empty-state">ページタイトルのヒットなし。</div>';
      return;
    }

    if (query) {
      const visibleTarget = filteredDocs.find((doc) => doc.path === activePath) || filteredDocs[0];
      openBranchForPath(visibleTarget.path, { persist: false });
    }

    const root = makeTree(filteredDocs);
    elements.navTree.innerHTML = renderTreeNode(root, []);

    elements.navTree.querySelectorAll("button[data-folder-path]").forEach((button) => {
      button.addEventListener("click", () => toggleFolder(button.dataset.folderPath));
    });

    elements.navTree.querySelectorAll("button[data-path]").forEach((button) => {
      button.addEventListener("click", () => loadDoc(button.dataset.path));
    });
  }

  function openBranchForPath(path, options = {}) {
    const parts = normalizePath(path).split("/");
    for (let index = 0; index < parts.length - 1; index++) {
      openFolders.add(parts.slice(0, index + 1).join("/"));
    }

    if (options.persist !== false) saveOpenFolders();
  }

  function toggleFolder(folderPath) {
    const normalized = normalizePath(folderPath);
    if (openFolders.has(normalized)) {
      openFolders.delete(normalized);
    } else {
      openFolders.add(normalized);
    }

    saveOpenFolders();
    renderTree();
  }

  function expandAllFolders() {
    collectFolderPathsForDocs(visibleTreeDocs()).forEach((folderPath) => openFolders.add(folderPath));
    saveOpenFolders();
    renderTree();
  }

  function collapseAllFolders() {
    openFolders.clear();
    saveOpenFolders();
    renderTree();
  }

  function visibleTreeDocs() {
    const query = elements.pageSearch.value.trim().toLowerCase();
    return docs
      .filter((doc) => doc.path !== README_PATH)
      .filter((doc) => !query || doc.path.toLowerCase().includes(query) || doc.title.toLowerCase().includes(query));
  }

  function collectFolderPathsForDocs(docList) {
    const folders = new Set();
    for (const doc of docList) {
      const parts = normalizePath(doc.path).split("/");
      for (let index = 0; index < parts.length - 1; index++) {
        folders.add(parts.slice(0, index + 1).join("/"));
      }
    }
    return folders;
  }

  function makeTree(docList) {
    const root = { folders: new Map(), pages: [] };
    for (const doc of docList) {
      const parts = doc.path.split("/");
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!node.folders.has(parts[i])) node.folders.set(parts[i], { folders: new Map(), pages: [] });
        node = node.folders.get(parts[i]);
      }
      node.pages.push(doc);
    }
    return root;
  }

  function renderTreeNode(node, folderPath) {
    const folders = Array.from(node.folders.entries()).sort(([a], [b]) => a.localeCompare(b, "ja"));
    const pages = node.pages.sort(compareDocs);
    let html = "<ul>";

    for (const page of pages) {
      const active = page.path === activePath ? " active" : "";
      html += `<li><button type="button" class="page-link${active}" data-path="${escapeAttr(page.path)}"><span class="page-title">${escapeHtml(page.title)}</span></button></li>`;
    }

    for (const [name, child] of folders) {
      const nextPath = [...folderPath, name];
      const folderPathString = nextPath.join("/");
      const isOpen = openFolders.has(folderPathString);
      const openClass = isOpen ? " open" : "";
      const childHtml = isOpen ? renderTreeNode(child, nextPath) : "";
      html += `<li><button type="button" class="folder-toggle${openClass}" data-folder-path="${escapeAttr(folderPathString)}" aria-expanded="${isOpen ? "true" : "false"}"><span class="folder-caret" aria-hidden="true"></span><span class="folder-label-main">${escapeHtml(folderTitleFromName(name))}</span></button>${childHtml}</li>`;
    }

    html += "</ul>";
    return html;
  }

  function folderTitleFromName(name) {
    return String(name || "")
      .replace(/^\d+[_-]/, "")
      .replace(/[_-]+/g, " ")
      .trim() || name;
  }

  function renderMarkdown(source) {
    const lines = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    let html = "";
    let index = 0;
    let headingCount = 0;

    while (index < lines.length) {
      const line = lines[index];

      if (/^\s*$/.test(line)) {
        index++;
        continue;
      }

      const fence = line.match(/^```\s*([^`]*)\s*$/);
      if (fence) {
        const languageName = (fence[1] || "").trim();
        const codeLines = [];
        index++;
        while (index < lines.length && !/^```\s*$/.test(lines[index])) {
          codeLines.push(lines[index]);
          index++;
        }
        if (index < lines.length) index++;
        if (languageName.toLowerCase() === "mermaid") {
          html += `<div class="mermaid">${escapeHtml(codeLines.join("\n"))}</div>`;
        } else {
          const language = languageName ? `language-${escapeAttr(languageName)}` : "";
          html += `<pre><code class="${language}">${escapeHtml(codeLines.join("\n"))}</code></pre>`;
        }
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        const text = heading[2].trim();
        const id = slugifyHeading(text) || `heading-${++headingCount}`;
        html += `<h${level} id="${escapeAttr(id)}">${parseInline(text)}</h${level}>`;
        index++;
        continue;
      }

      if (/^\s*---+\s*$/.test(line)) {
        html += "<hr>";
        index++;
        continue;
      }

      if (isTableStart(lines, index)) {
        const table = collectTable(lines, index);
        html += renderTable(table.rows);
        index = table.nextIndex;
        continue;
      }

      if (/^>\s?/.test(line)) {
        const block = [];
        while (index < lines.length && /^>\s?/.test(lines[index])) {
          block.push(lines[index].replace(/^>\s?/, ""));
          index++;
        }
        html += `<blockquote>${renderBlockquote(block)}</blockquote>`;
        continue;
      }

      if (isListLine(line)) {
        const list = [];
        while (index < lines.length && isListLine(lines[index])) {
          list.push(lines[index]);
          index++;
        }
        html += renderList(list);
        continue;
      }

      const paragraph = [line.trim()];
      index++;
      while (index < lines.length && !isBlockStart(lines, index)) {
        if (!/^\s*$/.test(lines[index])) paragraph.push(lines[index].trim());
        index++;
      }
      html += `<p>${parseInline(paragraph.join(" "))}</p>`;
    }

    return html;
  }

  function renderBlockquote(lines) {
    const blocks = [];
    let paragraph = [];

    for (const line of lines) {
      if (/^\s*$/.test(line)) {
        if (paragraph.length) {
          blocks.push(paragraph);
          paragraph = [];
        }
      } else {
        paragraph.push(line.trim());
      }
    }

    if (paragraph.length) blocks.push(paragraph);
    return blocks.map((block) => block.map((item) => `<p>${parseInline(item)}</p>`).join("")).join("");
  }

  function isBlockStart(lines, index) {
    const line = lines[index] || "";
    if (/^\s*$/.test(line)) return true;
    return /^```/.test(line) || /^(#{1,6})\s+/.test(line) || /^>\s?/.test(line) || isListLine(line) || isTableStart(lines, index) || /^\s*---+\s*$/.test(line);
  }

  function isListLine(line) {
    return /^\s*(?:[-*+] |\d+\.\s+)/.test(line);
  }

  function renderList(lines) {
    const entries = lines.map(parseListLine).filter(Boolean);
    const root = buildListTree(entries);
    return renderListGroups(root.children);
  }

  function parseListLine(line) {
    const match = line.match(/^(\s*)(?:([-*+])|(\d+)\.)\s+(.+)$/);
    if (!match) return null;
    return {
      indent: match[1].replace(/\t/g, "  ").length,
      ordered: Boolean(match[3]),
      content: match[4].trim(),
      children: []
    };
  }

  function buildListTree(entries) {
    const root = { indent: -1, children: [] };
    const stack = [root];

    for (const entry of entries) {
      while (stack.length > 1 && entry.indent <= stack[stack.length - 1].indent) {
        stack.pop();
      }

      stack[stack.length - 1].children.push(entry);
      stack.push(entry);
    }

    return root;
  }

  function renderListGroups(nodes) {
    let html = "";
    let index = 0;

    while (index < nodes.length) {
      const ordered = nodes[index].ordered;
      const group = [];
      while (index < nodes.length && nodes[index].ordered === ordered) {
        group.push(nodes[index]);
        index++;
      }
      html += renderListGroup(group, ordered);
    }

    return html;
  }

  function renderListGroup(nodes, ordered) {
    const tag = ordered ? "ol" : "ul";
    const isTaskList = !ordered && nodes.length > 0 && nodes.every((node) => isTaskItemContent(node.content));
    const className = isTaskList ? ' class="task-list"' : "";
    const items = nodes.map((node) => {
      const itemClass = isTaskItemContent(node.content) ? ' class="task-list-item"' : "";
      const children = node.children.length ? renderListGroups(node.children) : "";
      return `<li${itemClass}>${renderTaskOrInline(node.content)}${children}</li>`;
    }).join("");
    return `<${tag}${className}>${items}</${tag}>`;
  }

  function isTaskItemContent(content) {
    return /^\[( |x|X)\]\s+/.test(content);
  }

  function renderTaskOrInline(content) {
    const task = content.match(/^\[( |x|X)\]\s+(.+)$/);
    if (!task) return parseInline(content);
    const checked = task[1].toLowerCase() === "x" ? " checked" : "";
    return `<label class="task-item"><input type="checkbox" disabled${checked}> <span>${parseInline(task[2])}</span></label>`;
  }

  function isTableStart(lines, index) {
    const current = lines[index] || "";
    const next = lines[index + 1] || "";
    return current.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(next);
  }

  function collectTable(lines, index) {
    const rows = [splitTableRow(lines[index])];
    index += 2;
    while (index < lines.length && lines[index].includes("|") && !/^\s*$/.test(lines[index])) {
      rows.push(splitTableRow(lines[index]));
      index++;
    }
    return { rows, nextIndex: index };
  }

  function splitTableRow(line) {
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  }

  function renderTable(rows) {
    const header = rows[0] || [];
    const bodyRows = rows.slice(1);
    const headHtml = header.map((cell) => `<th>${parseInline(cell)}</th>`).join("");
    const bodyHtml = bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${parseInline(cell)}</td>`).join("")}</tr>`).join("");
    return `<div class="table-wrap"><table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
  }

  function parseInline(text) {
    const codeParts = [];
    let working = text.replace(/`([^`]+)`/g, (_match, code) => {
      const key = `@@CODE${codeParts.length}@@`;
      codeParts.push(`<code>${escapeHtml(code)}</code>`);
      return key;
    });

    let html = escapeHtml(working);
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
      const cleanSrc = src.trim();
      return `<img alt="${escapeAttr(alt)}" data-image-src="${escapeAttr(cleanSrc)}">`;
    });
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
      return `<a href="${escapeAttr(href.trim())}">${label}</a>`;
    });
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/@@CODE(\d+)@@/g, (_match, number) => codeParts[Number(number)] || "");
    return html;
  }

  async function renderMermaidDiagrams() {
    const diagrams = Array.from(elements.markdownBody.querySelectorAll(".mermaid"));
    if (!diagrams.length) return;

    if (!window.mermaid) {
      showToast("Mermaid を読み込めませんでした。図はコードとして残っています", "error", 5000);
      return;
    }

    try {
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: document.documentElement.dataset.theme === "dark" ? "dark" : "default"
      });
      await window.mermaid.run({ nodes: diagrams });
    } catch (error) {
      showToast(`Mermaid 図の描画に失敗しました: ${error.message || error}`, "error", 5000);
    }
  }

  async function resolveRenderedImages() {
    const images = Array.from(elements.markdownBody.querySelectorAll("img[data-image-src]"));
    if (!images.length) return;

    await Promise.all(images.map(async (image) => {
      const rawSrc = image.dataset.imageSrc || "";
      if (!rawSrc) return;

      if (/^(https?:|data:|blob:)/i.test(rawSrc)) {
        image.src = rawSrc;
        image.removeAttribute("data-image-src");
        return;
      }

      const resolvedPath = resolveAssetPath(rawSrc, activePath);
      try {
        const handle = await getFileHandleByPath(rootDirectoryHandle, resolvedPath);
        const file = await handle.getFile();
        const url = URL.createObjectURL(file);
        objectUrls.push(url);
        image.src = url;
        image.title = resolvedPath;
        image.removeAttribute("data-image-src");
      } catch {
        image.replaceWith(renderMissingImage(rawSrc));
      }
    }));
  }

  function resolveAssetPath(rawPath, fromPath) {
    const [pathOnly] = String(rawPath || "").split("#");
    const baseParts = normalizePath(fromPath).split("/");
    baseParts.pop();

    for (const part of pathOnly.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") baseParts.pop();
      else baseParts.push(part);
    }

    return normalizePath(baseParts.join("/"));
  }

  function renderMissingImage(src) {
    const element = document.createElement("span");
    element.className = "missing-image";
    element.textContent = `画像を読み込めませんでした: ${src}`;
    return element;
  }

  function revokeObjectUrls() {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls = [];
  }

  function bindRenderedLinks() {
    elements.markdownBody.querySelectorAll("a[href]").forEach((anchor) => {
      const href = anchor.getAttribute("href");
      if (!href || /^(https?:|mailto:|#)/i.test(href)) return;
      const resolved = resolveDocLink(href, activePath);
      if (!resolved || !docs.some((doc) => doc.path === resolved.path)) return;
      anchor.addEventListener("click", (event) => {
        event.preventDefault();
        loadDoc(resolved.path, { hash: resolved.hash });
      });
    });
  }

  function resolveDocLink(href, fromPath) {
    const [rawPath, hash = ""] = href.split("#");
    if (!rawPath.toLowerCase().endsWith(".md")) return null;
    const baseParts = fromPath.split("/");
    baseParts.pop();
    const parts = rawPath.split("/");
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") baseParts.pop();
      else baseParts.push(part);
    }
    return { path: normalizePath(baseParts.join("/")), hash };
  }

  function restoreScrollOrHash() {
    window.setTimeout(() => {
      if (pendingHash) {
        const target = document.getElementById(pendingHash) || document.getElementById(slugifyHeading(decodeHashSafely(pendingHash)));
        if (target) {
          target.scrollIntoView({ block: "start" });
          updateTopButtonVisibility();
          return;
        }
      }

      elements.contentScroll.scrollTop = 0;
      updateTopButtonVisibility();
    }, 30);
  }

  function syncHistory(path, hash, mode) {
    if (mode === "none" || !window.history) return;

    const normalizedPath = normalizePath(path || "README.md");
    const normalizedHash = normalizeHistoryHash(hash);
    const state = { docPath: normalizedPath, hash: normalizedHash, projectId: activeProjectId || "" };
    const url = buildHistoryUrl(normalizedPath, normalizedHash);

    if (mode === "replace" || isCurrentHistoryRoute(normalizedPath, normalizedHash)) {
      window.history.replaceState(state, "", url);
    } else {
      window.history.pushState(state, "", url);
    }
  }

  function readHistoryRouteFromState(state) {
    if (state && typeof state === "object" && typeof state.docPath === "string") {
      return {
        path: normalizePath(state.docPath),
        hash: normalizeHistoryHash(state.hash),
        projectId: normalizeProjectId(state.projectId)
      };
    }

    return readHistoryRouteFromLocation();
  }

  function readHistoryRouteFromLocation() {
    const params = new URLSearchParams(location.search);
    return {
      path: normalizePath(params.get("doc") || ""),
      hash: normalizeHistoryHash(location.hash),
      projectId: normalizeProjectId(params.get("project") || "")
    };
  }

  function buildHistoryUrl(path, hash) {
    const url = new URL(location.href);
    url.searchParams.set("doc", normalizePath(path || "README.md"));
    if (activeProjectId) url.searchParams.set("project", activeProjectId);
    else url.searchParams.delete("project");
    const normalizedHash = normalizeHistoryHash(hash);
    url.hash = normalizedHash ? encodeURIComponent(decodeHashSafely(normalizedHash)) : "";
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function isCurrentHistoryRoute(path, hash) {
    const current = readHistoryRouteFromLocation();
    return normalizePath(current.path) === normalizePath(path)
      && normalizeHistoryHash(current.hash) === normalizeHistoryHash(hash)
      && normalizeProjectId(current.projectId) === normalizeProjectId(activeProjectId);
  }

  function normalizeHistoryHash(hash) {
    return String(hash || "").replace(/^#/, "");
  }

  function normalizeProjectId(projectId) {
    return String(projectId || "").trim();
  }

  function decodeHashSafely(hash) {
    try {
      return decodeURIComponent(normalizeHistoryHash(hash));
    } catch {
      return normalizeHistoryHash(hash);
    }
  }

  function showToast(message, type = "info", durationMs = 0) {
    window.clearTimeout(toastTimer);
    elements.toast.hidden = false;
    elements.toast.textContent = message;
    elements.toast.dataset.status = type;

    if (durationMs > 0) {
      toastTimer = window.setTimeout(hideToast, durationMs);
    }
  }

  function hideToast() {
    window.clearTimeout(toastTimer);
    toastTimer = 0;
    elements.toast.hidden = true;
    elements.toast.textContent = "";
    delete elements.toast.dataset.status;
  }

  async function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "" : "dark";
    if (next) document.documentElement.dataset.theme = next;
    else delete document.documentElement.dataset.theme;
    localStorage.setItem(STORAGE.theme, next || "light");
    await reloadActiveDocForTheme();
  }

  async function reloadActiveDocForTheme() {
    if (!rootDirectoryHandle || !docs.some((doc) => doc.path === activePath)) return;
    if (!elements.markdownBody.querySelector(".mermaid")) return;
    const scrollTop = elements.contentScroll.scrollTop;
    await loadDoc(activePath, { hash: pendingHash, history: "replace" });
    if (!pendingHash) {
      window.setTimeout(() => {
        elements.contentScroll.scrollTop = scrollTop;
        updateTopButtonVisibility();
      }, 40);
    }
  }

  async function copyActivePath() {
    const copyPath = pathWithRootFolder(activePath);
    try {
      await navigator.clipboard.writeText(copyPath);
      showToast(`${copyPath} をコピーしました`, "info", 3000);
    } catch {
      showToast("クリップボードへコピーできませんでした", "error", 5000);
    }
  }

  function pathWithRootFolder(path) {
    const normalizedPath = normalizePath(path);
    const folderName = normalizePath(rootDisplayName || rootDirectoryHandle?.name || "");
    return folderName ? normalizePath(`${folderName}/${normalizedPath}`) : normalizedPath;
  }

  async function openActivePathInEditor() {
    if (!rootDirectoryHandle || !activeProjectId || !docs.some((doc) => doc.path === activePath)) {
      showToast("開く対象のページがありません", "error", 5000);
      return;
    }

    const editorId = selectedEditorId();
    localStorage.setItem(STORAGE.editorProduct, editorId);

    const rootPath = await ensureEditorRootPath(editorId);
    if (!rootPath) return;

    const filePath = joinLocalPath(rootPath, activePath);
    window.location.href = editorFileUrl(editorId, filePath);
  }

  async function ensureEditorRootPath(editorId) {
    const project = projectHistory.find((item) => item.id === activeProjectId);
    if (!project) return "";

    const current = project.editorRootPaths && project.editorRootPaths[editorId];
    if (current) return current;

    const editor = EDITORS[editorId] || EDITORS.vscode;
    const input = window.prompt(editorRootPathPromptMessage(editorId), "");
    if (input === null) return "";

    const rootPath = deriveEditorRootPath(input, activePath);
    if (!isLikelyAbsolutePath(rootPath)) {
      showToast("絶対Pathを入力してください", "error", 5000);
      return "";
    }

    project.editorRootPaths = {
      ...(project.editorRootPaths || {}),
      [editorId]: rootPath
    };
    projectHistory = [
      project,
      ...projectHistory.filter((item) => item.id !== project.id)
    ];
    await storeProjectHistory();
    updateEnvironmentHints();
    showToast(`${editor.label} 用のPathを保存しました`, "info", 3000);
    return rootPath;
  }

  function editorRootPathPromptMessage(editorId) {
    const editor = EDITORS[editorId] || EDITORS.vscode;
    const example = `${rootDisplayName || "project-docs"}`;
    return `${editor.label} で開くため、初回だけドキュメントルートの絶対Pathを入力してください。\n\n` +
      `例: D:\\Projects\\Example\\${example.replace(/\//g, "\\")}\n`;
  }

  function selectedEditorId() {
    return EDITORS[elements.editorSelect.value] ? elements.editorSelect.value : "vscode";
  }

  function deriveEditorRootPath(input, relativeFilePath) {
    let value = normalizeLocalPathInput(input);

    for (const relative of editorRootPathSuffixes(relativeFilePath)) {
      value = stripPathSuffix(value, relative);
    }

    return value;
  }

  function normalizeLocalPathInput(input) {
    return String(input || "")
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
  }

  function editorRootPathSuffixes(relativeFilePath) {
    return Array.from(new Set([
      normalizePath(relativeFilePath),
      pathWithRootFolder(relativeFilePath)
    ].filter(Boolean)));
  }

  function stripPathSuffix(path, suffix) {
    const normalizedSuffix = normalizePath(suffix);
    const comparablePath = path.toLowerCase();
    const comparableSuffix = normalizedSuffix.toLowerCase();
    if (!comparablePath.endsWith(`/${comparableSuffix}`)) return path;
    return path.slice(0, path.length - normalizedSuffix.length - 1).replace(/\/+$/, "");
  }

  function isLikelyAbsolutePath(path) {
    return /^[a-zA-Z]:\//.test(path) || /^\/[^/]/.test(path) || /^\/\/[^/]+\/[^/]+/.test(path);
  }

  function joinLocalPath(rootPath, relativePath) {
    return `${String(rootPath || "").replace(/[\\/]+$/, "")}/${normalizePath(relativePath)}`;
  }

  function editorFileUrl(editorId, filePath) {
    const editor = EDITORS[editorId] || EDITORS.vscode;
    const normalized = String(filePath || "").replace(/\\/g, "/");
    const encoded = encodeURI(normalized).replace(/#/g, "%23").replace(/\?/g, "%3F");
    return `${editor.scheme}://file/${encoded}`;
  }

  function supportsFileSystemAccess() {
    return typeof window.showDirectoryPicker === "function" && typeof indexedDB !== "undefined";
  }

  async function loadProjectHistory() {
    if (!supportsFileSystemAccess()) {
      projectHistory = [];
      return;
    }

    const stored = await readFromHandleStore(STORAGE.projects);
    projectHistory = Array.isArray(stored) ? stored.filter((project) => project && project.id && project.handle) : [];
  }

  async function storeProjectHistory() {
    if (!supportsFileSystemAccess()) return;
    await writeToHandleStore(STORAGE.projects, projectHistory);
  }

  function openHandleStore(mode) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB.name, DB.version);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(DB.store);
      };
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(DB.store, mode);
        resolve({
          database,
          store: transaction.objectStore(DB.store),
          transaction
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function readFromHandleStore(key) {
    const { database, store, transaction } = await openHandleStore("readonly");
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => {
        database.close();
        reject(transaction.error);
      };
    });
  }

  async function writeToHandleStore(key, value) {
    const { database, store, transaction } = await openHandleStore("readwrite");
    return new Promise((resolve, reject) => {
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => {
        database.close();
        reject(transaction.error);
      };
    });
  }

  function compareDocs(a, b) {
    if (a.path === README_PATH) return -1;
    if (b.path === README_PATH) return 1;
    return a.path.localeCompare(b.path, "ja");
  }

  function titleFromPath(path) {
    const file = normalizePath(path).split("/").pop() || path;
    return file.replace(/\.md$/i, "").replace(/_/g, " ");
  }

  function normalizePath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
  }

  function slugifyHeading(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .replace(/`/g, "")
      .replace(/[^\p{L}\p{N}\s_-]+/gu, "")
      .replace(/\s+/g, "-");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }
})();
