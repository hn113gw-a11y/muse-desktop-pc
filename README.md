# Muse Desktop 2.2 cho PC (Windows) - chay giong Claude Desktop

Ban 2.1 lam theo cach Claude Desktop (4.29, Electron 44.9.3) dang chay tren may nay:

- **Electron 44.9.3** (cung ban Claude dang dung; 2.0 la Electron 33 cu, thieu ban va bao mat)
- **Thanh tieu de tu ve**: logo + Quay lai / Tien toi / Tai lai / Trang chu + ten trang, 3 nut cua so cua Windows
- **Nho vi tri, kich thuoc, phong to** cua so (`window-state.json`), cai dat rieng (`config.json`, nho ca vi tri cua so Goi nhanh)
- **Chay cung Windows o che do an** (`--startup`, chi hien icon o khay), bat/tat trong menu khay
- **Dong cua so = thu xuong khay**, bam icon khay 1 lan la mo lai; khi Windows tat may/dang xuat thi thoat that (2.0 co the chan tat may)
- **Tu hoi phuc**: mat mang -> man "Khong ket noi duoc Muse" tu thu lai; trang sap -> tu tai lai (toi da 3 lan/phut); trang treo -> hoi Doi / Tai lai; may thuc day -> tu thu lai
- **Khong ham trang khi cua so bi che / o khay** (Muse lam viec lau van chay)
- **Nhat ky** `%APPDATA%\muse-desktop-pc\logs\main.log` (menu khay: Mo thu muc nhat ky) + bao loi sap Crashpad luu tren may, khong gui di dau
- **Menu chuot phai**: cat/sao chep/dan, sao chep/mo link, sao chep/luu anh, luu video, quay lai, tai lai
- **Tai file** tu dong vao `Tai xuong\Muse` + thong bao (bam thong bao de mo thu muc)
- **Quyen**: chi cho muse.ai/Meta dung mic, thong bao, clipboard, toan man hinh, vi tri; quyen khac tu choi
- Dang nhap bang Instagram mo ngay trong app; tat gach do chinh ta (go tieng Viet khong bi gach)
- Thong bao Windows hien dung (dang ky AppUserModelId `ai.muse.desktop.pc`)
- Goi nhanh `Ctrl + Shift + Space`, deep link `muse-desktop://thread/<id>`, chi chay 1 ban
- **Tu cap nhat tren may (2.2)**: xem muc "Tu cap nhat" ben duoi

## Can co

- Windows 10/11
- Node.js LTS: https://nodejs.org (cai xong mo lai terminal)

## Chay thu (chua dong goi)

```bat
cd muse-desktop-pc
npm install
npm start
```

## Dong goi thanh file .exe de cai

```bat
cd muse-desktop-pc
npm install
npm run dist
```

Vao thu muc `dist\` se co:

- File cai dat `Muse Desktop Setup 2.2.1.exe`
- File portable `Muse Desktop 2.2.1.exe` - bam la chay, khong can cai

Icon cua ca app lan bo cai deu la icon E trong `build/icon.ico`.

## Tu cap nhat (2.2)

Khong can GitHub hay may chu. Moi lan dong goi:

```bat
cd muse-desktop-pc
npm run dist
```

lenh nay (sau electron-builder) chay `tools/publish-local.js`: chep `Muse Desktop Setup <ban>.exe` vao
`%USERPROFILE%\.muse-desktop\updates\` kem `update.json` (so phien ban + ma kiem tra SHA-256).
(Khong dung AppData: chuong trinh chay tu ung dung MSIX nhu Claude bi Windows tach rieng AppData, Muse Desktop se khong thay file.)

Muse Desktop dang chay tu do thu muc nay: luc mo app, moi 2 phut, va ngay khi thu muc thay doi.
Thay ban moi hon (va ma kiem tra khop) thi TU CAI, khong hoi:
- cua so dang an o khay / thu nho: cai ngay
- may de yen tu 5 phut: cai ngay
- anh dang dung: hien nut "Cap nhat len <ban>" tren thanh tieu de (bam la cai), cho toi luc anh an cua so hoac ngung dung

Khi cai: app tu dong, bo cai chay im lang (`/S --force-run`) roi tu mo lai (dang o khay thi mo lai o khay), bao "Da cap nhat len <ban>". Dang nhap Muse giu nguyen.
Nho tang `version` trong `package.json` truoc khi `npm run dist`.

## Phim tat

- `Ctrl + Shift + Space` : goi nhanh Muse
- `Ctrl + R` : tai lai trang
- `Ctrl + W` : thu xuong khay
- `Alt + ←/→` : quay lai / tien toi
- `Ctrl + +/-/0` : phong to / thu nho / 100%
- `F11` : toan man hinh
- `Ctrl + Q` : thoat han app

## Luu y

- Day la app tu lam theo khuon Claude Desktop, khong phai app chinh thuc
  cua Meta. Meta hien chi co app Muse cho Mac, chua co cho Windows.
- Du lieu va dang nhap van la tai khoan Muse cua ban tai muse.ai.
