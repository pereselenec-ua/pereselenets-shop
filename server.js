const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const multer = require('multer');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-1234';
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'shop.db'));
db.pragma('journal_mode=WAL');
db.pragma('foreign_keys=ON');
db.exec(`
CREATE TABLE IF NOT EXISTS products(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 description TEXT DEFAULT '',
 price INTEGER NOT NULL,
 stock INTEGER DEFAULT 0,
 image TEXT DEFAULT '',
 active INTEGER DEFAULT 1,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 phone TEXT NOT NULL,
 city_branch TEXT DEFAULT '',
 comment TEXT DEFAULT '',
 items TEXT NOT NULL,
 total INTEGER NOT NULL,
 status TEXT DEFAULT 'Нове',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`);

if (!db.prepare('SELECT COUNT(*) c FROM products').get().c) {
  db.prepare('INSERT INTO products(name,description,price,stock,image,active) VALUES(?,?,?,?,?,1)')
    .run('Безфосфатний концентрований гель для прання', "Концентрований засіб для прання. Об'єм на фото — 2 кг.", 425, 100, '/images/product-1.jpg');
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

const sessions = new Map();
function auth(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const expires = sessions.get(token);
  if (!token || !expires || expires < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Сесія завершилася. Увійдіть знову.' });
  }
  sessions.set(token, Date.now() + 1000 * 60 * 60 * 24 * 7);
  next();
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext || '.jpg'}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype));
  }
});

app.get('/health', (_req, res) => res.json({ ok: true, service: 'pereselenets-shop' }));
app.get('/api/products', (_req, res) => res.json(db.prepare('SELECT * FROM products WHERE active=1 AND stock>0 ORDER BY id DESC').all()));

app.post('/api/orders', (req, res) => {
  const { name, phone, city_branch = '', comment = '', items, total } = req.body;
  if (!name || !phone || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Заповніть ім’я, телефон і кошик' });
  const safeItems = items.map(x => ({ id: Number(x.id), name: String(x.name).slice(0, 300), price: Number(x.price) || 0, qty: Math.max(1, Math.min(99, Number(x.qty) || 1)) }));
  const calculatedTotal = safeItems.reduce((sum, x) => sum + x.price * x.qty, 0);
  const r = db.prepare('INSERT INTO orders(name,phone,city_branch,comment,items,total) VALUES(?,?,?,?,?,?)')
    .run(String(name).slice(0, 120), String(phone).slice(0, 40), String(city_branch).slice(0, 200), String(comment).slice(0, 1000), JSON.stringify(safeItems), calculatedTotal);
  res.json({ ok: true, id: r.lastInsertRowid, total: calculatedTotal });
});

app.post('/api/admin/login', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Невірний пароль' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + 1000 * 60 * 60 * 24 * 7);
  res.json({ ok: true, token });
});
app.post('/api/admin/logout', auth, (req, res) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  sessions.delete(token);
  res.json({ ok: true });
});
app.get('/api/admin/products', auth, (_req, res) => res.json(db.prepare('SELECT * FROM products ORDER BY id DESC').all()));
app.post('/api/admin/products', auth, (req, res) => {
  const { name, description = '', price, stock = 0, image = '', active = 1 } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: 'Назва і ціна обов’язкові' });
  const r = db.prepare('INSERT INTO products(name,description,price,stock,image,active) VALUES(?,?,?,?,?,?)')
    .run(String(name).slice(0, 300), String(description).slice(0, 5000), Math.max(0, Number(price) || 0), Math.max(0, Number(stock) || 0), String(image).slice(0, 1000), active ? 1 : 0);
  res.json(db.prepare('SELECT * FROM products WHERE id=?').get(r.lastInsertRowid));
});
app.put('/api/admin/products/:id', auth, (req, res) => {
  const { name, description = '', price, stock = 0, image = '', active = 1 } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: 'Назва і ціна обов’язкові' });
  db.prepare('UPDATE products SET name=?,description=?,price=?,stock=?,image=?,active=? WHERE id=?')
    .run(String(name).slice(0, 300), String(description).slice(0, 5000), Math.max(0, Number(price) || 0), Math.max(0, Number(stock) || 0), String(image).slice(0, 1000), active ? 1 : 0, Number(req.params.id));
  res.json({ ok: true });
});
app.delete('/api/admin/products/:id', auth, (req, res) => {
  db.prepare('DELETE FROM products WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});
app.post('/api/admin/upload', auth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Виберіть JPG, PNG, WEBP або GIF до 5 МБ' });
  res.json({ url: '/uploads/' + req.file.filename });
});
app.get('/api/admin/orders', auth, (_req, res) => res.json(db.prepare('SELECT * FROM orders ORDER BY id DESC').all()));
app.put('/api/admin/orders/:id', auth, (req, res) => {
  const allowed = ['Нове', 'В обробці', 'Відправлено', 'Завершено', 'Скасовано'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Невідомий статус' });
  db.prepare('UPDATE orders SET status=? WHERE id=?').run(req.body.status, Number(req.params.id));
  res.json({ ok: true });
});
app.use(express.static(path.join(ROOT, 'public')));
app.get('/admin', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'admin.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Переселенець: http://0.0.0.0:${PORT}`));
