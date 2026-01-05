# Развертывание через Portainer

## 🚀 Быстрое развертывание из GitHub

### Шаг 1: Создание Stack в Portainer

1. Откройте Portainer
2. Перейдите в **Stacks** → **Add stack**
3. Выберите **Repository** (Git Repository)

### Шаг 2: Настройка Git Repository

**Repository URL:**
```
https://github.com/nomoreqwerty/event-assistant
```

**Repository reference:** `refs/heads/main`

**Compose path:** `docker-compose.yml`

### Шаг 3: Переменные окружения (опционально)

Вы можете переопределить следующие переменные:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$10$rZ5c6HqXH.vHqkV0sZqZfO7YvK0H3HqXH.vHqkV0sZqZfO7YvK0H3q
PORT=3000
```

**Пароль по умолчанию:** `admin123`

### Шаг 4: Deploy

1. Нажмите **Deploy the stack**
2. Дождитесь завершения сборки
3. Приложение будет доступно на порту **3000**

---

## 🌐 Настройка Nginx Proxy Manager

### Добавление Proxy Host

1. **Domain Names:** `event-assistant.nmq.su`
2. **Scheme:** `http`
3. **Forward Hostname/IP:** `event-assistant` (имя контейнера)
4. **Forward Port:** `3000`
5. **SSL:** Включить, выбрать Let's Encrypt

---

## 📊 Доступ к приложению

### Публичная страница
```
https://event-assistant.nmq.su
```

### Админ-панель
```
https://event-assistant.nmq.su/admin/login.html
```

**Логин:** admin  
**Пароль:** admin123  

⚠️ **Важно:** Смените пароль после первого входа!

---

## 🔧 Обновление приложения

В Portainer:
1. Перейдите в ваш Stack
2. Нажмите **Pull and redeploy**
3. Portainer автоматически загрузит последнюю версию из GitHub

---

## 📁 Данные и логи

Данные сохраняются в Docker volumes:
- `data/` - База данных SQLite
- `logs/` - Логи приложения

Для backup используйте команды Docker volume или Portainer UI.

---

## 🛠️ Устранение неполадок

### Проверка логов
В Portainer → Containers → event-assistant → Logs

### Перезапуск контейнера
В Portainer → Containers → event-assistant → Restart

### Пересборка
В Portainer → Stacks → [ваш stack] → Pull and redeploy
