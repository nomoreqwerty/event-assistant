# Быстрое развертывание Event Sales Assistant

## Шаг 1: Перенос файлов на сервер

```bash
# Скачайте архив event-assistant.tar.gz на ваш сервер
# Затем распакуйте:
tar -xzf event-assistant.tar.gz
cd event-assistant
```

## Шаг 2: Развертывание через Portainer

1. Откройте Portainer в браузере
2. Перейдите в **Stacks** → **Add stack**
3. Название: `event-assistant`
4. Выберите **Upload** и загрузите файл `docker-compose.yml`
   
   ИЛИ
   
   Скопируйте содержимое `docker-compose.yml` в редактор
5. Нажмите **Deploy the stack**

## Шаг 3: Настройка Nginx Proxy Manager

1. Откройте Nginx Proxy Manager
2. **Proxy Hosts** → **Add Proxy Host**
3. Заполните:
   - **Domain Names**: `event-assistant.nmq.su`
   - **Scheme**: `http`
   - **Forward Hostname/IP**: `event-assistant` (или IP вашего сервера)
   - **Forward Port**: `3000`
   - ✅ **Block Common Exploits**
   - ✅ **Cache Assets**
4. Вкладка **SSL**:
   - ✅ **Force SSL**
   - ✅ **Request a new SSL Certificate**
   - Email для Let's Encrypt
   - ✅ **I Agree to the Let's Encrypt Terms of Service**
5. **Save**

## Шаг 4: Проверка

1. Откройте https://event-assistant.nmq.su
2. Проверьте что форма email работает
3. Откройте https://event-assistant.nmq.su/admin
4. Войдите:
   - Логин: `admin`
   - Пароль: `admin123`

## Шаг 5: ВАЖНО - Смена пароля!

```bash
docker exec -it event-assistant sh
node

# В Node.js консоли:
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const db = new Database('./data/database.db');
const newPassword = 'ВАШ_НОВЫЙ_ПАРОЛЬ';
const hash = bcrypt.hashSync(newPassword, 10);
db.prepare('UPDATE admin_users SET password_hash = ? WHERE username = ?').run(hash, 'admin');
console.log('Password updated!');
process.exit();
```

Нажмите Ctrl+C для выхода из контейнера

## Готово! 🚀

Ваш fake door test готов к использованию:
- Главная страница: https://event-assistant.nmq.su
- Админ панель: https://event-assistant.nmq.su/admin

## Полезные команды

```bash
# Просмотр логов
docker logs event-assistant

# Перезапуск
docker restart event-assistant

# Остановка
docker stop event-assistant

# Запуск
docker start event-assistant

# Резервная копия базы
cp event-assistant/data/database.db backup-$(date +%Y%m%d).db
```
