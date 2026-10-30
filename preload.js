const { contextBridge, ipcRenderer } = require('electron');

// Cau noi an toan giua thanh chon e (tabbar.html) va tien trinh chinh.
// Trang chi thay duoc 3 ham nay, khong cham duoc vao Node hay Electron.
contextBridge.exposeInMainWorld('museShell', {
  select: (id) => ipcRenderer.send('shell:select-profile', id),
  sleep: () => ipcRenderer.send('shell:sleep-active'),
  onActive: (callback) => {
    ipcRenderer.on('shell:active-changed', (event, id) => callback(id));
  },
});
