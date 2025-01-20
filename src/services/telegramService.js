import TelegramBot from 'node-telegram-bot-api';
import { readFileSync } from 'fs';

const token = '8157774923:AAHQHkdY7ayR2e8t3AznO7kAAiZ6TmpeLOk';
const bot = new TelegramBot(token, { polling: true });

export const telegramService = (app, openai) => {
    let counter = 0;
    let rightAnswerCounter = 0;
    let questions = [];
    const initializeBot = async () => {
        console.log('initializeBot');
        //  const questions = await openai.getQuestions();
        //   console.log('Полученные вопросы:', questions);
        bot.setMyCommands([
            { command: '/start', description: 'Начнем!' },
            { command: '/quiz', description: 'Пройти quiz' },
        ]);
        bot.on('message', async (msg) => {
            const text = msg.text || '';
            const chatId = msg.chat.id;
            if (text === '/start') {
                await start(chatId);
            }
            else if (text === '/quiz') {
                counter = 0; // Сбрасываем счетчик
                await quiz(chatId, 1);
            }
            else if (!text.includes('/')) {
                if (counter > 0) {
                    //   await reply(chatId, text);
                }
                else {
                    // await dialog(chatId, text);
                }
            }
        });
        bot.on('callback_query', async (query) => {
            const chatId = query.message?.chat?.id;
            if (!chatId)
                return;
            if (query.data === '/quiz') {
                counter = 0;
                await quiz(chatId, 1);
            }
            if (query.data === '/true') {
                await bot.sendMessage(chatId, 'Верно!');
                counter = 0;
            }
            if (query.data === '/false') {
                await bot.sendMessage(chatId, 'Неверно, попробуйте снова.');
                counter = 0;
            }
            bot.answerCallbackQuery(query.id);
        });
    };
    const getQuestions = async () => {
        // Возвращает примеры вопросов
        const rawData = readFileSync('./articles/questions.json', 'utf-8');
        const questions = JSON.parse(rawData);
        return questions;
    };
    const quiz = async (chatId, questionNumber) => {
        console.log('quiz');
        const questions = await getQuestions();
        if (questionNumber - 1 >= questions.length) {
            await bot.sendMessage(chatId, 'Все вопросы завершены!');
            return;
        }
        const question = questions[questionNumber - 1];
        console.log('question', question);
        await bot.sendMessage(chatId, `Вопрос ${questionNumber}: ${question.query}`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Правильно', callback_data: '/true' },
                        { text: 'Неправильно', callback_data: '/false' },
                    ],
                ],
            },
        });
        counter = questionNumber;
    };
    const start = async (chatId) => {
        await bot.sendMessage(chatId, 'Добро пожаловать! Выберите /quiz, чтобы начать.');
    };
    initializeBot();
};
