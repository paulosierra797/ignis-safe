import VisitorChat from './VisitorChat';
import './SendMessageSection.css';

export default function SendMessageSection() {
  return (
    <section className="send-message-page" id="send-message">
      <VisitorChat variant="full" active />
    </section>
  );
}
