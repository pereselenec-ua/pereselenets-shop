# Переселенець — запуск на Render

## Важливо
Цей архів вже підготовлений так, щоб файли для Render лежали **в корені репозиторію**, а не в папці `deploy`.

Структура:
- `package.json`
- `server.js`
- `render.yaml`
- `Dockerfile`
- `public/index.html`
- `public/admin.html`
- `public/images/product-1.jpg`

## Варіант 1 — через Render Blueprint
1. Завантажте всі файли цього архіву в корінь GitHub-репозиторію.
2. У Render створіть Blueprint / Web Service з цього репозиторію.
3. Render побачить `render.yaml` у корені.
4. Root Directory: **порожньо**.
5. `render.yaml` задає `npm install` та `npm start`, health check `/health` і диск `/var/data`.

## Варіант 2 — вручну
- Root Directory: **порожньо**
- Language: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`
- Environment: `NODE_ENV=production`
- `DATA_DIR=/var/data`
- `UPLOAD_DIR=/var/data/uploads`
- `ADMIN_PASSWORD`: створіть власний сильний пароль
- Додайте Persistent Disk з mount path `/var/data`.

## Чому потрібен диск
Адмін-панель зберігає товари, замовлення та завантажені фото на сервері. Без постійного сховища локальні файли Render можуть зникати після перезапуску/деплою. Тому для цієї версії використовується платний Web Service + Persistent Disk.

## Адмін-панель
Після успішного запуску відкрийте:
`https://ВАШ-САЙТ.onrender.com/admin`

Там можна:
- додавати товари;
- завантажувати фото з телефона;
- змінювати ціну та залишок;
- приховувати/показувати товар;
- редагувати та видаляти товари;
- переглядати замовлення;
- змінювати статус замовлення.

## Перевірка
Відкрийте:
`https://ВАШ-САЙТ.onrender.com/health`

Має повернутися JSON з `ok: true`.
