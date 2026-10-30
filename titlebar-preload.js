// Cau noi duy nhat giua thanh tieu de va app: chi gui lenh dieu huong, nhan trang thai
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('museBar', {
  cmd: (c) => ipcRenderer.send('bar:cmd', String(c)),
  onState: (fn) => ipcRenderer.on('bar:state', (_e, s) => fn(s)),
});
