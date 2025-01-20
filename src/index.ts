import { Elysia } from 'elysia';
import { swagger } from '@elysiajs/swagger'
import { TelegramService } from './services/telegramService';
import { OpenaiService } from './services/openaiService';
import { PineconeService } from './services/pineconeService';

const PORT = 3000;

// Создаём сервер на Elysia.js
const app = new Elysia()
    .use(swagger())
    .get('/', ({ path }) => path)
    .listen(3000)

const pinecone = PineconeService(app);
const openai = OpenaiService(app, pinecone);

TelegramService(app, openai);

app.get('/', () => 'Сервер работает!');

app.get('/gerenation', {
    schema: {
      description: 'Сгенерировать новые вопросы',
      tags: ['OpenAI'],
      response: {
        200: {
          description: 'Ответ с результатом генерации',
          content: {
            'application/json': {
              schema: {
                type: 'string',
              },
            },
          },
        },
      },
    },
  }, async () => {
      const result = await openai.queryGerenation();
      return result;
  });

app.get('/learn', {
    schema: {
      description: 'Запуск процесса обучения',
      tags: ['OpenAI'],
      response: {
        200: {
          description: 'Ответ с результатом обучения',
          content: {
            'application/json': {
              schema: {
                type: 'string',
              },
            },
          },
        },
      },
    },
  }, async () => {
      const result = await pinecone.learn();
      return result;
  });



app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});