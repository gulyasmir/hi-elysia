import { Elysia } from 'elysia';
import { writeFileSync } from 'fs';
import OpenAI from 'openai';

const myApiKey = process.env.OPENAI_API_KEY ?? '';

export const OpenaiService = (app: Elysia, pinecone: { query: (namespaceName: string, query: string) => Promise<string>;}) => {
    const openai = new OpenAI({
        apiKey: myApiKey,
    });

    const ragAnswer = async (namespaceName: string, query: string): Promise<string> => {
        try {
            const prepareData: string = await pinecone.query(namespaceName, query);
            const prompt = prepareData + ' ' + query;
            const response = await openai.chat.completions.create({
                model: 'gpt-4',
                store: true,
                messages: [
                    {
                        role: 'system',
                        content:
                            "Ты — бот, знаток мобильных игр и игр для Telegram. Если вопрос не относится к играм, отвечай: 'Этот вопрос не связан с играми. Пожалуйста, уточните ваш запрос.'",
                    },
                    { role: 'user', content: prompt },
                ],
            });
            return (
                response.choices[0]?.message?.content?.trim() || 'Ошибка: пустой ответ.'
            );
        } catch (error) {
            console.log(error);
            return 'Ошибка при получении ответа от ChatGPT. Попробуйте еще раз, пожалуйста.';
        }
    }

    const queryGerenation =  async () => {
        const query = `Сгенерируй массив из 10 вопросов об играх в телеграм и верни в формате массива, такого вида: 
            [
                {    "id": "1",
                    "query": "Какая ролевая настольная игра включает создание персонажей и выполнение квестов?",
                    "answer": "D&D"
                },
                {
                    "id": "2",
                    "query": "Какие стратегии повышают шансы на успех в Dungeons & Dragons?",
                    "answer": "Команда"
                },
                {
                    "id": "3",
                    "query": "Какая игра про составление слов из буквенных фишек на игровом поле?",
                    "answer": "Scrabble"
                },
                {
                    "id": "4",
                    "query": "Какие элементы важны для стратегии в Scrabble?",
                    "answer": "Бонусы"
                },
                {
                    "id": "5",
                    "query": "Какая игра включает выкладывание плиток для строительства городов, дорог и монастырей?",
                    "answer": "Carcassonne"
                },
                {
                    "id": "6",
                    "query": "Что важно для успешной стратегии в Carcassonne?",
                    "answer": "Миплы"
                }
            ]
                          
             в anwers должен быть правильный ответ на вопрос, максимально короткий.`;
    
        const namespaceName = 'games'; 
        const queryArray = await ragAnswer(namespaceName, query);

        const res = await writeFileSync('./articles/quiz.json', queryArray);
        return queryArray;
      }
    
    return { ragAnswer , queryGerenation};
}