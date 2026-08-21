import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from './Header';
import SendMessageSection from './SendMessageSection';
import Footer from './Footer';

const ALLOWED_TOPICS = new Set([
  'General Inquiry',
  'Emergency Information',
  'Online Application',
  'Public Assistance',
  'Other',
]);

export default function SendMessagePage() {
  const [searchParams] = useSearchParams();
  const initialTopic = useMemo(() => {
    const topic = searchParams.get('topic') || '';
    return ALLOWED_TOPICS.has(topic) ? topic : '';
  }, [searchParams]);

  return (
    <>
      <Header />
      <main>
        <SendMessageSection initialTopic={initialTopic} />
      </main>
      <Footer />
    </>
  );
}
