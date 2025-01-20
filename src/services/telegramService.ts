import { Elysia } from 'elysia';
import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';

//import { openaiService } from './openaiService'; // Импортируем вспомогательные функции
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: __dirname + '/.env' });
// Загрузка переменных окружения

const token = process.env.BOT_TOKEN ?? '';
const bot = new TelegramBot(token, { polling: true });

const webHookUrl = process.env.WEBHOOK_URL;
const infoLink1 = 'https://platform.openai.com/docs/overview';
const infoLink2 = 'https://docs.pinecone.io/guides/get-started/overview';
const infoLink3 = 'https://help.openai.com/en/articles/8868588-retrieval-augmented-generation-rag-and-semantic-search-for-gpts';

interface QuizQuestions {
    id: string;
    query: string;
    answer: string;
}

interface Quiz {
    query: string;
    correctAnswer: string;
    options: TelegramBot.InlineKeyboardButton[][];
}


  
export const TelegramService = (app: Elysia, openai: { ragAnswer: (namespaceName: string, query: string) => Promise<string>; }) => {
    let rightAnswerCounter = 0;
    let counter: number = 0;

    const initializeBot = async () => {
        bot.setMyCommands([
            { command: '/start', description: 'Начнем!' },
            { command: '/dialog', description: 'Поговорим?' },
            { command: '/test', description: 'Викторина' },
            { command: '/quiz', description: 'Пройти quiz' },
        ]);

        bot.on('message', async (msg) => {
            const text = msg.text || '';
            const chatId = msg.chat.id;

            if (text === '/start') {
                const first_name = msg.chat.first_name ? msg.chat.first_name : 'друг';
                return start(chatId, first_name);
            } else if (text === '/quiz') {
                counter = 0;
                return quiz(chatId, 1);
            } else if (text === '/test') {
                counter = 1;
                return test(chatId, 1);
            } else if (!text.includes('/')) {
                if (counter > 0) {
                    return reply(chatId, text);
                } else {
                    return dialog(chatId, text);
                }
            }
        });

        bot.on('callback_query', async (query) => {
            const chatId = query.message?.chat?.id;
            if (!chatId) return;

            if (query.data == '/about') {
                await about(chatId);
            }

            if (query.data == '/info') {
                await info(chatId);
            }

            if (query.data === '/quiz') {
                counter = 0;
                await quiz(chatId, 1);
            }

            if (query.data == '/true') {
                await good(chatId);
            }

            if (query.data == '/false') {
                await bad(chatId);
            }

            if (query.data == '/exit') {
                await exit(chatId);
            }

            if (query.data == '/next') {
                await quiz(chatId, 2);
            }

            if (query.data?.includes('/dialog#')) {
                const text = getAfterHashRegex(query.data);
                console.log('1', text)
                if (text) {
                    await dialog(chatId, text);
                } else {
                    sendError(chatId)
                }
            }

            if (query.data?.includes('/dialogAnswer#')) {
                const text = getAfterHashRegex(query.data);
                console.log('2', text)
                if (text) {
                    await reply(chatId, text);
                } else {
                    sendError(chatId)
                }
            }


            bot.answerCallbackQuery(query.id);
        });
    };

    const start = async (chatId: number, first_name: string) => {
        counter = 0;
        await bot.sendMessage(
            chatId,
            `Привет, ${first_name}!`,
            { parse_mode: 'HTML' },
        );

        bot.sendMessage(
            chatId,
            'Чтобы выбрать что дальше, нажмите на кнопку ниже',
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'О боте', callback_data: '/about' },
                            { text: 'Ссылки на материалы', callback_data: '/info' },
                        ],

                        [{ text: 'Поговорим?', callback_data: '/dialog#' }],
                        [{ text: '🚀 Пройти квиз', callback_data: '/quiz' }],
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true,
                },
            },
        );
    }

    const about = async (chatId: number) => {
        awaitResponse(chatId);
        const aboutResponse = 'Этот бот сделан для демонстрации кода применения технологии RAG и OpenAI для генерации ответа дообученой модели chatGPT.\n\nБот написан на ElysiaJS.\n\n<strong>Проблема:</strong>\n При генерации ответов chatGPT возможны "галлюцинации", т.к. когда модели не хватает данных для ответа она выдает ответ похожий на правду, но неверный.\n\n<strong>Решение:</strong>\nДля решения этой проблемы я использую технологию RAG - создается  векторное хранилище, и обучается заданной теме. При запросе пользователя на данную тему к запросу добавляются данные по этой теме из векторного хранилища.\n\nВ результате OpenAI GPT (или другая модель) отвечает более точно.';

        bot.sendMessage(chatId, aboutResponse,
            {
                parse_mode: 'HTML', reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Ссылки на материалы', callback_data: '/info' },
                        ]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true,
                },
            });
    }

    const info = (chatId: number) => {
        awaitResponse(chatId);
        const infoResponse = `Ниже приведены ссылки на документацию OpenAI\n ${infoLink1}\n\nPinecone (векторное хранилище данных)\n${infoLink2}\n\n и описание технологии RAG\n ${infoLink3}`;

        bot.sendMessage(
            chatId,
            infoResponse,
            {
                parse_mode: 'HTML', reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Поговорим?', callback_data: '/dialog#' }],
                        [{ text: '🚀 Пройти квиз', callback_data: '/quiz' }],
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true,
                },
            }
        );
    }



    const quiz = async (chatId: number, call: number) => {
        const quiz = await getQuiz();

        if (call == 1) {
          bot.sendMessage(chatId, 'Привет! Давай начнем!');
            await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        const number = Math.floor(Math.random() * quiz.length - 1) + 1;
        counter = number;
        const question = quiz[number];
        await bot.sendMessage(chatId, `${question.query}`, {
            reply_markup: {
                inline_keyboard: question.options
            },
        });
    };

    const good = async (chatId: number) => {
        counter++;
        rightAnswerCounter++;
        bot.sendMessage(
            chatId,
            'Правильный ответ! Давайте перейдем ко следующему вопросу.',
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Следующий вопрос', callback_data: '/next' },
                            { text: 'Закончить', callback_data: '/exit' },
                        ],
                    ],
                    one_time_keyboard: true,
                    resize_keyboard: true,
                },
            },
        );
    }

    const bad = async (chatId: number) => {
        counter++;
        bot.sendMessage(chatId, `Неправильный ответ.`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Следующий вопрос', callback_data: '/next' },
                        { text: 'Закончить', callback_data: '/exit' },
                    ],
                ],
                one_time_keyboard: true,
                resize_keyboard: true,
            },
        });
    }

    const test = async(chatId: number, call: number) => {
        const questCount = 10;
        const questions: QuizQuestions[] = await getQuestions('quiz.json');
        if (call == 1) {
          bot.sendMessage(chatId, 'Привет! Давай начнем викторину! Я задам вопрос, а ты напишешь ответ.');
        }  
        const number = Math.floor(Math.random() * questCount - 1) + 1;  
        const question = questions[number]; 
        counter = number;
        await bot.sendMessage(chatId, question.query);
      }
    
    const reply = async (chatId: number, answer: string) => {
        const questions: QuizQuestions[] = await getQuestions('quiz.json');
        const query = questions[counter].query;
        const queryAnswer = `На поставленный вопрос ${query} был дан ответ ${answer} Это правильный ответ на поставленный вопрос?`;
        counter = 0;
        return dialogAnswer(chatId, queryAnswer);
    }

    const awaitResponse = async (chatId: number) => {
        await bot.sendChatAction(chatId, 'typing');
    }

    const dialog = async (chatId: number, query: string) => {
        awaitResponse(chatId);
        const namespaceName = 'games';
        const questionText = query;
        const dialogResponse: string = await openai.ragAnswer(
            namespaceName,
            questionText
        );
        bot.sendMessage(chatId, dialogResponse);
    }

    const dialogAnswer = async (chatId: number, query: string) => {
        awaitResponse(chatId);
        const namespaceName = 'games';

        const dialogResponse = await openai.ragAnswer(
            namespaceName,
            query,
        );
        bot.sendMessage(chatId, dialogResponse);
    }

    const exit = async (chatId: number) => {
        await bot.sendMessage(
            chatId,
            `Ты молодец! Ответил хорошо на ${rightAnswerCounter} из ${counter} вопросов!`,
        );

        await bot.sendMessage(chatId, 'Поболтаем?', {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Да!', callback_data: '/dialog#Я хочу поговорить об играх' },
                        { text: 'Нет', callback_data: '/dialog#Я не хочу об играх' },
                    ],
                ],
                one_time_keyboard: true,
                resize_keyboard: true,
            },
        });
    }


    const getQuestions = async (fileName:string): Promise<QuizQuestions[]> => {
        const questionsFilePath = path.join(__dirname, `articles/${fileName}`);
        const rawData = readFileSync(questionsFilePath, 'utf-8');
        const questions = JSON.parse(rawData);
        return questions;
    };


    const getQuiz = async (): Promise<Quiz[]> => {
        const questions: QuizQuestions[] = await getQuestions('quiz.json');
        const transformedQuestions: Quiz[] = questions.map((question) => {
            const correctAnswer = question.answer.split('.')[0]; 
            const otherQuestions = questions.filter(q => q.id !== question.id);
            const incorrectAnswers = otherQuestions.slice(0, 2).map(q => q.answer.split('.')[0]); 

            // Перемешиваем варианты ответа
            const options = [
                [{ "text": incorrectAnswers[0], "callback_data": "/false" }],
                [{ "text": correctAnswer, "callback_data": "/true" }],
                [{ "text": incorrectAnswers[1], "callback_data": "/false" }]
            ];

            // Перемешиваем порядок вариантов ответа
            for (let i = options.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [options[i], options[j]] = [options[j], options[i]];
            }

            return {
                "query": question.query,
                "correctAnswer": correctAnswer,
                "options": options
            };
        });
        return transformedQuestions;
    };

    const sendError = async (chatId: number) => {
        await bot.sendMessage(chatId, `Что-то пошло не так`);
    }

    const getAfterHashRegex = (str: string) => {
        const match = str.match(/#(.*)/);
        if (match === null) {
            return null;
        }
        return match[1];
    }

    initializeBot();
}