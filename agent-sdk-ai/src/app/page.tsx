import { Chat } from '@/components/chat';

export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: 900,
        margin: '0 auto',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Chat />
    </main>
  );
}
