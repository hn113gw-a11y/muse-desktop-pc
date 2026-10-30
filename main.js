// Muse Desktop 2.1 - lam theo cach Claude Desktop chay tren may nay (Electron 44, MSIX 4.29):
//  - thanh tieu de tu ve + nut cua so cua Windows (titleBarOverlay), noi dung web nam ben duoi
//  - nho vi tri/kich thuoc cua so (window-state.json), cai dat rieng (config.json)
//  - chay cung Windows o che do an (--startup), dong cua so = thu xuong khay
//  - nhat ky logs/main.log + bao loi sap (Crashpad, chi luu tren may)
//  - man cho khi dang tai, tu thu lai khi mat mang / trang sap / trang treo
const fs = require('fs');
const path = require('path');
const {
  app, BaseWindow, BrowserWindow, WebContentsView, shell, Menu, Tray, globalShortcut,
  Notification, dialog, nativeImage, session, screen, powerMonitor, crashReporter, ipcMain, clipboard,
} = require('electron');

const APP_ID = 'ai.muse.desktop.pc';
const MUSE_URL = process.env.MUSE_DESKTOP_URL || 'https://muse.ai/';
const PROTOCOL = 'muse-desktop';
const QUICK_HOTKEY = 'Control+Shift+Space';
const PARTITION = 'persist:muse';
const BAR_H = 36;           // chieu cao thanh tieu de
const CONTROLS_W = 138;     // vung 3 nut cua so cua Windows (titleBarOverlay)
let START_HIDDEN = process.argv.includes('--startup');   // hoac vua tu cap nhat luc dang an o khay

const ICON_ICO = path.join(__dirname, 'assets', 'icon.ico');
const ICON_PNG = path.join(__dirname, 'assets', 'icon.png');
const appIcon = () => nativeImage.createFromPath(process.platform === 'win32' ? ICON_ICO : ICON_PNG);

// Cac domain duoc mo ngay trong app (Muse va dang nhap Meta/Facebook/Instagram).
// Ngoai cac domain nay, link se mo bang trinh duyet mac dinh.
const INTERNAL_HOSTS = [
  'muse.ai', 'meta.com', 'meta.ai', 'facebook.com', 'instagram.com', 'accountscenter.instagram.com',
];

function isInternal(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'file:') return u.pathname.endsWith('/offline.html');
    if (process.env.MUSE_DESKTOP_URL && u.origin === new URL(MUSE_URL).origin) return true;   // chi khi chay thu
    if (u.protocol !== 'https:') return false;
    return INTERNAL_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

// ---------- nhat ky (giong logs/ cua Claude) ----------
let logFile = null;
function log(...a) {
  const line = `[${new Date().toISOString()}] ${a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`;
  try {
    if (!logFile) {
      const dir = path.join(app.getPath('userData'), 'logs');
      fs.mkdirSync(dir, { recursive: true });
      logFile = path.join(dir, 'main.log');
      if (fs.existsSync(logFile) && fs.statSync(logFile).size > 5 * 1024 * 1024) fs.renameSync(logFile, path.join(dir, 'main.old.log'));
    }
    fs.appendFileSync(logFile, line);
  } catch { /* khong ghi duoc nhat ky thi bo qua */ }
}

// ---------- cai dat + vi tri cua so (window-state.json, config.json nhu Claude) ----------
function readJson(name, def) {
  try { return { ...def, ...JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), name), 'utf8')) }; } catch { return { ...def }; }
}
function writeJson(name, obj) {
  try {
    const f = path.join(app.getPath('userData'), name);
    fs.writeFileSync(f + '.tmp', JSON.stringify(obj, null, 2));
    fs.renameSync(f + '.tmp', f);
  } catch (e) { log('loi ghi', name, String(e)); }
}
let config = null;
const saveConfig = () => writeJson('config.json', config);

function visibleOnSomeDisplay(b) {
  return screen.getAllDisplays().some(({ workArea: w }) =>
    b.x + 100 > w.x && b.y + 40 > w.y && b.x < w.x + w.width - 100 && b.y < w.y + w.height - 40);
}

let mainWindow = null;      // BaseWindow
let barView = null;         // thanh tieu de (titlebar.html)
let museView = null;        // noi dung muse.ai
let quickWindow = null;
let tray = null;
let isQuitting = false;
let firstLoadDone = false;
const crashTimes = [];

// ---------- thanh tieu de ----------
function layout() {
  if (!mainWindow) return;
  const { width, height } = mainWindow.getContentBounds();
  const full = mainWindow.isFullScreen();
  barView.setVisible(!full);
  barView.setBounds({ x: 0, y: 0, width, height: full ? 0 : BAR_H });
  museView.setBounds({ x: 0, y: full ? 0 : BAR_H, width, height: Math.max(0, height - (full ? 0 : BAR_H)) });
}

function pushBarState() {
  if (!barView || barView.webContents.isDestroyed() || !museView) return;
  const wc = museView.webContents;
  const h = wc.navigationHistory;
  barView.webContents.send('bar:state', {
    back: h.canGoBack(), fwd: h.canGoForward(), loading: wc.isLoading(),
    title: wc.getTitle() || 'Muse', offline: wc.getURL().startsWith('file:'),
    controlsW: CONTROLS_W, update: pendingUpdate ? pendingUpdate.version : null,
    version: app.getVersion(), electron: process.versions.electron, updatedAt: config && config.updated_at || 0,
  });
}

function showOffline(reason, detail) {
  if (!museView) return;
  log('hien man mat ket noi:', reason, detail || '');
  museView.webContents.loadFile(path.join(__dirname, 'offline.html'), { query: { r: reason, d: String(detail || ''), u: MUSE_URL } });
}

// ---------- quan ly cua so chinh ----------
function attachWebHandlers(wc, win, isMain) {
  wc.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: appIcon() } };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (event, url) => {
    if (!isInternal(url) && !url.startsWith('about:')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  // Menu chuot phai (Electron mac dinh khong co)
  wc.on('context-menu', (_e, p) => {
    const t = [];
    if (p.linkURL) {
      t.push({ label: 'Mở liên kết bằng trình duyệt', click: () => shell.openExternal(p.linkURL) });
      t.push({ label: 'Sao chép liên kết', click: () => clipboard.writeText(p.linkURL) });
      t.push({ type: 'separator' });
    }
    if (p.mediaType === 'image' && p.srcURL) {
      t.push({ label: 'Sao chép ảnh', click: () => wc.copyImageAt(p.x, p.y) });
      t.push({ label: 'Lưu ảnh…', click: () => wc.downloadURL(p.srcURL) });
      t.push({ type: 'separator' });
    }
    if (p.mediaType === 'video' && p.srcURL) {
      t.push({ label: 'Lưu video…', click: () => wc.downloadURL(p.srcURL) });
      t.push({ type: 'separator' });
    }
    if (p.isEditable) {
      t.push({ label: 'Hoàn tác', role: 'undo', enabled: p.editFlags.canUndo });
      t.push({ label: 'Làm lại', role: 'redo', enabled: p.editFlags.canRedo });
      t.push({ type: 'separator' });
      t.push({ label: 'Cắt', role: 'cut', enabled: p.editFlags.canCut });
      t.push({ label: 'Sao chép', role: 'copy', enabled: p.editFlags.canCopy });
      t.push({ label: 'Dán', role: 'paste', enabled: p.editFlags.canPaste });
      t.push({ label: 'Chọn tất cả', role: 'selectAll' });
    } else if (p.selectionText) {
      t.push({ label: 'Sao chép', role: 'copy' });
    }
    if (isMain) {
      if (t.length) t.push({ type: 'separator' });
      t.push({ label: 'Quay lại', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() });
      t.push({ label: 'Tải lại', click: () => reloadMuse() });
    }
    if (t.length) Menu.buildFromTemplate(t).popup({ window: win });
  });
  // Phim tat (thanh tieu de tu ve nen khong dung menu ung dung)
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const k = input.key.toLowerCase(), ctrl = input.control || input.meta;
    let done = true;
    if ((ctrl && k === 'r') || k === 'f5') reloadMuse(win === quickWindow ? quickWindow.webContents : null);
    else if (ctrl && k === 'w') win.hide();
    else if (ctrl && k === 'q') { isQuitting = true; app.quit(); }
    else if (k === 'f11' && isMain) mainWindow.setFullScreen(!mainWindow.isFullScreen());
    else if (ctrl && (k === '=' || k === '+')) wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 4));
    else if (ctrl && k === '-') wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -3));
    else if (ctrl && k === '0') wc.setZoomLevel(0);
    else if (input.alt && k === 'arrowleft' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else if (input.alt && k === 'arrowright' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    else if (k === 'escape' && win === quickWindow) quickWindow.hide();
    else done = false;
    if (done) event.preventDefault();
  });
  // Trang sap -> tu tai lai (toi da 3 lan/phut), qua nhieu thi hien man bao loi
  wc.on('render-process-gone', (_e, d) => {
    log('trang muse bi tat:', d.reason, d.exitCode);
    if (d.reason === 'clean-exit' || isQuitting) return;
    const now = Date.now();
    crashTimes.push(now);
    while (crashTimes.length && now - crashTimes[0] > 60000) crashTimes.shift();
    if (!isMain) { setTimeout(() => !wc.isDestroyed() && wc.loadURL(MUSE_URL), 1000); return; }
    if (crashTimes.length <= 3) setTimeout(() => reloadMuse(), 1000);
    else showOffline('crash', d.reason);
  });
  wc.on('unresponsive', async () => {
    log('trang muse khong phan hoi');
    if (!isMain || !mainWindow || !mainWindow.isVisible()) return;
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning', title: 'Muse Desktop', message: 'Muse đang không phản hồi.',
      detail: 'Có thể trang đang bận. Đợi thêm hoặc tải lại trang.', buttons: ['Đợi', 'Tải lại'], defaultId: 0, cancelId: 0,
    });
    if (response === 1) wc.forcefullyCrashRenderer();
  });
}

function reloadMuse(wc) {
  const w = wc || (museView && museView.webContents);
  if (!w) return;
  if (w.getURL().startsWith('file:') || !w.getURL()) w.loadURL(MUSE_URL);
  else w.reload();
}

function createMainWindow() {
  const st = readJson('window-state.json', { width: 1280, height: 860, isMaximized: false });
  const pos = st.x !== undefined && visibleOnSomeDisplay(st) ? { x: st.x, y: st.y } : {};
  mainWindow = new BaseWindow({
    width: st.width, height: st.height, ...pos, minWidth: 900, minHeight: 600,
    title: 'Muse Desktop', icon: appIcon(), show: false, backgroundColor: '#ffffff',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#f6f6f7', symbolColor: '#3b3b40', height: BAR_H },
  });

  barView = new WebContentsView({
    webPreferences: { preload: path.join(__dirname, 'titlebar-preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  barView.setBackgroundColor('#f6f6f7');
  museView = new WebContentsView({
    webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false,
      backgroundThrottling: false },   // Muse lam viec lau (tao video...): khong ham trang khi cua so bi che/thu xuong khay
  });
  museView.setBackgroundColor('#ffffff');
  mainWindow.contentView.addChildView(museView);
  mainWindow.contentView.addChildView(barView);
  layout();

  barView.webContents.loadFile(path.join(__dirname, 'titlebar.html'));
  barView.webContents.on('will-navigate', (e) => e.preventDefault());
  barView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const wc = museView.webContents;
  attachWebHandlers(wc, mainWindow, true);
  for (const ev of ['did-start-loading', 'did-stop-loading', 'page-title-updated', 'did-navigate', 'did-navigate-in-page']) wc.on(ev, pushBarState);
  wc.on('did-finish-load', () => {
    if (!wc.getURL().startsWith('file:')) { firstLoadDone = true; config.lastGoodLoad = Date.now(); }
    pushBarState();
  });
  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || String(url).startsWith('file:')) return;   // -3 = huy tai (chuyen trang)
    showOffline('load', `${desc} (${code})`);
  });
  wc.loadURL(MUSE_URL);

  if (st.isMaximized) mainWindow.maximize();
  if (!START_HIDDEN) mainWindow.show();

  let saveTimer = null;
  const saveState = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isMinimized() || mainWindow.isFullScreen()) return;
      const max = mainWindow.isMaximized();
      const b = max ? (readJson('window-state.json', {})) : mainWindow.getBounds();
      writeJson('window-state.json', { x: b.x, y: b.y, width: b.width, height: b.height, isMaximized: max });
    }, 500);
  };
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize']) mainWindow.on(ev, saveState);
  for (const ev of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'restore']) mainWindow.on(ev, () => setImmediate(layout));

  // Windows tat may / dang xuat: cho thoat that, khong chan
  mainWindow.on('session-end', () => { isQuitting = true; log('windows ket thuc phien'); });

  // Dong cua so = thu xuong khay (giong Claude), khong thoat app
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
    if (!config.trayTipShown && Notification.isSupported()) {
      config.trayTipShown = true;
      saveConfig();
      const n = new Notification({
        title: 'Muse Desktop vẫn đang chạy',
        body: 'Muse ở trong khay hệ thống. Bấm biểu tượng Muse ở góc phải thanh taskbar để mở lại, hoặc nhấn Ctrl+Shift+Space để gọi nhanh.',
        icon: appIcon(),
      });
      n.on('click', showMainWindow);
      n.show();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; barView = null; museView = null; });
}

ipcMain.on('bar:cmd', (e, cmd) => {
  if (!barView || e.sender !== barView.webContents || !museView) return;
  const wc = museView.webContents, h = wc.navigationHistory;
  if (cmd === 'back' && h.canGoBack()) h.goBack();
  else if (cmd === 'forward' && h.canGoForward()) h.goForward();
  else if (cmd === 'reload') reloadMuse();
  else if (cmd === 'home') wc.loadURL(MUSE_URL);
  else if (cmd === 'ready') pushBarState();
  else if (cmd === 'update' && pendingUpdate) installUpdate(pendingUpdate, '(bam nut tren thanh tieu de)');
});

// ---------- cua so goi nhanh ----------
function createQuickWindow() {
  const p = config.quickWindowPosition;
  quickWindow = new BrowserWindow({
    width: 500, height: 640, ...(p && visibleOnSomeDisplay({ ...p, width: 500, height: 640 }) ? { x: p.x, y: p.y } : {}),
    title: 'Muse - Gọi nhanh', icon: appIcon(), autoHideMenuBar: true, backgroundColor: '#ffffff',
    show: false, alwaysOnTop: true, skipTaskbar: true, resizable: false, minimizable: false, maximizable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: PARTITION, spellcheck: false },
  });
  quickWindow.loadURL(MUSE_URL);
  attachWebHandlers(quickWindow.webContents, quickWindow, false);
  quickWindow.on('moved', () => { const [x, y] = quickWindow.getPosition(); config.quickWindowPosition = { x, y }; saveConfig(); });
  quickWindow.on('blur', () => { if (quickWindow && quickWindow.isVisible()) quickWindow.hide(); });
  quickWindow.on('close', (e) => { if (!isQuitting) { e.preventDefault(); quickWindow.hide(); } });
  quickWindow.on('closed', () => { quickWindow = null; });
}

function toggleQuickWindow() {
  if (!quickWindow) createQuickWindow();
  if (quickWindow.isVisible()) quickWindow.hide();
  else { quickWindow.show(); quickWindow.focus(); }
}

function showMainWindow() {
  if (!mainWindow) createMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (!firstLoadDone && museView && museView.webContents.getURL().startsWith('file:')) reloadMuse();
}

// ---------- khay he thong ----------
const loginItem = () => app.getLoginItemSettings({ args: ['--startup'] }).openAtLogin;
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Mở Muse', click: showMainWindow },
    { label: 'Gọi nhanh (Ctrl+Shift+Space)', click: toggleQuickWindow },
    { label: 'Tải lại trang', click: () => { showMainWindow(); reloadMuse(); } },
    { type: 'separator' },
    {
      label: 'Chạy cùng Windows', type: 'checkbox', checked: loginItem(),
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--startup'] });   // ghi de muc cu cua ban 2.0
        log('chay cung windows:', item.checked);
      },
    },
    { label: 'Mở thư mục nhật ký', click: () => shell.openPath(path.join(app.getPath('userData'), 'logs')) },
    { type: 'separator' },
    pendingUpdate
      ? { label: `Cập nhật lên ${pendingUpdate.version} ngay`, click: () => installUpdate(pendingUpdate, '(bam menu khay)') }
      : { label: 'Kiểm tra cập nhật', click: () => checkLocalUpdate(true) },
    { label: `Muse Desktop ${app.getVersion()}`, enabled: false },
    { label: 'Thoát Muse', click: () => { isQuitting = true; app.quit(); } },
  ]);
}
function createTray() {
  tray = new Tray(appIcon().resize({ width: 16, height: 16 }));
  tray.setToolTip('Muse Desktop');
  tray.setContextMenu(buildTrayMenu());
  tray.on('right-click', () => tray.setContextMenu(buildTrayMenu()));
  tray.on('click', showMainWindow);   // giong Claude: bam 1 lan la mo cua so
}

// ---------- quyen, tai file ----------
const ALLOWED_PERMS = new Set(['media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'pointerLock', 'geolocation']);
function setupSession() {
  const s = session.fromPartition(PARTITION);
  s.setPermissionRequestHandler((wc, perm, cb, details) => {
    const ok = ALLOWED_PERMS.has(perm) && isInternal(details.requestingUrl || wc.getURL());
    if (!ok) log('tu choi quyen', perm, details.requestingUrl || '');
    cb(ok);
  });
  s.setPermissionCheckHandler((_wc, perm, origin) => ALLOWED_PERMS.has(perm) && isInternal(origin + '/'));
  s.on('will-download', (_e, item) => {
    const dir = path.join(app.getPath('downloads'), 'Muse');
    fs.mkdirSync(dir, { recursive: true });
    const name = item.getFilename().replace(/[\\/:*?"<>|]/g, '_') || 'muse-file';
    let file = path.join(dir, name);
    for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, name.replace(/(\.[^.]*)?$/, ` (${i})$1`));
    item.setSavePath(file);
    item.once('done', (_ev, state) => {
      log('tai file', state, file);
      if (!Notification.isSupported()) return;
      const n = new Notification({
        title: state === 'completed' ? 'Đã tải xong' : 'Tải file không thành công',
        body: state === 'completed' ? `${path.basename(file)} — trong thư mục Tải xuống\\Muse` : path.basename(file),
        icon: appIcon(),
      });
      if (state === 'completed') n.on('click', () => shell.showItemInFolder(file));
      n.show();
    });
  });
}

// ---------- tu cap nhat tren may (2.2) ----------
// Moi lan dong goi ("npm run dist"), tools/publish-local.js chep bo cai vao thu muc cap nhat + update.json
// {version, file, sha256}. App do thu muc nay luc bat, moi gio va ngay khi thu muc doi -> hoi roi tu cai, tu mo lai.
// Khong de trong AppData: chuong trinh chay tu ung dung MSIX (vd Claude) bi Windows tach rieng AppData,
// file chep vao do app nay khong thay -> dung thu muc trong ho so nguoi dung.
const UPDATE_DIR = process.env.MUSE_DESKTOP_UPDATES || path.join(require('os').homedir(), '.muse-desktop', 'updates');
let pendingUpdate = null;      // ban moi da kiem tra xong, cho cai
let updateBusy = false;
let hashOk = '';               // ma + gio sua cua bo cai da kiem dung

function verNewer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}
function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = require('crypto').createHash('sha256');
    fs.createReadStream(file).on('error', reject).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex')));
  });
}
async function findLocalUpdate() {
  let u;
  try { u = JSON.parse(fs.readFileSync(path.join(UPDATE_DIR, 'update.json'), 'utf8')); } catch { return null; }
  if (!u || !/^\d+\.\d+\.\d+$/.test(u.version || '') || !/^Muse Desktop Setup [\d.]+\.exe$/.test(u.file || '') || !/^[0-9a-f]{64}$/.test(u.sha256 || '')) {
    log('update.json khong hop le'); return null;
  }
  if (!verNewer(u.version, app.getVersion())) return null;
  const file = path.join(UPDATE_DIR, u.file);
  if (!fs.existsSync(file)) { log('thieu bo cai', u.file); return null; }
  const key = `${u.sha256}|${fs.statSync(file).mtimeMs}`;   // da kiem roi thi khong bam lai 120MB moi 2 phut
  if (hashOk !== key) {
    if ((await sha256File(file)) !== u.sha256) { log('bo cai sai ma kiem tra, bo qua', u.file); return null; }
    hashOk = key;
  }
  return { version: u.version, file };
}
function installUpdate(u, why) {
  log('cai ban moi', u.version, why || '');
  // dang an o khay thi sau khi cai xong cung mo lai an o khay (khong bat cua so len giua chung)
  config.relaunchHidden = !mainWindow || !mainWindow.isVisible() || mainWindow.isMinimized();
  saveConfig();
  try {
    require('child_process').spawn(u.file, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();   // cai im lang roi tu mo lai app
  } catch (e) {
    log('khong chay duoc bo cai', String(e));
    config.relaunchHidden = false; saveConfig();
    return;
  }
  isQuitting = true;
  app.quit();
}
// Tu cai (khong hoi), nhung khong cat ngang luc anh dang dung:
// cua so an/thu nho, hoac may de yen >= 5 phut -> cai ngay; con dang dung thi chi hien nut tren thanh tieu de.
const IDLE_SECS = 300;
function tryAutoInstall() {
  if (!pendingUpdate || isQuitting) return;
  const hidden = !mainWindow || !mainWindow.isVisible() || mainWindow.isMinimized();
  const idle = powerMonitor.getSystemIdleTime();
  if (hidden) installUpdate(pendingUpdate, '(tu dong: cua so dang an)');
  else if (idle >= IDLE_SECS) installUpdate(pendingUpdate, `(tu dong: may de yen ${idle}s)`);
}
async function checkLocalUpdate(manual) {
  if (updateBusy) return;
  updateBusy = true;
  try {
    const u = await findLocalUpdate();
    const isNew = u && (!pendingUpdate || pendingUpdate.version !== u.version);
    pendingUpdate = u;
    if (tray) tray.setContextMenu(buildTrayMenu());
    pushBarState();   // nut "Cap nhat len ..." tren thanh tieu de (giong Claude)
    if (!u) {
      if (manual) await dialog.showMessageBox({ type: 'info', title: 'Muse Desktop', message: `Anh đang dùng bản mới nhất (${app.getVersion()}).` });
      return;
    }
    if (isNew) log('co ban moi', u.version);
    if (manual) installUpdate(u, '(bam kiem tra cap nhat)');
    else tryAutoInstall();
  } catch (e) {
    log('loi kiem tra cap nhat', String(e));
  } finally {
    updateBusy = false;
  }
}
function setupAutoUpdate() {
  if (!app.isPackaged && !process.env.MUSE_DESKTOP_UPDATES) return;   // chay tu ma nguon: khong tu cap nhat
  log('theo doi cap nhat tai', UPDATE_DIR);
  setTimeout(() => checkLocalUpdate(false), 15000);
  setInterval(() => checkLocalUpdate(false), 2 * 60 * 1000);   // du phong khi Windows khong bao thu muc doi (update.json rat nhe)
  setInterval(tryAutoInstall, 60 * 1000);   // dang cho anh ngung dung / an cua so
  for (const ev of ['hide', 'minimize']) mainWindow.on(ev, () => setTimeout(tryAutoInstall, 3000));
  try {   // vua dong goi xong ban moi -> biet ngay, khong doi toi gio sau
    fs.mkdirSync(UPDATE_DIR, { recursive: true });
    let t = null;
    const w = fs.watch(UPDATE_DIR, () => { clearTimeout(t); t = setTimeout(() => checkLocalUpdate(false), 5000); });
    w.on('error', (e) => log('loi theo doi thu muc cap nhat', String(e)));
  } catch (e) { log('khong theo doi duoc thu muc cap nhat', String(e)); }
}

function handleDeepLink(url) {
  // muse-desktop://thread/<id> -> mo dung doan chat do; con lai chi mo cua so
  showMainWindow();
  try {
    const u = new URL(url);
    const p = (u.host + u.pathname).replace(/^\/+/, '');
    if (/^[A-Za-z0-9/_-]{1,200}$/.test(p) && museView) museView.webContents.loadURL(MUSE_URL + p);
  } catch { /* link la: chi mo cua so */ }
}

// ---------- khoi dong ----------
if (process.env.MUSE_DESKTOP_DATA) app.setPath('userData', process.env.MUSE_DESKTOP_DATA);   // chi dung khi chay thu
app.setAppUserModelId(APP_ID);   // can de Windows hien thong bao
crashReporter.start({ uploadToServer: false });   // ghi bao loi sap vao thu muc Crashpad, khong gui di dau

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const link = argv.find((a) => a.startsWith(PROTOCOL + '://'));
    if (link) handleDeepLink(link);
    else if (!argv.includes('--startup')) showMainWindow();
  });

  if (app.isPackaged) app.setAsDefaultProtocolClient(PROTOCOL);
  app.on('open-url', (event, url) => { event.preventDefault(); handleDeepLink(url); });

  app.whenReady().then(() => {
    config = readJson('config.json', { trayTipShown: false });
    if (!config.first_launch_at) config.first_launch_at = Date.now();
    const prevVersion = config.version;
    if (config.relaunchHidden) { START_HIDDEN = true; config.relaunchHidden = false; }
    config.version = app.getVersion();
    saveConfig();
    log(`khoi dong ${app.getVersion()} electron ${process.versions.electron}${START_HIDDEN ? ' (an, cung windows)' : ''}`);

    Menu.setApplicationMenu(null);
    setupSession();
    createMainWindow();
    createTray();

    try {
      if (!globalShortcut.register(QUICK_HOTKEY, toggleQuickWindow)) log('phim tat goi nhanh dang bi app khac dung');
    } catch { /* bo qua, van dung duoc menu khay */ }

    powerMonitor.on('shutdown', () => { isQuitting = true; log('windows tat may'); });
    powerMonitor.on('resume', () => {   // may thuc day: trang dang o man mat ket noi thi thu lai
      log('may thuc day');
      if (museView && museView.webContents.getURL().startsWith('file:')) setTimeout(() => reloadMuse(), 3000);
    });

    setupAutoUpdate();
    if (prevVersion && verNewer(app.getVersion(), prevVersion)) {
      log('da cap nhat tu', prevVersion, 'len', app.getVersion());
      config.updated_at = Date.now(); config.updated_from = prevVersion; saveConfig();
      if (Notification.isSupported()) new Notification({ title: `Đã cập nhật Muse Desktop lên ${app.getVersion()}`, body: `Bản trước: ${prevVersion}.`, icon: appIcon() }).show();
    }
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => { /* song o khay */ });
  app.on('before-quit', () => { isQuitting = true; if (config) saveConfig(); log('thoat'); });
  app.on('child-process-gone', (_e, d) => log('tien trinh con dung:', d.type, d.reason));
}
