'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, useRef, useEffect } from 'react';
import { Message } from './message';

const transport = new DefaultChatTransport({ api: '/api/chat' });

export function Chat() {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    transport,
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <header
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid #e5e7eb',
          background: '#fff',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
          🔍 Reverso — Agente Investigativo
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
          Investigação jornalística assistida por IA • Powered by Vercel AI SDK
        </p>
      </header>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#9ca3af',
            }}
          >
            <p style={{ fontSize: 48, marginBottom: 16 }}>🔍</p>
            <p style={{ fontSize: 18, fontWeight: 500, color: '#4b5563' }}>
              Olá! Eu sou o Reverso.
            </p>
            <p style={{ maxWidth: 500, margin: '8px auto', lineHeight: 1.6 }}>
              Sou um agente de investigação jornalística. Posso processar documentos,
              analisar fontes, sugerir linhas investigativas e executar inquéritos
              estruturados.
            </p>
            <p style={{ fontSize: 13, marginTop: 16 }}>
              Comece dizendo <strong>"oi"</strong> ou enviando uma mensagem.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}

        {error && (
          <div
            style={{
              padding: '12px 16px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              color: '#dc2626',
              fontSize: 14,
            }}
          >
            <strong>Erro:</strong> {error.message}
          </div>
        )}

        {isLoading && (
          <div style={{ padding: '8px 0', color: '#6b7280', fontSize: 14 }}>
            <span style={{ animation: 'pulse 1.5s infinite' }}>●</span> Pensando...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '16px 24px',
          borderTop: '1px solid #e5e7eb',
          background: '#fff',
          display: 'flex',
          gap: 8,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite sua mensagem..."
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '12px 16px',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          style={{
            padding: '12px 24px',
            background: isLoading || !input.trim() ? '#d1d5db' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          Enviar
        </button>
      </form>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
