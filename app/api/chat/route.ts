import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import clientPromise from '@/lib/mongodb';
import OpenAI from 'openai';

// Type definitions for message handling
interface MessagePart {
  type: string;
  text?: string;
}

interface MessageWithParts {
  role: string;
  content?: string;
  parts?: MessagePart[];
}

interface MessageWithContent {
  role: string;
  content: string;
}

type Message = MessageWithParts | MessageWithContent;

const openaiProvider = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Standard OpenAI client for embeddings
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const lastMessage = messages[messages.length - 1];

    // Handle different message formats:
    // 1. Standard format: { role, content }
    // 2. Parts format: { role, parts: [{ type: 'text', text: '...' }] }
    let userQuery: string;
    if (lastMessage.content !== undefined && lastMessage.content !== null) {
      userQuery = lastMessage.content;
    } else if (lastMessage.parts && Array.isArray(lastMessage.parts)) {
      // Extract text from parts array
      const textParts = lastMessage.parts
        .filter((part: MessagePart) => part.type === 'text' && part.text)
        .map((part: MessagePart) => part.text);
      userQuery = textParts.join(' ');
    } else {
      throw new Error('Invalid message format: missing content or parts');
    }

    if (!userQuery || !userQuery.trim()) {
      throw new Error('Empty message content');
    }

    // 1. Generate embedding for the user query
    const embeddingResponse = await openaiClient.embeddings.create({
      model: 'text-embedding-ada-002',
      input: userQuery,
    });
    const embedding = embeddingResponse.data[0].embedding;

    // 2. Connect to MongoDB
    const client = await clientPromise;
    const collection = client.db('sample_mflix').collection('embedded_movies');

    const pipeline = [
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'plot_embedding',
          queryVector: embedding,
          numCandidates: 100,
          limit: 5,
        },
      },
      {
        $project: {
          title: 1,
          fullplot: 1,
          plot: 1,
          year: 1,
          poster: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    const movies = await collection.aggregate(pipeline).toArray();

    // 3. Prepare context
    const context = movies.map((movie) =>
      `Title: ${movie.title} (${movie.year})\nPlot: ${movie.fullplot || movie.plot}\n Score: ${movie.score}\n`
    ).join('\n---\n');

    const systemPrompt = `You are a helpful movie assistant. Use the following movie context to answer the user's question.
If the answer is not in the context, say you don't know based on the available information.
Always mention the movie title when discussing it.

IMPORTANT: Format your response using Markdown. Use:
- **Bold** for emphasis on important points
- Unordered lists (- or *) when listing multiple items
- Ordered lists (1., 2., etc.) when providing step-by-step information or ranked items
- Line breaks for better readability
- Headers (##) for sections when appropriate

At the end of the response, list the titles of every movie returned by the search including the score using a markdown list format. It is important to make sure that you always alsway list the score together with the results

Context:
${context}`;

    // 4. Stream Text
    // Convert messages to standard format, handling both content and parts formats
    const coreMessages = messages
      .filter((m: Message) => m.role !== 'system')
      .map((m: Message) => {
        let content: string;
        if ('content' in m && m.content) {
          content = m.content;
        } else if ('parts' in m && m.parts && Array.isArray(m.parts)) {
          // Extract text from parts array
          const textParts = m.parts
            .filter((part: MessagePart) => part.type === 'text' && part.text)
            .map((part: MessagePart) => part.text);
          content = textParts.join(' ');
        } else {
          content = '';
        }
        return {
          role: m.role,
          content: content,
        };
      });

    const result = streamText({
      model: openaiProvider('gpt-3.5-turbo'),
      system: systemPrompt,
      messages: coreMessages,
    });

    const sanitizedMovies = movies.map(movie => ({
      _id: movie._id.toString(),
      title: movie.title,
      fullplot: movie.fullplot || movie.plot,
      year: movie.year,
      poster: movie.poster,
      score: movie.score,
    }));

    // In V5, use toUIMessageStreamResponse to return stream with data
    // Type assertion needed as the types may not include the data property yet
    return result.toUIMessageStreamResponse({
      data: {
        sources: sanitizedMovies,
      },
    } as Parameters<typeof result.toUIMessageStreamResponse>[0] & {
      data: { sources: typeof sanitizedMovies };
    });

  } catch (error) {
    console.error('Error in chat route:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process request';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
