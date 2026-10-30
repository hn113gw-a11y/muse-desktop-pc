# Muse Desktop v2.2 cho PC (Windows) - lam theo khuon Claude Desktop

## Tu cap nhat qua GitHub Releases (tu ban 2.2.1)

App da duoc cau hinh nguon cap nhat: kho `hn113gw-a11y/muse-desktop-pc`
tren GitHub (muc `publish` trong package.json). App tu kiem tra ban moi
khi khoi dong va moi 6 gio, tai xong se hoi khoi dong lai de cai.

Dieu kien truoc khi phat hanh lan dau:

1. Kho `muse-desktop-pc` phai ton tai va de **Public** tren tai khoan
   GitHub hn113gw-a11y (app chi doc duoc Release cua kho cong khai)
2. Tao 1 Personal Access Token tren GitHub: Settings -> Developer
   settings -> Personal access tokens -> Tokens (classic) -> Generate
   new token, tich quyen **repo**. Token nay chi de tren may cua ban,
   TUYET DOI khong gui qua chat hay dan vao file

Phat hanh 1 ban moi (tren may Windows, trong thu muc code):

```powershell
$env:GH_TOKEN = "dan-token-vao-day"
npm install
npm run release
```

Lenh `release` se dong goi ban Setup (NSIS) va tu tai len GitHub Release
kem file `latest.yml` de cac may da cai tu tim thay ban moi.
Moi lan phat hanh tiep theo: tang so `version` trong package.json
(vi du 2.2.1 -> 2.2.2) roi chay lai dung 1 lenh tren.

Luu y:

- Ban 2.2.1 van phai **cai tay 1 lan** (cai bang file Setup trong Release
  dau tien, hoac chay `npm run dist` nhu cu). Tu ban 2.2.2 tro di moi
  tu cap nhat that
- Chi ban **Setup (NSIS)** tu cap nhat duoc. Ban portable khong tu cap
  nhat, day la gioi han cua co che cap nhat
- File Setup chua co chu ky so nen Windows SmartScreen co the canh bao
  luc cai lan dau: bam "More info" -> "Run anyway"

## Ban 2.2: Nha chung cho ca doi

- Ca doi o trong **1 cua so duy nhat**: Em chinh, Miu (Nghien cuu), Bo
  (Ky thuat), Sua (Phan bien), Nep (Thu ky). Thanh chon e nam o tren cung
  cua so, bam ten la doi e; cung doi duoc bang phim Ctrl+1..5, menu Muse
  hoac muc "Doi e" trong menu khay
- **Moi e mot phien dang nhap rieng** (partition rieng): dang nhap tai khoan
  khac nhau cung duoc, khong lan cookie, khong go nham nha
- Cac e chi **mo phien khi duoc chon lan dau** (khoi dong nhe), e nao khong
  dung thi bam "Cho e nay di ngu" tren thanh chon e de dong phien, giai
  phong RAM; dang nhap cua e do van duoc giu tren dia, chon lai la vao tiep
- Dung chung 1 icon khay, 1 phim tat goi nhanh Ctrl+Shift+Space (mo phien
  cua Em chinh), 1 muc chay cung Windows: het xung dot kieu chay nhieu ban
  rieng (tranh phim tat, gop taskbar, tranh deep link)
- Moi phien van giu day du bao ve cua v2.1: sandbox, tu tai lai khi mat
  mang/trang sap, link ngoai mo bang trinh duyet mac dinh

## Ban 2.1 sua 4 loi cua ban 2.0

- **Khong chan tat may nua**: app nghe su kien ket thuc phien lam viec cua
  Windows (session-end). Khi Windows tat may/dang xuat thi app thoat thang,
  chi thu xuong khay khi nguoi dung tu bam dong cua so
- **Khong trang man hinh vinh vien**: trang tai that bai (mat mang luc mo may,
  muse.ai treo) thi app tu tai lai theo nhip 2s, 5s, 10s, 30s, 60s.
  Tien trinh hien thi sap hoac trang khong phan hoi cung tu tai lai
- **Thong bao khay hien duoc tren Windows**: app khai bao AppUserModelID
  `ai.muse.desktop.pc` ngay tu dau, trung voi appId cua bo cai
- **Electron 45** (ban moi nhat luc lam ban nay) thay cho Electron 33 da cu,
  kem theo electron-builder 26 va electron-updater 6.8

Ban v2 nang cap tu ban boc web v1 len dang app desktop dang hoang,
hoc theo cach Anthropic lam Claude Desktop (cung dung Electron):

- Cua so Electron rieng, giu dang nhap, icon E (M cat facet) da chon
- **Khay he thong (tray)**: dong cua so la thu xuong khay, app van chay nen.
  Bam icon Muse o khay de mo lai, chuot phai co menu Mo Muse / Goi nhanh / Thoat
- **Goi nhanh (Quick Entry)**: nhan `Ctrl + Shift + Space` o bat ky dau
  de bat/tat cua so Muse nho noi tren man hinh, nhan `Esc` hoac bam ra ngoai de an
- **Chay cung Windows**: bat/tat trong menu chuot phai cua icon khay
- **Deep link**: dang ky giao thuc `muse-desktop://` de mo app tu link
- **Tu cap nhat**: da tich hop electron-updater. App chi tu kiem tra cap nhat
  sau khi da dong goi VA da cau hinh nguon cap nhat (xem muc duoi).
  Chua cau hinh thi app bo qua trong im lang, chay binh thuong
- Chi chay 1 ban duy nhat: mo lai app la cua so cu hien len

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

- File cai dat `Muse Desktop Setup 2.2.0.exe`
- File portable `Muse Desktop 2.2.0.exe` - bam la chay, khong can cai

Icon cua ca app lan bo cai deu la icon E trong `build/icon.ico`.

## Bat tu cap nhat that

electron-updater can 1 noi chua ban cap nhat. Cach pho bien nhat la
GitHub Releases. Khi co repo GitHub cho app, them vao `package.json`:

```json
"build": {
  "publish": {
    "provider": "github",
    "owner": "<ten-github>",
    "repo": "<ten-repo>"
  }
}
```

roi moi lan tang so `version` va chay `npm run dist`, tai cac file trong
`dist\` len muc Releases cua repo. App da cai se tu thay ban moi,
tai ngam va hoi khoi dong lai de cap nhat.

## Phim tat

- `Ctrl + Shift + Space` : goi nhanh Muse
- `Ctrl + R` : tai lai trang
- `Ctrl + W` : thu xuong khay
- `F11` : toan man hinh
- `Ctrl + Q` : thoat han app

## Luu y

- Day la app tu lam theo khuon Claude Desktop, khong phai app chinh thuc
  cua Meta. Meta hien chi co app Muse cho Mac, chua co cho Windows.
- Du lieu va dang nhap van la tai khoan Muse cua ban tai muse.ai.
