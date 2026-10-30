const path = require('path');
const {
  app, BrowserWindow, WebContentsView, shell, Menu, Tray, globalShortcut,
  Notification, dialog, nativeImage, ipcMain,
} = require('electron');

const MUSE_URL = 'https://muse.ai';
const PROTOCOL = 'muse-desktop';
const QUICK_HOTKEY = 'Control+Shift+Space';
const APP_USER_MODEL_ID = 'ai.muse.desktop.pc';
const TAB_BAR_HEIGHT = 46;

// Windows chi hien thong bao (toast) dung danh tinh khi app khai bao
// AppUserModelID, va ma nay phai trung voi appId luc dong goi bo cai
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

const ICON_ICO = path.join(__dirname, 'assets', 'icon.ico');
const ICON_PNG = path.join(__dirname, 'assets', 'icon.png');
const appIcon = () => nativeImage.createFromPath(process.platform === 'win32' ? ICON_ICO : ICON_PNG);

// Nha chung (v2.2): ca doi o trong 1 cua so, moi e mot phien dang nhap rieng
const PROFILES = [
  { id: 'chinh', name: 'Em chính', role: 'Chính' },
  { id: 'miu', name: 'Miu', role: 'Nghiên cứu' },
  { id: 'bo', name: 'Bơ', role: 'Kỹ thuật' },
  { id: 'sua', name: 'Sứa', role: 'Phản biện' },
  { id: 'nep', name: 'Nếp', role: 'Thư ký' },
];
const profileById = (id) => PROFILES.find((p) => p.id === id) || PROFILES[0];

// Cac domain duoc mo ngay trong app (Muse va dang nhap Meta)
// Ngoai cac domain nay, link se mo bang trinh duyet mac dinh
const INTERNAL_HOSTS = [
  'muse.ai', 'www.muse.ai',
  'ai.meta.com', 'meta.com', 'www.meta.com',
  'facebook.com', 'www.facebook.com',
  'accountscenter.facebook.com', 'accountscenter.instagram.com',
];

function isInternal(url) {
  try {
    const host = new URL(url).hostname;
    return INTERNAL_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

let mainWindow = null;
let quickWindow = null;
let tray = null;
let isQuitting = false;
let trayTipShown = false;
const views = new Map(); // profile id -> WebContentsView
let activeProfileId = 'chinh';

// Tu hoi phuc khi trang khong tai duoc (mat mang luc khoi dong, muse.ai treo),
// khi tien trinh hien thi sap, hoac khi trang khong phan hoi.
// Tai lai theo cap so nhan 2s, 5s, 10s, 30s, 60s roi giu nhip 60s,
// tai duoc la dat lai bo dem.
function attachAutoReload(webContents) {
  const delays = [2000, 5000, 10000, 30000, 60000];
  let failures = 0;
  let timer = null;

  function schedule() {
    if (timer) clearTimeout(timer);
    const delay = delays[Math.min(failures, delays.length - 1)];
    failures++;
    timer = setTimeout(() => {
      timer = null;
      if (!webContents.isDestroyed()) webContents.loadURL(MUSE_URL);
    }, delay);
    if (timer.unref) timer.unref();
  }

  webContents.on('did-finish-load', () => {
    failures = 0;
    if (timer) { clearTimeout(timer); timer = null; }
  });
  webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (errorCode === -3) return; // ERR_ABORTED: dieu huong bi huy binh thuong, khong phai loi
    schedule();
  });
  webContents.on('render-process-gone', () => schedule());
  webContents.on('unresponsive', () => schedule());
}

function wireExternalLinks(webContents) {
  webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  webContents.on('will-navigate', (event, url) => {
    if (!isInternal(url) && !url.startsWith('about:')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

function layoutViews() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { width, height } = mainWindow.getContentBounds();
  const view = views.get(activeProfileId);
  if (view) {
    view.setBounds({ x: 0, y: TAB_BAR_HEIGHT, width, height: Math.max(0, height - TAB_BAR_HEIGHT) });
  }
}

function ensureView(profile) {
  let view = views.get(profile.id);
  if (view) return view;
  view = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // Moi e mot phien dang nhap rieng, khong lan cookie cua nhau
      partition: `persist:muse-${profile.id}`,
    },
  });
  wireExternalLinks(view.webContents);
  attachAutoReload(view.webContents);
  view.webContents.loadURL(MUSE_URL);
  view.setVisible(false);
  mainWindow.contentView.addChildView(view);
  views.set(profile.id, view);
  return view;
}

function selectProfile(id) {
  const profile = profileById(id);
  const previous = views.get(activeProfileId);
  if (previous) previous.setVisible(false);
  activeProfileId = profile.id;
  const view = ensureView(profile);
  view.setVisible(true);
  layoutViews();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(`Muse Desktop — ${profile.name}`);
    mainWindow.webContents.send('shell:active-changed', profile.id);
  }
  if (tray) {
    tray.setToolTip(`Muse Desktop — ${profile.name}`);
    tray.setContextMenu(buildTrayMenu());
  }
}

// Cho e hien tai di ngu: dong han phien de giai phong RAM.
// Lan sau chon lai e do, phien mo lai tu dau nhung dang nhap van duoc giu
// nho partition da luu tren dia. Em chinh luon truc nha nen khong di ngu.
function sleepActiveProfile() {
  if (activeProfileId === 'chinh') return;
  destroyView(activeProfileId);
  selectProfile('chinh');
}

function destroyView(id) {
  const view = views.get(id);
  if (!view) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.contentView.removeChildView(view);
  }
  view.webContents.close();
  views.delete(id);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Muse Desktop',
    icon: appIcon(),
    autoHideMenuBar: true,
    backgroundColor: '#f6f1e7',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, 'tabbar.html'));
  mainWindow.on('resize', layoutViews);

  // Windows sap tat may / dang xuat: danh dau la dang thoat that
  // de su kien close ben duoi khong thu xuong khay va chan tat may
  mainWindow.on('session-end', () => { isQuitting = true; });

  // Dong cua so = thu xuong khay he thong (giong Claude), khong thoat app
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
    if (!trayTipShown && Notification.isSupported()) {
      trayTipShown = true;
      new Notification({
        title: 'Muse Desktop van dang chay',
        body: 'Ca doi Muse van o trong khay he thong. Bam icon Muse o goc phai thanh taskbar de mo lai, hoac nhan Ctrl+Shift+Space de goi nhanh.',
        icon: appIcon(),
      }).show();
    }
  });
  mainWindow.on('closed', () => {
    views.clear();
    mainWindow = null;
  });
}

function createQuickWindow() {
  quickWindow = new BrowserWindow({
    width: 500,
    height: 640,
    title: 'Muse - Goi nhanh',
    icon: appIcon(),
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: 'persist:muse-chinh',
    },
  });
  quickWindow.loadURL(MUSE_URL);
  wireExternalLinks(quickWindow.webContents);
  attachAutoReload(quickWindow.webContents);
  quickWindow.on('session-end', () => { isQuitting = true; });
  quickWindow.on('blur', () => { if (quickWindow && quickWindow.isVisible()) quickWindow.hide(); });
  quickWindow.on('closed', () => { quickWindow = null; });
  quickWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape') quickWindow.hide();
  });
}

function toggleQuickWindow() {
  if (!quickWindow) createQuickWindow();
  if (quickWindow.isVisible()) {
    quickWindow.hide();
  } else {
    quickWindow.show();
    quickWindow.focus();
  }
}

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow();
    selectProfile(activeProfileId);
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Mo Muse', click: showMainWindow },
    { label: 'Goi nhanh (Ctrl+Shift+Space)', click: toggleQuickWindow },
    {
      label: 'Doi e',
      submenu: PROFILES.map((p) => ({
        label: `${p.name} — ${p.role}`,
        type: 'radio',
        checked: p.id === activeProfileId,
        click: () => { showMainWindow(); selectProfile(p.id); },
      })),
    },
    { type: 'separator' },
    {
      label: 'Chay cung Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    {
      label: 'Thoat Muse',
      click: () => { isQuitting = true; app.quit(); },
    },
  ]);
}

function createTray() {
  tray = new Tray(appIcon().resize({ width: 16, height: 16 }));
  tray.setToolTip('Muse Desktop');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => {
    if (mainWindow && mainWindow.isVisible() && !mainWindow.isMinimized()) mainWindow.hide();
    else showMainWindow();
  });
  tray.on('double-click', showMainWindow);
}

function setupAutoUpdate() {
  // Tu cap nhat giong Claude: chi chay khi app da dong goi,
  // va chi khi da cau hinh nguon cap nhat trong package.json (muc "publish").
  // Chua cau hinh thi bo qua trong im lang, app van chay binh thuong.
  if (!app.isPackaged) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.on('update-downloaded', async () => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Muse Desktop',
      message: 'Da tai xong ban cap nhat moi. Khoi dong lai ngay de cap nhat?',
      buttons: ['Khoi dong lai', 'De sau'],
      defaultId: 0,
    });
    if (response === 0) {
      isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });
  autoUpdater.on('error', () => { /* khong lam phien nguoi dung khi chua co nguon update */ });
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}

function handleDeepLink(url) {
  // muse-desktop://... -> chi can mo lai cua so chinh
  showMainWindow();
}

// Thanh chon e goi xuong tien trinh chinh qua IPC (preload.js)
ipcMain.on('shell:select-profile', (event, id) => selectProfile(id));
ipcMain.on('shell:sleep-active', () => sleepActiveProfile());

// Chi cho chay 1 ban Muse Desktop tai 1 thoi diem
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    const link = argv.find((a) => a.startsWith(PROTOCOL + '://'));
    if (link) handleDeepLink(link);
    else showMainWindow();
  });

  app.setAsDefaultProtocolClient(PROTOCOL);
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: 'Muse',
        submenu: [
          { label: 'Goi nhanh', accelerator: QUICK_HOTKEY, click: toggleQuickWindow },
          { label: 'Tai lai trang', accelerator: 'CmdOrCtrl+R', click: () => { const v = views.get(activeProfileId); if (v) v.webContents.reload(); } },
          { label: 'Toan man hinh', accelerator: 'F11', click: () => mainWindow && mainWindow.setFullScreen(!mainWindow.isFullScreen()) },
          { type: 'separator' },
          ...PROFILES.map((p, i) => ({
            label: `${p.name} — ${p.role}`,
            accelerator: `CmdOrCtrl+${i + 1}`,
            click: () => { showMainWindow(); selectProfile(p.id); },
          })),
          { label: 'Cho e hien tai di ngu (giai phong RAM)', click: sleepActiveProfile },
          { type: 'separator' },
          { label: 'Phong to', role: 'zoomIn' },
          { label: 'Thu nho', role: 'zoomOut' },
          { label: 'Zoom 100%', role: 'resetZoom' },
          { type: 'separator' },
          { label: 'Thu xuong khay', accelerator: 'CmdOrCtrl+W', click: () => mainWindow && mainWindow.hide() },
          {
            label: 'Thoat',
            accelerator: 'CmdOrCtrl+Q',
            click: () => { isQuitting = true; app.quit(); },
          },
        ],
      },
      { label: 'Sua', role: 'editMenu' },
    ]));

    createMainWindow();
    createTray();
    selectProfile('chinh');

    try {
      globalShortcut.register(QUICK_HOTKEY, toggleQuickWindow);
    } catch {
      // Phim tat da bi app khac chiem: bo qua, van dung duoc menu khay
    }

    setupAutoUpdate();
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => {
    // App song o khay he thong nen khong thoat khi dong het cua so
  });
  app.on('before-quit', () => { isQuitting = true; });
}
