const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Получаем переменные окружения
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const PORT = process.env.PORT || 3000;

// Инициализация бота и Supabase
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('🤖 Telegram бот запущен...');

// Команда /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const text = `🤖 *Бот уведомлений для чата*

Используйте команды:
/bind CODE - Привязать аккаунт
/status - Проверить статус
/help - Помощь

_Отправляйте уведомления о новых сообщениях из вашего чат приложения_`;

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// Команда /bind
bot.onText(/\/bind (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const code = match[1].toUpperCase();

  try {
    console.log(`🔗 Попытка привязки: код ${code}, chatId ${chatId}`);

    // Ищем код в базе
    const { data, error } = await supabase
      .from('telegram_bind_codes')
      .select('user_id')
      .eq('bind_code', code)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) {
      await bot.sendMessage(
        chatId,
        `❌ *Неверный или просроченный код*\n\nПроверьте код и попробуйте снова.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const userId = data.user_id;

    // Привязываем аккаунт
    const { error: updateError } = await supabase
      .from('users')
      .update({ telegram_chat_id: chatId.toString() })
      .eq('id', userId);

    if (updateError) {
      throw updateError;
    }

    // Удаляем использованный код
    await supabase
      .from('telegram_bind_codes')
      .delete()
      .eq('bind_code', code);

    // Получаем имя пользователя для приветствия
    const { data: userData } = await supabase
      .from('users')
      .select('name')
      .eq('id', userId)
      .single();

    const userName = userData?.name || 'Пользователь';

    await bot.sendMessage(
      chatId,
      `✅ *Аккаунт успешно привязан!*\n\nПривет, ${userName}! Теперь вы будете получать уведомления о новых сообщениях.`,
      { parse_mode: 'Markdown' }
    );

    console.log(`✅ Успешная привязка: user ${userId} -> chat ${chatId}`);

  } catch (error) {
    console.error('Bind error:', error);
    await bot.sendMessage(
      chatId,
      `❌ *Ошибка привязки*\n\nПопробуйте позже или обратитесь в поддержку.`,
      { parse_mode: 'Markdown' }
    );
  }
});

// Команда /status
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const { data } = await supabase
      .from('users')
      .select('name, telegram_chat_id')
      .eq('telegram_chat_id', chatId.toString())
      .single();

    if (data) {
      await bot.sendMessage(
        chatId,
        `✅ *Статус: Привязан*\n\nАккаунт: *${data.name}*\nChat ID: ${data.telegram_chat_id}`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await bot.sendMessage(
        chatId,
        `❌ *Статус: Не привязан*\n\nИспользуйте команду /bind CODE для привязки аккаунта.`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    await bot.sendMessage(
      chatId,
      `❌ *Статус: Не привязан*`,
      { parse_mode: 'Markdown' }
    );
  }
});

// Команда /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const text = `📖 *Помощь*

*Как привязать аккаунт:*
1. Откройте наше приложение
2. Перейдите в настройки Telegram
3. Скопируйте код привязки
4. Отправьте боту команду /bind CODE

*Уведомления:*
Вы будете получать уведомления когда:
- Вам приходят новые сообщения
- Кто-то упоминает вас в чате

*Команды:*
/start - Начало работы
/bind CODE - Привязать аккаунт
/status - Проверить статус
/help - Эта справка`;

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'Bot is running!', timestamp: new Date().toISOString() });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Bot server running on port ${PORT}`);
});