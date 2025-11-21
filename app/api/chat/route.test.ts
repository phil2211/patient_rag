/**
 * Test file for the chat API route
 * 
 * This test verifies that:
 * 1. The API correctly handles messages with parts format
 * 2. The API correctly handles messages with content format
 * 3. The API returns proper error messages for invalid inputs
 * 4. The API uses toUIMessageStreamResponse correctly (no "is not a function" errors)
 * 
 * Note: This is a unit test with mocks. For integration testing,
 * you would need to set up actual MongoDB and OpenAI connections.
 */

import { POST } from './route';

// Mock dependencies
jest.mock('@/lib/mongodb', () => ({
  __esModule: true,
  default: Promise.resolve({
    db: jest.fn(() => ({
      collection: jest.fn(() => ({
        aggregate: jest.fn(() => ({
          toArray: jest.fn(() => Promise.resolve([
            {
              _id: '507f1f77bcf86cd799439011',
              title: 'Test Movie',
              fullplot: 'A test movie plot',
              plot: 'A test movie plot',
              year: 2023,
              poster: 'https://example.com/poster.jpg',
              score: 0.95,
            },
          ])),
        })),
      })),
    })),
  }),
}));

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn(() => ({
      embeddings: {
        create: jest.fn(() => Promise.resolve({
          data: [{
            embedding: new Array(1536).fill(0.1),
          }],
        })),
      },
    })),
  };
});

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(() => {
    // Return a function that acts as the model provider
    return jest.fn((modelName: string) => ({
      modelName,
      provider: 'openai',
    }));
  }),
}));

// Mock the streamText result with toUIMessageStreamResponse method
const mockToUIMessageStreamResponse = jest.fn(() => {
  return new Response('test stream response', {
    headers: { 'Content-Type': 'text/plain' },
  });
});

jest.mock('ai', () => ({
  streamText: jest.fn(() => ({
    toUIMessageStreamResponse: mockToUIMessageStreamResponse,
  })),
  Message: {},
}));

describe('POST /api/chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle messages with parts format and call toUIMessageStreamResponse', async () => {
    const payload = {
      id: 'EoW5OYzCmuXNWcrF',
      messages: [
        {
          parts: [
            {
              type: 'text',
              text: 'recommend me some movies with a lot of action but also a great love story',
            },
          ],
          id: 'ty2CG6mHAinpr7WU',
          role: 'user',
        },
      ],
      trigger: 'submit-message',
    };

    const request = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);

    // Verify that toUIMessageStreamResponse was called (not toDataStreamResponse)
    expect(mockToUIMessageStreamResponse).toHaveBeenCalled();
    expect(mockToUIMessageStreamResponse).toHaveBeenCalledWith({
      data: {
        sources: expect.arrayContaining([
          expect.objectContaining({
            _id: expect.any(String),
            title: expect.any(String),
            fullplot: expect.any(String),
            year: expect.any(Number),
            score: expect.any(Number),
          }),
        ]),
      },
    });

    expect(response.status).toBe(200);
  });

  it('should handle messages with content format', async () => {
    const payload = {
      messages: [
        {
          role: 'user',
          content: 'What is the plot of Inception?',
        },
      ],
    };

    const request = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);

    expect(mockToUIMessageStreamResponse).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('should return error for invalid message format', async () => {
    const payload = {
      messages: [
        {
          role: 'user',
          // Missing both content and parts
        },
      ],
    };

    const request = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
    const responseData = await response.json();

    expect(response.status).toBe(500);
    expect(responseData.error).toContain('Invalid message format');
  });

  it('should return error for empty message content', async () => {
    const payload = {
      messages: [
        {
          role: 'user',
          content: '',
        },
      ],
    };

    const request = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
    const responseData = await response.json();

    expect(response.status).toBe(500);
    expect(responseData.error).toContain('Empty message content');
  });

  it('should extract text from parts array correctly', async () => {
    const payload = {
      messages: [
        {
          role: 'user',
          parts: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: 'World' },
            { type: 'other', value: 'ignored' },
          ],
        },
      ],
    };

    const request = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);

    // Should successfully process the request
    expect(response.status).toBe(200);
    expect(mockToUIMessageStreamResponse).toHaveBeenCalled();
  });
});
