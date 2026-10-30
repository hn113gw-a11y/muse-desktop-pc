// Sau "electron-builder": chep bo cai vua dong goi vao thu muc cap nhat tren may + ghi update.json.
// Muse Desktop dang chay se tu thay ban moi (xem setupAutoUpdate trong main.js).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;
const name = `Muse Desktop Setup ${version}.exe`;
const src = path.join(root, 'dist', name);
const dir = process.env.MUSE_DESKTOP_UPDATES || path.join(require('os').homedir(), '.muse-desktop', 'updates');   // ngoai AppData (xem main.js)

if (!fs.existsSync(src)) { console.error('Khong thay', src); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex');
fs.copyFileSync(src, path.join(dir, name + '.tmp'));
fs.renameSync(path.join(dir, name + '.tmp'), path.join(dir, name));
// ghi update.json SAU khi bo cai da nam du, de app khong doc phai file dang chep do
const tmp = path.join(dir, 'update.json.tmp');
fs.writeFileSync(tmp, JSON.stringify({ version, file: name, sha256, date: new Date().toISOString() }, null, 2));
fs.renameSync(tmp, path.join(dir, 'update.json'));
for (const f of fs.readdirSync(dir)) {   // chi giu ban moi nhat
  if (/^Muse Desktop Setup [\d.]+\.exe$/.test(f) && f !== name) fs.rmSync(path.join(dir, f), { force: true });
}
console.log(`Da dua ban ${version} vao ${dir}`);
