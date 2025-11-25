'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Movie {
  _id: string;
  title: string;
  fullplot: string;
  year: number;
  poster?: string;
  score: number;
}

export default function Home() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });
  const isLoading = status === 'streaming' || status === 'submitted';
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput('');
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Extract sources from the *latest* data chunk that contains sources
  // The `data` object in useChat is an array of StreamData responses.
  const latestMessage = messages[messages.length - 1];
  
  // Helper to find data part in UIMessage
  const latestSources: Movie[] | null = (() => {
    if (!latestMessage) return null;
    // Access data from the message's parts
    // Data parts have type `data-${string}`, so we check if it starts with 'data-'
    const dataPart = latestMessage.parts?.find(
      (part) => part.type.startsWith('data-')
    );
    if (dataPart && 'data' in dataPart) {
      const messageData = dataPart.data as { sources?: Movie[] } | undefined;
      return messageData?.sources ?? null;
    }
    return null;
  })();

  return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col">
      <div className="flex-1 w-full max-w-5xl mx-auto p-4 flex flex-col">
        <header className="py-6 border-b border-gray-800 mb-6 text-center">
          <h1 className="text-3xl font-bold text-emerald-400">
            Movie Expert Chat
          </h1>
          <p className="text-gray-400 mt-2">
            Ask me anything about movies! I&apos;ll use semantic search to find answers.
          </p>
        </header>

        <div className="flex-1 flex flex-col gap-6 overflow-y-auto pb-32 custom-scrollbar">
          {messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <p>Type a message to start the conversation...</p>
            </div>
          )}
          
          {messages.map((m) => {
             // Try to find corresponding data for this assistant message
             // Data chunks are often appended *after* the message starts streaming,
             // but in this simple implementation, we'll look at the latest data
             // which corresponds to the latest assistant response.
             // A more robust way matches message IDs if available, but StreamData is sequential.
             
             // Note: simplistic mapping here assumes 1:1 request/response flow.
             const isAssistant = m.role === 'assistant';
             const isLast = m === messages[messages.length - 1];
             const showSources = isAssistant && isLast && latestSources;

             return (
              <div
                key={m.id}
                className={`flex flex-col gap-2 ${
                  m.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`p-4 rounded-2xl max-w-[85%] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-emerald-600 text-white rounded-br-none'
                      : 'bg-gray-800 text-gray-200 rounded-bl-none border border-gray-700'
                  }`}
                >
                  <span className="font-bold text-xs mb-1 block opacity-50 uppercase tracking-wider">
                    {m.role === 'user' ? 'You' : 'AI Assistant'}
                  </span>
                  {m.parts.filter(part => part.type === 'text').map((part, index) => (
                    m.role === 'assistant' ? (
                      <div key={index} className="markdown-content">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            ul: ({ children }) => <ul className="list-disc list-inside my-2 space-y-1 ml-2">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal list-inside my-2 space-y-1 ml-2">{children}</ol>,
                            li: ({ children }) => <li className="ml-2">{children}</li>,
                            p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
                            strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
                            em: ({ children }) => <em className="italic">{children}</em>,
                            h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-lg font-bold mt-3 mb-2">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-base font-bold mt-2 mb-1">{children}</h3>,
                            code: ({ children }) => <code className="bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>,
                            blockquote: ({ children }) => <blockquote className="border-l-4 border-gray-600 pl-4 my-2 italic text-gray-300">{children}</blockquote>,
                          }}
                        >
                          {part.text}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <span key={index}>{part.text}</span>
                    )
                  ))}
                </div>

                {/* Display Sources only for the assistant's response */}
                {showSources && (
                  <div className="w-full max-w-[85%] mt-2 animate-in fade-in slide-in-from-top-2">
                    <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-widest">
                      Top 5 Sources Used:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                      {latestSources!.map((movie) => (
                        <div
                          key={movie._id}
                          className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 text-xs flex flex-col hover:border-emerald-500 transition-colors"
                        >
                          <div className="aspect-2/3 bg-gray-700 relative">
                            {movie.poster ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={movie.poster}
                                alt={movie.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-600">
                                No IMG
                              </div>
                            )}
                          </div>
                          <div className="p-2">
                            <div className="font-bold truncate" title={movie.title}>{movie.title}</div>
                            <div className="text-gray-500">{movie.year}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-900/80 backdrop-blur-sm border-t border-gray-800">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto relative">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a movie plot..."
            className="w-full p-4 pr-24 rounded-xl bg-gray-800 border border-gray-700 focus:border-emerald-500 focus:outline-none text-white placeholder-gray-500 shadow-lg"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-2 top-2 bottom-2 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:hover:bg-emerald-600 transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </main>
  );
}
