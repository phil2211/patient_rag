import { MongoClient } from 'mongodb';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

// Load .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach((line) => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            const value = valueParts.join('='); // Rejoin in case value contains '='
            process.env[key.trim()] = value.trim();
        }
    });
}

const MONGODB_URI = process.env.MONGODB_URI;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!MONGODB_URI || !OPENAI_API_KEY) {
    console.error('Missing MONGODB_URI or OPENAI_API_KEY in .env.local');
    process.exit(1);
}

const client = new MongoClient(MONGODB_URI);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function generateEmbeddings() {
    try {
        await client.connect();
        console.log('Connected to MongoDB');

        const db = client.db('sample_mflix');
        const collection = db.collection('movies');

        const query = {
            fullplot: { $exists: true },
            plot_embedding: { $exists: false }
        };

        const totalDocs = await collection.countDocuments(query);

        console.log(`Found ${totalDocs} documents to process`);

        const cursor = collection.find(query);

        let processed = 0;

        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            if (!doc || !doc.fullplot) continue;

            try {
                const embeddingResponse = await openai.embeddings.create({
                    model: 'text-embedding-3-small',
                    input: doc.fullplot,
                });

                const embedding = embeddingResponse.data[0].embedding;

                await collection.updateOne(
                    { _id: doc._id },
                    { $set: { plot_embedding: embedding } }
                );

                processed++;
                if (processed % 10 === 0) {
                    console.log(`Processed ${processed}/${totalDocs}`);
                }
            } catch (error) {
                console.error(`Error processing document ${doc._id}:`, error);
                // Optional: wait a bit if rate limited
            }
        }

        console.log('Finished generating embeddings');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.close();
    }
}

generateEmbeddings();
