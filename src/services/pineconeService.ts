import { Elysia } from 'elysia';
import { EmbeddingsList, Index, Pinecone, PineconeRecord, RecordMetadata } from '@pinecone-database/pinecone';
import { readFileSync } from 'fs';
import path from 'path';

const pineconeApiKey = process.env.PINECONE_TOKEN ?? '';
const pineconeIndexName = process.env.PINECONE_INDEX_NAME ? process.env.PINECONE_INDEX_NAME : '';
const model = 'multilingual-e5-large';

interface FileInfo {
    namespaceName: string;
    fileName: string;
}

interface GameQuestions {
    id: string;
    text: string;
}

export const PineconeService = (app: Elysia) => {
    const pc = new Pinecone({
        apiKey:
            'pcsk_76u5sJ_EfVPUrqhxokat3isqMzUuB6gm6w88L2M2Fm9agiHzsMKDSM3TpqtLwF3KapReUk',
    });

    let index: Index;

    const learn = async (): Promise<string> => {
        try {
            const questionsFilePath = path.join(__dirname, '/articles/games.json');
            const fileNamesArray: FileInfo[] = [
                {
                    namespaceName: 'games',
                    fileName: questionsFilePath,
                }
            ];

            const result = await initializeVectorStore(fileNamesArray);
            return result;
        } catch (error) {
            console.error(error);
            return 'Модель не обучена, ошибка';
        }
    }

    const initializeVectorStore = async (fileNamesArray: FileInfo[]): Promise<string> => {
        for (let item of fileNamesArray) {
            const namespaceName = item.namespaceName;
            const fileName = item.fileName;
            const data: GameQuestions[] | null = await getDataFromFile(fileName);
            if (!data) {
                continue;
            }
            await pc.listIndexes();
            const embeddings: EmbeddingsList = await pc.inference.embed(
                model,
                data.map((d) => d.text),
                { inputType: 'passage', truncate: 'END' },
            );

            const existingIndexes = await pc.listIndexes();

            if (!existingIndexes) {
                await pc.createIndex({
                    name: pineconeIndexName,
                    dimension: 1024,
                    metric: 'cosine',
                    spec: {
                        serverless: {
                            cloud: 'aws',
                            region: 'us-east-1',
                        },
                    },
                });
                index = pc.Index(pineconeIndexName); // Get a reference to the newly created index    
            } else {
                console.log(
                    `Index "${pineconeIndexName}" already exists. Using existing index.`,
                );
                index = pc.Index(pineconeIndexName); // Get a reference to the existing index
            }

            const records: PineconeRecord<RecordMetadata>[] = data.map((d, i) => ({
                id: d.id,
                values: embeddings[i].values ?? [],
                metadata: { text: d.text },
            }));

            await index.namespace(namespaceName).upsert(records);
            const stats = await index.describeIndexStats();
        }
        return `Модель Pineсone обучена`;
    }

    const getDataFromFile = async (filePath: string): Promise<GameQuestions[] | null> => {
        const rawData = readFileSync(filePath, 'utf-8');
        const articleData = JSON.parse(rawData);
        return articleData ?? null;
    }

    const query = async (namespaceName: string, query: string): Promise<string> => {
        try {
            const existingIndexes = await pc.listIndexes();
            if (!existingIndexes) {
                await learn();
            } else {
                console.log(
                    `Index "${pineconeIndexName}" already exists. Using existing index.`,
                );
                index = pc.Index(pineconeIndexName); // Get a reference to the existing index
            }

            // Convert the query into a numerical vector that Pinecone can search with
            const queryEmbedding = await pc.inference.embed(model, [query], {
                inputType: 'query',
            });

            // Search the index for the three most similar vectors
            const queryResponse = await index.namespace(namespaceName).query({
                topK: 3,
                vector: queryEmbedding[0].values ?? [0],
                includeValues: false,
                includeMetadata: true,
            });

            for (let obj of queryResponse.matches) {
                console.log(obj.metadata);
            }
            let result = queryResponse.matches.map((obj) => obj.metadata?.text);

            return result.join(' ');
        } catch (error) {
            console.error(error);
            return '';
        }
    }

    return { learn, query };
}